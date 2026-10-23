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
  arrayRemove, arrayUnion, collection, connectFirestoreEmulator, doc, getDoc, getDocs, increment, initializeFirestore, limit, onSnapshot, orderBy, persistentLocalCache, persistentMultipleTabManager, query, runTransaction, where, writeBatch,
  type DocumentReference, type Query, type WriteBatch,
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

/**
 * Permissões por módulo (uma por tela ou cadastro). Cada módulo pertence a uma área antiga (departamento/setor):
 * funções gravadas antes da separação, sem o módulo, continuam valendo pela área (e Vendas, por Marketing).
 * Igual a `pai()` em firestore.rules.
 */
export const PAI_DO_MODULO: Record<string, string> = {
  painel: 'dir', metas: 'dir',
  reservas: 'atd', consumos: 'atd', resgates: 'atd', eventos: 'atd', caixas: 'atd', comandas: 'atd', mesas: 'atd',
  produtos: 'vnd', fichas: 'vnd', guarnicoes: 'vnd', clientes: 'vnd', qrcode: 'vnd',
  recompensas: 'mkt', criacao: 'mkt', midias: 'mkt', publicidade: 'mkt',
  projetos: 'dp', estoque: 'dp', materiais: 'dp', patrimonio: 'dp', compras: 'dp',
  terceirizados: 'adm', fornecedores: 'adm', precos: 'adm', contratos: 'adm',
  qualidade: 'fis', atestados: 'fis', naoconformidades: 'fis',
  receitas: 'fin', despesas: 'fin', despesas_variaveis: 'fin', despesas_fixas: 'fin', resultado: 'fin', ticket: 'fin', renda: 'fin',
  acoes: 'fin', creditos: 'fin', docfin: 'fin', relatorios: 'fin', arquivos: 'fin', investimentos: 'fin',
  colaboradores: 'rh', prestadores: 'rh', prestadores_pj: 'rh', folha: 'rh', ferias: 'rh', afastamentos: 'rh', conduta: 'rh',
  consultoria: 'jur', trabalhista: 'jur', advogados: 'jur', advogados_trabalhista: 'jur', advogados_empresarial: 'jur',
  normas: 'jur', normas_trabalhista: 'jur', normas_empresarial: 'jur',
  logs: 'ti', chamados: 'ti', equipamentos: 'ti',
  usuarios: 'cfg', funcoes: 'cfg', parametros: 'cfg',
};
/**
 * Telas que mostram uma parte de um cadastro (ex.: só as despesas fixas) têm permissão própria; funções gravadas antes
 * dessa separação não têm a tela: vale a do cadastro (módulo base). Igual a `base()` em firestore.rules.
 */
export const BASE_DA_PAGINA: Record<string, string> = {
  fichas: 'produtos', despesas_variaveis: 'despesas', despesas_fixas: 'despesas', ticket: 'resultado', renda: 'resultado',
  relatorios: 'docfin', prestadores_pj: 'prestadores', afastamentos: 'ferias',
  advogados_trabalhista: 'advogados', advogados_empresarial: 'advogados', normas_trabalhista: 'normas', normas_empresarial: 'normas',
};
/** Telas de cada cadastro: quem tem alguma delas usa o cadastro (o banco libera o cadastro inteiro; cada tela mostra a sua parte). */
export const PAGINAS_DA_COLECAO: Record<string, string[]> = Object.entries(BASE_DA_PAGINA)
  .reduce<Record<string, string[]>>((m, [pg, base]) => ((m[base] ??= [base]).push(pg), m), {});
/** Áreas antigas que herdaram permissões de outra (Vendas foi separada de Marketing). */
const LEGADO: Record<string, string> = { vnd: 'mkt' };
export const MODULOS = Object.keys(PAI_DO_MODULO).concat('mon');
/** Coleções do CRM e o módulo (permissão) que cada uma exige: o próprio cadastro. */
const COLLECTIONS: Record<string, string> = Object.fromEntries(
  ['metas', 'colaboradores', 'ferias', 'projetos', 'estoque', 'materiais', 'patrimonio', 'compras', 'terceirizados', 'fornecedores', 'contratos', 'precos',
    'receitas', 'despesas', 'reservas', 'consumos', 'resgates', 'criacao', 'midias', 'recompensas', 'produtos', 'guarnicoes',
    'trabalhista', 'consultoria', 'qualidade', 'naoconformidades', 'funcoes',
    'eventos', 'publicidade', 'atestados', 'acoes', 'creditos', 'docfin', 'arquivos', 'investimentos', 'prestadores', 'conduta', 'advogados', 'normas', 'chamados', 'equipamentos',
    'caixas', 'comandas', 'mesas',
  ].map((c) => [c, c]),
);
/** Permissões que uma função marca em cada área. */
type Acao = 'ver' | 'criar' | 'editar' | 'excluir';
const ACOES: Acao[] = ['ver', 'criar', 'editar', 'excluir'];
/** Aceita o formato antigo (um nível por área): "edit" vale todas as permissões e "view" só ver. */
function acoesDe(p: unknown): Acao[] {
  if (Array.isArray(p)) return ACOES.filter((a) => p.includes(a));
  if (p === 'edit') return [...ACOES];
  if (p === 'view') return ['ver'];
  return [];
}
/**
 * Páginas criadas depois que as funções já existiam: sem a permissão gravada, valem as da página mais próxima
 * (quem lança consumo usa o caixa e as comandas; quem cuida das reservas, o mapa de mesas). Igual a `irma()` em firestore.rules.
 */
export const IRMA_DA_PAGINA: Record<string, string> = { caixas: 'consumos', comandas: 'consumos', mesas: 'reservas', qrcode: 'clientes' };
const AREAS = ['dir', 'atd', 'vnd', 'mkt', 'rh', 'dp', 'adm', 'fin', 'jur', 'fis', 'mon', 'ti', 'cfg'];
/** Permissões de um módulo: as do próprio módulo; sem elas, as da área a que ele pertence (formato antigo). */
export function permissaoDe(perm: Record<string, unknown>, k: string): unknown {
  const base = BASE_DA_PAGINA[k] ?? k;
  for (const chave of [k, IRMA_DA_PAGINA[k], base, PAI_DO_MODULO[base], LEGADO[PAI_DO_MODULO[base] ?? ''], LEGADO[k]]) if (chave && chave in perm) return perm[chave];
  return undefined;
}

/** Nome da função de sistema (acesso total). Antes se chamava "Administrador": o nome gravado é trocado ao exibir. */
export const PRESIDENCIA = 'Presidência';
const comNomeDaFuncao = (f: Dados) => (f.sistema ? { ...f, nome: PRESIDENCIA } : f);

