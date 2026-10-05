// Simulação ao vivo da operação do bar, usando a API exatamente como o app e o CRM usam.
// Gera cadastros de afilhados, reservas (e confirmações), vendas, resgates e baixas de vouchers.
//
// Uso: node scripts/simular.mjs --email <admin> --senha <senha> [--api http://localhost:3334] [--vendas 100] [--segundos 120]
//
// Por segurança, recusa rodar contra a API do banco real (porta 3333) sem --forcar.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]] : acc), []),
);
const API = String(args.api ?? 'http://localhost:3334').replace(/\/$/, '') + '/api';
const TOTAL_VENDAS = Number(args.vendas ?? 100);
const SEGUNDOS = Number(args.segundos ?? 120);
if (!args.email || !args.senha) {
  console.error('Informe --email e --senha do administrador.');
  process.exit(1);
}
if (API.includes(':3333') && !args.forcar) {
  console.error('Recusado: a porta 3333 é a API do banco REAL. Use a API de demonstração (3334) ou passe --forcar.');
  process.exit(1);
}

/* ---------- utilitários ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const int = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hora = () => new Date().toLocaleTimeString('pt-BR');
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const log = (tipo, msg) => console.log(`${hora()}  ${tipo.padEnd(12)} ${msg}`);

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro ?? `HTTP ${res.status}`);
  return data;
}

/* ---------- dados de demonstração ---------- */
const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Lucas', 'Mariana', 'Mateus', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Renata', 'Rodrigo', 'Sabrina', 'Thiago', 'Vanessa', 'Vinícius', 'Beatriz', 'Caio', 'Fernanda', 'Gustavo', 'Juliana', 'Leonardo'];
const SOBRENOMES = ['Almeida', 'Barbosa', 'Cardoso', 'Costa', 'Dias', 'Ferreira', 'Gomes', 'Lima', 'Martins', 'Melo', 'Moreira', 'Nascimento', 'Oliveira', 'Pereira', 'Ribeiro', 'Rocha', 'Santos', 'Silva', 'Souza', 'Teixeira'];
const sem = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PRODUTOS = [
  ['Heineken 600ml', 'Cervejas', 18, 8.5, 'Sim'], ['Original 600ml', 'Cervejas', 15, 7], ['Brahma Duplo Malte 600ml', 'Cervejas', 14, 6.5],
  ['Chopp Pilsen 300ml', 'Chopes', 11, 3.2, 'Sim'], ['Chopp Pilsen 500ml', 'Chopes', 16, 5], ['Chopp IPA 400ml', 'Chopes', 22, 7.5],
  ['Caipirinha de limão', 'Drinks', 26, 6, 'Sim'], ['Gin tônica', 'Drinks', 34, 9], ['Negroni', 'Drinks', 36, 11], ['Aperol Spritz', 'Drinks', 32, 10],
  ['Dose de cachaça artesanal', 'Destilados', 14, 4],
  ['Batata frita com cheddar e bacon', 'Petiscos', 42, 13, 'Sim'], ['Bolinho de bacalhau (12 un.)', 'Petiscos', 52, 18], ['Calabresa acebolada', 'Petiscos', 44, 14], ['Torresmo de rolo', 'Petiscos', 39, 11],
  ['Picanha na tábua', 'Pratos', 119, 52, 'Sim'], ['Filé à parmegiana (2 pessoas)', 'Pratos', 89, 34], ['Feijoada completa', 'Pratos', 69, 24],
  ['Pudim de leite', 'Sobremesas', 16, 4],
  ['Refrigerante lata', 'Sem álcool', 7, 3], ['Suco natural', 'Sem álcool', 12, 3.5], ['Água mineral', 'Sem álcool', 5, 1.5],
];
const RECOMPENSAS = [
  ['Chopp Pilsen 300ml', 150, 'Um chopp por conta da casa.'], ['Caipirinha', 300, 'Uma caipirinha de limão de cortesia.'],
  ['Porção de batata frita', 450, 'Batata com cheddar e bacon.'], ['15% de desconto na conta', 800, 'Válido sobre o total da mesa.'],
  ['Picanha na tábua', 1500, 'O prato principal da casa, de cortesia.'],
];
const OBS = ['', '', '', 'Aniversário', 'Mesa perto da janela', 'Cadeira para criança', 'Comemoração de empresa'];
const DESPESAS = [
  ['Compra de bebidas · distribuidora', 'Fornecedores', 1800, 4200], ['Hortifrúti da semana', 'Fornecedores', 380, 760],
  ['Carnes · açougue', 'Fornecedores', 900, 2100], ['Gás de cozinha', 'Fornecedores', 280, 520], ['Manutenção da chopeira', 'Manutenção', 250, 600],
];

