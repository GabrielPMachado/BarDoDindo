import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  db, now, newId, hashPassword, verifyPassword, createSession, readSession, dropSession,
  listRecords, listRecordsWhere, getRecord, insertRecord, updateRecord, deleteRecord, getConfig, setConfig,
} from './db.mjs';

const PORT = Number(process.env.PORT ?? 3333);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Coleções do CRM e a área (permissão) que cada uma exige. */
const COLLECTIONS = {
  metas: 'dir',
  colaboradores: 'rh', ferias: 'rh',
  projetos: 'dp', estoque: 'dp', materiais: 'dp',
  terceirizados: 'adm', fornecedores: 'adm', contratos: 'adm',
  receitas: 'fin', despesas: 'fin',
  reservas: 'atd', consumos: 'atd', resgates: 'atd',
  criacao: 'mkt', midias: 'mkt', produtos: 'mkt', recompensas: 'mkt',
  trabalhista: 'jur', consultoria: 'jur',
  qualidade: 'fis', naoconformidades: 'fis',
  funcoes: 'cfg',
};
const AREAS = ['dir', 'atd', 'mkt', 'rh', 'dp', 'adm', 'fin', 'jur', 'fis', 'mon', 'cfg'];

/**
 * Atualiza funções criadas antes das áreas Atendimento e Monitoramento:
 * quem já operava reservas/consumo por Marketing e Vendas mantém o mesmo acesso em Atendimento.
 */
function migrarFuncoes() {
  for (const f of listRecords('funcoes')) {
    const p = { ...(f.permissoes ?? {}) };
    let mudou = false;
    if (f.sistema) {
      for (const a of AREAS) if (p[a] !== 'edit') { p[a] = 'edit'; mudou = true; }
    } else {
      if (!('atd' in p)) { p.atd = p.mkt ?? 'none'; mudou = true; }
      if (!('mon' in p)) { p.mon = 'none'; mudou = true; }
    }
    if (mudou) updateRecord('funcoes', f.id, { permissoes: p });
  }
}
migrarFuncoes();

/* ---------- utilitários HTTP ---------- */
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 2_000_000) fail(413, 'Requisição muito grande.');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail(400, 'JSON inválido.');
  }
}

const tokenOf = (req) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null;
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Telefone: vazio ou DDD + número (10 ou 11 dígitos); devolve no formato (11) 91234-5678. */
function telefone(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length !== 10 && d.length !== 11) fail(400, 'Informe o celular completo, com DDD.');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/** Barra valores absurdos em qualquer cadastro: números fora da faixa e textos longos demais. */
function validarRegistro(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Dados inválidos.');
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > 1e12)) fail(400, `Valor numérico inválido em "${k}".`);
    if (typeof v === 'number' && v < 0) fail(400, `O campo "${k}" não aceita valores negativos.`);
    if (typeof v === 'string' && v.length > 5000) fail(400, `Texto muito longo em "${k}".`);
  }
  return data;
}
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ---------- regras de clientes ---------- */
function publicCliente(c) {
  return { id: c.id, numero: c.id, nome: c.nome, email: c.email, telefone: c.telefone, foto: c.foto ?? null, desde: c.created_at, origem: c.origem ?? 'Aplicativo' };
}
function resumoCliente(id) {
  const consumos = listRecordsWhere('consumos', 'clienteId', id);
  const resgates = listRecordsWhere('resgates', 'clienteId', id);
  const acumulados = consumos.reduce((s, c) => s + (Number(c.pontos) || 0), 0);
  const usados = resgates.filter((r) => r.status !== 'Cancelado').reduce((s, r) => s + (Number(r.custo) || 0), 0);
  const totalGasto = consumos.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const visitas = new Set(consumos.map((c) => String(c.data).slice(0, 10))).size;
  return { consumos, resgates, pontos: acumulados - usados, acumulados, totalGasto, visitas };
}
function nivelDe(acumulados, niveis) {
  const sorted = [...niveis].sort((a, b) => a.minimo - b.minimo);
  let atual = sorted[0];
  for (const n of sorted) if (acumulados >= n.minimo) atual = n;
  const proximo = sorted.find((n) => n.minimo > acumulados) ?? null;
  return { atual, proximo };
}

