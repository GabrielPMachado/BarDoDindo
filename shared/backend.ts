/**
 * "Servidor" do Bar do Dindo rodando no navegador: as mesmas rotas da antiga API (`/app/...`, `/crm/...`),
 * agora sobre Firebase Auth + Firestore. As telas continuam chamando `api(caminho, opções)`.
 * As permissões valem de verdade em `firestore.rules`; as checagens daqui só antecipam a mensagem de erro.
 */
import { deleteApp, initializeApp } from 'firebase/app';
import {
  EmailAuthProvider, connectAuthEmulator, createUserWithEmailAndPassword, getAuth, inMemoryPersistence, initializeAuth,
  reauthenticateWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updatePassword, type UserCredential,
} from 'firebase/auth';
import {
  collection, connectFirestoreEmulator, doc, getDoc, increment, initializeFirestore, limit, onSnapshot, orderBy, query, runTransaction, where, writeBatch,
  type Query, type WriteBatch,
} from 'firebase/firestore';
import { EMULADOR, EMULADOR_AUTH, EMULADOR_FIRESTORE, firebaseConfig } from './firebase-config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dados = Record<string, any>;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};
const codigo = (e: unknown) => String((e as { code?: string } | null)?.code ?? '');

/** Coleções do CRM e a área (permissão) que cada uma exige. */
const COLLECTIONS: Record<string, string> = {
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

/** Como cada registro é citado no painel de atualizações ("cadastrou o produto …"). */
const REGISTRO: Record<string, string> = {
  metas: 'a meta', colaboradores: 'o colaborador', ferias: 'o registro de férias/afastamento',
  projetos: 'o projeto', estoque: 'o item de estoque', materiais: 'o material',
  terceirizados: 'o serviço terceirizado', fornecedores: 'o fornecedor', contratos: 'o contrato',
  receitas: 'a receita', despesas: 'a despesa',
  reservas: 'a reserva', consumos: 'o consumo', resgates: 'o voucher',
  criacao: 'a peça', midias: 'a publicação', produtos: 'o produto', recompensas: 'a recompensa',
  trabalhista: 'o processo trabalhista', consultoria: 'a demanda de consultoria',
  qualidade: 'a inspeção', naoconformidades: 'a não conformidade',
  funcoes: 'a função',
};
/** Nome legível de um registro qualquer, para o painel de atualizações. */
function nomeDe(d: Dados | null | undefined) {
  if (!d) return '';
  for (const k of ['nome', 'titulo', 'descricao', 'assunto', 'item', 'servico', 'processo', 'colaborador', 'clienteNome', 'recompensa', 'codigo']) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
  }
  return '';
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Valor em dinheiro do registro, quando houver (receitas, despesas, consumos, contratos…). */
const valorDe = (d: Dados) => (typeof d.valor === 'number' && d.valor > 0 ? brl(d.valor) : '');

const DEFAULT_CONFIG = {
  nomeEstabelecimento: 'Bar do Dindo',
  pontosPorReal: 1,
  horarios: ['18:00', '19:00', '20:00', '21:00', '22:00'],
  ambientes: ['Salão principal'],
  diasFuncionamento: [0, 1, 2, 3, 4, 5, 6], // 0 = domingo
  antecedenciaMinutos: 30,
  niveis: [
    { nome: 'Afilhado', minimo: 0 },
    { nome: 'Compadre', minimo: 2000 },
    { nome: 'Padrinho', minimo: 5000 },
  ],
  // Tabela progressiva de contribuição do empregado ao INSS (editável no CRM em Parâmetros).
  faixasInss: [
    { ate: 1621.0, aliquota: 7.5 },
    { ate: 2902.84, aliquota: 9 },
    { ate: 4354.27, aliquota: 12 },
    { ate: 8475.55, aliquota: 14 },
  ],
  aliquotaFgts: 8,
};

/* ---------- utilitários ---------- */
const now = () => new Date().toISOString();
const str = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Telefone: vazio ou DDD + número (10 ou 11 dígitos); devolve no formato (11) 91234-5678. */
function telefone(v: unknown) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length !== 10 && d.length !== 11) fail(400, 'Informe o celular completo, com DDD.');
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/** Barra valores absurdos em qualquer cadastro: números fora da faixa e textos longos demais. */
function validarRegistro(data: unknown): Dados {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Dados inválidos.');
  for (const [k, v] of Object.entries(data as Dados)) {
    if (typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > 1e12)) fail(400, `Valor numérico inválido em "${k}".`);
    if (typeof v === 'number' && v < 0) fail(400, `O campo "${k}" não aceita valores negativos.`);
    if (typeof v === 'string' && v.length > 5000) fail(400, `Texto muito longo em "${k}".`);
  }
  return data as Dados;
}
const limpar = (data: Dados): Dados => {
  const { id: _id, criadoEm: _c, atualizadoEm: _u, ...rest } = data ?? {};
  return rest;
};

function nivelDe(acumulados: number, niveis: { nome: string; minimo: number }[]) {
  const sorted = [...niveis].sort((a, b) => a.minimo - b.minimo);
  let atual = sorted[0];
  for (const n of sorted) if (acumulados >= n.minimo) atual = n;
  const proximo = sorted.find((n) => n.minimo > acumulados) ?? null;
  return { atual, proximo };
}
function resumo(consumos: Dados[], resgates: Dados[]) {
  const acumulados = consumos.reduce((s, c) => s + (Number(c.pontos) || 0), 0);
  const usados = resgates.filter((r) => r.status !== 'Cancelado').reduce((s, r) => s + (Number(r.custo) || 0), 0);
  const totalGasto = consumos.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const visitas = new Set(consumos.map((c) => String(c.data).slice(0, 10))).size;
  return { consumos, resgates, pontos: acumulados - usados, acumulados, totalGasto, visitas };
}
const publicCliente = (c: Dados) => ({
  id: c.numero, numero: c.numero, nome: c.nome, email: c.email, telefone: c.telefone, foto: c.foto ?? null, desde: c.criadoEm, origem: c.origem ?? 'Aplicativo',
});
const publicUsuario = (u: Dados) => ({
  id: u.id, nome: u.nome, email: u.email, funcaoId: u.funcaoId, status: u.status, ultimoAcesso: u.ultimoAcesso ?? null, criadoEm: u.criadoEm,
});