/* ---------- execução ---------- */
const stats = { cadastros: 0, reservas: 0, confirmadas: 0, recusadas: 0, vendasApp: 0, vendasBalcao: 0, faturamento: 0, resgates: 0, baixas: 0, despesas: 0, erros: 0 };
const clientes = []; // { id, nome, token }

async function main() {
  const { token: admin } = await call('/crm/login', { method: 'POST', body: { email: args.email, senha: args.senha } });
  log('CRM', 'login do administrador ok');

  // catálogo e parâmetros (só se o banco estiver vazio)
  let produtos = await call('/crm/c/produtos', { token: admin });
  if (!produtos.length) {
    for (const [nome, categoria, preco, custo, destaque] of PRODUTOS) {
      await call('/crm/c/produtos', { method: 'POST', token: admin, body: { nome, categoria, preco, custo, status: 'Ativo', noCardapio: 'Sim', destaque: destaque ?? 'Não', descricao: '' } });
    }
    produtos = await call('/crm/c/produtos', { token: admin });
    log('CRM', `${produtos.length} produtos cadastrados no cardápio`);
  }
  if (!(await call('/crm/c/recompensas', { token: admin })).length) {
    for (const [nome, custo, descricao] of RECOMPENSAS) await call('/crm/c/recompensas', { method: 'POST', token: admin, body: { nome, custo, descricao, status: 'Ativa' } });
    log('CRM', `${RECOMPENSAS.length} recompensas cadastradas`);
  }
  await call('/crm/config', { method: 'PUT', token: admin, body: { horarios: ['18:00', '19:00', '20:00', '21:00', '22:00'], ambientes: ['Salão principal', 'Varanda', 'Balcão'], diasFuncionamento: [0, 2, 3, 4, 5, 6] } });
  const cfg = await call('/crm/config', { token: admin });
  const recompensas = await call('/public/recompensas');

  async function cadastrar() {
    const nome = `${pick(NOMES)} ${pick(SOBRENOMES)}`;
    const email = `${sem(nome).replace(' ', '.')}.${int(100, 999)}@demo.bardodindo.local`;
    const { token } = await call('/app/cadastro', { method: 'POST', body: { nome, email, telefone: `(11) 9${int(1000, 9999)}-${int(1000, 9999)}`, senha: 'demo-' + int(100000, 999999) } });
    const me = await call('/app/me', { token });
    clientes.push({ id: me.cliente.id, nome, token });
    stats.cadastros++;
    log('APP', `novo afilhado #${String(me.cliente.id).padStart(3, '0')} ${nome}`);
  }

  async function reservar() {
    const c = pick(clientes);
    const d = new Date();
    let data;
    for (let i = 0; i < 20; i++) {
      d.setDate(d.getDate() + int(1, 3));
      if (cfg.diasFuncionamento.includes(d.getDay())) { data = iso(d); break; }
    }
    if (!data) return;
    const r = await call('/app/reservas', { method: 'POST', token: c.token, body: { data, hora: pick(cfg.horarios), pessoas: int(2, 8), ambiente: pick(cfg.ambientes), observacoes: pick(OBS) } });
    stats.reservas++;
    log('APP', `${c.nome} pediu reserva para ${r.pessoas} em ${data.split('-').reverse().join('/')} às ${r.hora}`);
  }

  async function analisarReserva() {
    const pend = (await call('/crm/c/reservas', { token: admin })).filter((r) => r.status === 'Pendente');
    if (!pend.length) return;
    const r = pick(pend);
    const status = chance(0.88) ? 'Confirmada' : 'Recusada';
    await call(`/crm/c/reservas/${r.id}`, { method: 'PUT', token: admin, body: { status } });
    stats[status === 'Confirmada' ? 'confirmadas' : 'recusadas']++;
    log('CRM', `reserva de ${r.clienteNome} ${status.toLowerCase()}`);
  }

  async function vender() {
    const itens = [];
    for (let i = 0, n = int(1, 5); i < n; i++) {
      const p = pick(produtos);
      if (!itens.some((x) => x.produtoId === p.id)) itens.push({ produtoId: p.id, quantidade: p.categoria.match(/Cervejas|Chopes|Drinks/) ? int(1, 4) : 1 });
    }
    const valor = itens.reduce((t, i) => t + Number(produtos.find((p) => p.id === i.produtoId).preco) * i.quantidade, 0);
    const forma = pick(['Pix', 'Pix', 'Crédito', 'Crédito', 'Débito', 'Dinheiro']);
    if (clientes.length && chance(0.8)) {
      const c = pick(clientes);
      const consumo = await call('/crm/consumos', { method: 'POST', token: admin, body: { clienteId: c.id, itens, formaPagamento: forma } });
      stats.vendasApp++;
      stats.faturamento += consumo.valor;
      log('VENDA', `${c.nome}: ${brl(consumo.valor)} (+${consumo.pontos} pts) · ${forma}`);
    } else {
      await call('/crm/c/receitas', { method: 'POST', token: admin, body: { data: iso(new Date()), descricao: 'Venda no balcão', categoria: 'Vendas no balcão', formaPagamento: forma, valor } });
      stats.vendasBalcao++;
      stats.faturamento += valor;
      log('VENDA', `balcão (sem cadastro): ${brl(valor)} · ${forma}`);
    }
  }

  async function resgatar() {
    for (const c of [...clientes].sort(() => Math.random() - 0.5)) {
      const me = await call('/app/me', { token: c.token });
      const possiveis = recompensas.filter((r) => r.custo <= me.pontos);
      if (!possiveis.length) continue;
      const rec = pick(possiveis);
      const v = await call('/app/resgates', { method: 'POST', token: c.token, body: { recompensaId: rec.id } });
      stats.resgates++;
      log('APP', `${c.nome} resgatou "${rec.nome}" (${rec.custo} pts) · voucher ${v.codigo}`);
      return;
    }
  }

  async function darBaixa() {
    const disp = (await call('/crm/c/resgates', { token: admin })).filter((r) => r.status === 'Disponível');
    if (!disp.length) return;
    const r = pick(disp);
    await call(`/crm/c/resgates/${r.id}`, { method: 'PUT', token: admin, body: { status: 'Utilizado' } });
    stats.baixas++;
    log('CRM', `voucher ${r.codigo} de ${r.clienteNome} entregue`);
  }

  async function despesa() {
    const [descricao, categoria, min, max] = pick(DESPESAS);
    const venc = new Date();
    venc.setDate(venc.getDate() + int(-2, 20));
    const valor = Math.round(rnd(min, max) * 100) / 100;
    await call('/crm/c/despesas', { method: 'POST', token: admin, body: { descricao, categoria, data: iso(new Date()), vencimento: iso(venc), valor, status: chance(0.4) ? 'Pago' : 'A pagar' } });
    stats.despesas++;
    log('FINANCEIRO', `${descricao}: ${brl(valor)}`);
  }

  const safe = async (fn) => {
    try {
      await fn();
    } catch (e) {
      stats.erros++;
      log('ERRO', e.message);
    }
  };

  // alguns afilhados para começar
  for (let i = 0; i < 6; i++) await safe(cadastrar);

  console.log(`\n>>> Simulando ${TOTAL_VENDAS} vendas em ${SEGUNDOS} segundos...\n`);
  const inicio = Date.now();
  for (let venda = 1; venda <= TOTAL_VENDAS; venda++) {
    await safe(vender);
    if (chance(0.16)) await safe(cadastrar);
    if (chance(0.2)) await safe(reservar);
    if (chance(0.22)) await safe(analisarReserva);
    if (venda > 20 && chance(0.14)) await safe(resgatar);
    if (chance(0.12)) await safe(darBaixa);
    if (chance(0.05)) await safe(despesa);
    // distribui as vendas no tempo pedido, com variação natural
    const alvo = inicio + (venda / TOTAL_VENDAS) * SEGUNDOS * 1000;
    await sleep(Math.max(0, alvo - Date.now() + rnd(-300, 300)));
  }

  console.log('\n===== Resumo da simulação =====');
  console.log(`Duração:              ${Math.round((Date.now() - inicio) / 1000)} s`);
  console.log(`Vendas:               ${stats.vendasApp + stats.vendasBalcao} (${stats.vendasApp} para afilhados, ${stats.vendasBalcao} no balcão)`);
  console.log(`Faturamento:          ${brl(stats.faturamento)}`);
  console.log(`Novos afilhados:      ${stats.cadastros}`);
  console.log(`Reservas:             ${stats.reservas} pedidas, ${stats.confirmadas} confirmadas, ${stats.recusadas} recusadas`);
  console.log(`Resgates:             ${stats.resgates} (${stats.baixas} vouchers entregues)`);
  console.log(`Despesas lançadas:    ${stats.despesas}`);
  console.log(`Erros:                ${stats.erros}`);
}

main().catch((e) => {
  console.error('Falha na simulação:', e.message);
  process.exit(1);
});