/* ---------- autenticação ---------- */
function requireCliente(req) {
  const id = readSession(tokenOf(req), 'app');
  const c = id && db.prepare('SELECT * FROM clientes WHERE id = ?').get(Number(id));
  if (!c) fail(401, 'Sessão expirada. Entre novamente.');
  return c;
}
function requireUsuario(req) {
  const id = readSession(tokenOf(req), 'crm');
  const u = id && db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u || u.status !== 'Ativo') fail(401, 'Sessão expirada. Entre novamente.');
  const funcao = getRecord('funcoes', u.funcao_id);
  // a função Administrador (de sistema) sempre tem acesso total, inclusive a áreas novas
  return { usuario: u, funcao, access: (area) => (funcao?.sistema ? 'edit' : funcao?.permissoes?.[area] ?? 'none') };
}
function requireAccess(ctx, area, level) {
  const a = ctx.access(area);
  if (a === 'none' || (level === 'edit' && a !== 'edit')) fail(403, 'Sua função não tem permissão para esta ação.');
}
/** Exige acesso em pelo menos uma das áreas informadas. */
function requireAnyAccess(ctx, areas, level) {
  const ok = areas.some((area) => {
    const a = ctx.access(area);
    return a !== 'none' && (level !== 'edit' || a === 'edit');
  });
  if (!ok) fail(403, 'Sua função não tem permissão para esta ação.');
}
const publicUsuario = (u) => ({
  id: u.id, nome: u.nome, email: u.email, funcaoId: u.funcao_id, status: u.status, ultimoAcesso: u.ultimo_acesso, criadoEm: u.created_at,
});

/* ---------- rotas ---------- */
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
};

/* público */
route('GET', '/api/public/afilhados', () => ({ total: db.prepare('SELECT COUNT(*) n FROM clientes').get().n }));
route('GET', '/api/public/config', () => {
  const c = getConfig();
  return { nomeEstabelecimento: c.nomeEstabelecimento, horarios: c.horarios, ambientes: c.ambientes, diasFuncionamento: c.diasFuncionamento, antecedenciaMinutos: c.antecedenciaMinutos, pontosPorReal: c.pontosPorReal, niveis: c.niveis };
});
route('GET', '/api/public/cardapio', () =>
  listRecords('produtos')
    .filter((p) => p.status === 'Ativo' && p.noCardapio !== 'Não')
    .map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria, descricao: p.descricao ?? '', preco: Number(p.preco) || 0, destaque: p.destaque === 'Sim' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
);
route('GET', '/api/public/recompensas', () =>
  listRecords('recompensas')
    .filter((r) => r.status === 'Ativa')
    .map((r) => ({ id: r.id, nome: r.nome, descricao: r.descricao ?? '', custo: Number(r.custo) || 0 }))
    .sort((a, b) => a.custo - b.custo),
);