const VINCULOS_FOLHA = ['CLT', 'Intermitente', 'Temporário'];
function inssEmpregado(salario: number, faixas: { ate: number; aliquota: number }[]) {
  let total = 0, anterior = 0;
  for (const f of [...faixas].sort((a, b) => a.ate - b.ate)) {
    if (salario <= anterior) break;
    total += (Math.min(salario, f.ate) - anterior) * (f.aliquota / 100);
    anterior = f.ate;
  }
  return Math.round(total * 100) / 100;
}

export function createBackend(kind: 'app' | 'crm') {
  // cada sistema tem a própria sessão, mesmo quando abertos no mesmo navegador
  const app = initializeApp(firebaseConfig, kind);
  const auth = getAuth(app);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  if (EMULADOR) {
    connectAuthEmulator(auth, EMULADOR_AUTH, { disableWarnings: true });
    connectFirestoreEmulator(db, EMULADOR_FIRESTORE.host, EMULADOR_FIRESTORE.port);
  }
  const semPermissao = kind === 'crm' ? 'Sua função não tem permissão para esta ação.' : 'Você não tem permissão para esta ação.';

  /* ---------- dados ao vivo ----------
   * Cada consulta fica aberta (onSnapshot) e as leituras seguintes saem da memória:
   * as telas podem recarregar à vontade sem gastar leituras do Firestore. */
  interface Vigia { valor: unknown; pronto: Promise<void>; parar: () => void }
  const vigias = new Map<string, Vigia>();
  let versao = 1;

  function vigiar<T>(chave: string, iniciar: (ok: (v: T) => void, erro: (e: Error) => void) => () => void): Promise<T> {
    let v = vigias.get(chave);
    if (!v) {
      let primeiro = true;
      let resolver!: () => void, rejeitar!: (e: Error) => void;
      const novo: Vigia = { valor: undefined, pronto: new Promise<void>((a, b) => { resolver = a; rejeitar = b; }), parar: () => undefined };
      vigias.set(chave, novo);
      const erro = (e: Error) => {
        if (vigias.get(chave) === novo) vigias.delete(chave);
        if (primeiro) { primeiro = false; rejeitar(e); } else versao++;
      };
      const desligar = iniciar(
        (valor) => {
          novo.valor = valor;
          if (primeiro) { primeiro = false; resolver(); } else versao++;
        },
        erro,
      );
      // quem ainda esperava a primeira resposta é avisado, em vez de ficar esperando para sempre
      novo.parar = () => { desligar(); erro(new ApiError(401, 'Sessão expirada. Entre novamente.')); };
      v = novo;
    }
    const atual = v;
    return atual.pronto.then(() => atual.valor as T);
  }
  const ordenar = (rows: Dados[]) => rows.sort((a, b) => String(b.criadoEm ?? '').localeCompare(String(a.criadoEm ?? '')));
  const lista = (chave: string, q: Query) =>
    vigiar<Dados[]>(chave, (ok, erro) => onSnapshot(q, (s) => ok(ordenar(s.docs.map((d) => ({ ...d.data(), id: d.id })))), erro));
  const documento = (caminho: string) =>
    vigiar<Dados | null>(caminho, (ok, erro) => onSnapshot(doc(db, caminho), (s) => ok(s.exists() ? { ...s.data(), id: s.id } : null), erro));
  const colecao = (nome: string) => lista(nome, collection(db, nome));
  const doCliente = (nome: string, uid: string) => lista(`${nome}@${uid}`, query(collection(db, nome), where('clienteUid', '==', uid)));
  function pararVigias() {
    for (const v of vigias.values()) v.parar();
    vigias.clear();
  }
  async function sair() {
    if (!auth.currentUser) return;
    pararVigias();
    await signOut(auth).catch(() => undefined);
  }

  async function getConfig(): Promise<typeof DEFAULT_CONFIG & Dados> {
    const { id: _id, ...salvo } = (await documento('config/geral')) ?? {};
    return { ...DEFAULT_CONFIG, ...salvo };
  }

  /* ---------- contas (Firebase Auth) ---------- */
  const credencialInvalida = (e: unknown) =>
    ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email', 'auth/user-disabled', 'auth/missing-password'].includes(codigo(e));

  async function entrar(email: string, senha: string): Promise<UserCredential> {
    try {
      return await signInWithEmailAndPassword(auth, email, senha);
    } catch (e) {
      if (credencialInvalida(e)) return fail(401, 'E-mail ou senha incorretos.');
      throw e;
    }
  }
  /** Cria a conta; se o e-mail já tiver conta no outro sistema, só reaproveita quando a senha informada é a dela. */
  async function criarConta(email: string, senha: string, jaExiste: string): Promise<{ cred: UserCredential; nova: boolean }> {
    try {
      return { cred: await createUserWithEmailAndPassword(auth, email, senha), nova: true };
    } catch (e) {
      if (codigo(e) !== 'auth/email-already-in-use') throw e;
      try {
        return { cred: await signInWithEmailAndPassword(auth, email, senha), nova: false };
      } catch (e2) {
        if (credencialInvalida(e2)) return fail(409, jaExiste);
        throw e2;
      }
    }
  }
  /** Cria a conta de outra pessoa sem derrubar a sessão de quem está logado. */
  async function criarContaDeTerceiro(email: string, senha: string): Promise<string> {
    const aux = initializeApp(firebaseConfig, `aux-${Date.now()}`);
    const a = initializeAuth(aux, { persistence: inMemoryPersistence });
    if (EMULADOR) connectAuthEmulator(a, EMULADOR_AUTH, { disableWarnings: true });
    try {
      try {
        return (await createUserWithEmailAndPassword(a, email, senha)).user.uid;
      } catch (e) {
        if (codigo(e) !== 'auth/email-already-in-use') throw e;
        try {
          return (await signInWithEmailAndPassword(a, email, senha)).user.uid;
        } catch (e2) {
          if (credencialInvalida(e2)) return fail(409, 'Este e-mail já tem uma conta (por exemplo, como cliente do aplicativo). Para dar acesso ao CRM, informe a senha atual dessa conta.');
          throw e2;
        }
      }
    } finally {
      await signOut(a).catch(() => undefined);
      await deleteApp(aux).catch(() => undefined);
    }
  }

  /* ---------- autenticação ---------- */
  async function requireCliente() {
    const u = auth.currentUser;
    if (!u) return fail(401, 'Sessão expirada. Entre novamente.');
    const c = await documento(`clientes/${u.uid}`);
    if (!c) return fail(401, 'Sessão expirada. Entre novamente.');
    return { uid: u.uid, c };
  }
  async function requireUsuario() {
    const u = auth.currentUser;
    if (!u) return fail(401, 'Sessão expirada. Entre novamente.');
    const usuario = await documento(`usuarios/${u.uid}`);
    if (!usuario || usuario.status !== 'Ativo') return fail(401, 'Sessão expirada. Entre novamente.');
    const funcao = await documento(`funcoes/${usuario.funcaoId}`);
    // a função Administrador (de sistema) sempre tem acesso total, inclusive a áreas novas
    return { usuario, funcao, access: (area: string): string => (funcao?.sistema ? 'edit' : funcao?.permissoes?.[area] ?? 'none') };
  }
  type Ctx = Awaited<ReturnType<typeof requireUsuario>>;
  function requireAccess(ctx: Ctx, area: string, level: 'view' | 'edit') {
    const a = ctx.access(area);
    if (a === 'none' || (level === 'edit' && a !== 'edit')) fail(403, semPermissao);
  }
  /** Exige acesso em pelo menos uma das áreas informadas. */
  function requireAnyAccess(ctx: Ctx, areas: string[], level: 'view' | 'edit') {
    const ok = areas.some((area) => {
      const a = ctx.access(area);
      return a !== 'none' && (level !== 'edit' || a === 'edit');
    });
    if (!ok) fail(403, semPermissao);
  }

  /* ---------- painel de atualizações ----------
   * Cada alteração feita no CRM grava, no mesmo lote, quem fez o quê e quando.
   * Fica em `atividades/{área}/itens`, para que cada pessoa veja só o que é das áreas que ela acessa. */
  function registrar(lote: WriteBatch, ctx: Ctx, area: string, acao: string, extra: { colecao?: string; alvo?: string; detalhe?: string } = {}) {
    lote.set(doc(collection(db, 'atividades', area, 'itens')), {
      area, acao: str(acao, 120), colecao: extra.colecao ?? '', alvo: str(extra.alvo, 160), detalhe: str(extra.detalhe, 300),
      usuarioId: ctx.usuario.id, usuarioNome: ctx.usuario.nome, criadoEm: now(),
    });
  }

  /* ---------- rotas ---------- */
  interface Req { p: Record<string, string>; b: Dados; q: URLSearchParams }
  const rotas: { method: string; re: RegExp; keys: string[]; handler: (r: Req) => unknown }[] = [];
  const rota = (method: string, pattern: string, handler: (r: Req) => unknown) => {
    const keys: string[] = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)')) + '$');
    rotas.push({ method, re, keys, handler });
  };

  /* público */
  rota('GET', '/public/afilhados', async () => ({ total: Number((await documento('meta/contadores'))?.clientes) || 0 }));
  rota('GET', '/public/config', async () => {
    const c = await getConfig();
    return { nomeEstabelecimento: c.nomeEstabelecimento, horarios: c.horarios, ambientes: c.ambientes, diasFuncionamento: c.diasFuncionamento, antecedenciaMinutos: c.antecedenciaMinutos, pontosPorReal: c.pontosPorReal, niveis: c.niveis };
  });
  rota('GET', '/public/cardapio', async () =>
    (await colecao('cardapio'))
      .map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria, descricao: p.descricao ?? '', preco: Number(p.preco) || 0, destaque: p.destaque === true }))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
  );
  const recompensasAtivas = () => lista('recompensas@ativas', query(collection(db, 'recompensas'), where('status', '==', 'Ativa')));
  rota('GET', '/public/recompensas', async () =>
    (await recompensasAtivas())
      .map((r) => ({ id: r.id, nome: r.nome, descricao: r.descricao ?? '', custo: Number(r.custo) || 0 }))
      .sort((a, b) => a.custo - b.custo),
  );

  /* app do cliente */
  rota('POST', '/app/cadastro', async ({ b }) => {
    const nome = str(b.nome, 120), email = str(b.email, 160).toLowerCase(), tel = telefone(b.telefone), senha = String(b.senha ?? '');
    if (nome.length < 3) fail(400, 'Informe seu nome completo.');
    if (!emailOk(email)) fail(400, 'Informe um e-mail válido.');
    if (senha.length < 6) fail(400, 'A senha deve ter pelo menos 6 caracteres.');
    const origem = b.origem === 'Pré-cadastro' ? 'Pré-cadastro' : 'Aplicativo';
    if (origem === 'Pré-cadastro') {
      if (!tel) fail(400, 'Informe o celular completo, com DDD.');
      if (b.aceite !== true) fail(400, 'É preciso aceitar o uso dos dados para participar do programa.');
    }
    const { cred, nova } = await criarConta(email, senha, 'Este e-mail já está cadastrado.');
    const uid = cred.user.uid;
    try {
      if (!nova && (await getDoc(doc(db, 'clientes', uid))).exists()) fail(409, 'Este e-mail já está cadastrado.');
      // o número de afilhado é sequencial: sai do contador na mesma transação que cria o cadastro
      await runTransaction(db, async (t) => {
        const contadores = doc(db, 'meta/contadores');
        const numero = (Number((await t.get(contadores)).data()?.clientes) || 0) + 1;
        t.set(contadores, { clientes: numero }, { merge: true });
        t.set(doc(db, 'clientes', uid), {
          numero, nome, email: cred.user.email ?? email, telefone: tel, foto: null, criadoEm: now(), origem, aceiteEm: b.aceite === true ? now() : null,
        });
        t.set(doc(db, 'saldos', uid), { acumulados: 0, usados: 0, ultimoResgate: '' });
      });
    } catch (e) {
      if (nova) await cred.user.delete().catch(() => undefined);
      await sair();
      throw e;
    }
    return { token: uid };
  });
  rota('POST', '/app/login', async ({ b }) => {
    const { user } = await entrar(str(b.email, 160), String(b.senha ?? ''));
    if (!(await getDoc(doc(db, 'clientes', user.uid))).exists()) {
      await sair();
      fail(401, 'E-mail ou senha incorretos.');
    }
    return { token: user.uid };
  });
  rota('POST', '/app/logout', async () => { await sair(); return { ok: true }; });
  rota('GET', '/app/me', async () => {
    const { uid, c } = await requireCliente();
    const [consumos, resgates, reservas, cfg] = await Promise.all([doCliente('consumos', uid), doCliente('resgates', uid), doCliente('reservas', uid), getConfig()]);
    const r = resumo(consumos, resgates);
    return {
      cliente: publicCliente(c),
      pontos: r.pontos,
      acumulados: r.acumulados,
      totalGasto: r.totalGasto,
      visitas: r.visitas,
      nivel: nivelDe(r.acumulados, cfg.niveis),
      consumos: r.consumos,
      resgates: r.resgates,
      reservas,
    };
  });
  rota('PATCH', '/app/me', async ({ b }) => {
    const { uid, c } = await requireCliente();
    const nome = b.nome !== undefined ? str(b.nome, 120) : c.nome;
    const tel = b.telefone !== undefined ? telefone(b.telefone) : c.telefone;
    let foto = c.foto ?? null;
    if (b.foto !== undefined) {
      if (b.foto !== null && !/^data:image\/(jpeg|png|webp);base64,/.test(String(b.foto))) fail(400, 'Imagem inválida.');
      if (b.foto !== null && String(b.foto).length > 400_000) fail(413, 'Imagem muito grande.');
      foto = b.foto;
    }
    if (nome.length < 3) fail(400, 'Informe seu nome completo.');
    const lote = writeBatch(db);
    lote.update(doc(db, 'clientes', uid), { nome, telefone: tel, foto });
    await lote.commit();
    return { ok: true };
  });
  rota('POST', '/app/reservas', async ({ b }) => {
    const { uid, c } = await requireCliente();
    const cfg = await getConfig();
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
    const ref = doc(collection(db, 'reservas'));
    const t = now();
    const reserva = {
      clienteId: c.numero, clienteUid: uid, clienteNome: c.nome, clienteTelefone: c.telefone, data, hora, pessoas, ambiente,
      observacoes: str(b.observacoes, 300), status: 'Pendente', origem: 'Aplicativo', criadoEm: t, atualizadoEm: t,
    };
    const lote = writeBatch(db);
    lote.set(ref, reserva);
    await lote.commit();
    return { ...reserva, id: ref.id };
  });
  rota('POST', '/app/reservas/:id/cancelar', async ({ p }) => {
    const { uid } = await requireCliente();
    const r = (await doCliente('reservas', uid)).find((x) => x.id === p.id);
    if (!r) return fail(404, 'Reserva não encontrada.');
    if (!['Pendente', 'Confirmada'].includes(r.status)) fail(400, 'Esta reserva não pode mais ser cancelada.');
    const lote = writeBatch(db);
    lote.update(doc(db, 'reservas', p.id), { status: 'Cancelada pelo cliente', atualizadoEm: now() });
    await lote.commit();
    return { ...r, status: 'Cancelada pelo cliente' };
  });
  rota('POST', '/app/resgates', async ({ b }) => {
    const { uid, c } = await requireCliente();
    const rec = (await recompensasAtivas()).find((x) => x.id === str(b.recompensaId, 40));
    if (!rec) return fail(404, 'Recompensa indisponível.');
    const custo = Number(rec.custo) || 0;
    const [consumos, resgates] = await Promise.all([doCliente('consumos', uid), doCliente('resgates', uid)]);
    if (resumo(consumos, resgates).pontos < custo) fail(400, 'Pontos insuficientes.');
    const ref = doc(collection(db, 'resgates'));
    const t = now();
    const codigoVoucher = 'DINDO-' + Array.from(crypto.getRandomValues(new Uint8Array(3)), (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    const resgate = {
      clienteId: c.numero, clienteUid: uid, clienteNome: c.nome, recompensaId: rec.id, recompensa: rec.nome, custo,
      codigo: codigoVoucher, status: 'Disponível', data: t, criadoEm: t, atualizadoEm: t,
    };
    // o voucher e o débito no saldo vão juntos: as regras recusam o resgate se o saldo não cobrir o custo
    const lote = writeBatch(db);
    lote.set(ref, resgate);
    lote.update(doc(db, 'saldos', uid), { usados: increment(custo), ultimoResgate: ref.id });
    try {
      await lote.commit();
    } catch (e) {
      if (codigo(e) === 'permission-denied') fail(400, 'Pontos insuficientes.');
      throw e;
    }
    return { ...resgate, id: ref.id };
  });

  /* CRM: primeiro acesso e sessão */
  rota('GET', '/crm/setup', async () => ({ pendente: !(await documento('meta/setup')) }));
  rota('POST', '/crm/setup', async ({ b }) => {
    if (await documento('meta/setup')) fail(409, 'O sistema já foi configurado.');
    const nome = str(b.nome, 120), email = str(b.email, 160).toLowerCase(), senha = String(b.senha ?? '');
    if (nome.length < 3) fail(400, 'Informe o nome completo.');
    if (!emailOk(email)) fail(400, 'Informe um e-mail válido.');
    if (senha.length < 8) fail(400, 'A senha deve ter pelo menos 8 caracteres.');
    const { cred } = await criarConta(email, senha, 'Este e-mail já tem uma conta com outra senha.');
    const t = now();
    const lote = writeBatch(db);
    lote.set(doc(db, 'funcoes/admin'), {
      nome: 'Administrador', descricao: 'Acesso total ao sistema, inclusive configurações.', permissoes: Object.fromEntries(AREAS.map((a) => [a, 'edit'])), sistema: true, criadoEm: t, atualizadoEm: t,
    });
    lote.set(doc(db, 'usuarios', cred.user.uid), { nome, email, funcaoId: 'admin', status: 'Ativo', ultimoAcesso: t, criadoEm: t });
    lote.set(doc(db, 'meta/setup'), { feitoEm: t });
    try {
      await lote.commit();
    } catch (e) {
      await sair();
      throw e;
    }
    return { token: cred.user.uid };
  });
  rota('POST', '/crm/login', async ({ b }) => {
    const { user } = await entrar(str(b.email, 160), String(b.senha ?? ''));
    const u = (await getDoc(doc(db, 'usuarios', user.uid))).data();
    if (!u) {
      await sair();
      return fail(401, 'E-mail ou senha incorretos.');
    }
    if (u.status !== 'Ativo') {
      await sair();
      fail(403, 'Usuário inativo. Procure o administrador.');
    }
    const lote = writeBatch(db);
    lote.update(doc(db, 'usuarios', user.uid), { ultimoAcesso: now() });
    await lote.commit();
    return { token: user.uid };
  });
  rota('POST', '/crm/logout', async () => { await sair(); return { ok: true }; });
  rota('GET', '/crm/me', async () => {
    const ctx = await requireUsuario();
    return { usuario: publicUsuario(ctx.usuario), funcao: ctx.funcao };
  });
  rota('PUT', '/crm/me/senha', async ({ b }) => {
    await requireUsuario();
    const user = auth.currentUser!;
    if (String(b.nova ?? '').length < 8) fail(400, 'A nova senha deve ter pelo menos 8 caracteres.');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', String(b.atual ?? '')));
    } catch (e) {
      if (credencialInvalida(e)) fail(400, 'Senha atual incorreta.');
      throw e;
    }
    await updatePassword(user, String(b.nova));
    return { ok: true };
  });

  /* CRM: sinal de mudança (as telas consultam a cada poucos segundos e recarregam quando muda) */
  rota('GET', '/crm/versao', async () => { await requireUsuario(); return { versao }; });

  /* CRM: preferências de cada usuário (ex.: como fica o painel executivo), valem em qualquer computador */
  rota('GET', '/crm/preferencias', async () => {
    const ctx = await requireUsuario();
    const { id: _id, ...prefs } = (await documento(`preferencias/${ctx.usuario.id}`)) ?? {};
    return prefs;
  });
  rota('PUT', '/crm/preferencias', async ({ b }) => {
    const ctx = await requireUsuario();
    // listas curtas de identificadores de blocos do painel; qualquer outra coisa é descartada
    const ids = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x)).slice(0, 60);
    const p = (b.painel ?? {}) as Dados;
    // atalhos: páginas do CRM adicionadas ao painel pelo botão direito do menu
    const atalhos = (Array.isArray(p.atalhos) ? p.atalhos : []).filter((x: unknown): x is string => typeof x === 'string' && /^\/[a-z0-9/-]{1,60}$/.test(x)).slice(0, 30);
    const painel = { ordem: ids(p.ordem), fixados: ids(p.fixados), ocultos: ids(p.ocultos), atalhos };
    const lote = writeBatch(db);
    lote.set(doc(db, 'preferencias', ctx.usuario.id), { painel, atualizadoEm: now() }, { merge: true });
    await lote.commit();
    return { painel };
  });

  /* CRM: painel de atualizações (as últimas alterações das áreas que a pessoa acessa) */
  rota('GET', '/crm/atividades', async () => {
    const ctx = await requireUsuario();
    const areas = AREAS.filter((a) => ctx.access(a) !== 'none');
    const listas = await Promise.all(areas.map((a) =>
      lista(`atividades@${a}`, query(collection(db, 'atividades', a, 'itens'), orderBy('criadoEm', 'desc'), limit(80)))));
    return ordenar(listas.flat()).slice(0, 200);
  });

  /* CRM: configuração */
  rota('GET', '/crm/config', async () => { await requireUsuario(); return getConfig(); });
  rota('PUT', '/crm/config', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'cfg', 'edit');
    if (b.pontosPorReal !== undefined && !(Number(b.pontosPorReal) >= 0)) fail(400, 'Pontos por real inválido.');
    if (b.horarios && !b.horarios.every((h: string) => /^\d{2}:\d{2}$/.test(h))) fail(400, 'Horários devem estar no formato HH:MM.');
    const patch = Object.fromEntries(Object.entries(b).filter(([k]) => k in DEFAULT_CONFIG));
    const lote = writeBatch(db);
    lote.set(doc(db, 'config/geral'), patch, { merge: true });
    registrar(lote, ctx, 'cfg', 'alterou os parâmetros do aplicativo');
    await lote.commit();
    return { ...(await getConfig()), ...patch };
  });

  /* CRM: usuários */
  const activeAdmins = (usuarios: Dados[]) => usuarios.filter((u) => u.funcaoId === 'admin' && u.status === 'Ativo').length;
  rota('GET', '/crm/usuarios', async () => {
    requireAccess(await requireUsuario(), 'cfg', 'view');
    return (await colecao('usuarios')).map(publicUsuario).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  });
  rota('POST', '/crm/usuarios', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'cfg', 'edit');
    const nome = str(b.nome, 120), email = str(b.email, 160).toLowerCase(), senha = String(b.senha ?? '');
    const funcaoId = str(b.funcaoId, 40);
    if (nome.length < 3) fail(400, 'Informe o nome completo.');
    if (!emailOk(email)) fail(400, 'Informe um e-mail válido.');
    if (senha.length < 8) fail(400, 'A senha inicial deve ter pelo menos 8 caracteres.');
    const funcao = (await colecao('funcoes')).find((f) => f.id === funcaoId);
    if (!funcao) return fail(400, 'Selecione uma função.');
    if ((await colecao('usuarios')).some((u) => u.email === email)) fail(409, 'Já existe um usuário com este e-mail.');
    const uid = await criarContaDeTerceiro(email, senha);
    const usuario = { nome, email, funcaoId, status: b.status === 'Inativo' ? 'Inativo' : 'Ativo', ultimoAcesso: null, criadoEm: now() };
    const lote = writeBatch(db);
    lote.set(doc(db, 'usuarios', uid), usuario);
    registrar(lote, ctx, 'cfg', 'cadastrou o usuário', { colecao: 'usuarios', alvo: nome, detalhe: `Função: ${funcao.nome}` });
    await lote.commit();
    return publicUsuario({ ...usuario, id: uid });
  });
  rota('PUT', '/crm/usuarios/:id', async ({ p, b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'cfg', 'edit');
    const usuarios = await colecao('usuarios');
    const u = usuarios.find((x) => x.id === p.id);
    if (!u) return fail(404, 'Usuário não encontrado.');
    const nome = b.nome !== undefined ? str(b.nome, 120) : u.nome;
    const funcaoId = b.funcaoId !== undefined ? str(b.funcaoId, 40) : u.funcaoId;
    const status = b.status === 'Inativo' ? 'Inativo' : b.status === 'Ativo' ? 'Ativo' : u.status;
    if (nome.length < 3) fail(400, 'Informe o nome completo.');
    // e-mail e senha pertencem à conta da pessoa (Firebase Auth) e não podem ser trocados por outro usuário
    if (b.email !== undefined && str(b.email, 160).toLowerCase() !== u.email) fail(400, 'O e-mail de acesso não pode ser alterado. Crie um novo usuário com o outro e-mail.');
    if (b.senha) fail(400, 'A senha só pode ser trocada pela própria pessoa. Use "Enviar e-mail de redefinição de senha".');
    const funcoes = await colecao('funcoes');
    if (!funcoes.some((f) => f.id === funcaoId)) fail(400, 'Selecione uma função.');
    const deixaDeSerAdmin = u.funcaoId === 'admin' && u.status === 'Ativo' && (funcaoId !== 'admin' || status !== 'Ativo');
    if (deixaDeSerAdmin && activeAdmins(usuarios) <= 1) fail(400, 'É preciso manter pelo menos um administrador ativo.');
    const lote = writeBatch(db);
    lote.update(doc(db, 'usuarios', p.id), { nome, funcaoId, status });
    const mudancas = [
      funcaoId !== u.funcaoId ? `Função: ${funcoes.find((f) => f.id === funcaoId)?.nome ?? funcaoId}` : '',
      status !== u.status ? `Status: ${status}` : '',
      nome !== u.nome ? `Nome: ${nome}` : '',
    ].filter(Boolean).join(' · ');
    registrar(lote, ctx, 'cfg', 'alterou o usuário', { colecao: 'usuarios', alvo: u.nome, detalhe: mudancas });
    await lote.commit();
    return publicUsuario({ ...u, nome, funcaoId, status });
  });
  rota('POST', '/crm/usuarios/:id/redefinir-senha', async ({ p }) => {
    requireAccess(await requireUsuario(), 'cfg', 'edit');
    const u = (await colecao('usuarios')).find((x) => x.id === p.id);
    if (!u) return fail(404, 'Usuário não encontrado.');
    await sendPasswordResetEmail(auth, u.email);
    return { ok: true };
  });
  rota('DELETE', '/crm/usuarios/:id', async ({ p }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'cfg', 'edit');
    if (ctx.usuario.id === p.id) fail(400, 'Você não pode excluir o próprio usuário.');
    const usuarios = await colecao('usuarios');
    const u = usuarios.find((x) => x.id === p.id);
    if (!u) return fail(404, 'Usuário não encontrado.');
    if (u.funcaoId === 'admin' && u.status === 'Ativo' && activeAdmins(usuarios) <= 1) fail(400, 'É preciso manter pelo menos um administrador ativo.');
    // sem o cadastro em `usuarios` a conta não passa mais pelas regras nem pelo login do CRM
    const lote = writeBatch(db);
    lote.delete(doc(db, 'usuarios', p.id));
    registrar(lote, ctx, 'cfg', 'excluiu o usuário', { colecao: 'usuarios', alvo: u.nome });
    await lote.commit();
    return { ok: true };
  });

  /* CRM: clientes do aplicativo */
  rota('GET', '/crm/clientes', async () => {
    requireAnyAccess(await requireUsuario(), ['mkt', 'atd'], 'view');
    const [clientes, consumos, resgates, cfg] = await Promise.all([colecao('clientes'), colecao('consumos'), colecao('resgates'), getConfig()]);
    return clientes
      .map((c) => {
        const r = resumo(consumos.filter((x) => x.clienteId === c.numero), resgates.filter((x) => x.clienteId === c.numero));
        const ultima = r.consumos.map((x) => x.data).sort().at(-1) ?? null;
        return {
          ...publicCliente(c), foto: undefined, pontos: r.pontos, acumulados: r.acumulados, totalGasto: r.totalGasto,
          visitas: r.visitas, ultimaVisita: ultima, nivel: nivelDe(r.acumulados, cfg.niveis).atual?.nome ?? '',
        };
      })
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  });

  /* CRM: listas para vincular registros (só nome e identificação — sem salários ou dados sensíveis) */
  rota('GET', '/crm/referencias/:tipo', async ({ p }) => {
    const ctx = await requireUsuario();
    const ativo = (s: unknown) => !['Desligado', 'Inativo', 'Encerrado'].includes(String(s ?? ''));
    switch (p.tipo) {
      case 'colaboradores':
        return (await colecao('ref_colaboradores'))
          .map((c) => ({ id: c.id, nome: c.nome, detalhe: [c.cargo, c.status !== 'Ativo' ? c.status : null].filter(Boolean).join(' · '), inativo: !ativo(c.status) }));
      case 'pessoas': {
        // equipe (colaboradores) + usuários do sistema, sem repetir a mesma pessoa
        const lista = (await colecao('ref_colaboradores'))
          .filter((c) => ativo(c.status))
          .map((c) => ({ id: 'c:' + c.id, nome: c.nome, detalhe: c.cargo || 'Colaborador' }));
        const nomes = new Set(lista.map((x) => String(x.nome).toLowerCase()));
        for (const u of await colecao('usuarios')) {
          if (u.status === 'Ativo' && !nomes.has(String(u.nome).toLowerCase())) lista.push({ id: 'u:' + u.id, nome: u.nome, detalhe: 'Usuário do sistema' });
        }
        return lista;
      }
      case 'fornecedores':
        return (await colecao('ref_fornecedores'))
          .map((f) => ({ id: f.id, nome: f.nome, detalhe: [f.categoria, f.status !== 'Ativo' ? f.status : null].filter(Boolean).join(' · '), inativo: f.status === 'Inativo' }));
      case 'clientes':
        requireAnyAccess(ctx, ['atd', 'mkt'], 'view');
        return (await colecao('clientes'))
          .map((c) => ({ id: c.numero, nome: c.nome, detalhe: `#${String(c.numero).padStart(3, '0')}${c.telefone ? ' · ' + c.telefone : ''}`, telefone: c.telefone }));
      default:
        return fail(404, 'Lista inexistente.');
    }
  });

  /* CRM: produtos disponíveis para venda (o atendimento lança consumo sem acesso ao cadastro de produtos) */
  rota('GET', '/crm/produtos-venda', async () => {
    requireAnyAccess(await requireUsuario(), ['atd', 'mkt'], 'view');
    return (await colecao('produtos'))
      .filter((p) => p.status !== 'Inativo')
      .map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria, preco: Number(p.preco) || 0 }))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  });

  /* CRM: folha de pagamento — calculada a partir do RH; o lançamento como despesa é feito pelo Financeiro */
  async function calcularFolha(mes: string) {
    if (!/^\d{4}-\d{2}$/.test(mes)) fail(400, 'Competência inválida.');
    const [cfg, colaboradores, despesas] = await Promise.all([getConfig(), colecao('colaboradores'), colecao('despesas')]);
    const fgtsAliq = (Number(cfg.aliquotaFgts) || 0) / 100;
    const linhas = colaboradores
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
    const soma = (k: 'salario' | 'inss' | 'liquido' | 'fgts' | 'provisoes' | 'custo') => Math.round(linhas.reduce((t, l) => t + l[k], 0) * 100) / 100;
    const lancamentos = despesas.filter((d) => d.competenciaFolha === mes && d.status !== 'Cancelado');
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
  rota('GET', '/crm/folha', async ({ q }) => {
    const ctx = await requireUsuario();
    requireAnyAccess(ctx, ['rh', 'fin'], 'view');
    const folha = await calcularFolha(q.get('mes') ?? '');
    // o Financeiro vê os totais; o detalhe por colaborador (salários individuais) é do RH
    if (ctx.access('rh') === 'none') folha.linhas = [];
    return folha;
  });
  rota('POST', '/crm/folha/lancar', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'fin', 'edit');
    const folha = await calcularFolha(str(b.mes, 7));
    if (folha.lancada) fail(409, 'A folha desta competência já foi lançada.');
    if (!folha.colaboradores) fail(400, 'Não há colaboradores com salário cadastrado no RH.');
    const [y, m] = folha.mes.split('-').map(Number);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nomeMes = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const t = now();
    const base = { categoria: 'Folha de pagamento', data: `${folha.mes}-01`, status: 'A pagar', competenciaFolha: folha.mes, criadoEm: t, atualizadoEm: t };
    const criadas: Dados[] = [{ ...base, descricao: `Folha de pagamento · ${nomeMes}`, vencimento: iso(new Date(y, m, 5)), valor: folha.totais.liquido }];
    if (folha.totais.fgts > 0) criadas.push({ ...base, categoria: 'Encargos', descricao: `FGTS · ${nomeMes}`, vencimento: iso(new Date(y, m, 20)), valor: folha.totais.fgts });
    if (folha.totais.inss > 0) criadas.push({ ...base, categoria: 'Encargos', descricao: `INSS retido dos empregados · ${nomeMes}`, vencimento: iso(new Date(y, m, 20)), valor: folha.totais.inss });
    const lote = writeBatch(db);
    for (const d of criadas) lote.set(doc(collection(db, 'despesas')), d);
    registrar(lote, ctx, 'fin', 'lançou a folha de pagamento', {
      colecao: 'despesas', alvo: nomeMes, detalhe: `${folha.colaboradores} colaborador(es) · líquido ${brl(folha.totais.liquido)} · custo total ${brl(folha.totais.custo)}`,
    });
    await lote.commit();
    return { ok: true, despesas: criadas.length };
  });

  /* CRM: lançamento de consumo (credita pontos e gera receita) */
  rota('POST', '/crm/consumos', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'atd', 'edit');
    const cliente = (await colecao('clientes')).find((c) => c.numero === Number(b.clienteId));
    if (!cliente) return fail(400, 'Selecione um cliente.');
    const produtos = await colecao('produtos');
    const itens = (Array.isArray(b.itens) ? b.itens : []).map((i: Dados) => {
      const p = produtos.find((x) => x.id === str(i.produtoId, 40));
      const quantidade = Math.floor(Number(i.quantidade));
      if (!p) return fail(400, 'Produto não encontrado.');
      if (!(quantidade >= 1 && quantidade <= 999)) fail(400, 'Quantidade inválida.');
      const preco = Number(p.preco) || 0;
      return { produtoId: p.id, nome: p.nome, quantidade, preco, total: Math.round(preco * quantidade * 100) / 100 };
    });
    if (!itens.length) fail(400, 'Adicione ao menos um item.');
    const valor = Math.round(itens.reduce((s: number, i: { total: number }) => s + i.total, 0) * 100) / 100;
    const pontos = Math.floor(valor * (await getConfig()).pontosPorReal);
    const forma = str(b.formaPagamento, 30) || 'Não informado';
    const data = now();
    const consumoRef = doc(collection(db, 'consumos')), receitaRef = doc(collection(db, 'receitas'));
    const consumo = {
      clienteId: cliente.numero, clienteUid: cliente.id, clienteNome: cliente.nome, itens, valor, pontos, formaPagamento: forma, data,
      receitaId: receitaRef.id, criadoEm: data, atualizadoEm: data,
    };
    const lote = writeBatch(db);
    lote.set(consumoRef, consumo);
    lote.set(receitaRef, {
      data: data.slice(0, 10), descricao: `Consumo · ${cliente.nome} (#${String(cliente.numero).padStart(3, '0')})`,
      categoria: 'Consumo de clientes', formaPagamento: forma, valor, origem: 'Lançamento de consumo', consumoId: consumoRef.id, criadoEm: data, atualizadoEm: data,
    });
    lote.set(doc(db, 'saldos', cliente.id), { acumulados: increment(pontos) }, { merge: true });
    registrar(lote, ctx, 'atd', 'lançou consumo para', {
      colecao: 'consumos', alvo: `${cliente.nome} (#${String(cliente.numero).padStart(3, '0')})`, detalhe: `${brl(valor)} · ${pontos} pontos · ${forma}`,
    });
    await lote.commit();
    return { ...consumo, id: consumoRef.id };
  });

  /* CRM: coleções genéricas */
  function collectionArea(name: string) {
    const area = COLLECTIONS[name];
    if (!area) return fail(404, 'Módulo inexistente.');
    return area;
  }
  /** Cópias só com o que pode ser visto por mais gente: cardápio (público) e nomes para vincular registros (equipe). */
  function espelhar(lote: WriteBatch, col: string, id: string, d: Dados | null) {
    if (col === 'produtos') {
      const ref = doc(db, 'cardapio', id);
      if (d && d.status === 'Ativo' && d.noCardapio !== 'Não') {
        lote.set(ref, { nome: d.nome ?? '', categoria: d.categoria ?? '', descricao: d.descricao ?? '', preco: Number(d.preco) || 0, destaque: d.destaque === 'Sim' });
      } else lote.delete(ref);
    }
    if (col === 'colaboradores') {
      const ref = doc(db, 'ref_colaboradores', id);
      if (d) lote.set(ref, { nome: d.nome ?? '', cargo: d.cargo ?? '', status: d.status ?? 'Ativo' });
      else lote.delete(ref);
    }
    if (col === 'fornecedores') {
      const ref = doc(db, 'ref_fornecedores', id);
      if (d) lote.set(ref, { nome: d.nome ?? '', categoria: d.categoria ?? '', status: d.status ?? 'Ativo' });
      else lote.delete(ref);
    }
  }
  /** Reservas lançadas pela equipe para um afilhado também aparecem no aplicativo dele. */
  async function vincularCliente(col: string, d: Dados) {
    if (col !== 'reservas' || !('clienteId' in d)) return;
    d.clienteUid = (await colecao('clientes')).find((c) => c.numero === Number(d.clienteId))?.id ?? null;
  }
  rota('GET', '/crm/c/:col', async ({ p }) => {
    const ctx = await requireUsuario();
    // consumos e resgates também alimentam o resumo de clientes, visto por Marketing e Vendas
    if (['consumos', 'resgates'].includes(p.col)) requireAnyAccess(ctx, ['atd', 'mkt'], 'view');
    else requireAccess(ctx, collectionArea(p.col), 'view');
    return colecao(p.col);
  });
  rota('POST', '/crm/c/:col', async ({ p, b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, collectionArea(p.col), 'edit');
    if (['consumos', 'resgates'].includes(p.col)) fail(400, 'Use o fluxo próprio deste módulo.');
    const t = now();
    const dados: Dados = { ...limpar(validarRegistro(b)), criadoEm: t, atualizadoEm: t };
    if (p.col === 'funcoes') dados.sistema = false;
    await vincularCliente(p.col, dados);
    const ref = doc(collection(db, p.col));
    const lote = writeBatch(db);
    lote.set(ref, dados);
    espelhar(lote, p.col, ref.id, dados);
    registrar(lote, ctx, collectionArea(p.col), `cadastrou ${REGISTRO[p.col] ?? 'o registro'}`, { colecao: p.col, alvo: nomeDe(dados), detalhe: valorDe(dados) });
    await lote.commit();
    return { ...dados, id: ref.id };
  });
  rota('PUT', '/crm/c/:col/:id', async ({ p, b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, collectionArea(p.col), 'edit');
    validarRegistro(b);
    const cur = (await colecao(p.col)).find((x) => x.id === p.id);
    if (!cur) return fail(404, 'Registro não encontrado.');
    const patch: Dados = { ...limpar(b), atualizadoEm: now() };
    if (p.col === 'funcoes') {
      if (cur.sistema) fail(400, 'A função Administrador não pode ser alterada.');
      patch.sistema = false;
    }
    if (p.col === 'consumos') fail(400, 'Consumos não podem ser editados. Exclua e lance novamente.');
    if (p.col === 'receitas' && cur.consumoId) fail(400, 'Receitas geradas por consumo são alteradas pelo lançamento de consumo.');
    const lote = writeBatch(db);
    if (p.col === 'resgates') {
      const status = str(b.status, 30);
      lote.update(doc(db, 'resgates', p.id), { status, atualizadoEm: patch.atualizadoEm });
      // cancelar um voucher devolve os pontos; reativar volta a debitar
      const antes = cur.status === 'Cancelado', depois = status === 'Cancelado';
      if (antes !== depois && cur.clienteUid) {
        lote.set(doc(db, 'saldos', cur.clienteUid), { usados: increment((depois ? -1 : 1) * (Number(cur.custo) || 0)) }, { merge: true });
      }
      if (status !== cur.status) {
        registrar(lote, ctx, 'atd', 'alterou o voucher', { colecao: 'resgates', alvo: `${cur.codigo ?? ''} · ${cur.recompensa ?? ''}`, detalhe: `Status: ${cur.status} → ${status}` });
      }
      await lote.commit();
      return { ...cur, status };
    }
    await vincularCliente(p.col, patch);
    lote.update(doc(db, p.col, p.id), patch);
    espelhar(lote, p.col, p.id, { ...cur, ...patch });
    const novoStatus = typeof patch.status === 'string' && patch.status !== cur.status ? `Status: ${cur.status ?? '—'} → ${patch.status}` : '';
    registrar(lote, ctx, collectionArea(p.col), `alterou ${REGISTRO[p.col] ?? 'o registro'}`, {
      colecao: p.col, alvo: nomeDe({ ...cur, ...patch }), detalhe: [novoStatus, valorDe({ ...cur, ...patch })].filter(Boolean).join(' · '),
    });
    await lote.commit();
    return { ...cur, ...patch };
  });
  rota('DELETE', '/crm/c/:col/:id', async ({ p }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, collectionArea(p.col), 'edit');
    const cur = (await colecao(p.col)).find((x) => x.id === p.id);
    if (!cur) return fail(404, 'Registro não encontrado.');
    if (p.col === 'funcoes') {
      if (cur.sistema) fail(400, 'A função Administrador não pode ser excluída.');
      if ((await colecao('usuarios')).some((u) => u.funcaoId === p.id)) fail(400, 'Há usuários com esta função. Altere-os antes de excluir.');
    }
    if (p.col === 'receitas' && cur.consumoId) fail(400, 'Esta receita veio de um consumo. Exclua o consumo para estorná-la.');
    if (p.col === 'resgates') fail(400, 'Resgates não são excluídos. Altere o status para Cancelado.');
    const lote = writeBatch(db);
    if (p.col === 'consumos') {
      // excluir o lançamento estorna a receita e os pontos
      if (cur.receitaId) lote.delete(doc(db, 'receitas', cur.receitaId));
      if (cur.clienteUid) lote.set(doc(db, 'saldos', cur.clienteUid), { acumulados: increment(-(Number(cur.pontos) || 0)) }, { merge: true });
    }
    lote.delete(doc(db, p.col, p.id));
    espelhar(lote, p.col, p.id, null);
    registrar(lote, ctx, collectionArea(p.col), `excluiu ${REGISTRO[p.col] ?? 'o registro'}`, { colecao: p.col, alvo: nomeDe(cur), detalhe: valorDe(cur) });
    await lote.commit();
    return { ok: true };
  });

  /* ---------- entrada única ---------- */
  async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const url = new URL(path, 'http://local');
    try {
      await auth.authStateReady();
      for (const r of rotas) {
        if (r.method !== method) continue;
        const m = url.pathname.match(r.re);
        if (!m) continue;
        const p = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const out = await r.handler({ p, b: (options.body ?? {}) as Dados, q: url.searchParams });
        // cópia simples, como vinha da rede: as telas não alteram os dados guardados em memória
        return JSON.parse(JSON.stringify(out ?? null)) as T;
      }
      return fail(404, 'Rota não encontrada.');
    } catch (e) {
      if (e instanceof ApiError) throw e;
      const c = codigo(e);
      if (c === 'permission-denied') return fail(403, semPermissao);
      if (c === 'unavailable' || c === 'auth/network-request-failed') return fail(0, 'Sem conexão com o servidor. Verifique sua internet.');
      if (c === 'auth/too-many-requests') return fail(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      if (c === 'auth/weak-password') return fail(400, 'Senha muito fraca. Use pelo menos 6 caracteres.');
      console.error(e);
      return fail(500, 'Não foi possível concluir a operação.');
    }
  }

  // só nos builds de teste (emulador): permite chamar as rotas pelo console do navegador
  if (EMULADOR) (globalThis as Dados)[`__dindo_${kind}`] = request;

  return {
    request,
    /** Identificador da sessão atual (só é confiável depois da primeira chamada a `request`). */
    uid: () => auth.currentUser?.uid ?? null,
    sair,
  };
}