/** Como cada registro é citado no painel de atualizações ("cadastrou o produto …"). */
const REGISTRO: Record<string, string> = {
  metas: 'a meta', colaboradores: 'o colaborador', ferias: 'o registro de férias/afastamento',
  projetos: 'o projeto', estoque: 'o item de estoque', materiais: 'o material', patrimonio: 'o bem patrimonial', compras: 'a nota de compra',
  terceirizados: 'o serviço terceirizado', fornecedores: 'o fornecedor', contratos: 'o contrato', precos: 'o preço de fornecedor',
  receitas: 'a receita', despesas: 'a despesa',
  reservas: 'a reserva', consumos: 'o consumo', resgates: 'o voucher',
  criacao: 'a peça', midias: 'a publicação', produtos: 'o produto', guarnicoes: 'o item fixo da ficha técnica', recompensas: 'a recompensa',
  trabalhista: 'o processo trabalhista', consultoria: 'a demanda de consultoria',
  qualidade: 'a inspeção', naoconformidades: 'a não conformidade',
  funcoes: 'a função',
  eventos: 'o evento', publicidade: 'a campanha', atestados: 'o atestado',
  acoes: 'a participação', creditos: 'o crédito', docfin: 'o documento', arquivos: 'o arquivo', investimentos: 'o investimento',
  prestadores: 'o contratado', conduta: 'o manual de conduta',
  advogados: 'o advogado', normas: 'a norma',
  chamados: 'o chamado', equipamentos: 'o equipamento',
  caixas: 'o caixa', comandas: 'a comanda', mesas: 'a mesa',
};
/** Nome legível de um registro qualquer, para o painel de atualizações. */
function nomeDe(d: Dados | null | undefined) {
  if (!d) return '';
  for (const k of ['nome', 'titulo', 'campanha', 'descricao', 'assunto', 'tema', 'item', 'servico', 'processo', 'colaborador', 'clienteNome', 'recompensa', 'instituicao', 'documento', 'codigo', 'insumo']) {
    const v = d[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
  }
  return '';
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Valor em dinheiro do registro, quando houver (receitas, despesas, consumos, contratos…). */
const valorDe = (d: Dados) => (typeof d.valor === 'number' && d.valor > 0 ? brl(d.valor) : '');

/** Cadastros que podem lançar despesas no DRE (o mesmo conjunto vale em `firestore.rules`) e como aparecem na origem da despesa. */
const ORIGENS_DESPESA: Record<string, string> = {
  terceirizados: 'Serviços terceirizados', contratos: 'Contratos', midias: 'Gestão de mídias', projetos: 'Projetos', compras: 'Entrada de notas',
};
const VALOR_MAXIMO_DESPESA = 1_000_000;
/** Sugestões para o preparo na ficha técnica, além do que estiver em Materiais (Estrutura). */
const SUGESTOES_COPOS = [
  'Copo long drink', 'Copo old fashioned', 'Copo americano', 'Copo shot', 'Taça de gin', 'Taça de vinho', 'Taça martini',
  'Taça coupé', 'Taça de champanhe', 'Caneca de chope', 'Tulipa', 'Copo de caipirinha', 'Jarra',
];
const SUGESTOES_UTENSILIOS = [
  'Coqueteleira', 'Mixing glass', 'Bailarina', 'Dosador (jigger)', 'Socador', 'Peneira (strainer)', 'Coador fino',
  'Liquidificador', 'Espremedor', 'Pinça', 'Faca e tábua', 'Descascador', 'Maçarico',
];
const PARECE_COPO = /copo|ta[cç]a|caneca|tulipa|jarra|x[ií]cara|cumbuca/i;
const PARECE_UTENSILIO = /coqueteleira|shaker|mixing|bailarina|dosador|jigger|socador|pilão|peneira|strainer|coador|liquidificador|espremedor|pin[cç]a|faca|t[aá]bua|descascador|ma[cç]arico|abridor|saca-rolha|colher|funil|ralador/i;
/** Unidades de medida que a ficha técnica converte entre si (ml/L e g/kg). */
const MEDIDAS = ['ml', 'L', 'g', 'kg'];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Data AAAA-MM-DD que existe no calendário (31/02 e mês 13 não passam). */
function dataValida(v: string) {
  const t = DATA_ISO.test(v) ? Date.parse(`${v}T00:00:00Z`) : NaN;
  return !Number.isNaN(t) && new Date(t).toISOString().startsWith(v);
}

type TabelaPontos = { faixasPontos: { ate: number; pontos: number }[]; pontosAcima: number };
/** Pontos pela tabela de Parâmetros: a primeira faixa cujo limite cobre o preço; acima da última, `pontosAcima`. */
function pontosPelaTabela(preco: number, t: TabelaPontos) {
  const faixa = [...(t.faixasPontos ?? [])].sort((a, b) => a.ate - b.ate).find((f) => preco <= f.ate);
  return Math.floor(Number(faixa ? faixa.pontos : t.pontosAcima) || 0);
}
/** Pontos personalizados do produto (caixinha marcada no cadastro), ou null para seguir a tabela. */
function pontosProprios(p: Dados) {
  const n = Number(p.pontos);
  return p.pontuacaoPersonalizada === 'Sim' && p.pontos !== undefined && p.pontos !== null && p.pontos !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
/** Pontos que cada unidade do produto dá ao afilhado: os personalizados do produto ou os da tabela pelo preço. */
function pontosDoProduto(p: Dados, t: TabelaPontos) {
  return pontosProprios(p) ?? pontosPelaTabela(Number(p.preco) || 0, t);
}
/** Pontos de uma venda: soma dos pontos de cada item × quantidade. */
function pontosDosItens(itens: Dados[]) {
  return itens.reduce((s, i) => s + (Number(i.pontos) || 0) * (Number(i.quantidade) || 0), 0);
}

/** Pergunta do questionário do afilhado (igual em src/store.tsx e crm/src/lib/session.tsx). */
export type Pergunta = { id: string; texto: string; opcoes: string[]; multipla?: boolean };
const DEFAULT_CONFIG = {
  nomeEstabelecimento: 'Bar do Dindo',
  /** Pontos de cada unidade vendida pelo preço do produto (quando ele não tem pontuação personalizada). */
  faixasPontos: [
    { ate: 10, pontos: 5 },
    { ate: 20, pontos: 10 },
    { ate: 30, pontos: 15 },
    { ate: 40, pontos: 20 },
    { ate: 50, pontos: 25 },
    { ate: 60, pontos: 30 },
  ],
  /** Pontos dos produtos mais caros que a última faixa. */
  pontosAcima: 35,
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
  // questionário opcional do afilhado, respondido no pré-cadastro e no app depois do cadastro (editável no Cérebro, em Parâmetros).
  // Pergunta sem opções é de texto livre; a opção "Outro" abre um campo para escrever; "multipla" deixa marcar várias.
  // versao: ao trocar as perguntas padrão, subir o número faz o questionário salvo antes voltar para as novas.
  questionario: {
    versao: 3, ativo: true, titulo: 'Questionário do afilhado',
    perguntas: [
      { id: 'sobre', texto: 'Nós do Bar do Dindo estamos criando um espaço acolhedor e aconchegante com cerveja artesanal, drinks, música boa, televisão para eventos, bem como karaokê e videogame. Tudo pensando nos nossos afilhados. Portanto, comece contando um pouco de você e por que se “afilhiou” ao Bar do Dindo.', opcoes: [] },
      { id: 'olaria', texto: 'Como você conheceu o Nova Olaria Mall, na Cidade Baixa?', opcoes: ['Já conhecia pela Cidade Baixa', 'Indicação de amigos', 'Redes sociais', 'Outro'] },
      { id: 'conheceu', texto: 'Como você conheceu o Bar do Dindo?', multipla: true, opcoes: ['Redes sociais', 'Indicação de amigos', 'Indicação do Dindo', 'Já conhecia pela Cidade Baixa', 'Outro'] },
      { id: 'pedido', texto: 'O que você mais gosta de pedir no Bar do Dindo?', multipla: true, opcoes: ['Cerveja artesanal', 'Drinks clássicos e autorais', 'Petiscos', 'Doses', 'Bebidas não alcoólicas', 'Outro'] },
      { id: 'frequencia', texto: 'Com que frequência você costuma sair para bares e festas?', opcoes: ['Mais de 1x por semana', '1x por semana', 'Algumas vezes por mês', 'Raramente'] },
      { id: 'dia', texto: 'Quais seus dias preferidos para sair?', multipla: true, opcoes: ['Seg a qua', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] },
      { id: 'eventos', texto: 'Quais eventos você gostaria de ver no Bar do Dindo?', multipla: true, opcoes: ['Música ao vivo', 'Futebol no telão', 'Happy hour', 'Karaokê', 'Noites temáticas', 'Filmes e séries no telão', 'Promoções de chopp e drinks', 'Videogame', 'Outro'] },
      { id: 'novidades', texto: 'Como prefere receber novidades e promoções?', multipla: true, opcoes: ['WhatsApp', 'Instagram', 'E-mail', 'Só pelo aplicativo'] },
      { id: 'musica', texto: 'Quais estilos musicais não podem faltar na playlist do Bar do Dindo?', multipla: true, opcoes: ['Sertanejo', 'Samba e pagode', 'Rock', 'Pop', 'MPB', 'Funk', 'Eletrônica', 'Outro'] },
      { id: 'sugestao', texto: 'Agora que você já se tornou um afilhado do Bar do Dindo e conhece nossa proposta, nos diga, nas suas próprias palavras, qualquer conselho, sugestão ou feedback que ache interessante a ponto de agregar à comunidade. Contamos com você, afilhado(a)!', opcoes: [] },
    ] as Pergunta[],
  },
};

/** Perguntas padrão do questionário do afilhado (o Cérebro oferece voltar para elas). */
export const QUESTIONARIO_PADRAO = DEFAULT_CONFIG.questionario;

/* ---------- utilitários ---------- */
/** CPF só com os dígitos, conferindo os dois dígitos verificadores (e recusando 000.000.000-00, 111… etc.). */
export function cpfValido(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return null;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]) ? d : null;
}
/** Idade completa em anos numa data AAAA-MM-DD (ou null se a data for inválida). */
export function idadeEm(nascimento: unknown, hoje = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(nascimento ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || dt > hoje) return null;
  let idade = hoje.getFullYear() - y;
  if (hoje.getMonth() + 1 < mo || (hoje.getMonth() + 1 === mo && hoje.getDate() < d)) idade--;
  return idade;
}
/** Programa de afilhados: só maiores de 18 anos, com CPF válido. */
function conferirDocumentos(b: Dados) {
  const cpf = cpfValido(b.cpf);
  if (!cpf) fail(400, 'Informe um CPF válido.');
  const idade = idadeEm(b.nascimento);
  if (idade === null || idade > 120) fail(400, 'Informe sua data de nascimento.');
  if (idade! < 18) fail(403, 'O programa de afilhados é exclusivo para maiores de 18 anos.');
  return { cpf: cpf!, nascimento: String(b.nascimento) };
}
const mascaraCpf = (cpf: unknown) => { const d = String(cpf ?? ''); return d.length === 11 ? `***.${d.slice(3, 6)}.***-${d.slice(9)}` : ''; };
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
    // foto do registro: imagem já reduzida no navegador (data URL), com limite de tamanho
    if (k === 'foto' && typeof v === 'string' && v) {
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(v)) fail(400, 'Imagem inválida.');
      if (v.length > 400_000) fail(413, 'Imagem muito grande.');
      continue;
    }
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
  // o app recebe o CPF mascarado; o cadastro está completo quando tem CPF e data de nascimento (exigidos desde o lançamento)
  cpf: mascaraCpf(c.cpf), nascimento: c.nascimento ?? '', cadastroCompleto: !!c.cpf && !!c.nascimento,
  respostas: c.respostas ?? null, via: c.via ?? '',
});
const publicUsuario = (u: Dados) => ({
  id: u.id, nome: u.nome, email: u.email, funcaoId: u.funcaoId, status: u.status, ultimoAcesso: u.ultimoAcesso ?? null, criadoEm: u.criadoEm,
  telefone: u.telefone ?? '', nascimento: u.nascimento ?? '', sobre: u.sobre ?? '', foto: u.foto ?? null,
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

/* ---------- anexos (PDF) dos cadastros ----------
 * O arquivo fica fora do registro, em `anexos/{id}` + `anexos/{id}/partes/{n}` (o Firestore aceita até 1 MB por documento),
 * e o registro guarda só a lista com nome e tamanho: abrir a tabela não baixa nenhum PDF. */
/** Cadastros que aceitam PDF (currículo, contratos, notas fiscais, laudos…). Igual a `colecoesComAnexo()` em firestore.rules. */
export const COM_ANEXOS = [
  'metas', 'colaboradores', 'ferias', 'projetos', 'materiais', 'patrimonio', 'compras', 'terceirizados', 'fornecedores', 'contratos',
  'receitas', 'despesas', 'criacao', 'trabalhista', 'consultoria', 'qualidade', 'naoconformidades',
  'publicidade', 'atestados', 'acoes', 'creditos', 'docfin', 'arquivos', 'investimentos', 'prestadores', 'conduta', 'advogados', 'normas', 'equipamentos',
];
export const ANEXO_MAX_BYTES = 5 * 1024 * 1024;
export const ANEXOS_POR_REGISTRO = 10;
/** Tamanho de cada parte do arquivo (em caracteres base64). */
const ANEXO_PARTE = 900_000;
interface Anexo { id: string; nome: string; tamanho: number; partes: number; criadoEm: string }
interface AnexoNovo { nome: string; tamanho: number; dados: string }

const anexosDe = (d: Dados | null | undefined): Anexo[] => (Array.isArray(d?.anexos) ? d.anexos : []);

/** PDFs enviados pelo formulário: `dados` é o arquivo em base64 (sem o prefixo "data:"). */
function validarAnexosNovos(v: unknown): AnexoNovo[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return fail(400, 'Anexos inválidos.');
  return v.map((a: Dados) => {
    const dados = typeof a?.dados === 'string' ? a.dados : '';
    // "%PDF" em base64 começa com "JVBER"
    if (!dados.startsWith('JVBER') || !/^[A-Za-z0-9+/]+={0,2}$/.test(dados)) fail(400, 'Só é possível anexar arquivos PDF.');
    const tamanho = Math.floor((dados.length * 3) / 4) - (dados.endsWith('==') ? 2 : dados.endsWith('=') ? 1 : 0);
    if (tamanho > ANEXO_MAX_BYTES) fail(413, `O PDF "${str(a.nome, 80)}" passa de 5 MB.`);
    let nome = str(a.nome, 150).replace(/[\\/]/g, '-') || 'documento';
    if (!/\.pdf$/i.test(nome)) nome += '.pdf';
    return { nome, tamanho, dados };
  });
}
/** Separa os campos de anexo do corpo da requisição (o resto segue para o registro). */
function separarAnexos(b: Dados) {
  const { anexos, anexosNovos, ...resto } = b ?? {};
  return { resto, manter: Array.isArray(anexos) ? new Set(anexos.map((a: Dados) => String(a?.id ?? a))) : null, novos: validarAnexosNovos(anexosNovos) };
}

export function createBackend(kind: 'app' | 'crm', instancia: string = kind) {
  // cada sistema tem a própria sessão, mesmo quando abertos no mesmo navegador
  // (`instancia` permite várias sessões no mesmo processo, ex.: roteiros de teste com vários afilhados)
  const app = initializeApp(firebaseConfig, instancia);
  const auth = getAuth(app);
  auth.languageCode = 'pt-BR'; // e-mails do Firebase (ex.: redefinição de senha) em português
  // VITE_LONG_POLLING=1 só em builds locais de teste atrás de proxy, onde a conexão contínua do Firestore não passa
  // cópia local no aparelho (IndexedDB), compartilhada entre as abas: ao recarregar a página ou abrir outra aba, as
  // consultas retomam de onde pararam e o Firestore só cobra os registros que mudaram (até 30 min sem conexão),
  // em vez de ler as coleções inteiras de novo. Sem IndexedDB (Node, roteiros de teste) ou nos emuladores, só memória.
  const cacheLocal = !EMULADOR && typeof indexedDB !== 'undefined' ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) } : {};
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true, ...cacheLocal, ...(import.meta.env.VITE_LONG_POLLING === '1' ? { experimentalForceLongPolling: true } : {}) });
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

  // a primeira resposta só vale quando vem do servidor: a cópia local pode estar desatualizada (ex.: um saldo que o
  // cliente mudou pelo app depois da última gravação feita daqui). Sem resposta do servidor em 2,5 s, usa a cópia local.
  function vigiar<T>(chave: string, iniciar: (ok: (v: T, doServidor: boolean) => void, erro: (e: Error) => void) => () => void): Promise<T> {
    let v = vigias.get(chave);
    if (!v) {
      let primeiro = true;
      let resolver!: () => void, rejeitar!: (e: Error) => void;
      const novo: Vigia = { valor: undefined, pronto: new Promise<void>((a, b) => { resolver = a; rejeitar = b; }), parar: () => undefined };
      vigias.set(chave, novo);
      let espera: ReturnType<typeof setTimeout> | undefined;
      const pronto = () => { if (primeiro) { primeiro = false; clearTimeout(espera); resolver(); } };
      const erro = (e: Error) => {
        if (vigias.get(chave) === novo) vigias.delete(chave);
        if (primeiro) { primeiro = false; clearTimeout(espera); rejeitar(e); } else versao++;
      };
      const desligar = iniciar(
        (valor, doServidor) => {
          novo.valor = valor;
          if (!primeiro) versao++;
          else if (doServidor) pronto();
          else espera ??= setTimeout(pronto, 2500);
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
    vigiar<Dados[]>(chave, (ok, erro) => onSnapshot(q, { includeMetadataChanges: true }, (s) => ok(ordenar(s.docs.map((d) => ({ ...d.data(), id: d.id }))), !s.metadata.fromCache), erro));
  const documento = (caminho: string) =>
    vigiar<Dados | null>(caminho, (ok, erro) => onSnapshot(doc(db, caminho), { includeMetadataChanges: true }, (s) => ok(s.exists() ? { ...s.data(), id: s.id } : null, !s.metadata.fromCache), erro));
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
    const cfg = { ...DEFAULT_CONFIG, ...salvo };
    // questionário salvo sem perguntas (antes de existir o padrão) ou de uma versão anterior das perguntas padrão volta para as padrão
    if (!cfg.questionario?.perguntas?.length || !(cfg.questionario.versao >= DEFAULT_CONFIG.questionario.versao)) cfg.questionario = DEFAULT_CONFIG.questionario;
    return cfg;
  }

  /* ---------- contas (Firebase Auth) ---------- */
  const EMAIL_COM_CONTA = 'Este e-mail já tem uma conta no Bar do Dindo (de um cadastro anterior), com outra senha. Use a senha de antes ou toque em "Esqueci minha senha" para criar uma nova.';
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
  // última confirmação no servidor de que o afilhado não tem registro (o app pergunta /app/versao a cada 1 s)
  const semRegistro = new Map<string, number>();
  async function requireCliente() {
    const u = auth.currentUser;
    if (!u) return fail(401, 'Sessão expirada. Entre novamente.');
    // o cache pode ainda dizer "não existe" logo após o cadastro de quem já tinha conta (ex.: alguém da equipe): confirma no
    // servidor, no máximo a cada 30 s. Sem esse limite, um afilhado apagado com o app aberto gastava 1 leitura por segundo.
    let c = await documento(`clientes/${u.uid}`);
    if (!c && Date.now() - (semRegistro.get(u.uid) ?? 0) > 30000) {
      c = await getDoc(doc(db, 'clientes', u.uid)).then((s) => (s.exists() ? ({ ...s.data(), id: s.id } as Dados) : null));
      if (!c) semRegistro.set(u.uid, Date.now());
    }
    if (!c) return fail(401, 'Sessão expirada. Entre novamente.');
    return { uid: u.uid, c };
  }
  async function requireUsuario() {
    const u = auth.currentUser;
    if (!u) return fail(401, 'Sessão expirada. Entre novamente.');
    const usuario = await documento(`usuarios/${u.uid}`);
    if (!usuario || usuario.status !== 'Ativo') return fail(401, 'Sessão expirada. Entre novamente.');
    const funcao = await documento(`funcoes/${usuario.funcaoId}`);
    // a Presidência (função de sistema) sempre tem acesso total, inclusive a áreas novas
    // permissões da função, área por área; a Presidência (função de sistema) tem todas, inclusive em áreas novas
    // Vendas foi separada de Marketing: sem permissões próprias para Vendas, valem as de Marketing
    const perm = (funcao?.permissoes ?? {}) as Dados;
    const acoes = (area: string): string[] => (funcao?.sistema ? [...ACOES] : acoesDe(permissaoDe(perm, area)));
    return {
      usuario, funcao, acoes,
      access: (area: string): string => (!acoes(area).includes('ver') ? 'none' : acoes(area).length > 1 ? 'edit' : 'view'),
    };
  }
  type Ctx = Awaited<ReturnType<typeof requireUsuario>>;
  function requireAccess(ctx: Ctx, area: string, acao: Acao) {
    if (!ctx.acoes(area).includes(acao)) fail(403, semPermissao);
  }
  /** Acesso a um cadastro: vale qualquer tela dele (ex.: despesas fixas, variáveis ou lançamento). */
  function requireColecao(ctx: Ctx, col: string, acao: Acao) {
    requireAnyAccess(ctx, PAGINAS_DA_COLECAO[collectionArea(col)] ?? [collectionArea(col)], acao);
  }
  /** Exige acesso em pelo menos uma das áreas informadas. */
  function requireAnyAccess(ctx: Ctx, areas: string[], acao: Acao) {
    if (!areas.some((area) => ctx.acoes(area).includes(acao))) fail(403, semPermissao);
  }


  /* ---------- painel de atualizações ----------
   * Cada alteração feita no CRM grava, no mesmo lote, quem fez o quê e quando.
   * Fica em `atividades/{área}/itens`, para que cada pessoa veja só o que é das áreas que ela acessa. */
  interface ExtraAtividade {
    colecao?: string; alvo?: string; detalhe?: string;
    /** Histórico detalhado (Logs de alterações): o registro, os valores de antes e de depois e o que ficou de fora. */
    registroId?: string; antes?: Dados; depois?: Dados; omitidos?: string[];
    /** Esta atividade desfaz outra (id da atividade desfeita). */
    desfaz?: string;
  }
  function registrar(lote: WriteBatch, ctx: Ctx, area: string, acao: string, extra: ExtraAtividade = {}) {
    lote.set(doc(collection(db, 'atividades', area, 'itens')), {
      area, acao: str(acao, 120), colecao: extra.colecao ?? '', alvo: str(extra.alvo, 160), detalhe: str(extra.detalhe, 300),
      usuarioId: ctx.usuario.id, usuarioNome: ctx.usuario.nome, criadoEm: now(),
      ...(extra.registroId ? { registroId: extra.registroId } : {}),
      ...(extra.antes ? { antes: extra.antes } : {}),
      ...(extra.depois ? { depois: extra.depois } : {}),
      ...(extra.omitidos?.length ? { omitidos: extra.omitidos.slice(0, 50) } : {}),
      ...(extra.desfaz ? { desfaz: extra.desfaz } : {}),
    });
  }

  /* ---------- histórico detalhado ---------- */
  // campos que não entram no histórico: controle interno, ou grandes demais (foto, PDFs) — esses não voltam ao desfazer
  const SEM_HISTORICO = ['atualizadoEm', 'id'];
  const NAO_VOLTAM = ['foto', 'anexos', 'anexosNovos'];
  /** Valores de um registro para o histórico: tira o que é grande demais e anota o que ficou de fora. */
  function paraHistorico(d: Dados, chaves?: string[]) {
    const valores: Dados = {}, omitidos: string[] = [];
    for (const k of chaves ?? Object.keys(d)) {
      if (SEM_HISTORICO.includes(k)) continue;
      const v = d[k] === undefined ? null : d[k];
      if (NAO_VOLTAM.includes(k) || JSON.stringify(v).length > 6000) { omitidos.push(k); continue; }
      valores[k] = v;
      if (Object.keys(valores).length >= 90) break;
    }
    return { valores, omitidos };
  }
  const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  /** O que mudou numa alteração: os campos do patch com valor diferente do atual. */
  function diferencas(cur: Dados, patch: Dados) {
    const chaves = Object.keys(patch).filter((k) => !SEM_HISTORICO.includes(k) && !igual(cur[k], patch[k]));
    const a = paraHistorico(cur, chaves), d = paraHistorico(patch, chaves);
    return { antes: a.valores, depois: d.valores, omitidos: [...new Set([...a.omitidos, ...d.omitidos])] };
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
    return { nomeEstabelecimento: c.nomeEstabelecimento, horarios: c.horarios, ambientes: c.ambientes, diasFuncionamento: c.diasFuncionamento, antecedenciaMinutos: c.antecedenciaMinutos, faixasPontos: c.faixasPontos, pontosAcima: c.pontosAcima, niveis: c.niveis, questionario: c.questionario };
  });
  rota('GET', '/public/cardapio', async () => {
    const [itens, cfg] = await Promise.all([colecao('cardapio'), getConfig()]);
    return itens
      .map((p) => ({
        id: p.id, nome: p.nome, categoria: p.categoria, descricao: p.descricao ?? '', preco: Number(p.preco) || 0, destaque: p.destaque === true,
        // o cardápio guarda só os pontos personalizados; os demais saem da tabela pelo preço
        pontos: p.pontos !== undefined && p.pontos !== null ? Number(p.pontos) || 0 : pontosPelaTabela(Number(p.preco) || 0, cfg),
        foto: typeof p.foto === 'string' ? p.foto : '', teor: Number(p.teor) || 0,
        perfil: (p.perfil ?? {}) as Record<string, number>, notas: Array.isArray(p.notas) ? p.notas : [],
        resumo: typeof p.resumo === 'string' ? p.resumo : '', ingredientes: Array.isArray(p.ingredientes) ? p.ingredientes : [],
      }))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  });
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
    if (!tel) fail(400, 'Informe o celular completo, com DDD.');
    const { cpf, nascimento } = conferirDocumentos(b);
    if (b.aceite !== true) fail(400, 'É preciso aceitar o uso dos dados para participar do programa.');
    // apagar afilhados (ou zerar o sistema) remove o cadastro; a conta de login só some com a limpeza automática (scripts/limpar-contas.mjs)
    const { cred, nova } = await criarConta(email, senha, EMAIL_COM_CONTA);
    const uid = cred.user.uid;
    try {
      if (!nova && (await getDoc(doc(db, 'clientes', uid))).exists()) fail(409, 'Este e-mail já está cadastrado. Entre com ele para ver o seu número.');
      // o número de afilhado é sequencial: sai do contador na mesma transação que cria o cadastro
      await runTransaction(db, async (t) => {
        const contadores = doc(db, 'meta/contadores');
        const numero = (Number((await t.get(contadores)).data()?.clientes) || 0) + 1;
        t.set(contadores, { clientes: numero }, { merge: true });
        t.set(doc(db, 'clientes', uid), {
          numero, nome, email: cred.user.email ?? email, telefone: tel, foto: null, criadoEm: now(), origem, aceiteEm: b.aceite === true ? now() : null,
          cpf, nascimento, ...(b.via === 'qr' ? { via: 'QR Code' } : {}),
        });
        // um CPF, um afilhado: o registro do CPF só pode ser criado uma vez (as regras recusam se já existir)
        t.set(doc(db, 'cpfs', cpf), { uid });
        t.set(doc(db, 'saldos', uid), { acumulados: 0, usados: 0, ultimoResgate: '' });
      });
    } catch (e) {
      if (nova) await cred.user.delete().catch(() => undefined);
      await sair();
      // o único bloqueio possível aqui, para quem acabou de criar a conta, é o CPF já cadastrado
      if (codigo(e) === 'permission-denied') fail(409, 'Este CPF já está cadastrado no programa. Entre com o e-mail usado no cadastro.');
      throw e;
    }
    return { token: uid };
  });
  rota('POST', '/app/login', async ({ b }) => {
    const { user } = await entrar(str(b.email, 160), String(b.senha ?? ''));
    if (!(await getDoc(doc(db, 'clientes', user.uid))).exists()) {
      await sair();
      fail(404, 'Não encontramos um cadastro de afilhado com este e-mail. Faça o cadastro com ele e esta mesma senha.');
    }
    return { token: user.uid };
  });
  /* app: esqueci a senha. Não diz se o e-mail tem conta; o link do e-mail cria a nova senha */
  rota('POST', '/app/redefinir-senha', async ({ b }) => {
    const email = str(b.email, 160).toLowerCase();
    if (!emailOk(email)) fail(400, 'Informe o seu e-mail para receber o link.');
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (e) {
      if (!['auth/user-not-found', 'auth/invalid-email'].includes(codigo(e))) throw e;
    }
    return { ok: true };
  });
  rota('POST', '/app/logout', async () => { await sair(); return { ok: true }; });
  /* app: sinal de mudança (os dados já chegam ao vivo do Firestore; o app só pergunta se algo mudou, sem leituras extras) */
  rota('GET', '/app/versao', async () => { await requireCliente(); return { versao }; });
  rota('GET', '/app/me', async () => {
    const { uid, c } = await requireCliente();
    const [consumos, resgates, reservas, cfg, comandas] = await Promise.all([doCliente('consumos', uid), doCliente('resgates', uid), doCliente('reservas', uid), getConfig(),
      // a comanda aberta no bar, para o afilhado acompanhar o que já foi lançado
      getDocs(query(collection(db, 'comandas'), where('clienteUid', '==', uid), where('status', '==', 'Aberta'), limit(1))).catch(() => null)]);
    const r = resumo(consumos, resgates);
    const aberta = comandas && !comandas.empty ? comandas.docs[0].data() : null;
    return {
      comanda: aberta && {
        id: comandas!.docs[0].id, numero: aberta.numero, mesa: aberta.mesa ?? null, itens: aberta.itens ?? [], total: Number(aberta.total) || 0, abertaEm: aberta.abertaEm,
        pontos: pontosDosItens(Array.isArray(aberta.itens) ? aberta.itens : []),
      },
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
    const patch: Dados = { nome, telefone: tel, foto };
    // cadastros de antes do lançamento completam CPF e data de nascimento uma única vez
    if ((b.cpf !== undefined || b.nascimento !== undefined) && !c.cpf) {
      const docs = conferirDocumentos(b);
      Object.assign(patch, docs);
      lote.set(doc(db, 'cpfs', docs.cpf), { uid });
    }
    // questionário opcional: só as perguntas que existem (texto livre até 2.000 caracteres)
    if (b.respostas !== undefined) {
      const cfg = await getConfig();
      const ids = new Set(cfg.questionario.perguntas.map((q) => q.id));
      const r = (b.respostas && typeof b.respostas === 'object' ? b.respostas : {}) as Dados;
      patch.respostas = { ...Object.fromEntries(Object.entries(r).filter(([k]) => ids.has(k)).map(([k, v]) => [k, str(v, 2000)])), respondidoEm: now() };
    }
    lote.update(doc(db, 'clientes', uid), patch);
    try {
      await lote.commit();
    } catch (e) {
      if (patch.cpf && codigo(e) === 'permission-denied') fail(409, 'Este CPF já está cadastrado no programa.');
      throw e;
    }
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
      nome: PRESIDENCIA, descricao: 'Acesso total ao sistema, inclusive configurações.', permissoes: Object.fromEntries(AREAS.map((a) => [a, [...ACOES]])), sistema: true, criadoEm: t, atualizadoEm: t,
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
      fail(403, 'Usuário inativo. Procure a Presidência.');
    }
    const lote = writeBatch(db);
    lote.update(doc(db, 'usuarios', user.uid), { ultimoAcesso: now() });
    await lote.commit();
    return { token: user.uid };
  });
  rota('POST', '/crm/logout', async () => { await sair(); return { ok: true }; });
  rota('GET', '/crm/me', async () => {
    const ctx = await requireUsuario();
    return { usuario: publicUsuario(ctx.usuario), funcao: ctx.funcao && comNomeDaFuncao(ctx.funcao) };
  });
  /* Meu perfil: cada usuário edita as próprias informações (e-mail, função e status continuam com a Presidência) */
  rota('PUT', '/crm/me', async ({ b }) => {
    const ctx = await requireUsuario();
    const nome = str(b.nome, 120);
    if (nome.length < 3) fail(400, 'Informe o nome completo.');
    const tel = telefone(b.telefone);
    const nascimento = str(b.nascimento, 10);
    if (nascimento && (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento) || nascimento > today())) fail(400, 'Data de nascimento inválida.');
    const sobre = str(b.sobre, 500);
    const dados = { nome, telefone: tel, nascimento, sobre };
    const lote = writeBatch(db);
    lote.update(doc(db, 'usuarios', ctx.usuario.id), dados);
    await lote.commit();
    return publicUsuario({ ...ctx.usuario, ...dados });
  });
  /* Meu perfil: foto (imagem já reduzida no navegador) ou null para remover */
  rota('PUT', '/crm/me/foto', async ({ b }) => {
    const ctx = await requireUsuario();
    const foto = b.foto ?? null;
    if (foto !== null && !/^data:image\/(jpeg|png|webp);base64,/.test(String(foto))) fail(400, 'Imagem inválida.');
    if (foto !== null && String(foto).length > 400_000) fail(413, 'Imagem muito grande.');
    const lote = writeBatch(db);
    lote.update(doc(db, 'usuarios', ctx.usuario.id), { foto });
    await lote.commit();
    return { foto };
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
    const limparPainel = (p: Dados) => ({
      ordem: ids(p.ordem), fixados: ids(p.fixados), ocultos: ids(p.ocultos),
      // atalhos: páginas do CRM adicionadas ao painel pelo botão direito do menu
      atalhos: (Array.isArray(p.atalhos) ? p.atalhos : []).filter((x: unknown): x is string => typeof x === 'string' && /^\/[a-z0-9/-]{1,60}$/.test(x)).slice(0, 30),
      // extras: blocos do catálogo que o usuário escolheu adicionar além dos padrões
      extras: ids(p.extras),
      // largura escolhida para cada bloco (¼, ½, ¾ ou a linha inteira)
      tamanhos: Object.fromEntries(Object.entries(p.tamanhos && typeof p.tamanhos === 'object' ? p.tamanhos : {})
        .filter(([id, t]) => ids([id]).length === 1 && ['p', 'm', 'g', 'c'].includes(t as string)).slice(0, 60)),
      // posição livre de cada bloco na grade (x, y e largura em colunas de 0 a 12; altura em linhas)
      layout: Object.fromEntries(Object.entries(p.layout && typeof p.layout === 'object' ? p.layout : {})
        .filter(([id]) => ids([id]).length === 1)
        .map(([id, v]) => {
          const q = (v ?? {}) as Dados;
          const n = (x: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(x) || 0)));
          const x = n(q.x, 0, 11);
          return [id, { x, y: n(q.y, 0, 999), w: Math.min(n(q.w, 1, 12), 12 - x), h: n(q.h, 1, 60) }];
        }).slice(0, 60)),
    });
    // "painel" é o Painel executivo; "meuPainel" é o painel próprio (Meu perfil → Meu painel). Grava só o que veio.
    const salvo: Dados = {};
    for (const chave of ['painel', 'meuPainel']) if (b[chave] && typeof b[chave] === 'object') salvo[chave] = limparPainel(b[chave]);
    // páginas fixadas na barra superior
    if (Array.isArray(b.paginas)) salvo.paginas = b.paginas.filter((x: unknown): x is string => typeof x === 'string' && /^\/[a-z0-9/-]{1,60}$/.test(x)).slice(0, 30);
    const lote = writeBatch(db);
    lote.set(doc(db, 'preferencias', ctx.usuario.id), { ...salvo, atualizadoEm: now() }, { merge: true });
    await lote.commit();
    return salvo;
  });

  /* CRM: opções acrescentadas pela equipe às listas com "Outro" (ex.: uma categoria nova do estoque).
   * Cada lista é um documento em `opcoes`, com o nome "<cadastro>__<campo>". Igual às regras de `opcoes`. */
  const LISTA_DE_OPCOES = /^[a-z0-9_]{1,60}$/;
  const OPCOES_POR_LISTA = 100;
  rota('GET', '/crm/opcoes', async () => {
    await requireUsuario();
    return Object.fromEntries((await colecao('opcoes')).map((r) => [r.id, Array.isArray(r.valores) ? r.valores.filter((v: unknown) => typeof v === 'string') : []]));
  });
  rota('POST', '/crm/opcoes/:lista', async ({ p, b }) => {
    await requireUsuario();
    if (!LISTA_DE_OPCOES.test(p.lista)) fail(400, 'Lista de opções inválida.');
    const valor = str(b.valor, 60);
    if (!valor) fail(400, 'Descreva a opção.');
    const atuais = ((await documento(`opcoes/${p.lista}`))?.valores ?? []) as string[];
    if (atuais.some((v) => v.toLowerCase() === valor.toLowerCase())) return { valores: atuais };
    if (atuais.length >= OPCOES_POR_LISTA) fail(400, `Esta lista já tem ${OPCOES_POR_LISTA} opções acrescentadas.`);
    const lote = writeBatch(db);
    lote.set(doc(db, 'opcoes', p.lista), { valores: arrayUnion(valor), atualizadoEm: now() }, { merge: true });
    await lote.commit();
    return { valores: [...atuais, valor] };
  });
  rota('DELETE', '/crm/opcoes/:lista', async ({ p, b }) => {
    await requireUsuario();
    if (!LISTA_DE_OPCOES.test(p.lista)) fail(400, 'Lista de opções inválida.');
    const valor = str(b.valor, 60);
    const lote = writeBatch(db);
    lote.set(doc(db, 'opcoes', p.lista), { valores: arrayRemove(valor), atualizadoEm: now() }, { merge: true });
    await lote.commit();
    return { ok: true };
  });

  /* CRM: painel de atualizações (as últimas alterações das áreas que a pessoa acessa) */
  rota('GET', '/crm/atividades', async () => {
    const ctx = await requireUsuario();
    // histórico por módulo (e, nos registros de antes da separação, por área)
    const areas = [...new Set([...AREAS, ...MODULOS])].filter((a) => ctx.access(a) !== 'none');
    const listas = await Promise.all(areas.map((a) =>
      lista(`atividades@${a}`, query(collection(db, 'atividades', a, 'itens'), orderBy('criadoEm', 'desc'), limit(80)))));
    return ordenar(listas.flat()).slice(0, 200);
  });

  /* CRM: configuração */
  rota('GET', '/crm/config', async () => { await requireUsuario(); return getConfig(); });
  rota('PUT', '/crm/config', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'parametros', 'editar');
    if (b.faixasPontos !== undefined) {
      const faixas = Array.isArray(b.faixasPontos) ? b.faixasPontos : [];
      if (faixas.length > 20) fail(400, 'A tabela de pontos aceita até 20 faixas.');
      b.faixasPontos = faixas.map((f: Dados) => ({ ate: Math.round(Number(f?.ate) * 100) / 100, pontos: Math.floor(Number(f?.pontos)) }))
        .sort((x: Dados, y: Dados) => x.ate - y.ate);
      if (b.faixasPontos.some((f: Dados) => !(f.ate > 0) || !(f.pontos >= 0))) fail(400, 'Cada faixa de pontos precisa de um preço limite e dos pontos.');
      if (new Set(b.faixasPontos.map((f: Dados) => f.ate)).size !== b.faixasPontos.length) fail(400, 'Duas faixas de pontos têm o mesmo preço limite.');
    }
    if (b.pontosAcima !== undefined && !(Number.isInteger(Number(b.pontosAcima)) && Number(b.pontosAcima) >= 0)) fail(400, 'Pontos acima da última faixa inválidos.');
    if (b.horarios && !b.horarios.every((h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h))) fail(400, 'Horários devem estar no formato HH:MM (00:00 a 23:59).');
    if (b.questionario !== undefined) {
      const q = b.questionario as Dados;
      const perguntas = Array.isArray(q?.perguntas) ? q.perguntas : [];
      if (perguntas.length > 15) fail(400, 'O questionário aceita até 15 perguntas.');
      b.questionario = {
        versao: DEFAULT_CONFIG.questionario.versao,
        ativo: q?.ativo === true, titulo: str(q?.titulo, 80) || DEFAULT_CONFIG.questionario.titulo,
        perguntas: perguntas.map((x: Dados, i: number) => {
          const opcoes = [...new Set((Array.isArray(x?.opcoes) ? x.opcoes : []).map((o: unknown) => str(o, 60)).filter(Boolean))].slice(0, 12) as string[];
          return { id: str(x?.id, 20) || `p${i + 1}`, texto: str(x?.texto, 500), opcoes, ...(x?.multipla === true && opcoes.length ? { multipla: true } : {}) };
        }).filter((x: Dados) => x.texto),
      };
    }
    const patch = Object.fromEntries(Object.entries(b).filter(([k]) => k in DEFAULT_CONFIG));
    const lote = writeBatch(db);
    lote.set(doc(db, 'config/geral'), patch, { merge: true });
    registrar(lote, ctx, 'parametros', 'alterou os parâmetros do aplicativo');
    await lote.commit();
    return { ...(await getConfig()), ...patch };
  });

  /* CRM: usuários */
  const activeAdmins = (usuarios: Dados[]) => usuarios.filter((u) => u.funcaoId === 'admin' && u.status === 'Ativo').length;
  rota('GET', '/crm/usuarios', async () => {
    requireAccess(await requireUsuario(), 'usuarios', 'ver');
    return (await colecao('usuarios')).map(publicUsuario).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  });
  rota('POST', '/crm/usuarios', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'usuarios', 'criar');
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
    registrar(lote, ctx, 'usuarios', 'cadastrou o usuário', { colecao: 'usuarios', alvo: nome, detalhe: `Função: ${comNomeDaFuncao(funcao).nome}` });
    await lote.commit();
    return publicUsuario({ ...usuario, id: uid });
  });
  /* CRM: ordem das funções (definida pela Presidência ou por quem edita funções); a função de sistema fica sempre no topo */
  rota('PUT', '/crm/funcoes/ordem', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'funcoes', 'editar');
    const funcoes = await colecao('funcoes');
    const ids: string[] = Array.isArray(b?.ids) ? b.ids.map(String) : [];
    const lista = ids.map((id) => funcoes.find((f) => f.id === id)).filter((f): f is Dados => !!f && !f.sistema);
    if (!lista.length) return fail(400, 'Informe a ordem das funções.');
    const lote = writeBatch(db);
    lista.forEach((f, i) => { if (f.ordem !== i + 1) lote.update(doc(db, 'funcoes', f.id), { ordem: i + 1 }); });
    registrar(lote, ctx, 'funcoes', 'reordenou as funções', { colecao: 'funcoes', detalhe: lista.map((f) => f.nome).join(' > ') });
    await lote.commit();
    return { ok: true };
  });
  rota('PUT', '/crm/usuarios/:id', async ({ p, b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'usuarios', 'editar');
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
    if (deixaDeSerAdmin && activeAdmins(usuarios) <= 1) fail(400, 'É preciso manter pelo menos um usuário ativo na Presidência.');
    const lote = writeBatch(db);
    lote.update(doc(db, 'usuarios', p.id), { nome, funcaoId, status });
    const mudancas = [
      funcaoId !== u.funcaoId ? `Função: ${((f) => (f ? comNomeDaFuncao(f).nome : funcaoId))(funcoes.find((f) => f.id === funcaoId))}` : '',
      status !== u.status ? `Status: ${status}` : '',
      nome !== u.nome ? `Nome: ${nome}` : '',
    ].filter(Boolean).join(' · ');
    registrar(lote, ctx, 'usuarios', 'alterou o usuário', { colecao: 'usuarios', alvo: u.nome, detalhe: mudancas });
    await lote.commit();
    return publicUsuario({ ...u, nome, funcaoId, status });
  });
  rota('POST', '/crm/usuarios/:id/redefinir-senha', async ({ p }) => {
    requireAccess(await requireUsuario(), 'usuarios', 'editar');
    const u = (await colecao('usuarios')).find((x) => x.id === p.id);
    if (!u) return fail(404, 'Usuário não encontrado.');
    await sendPasswordResetEmail(auth, u.email);
    return { ok: true };
  });
  rota('DELETE', '/crm/usuarios/:id', async ({ p }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'usuarios', 'excluir');
    if (ctx.usuario.id === p.id) fail(400, 'Você não pode excluir o próprio usuário.');
    const usuarios = await colecao('usuarios');
    const u = usuarios.find((x) => x.id === p.id);
    if (!u) return fail(404, 'Usuário não encontrado.');
    if (u.funcaoId === 'admin' && u.status === 'Ativo' && activeAdmins(usuarios) <= 1) fail(400, 'É preciso manter pelo menos um usuário ativo na Presidência.');
    // sem o cadastro em `usuarios` a conta não passa mais pelas regras nem pelo login do CRM
    const lote = writeBatch(db);
    lote.delete(doc(db, 'usuarios', p.id));
    registrar(lote, ctx, 'usuarios', 'excluiu o usuário', { colecao: 'usuarios', alvo: u.nome });
    await lote.commit();
    return { ok: true };
  });

  /* CRM: clientes do aplicativo */
  rota('GET', '/crm/clientes', async () => {
    const ctx = await requireUsuario();
    requireAnyAccess(ctx, ['clientes', 'reservas', 'consumos', 'resgates', 'recompensas', 'comandas'], 'ver');
    // os totais de cada afilhado ficam no saldo (atualizados a cada consumo), sem carregar todos os consumos
    const [clientes, saldos, cfg] = await Promise.all([colecao('clientes'), colecao('saldos'), getConfig()]);
    const saldoDe = new Map(saldos.map((s) => [s.id, s]));
    const faltando = clientes.filter((c) => !Array.isArray(saldoDe.get(c.id)?.dias));
    if (faltando.length) {
      // saldos de antes dos totais: calcula uma vez a partir dos consumos e, se possível, grava para as próximas vezes
      const [consumos, resgates] = await Promise.all([colecao('consumos'), colecao('resgates')]);
      const lote = writeBatch(db);
      for (const c of faltando) {
        const r = resumo(consumos.filter((x) => x.clienteUid === c.id), resgates.filter((x) => x.clienteUid === c.id));
        const totais = { gasto: Math.round(r.totalGasto * 100) / 100, lancamentos: r.consumos.length, dias: [...new Set(r.consumos.map((x) => String(x.data).slice(0, 10)))].sort() };
        saldoDe.set(c.id, { acumulados: r.acumulados, usados: r.acumulados - r.pontos, ...saldoDe.get(c.id), ...totais });
        lote.set(doc(db, 'saldos', c.id), totais, { merge: true });
      }
      if (ctx.acoes('consumos').some((a) => a !== 'ver')) await lote.commit().catch(() => undefined);
    }
    return clientes
      .map((c) => {
        const s = saldoDe.get(c.id) ?? {};
        const dias: string[] = Array.isArray(s.dias) ? [...s.dias].sort() : [];
        const acumulados = Number(s.acumulados) || 0;
        return {
          // a equipe vê o CPF completo (nota fiscal com CPF, conferência do cadastro)
          ...publicCliente(c), cpf: c.cpf ? String(c.cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '', foto: undefined, pontos: acumulados - (Number(s.usados) || 0), acumulados, totalGasto: Math.round((Number(s.gasto) || 0) * 100) / 100,
          visitas: dias.length, ultimaVisita: dias.at(-1) ?? null, nivel: nivelDe(acumulados, cfg.niveis).atual?.nome ?? '',
        };
      })
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  });

  /** Apaga muitos documentos em lotes (o Firestore aceita até 500 gravações por lote). `primeiro` grava junto no primeiro lote. */
  async function apagarEmLotes(refs: DocumentReference[], primeiro?: (lote: WriteBatch) => void) {
    const unicos = [...new Map(refs.map((r) => [r.path, r])).values()];
    for (let i = 0; i === 0 || i < unicos.length; i += 450) {
      const lote = writeBatch(db);
      if (i === 0) primeiro?.(lote);
      for (const r of unicos.slice(i, i + 450)) lote.delete(r);
      await lote.commit();
    }
    return unicos.length;
  }
  const pad3 = (n: number) => String(n).padStart(3, '0');

  /* CRM: excluir um afilhado (a pedido dele, como manda a LGPD): cadastro, saldo, consumos com as receitas, vouchers e reservas */
  rota('DELETE', '/crm/clientes/:numero', async ({ p }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'clientes', 'excluir');
    requireAccess(ctx, 'consumos', 'excluir');
    const c = (await colecao('clientes')).find((x) => x.numero === Number(p.numero));
    if (!c) return fail(404, 'Afilhado não encontrado.');
    const [consumos, resgates, reservas] = await Promise.all([doCliente('consumos', c.id), doCliente('resgates', c.id), doCliente('reservas', c.id)]);
    const refs = [
      doc(db, 'clientes', c.id), doc(db, 'saldos', c.id), ...(c.cpf ? [doc(db, 'cpfs', String(c.cpf))] : []),
      ...consumos.flatMap((x) => [doc(db, 'consumos', x.id), ...(x.receitaId ? [doc(db, 'receitas', x.receitaId)] : [])]),
      ...resgates.map((x) => doc(db, 'resgates', x.id)), ...reservas.map((x) => doc(db, 'reservas', x.id)),
    ];
    await apagarEmLotes(refs, (lote) => registrar(lote, ctx, 'clientes', 'excluiu o afilhado', {
      colecao: 'clientes', alvo: `${c.nome} (#${pad3(c.numero)})`,
      detalhe: `${consumos.length} consumo(s), ${resgates.length} voucher(s) e ${reservas.length} reserva(s) apagados`,
    }));
    return { ok: true };
  });

  /* CRM: excluir TODOS os afilhados (ex.: cadastros de teste antes do lançamento): cadastros, saldos, CPFs, consumos com as receitas,
   * vouchers e reservas feitas por afilhados; a numeração volta a começar do #001. As contas de login (Firebase Auth) só o Admin SDK
   * apaga: a rotina scripts/limpar-contas.mjs (GitHub Actions, a cada 10 min) remove as que ficaram sem cadastro. */
  rota('DELETE', '/crm/clientes', async () => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'clientes', 'excluir');
    requireAccess(ctx, 'consumos', 'excluir');
    requireAccess(ctx, 'parametros', 'editar');
    const [clientes, saldos, consumos, resgates, reservas] = await Promise.all(['clientes', 'saldos', 'consumos', 'resgates', 'reservas'].map(colecao));
    const vendas = consumos.filter((x) => x.clienteUid), vouchers = resgates.filter((x) => x.clienteUid), doApp = reservas.filter((x) => x.clienteUid);
    const refs = [
      ...clientes.flatMap((c) => [doc(db, 'clientes', c.id), ...(c.cpf ? [doc(db, 'cpfs', String(c.cpf))] : [])]),
      ...saldos.map((x) => doc(db, 'saldos', x.id)),
      ...vendas.flatMap((x) => [doc(db, 'consumos', x.id), ...(x.receitaId ? [doc(db, 'receitas', x.receitaId)] : [])]),
      ...vouchers.map((x) => doc(db, 'resgates', x.id)), ...doApp.map((x) => doc(db, 'reservas', x.id)),
    ];
    await apagarEmLotes(refs, (lote) => {
      lote.set(doc(db, 'meta', 'contadores'), { clientes: 0 });
      registrar(lote, ctx, 'clientes', 'excluiu todos os afilhados', {
        colecao: 'clientes', alvo: `${clientes.length} afilhado(s)`,
        detalhe: `${vendas.length} consumo(s), ${vouchers.length} voucher(s) e ${doApp.length} reserva(s) apagados; numeração reiniciada`,
      });
    });
    return { apagados: clientes.length };
  });

  /* CRM: numeração dos afilhados — o próximo número volta a seguir o maior número em uso (ex.: depois de excluir afilhados de teste) */
  rota('POST', '/crm/clientes/numeracao', async () => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'parametros', 'editar');
    const maior = Math.max(0, ...(await colecao('clientes')).map((c) => Number(c.numero) || 0));
    const lote = writeBatch(db);
    lote.set(doc(db, 'meta', 'contadores'), { clientes: maior });
    registrar(lote, ctx, 'parametros', 'ajustou a numeração dos afilhados', { alvo: `próximo número: #${pad3(maior + 1)}` });
    await lote.commit();
    return { proximo: maior + 1 };
  });

  /* CRM: zerar o sistema (só a Presidência). Apaga TODOS os dados, inclusive usuários, funções e parâmetros:
   * o sistema volta ao "primeiro acesso". As contas de login (Firebase Auth) só o Admin SDK apaga:
   * a rotina scripts/limpar-contas.mjs (GitHub Actions, a cada 10 min) remove as que ficaram sem cadastro. */
  rota('POST', '/crm/admin/zerar', async ({ b }) => {
    const ctx = await requireUsuario();
    if (!ctx.funcao?.sistema) fail(403, 'Só a Presidência pode zerar o sistema.');
    if (b.confirmacao !== 'ZERAR TUDO') fail(400, 'Para zerar, confirme com "ZERAR TUDO".');
    const todos = async (...caminho: string[]) => (await getDocs(collection(db, caminho.join('/')))).docs.map((d) => d.ref);
    const cols = [...Object.keys(COLLECTIONS).filter((c) => c !== 'funcoes'), 'clientes', 'saldos', 'cpfs', 'cardapio', 'ref_colaboradores', 'ref_fornecedores', 'config', 'segredos', 'opcoes'];
    const refs: DocumentReference[] = [];
    for (const c of cols) refs.push(...(await todos(c)));
    for (const a of new Set([...AREAS, ...MODULOS])) refs.push(...(await todos('atividades', a, 'itens')));
    // PDFs anexados: as partes antes do registro de cada arquivo (as regras consultam o registro ao apagar uma parte)
    const anexos = await todos('anexos');
    for (const a of anexos) refs.push(...(await todos('anexos', a.id, 'partes')));
    refs.push(...anexos);
    refs.push(doc(db, 'meta', 'contadores'));
    const usuarios = await todos('usuarios');
    // preferências de cada usuário (só a própria pessoa lê; a Presidência apaga pela lista de usuários)
    refs.push(...usuarios.map((r) => doc(db, 'preferencias', r.id)));
    refs.push(...usuarios.filter((r) => r.id !== ctx.usuario.id));
    refs.push(...(await todos('funcoes')).filter((r) => r.id !== ctx.funcao?.id && r.id !== ctx.usuario.funcaoId));
    let n = await apagarEmLotes(refs);
    // por último, num lote só: o próprio usuário, a função Presidência e o registro do primeiro acesso
    const fim = writeBatch(db);
    fim.delete(doc(db, 'usuarios', ctx.usuario.id));
    fim.delete(doc(db, 'funcoes', ctx.usuario.funcaoId));
    fim.delete(doc(db, 'meta', 'setup'));
    await fim.commit();
    n += 3;
    await sair();
    return { apagados: n };
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
      case 'insumos':
        // ficha técnica dos produtos (Vendas): itens do Estoque com unidade e custo, sem quantidades nem validade
        // (o Administrativo também escolhe o insumo ao cadastrar um preço de fornecedor)
        requireAnyAccess(ctx, ['produtos', 'guarnicoes', 'estoque', 'compras', 'precos'], 'ver');
        return (await colecao('estoque'))
          .map((e) => {
            const un = e.unidade || 'un', custo = Number(e.custo) || 0;
            // item contado em unidades (garrafa, caixa…) com o conteúdo informado: a receita mede em ml/g
            const conteudo = Number(e.conteudo) || 0, medida = String(e.conteudoUnidade ?? '');
            const converte = conteudo > 0 && MEDIDAS.includes(medida) && !MEDIDAS.includes(un);
            return {
              id: e.id, nome: e.item, unidade: converte ? medida : un, custo: converte ? custo / conteudo : custo,
              // entrada de notas: a compra é lançada na unidade do Estoque (ex.: garrafas), sem conversão
              unidadeEstoque: un, custoEstoque: custo, categoria: e.categoria ?? '',
              detalhe: [e.categoria, custo ? `${brl(custo)}/${un}${converte ? ` de ${conteudo.toLocaleString('pt-BR')} ${medida}` : ''}` : 'sem custo cadastrado'].filter(Boolean).join(' · '),
            };
          });
      case 'materiais':
        // entrada de notas: materiais (patrimônio) já cadastrados
        requireAnyAccess(ctx, ['materiais', 'compras'], 'ver');
        return (await colecao('materiais'))
          .filter((m) => m.material)
          .map((m) => ({ id: m.id, nome: String(m.material), tipo: m.tipo ?? '', valor: Number(m.valor) || 0, detalhe: [m.tipo, m.local].filter(Boolean).join(' · ') }));
      case 'copos':
      case 'utensilios': {
        // ficha técnica (preparo): copos e utensílios ligados aos cadastros de Estoque e de Materiais
        // (com quanto tem de cada), mais sugestões comuns de bar para o que ainda não foi cadastrado
        requireAnyAccess(ctx, ['produtos', 'estoque', 'materiais'], 'ver');
        const copos = p.tipo === 'copos';
        const parece = copos ? PARECE_COPO : PARECE_UTENSILIO;
        const qtd = (v: unknown, un: unknown) => `${(Number(v) || 0).toLocaleString('pt-BR')} ${un || 'un'}`;
        const doEstoque = (await colecao('estoque'))
          .filter((e) => e.item && (parece.test(String(e.item)) || (copos && e.categoria === 'Descartáveis' && /copo|ta[cç]a/i.test(String(e.item)))))
          .map((e) => ({
            id: 'e:' + e.id, nome: String(e.item), custo: Number(e.custo) || 0, descartavel: e.categoria === 'Descartáveis',
            detalhe: ['Estoque', qtd(e.quantidade, e.unidade), e.categoria === 'Descartáveis' && Number(e.custo) ? `${brl(Number(e.custo))}/${e.unidade || 'un'} (descartável)` : ''].filter(Boolean).join(' · '),
          }));
        const materiais = (await colecao('materiais'))
          .filter((m) => ['Utensílio', 'Equipamento'].includes(m.tipo) && m.estado !== 'Descartar' && m.material)
          // copos: só o que parece copo; utensílios: o que não parece copo
          .filter((m) => (copos ? PARECE_COPO.test(String(m.material)) : !PARECE_COPO.test(String(m.material))))
          .map((m) => ({ id: 'm:' + m.id, nome: String(m.material), custo: 0, descartavel: false, detalhe: ['Materiais', m.local, qtd(m.quantidade, 'un')].filter(Boolean).join(' · ') }));
        const cadastrados = [...doEstoque, ...materiais];
        const nomes = new Set(cadastrados.map((m) => m.nome.toLowerCase()));
        const sugestoes = (copos ? SUGESTOES_COPOS : SUGESTOES_UTENSILIOS)
          .filter((n) => !nomes.has(n.toLowerCase()))
          .map((n) => ({ id: 's:' + n, nome: n, custo: 0, descartavel: false, detalhe: 'Sugestão (não cadastrado)' }));
        return [...cadastrados, ...sugestoes];
      }
      case 'precos':
        // ficha técnica: preço de cada fornecedor para cada insumo (Tabela de preços do Administrativo)
        requireAnyAccess(ctx, ['produtos', 'compras', 'precos'], 'ver');
        return (await colecao('precos'))
          .filter((x) => x.status !== 'Inativo' && x.insumoId && Number(x.preco) > 0 && Number(x.conteudo) > 0)
          .map((x) => ({
            id: x.id, nome: x.fornecedor || 'Fornecedor', insumoId: x.insumoId, insumo: x.insumo, fornecedorId: x.fornecedorId ?? null,
            embalagem: x.embalagem ?? '', conteudo: Number(x.conteudo), unidade: x.unidade || 'un', preco: Number(x.preco), data: x.data ?? '',
          }));
      case 'clientes':
        requireAnyAccess(ctx, ['clientes', 'reservas', 'consumos', 'resgates', 'recompensas', 'comandas'], 'ver');
        return (await colecao('clientes'))
          .map((c) => ({ id: c.numero, nome: c.nome, detalhe: `#${String(c.numero).padStart(3, '0')}${c.telefone ? ' · ' + c.telefone : ''}`, telefone: c.telefone }));
      default:
        return fail(404, 'Lista inexistente.');
    }
  });

  /* CRM: produtos disponíveis para venda (o atendimento lança consumo sem acesso ao cadastro de produtos) */
  rota('GET', '/crm/produtos-venda', async () => {
    requireAnyAccess(await requireUsuario(), ['consumos', 'comandas', 'produtos'], 'ver');
    const [produtos, cfg] = await Promise.all([colecao('produtos'), getConfig()]);
    return produtos
      .filter((p) => p.status !== 'Inativo')
      .map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria, preco: Number(p.preco) || 0, pontos: pontosDoProduto(p, cfg), foto: p.foto || undefined }))
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
    requireAnyAccess(ctx, ['folha', 'despesas'], 'ver');
    const folha = await calcularFolha(q.get('mes') ?? '');
    // o Financeiro vê os totais; o detalhe por colaborador (salários individuais) é do RH
    if (ctx.access('folha') === 'none') folha.linhas = [];
    return folha;
  });
  rota('POST', '/crm/folha/lancar', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'despesas', 'criar');
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
    registrar(lote, ctx, 'despesas', 'lançou a folha de pagamento', {
      colecao: 'despesas', alvo: nomeMes, detalhe: `${folha.colaboradores} colaborador(es) · líquido ${brl(folha.totais.liquido)} · custo total ${brl(folha.totais.custo)}`,
    });
    await lote.commit();
    return { ok: true, despesas: criadas.length };
  });

  /* CRM: lançar no DRE a despesa de um cadastro (serviço terceirizado, contrato, mídia ou projeto).
   * Quem lança é a área dona do cadastro; a despesa nasce "A pagar" e o Financeiro acompanha o pagamento. */
  rota('POST', '/crm/c/:col/:id/lancar-despesa', async ({ p, b }) => {
    const ctx = await requireUsuario();
    const origem = ORIGENS_DESPESA[p.col];
    if (!origem) return fail(404, 'Este cadastro não gera despesas.');
    const area = collectionArea(p.col);
    requireAccess(ctx, area, 'editar');
    const cur = await registro(p.col, p.id);
    if (!cur) return fail(404, 'Registro não encontrado.');
    const descricao = str(b.descricao, 200), categoria = str(b.categoria, 40), data = str(b.data, 10), vencimento = str(b.vencimento, 10);
    const valor = typeof b.valor === 'number' && Number.isFinite(b.valor) ? Math.round(b.valor * 100) / 100 : NaN;
    if (descricao.length < 3) fail(400, 'Informe a descrição da despesa.');
    if (!categoria) fail(400, 'Selecione a categoria da despesa.');
    if (!dataValida(data)) fail(400, 'Informe a data de competência.');
    if (vencimento && !dataValida(vencimento)) fail(400, 'Data de vencimento inválida.');
    if (!(valor > 0 && valor <= VALOR_MAXIMO_DESPESA)) fail(400, `Informe um valor entre R$ 0,01 e ${brl(VALOR_MAXIMO_DESPESA)}.`);
    const t = now();
    const ref = doc(collection(db, 'despesas'));
    const competencia = data.slice(0, 7);
    const vezes = (Number(cur.lancamentos?.[competencia]?.vezes) || 0) + 1;
    const lote = writeBatch(db);
    lote.set(ref, {
      descricao, categoria, data, vencimento, valor, status: 'A pagar', observacoes: str(b.observacoes, 1000),
      origem: `Lançamento de ${origem}`, origemColecao: p.col, origemId: p.id, criadoPor: ctx.usuario.id, criadoEm: t, atualizadoEm: t,
    });
    // o cadastro guarda o que já foi lançado por aqui em cada competência: as regras exigem essa anotação no mesmo lote,
    // e a tela usa para avisar antes de lançar duas vezes o mesmo mês
    lote.update(doc(db, p.col, p.id), { [`lancamentos.${competencia}`]: { despesaId: ref.id, valor, em: t, vezes } });
    registrar(lote, ctx, area, 'lançou como despesa', { colecao: p.col, alvo: nomeDe(cur) || descricao, detalhe: `${brl(valor)} · competência ${data.slice(5, 7)}/${data.slice(0, 4)}` });
    await lote.commit();
    return { ok: true };
  });

  /* CRM: lançamento de consumo (credita pontos e gera receita) */
  /* ---------- caixa, comandas e consumo ----------
   * Toda venda (consumo de afilhado ou comanda) entra no caixa aberto: o caixa guarda os totais por forma de pagamento,
   * e o fechamento confere o contado com o esperado. Sem caixa aberto não se lança venda. */
  const FORMAS_PAGAMENTO = ['Pix', 'Crédito', 'Débito', 'Dinheiro', 'Vale-refeição'];
  const formaDe = (v: unknown) => (FORMAS_PAGAMENTO.includes(str(v, 30)) ? str(v, 30) : fail(400, 'Escolha a forma de pagamento.'));
  const centavos = (v: number) => Math.round(v * 100) / 100;
  const numComanda = (n: unknown) => `#${String(n).padStart(3, '0')}`;
  async function caixaAberto(): Promise<Dados | null> {
    const s = await getDocs(query(collection(db, 'caixas'), where('status', '==', 'Aberto'), limit(1)));
    return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
  }
  async function exigirCaixa() {
    const c = await caixaAberto();
    if (!c) fail(409, 'O caixa está fechado. Abra o caixa (Atendimento › Caixa) para lançar vendas.');
    return c as Dados;
  }
  function somarNoCaixa(lote: WriteBatch, caixaId: string, forma: string, valor: number, n = 1) {
    lote.update(doc(db, 'caixas', caixaId), { [`vendas.${forma}`]: increment(valor), totalVendas: increment(valor), qtdVendas: increment(n) });
  }
  /** Itens vendidos com o preço e os pontos (por unidade) do cadastro de produtos. */
  async function itensDaVenda(lista: unknown, vazio = false) {
    const [produtos, cfg] = await Promise.all([colecao('produtos'), getConfig()]);
    const itens = (Array.isArray(lista) ? lista : []).slice(0, 200).map((i: Dados) => {
      const p = produtos.find((x) => x.id === str(i.produtoId, 40));
      const quantidade = Math.floor(Number(i.quantidade));
      if (!p) return fail(400, 'Produto não encontrado.');
      if (!(quantidade >= 1 && quantidade <= 999)) fail(400, 'Quantidade inválida.');
      const preco = Number(p.preco) || 0;
      return { produtoId: p.id, nome: p.nome, quantidade, preco, total: centavos(preco * quantidade), pontos: pontosDoProduto(p, cfg) };
    });
    if (!itens.length && !vazio) fail(400, 'Adicione ao menos um item.');
    return { itens, valor: centavos(itens.reduce((s: number, i: { total: number }) => s + i.total, 0)) };
  }
  /** Consumo: receita e caixa no mesmo lote; com afilhado, também os pontos e o saldo. Sem afilhado (cliente sem cadastro), não há pontos. */
  async function lancarConsumo(lote: WriteBatch, ctx: Ctx, cliente: Dados | null, itens: Dados[], valor: number, forma: string, caixaId: string, extra: Dados = {}, nomeAvulso = '') {
    const pontos = cliente ? pontosDosItens(itens) : 0;
    const data = now();
    const consumoRef = doc(collection(db, 'consumos')), receitaRef = doc(collection(db, 'receitas'));
    const quem = cliente ? `${cliente.nome} (#${String(cliente.numero).padStart(3, '0')})` : nomeAvulso ? `${nomeAvulso} (sem cadastro)` : 'Cliente sem cadastro';
    const consumo = {
      clienteId: cliente ? cliente.numero : null, clienteUid: cliente ? cliente.id : null, clienteNome: cliente ? cliente.nome : nomeAvulso || 'Cliente sem cadastro',
      itens, valor, pontos, formaPagamento: forma, data, receitaId: receitaRef.id, caixaId, ...extra, criadoEm: data, atualizadoEm: data,
    };
    lote.set(consumoRef, consumo);
    lote.set(receitaRef, {
      data: data.slice(0, 10), descricao: `Consumo · ${quem}`,
      categoria: 'Consumo de clientes', formaPagamento: forma, valor, origem: 'Lançamento de consumo', consumoId: consumoRef.id, caixaId, criadoEm: data, atualizadoEm: data,
    });
    if (cliente) {
      lote.set(doc(db, 'saldos', cliente.id), {
        acumulados: increment(pontos), gasto: increment(valor), lancamentos: increment(1), dias: arrayUnion(data.slice(0, 10)),
      }, { merge: true });
    }
    somarNoCaixa(lote, caixaId, forma, valor);
    registrar(lote, ctx, 'consumos', 'lançou consumo para', {
      colecao: 'consumos', alvo: quem, detalhe: cliente ? `${brl(valor)} · ${pontos} pontos · ${forma}` : `${brl(valor)} · ${forma}`,
    });
    return { ...consumo, id: consumoRef.id };
  }

  rota('POST', '/crm/consumos', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'consumos', 'criar');
    // o afilhado é opcional: sem ele, o consumo entra no caixa e na receita, mas não gera pontos
    const cliente = b.clienteId ? (await colecao('clientes')).find((c) => c.numero === Number(b.clienteId)) : null;
    if (b.clienteId && !cliente) return fail(400, 'Afilhado não encontrado.');
    const { itens, valor } = await itensDaVenda(b.itens);
    const forma = formaDe(b.formaPagamento);
    const caixa = await exigirCaixa();
    const lote = writeBatch(db);
    const consumo = await lancarConsumo(lote, ctx, cliente ?? null, itens, valor, forma, String(caixa.id), {}, cliente ? '' : str(b.nome, 80));
    await lote.commit();
    return consumo;
  });
  /** Corrige itens e forma de pagamento de uma venda, só enquanto o caixa em que ela entrou estiver aberto:
   * a receita, os pontos do afilhado, o caixa e a comanda de origem acompanham a diferença. */
  rota('PATCH', '/crm/consumos/:id', async ({ p, b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'consumos', 'editar');
    const cur = await registro('consumos', p.id);
    if (!cur) return fail(404, 'Venda não encontrada.');
    const caixa = cur.caixaId ? await registro('caixas', String(cur.caixaId)) : null;
    if (caixa?.status !== 'Aberto') fail(400, 'O caixa desta venda já foi fechado: ela não pode mais ser alterada.');
    const novos = await itensDaVenda(b.itens);
    // o que já estava na venda mantém o preço cobrado e os pontos da hora; só os itens novos entram pelo cadastro atual
    const antigos = new Map(((Array.isArray(cur.itens) ? cur.itens : []) as Dados[]).map((i) => [String(i.produtoId), i]));
    const itens = novos.itens.map((i) => {
      const a = antigos.get(i.produtoId);
      if (!a) return i;
      const preco = Number(a.preco) || 0;
      return { ...i, preco, total: centavos(preco * i.quantidade), pontos: a.pontos !== undefined ? Number(a.pontos) || 0 : i.pontos };
    });
    const valor = centavos(itens.reduce((s, i) => s + i.total, 0));
    const forma = formaDe(b.formaPagamento);
    const valorAntes = Number(cur.valor) || 0, formaAntes = String(cur.formaPagamento);
    const pontosAntes = Number(cur.pontos) || 0;
    const pontos = cur.clienteUid ? pontosDosItens(itens) : 0;
    if (cur.clienteUid && pontos < pontosAntes) {
      const s = await saldoDe(String(cur.clienteUid));
      if (s.acumulados - (pontosAntes - pontos) < s.usados) {
        fail(400, `O cliente já usou parte destes pontos em vouchers (saldo atual: ${s.acumulados - s.usados}, a correção retira ${pontosAntes - pontos}). Cancele os vouchers antes de diminuir a venda.`);
      }
    }
    const t = now();
    const lote = writeBatch(db);
    lote.update(doc(db, 'consumos', p.id), { itens, valor, pontos, formaPagamento: forma, atualizadoEm: t });
    if (cur.receitaId) lote.update(doc(db, 'receitas', String(cur.receitaId)), { valor, formaPagamento: forma, atualizadoEm: t });
    if (cur.clienteUid && (pontos !== pontosAntes || valor !== valorAntes)) {
      lote.set(doc(db, 'saldos', String(cur.clienteUid)), { acumulados: increment(pontos - pontosAntes), gasto: increment(centavos(valor - valorAntes)) }, { merge: true });
    }
    // no caixa, a venda sai da forma antiga e entra na nova (a quantidade de vendas não muda)
    if (forma === formaAntes) {
      if (valor !== valorAntes) somarNoCaixa(lote, String(caixa!.id), forma, centavos(valor - valorAntes), 0);
    } else {
      lote.update(doc(db, 'caixas', String(caixa!.id)), {
        [`vendas.${formaAntes}`]: increment(-valorAntes), [`vendas.${forma}`]: increment(valor), totalVendas: increment(centavos(valor - valorAntes)),
      });
    }
    if (cur.comandaId) lote.update(doc(db, 'comandas', String(cur.comandaId)), { itens, total: valor, formaPagamento: forma, atualizadoEm: t });
    registrar(lote, ctx, 'consumos', 'alterou a venda de', {
      colecao: 'consumos', alvo: String(cur.clienteNome ?? 'Cliente sem cadastro'), registroId: p.id,
      detalhe: `${brl(valorAntes)} · ${formaAntes} → ${brl(valor)} · ${forma}${cur.clienteUid ? ` · ${pontos} pontos` : ''}`,
    });
    await lote.commit();
    return { ...cur, itens, valor, pontos, formaPagamento: forma };
  });

  /** Caixa aberto (ou nenhum) e as formas de pagamento: quem vende precisa saber se o caixa está aberto. */
  rota('GET', '/crm/caixa', async () => {
    const ctx = await requireUsuario();
    const vende = ['consumos', 'comandas'].some((m) => ctx.acoes(m).some((a) => a === 'criar' || a === 'editar'));
    if (!vende && !ctx.acoes('caixas').includes('ver')) fail(403, semPermissao);
    return { aberto: await caixaAberto(), formas: FORMAS_PAGAMENTO };
  });
  rota('POST', '/crm/caixa/abrir', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'caixas', 'criar');
    if (await caixaAberto()) fail(409, 'Já existe um caixa aberto. Feche-o antes de abrir outro.');
    const valorInicial = centavos(Math.max(0, Number(b.valorInicial) || 0));
    const t = now();
    const ref = doc(collection(db, 'caixas'));
    const caixa = {
      nome: `Caixa de ${new Date(t).toLocaleDateString('pt-BR')}`, status: 'Aberto', abertoEm: t, abertoPor: ctx.usuario.id, abertoPorNome: ctx.usuario.nome,
      valorInicial, observacao: str(b.observacao, 300), vendas: {}, totalVendas: 0, qtdVendas: 0, movimentos: [], criadoEm: t, atualizadoEm: t,
    };
    const lote = writeBatch(db);
    lote.set(ref, caixa);
    registrar(lote, ctx, 'caixas', 'abriu o caixa', { colecao: 'caixas', alvo: caixa.nome, detalhe: `Troco inicial ${brl(valorInicial)}`, registroId: ref.id });
    await lote.commit();
    return { ...caixa, id: ref.id };
  });
  async function caixaParaAlterar(ctx: Ctx, id: string) {
    requireAccess(ctx, 'caixas', 'editar');
    const c = await registro('caixas', id);
    if (!c) return fail(404, 'Caixa não encontrado.');
    if (c.status !== 'Aberto') fail(400, 'Este caixa já foi fechado.');
    return c;
  }
  rota('POST', '/crm/caixa/:id/movimento', async ({ p, b }) => {
    const ctx = await requireUsuario();
    const c = await caixaParaAlterar(ctx, p.id);
    const tipo = b.tipo === 'Suprimento' ? 'Suprimento' : 'Sangria';
    const valor = centavos(Number(b.valor) || 0);
    if (!(valor > 0)) fail(400, 'Informe o valor.');
    const motivo = str(b.motivo, 200);
    if (tipo === 'Sangria' && !motivo) fail(400, 'Informe o motivo da sangria.');
    const mov = { id: Math.random().toString(36).slice(2, 10), tipo, valor, motivo, em: now(), por: ctx.usuario.nome };
    const lote = writeBatch(db);
    lote.update(doc(db, 'caixas', p.id), { movimentos: arrayUnion(mov), atualizadoEm: now() });
    registrar(lote, ctx, 'caixas', tipo === 'Sangria' ? 'fez sangria no caixa' : 'fez suprimento no caixa', { colecao: 'caixas', alvo: String(c.nome), detalhe: `${brl(valor)}${motivo ? ` · ${motivo}` : ''}`, registroId: p.id });
    await lote.commit();
    return mov;
  });
  /** Sangria ou suprimento já lançado: só se corrige ou apaga enquanto o caixa estiver aberto. */
  function movimentoDoCaixa(c: Dados, mid: string) {
    const movs = (Array.isArray(c.movimentos) ? c.movimentos : []) as Dados[];
    const i = movs.findIndex((m) => m.id === mid);
    if (i < 0) fail(404, 'Movimentação não encontrada.');
    return { movs, i, mov: movs[i] };
  }
  rota('PATCH', '/crm/caixa/:id/movimento/:mid', async ({ p, b }) => {
    const ctx = await requireUsuario();
    const c = await caixaParaAlterar(ctx, p.id);
    const { movs, i, mov } = movimentoDoCaixa(c, p.mid);
    const tipo = b.tipo === 'Suprimento' ? 'Suprimento' : 'Sangria';
    const valor = centavos(Number(b.valor) || 0);
    if (!(valor > 0)) fail(400, 'Informe o valor.');
    const motivo = str(b.motivo, 200);
    if (tipo === 'Sangria' && !motivo) fail(400, 'Informe o motivo da sangria.');
    const novo = { ...mov, tipo, valor, motivo, editadoEm: now(), editadoPor: ctx.usuario.nome };
    const lote = writeBatch(db);
    lote.update(doc(db, 'caixas', p.id), { movimentos: movs.map((m, j) => (j === i ? novo : m)), atualizadoEm: now() });
    registrar(lote, ctx, 'caixas', `editou ${tipo === 'Sangria' ? 'a sangria' : 'o suprimento'} do caixa`, {
      colecao: 'caixas', alvo: String(c.nome), registroId: p.id,
      detalhe: `${mov.tipo} ${brl(Number(mov.valor) || 0)} → ${tipo} ${brl(valor)}${motivo ? ` · ${motivo}` : ''}`,
    });
    await lote.commit();
    return novo;
  });
  rota('DELETE', '/crm/caixa/:id/movimento/:mid', async ({ p }) => {
    const ctx = await requireUsuario();
    const c = await caixaParaAlterar(ctx, p.id);
    const { movs, i, mov } = movimentoDoCaixa(c, p.mid);
    const lote = writeBatch(db);
    lote.update(doc(db, 'caixas', p.id), { movimentos: movs.filter((_, j) => j !== i), atualizadoEm: now() });
    registrar(lote, ctx, 'caixas', `excluiu ${mov.tipo === 'Sangria' ? 'a sangria' : 'o suprimento'} do caixa`, {
      colecao: 'caixas', alvo: String(c.nome), registroId: p.id, detalhe: `${brl(Number(mov.valor) || 0)}${mov.motivo ? ` · ${mov.motivo}` : ''}`,
    });
    await lote.commit();
    return { ok: true };
  });
  /** Esperado em cada forma: as vendas; no dinheiro, também o troco inicial, os suprimentos e as sangrias. */
  function esperadoDoCaixa(c: Dados) {
    const vendas = (c.vendas ?? {}) as Record<string, number>;
    const movs = (Array.isArray(c.movimentos) ? c.movimentos : []) as { tipo: string; valor: number }[];
    const esperado: Record<string, number> = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f, centavos(Number(vendas[f]) || 0)]));
    for (const [f, v] of Object.entries(vendas)) if (!(f in esperado)) esperado[f] = centavos(Number(v) || 0);
    esperado.Dinheiro = centavos(esperado.Dinheiro + (Number(c.valorInicial) || 0) + movs.reduce((s, m) => s + (m.tipo === 'Suprimento' ? m.valor : -m.valor), 0));
    return esperado;
  }
  rota('POST', '/crm/caixa/:id/fechar', async ({ p, b }) => {
    const ctx = await requireUsuario();
    const c = await caixaParaAlterar(ctx, p.id);
    const esperado = esperadoDoCaixa(c);
    const informado = (b.contado && typeof b.contado === 'object' ? b.contado : {}) as Record<string, unknown>;
    const contado = Object.fromEntries(Object.keys(esperado).map((f) => [f, centavos(Math.max(0, Number(informado[f]) || 0))]));
    const total = (m: Record<string, number>) => centavos(Object.values(m).reduce((s, v) => s + v, 0));
    const diferenca = centavos(total(contado) - total(esperado));
    const abertas = (await getDocs(query(collection(db, 'comandas'), where('status', '==', 'Aberta')))).size;
    const t = now();
    const fechamento = { esperado, contado, totalEsperado: total(esperado), totalContado: total(contado), diferenca, observacao: str(b.observacao, 300), comandasAbertas: abertas };
    const lote = writeBatch(db);
    lote.update(doc(db, 'caixas', p.id), { status: 'Fechado', fechadoEm: t, fechadoPor: ctx.usuario.id, fechadoPorNome: ctx.usuario.nome, fechamento, atualizadoEm: t });
    registrar(lote, ctx, 'caixas', 'fechou o caixa', {
      colecao: 'caixas', alvo: String(c.nome), registroId: p.id,
      detalhe: `Vendas ${brl(Number(c.totalVendas) || 0)} · ${diferenca === 0 ? 'sem diferença' : `diferença ${brl(diferenca)}`}`,
    });
    await lote.commit();
    return { ...c, status: 'Fechado', fechamento };
  });

  /* comandas: uma por afilhado (ou avulsa, por nome/mesa), com os itens lançados ao longo da noite */
  rota('POST', '/crm/comandas', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'comandas', 'criar');
    const mesa = b.mesa ? Math.floor(Number(b.mesa)) : null;
    if (mesa !== null && !(mesa >= 1 && mesa <= 999)) fail(400, 'Mesa inválida.');
    let cliente: Dados | undefined;
    if (b.clienteId) {
      cliente = (await colecao('clientes')).find((c) => c.numero === Number(b.clienteId));
      if (!cliente) fail(400, 'Afilhado não encontrado.');
      const aberta = await getDocs(query(collection(db, 'comandas'), where('clienteUid', '==', cliente!.id), where('status', '==', 'Aberta'), limit(1)));
      if (!aberta.empty) fail(409, `${cliente!.nome} já tem a comanda ${numComanda(aberta.docs[0].data().numero)} aberta.`);
    }
    const nome = cliente ? String(cliente.nome) : str(b.nome, 80);
    if (!nome && mesa === null) fail(400, 'Informe o afilhado, um nome ou a mesa.');
    const ultima = await getDocs(query(collection(db, 'comandas'), orderBy('numero', 'desc'), limit(1)));
    const numero = (ultima.empty ? 0 : Number(ultima.docs[0].data().numero) || 0) + 1;
    const t = now();
    const ref = doc(collection(db, 'comandas'));
    const comanda = {
      numero, nome: nome || `Mesa ${mesa}`, mesa, clienteId: cliente?.numero ?? null, clienteUid: cliente?.id ?? null, clienteNome: cliente?.nome ?? null,
      pessoas: Math.min(50, Math.max(1, Math.floor(Number(b.pessoas) || 1))), observacao: str(b.observacao, 300),
      itens: [], total: 0, status: 'Aberta', abertaEm: t, abertaPor: ctx.usuario.id, abertaPorNome: ctx.usuario.nome, criadoEm: t, atualizadoEm: t,
    };
    const lote = writeBatch(db);
    lote.set(ref, comanda);
    registrar(lote, ctx, 'comandas', 'abriu a comanda', { colecao: 'comandas', alvo: `${numComanda(numero)} · ${comanda.nome}`, detalhe: mesa ? `Mesa ${mesa}` : '', registroId: ref.id });
    await lote.commit();
    return { ...comanda, id: ref.id };
  });
  async function comandaAberta(ctx: Ctx, id: string) {
    requireAccess(ctx, 'comandas', 'editar');
    const c = await registro('comandas', id);
    if (!c) return fail(404, 'Comanda não encontrada.');
    if (c.status !== 'Aberta') fail(400, `A comanda ${numComanda(c.numero)} já está ${String(c.status).toLowerCase()}.`);
    return c;
  }
  rota('PUT', '/crm/comandas/:id', async ({ p, b }) => {
    const ctx = await requireUsuario();
    const c = await comandaAberta(ctx, p.id);
    const patch: Dados = { atualizadoEm: now() };
    if (b.itens !== undefined) Object.assign(patch, (({ itens, valor }) => ({ itens, total: valor }))(await itensDaVenda(b.itens, true)));
    if (b.mesa !== undefined) {
      const mesa = b.mesa ? Math.floor(Number(b.mesa)) : null;
      if (mesa !== null && !(mesa >= 1 && mesa <= 999)) fail(400, 'Mesa inválida.');
      patch.mesa = mesa;
    }
    if (b.observacao !== undefined) patch.observacao = str(b.observacao, 300);
    if (b.pessoas !== undefined) patch.pessoas = Math.min(50, Math.max(1, Math.floor(Number(b.pessoas) || 1)));
    const lote = writeBatch(db);
    lote.update(doc(db, 'comandas', p.id), patch);
    // itens lançados são o dia a dia da comanda: só a troca de mesa vai para o histórico
    if (patch.mesa !== undefined && patch.mesa !== c.mesa) {
      registrar(lote, ctx, 'comandas', 'mudou a comanda de mesa', { colecao: 'comandas', alvo: `${numComanda(c.numero)} · ${c.nome}`, detalhe: `Mesa ${c.mesa ?? '—'} → ${patch.mesa ?? '—'}`, registroId: p.id });
    }
    await lote.commit();
    return { ...c, ...patch };
  });
  rota('POST', '/crm/comandas/:id/fechar', async ({ p, b }) => {
    const ctx = await requireUsuario();
    const c = await comandaAberta(ctx, p.id);
    const { itens, valor } = await itensDaVenda(c.itens);
    const forma = formaDe(b.formaPagamento);
    const caixa = await exigirCaixa();
    const caixaId = String(caixa.id);
    const t = now();
    const lote = writeBatch(db);
    const patch: Dados = { status: 'Fechada', itens, total: valor, formaPagamento: forma, caixaId, fechadaEm: t, fechadaPor: ctx.usuario.id, fechadaPorNome: ctx.usuario.nome, atualizadoEm: t };
    const cliente = c.clienteUid ? (await colecao('clientes')).find((x) => x.id === c.clienteUid) : undefined;
    if (cliente) {
      requireAccess(ctx, 'consumos', 'criar');
      patch.consumoId = (await lancarConsumo(lote, ctx, cliente, itens, valor, forma, caixaId, { comandaId: p.id })).id;
    } else {
      const receitaRef = doc(collection(db, 'receitas'));
      lote.set(receitaRef, {
        data: t.slice(0, 10), descricao: `Comanda ${numComanda(c.numero)} · ${c.nome}${c.mesa ? ` (mesa ${c.mesa})` : ''}`,
        categoria: 'Vendas no salão', formaPagamento: forma, valor, origem: 'Comanda', comandaId: p.id, caixaId, criadoEm: t, atualizadoEm: t,
      });
      somarNoCaixa(lote, caixaId, forma, valor);
      patch.receitaId = receitaRef.id;
    }
    lote.update(doc(db, 'comandas', p.id), patch);
    registrar(lote, ctx, 'comandas', 'fechou a comanda', { colecao: 'comandas', alvo: `${numComanda(c.numero)} · ${c.nome}`, detalhe: `${brl(valor)} · ${forma}`, registroId: p.id });
    await lote.commit();
    return { ...c, ...patch };
  });
  rota('POST', '/crm/comandas/:id/cancelar', async ({ p, b }) => {
    const ctx = await requireUsuario();
    const c = await comandaAberta(ctx, p.id);
    const motivo = str(b.motivo, 200);
    const lote = writeBatch(db);
    lote.update(doc(db, 'comandas', p.id), { status: 'Cancelada', motivoCancelamento: motivo, canceladaEm: now(), canceladaPor: ctx.usuario.nome, atualizadoEm: now() });
    registrar(lote, ctx, 'comandas', 'cancelou a comanda', { colecao: 'comandas', alvo: `${numComanda(c.numero)} · ${c.nome}`, detalhe: motivo, registroId: p.id });
    await lote.commit();
    return { ok: true };
  });

  async function saldoDe(uid: string) {
    const d = (await getDoc(doc(db, 'saldos', uid))).data() ?? {};
    return { acumulados: Number(d.acumulados) || 0, usados: Number(d.usados) || 0 };
  }

  /* CRM: coleções genéricas */
  function collectionArea(name: string) {
    const area = COLLECTIONS[name];
    if (!area) return fail(404, 'Módulo inexistente.');
    return area;
  }
  /** O que o cardápio público mostra de um produto (sem custo, margem nem ficha técnica). */
  function itemDoCardapio(d: Dados) {
    const nota = (v: unknown) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x > 0 ? Math.min(5, x) : 0; };
    const teor = Number(d.teor);
    return {
      nome: d.nome ?? '', categoria: d.categoria ?? '', descricao: d.descricao ?? '', preco: Number(d.preco) || 0, destaque: d.destaque === 'Sim',
      // pontos personalizados do produto; null = segue a tabela de Parâmetros pelo preço
      pontos: pontosProprios(d),
      foto: typeof d.foto === 'string' && d.foto.startsWith('data:image/') ? d.foto : '',
      teor: Number.isFinite(teor) && teor > 0 ? Math.min(100, Math.round(teor * 10) / 10) : 0,
      perfil: { docura: nota(d.docura), amargor: nota(d.amargor), acidez: nota(d.acidez), intensidade: nota(d.intensidade) },
      notas: String(d.notas ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 8),
      resumo: String(d.resumo ?? '').trim().slice(0, 200),
      ingredientes: String(d.ingredientes ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 20),
    };
  }
  const noCardapio = (d: Dados) => d.status === 'Ativo' && d.noCardapio !== 'Não';
  /** Cópias só com o que pode ser visto por mais gente: cardápio (público) e nomes para vincular registros (equipe). */
  function espelhar(lote: WriteBatch, col: string, id: string, d: Dados | null) {
    if (col === 'produtos') {
      const ref = doc(db, 'cardapio', id);
      if (d && noCardapio(d)) lote.set(ref, itemDoCardapio(d));
      else lote.delete(ref);
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
  /** Coleções que crescem com o tempo e o campo de data usado para carregar só um período. */
  const CAMPO_DATA: Record<string, string> = { receitas: 'data', despesas: 'data', consumos: 'data', reservas: 'data', comandas: 'abertaEm', caixas: 'abertoEm' };
  function colecaoDesde(col: string, desde: string | null) {
    const campo = CAMPO_DATA[col];
    if (!campo || !desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde)) return colecao(col);
    const periodo = lista(`${col}@desde:${desde}`, query(collection(db, col), where(campo, '>=', desde)));
    if (col !== 'despesas') return periodo;
    // contas em aberto aparecem sempre, mesmo as lançadas antes do período
    return Promise.all([periodo, lista('despesas@a-pagar', query(collection(db, 'despesas'), where('status', '==', 'A pagar')))])
      .then(([a, b]) => ordenar([...a, ...b.filter((x) => !a.some((y) => y.id === x.id))]));
  }
  /** Um registro só (sem carregar a coleção inteira). */
  async function registro(col: string, id: string): Promise<Dados | null> {
    const s = await getDoc(doc(db, col, id));
    return s.exists() ? { ...s.data(), id: s.id } : null;
  }
  /** Grava cada PDF novo (registro do anexo + partes) num lote próprio; se algum falhar, apaga os que já foram. */
  async function enviarAnexos(ctx: Ctx, col: string, registroId: string, novos: AnexoNovo[]): Promise<Anexo[]> {
    const feitos: Anexo[] = [];
    try {
      for (const a of novos) {
        const ref = doc(collection(db, 'anexos'));
        const partes = Math.max(1, Math.ceil(a.dados.length / ANEXO_PARTE));
        const criadoEm = now();
        const lote = writeBatch(db);
        lote.set(ref, { colecao: col, registroId, nome: a.nome, tamanho: a.tamanho, partes, criadoPor: ctx.usuario.id, criadoEm });
        for (let i = 0; i < partes; i++) {
          lote.set(doc(db, 'anexos', ref.id, 'partes', String(i)), { dados: a.dados.slice(i * ANEXO_PARTE, (i + 1) * ANEXO_PARTE) });
        }
        await lote.commit();
        feitos.push({ id: ref.id, nome: a.nome, tamanho: a.tamanho, partes, criadoEm });
      }
    } catch (e) {
      if (feitos.length) {
        const lote = writeBatch(db);
        apagarAnexos(lote, feitos);
        await lote.commit().catch(() => undefined);
      }
      throw e;
    }
    return feitos;
  }
  function apagarAnexos(lote: WriteBatch, anexos: Anexo[]) {
    for (const a of anexos) {
      for (let i = 0; i < (Number(a.partes) || 1); i++) lote.delete(doc(db, 'anexos', a.id, 'partes', String(i)));
      lote.delete(doc(db, 'anexos', a.id));
    }
  }
  /** Confere a quantidade de anexos e se o cadastro aceita PDF. */
  function conferirAnexos(col: string, total: number, novos: AnexoNovo[]) {
    if (novos.length && !COM_ANEXOS.includes(col)) fail(400, 'Este cadastro não aceita anexos.');
    if (total > ANEXOS_POR_REGISTRO) fail(400, `Cada registro aceita até ${ANEXOS_POR_REGISTRO} PDFs.`);
  }
  const resumoAnexos = (novos: number, removidos: number) =>
    [novos ? `${novos} PDF${novos > 1 ? 's' : ''} anexado${novos > 1 ? 's' : ''}` : '', removidos ? `${removidos} PDF${removidos > 1 ? 's' : ''} removido${removidos > 1 ? 's' : ''}` : '']
      .filter(Boolean).join(' · ');

  /* CRM: chave da IA que lê as notas fiscais (Google Gemini, cota gratuita). Fica no banco, legível só pela equipe logada:
   * fora do código do site, que é público. Só quem edita Configurações troca a chave. */
  rota('GET', '/crm/ia/chave', async () => {
    await requireUsuario();
    const d = (await getDoc(doc(db, 'segredos', 'ia'))).data();
    return { chave: d?.chave ?? '', modelo: d?.modelo ?? '' };
  });
  rota('PUT', '/crm/ia/chave', async ({ b }) => {
    const ctx = await requireUsuario();
    requireAccess(ctx, 'parametros', 'editar');
    const chave = str(b.chave, 300).replace(/\s+/g, ''), modelo = str(b.modelo, 80);
    if (chave && !/^[A-Za-z0-9._-]{20,300}$/.test(chave)) fail(400, 'Chave inválida. Copie a chave inteira do Google AI Studio.');
    const lote = writeBatch(db);
    lote.set(doc(db, 'segredos', 'ia'), { chave, modelo, atualizadoEm: now(), atualizadoPor: ctx.usuario.id });
    registrar(lote, ctx, 'parametros', chave ? 'configurou a IA de leitura de notas' : 'removeu a chave da IA de leitura de notas');
    await lote.commit();
    return { ok: true };
  });

  /* CRM: abrir um PDF anexado (junta as partes) */
  rota('GET', '/crm/anexos/:id', async ({ p }) => {
    const ctx = await requireUsuario();
    const meta = (await getDoc(doc(db, 'anexos', p.id))).data();
    if (!meta) return fail(404, 'Arquivo não encontrado.');
    requireColecao(ctx, meta.colecao, 'ver');
    const partes = await Promise.all(Array.from({ length: Number(meta.partes) || 1 }, (_, i) => getDoc(doc(db, 'anexos', p.id, 'partes', String(i)))));
    if (partes.some((s) => !s.exists())) fail(404, 'Arquivo incompleto. Envie o PDF novamente.');
    return { nome: meta.nome, tamanho: meta.tamanho, dados: partes.map((s) => String(s.data()?.dados ?? '')).join('') };
  });

  /* ---------- entrada de notas (compras) ----------
   * Cada item da nota soma no Estoque ou nos Materiais, no local escolhido, e atualiza o custo do item.
   * Itens do Estoque também atualizam a Tabela de preços daquele fornecedor (se a pessoa tiver acesso ao Administrativo).
   * Excluir a nota tira as quantidades de volta (sem deixar negativo). */
  interface ItemCompra { destino: 'estoque' | 'materiais'; itemId: string | null; nome: string; quantidade: number; local: string; valorUnitario: number; unidade: string; categoria: string; tipo: string }
  function validarItensCompra(v: unknown): ItemCompra[] {
    if (!Array.isArray(v) || !v.length) return fail(400, 'Inclua pelo menos um item na nota.');
    if (v.length > 80) fail(400, 'A nota aceita até 80 itens.');
    return v.map((i: Dados, k) => {
      const nome = str(i?.nome, 120), quantidade = Number(i?.quantidade), valorUnitario = Number(i?.valorUnitario);
      if (!nome) fail(400, `Informe o item da linha ${k + 1}.`);
      if (!(quantidade > 0 && quantidade <= 1_000_000)) fail(400, `Quantidade inválida em "${nome}".`);
      if (!(valorUnitario >= 0 && valorUnitario <= 1_000_000)) fail(400, `Valor inválido em "${nome}".`);
      return {
        destino: i.destino === 'materiais' ? 'materiais' : 'estoque', itemId: i.itemId ? str(i.itemId, 128) : null, nome,
        quantidade: Math.round(quantidade * 1000) / 1000, local: str(i.local, 40) || 'Depósito', valorUnitario: Math.round(valorUnitario * 100) / 100,
        unidade: str(i.unidade, 10) || 'un', categoria: str(i.categoria, 40), tipo: str(i.tipo, 40),
      };
    });
  }
  /** Locais do item (os antigos, só com quantidade e local, viram um local só) com a quantidade somada (ou tirada). */
  function locaisSomados(cur: Dados | null, local: string, qtd: number) {
    const l: Record<string, number> = {};
    if (cur?.locais && typeof cur.locais === 'object') for (const [k, v] of Object.entries(cur.locais)) l[k] = Number(v) || 0;
    else if (Number(cur?.quantidade) > 0) l[String(cur?.local || 'Depósito')] = Number(cur?.quantidade);
    l[local] = Math.max(0, Math.round(((l[local] ?? 0) + qtd) * 1000) / 1000);
    for (const k of Object.keys(l)) if (!l[k]) delete l[k];
    const quantidade = Math.round(Object.values(l).reduce((t, x) => t + x, 0) * 1000) / 1000;
    const principal = Object.entries(l).sort((a, b) => b[1] - a[1])[0]?.[0] ?? local;
    return { locais: l, quantidade, principal };
  }
  async function aplicarCompra(lote: WriteBatch, ctx: Ctx, compra: Dados, sinal: 1 | -1) {
    const t = now();
    const itens = compra.itens as ItemCompra[];
    const precos = sinal > 0 && compra.fornecedorId && ctx.acoes('precos').some((a) => a === 'criar' || a === 'editar') ? await colecao('precos') : [];
    for (const it of itens) {
      const col = it.destino;
      const cur = it.itemId ? await registro(col, it.itemId) : null;
      if (!cur && sinal < 0) continue;
      const { locais, quantidade, principal } = locaisSomados(cur, it.local, sinal * it.quantidade);
      let item: Dados;
      if (cur) {
        requireAnyAccess(ctx, ['compras', 'estoque', 'materiais'], 'editar');
        const patch: Dados = { locais, quantidade, atualizadoEm: t };
        if (col === 'materiais') patch.local = principal;
        // a unidade trocada na nota corrige o cadastro (ex.: gin cadastrado em "ml" que é comprado por garrafa)
        if (sinal > 0 && col === 'estoque' && it.unidade && it.unidade !== cur.unidade) patch.unidade = it.unidade;
        if (sinal > 0 && col === 'estoque') Object.assign(patch, { custo: it.valorUnitario, ...(compra.fornecedor ? { fornecedor: compra.fornecedor, fornecedorId: compra.fornecedorId ?? null } : {}) });
        if (sinal > 0 && col === 'materiais') Object.assign(patch, { valor: it.valorUnitario, aquisicao: compra.data || '', ...(compra.fornecedor ? { fornecedor: compra.fornecedor, fornecedorId: compra.fornecedorId ?? null } : {}) });
        lote.update(doc(db, col, cur.id), patch);
        item = { ...cur, ...patch };
      } else {
        // item novo: nasce já com a quantidade da nota
        const ref = doc(collection(db, col));
        it.itemId = ref.id;
        item = col === 'estoque'
          ? { item: it.nome, categoria: it.categoria || 'Outros', unidade: it.unidade || 'un', locais, quantidade, custo: it.valorUnitario, fornecedor: compra.fornecedor ?? '', fornecedorId: compra.fornecedorId ?? null, criadoEm: t, atualizadoEm: t }
          : { material: it.nome, tipo: it.tipo || 'Utensílio', locais, quantidade, local: principal, estado: 'Novo', valor: it.valorUnitario, aquisicao: compra.data || '', fornecedor: compra.fornecedor ?? '', fornecedorId: compra.fornecedorId ?? null, criadoEm: t, atualizadoEm: t };
        lote.set(ref, item);
        item.id = ref.id;
      }
      // Tabela de preços: o preço desta compra passa a ser o preço do fornecedor para o item
      if (sinal > 0 && col === 'estoque' && compra.fornecedorId && (precos.length || ctx.acoes('precos').length)) {
        const un = String(item.unidade || 'un'), conteudo = Number(item.conteudo) || 0, cu = String(item.conteudoUnidade ?? '');
        const comConteudo = conteudo > 0 && MEDIDAS.includes(cu) && !MEDIDAS.includes(un);
        const dadosPreco = {
          insumo: it.nome, insumoId: item.id, fornecedor: compra.fornecedor, fornecedorId: compra.fornecedorId, preco: it.valorUnitario,
          embalagem: comConteudo ? `1 ${un} (${conteudo.toLocaleString('pt-BR')} ${cu})` : `1 ${un}`,
          conteudo: comConteudo ? conteudo : 1, unidade: comConteudo ? cu : un, data: compra.data || t.slice(0, 10), status: 'Ativo',
          observacoes: `Atualizado pela nota ${compra.numero || 'sem número'}.`, atualizadoEm: t,
        };
        const existente = precos.find((x) => x.fornecedorId === compra.fornecedorId && x.insumoId === item.id);
        if (existente) lote.update(doc(db, 'precos', existente.id), dadosPreco);
        else lote.set(doc(collection(db, 'precos')), { ...dadosPreco, criadoEm: t });
      }
    }
  }

  rota('GET', '/crm/c/:col', async ({ p, q }) => {
    const ctx = await requireUsuario();
    // consumos e resgates também alimentam o resumo de clientes, visto por Vendas e Marketing
    if (['consumos', 'resgates'].includes(p.col)) requireAnyAccess(ctx, [p.col, 'clientes', 'recompensas'], 'ver');
    // o Resultado (DRE, ticket médio e renda) lê receitas e despesas; o Calendário, as reservas
    else if (['receitas', 'despesas'].includes(p.col)) requireAnyAccess(ctx, [...(PAGINAS_DA_COLECAO[p.col] ?? [p.col]), 'resultado', 'ticket', 'renda'], 'ver');
    else if (p.col === 'reservas') requireAnyAccess(ctx, ['reservas', 'eventos'], 'ver');
    else requireColecao(ctx, p.col, 'ver');
    // ?desde=AAAA-MM-DD carrega só o período (receitas, despesas, consumos e reservas)
    const linhas = await colecaoDesde(p.col, q.get('desde'));
    // ao abrir os produtos, quem edita Vendas acerta o cardápio público com o que mudou (fotos, perfil da bebida…)
    if (p.col === 'produtos' && ctx.acoes('produtos').includes('editar')) await sincronizarCardapio(linhas).catch(() => undefined);
    return p.col === 'funcoes' ? linhas.map(comNomeDaFuncao) : linhas;
  });
  /** JSON com as chaves em ordem, para comparar dois objetos. */
  const canon = (v: unknown): string => Array.isArray(v) ? `[${v.map(canon).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Dados)[k])}`).join(',')}}`
    : JSON.stringify(v);
  async function sincronizarCardapio(produtos: Dados[]) {
    const atual = new Map((await colecao('cardapio')).map((c) => { const { id, ...resto } = c; return [String(id), JSON.stringify(resto)]; }));
    const lote = writeBatch(db);
    let n = 0;
    for (const prod of produtos) {
      if (n >= 400) break;
      const id = String(prod.id), ref = doc(db, 'cardapio', id);
      if (noCardapio(prod)) {
        const item = itemDoCardapio(prod);
        const salvo = atual.get(id);
        if (!salvo || canon(JSON.parse(salvo)) !== canon(item)) { lote.set(ref, item); n++; }
      } else if (atual.has(id)) { lote.delete(ref); n++; }
    }
    if (n) await lote.commit();
  }
  rota('POST', '/crm/c/:col', async ({ p, b }) => {
    const ctx = await requireUsuario();
    requireColecao(ctx, p.col, 'criar');
    if (['consumos', 'resgates', 'caixas', 'comandas'].includes(p.col)) fail(400, 'Use o fluxo próprio deste módulo.');
    const t = now();
    const { resto, novos } = separarAnexos(b);
    conferirAnexos(p.col, novos.length, novos);
    const dados: Dados = { ...limpar(validarRegistro(resto)), criadoEm: t, atualizadoEm: t };
    if (p.col === 'funcoes') dados.sistema = false;
    await vincularCliente(p.col, dados);
    const ref = doc(collection(db, p.col));
    // os PDFs sobem antes (cada um no seu lote, por causa do tamanho); se o registro não for gravado, são apagados
    if (p.col === 'compras') {
      dados.itens = validarItensCompra(dados.itens);
      dados.valor = Math.round((dados.itens as ItemCompra[]).reduce((s, i) => s + i.quantidade * i.valorUnitario, 0) * 100) / 100;
    }
    const enviados = await enviarAnexos(ctx, p.col, ref.id, novos);
    if (enviados.length) dados.anexos = enviados;
    const lote = writeBatch(db);
    if (p.col === 'compras') await aplicarCompra(lote, ctx, dados, 1);
    lote.set(ref, dados);
    espelhar(lote, p.col, ref.id, dados);
    const criado = paraHistorico(dados);
    registrar(lote, ctx, collectionArea(p.col), `cadastrou ${REGISTRO[p.col] ?? 'o registro'}`, {
      colecao: p.col, alvo: nomeDe(dados), detalhe: [valorDe(dados), resumoAnexos(enviados.length, 0)].filter(Boolean).join(' · '),
      registroId: ref.id, depois: criado.valores, omitidos: criado.omitidos,
    });
    try {
      await lote.commit();
    } catch (e) {
      if (enviados.length) { const l = writeBatch(db); apagarAnexos(l, enviados); await l.commit().catch(() => undefined); }
      throw e;
    }
    return { ...dados, id: ref.id };
  });
  rota('PUT', '/crm/c/:col/:id', async ({ p, b }) => {
    const ctx = await requireUsuario();
    requireColecao(ctx, p.col, 'editar');
    const { resto, manter, novos } = separarAnexos(b);
    validarRegistro(resto);
    const cur = await registro(p.col, p.id);
    if (!cur) return fail(404, 'Registro não encontrado.');
    const patch: Dados = { ...limpar(resto), atualizadoEm: now() };
    // sem a lista `anexos` no corpo (ex.: ações rápidas da tabela), os anexos ficam como estão
    const atuais = anexosDe(cur);
    const mantidos = manter ? atuais.filter((a) => manter.has(a.id)) : atuais;
    const removidos = atuais.filter((a) => !mantidos.includes(a));
    conferirAnexos(p.col, mantidos.length + novos.length, novos);
    if (p.col === 'funcoes') {
      if (cur.sistema) fail(400, 'A função Presidência não pode ser alterada.');
      patch.sistema = false;
    }
    if (p.col === 'consumos') fail(400, 'Consumos não podem ser editados. Exclua e lance novamente.');
    if (['caixas', 'comandas'].includes(p.col)) fail(400, 'Use o fluxo próprio deste módulo.');
    // os itens de uma nota já foram somados ao estoque: para corrigir, exclua a nota (estorna) e lance de novo
    if (p.col === 'compras') { delete patch.itens; delete patch.valor; }
    if (p.col === 'receitas' && cur.consumoId) fail(400, 'Receitas geradas por consumo são alteradas pelo lançamento de consumo.');
    const lote = writeBatch(db);
    if (p.col === 'resgates') {
      const status = str(b.status, 30);
      lote.update(doc(db, 'resgates', p.id), { status, atualizadoEm: patch.atualizadoEm });
      // cancelar um voucher devolve os pontos; reativar volta a debitar
      const antes = cur.status === 'Cancelado', depois = status === 'Cancelado';
      if (antes && !depois && cur.clienteUid) {
        const s = await saldoDe(cur.clienteUid);
        if (s.acumulados - s.usados < (Number(cur.custo) || 0)) fail(400, 'O cliente não tem pontos suficientes para reativar este voucher.');
      }
      if (antes !== depois && cur.clienteUid) {
        lote.set(doc(db, 'saldos', cur.clienteUid), { usados: increment((depois ? -1 : 1) * (Number(cur.custo) || 0)) }, { merge: true });
      }
      if (status !== cur.status) {
        registrar(lote, ctx, 'resgates', 'alterou o voucher', { colecao: 'resgates', alvo: `${cur.codigo ?? ''} · ${cur.recompensa ?? ''}`, detalhe: `Status: ${cur.status} → ${status}` });
      }
      await lote.commit();
      return { ...cur, status };
    }
    await vincularCliente(p.col, patch);
    const enviados = await enviarAnexos(ctx, p.col, p.id, novos);
    if (enviados.length || removidos.length) patch.anexos = [...mantidos, ...enviados];
    lote.update(doc(db, p.col, p.id), patch);
    apagarAnexos(lote, removidos);
    espelhar(lote, p.col, p.id, { ...cur, ...patch });
    const novoStatus = typeof patch.status === 'string' && patch.status !== cur.status ? `Status: ${cur.status ?? '—'} → ${patch.status}` : '';
    registrar(lote, ctx, collectionArea(p.col), `alterou ${REGISTRO[p.col] ?? 'o registro'}`, {
      colecao: p.col, alvo: nomeDe({ ...cur, ...patch }),
      detalhe: [novoStatus, valorDe({ ...cur, ...patch }), resumoAnexos(enviados.length, removidos.length)].filter(Boolean).join(' · '),
      registroId: p.id, ...diferencas(cur, patch),
    });
    try {
      await lote.commit();
    } catch (e) {
      if (enviados.length) { const l = writeBatch(db); apagarAnexos(l, enviados); await l.commit().catch(() => undefined); }
      throw e;
    }
    return { ...cur, ...patch };
  });
  /** Exclui um registro com os efeitos do módulo (estornos, espelhos, PDFs); `desfaz` = atividade que esta exclusão desfaz. */
  async function excluirRegistro(ctx: Ctx, col: string, id: string, desfaz?: string) {
    const p = { col, id };
    requireColecao(ctx, p.col, 'excluir');
    const cur = await registro(p.col, p.id);
    if (!cur) return fail(404, 'Registro não encontrado.');
    if (p.col === 'funcoes') {
      if (cur.sistema) fail(400, 'A função Presidência não pode ser excluída.');
      if ((await colecao('usuarios')).some((u) => u.funcaoId === p.id)) fail(400, 'Há usuários com esta função. Altere-os antes de excluir.');
    }
    if (p.col === 'receitas' && cur.consumoId) fail(400, 'Esta receita veio de um consumo. Exclua o consumo para estorná-la.');
    if (p.col === 'resgates') fail(400, 'Resgates não são excluídos. Altere o status para Cancelado.');
    if (p.col === 'caixas') fail(400, 'Caixas não são excluídos: o histórico de aberturas e fechamentos fica guardado.');
    if (p.col === 'comandas' && cur.status === 'Fechada') fail(400, 'Comandas fechadas não são excluídas. Estorne a venda em Lançar consumo ou em Receitas.');
    // venda de caixa fechado não se estorna mais: o fechamento já conferiu o que entrou
    if (['consumos', 'receitas'].includes(p.col) && cur.caixaId && (await registro('caixas', String(cur.caixaId)))?.status !== 'Aberto') {
      fail(400, 'O caixa desta venda já foi fechado: ela não pode mais ser estornada.');
    }
    if (p.col === 'consumos' && cur.clienteUid) {
      // o estorno não pode deixar o saldo negativo: pontos já trocados por vouchers não voltam sozinhos
      const s = await saldoDe(cur.clienteUid);
      const pontos = Number(cur.pontos) || 0;
      if (s.acumulados - pontos < s.usados) {
        fail(400, `O cliente já usou parte destes pontos em vouchers (saldo atual: ${s.acumulados - s.usados}, o estorno retira ${pontos}). Cancele os vouchers antes de estornar o consumo.`);
      }
    }
    const lote = writeBatch(db);
    // a venda estornada sai também do caixa (que, acima, já se viu que está aberto)
    if (['consumos', 'receitas'].includes(p.col) && cur.caixaId) {
      somarNoCaixa(lote, String(cur.caixaId), String(cur.formaPagamento), -(Number(cur.valor) || 0), -1);
    }
    if (p.col === 'consumos') {
      // excluir o lançamento estorna a receita e os pontos
      if (cur.receitaId) lote.delete(doc(db, 'receitas', cur.receitaId));
      if (cur.clienteUid) {
        // a visita do dia só sai do total se não sobrar outro consumo do afilhado no mesmo dia
        const dia = String(cur.data).slice(0, 10);
        const outros = (await doCliente('consumos', cur.clienteUid)).some((x) => x.id !== cur.id && String(x.data).slice(0, 10) === dia);
        lote.set(doc(db, 'saldos', cur.clienteUid), {
          acumulados: increment(-(Number(cur.pontos) || 0)), gasto: increment(-(Number(cur.valor) || 0)), lancamentos: increment(-1),
          ...(outros ? {} : { dias: arrayRemove(dia) }),
        }, { merge: true });
      }
    }
    if (p.col === 'compras' && Array.isArray(cur.itens)) await aplicarCompra(lote, ctx, cur, -1);
    lote.delete(doc(db, p.col, p.id));
    apagarAnexos(lote, anexosDe(cur));
    espelhar(lote, p.col, p.id, null);
    const excluido = paraHistorico(cur);
    registrar(lote, ctx, collectionArea(p.col), desfaz ? `desfez o cadastro d${(REGISTRO[p.col] ?? 'o registro').slice(0, 1) === 'a' ? 'a' : 'o'} ${(REGISTRO[p.col] ?? 'o registro').slice(2)}` : `excluiu ${REGISTRO[p.col] ?? 'o registro'}`, {
      colecao: p.col, alvo: nomeDe(cur), detalhe: valorDe(cur), registroId: p.id, antes: excluido.valores, omitidos: excluido.omitidos, desfaz,
    });
    await lote.commit();
    return { ok: true };
  }
  rota('DELETE', '/crm/c/:col/:id', async ({ p }) => excluirRegistro(await requireUsuario(), p.col, p.id));

  /* Logs de alterações: desfazer uma alteração, apagar o que foi cadastrado ou restaurar o que foi excluído.
   * Vale a permissão do cadastro (editar, excluir ou criar); módulos com efeitos próprios (estoque, pontos) ficam de fora. */
  const SEM_DESFAZER = ['consumos', 'resgates', 'compras'];
  rota('POST', '/crm/atividades/:area/:id/desfazer', async ({ p, b }) => {
    const ctx = await requireUsuario();
    const at = await documento(`atividades/${p.area}/itens/${p.id}`);
    if (!at) return fail(404, 'Atividade não encontrada.');
    const col = String(at.colecao ?? ''), id = String(at.registroId ?? '');
    if (!COLLECTIONS[col] || !id) return fail(400, 'Esta atividade foi registrada antes do histórico detalhado e não pode ser desfeita.');
    if (SEM_DESFAZER.includes(col)) return fail(400, 'Este cadastro tem efeitos próprios (estoque, pontos ou receitas): corrija pelo próprio módulo.');
    const acao = String(at.acao ?? '');
    const omitidos = new Set<string>(Array.isArray(at.omitidos) ? at.omitidos : []);
    const voltar = (d: unknown) => Object.fromEntries(Object.entries((d ?? {}) as Dados).filter(([k]) => !omitidos.has(k) && !NAO_VOLTAM.includes(k)));
    const nome = REGISTRO[col] ?? 'o registro';
    const cur = await registro(col, id);
    if (acao.startsWith('cadastrou')) {
      if (!cur) return fail(400, 'Esse registro já foi excluído.');
      return excluirRegistro(ctx, col, id, p.id);
    }
    if (acao.startsWith('excluiu')) {
      requireColecao(ctx, col, 'criar');
      if (cur) return fail(400, 'Esse registro já existe de novo (talvez já tenha sido restaurado).');
      const dados: Dados = { ...voltar(at.antes), atualizadoEm: now() };
      if (col === 'funcoes') dados.sistema = false;
      const lote = writeBatch(db);
      lote.set(doc(db, col, id), dados);
      espelhar(lote, col, id, dados);
      registrar(lote, ctx, collectionArea(col), `restaurou ${nome}`, {
        colecao: col, alvo: nomeDe(dados), detalhe: omitidos.size ? 'sem a foto e os PDFs, que não voltam' : valorDe(dados),
        registroId: id, depois: paraHistorico(dados).valores, desfaz: p.id,
      });
      await lote.commit();
      return { ok: true };
    }
    if (acao.startsWith('alterou') || acao.startsWith('desfez a alteração')) {
      requireColecao(ctx, col, 'editar');
      if (!cur) return fail(400, 'Esse registro foi excluído depois: restaure-o primeiro.');
      if (col === 'funcoes' && cur.sistema) fail(400, 'A função Presidência não pode ser alterada.');
      if (col === 'receitas' && cur.consumoId) fail(400, 'Receitas geradas por consumo são alteradas pelo lançamento de consumo.');
      const volta = voltar(at.antes);
      if (!Object.keys(volta).length) return fail(400, 'Não há o que desfazer: só mudaram a foto ou os PDFs, que não ficam no histórico.');
      // mudou de novo depois? avisa antes de sobrescrever
      const mudouDepois = Object.keys(volta).filter((k) => !igual(cur[k], (at.depois as Dados | undefined)?.[k]));
      if (mudouDepois.length && b?.forcar !== true) return fail(409, `Esse registro foi alterado de novo depois (${mudouDepois.length} ${mudouDepois.length === 1 ? 'campo' : 'campos'}). Desfazer vai sobrescrever essas mudanças.`);
      const patch: Dados = { ...volta, atualizadoEm: now() };
      await vincularCliente(col, patch);
      const lote = writeBatch(db);
      lote.update(doc(db, col, id), patch);
      espelhar(lote, col, id, { ...cur, ...patch });
      registrar(lote, ctx, collectionArea(col), `desfez a alteração em ${nome}`, {
        colecao: col, alvo: nomeDe({ ...cur, ...patch }), registroId: id, ...diferencas(cur, patch), desfaz: p.id,
      });
      await lote.commit();
      return { ok: true };
    }
    return fail(400, 'Esta atividade não pode ser desfeita.');
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

  // só nos builds de teste (emulador, ou VITE_EXPOR_API=1 num build local que nunca é publicado): permite chamar as rotas pelo console
  if (EMULADOR || import.meta.env.VITE_EXPOR_API === '1') (globalThis as Dados)[`__dindo_${kind}`] = request;

  return {
    request,
    /** Identificador da sessão atual (só é confiável depois da primeira chamada a `request`). */
    uid: () => auth.currentUser?.uid ?? null,
    sair,
  };
}