/* app do cliente */
route('POST', '/api/app/cadastro', async (req) => {
  const b = await readJson(req);
  const nome = str(b.nome, 120), email = str(b.email, 160).toLowerCase(), tel = telefone(b.telefone), senha = String(b.senha ?? '');
  if (nome.length < 3) fail(400, 'Informe seu nome completo.');
  if (!emailOk(email)) fail(400, 'Informe um e-mail válido.');
  if (senha.length < 6) fail(400, 'A senha deve ter pelo menos 6 caracteres.');
  if (db.prepare('SELECT 1 FROM clientes WHERE email = ?').get(email)) fail(409, 'Este e-mail já está cadastrado.');
  const origem = b.origem === 'Pré-cadastro' ? 'Pré-cadastro' : 'Aplicativo';
  if (origem === 'Pré-cadastro') {
    if (!tel) fail(400, 'Informe o celular completo, com DDD.');
    if (b.aceite !== true) fail(400, 'É preciso aceitar o uso dos dados para participar do programa.');
  }
  const r = db.prepare('INSERT INTO clientes (nome, email, telefone, senha_hash, created_at, origem, aceite_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(nome, email, tel, hashPassword(senha), now(), origem, b.aceite === true ? now() : null);
  return { token: createSession('app', r.lastInsertRowid) };
});
route('POST', '/api/app/login', async (req) => {
  const b = await readJson(req);
  const c = db.prepare('SELECT * FROM clientes WHERE email = ?').get(str(b.email, 160));
  if (!c || !verifyPassword(String(b.senha ?? ''), c.senha_hash)) fail(401, 'E-mail ou senha incorretos.');
  return { token: createSession('app', c.id) };
});
route('POST', '/api/app/logout', (req) => { dropSession(tokenOf(req)); return { ok: true }; });
route('GET', '/api/app/me', (req) => {
  const c = requireCliente(req);
  const r = resumoCliente(c.id);
  const cfg = getConfig();
  return {
    cliente: publicCliente(c),
    pontos: r.pontos,
    acumulados: r.acumulados,
    totalGasto: r.totalGasto,
    visitas: r.visitas,
    nivel: nivelDe(r.acumulados, cfg.niveis),
    consumos: r.consumos,
    resgates: r.resgates,
    reservas: listRecordsWhere('reservas', 'clienteId', c.id),
  };
});
route('PATCH', '/api/app/me', async (req) => {
  const c = requireCliente(req);
  const b = await readJson(req);
  const nome = b.nome !== undefined ? str(b.nome, 120) : c.nome;
  const tel = b.telefone !== undefined ? telefone(b.telefone) : c.telefone;
  let foto = c.foto;
  if (b.foto !== undefined) {
    if (b.foto !== null && !/^data:image\/(jpeg|png|webp);base64,/.test(String(b.foto))) fail(400, 'Imagem inválida.');
    foto = b.foto;
  }
  if (nome.length < 3) fail(400, 'Informe seu nome completo.');
  db.prepare('UPDATE clientes SET nome = ?, telefone = ?, foto = ? WHERE id = ?').run(nome, tel, foto, c.id);
  return { ok: true };
});
route('POST', '/api/app/reservas', async (req) => {
  const c = requireCliente(req);
  const b = await readJson(req);
  const cfg = getConfig();
  const data = str(b.data, 10), hora = str(b.hora, 5), ambiente = str(b.ambiente, 80);
  const pessoas = Math.floor(Number(b.pessoas));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data < today()) fail(400, 'Escolha uma data válida.');
  const [y, m, d] = data.split('-').map(Number);
  const dia = new Date(y, m - 1, d);
  if (!cfg.diasFuncionamento.includes(dia.getDay())) fail(400, 'O bar não abre neste dia.');
  if (!cfg.horarios.includes(hora)) fail(400, 'Horário indisponível.');
  const [hh, mm] = hora.split(':').map(Number);
  dia.setHours(hh, mm, 0, 0);
  if (dia.getTime() < Date.now() + cfg.antecedenciaMinutos * 60000) fail(400, 'Este horário já passou ou está muito próximo.');
  if (!cfg.ambientes.includes(ambiente)) fail(400, 'Ambiente indisponível.');
  if (!(pessoas >= 1 && pessoas <= 50)) fail(400, 'Número de pessoas inválido.');
  return insertRecord('reservas', {
    clienteId: c.id, clienteNome: c.nome, clienteTelefone: c.telefone, data, hora, pessoas, ambiente,
    observacoes: str(b.observacoes, 300), status: 'Pendente', origem: 'Aplicativo',
  });
});
route('POST', '/api/app/reservas/:id/cancelar', (req, p) => {
  const c = requireCliente(req);
  const r = getRecord('reservas', p.id);
  if (!r || r.clienteId !== c.id) fail(404, 'Reserva não encontrada.');
  if (!['Pendente', 'Confirmada'].includes(r.status)) fail(400, 'Esta reserva não pode mais ser cancelada.');
  return updateRecord('reservas', p.id, { status: 'Cancelada pelo cliente' });
});
route('POST', '/api/app/resgates', async (req) => {
  const c = requireCliente(req);
  const b = await readJson(req);
  const rec = getRecord('recompensas', str(b.recompensaId, 40));
  if (!rec || rec.status !== 'Ativa') fail(404, 'Recompensa indisponível.');
  const custo = Number(rec.custo) || 0;
  if (resumoCliente(c.id).pontos < custo) fail(400, 'Pontos insuficientes.');
  return insertRecord('resgates', {
    clienteId: c.id, clienteNome: c.nome, recompensaId: rec.id, recompensa: rec.nome, custo,
    codigo: 'DINDO-' + randomBytes(3).toString('hex').toUpperCase(), status: 'Disponível', data: now(),
  });
});

