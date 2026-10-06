// Cria, nos emuladores locais, os dados que `scripts/testar-regras.mjs` usa: um afilhado (cliente2@teste.local),
// uma atendente (atendente@teste.local, função só com Atendimento: ver, criar e editar — sem excluir) e uma recompensa.
// Uso (com os emuladores rodando): node scripts/semear-testes.mjs
// Só fala com os emuladores (127.0.0.1); grava passando por cima das regras, como o próprio emulador permite.
const PROJETO = 'demo-bardodindo';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FS = `http://127.0.0.1:8080/v1/projects/${PROJETO}/databases/(default)/documents`;
export const SENHA_CLIENTE = 'senha-cliente-123';
export const SENHA_ATENDENTE = 'senha-atendente-123';
export const SENHA_MARKETING = 'senha-marketing-123';

/** Converte um valor JS para o formato da API REST do Firestore. */
function valor(v) {
  if (v === null) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valor(x)])) } };
  return { stringValue: String(v) };
}
async function gravar(caminho, dados) {
  const r = await fetch(`${FS}/${caminho}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, valor(v)])) }),
  });
  if (!r.ok) throw new Error(`Falha ao gravar ${caminho}: ${r.status} ${await r.text()}`);
}
async function conta(email, senha) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=teste`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Falha ao criar ${email}: ${JSON.stringify(d)}`);
  return d.localId;
}

const agora = new Date().toISOString();
const cliente = await conta('cliente2@teste.local', SENHA_CLIENTE);
const atendente = await conta('atendente@teste.local', SENHA_ATENDENTE);
const marketing = await conta('marketing@teste.local', SENHA_MARKETING);

await gravar('meta/setup', { feitoEm: agora });
await gravar('meta/contadores', { clientes: 2 });
await gravar('funcoes/atendente', { nome: 'Atendente', descricao: 'Salão', permissoes: { atd: ['ver', 'criar', 'editar'] }, sistema: false, criadoEm: agora });
// função no formato antigo, de antes de Vendas sair de Marketing: "view" em Marketing
await gravar('funcoes/marketing', { nome: 'Marketing (antiga)', descricao: '', permissoes: { mkt: 'view' }, sistema: false, criadoEm: agora });
await gravar(`usuarios/${marketing}`, { nome: 'Marketing Teste', email: 'marketing@teste.local', funcaoId: 'marketing', status: 'Ativo', criadoEm: agora });
await gravar('produtos/chopp', { nome: 'Chopp', categoria: 'Chopes', preco: 12, status: 'Ativo', criadoEm: agora });
await gravar(`usuarios/${atendente}`, { nome: 'Atendente Teste', email: 'atendente@teste.local', funcaoId: 'atendente', status: 'Ativo', criadoEm: agora });
await gravar(`clientes/${cliente}`, { numero: 2, nome: 'Cliente Teste', email: 'cliente2@teste.local', telefone: '', criadoEm: agora });
await gravar(`saldos/${cliente}`, { acumulados: 0, usados: 0 });
await gravar('recompensas/chopp', { nome: 'Chopp grátis', descricao: '', custo: 50, status: 'Ativa', criadoEm: agora });
console.log('Dados de teste criados nos emuladores.');