/* CRM: primeiro acesso e sessão */
route('GET', '/api/crm/setup', () => ({ pendente: db.prepare('SELECT COUNT(*) n FROM usuarios').get().n === 0 }));
route('POST', '/api/crm/setup', async (req) => {
  if (db.prepare('SELECT COUNT(*) n FROM usuarios').get().n > 0) fail(409, 'O sistema já foi configurado.');
  const b = await readJson(req);
  const nome = str(b.nome, 120), email = str(b.email, 160).toLowerCase(), senha = String(b.senha ?? '');
  if (nome.length < 3) fail(400, 'Informe o nome completo.');
  if (!emailOk(email)) fail(400, 'Informe um e-mail válido.');
  if (senha.length < 8) fail(400, 'A senha deve ter pelo menos 8 caracteres.');
  const t = now();
  db.prepare('INSERT OR REPLACE INTO records (id, collection, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    'admin', 'funcoes',
    JSON.stringify({ nome: 'Administrador', descricao: 'Acesso total ao sistema, inclusive configurações.', permissoes: Object.fromEntries(AREAS.map((a) => [a, 'edit'])), sistema: true }),
    t, t,
  );
  const id = newId();
  db.prepare('INSERT INTO usuarios (id, nome, email, funcao_id, status, senha_hash, ultimo_acesso, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, nome, email, 'admin', 'Ativo', hashPassword(senha), t, t);
  return { token: createSession('crm', id) };
});
route('POST', '/api/crm/login', async (req) => {
  const b = await readJson(req);
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(str(b.email, 160));
  if (!u || !verifyPassword(String(b.senha ?? ''), u.senha_hash)) fail(401, 'E-mail ou senha incorretos.');
  if (u.status !== 'Ativo') fail(403, 'Usuário inativo. Procure o administrador.');
  db.prepare('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?').run(now(), u.id);
  return { token: createSession('crm', u.id) };
});
route('POST', '/api/crm/logout', (req) => { dropSession(tokenOf(req)); return { ok: true }; });
route('GET', '/api/crm/me', (req) => {
  const ctx = requireUsuario(req);
  return { usuario: publicUsuario(ctx.usuario), funcao: ctx.funcao };
});
route('PUT', '/api/crm/me/senha', async (req) => {
  const ctx = requireUsuario(req);
  const b = await readJson(req);
  if (!verifyPassword(String(b.atual ?? ''), ctx.usuario.senha_hash)) fail(400, 'Senha atual incorreta.');
  if (String(b.nova ?? '').length < 8) fail(400, 'A nova senha deve ter pelo menos 8 caracteres.');
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashPassword(String(b.nova)), ctx.usuario.id);
  return { ok: true };
});

/* CRM: sinal de mudança (as telas consultam a cada poucos segundos e recarregam quando muda) */
let versao = Date.now();
route('GET', '/api/crm/versao', (req) => { requireUsuario(req); return { versao }; });

/* CRM: configuração */
route('GET', '/api/crm/config', (req) => { requireUsuario(req); return getConfig(); });
route('PUT', '/api/crm/config', async (req) => {
  const ctx = requireUsuario(req);
  requireAccess(ctx, 'cfg', 'edit');
  const b = await readJson(req);
  if (b.pontosPorReal !== undefined && !(Number(b.pontosPorReal) >= 0)) fail(400, 'Pontos por real inválido.');
  if (b.horarios && !b.horarios.every((h) => /^\d{2}:\d{2}$/.test(h))) fail(400, 'Horários devem estar no formato HH:MM.');
  return setConfig(b);
});

/* CRM: usuários */
const activeAdmins = () => db.prepare("SELECT COUNT(*) n FROM usuarios WHERE funcao_id = 'admin' AND status = 'Ativo'").get().n;
route('GET', '/api/crm/usuarios', (req) => {
  requireAccess(requireUsuario(req), 'cfg', 'view');
  return db.prepare('SELECT * FROM usuarios ORDER BY nome').all().map(publicUsuario);
});
route('POST', '/api/crm/usuarios', async (req) => {
  requireAccess(requireUsuario(req), 'cfg', 'edit');
  const b = await readJson(req);
  const nome = str(b.nome, 120), email = str(b.email, 160).toLowerCase(), senha = String(b.senha ?? '');
  if (nome.length < 3) fail(400, 'Informe o nome completo.');
  if (!emailOk(email)) fail(400, 'Informe um e-mail válido.');
  if (senha.length < 8) fail(400, 'A senha inicial deve ter pelo menos 8 caracteres.');
  if (!getRecord('funcoes', str(b.funcaoId, 40))) fail(400, 'Selecione uma função.');
  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) fail(409, 'Já existe um usuário com este e-mail.');
  const id = newId();
  db.prepare('INSERT INTO usuarios (id, nome, email, funcao_id, status, senha_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, nome, email, b.funcaoId, b.status === 'Inativo' ? 'Inativo' : 'Ativo', hashPassword(senha), now());
  return publicUsuario(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id));
});
route('PUT', '/api/crm/usuarios/:id', async (req, p) => {
  requireAccess(requireUsuario(req), 'cfg', 'edit');
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(p.id);
  if (!u) fail(404, 'Usuário não encontrado.');
  const b = await readJson(req);
  const nome = b.nome !== undefined ? str(b.nome, 120) : u.nome;
  const email = b.email !== undefined ? str(b.email, 160).toLowerCase() : u.email;
  const funcaoId = b.funcaoId !== undefined ? str(b.funcaoId, 40) : u.funcao_id;
  const status = b.status === 'Inativo' ? 'Inativo' : b.status === 'Ativo' ? 'Ativo' : u.status;
  if (nome.length < 3) fail(400, 'Informe o nome completo.');
  if (!emailOk(email)) fail(400, 'Informe um e-mail válido.');
  if (!getRecord('funcoes', funcaoId)) fail(400, 'Selecione uma função.');
  const dup = db.prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ?').get(email, u.id);
  if (dup) fail(409, 'Já existe um usuário com este e-mail.');
  const deixaDeSerAdmin = u.funcao_id === 'admin' && u.status === 'Ativo' && (funcaoId !== 'admin' || status !== 'Ativo');
  if (deixaDeSerAdmin && activeAdmins() <= 1) fail(400, 'É preciso manter pelo menos um administrador ativo.');
  let hash = u.senha_hash;
  if (b.senha) {
    if (String(b.senha).length < 8) fail(400, 'A senha deve ter pelo menos 8 caracteres.');
    hash = hashPassword(String(b.senha));
  }
  db.prepare('UPDATE usuarios SET nome = ?, email = ?, funcao_id = ?, status = ?, senha_hash = ? WHERE id = ?')
    .run(nome, email, funcaoId, status, hash, u.id);
  if (status !== 'Ativo') db.prepare("DELETE FROM sessions WHERE kind = 'crm' AND subject = ?").run(u.id);
  return publicUsuario(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id));
});
route('DELETE', '/api/crm/usuarios/:id', (req, p) => {
  const ctx = requireUsuario(req);
  requireAccess(ctx, 'cfg', 'edit');
  if (ctx.usuario.id === p.id) fail(400, 'Você não pode excluir o próprio usuário.');
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(p.id);
  if (!u) fail(404, 'Usuário não encontrado.');
  if (u.funcao_id === 'admin' && u.status === 'Ativo' && activeAdmins() <= 1) fail(400, 'É preciso manter pelo menos um administrador ativo.');
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(p.id);
  db.prepare("DELETE FROM sessions WHERE kind = 'crm' AND subject = ?").run(p.id);
  return { ok: true };
});

/* CRM: clientes do aplicativo */
route('GET', '/api/crm/clientes', (req) => {
  requireAnyAccess(requireUsuario(req), ['mkt', 'atd'], 'view');
  const cfg = getConfig();
  return db.prepare('SELECT * FROM clientes ORDER BY nome').all().map((c) => {
    const r = resumoCliente(c.id);
    const ultima = r.consumos.map((x) => x.data).sort().at(-1) ?? null;
    return {
      ...publicCliente(c), foto: undefined, pontos: r.pontos, acumulados: r.acumulados, totalGasto: r.totalGasto,
      visitas: r.visitas, ultimaVisita: ultima, nivel: nivelDe(r.acumulados, cfg.niveis).atual?.nome ?? '',
    };
  });
});

/* CRM: listas para vincular registros (só nome e identificação — sem salários ou dados sensíveis) */
route('GET', '/api/crm/referencias/:tipo', (req, p) => {
  const ctx = requireUsuario(req);
  const ativo = (s) => !['Desligado', 'Inativo', 'Encerrado'].includes(String(s ?? ''));
  switch (p.tipo) {
    case 'colaboradores':
      return listRecords('colaboradores')
        .map((c) => ({ id: c.id, nome: c.nome, detalhe: [c.cargo, c.status !== 'Ativo' ? c.status : null].filter(Boolean).join(' · '), inativo: !ativo(c.status) }));
    case 'pessoas': {
      // equipe (colaboradores) + usuários do sistema, sem repetir a mesma pessoa
      const lista = listRecords('colaboradores')
        .filter((c) => ativo(c.status))
        .map((c) => ({ id: 'c:' + c.id, nome: c.nome, detalhe: c.cargo || 'Colaborador' }));
      const nomes = new Set(lista.map((x) => String(x.nome).toLowerCase()));
      for (const u of db.prepare("SELECT id, nome FROM usuarios WHERE status = 'Ativo'").all()) {
        if (!nomes.has(u.nome.toLowerCase())) lista.push({ id: 'u:' + u.id, nome: u.nome, detalhe: 'Usuário do sistema' });
      }
      return lista;
    }
    case 'fornecedores':
      return listRecords('fornecedores')
        .map((f) => ({ id: f.id, nome: f.nome, detalhe: [f.categoria, f.status !== 'Ativo' ? f.status : null].filter(Boolean).join(' · '), inativo: f.status === 'Inativo' }));
    case 'clientes':
      requireAnyAccess(ctx, ['atd', 'mkt'], 'view');
      return db.prepare('SELECT id, nome, telefone FROM clientes').all()
        .map((c) => ({ id: c.id, nome: c.nome, detalhe: `#${String(c.id).padStart(3, '0')}${c.telefone ? ' · ' + c.telefone : ''}`, telefone: c.telefone }));
    default:
      fail(404, 'Lista inexistente.');
  }
});

/* CRM: produtos disponíveis para venda (o atendimento lança consumo sem acesso ao cadastro de produtos) */
route('GET', '/api/crm/produtos-venda', (req) => {
  requireAnyAccess(requireUsuario(req), ['atd', 'mkt'], 'view');
  return listRecords('produtos')
    .filter((p) => p.status !== 'Inativo')
    .map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria, preco: Number(p.preco) || 0 }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
});

/* CRM: folha de pagamento — calculada a partir do RH; o lançamento como despesa é feito pelo Financeiro */
const VINCULOS_FOLHA = ['CLT', 'Intermitente', 'Temporário'];
function inssEmpregado(salario, faixas) {
  let total = 0, anterior = 0;
  for (const f of [...faixas].sort((a, b) => a.ate - b.ate)) {
    if (salario <= anterior) break;
    total += (Math.min(salario, f.ate) - anterior) * (f.aliquota / 100);
    anterior = f.ate;
  }
  return Math.round(total * 100) / 100;
}
function calcularFolha(mes) {
  if (!/^\d{4}-\d{2}$/.test(mes)) fail(400, 'Competência inválida.');
  const cfg = getConfig();
  const fgtsAliq = (Number(cfg.aliquotaFgts) || 0) / 100;
  const linhas = listRecords('colaboradores')
    .filter((c) => c.status !== 'Desligado' && Number(c.salario) > 0)
    .map((c) => {
      const salario = Number(c.salario) || 0;
      const comEncargos = VINCULOS_FOLHA.includes(String(c.contrato));
      const inss = comEncargos ? inssEmpregado(salario, cfg.faixasInss) : 0;
      const fgts = comEncargos ? Math.round(salario * fgtsAliq * 100) / 100 : 0;
      // provisões mensais: 13º (1/12) e férias + 1/3 (1/12 × 4/3)
      const provisoes = comEncargos ? Math.round((salario / 12 + (salario / 12) * (4 / 3)) * 100) / 100 : 0;
      return { id: c.id, nome: c.nome, cargo: c.cargo, contrato: c.contrato, salario, inss, liquido: salario - inss, fgts, provisoes, custo: salario + fgts + provisoes, comEncargos };
    })
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const soma = (k) => Math.round(linhas.reduce((t, l) => t + l[k], 0) * 100) / 100;
  const lancamentos = listRecords('despesas').filter((d) => d.competenciaFolha === mes && d.status !== 'Cancelado');
  return {
    mes,
    aliquotaFgts: cfg.aliquotaFgts,
    colaboradores: linhas.length,
    totais: { salario: soma('salario'), inss: soma('inss'), liquido: soma('liquido'), fgts: soma('fgts'), provisoes: soma('provisoes'), custo: soma('custo') },
    linhas,
    lancada: lancamentos.length > 0,
    lancamentos: lancamentos.map((d) => ({ id: d.id, descricao: d.descricao, valor: d.valor, status: d.status })),
  };
}
route('GET', '/api/crm/folha', (req) => {
  const ctx = requireUsuario(req);
  requireAnyAccess(ctx, ['rh', 'fin'], 'view');
  const folha = calcularFolha(new URL(req.url, 'http://x').searchParams.get('mes') ?? '');
  // o Financeiro vê os totais; o detalhe por colaborador (salários individuais) é do RH
  if (ctx.access('rh') === 'none') folha.linhas = [];
  return folha;
});
route('POST', '/api/crm/folha/lancar', async (req) => {
  requireAccess(requireUsuario(req), 'fin', 'edit');
  const { mes } = await readJson(req);
  const folha = calcularFolha(str(mes, 7));
  if (folha.lancada) fail(409, 'A folha desta competência já foi lançada.');
  if (!folha.colaboradores) fail(400, 'Não há colaboradores com salário cadastrado no RH.');
  const [y, m] = folha.mes.split('-').map(Number);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const nomeMes = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const base = { categoria: 'Folha de pagamento', data: `${folha.mes}-01`, status: 'A pagar', competenciaFolha: folha.mes };
  const criadas = [insertRecord('despesas', { ...base, descricao: `Folha de pagamento · ${nomeMes}`, vencimento: iso(new Date(y, m, 5)), valor: folha.totais.liquido })];
  if (folha.totais.fgts > 0) criadas.push(insertRecord('despesas', { ...base, categoria: 'Encargos', descricao: `FGTS · ${nomeMes}`, vencimento: iso(new Date(y, m, 20)), valor: folha.totais.fgts }));
  if (folha.totais.inss > 0) criadas.push(insertRecord('despesas', { ...base, categoria: 'Encargos', descricao: `INSS retido dos empregados · ${nomeMes}`, vencimento: iso(new Date(y, m, 20)), valor: folha.totais.inss }));
  return { ok: true, despesas: criadas.length };
});

/* CRM: lançamento de consumo (credita pontos e gera receita) */
route('POST', '/api/crm/consumos', async (req) => {
  requireAccess(requireUsuario(req), 'atd', 'edit');
  const b = await readJson(req);
  const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(Number(b.clienteId));
  if (!cliente) fail(400, 'Selecione um cliente.');
  const itens = (Array.isArray(b.itens) ? b.itens : []).map((i) => {
    const p = getRecord('produtos', str(i.produtoId, 40));
    const quantidade = Math.floor(Number(i.quantidade));
    if (!p) fail(400, 'Produto não encontrado.');
    if (!(quantidade >= 1 && quantidade <= 999)) fail(400, 'Quantidade inválida.');
    const preco = Number(p.preco) || 0;
    return { produtoId: p.id, nome: p.nome, quantidade, preco, total: Math.round(preco * quantidade * 100) / 100 };
  });
  if (!itens.length) fail(400, 'Adicione ao menos um item.');
  const valor = Math.round(itens.reduce((s, i) => s + i.total, 0) * 100) / 100;
  const pontos = Math.floor(valor * getConfig().pontosPorReal);
  const forma = str(b.formaPagamento, 30) || 'Não informado';
  const data = now();
  const consumo = insertRecord('consumos', { clienteId: cliente.id, clienteNome: cliente.nome, itens, valor, pontos, formaPagamento: forma, data });
  const receita = insertRecord('receitas', {
    data: data.slice(0, 10), descricao: `Consumo · ${cliente.nome} (#${String(cliente.id).padStart(3, '0')})`,
    categoria: 'Consumo de clientes', formaPagamento: forma, valor, origem: 'Lançamento de consumo', consumoId: consumo.id,
  });
  return updateRecord('consumos', consumo.id, { receitaId: receita.id });
});

/* CRM: coleções genéricas */
function collectionArea(name) {
  const area = COLLECTIONS[name];
  if (!area) fail(404, 'Módulo inexistente.');
  return area;
}
route('GET', '/api/crm/c/:col', (req, p) => {
  requireAccess(requireUsuario(req), collectionArea(p.col), 'view');
  return listRecords(p.col);
});
route('POST', '/api/crm/c/:col', async (req, p) => {
  requireAccess(requireUsuario(req), collectionArea(p.col), 'edit');
  if (['consumos', 'resgates'].includes(p.col)) fail(400, 'Use o fluxo próprio deste módulo.');
  const b = validarRegistro(await readJson(req));
  if (p.col === 'funcoes') b.sistema = false;
  return insertRecord(p.col, b);
});
route('PUT', '/api/crm/c/:col/:id', async (req, p) => {
  requireAccess(requireUsuario(req), collectionArea(p.col), 'edit');
  const b = validarRegistro(await readJson(req));
  const cur = getRecord(p.col, p.id) ?? fail(404, 'Registro não encontrado.');
  if (p.col === 'funcoes') {
    if (cur.sistema) fail(400, 'A função Administrador não pode ser alterada.');
    b.sistema = false;
  }
  if (p.col === 'consumos') fail(400, 'Consumos não podem ser editados. Exclua e lance novamente.');
  if (p.col === 'resgates') return updateRecord(p.col, p.id, { status: str(b.status, 30) });
  if (p.col === 'receitas' && cur.consumoId) fail(400, 'Receitas geradas por consumo são alteradas pelo lançamento de consumo.');
  return updateRecord(p.col, p.id, b);
});
route('DELETE', '/api/crm/c/:col/:id', (req, p) => {
  requireAccess(requireUsuario(req), collectionArea(p.col), 'edit');
  const cur = getRecord(p.col, p.id) ?? fail(404, 'Registro não encontrado.');
  if (p.col === 'funcoes') {
    if (cur.sistema) fail(400, 'A função Administrador não pode ser excluída.');
    if (db.prepare('SELECT 1 FROM usuarios WHERE funcao_id = ?').get(p.id)) fail(400, 'Há usuários com esta função. Altere-os antes de excluir.');
  }
  if (p.col === 'receitas' && cur.consumoId) fail(400, 'Esta receita veio de um consumo. Exclua o consumo para estorná-la.');
  if (p.col === 'consumos' && cur.receitaId) deleteRecord('receitas', cur.receitaId);
  if (p.col === 'resgates') fail(400, 'Resgates não são excluídos. Altere o status para Cancelado.');
  deleteRecord(p.col, p.id);
  return { ok: true };
});

/* ---------- arquivos estáticos (versões compiladas) ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  const isCrm = pathname === '/crm' || pathname.startsWith('/crm/');
  const isPre = pathname === '/afilhado' || pathname.startsWith('/afilhado/');
  const base = isCrm ? join(root, 'crm', 'dist') : isPre ? join(root, 'precadastro') : join(root, 'dist');
  if (!existsSync(base)) return false;
  let rel = isCrm ? pathname.slice(4) : isPre ? pathname.slice(9) : pathname;
  if (!rel || rel === '/') rel = '/index.html';
  let file = normalize(join(base, rel));
  if (!file.startsWith(base)) return false;
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
  return true;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'OPTIONS') return send(res, 204);
  if (!url.pathname.startsWith('/api/')) {
    if (req.method === 'GET' && serveStatic(req, res, url.pathname)) return;
    return send(res, 404, { erro: 'Não encontrado.' });
  }
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const out = await r.handler(req, params);
      // toda gravação bem-sucedida avisa as telas abertas de que há novidades
      if (req.method !== 'GET') versao++;
      return send(res, 200, out);
    }
    send(res, 404, { erro: 'Rota não encontrada.' });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { erro: e.message });
    console.error(e);
    send(res, 500, { erro: 'Erro interno do servidor.' });
  }
}).listen(PORT, () => console.log(`API Bar do Dindo em http://localhost:${PORT}`));
