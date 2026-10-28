import type { Row } from './lib/data';
import { brl, daysUntil, isoToday, num, pct } from './lib/format';
import { calcularFicha, fichaDe, precoNormalizado } from './lib/ficha';
import { locaisDe, resumoLocais } from './lib/locais';

export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'email' | 'phone' | 'percent' | 'cnpj' | 'time' | 'ref' | 'url' | 'check';

/** Listas que podem ser vinculadas (servidas por /api/crm/referencias/:tipo). */
export type RefSource = 'pessoas' | 'colaboradores' | 'fornecedores' | 'clientes' | 'insumos' | 'copos' | 'utensilios' | 'materiais';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  /** Não exibir na tabela (apenas no formulário). */
  formOnly?: boolean;
  /** Ocupa a linha inteira no formulário. */
  wide?: boolean;
  placeholder?: string;
  default?: string | number;
  /** Limites de campos numéricos (number, money, percent). */
  min?: number;
  max?: number;
  /** Casas decimais de campos "number" (padrão: inteiro). */
  decimals?: number;
  /** Campo de vínculo: de qual lista escolher. O nome fica em `key` e o identificador em `refKey`. */
  ref?: RefSource;
  refKey?: string;
  /** Permite digitar um nome que não está na lista. */
  livre?: boolean;
  /** Vínculo que aceita mais de um (ex.: vários fornecedores): o primeiro fica em `key`/`refKey` e os demais nesta chave, como lista de { nome, id }. */
  outros?: string;
  /** Link (url) que aceita mais de um (ex.: loja alternativa): o primeiro fica em `key` e os demais nesta chave, como lista de textos. */
  outrosLinks?: string;
  /** Campo de link (url): vira um botão na linha da tabela ("comprar" = carrinho, "site" = site do fornecedor). */
  acao?: 'comprar' | 'site';
  /** Ao escolher um item, copia outros dados dele (campo do registro → campo do item). */
  fill?: Record<string, string>;
  /** Só fica editável com a caixinha (campo "check") desta chave marcada. */
  ativadoPor?: string;
  /** Só aparece no formulário (e só é obrigatório) quando a condição vale (ex.: preço só nos produtos sem tamanhos). */
  mostrarSe?: (d: Record<string, unknown>) => boolean;
}

export interface Vinculo { nome: string; id: string | number | null }

/** Todos os vínculos de um campo que aceita mais de um: o principal primeiro e depois os outros (registros antigos têm só o principal). */
export function vinculosDe(r: Record<string, unknown>, f: Field): Vinculo[] {
  const principal: Vinculo = { nome: String(r[f.key] ?? ''), id: (r[f.refKey!] as Vinculo['id']) ?? null };
  const outros = f.outros && Array.isArray(r[f.outros]) ? (r[f.outros] as Vinculo[]).map((v) => ({ nome: String(v?.nome ?? ''), id: v?.id ?? null })) : [];
  return [principal, ...outros];
}

/** Todos os links de um campo que aceita mais de um: o principal primeiro e depois os outros (sem os vazios). */
export function linksDe(r: Record<string, unknown>, f: Field): string[] {
  const outros = f.outrosLinks && Array.isArray(r[f.outrosLinks]) ? (r[f.outrosLinks] as unknown[]) : [];
  return [r[f.key], ...outros].map((v) => String(v ?? '').trim()).filter(Boolean);
}

/** Limites efetivos de um campo numérico, com padrões seguros por tipo. */
export function numberSpec(f: Field) {
  if (f.type === 'money') return { money: true, decimals: 2, min: f.min ?? 0, max: f.max ?? 9_999_999.99 };
  if (f.type === 'percent') return { decimals: f.decimals ?? 1, min: f.min ?? 0, max: f.max ?? 100 };
  return { decimals: f.decimals ?? 0, min: f.min ?? 0, max: f.max ?? 999_999 };
}

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral';

export interface Computed {
  label: string;
  get: (r: Row) => string | number | null;
  /** "nivel": barra de 0 a 1 (o `get` devolve a fração), com o `detalhe` embaixo. */
  format?: 'money' | 'number' | 'percent' | 'badge' | 'text' | 'nivel';
  tone?: (r: Row) => Tone;
  detalhe?: (r: Row) => string;
}

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}

export interface CollectionDef {
  id: string;
  /** Permissão (módulo) do cadastro: o próprio cadastro. */
  area: string;
  title: string;
  description: string;
  singular: string;
  /** Substantivo feminino (ajusta 'novo/nova', 'nenhum/nenhuma'). */
  feminino?: boolean;
  fields: Field[];
  computed?: Computed[];
  kpis?: (rows: Row[]) => Kpi[];
  /** Campo select usado como filtro rápido acima da tabela. */
  filterKey?: string;
  /** Filtros extras acima da tabela, com os valores que existem nos registros (ex.: por insumo, por fornecedor). */
  filtros?: string[];
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  /** Cada registro pode ter uma foto (miniatura na tabela, campo no formulário e imagem nas exportações). */
  comFoto?: boolean;
  /** Aceita PDFs anexados (currículo, contratos, notas fiscais…): o texto é o rótulo do campo no formulário. */
  anexos?: string;
  /** Produtos: ficha técnica com insumos, custo por porção, CMV e preço sugerido. */
  fichaTecnica?: boolean;
  /** Entrada de notas: itens da compra (somados ao Estoque ou aos Materiais) e leitura da nota por IA. */
  compra?: boolean;
  /** Logo depois de cadastrar, abre "Lançar despesa" já preenchida. */
  lancarAoCriar?: boolean;
  /** Quantidade guardada por local (Bar, Depósito…), com botão de transferir entre locais. */
  porLocal?: boolean;
  /** No cadastro do fornecedor, mostra os itens que temos dele (Estoque, Materiais e Tabela de preços). */
  itensDoFornecedor?: boolean;
  /** Botão "Foto no padrão do Dindo" (Gemini): itens do Estoque no depósito; bens do Patrimônio no salão do bar. */
  fotoPadrao?: 'estoque' | 'patrimonio';
  /** Segunda foto opcional (rótulo do campo), guardada em `fotoJunto`. */
  fotoJunto?: string;
  /** Foto guardada em tamanho maior (mídias e artes), para ver ampliada. */
  fotoGrande?: boolean;
  /** Botão "Preencher com IA" (descrição, ingredientes e perfil da bebida) no cadastro do produto. */
  iaProduto?: boolean;
  /** A ficha técnica vem antes dos outros campos no formulário (tela "Fichas técnicas"). */
  fichaPrimeiro?: boolean;
  /** Produtos: um item principal (ex.: chopp) agrupa tamanhos; cada tamanho é um produto próprio, com preço e ficha técnica. */
  tamanhos?: boolean;
  /** Registros que não aparecem na lista (continuam nos indicadores); recebe os filtros extras escolhidos. */
  ocultarNaLista?: (r: Row, filtros: Record<string, string>) => boolean;
  /** Como um registro deste módulo vira despesa no DRE: pré-preenche a tela "Lançar despesa" (a pessoa confere antes de lançar). */
  despesa?: (r: Row) => DespesaSugerida;
}

export interface DespesaSugerida {
  descricao: string;
  categoria: string;
  valor: number;
}

const n = (v: unknown) => Number(v) || 0;
const s = (v: unknown) => String(v ?? '');
const count = (rows: Row[], key: string, values: string[]) => rows.filter((r) => values.includes(s(r[key]))).length;
const sum = (rows: Row[], key: string) => rows.reduce((t, r) => t + n(r[key]), 0);
const juntar = (...partes: unknown[]) => partes.map(s).filter(Boolean).join(' · ');

const MEDIDAS = ['kg', 'g', 'L', 'ml'];
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/**
 * Nível do item do Estoque (barra): o saldo contra a quantidade cheia. A referência é o campo `cheio`, que a Entrada de notas
 * atualiza sozinha (o total logo depois da última compra) e que dá para ajustar à mão. Sem ela, o item contado em unidades com
 * conteúdo (ex.: barril de 50 L) usa as unidades inteiras: 2,4 barris = 3 barris, um deles aberto com 40%.
 */
export function nivelEstoque(r: Record<string, unknown>) {
  const q = Math.max(0, n(r.quantidade)), un = s(r.unidade) || 'un';
  const conteudo = n(r.conteudo), cu = s(r.conteudoUnidade) || 'ml';
  const porUnidade = conteudo > 0 && !MEDIDAS.includes(un);
  const cheio = n(r.cheio) > 0 ? n(r.cheio) : porUnidade ? Math.max(1, Math.ceil(q - 1e-6)) : 0;
  if (!(cheio > 0)) return null;
  // pode passar de 1 (ex.: chegou mais um barril além da quantidade cheia): a barra mostra o excesso
  const fracao = q / cheio;
  // a unidade aberta (barril, garrafa): quanto resta nela
  const resto = porUnidade ? q - Math.floor(q + 1e-6) : 0;
  const aberto = resto > 1e-6 ? ` · aberto: ${qtd(resto * conteudo)} ${cu}` : '';
  const tone: Tone = (n(r.minimo) && q <= n(r.minimo)) || fracao <= 0.25 ? 'bad' : fracao <= 0.5 ? 'warn' : 'good';
  return { fracao, tone, detalhe: `${qtd(q)} de ${qtd(cheio)} ${un}${aberto}` };
}

/** Produto principal com tamanhos (ex.: Chopp Pilsen): não é vendido nem conta como item; cada tamanho é um produto. */
export const temTamanhos = (r: Record<string, unknown>) => r.comTamanhos === 'Sim' && !r.pai;
/** Tamanhos do produto principal, anexados à linha pela lista (`_tamanhos`) para as colunas calculadas. */
const tamanhosDe = (r: Row) => (Array.isArray(r._tamanhos) ? (r._tamanhos as Row[]) : []);
const vendavel = (d: Record<string, unknown>) => !temTamanhos(d);
/** Categoria de despesa sugerida para cada tipo de contrato. */
const CATEGORIA_DO_CONTRATO: Record<string, string> = { Locação: 'Aluguel', 'Prestação de serviço': 'Terceirizados', Fornecimento: 'Fornecedores' };

/** Despesas invariáveis (fixas): as que se repetem todo mês no mesmo valor. Sem a natureza marcada, vale a categoria. */
const CATEGORIAS_FIXAS = ['Folha de pagamento', 'Encargos', 'Aluguel', 'Tarifas bancárias'];
export const naturezaDe = (r: Row) => (r.natureza === 'Fixa' || r.natureza === 'Variável' ? s(r.natureza) : CATEGORIAS_FIXAS.includes(s(r.categoria)) ? 'Fixa' : 'Variável');

/** Tons de status reconhecidos em todos os módulos. */
const TONES: Record<string, Tone> = {
  Ativo: 'good', Ativa: 'good', Concluído: 'good', Concluída: 'good', Pago: 'good', Aprovado: 'good', Conforme: 'good',
  Vigente: 'good', Publicado: 'good', Confirmada: 'good', Resolvida: 'good', 'Encerrado (favorável)': 'good', Utilizado: 'good',
  Bom: 'good', Novo: 'good', Disponível: 'info', Confirmado: 'good', Realizado: 'good', Quitado: 'good', 'Vence em 30 dias': 'warn', 'Sem validade': 'neutral',
  Pendente: 'warn', 'Em andamento': 'warn', 'Em análise': 'warn', Agendado: 'warn', 'Em produção': 'warn', 'Em aprovação': 'warn',
  'A pagar': 'warn', 'Em renovação': 'warn', 'Conforme com ressalvas': 'warn', 'Em tratamento': 'warn', Férias: 'info',
  Afastado: 'warn', Planejado: 'info', Briefing: 'info', Rascunho: 'neutral', Pausado: 'neutral', Regular: 'warn',
  Manutenção: 'warn', 'Em avaliação': 'warn', Suspenso: 'warn', Aberta: 'warn', Acordo: 'info', Média: 'warn', Sazonal: 'info',
  Atrasado: 'bad', Atrasada: 'bad', Cancelado: 'bad', Cancelada: 'bad', Vencido: 'bad', 'Não conforme': 'bad', Desligado: 'neutral',
  Encerrado: 'neutral', Inativo: 'neutral', Inativa: 'neutral', Recusada: 'bad', 'Cancelada pelo cliente': 'neutral',
  'Não compareceu': 'bad', Descartar: 'bad', Baixado: 'neutral', Alta: 'bad', Crítica: 'bad', Baixa: 'neutral', 'Encerrado (desfavorável)': 'bad',
};
/** Valor do bem hoje, com depreciação linear pela vida útil (sem data ou vida útil, não calcula). */
function valorAtualDoBem(r: Row): number | null {
  const anos = n(r.vidaUtil);
  if (!anos || !r.aquisicao) return null;
  const usado = Math.max(0, -daysUntil(r.aquisicao)) / 365.25;
  return n(r.quantidade || 1) * n(r.valor) * Math.max(0, 1 - usado / anos);
}
/** Tipos de documento do Arquivo; os primeiros são os que constituem a empresa. */
export const TIPOS_DE_CONSTITUICAO = ['Contrato social', 'Alteração contratual', 'Ata de constituição / estatuto', 'Cartão CNPJ', 'Inscrição estadual', 'Inscrição municipal', 'Registro na Junta Comercial'];
const TIPOS_DE_ARQUIVO = [...TIPOS_DE_CONSTITUICAO, 'Ofício', 'Memorando', 'Contrato', 'E-mail', 'Ata de reunião', 'Procuração', 'Certidão', 'Comunicado', 'Outro'];
/** Documento de constituição: pelo tipo ou marcado no cadastro (ex.: a procuração dada na abertura). */
export const ehConstituicao = (r: Row) => r.constituicao === 'Sim' || TIPOS_DE_CONSTITUICAO.includes(s(r.tipo));
export const toneOf = (value: unknown): Tone => TONES[s(value)] ?? 'neutral';

export const STATUS_KEYS = ['status', 'resultado', 'estado', 'gravidade', 'prioridade'];

export const COLLECTIONS: Record<string, CollectionDef> = {
  /* ---------------- Diretoria ---------------- */
  metas: {
    id: 'metas', anexos: 'Atas e documentos', feminino: true, area: 'metas', title: 'Metas e decisões', singular: 'meta ou decisão',
    description: 'Objetivos da casa e decisões registradas pela diretoria.',
    filterKey: 'status', filtros: ['tipo', 'area', 'responsavel'], sortKey: 'prazo', sortDir: 'asc',
    fields: [
      { key: 'titulo', label: 'Título', type: 'text', required: true, wide: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Meta', 'Decisão'], required: true },
      { key: 'area', label: 'Área', type: 'select', options: ['Geral', 'Pessoal', 'Estrutura', 'Administrativo', 'Financeiro', 'Vendas', 'Marketing', 'Jurídico', 'Fiscalização'] },
      { key: 'responsavel', label: 'Responsável', type: 'ref', ref: 'pessoas', refKey: 'responsavelId', livre: true },
      { key: 'prazo', label: 'Prazo', type: 'date' },
      { key: 'progresso', label: 'Progresso', type: 'percent', default: 0, decimals: 0 },
      { key: 'status', label: 'Status', type: 'select', options: ['Planejado', 'Em andamento', 'Concluída', 'Atrasada', 'Cancelada'], default: 'Planejado' },
      { key: 'descricao', label: 'Descrição', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => [
      { label: 'Em andamento', value: num(count(rows, 'status', ['Em andamento', 'Planejado'])) },
      { label: 'Concluídas', value: num(count(rows, 'status', ['Concluída'])), tone: 'good' },
      { label: 'Atrasadas', value: num(count(rows, 'status', ['Atrasada'])), tone: count(rows, 'status', ['Atrasada']) ? 'bad' : 'neutral' },
    ],
  },

  /* ---------------- RH ---------------- */
  colaboradores: {
    id: 'colaboradores', anexos: 'Currículo e documentos', comFoto: true, area: 'colaboradores', title: 'Colaboradores', singular: 'colaborador',
    description: 'Cadastro da equipe, cargos e vínculos.',
    filterKey: 'setor', filtros: ['contrato', 'status', 'cargo'], sortKey: 'nome',
    fields: [
      { key: 'nome', label: 'Nome completo', type: 'text', required: true, wide: true },
      { key: 'cargo', label: 'Cargo', type: 'text', required: true, placeholder: 'Ex.: Bartender' },
      { key: 'setor', label: 'Setor', type: 'select', options: ['Salão', 'Bar', 'Cozinha', 'Caixa', 'Administrativo', 'Gerência', 'Limpeza', 'Segurança'], required: true },
      { key: 'contrato', label: 'Vínculo', type: 'select', options: ['CLT', 'Intermitente', 'Temporário', 'Estágio', 'PJ', 'Freelancer'], required: true, default: 'CLT' },
      { key: 'admissao', label: 'Admissão', type: 'date' },
      { key: 'salario', label: 'Salário base', type: 'money', max: 1_000_000 },
      { key: 'telefone', label: 'Telefone', type: 'phone', formOnly: true },
      { key: 'email', label: 'E-mail', type: 'email', formOnly: true },
      { key: 'status', label: 'Situação', type: 'select', options: ['Ativo', 'Férias', 'Afastado', 'Desligado'], default: 'Ativo' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => {
      const ativos = rows.filter((r) => r.status !== 'Desligado');
      return [
        { label: 'Equipe ativa', value: num(ativos.length) },
        { label: 'Em férias / afastados', value: num(count(rows, 'status', ['Férias', 'Afastado'])) },
        { label: 'Salários base (mês)', value: brl(sum(ativos, 'salario')) },
      ];
    },
  },
  ferias: {
    id: 'ferias', anexos: 'Atestados e documentos', area: 'ferias', title: 'Férias e afastamentos', singular: 'registro',
    description: 'Programação de férias, atestados e licenças.',
    filterKey: 'tipo', filtros: ['colaborador', 'status'], sortKey: 'inicio',
    fields: [
      { key: 'colaborador', label: 'Colaborador', type: 'ref', ref: 'colaboradores', refKey: 'colaboradorId', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Férias', 'Atestado médico', 'Falta', 'Falta justificada', 'Licença-maternidade', 'Licença-paternidade', 'Afastamento INSS', 'Outro'], required: true },
      { key: 'inicio', label: 'Início', type: 'date', required: true },
      { key: 'fim', label: 'Término', type: 'date', required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Agendado', 'Em andamento', 'Concluído', 'Cancelado'], default: 'Agendado' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      { label: 'Dias', get: (r) => (r.inicio && r.fim ? daysUntil(r.fim) - daysUntil(r.inicio) + 1 : null), format: 'number' },
    ],
    kpis: (rows) => {
      const hoje = isoToday();
      const agora = rows.filter((r) => s(r.inicio) <= hoje && s(r.fim) >= hoje && r.status !== 'Cancelado');
      const proximos = rows.filter((r) => s(r.inicio) > hoje && daysUntil(r.inicio) <= 30 && r.status !== 'Cancelado');
      return [
        { label: 'Ausentes hoje', value: num(agora.length) },
        { label: 'Começam em 30 dias', value: num(proximos.length) },
      ];
    },
  },

  /* ---------------- DP Estrutura ---------------- */
  projetos: {
    id: 'projetos', anexos: 'Propostas e documentos', area: 'projetos', title: 'Projetos', singular: 'projeto',
    // o "Realizado" do projeto é acumulado: o valor de cada lançamento é digitado, para não contar o mesmo gasto duas vezes
    despesa: (r) => ({ descricao: juntar('Projeto', r.nome), categoria: 'Outras despesas', valor: 0 }),
    description: 'Obras, reformas, melhorias e implantações.',
    filterKey: 'status', filtros: ['prioridade', 'responsavel'], sortKey: 'prazo', sortDir: 'asc',
    fields: [
      { key: 'nome', label: 'Projeto', type: 'text', required: true, wide: true },
      { key: 'responsavel', label: 'Responsável', type: 'ref', ref: 'pessoas', refKey: 'responsavelId', livre: true, formOnly: true },
      { key: 'prioridade', label: 'Prioridade', type: 'select', options: ['Alta', 'Média', 'Baixa'], default: 'Média' },
      { key: 'inicio', label: 'Início', type: 'date', formOnly: true },
      { key: 'prazo', label: 'Prazo', type: 'date' },
      { key: 'orcamento', label: 'Orçamento', type: 'money', max: 99_999_999.99 },
      { key: 'gasto', label: 'Realizado', type: 'money', max: 99_999_999.99 },
      { key: 'status', label: 'Status', type: 'select', options: ['Planejado', 'Em andamento', 'Pausado', 'Concluído', 'Cancelado'], default: 'Planejado' },
      { key: 'descricao', label: 'Escopo', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      {
        label: 'Uso do orçamento', format: 'percent',
        get: (r) => (n(r.orcamento) ? n(r.gasto) / n(r.orcamento) : null),
        tone: (r) => (n(r.orcamento) && n(r.gasto) > n(r.orcamento) ? 'bad' : 'neutral'),
      },
    ],
    kpis: (rows) => {
      const ativos = rows.filter((r) => ['Planejado', 'Em andamento'].includes(s(r.status)));
      return [
        { label: 'Projetos ativos', value: num(ativos.length) },
        { label: 'Orçamento ativo', value: brl(sum(ativos, 'orcamento')) },
        { label: 'Realizado', value: brl(sum(ativos, 'gasto')) },
      ];
    },
  },
  estoque: {
    id: 'estoque', comFoto: true, porLocal: true, fotoPadrao: 'estoque', area: 'estoque', title: 'Estoque', singular: 'item de estoque',
    description: 'Insumos com controle de quantidade mínima e validade.',
    filterKey: 'categoria', filtros: ['fornecedor', 'unidade'], sortKey: 'item',
    fields: [
      { key: 'item', label: 'Item', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Bebidas', 'Alimentos', 'Descartáveis', 'Limpeza', 'Outros'], required: true },
      { key: 'unidade', label: 'Unidade', type: 'select', options: ['un', 'cx', 'fardo', 'kg', 'g', 'L', 'ml', 'pct'], default: 'un' },
      // para a ficha técnica medir em ml/g um item contado em unidades (ex.: 1 garrafa = 750 ml)
      { key: 'conteudo', label: 'Conteúdo de cada unidade', type: 'number', decimals: 3, max: 1_000_000, formOnly: true, placeholder: 'Ex.: 750 (garrafa de 750 ml)' },
      { key: 'conteudoUnidade', label: 'Medida do conteúdo', type: 'select', options: ['ml', 'L', 'g', 'kg'], default: 'ml', formOnly: true },
      { key: 'quantidade', label: 'Quantidade', type: 'number', required: true, decimals: 3, max: 1_000_000 },
      { key: 'minimo', label: 'Estoque mínimo', type: 'number', decimals: 3, max: 1_000_000 },
      // referência da barra de nível: a Entrada de notas põe aqui o total depois da compra
      { key: 'cheio', label: 'Quantidade cheia (barra de nível)', type: 'number', decimals: 3, max: 1_000_000, formOnly: true, placeholder: 'Vazio: a nota de compra preenche' },
      { key: 'custo', label: 'Custo unitário', type: 'money', max: 100_000 },
      { key: 'fornecedor', label: 'Fornecedor', type: 'ref', ref: 'fornecedores', refKey: 'fornecedorId', livre: true, formOnly: true, outros: 'outrosFornecedores' },
      { key: 'link', label: 'Link para compra', type: 'url', formOnly: true, wide: true, acao: 'comprar', outrosLinks: 'outrosLinks', placeholder: 'Cole aqui o link do produto na loja' },
      { key: 'validade', label: 'Validade', type: 'date' },
    ],
    computed: [
      { label: 'Nível', format: 'nivel', get: (r) => nivelEstoque(r)?.fracao ?? null, tone: (r) => nivelEstoque(r)?.tone ?? 'neutral', detalhe: (r) => nivelEstoque(r)?.detalhe ?? '' },
      { label: 'Locais', format: 'text', get: (r) => resumoLocais(locaisDe(r)) || null },
      { label: 'Valor em estoque', get: (r) => n(r.quantidade) * n(r.custo), format: 'money' },
      {
        label: 'Situação', format: 'badge',
        get: (r) => (n(r.minimo) && n(r.quantidade) <= n(r.minimo) ? 'Repor' : daysUntil(r.validade) < 0 ? 'Vencido' : daysUntil(r.validade) <= 7 ? 'Vence em breve' : 'Normal'),
        tone: (r) => (n(r.minimo) && n(r.quantidade) <= n(r.minimo) ? 'bad' : daysUntil(r.validade) < 0 ? 'bad' : daysUntil(r.validade) <= 7 ? 'warn' : 'good'),
      },
    ],
    kpis: (rows) => {
      const repor = rows.filter((r) => n(r.minimo) && n(r.quantidade) <= n(r.minimo)).length;
      const vencendo = rows.filter((r) => daysUntil(r.validade) <= 7).length;
      return [
        { label: 'Itens cadastrados', value: num(rows.length) },
        { label: 'Valor total em estoque', value: brl(rows.reduce((t, r) => t + n(r.quantidade) * n(r.custo), 0)) },
        { label: 'Itens para repor', value: num(repor), tone: repor ? 'bad' : 'good' },
        { label: 'Vencidos ou vencendo (7 dias)', value: num(vencendo), tone: vencendo ? 'warn' : 'good' },
      ];
    },
  },
  materiais: {
    id: 'materiais', anexos: 'Fichas técnicas e manuais', comFoto: true, porLocal: true, area: 'materiais', title: 'Materiais', singular: 'material',
    description: 'Utensílios, copos, equipamentos e uniformes do dia a dia, com a quantidade em cada local.',
    filterKey: 'tipo', filtros: ['local', 'estado', 'fornecedor'], sortKey: 'material',
    fields: [
      { key: 'material', label: 'Material', type: 'text', required: true, wide: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Equipamento', 'Utensílio', 'Mobiliário', 'Uniforme', 'Eletrônico', 'Outro'], required: true },
      { key: 'quantidade', label: 'Quantidade', type: 'number', default: 1, min: 1, max: 100_000 },
      { key: 'local', label: 'Local', type: 'select', options: ['Salão', 'Bar', 'Cozinha', 'Depósito', 'Escritório', 'Área externa'], formOnly: true },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Novo', 'Bom', 'Regular', 'Manutenção', 'Descartar'], default: 'Bom' },
      { key: 'valor', label: 'Valor unitário', type: 'money', max: 10_000_000 },
      { key: 'aquisicao', label: 'Aquisição', type: 'date' },
      { key: 'fornecedor', label: 'Fornecedor', type: 'ref', ref: 'fornecedores', refKey: 'fornecedorId', livre: true, formOnly: true, outros: 'outrosFornecedores' },
      { key: 'link', label: 'Link para compra', type: 'url', formOnly: true, wide: true, acao: 'comprar', outrosLinks: 'outrosLinks', placeholder: 'Cole aqui o link do produto na loja' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [{ label: 'Locais', format: 'text', get: (r) => resumoLocais(locaisDe(r)) || null }],
    kpis: (rows) => [
      { label: 'Itens patrimoniais', value: num(sum(rows, 'quantidade')) },
      { label: 'Valor patrimonial', value: brl(rows.reduce((t, r) => t + n(r.quantidade) * n(r.valor), 0)) },
      { label: 'Em manutenção / descarte', value: num(count(rows, 'estado', ['Manutenção', 'Descartar'])) },
    ],
  },
  patrimonio: {
    id: 'patrimonio', anexos: 'Notas fiscais, garantias e laudos', comFoto: true, fotoPadrao: 'patrimonio', fotoJunto: 'Foto com os outros itens de reserva', area: 'patrimonio', title: 'Patrimônio', singular: 'bem',
    description: 'Bens do bar (móveis, equipamentos, eletrônicos, instalações), com número de patrimônio, valor de aquisição e depreciação. Os da categoria Reserva aparecem para o afilhado escolher ao fazer a reserva no app.',
    filterKey: 'categoria', filtros: ['local', 'estado'], sortKey: 'nome',
    fields: [
      { key: 'nome', label: 'Bem', type: 'text', required: true, wide: true, placeholder: 'Ex.: Freezer horizontal, Mesa de madeira, Chopeira' },
      { key: 'plaqueta', label: 'Nº de patrimônio', type: 'text', placeholder: 'Ex.: PAT-0001' },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Equipamento', 'Mobiliário', 'Eletrônico', 'Utensílio', 'Decoração', 'Instalação / benfeitoria', 'Veículo', 'Reserva', 'Outro'], required: true },
      { key: 'quantidade', label: 'Quantidade', type: 'number', default: 1, min: 1, max: 100_000 },
      { key: 'valor', label: 'Valor unitário de aquisição', type: 'money', max: 10_000_000, formOnly: true },
      { key: 'aquisicao', label: 'Data de aquisição', type: 'date' },
      { key: 'vidaUtil', label: 'Vida útil (anos)', type: 'number', min: 0, max: 100, formOnly: true, placeholder: 'Ex.: 10 (móveis), 5 (equipamentos)' },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Novo', 'Bom', 'Regular', 'Manutenção', 'Baixado'], default: 'Bom' },
      { key: 'local', label: 'Local', type: 'select', options: ['Salão', 'Bar', 'Cozinha', 'Depósito', 'Escritório', 'Área externa'], formOnly: true },
      { key: 'fornecedor', label: 'Fornecedor', type: 'ref', ref: 'fornecedores', refKey: 'fornecedorId', livre: true, formOnly: true, outros: 'outrosFornecedores' },
      { key: 'cenarioFoto', label: 'Cenário da foto', type: 'select', options: ['Automático', 'Canto gamer', 'Palco', 'Atrás do balcão', 'Salão de mesas', 'Cozinha', 'Área externa'], default: 'Automático', formOnly: true },
      { key: 'descricaoReserva', label: 'Descrição no app (categoria Reserva)', type: 'textarea', formOnly: true, wide: true, placeholder: 'Ex.: Dois controles e os jogos de futebol e corrida. Aparece para o afilhado ao reservar.' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      { label: 'Valor de aquisição', get: (r) => n(r.quantidade || 1) * n(r.valor), format: 'money' },
      { label: 'Valor atual', get: (r) => valorAtualDoBem(r), format: 'money' },
    ],
    kpis: (rows) => {
      const ativos = rows.filter((r) => r.estado !== 'Baixado');
      return [
        { label: 'Bens no patrimônio', value: num(ativos.reduce((t, r) => t + n(r.quantidade || 1), 0)) },
        { label: 'Valor de aquisição', value: brl(ativos.reduce((t, r) => t + n(r.quantidade || 1) * n(r.valor), 0)) },
        { label: 'Valor atual (depreciado)', value: brl(ativos.reduce((t, r) => t + (valorAtualDoBem(r) ?? n(r.quantidade || 1) * n(r.valor)), 0)), hint: 'Depreciação linear pela vida útil' },
        { label: 'Em manutenção', value: num(count(rows, 'estado', ['Manutenção'])), tone: count(rows, 'estado', ['Manutenção']) ? 'warn' : 'good' },
      ];
    },
  },

  compras: {
    id: 'compras', comFoto: true, anexos: 'Nota fiscal (PDF ou XML em PDF)', compra: true, lancarAoCriar: true, feminino: true, area: 'compras',
    title: 'Entrada de notas', singular: 'nota de compra',
    description: 'Lance a nota fiscal de compra (ou leia a foto com a IA): cada item soma no Estoque ou nos Materiais, no local escolhido, e atualiza o custo e a Tabela de preços do fornecedor.',
    sortKey: 'data', sortDir: 'desc',
    despesa: (r) => ({ descricao: juntar('Compra', r.fornecedor, r.numero ? `NF ${s(r.numero)}` : ''), categoria: 'Fornecedores', valor: n(r.valor) }),
    filtros: ['fornecedor'],
    fields: [
      { key: 'fornecedor', label: 'Fornecedor', type: 'ref', ref: 'fornecedores', refKey: 'fornecedorId', livre: true, required: true, wide: true },
      { key: 'numero', label: 'Nº da nota', type: 'text', placeholder: 'Ex.: 000123' },
      { key: 'data', label: 'Data da compra', type: 'date', required: true, default: isoToday() },
      { key: 'valor', label: 'Total da nota', type: 'money', max: 1_000_000 },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [{ label: 'Itens', format: 'number', get: (r) => (Array.isArray(r.itens) ? r.itens.length : null) }],
    kpis: (rows) => {
      const mes = isoToday().slice(0, 7);
      const doMes = rows.filter((r) => s(r.data).startsWith(mes));
      return [
        { label: 'Notas no mês', value: num(doMes.length) },
        { label: 'Compras no mês', value: brl(sum(doMes, 'valor')) },
        { label: 'Fornecedores no mês', value: num(new Set(doMes.map((r) => r.fornecedorId || r.fornecedor)).size) },
      ];
    },
  },

  /* ---------------- Administrativo ---------------- */
  precos: {
    id: 'precos', area: 'precos', title: 'Tabela de preços', singular: 'preço de fornecedor',
    description: 'Quanto cada fornecedor cobra por insumo. A ficha técnica dos produtos compara os preços e mostra o mais barato.',
    filterKey: 'status', filtros: ['insumo', 'fornecedor'], sortKey: 'insumo',
    fields: [
      { key: 'insumo', label: 'Insumo (do Estoque)', type: 'ref', ref: 'insumos', refKey: 'insumoId', required: true, wide: true },
      { key: 'fornecedor', label: 'Fornecedor', type: 'ref', ref: 'fornecedores', refKey: 'fornecedorId', required: true },
      { key: 'embalagem', label: 'Embalagem', type: 'text', placeholder: 'Ex.: Garrafa 750 ml' },
      { key: 'conteudo', label: 'Conteúdo da embalagem', type: 'number', decimals: 3, min: 0.001, max: 1_000_000, required: true, placeholder: 'Ex.: 750' },
      { key: 'unidade', label: 'Unidade do conteúdo', type: 'select', options: ['ml', 'L', 'g', 'kg', 'un', 'dose'], default: 'ml', required: true },
      { key: 'preco', label: 'Preço da embalagem', type: 'money', required: true, min: 0.01, max: 100_000 },
      { key: 'data', label: 'Data da cotação', type: 'date' },
      { key: 'status', label: 'Situação', type: 'select', options: ['Ativo', 'Inativo'], default: 'Ativo' },
      { key: 'link', label: 'Link do produto no fornecedor', type: 'url', formOnly: true, wide: true, acao: 'comprar', placeholder: 'Cole aqui o link do produto na loja' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true, placeholder: 'Prazo de entrega, pedido mínimo, condições de pagamento…' },
    ],
    computed: [
      { label: 'Preço por L / kg / un', format: 'text', get: (r) => precoNormalizado(n(r.preco), n(r.conteudo), s(r.unidade)) },
    ],
    kpis: (rows) => {
      const ativos = rows.filter((r) => r.status !== 'Inativo');
      const antigas = ativos.filter((r) => r.data && daysUntil(r.data) < -90).length;
      return [
        { label: 'Insumos cotados', value: num(new Set(ativos.map((r) => r.insumoId || r.insumo)).size) },
        { label: 'Fornecedores', value: num(new Set(ativos.map((r) => r.fornecedorId || r.fornecedor)).size) },
        { label: 'Cotações com mais de 90 dias', value: num(antigas), tone: antigas ? 'warn' : 'good' },
      ];
    },
  },
  terceirizados: {
    id: 'terceirizados', anexos: 'Contrato, orçamentos e notas fiscais', area: 'terceirizados', title: 'Serviços terceirizados', singular: 'serviço',
    despesa: (r) => ({ descricao: juntar(r.servico, r.empresa), categoria: 'Terceirizados', valor: n(r.valor) }),
    description: 'Prestadores recorrentes: segurança, limpeza, manutenção, música e outros.',
    filterKey: 'categoria', filtros: ['empresa', 'periodicidade', 'status'], sortKey: 'proximo', sortDir: 'asc',
    fields: [
      { key: 'servico', label: 'Serviço', type: 'text', required: true },
      { key: 'empresa', label: 'Empresa / prestador', type: 'ref', ref: 'fornecedores', refKey: 'fornecedorId', livre: true, required: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Segurança', 'Limpeza', 'Manutenção', 'Contabilidade', 'Música ao vivo', 'Controle de pragas', 'Tecnologia', 'Outro'], required: true },
      { key: 'valor', label: 'Valor', type: 'money', max: 10_000_000 },
      { key: 'periodicidade', label: 'Periodicidade', type: 'select', options: ['Mensal', 'Quinzenal', 'Semanal', 'Por evento', 'Trimestral', 'Anual'] },
      { key: 'proximo', label: 'Próximo atendimento', type: 'date' },
      { key: 'contato', label: 'Contato', type: 'text', formOnly: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Ativo', 'Suspenso', 'Encerrado'], default: 'Ativo' },
    ],
    kpis: (rows) => {
      const ativos = rows.filter((r) => r.status === 'Ativo');
      return [
        { label: 'Serviços ativos', value: num(ativos.length) },
        { label: 'Custo mensal recorrente', value: brl(sum(ativos.filter((r) => r.periodicidade === 'Mensal'), 'valor')) },
      ];
    },
  },
  fornecedores: {
    id: 'fornecedores', itensDoFornecedor: true, anexos: 'Contratos, catálogos e tabelas de preço', area: 'fornecedores', title: 'Fornecedores', singular: 'fornecedor',
    description: 'Cadastro e avaliação de fornecedores.',
    filterKey: 'categoria', filtros: ['status', 'avaliacao', 'prazo'], sortKey: 'nome',
    fields: [
      { key: 'nome', label: 'Razão social / nome', type: 'text', required: true, wide: true },
      { key: 'cnpj', label: 'CNPJ', type: 'cnpj', placeholder: '00.000.000/0000-00' },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Bebidas', 'Carnes', 'Hortifrúti', 'Mercearia', 'Descartáveis', 'Limpeza', 'Gás', 'Equipamentos', 'Outro'], required: true },
      { key: 'contato', label: 'Contato', type: 'text' },
      { key: 'telefone', label: 'Telefone', type: 'phone' },
      { key: 'email', label: 'E-mail', type: 'email', formOnly: true },
      { key: 'site', label: 'Site / loja online', type: 'url', formOnly: true, wide: true, acao: 'site', placeholder: 'Ex.: www.distribuidora.com.br' },
      { key: 'prazo', label: 'Prazo de pagamento', type: 'select', options: ['À vista', '7 dias', '14 dias', '21 dias', '28 dias', '30 dias', '45 dias'], formOnly: true },
      { key: 'avaliacao', label: 'Avaliação', type: 'select', options: ['Excelente', 'Bom', 'Regular', 'Ruim'] },
      { key: 'status', label: 'Status', type: 'select', options: ['Ativo', 'Em avaliação', 'Inativo'], default: 'Ativo' },
    ],
    kpis: (rows) => [
      { label: 'Fornecedores ativos', value: num(count(rows, 'status', ['Ativo'])) },
      { label: 'Em avaliação', value: num(count(rows, 'status', ['Em avaliação'])) },
    ],
  },
  contratos: {
    id: 'contratos', anexos: 'Contrato assinado e aditivos', area: 'contratos', title: 'Contratos', singular: 'contrato',
    despesa: (r) => ({ descricao: juntar(r.titulo, r.parte), categoria: CATEGORIA_DO_CONTRATO[s(r.tipo)] ?? 'Outras despesas', valor: n(r.valor) }),
    description: 'Contratos vigentes, vencimentos e renovações.',
    filterKey: 'status', filtros: ['tipo', 'parte', 'responsavel'], sortKey: 'vencimento', sortDir: 'asc',
    fields: [
      { key: 'titulo', label: 'Objeto do contrato', type: 'text', required: true, wide: true },
      { key: 'parte', label: 'Contratado / contratante', type: 'ref', ref: 'fornecedores', refKey: 'fornecedorId', livre: true, required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Fornecimento', 'Prestação de serviço', 'Locação', 'Patrocínio', 'Parceria', 'Outro'] },
      { key: 'inicio', label: 'Início', type: 'date', formOnly: true },
      { key: 'vencimento', label: 'Vencimento', type: 'date' },
      { key: 'valor', label: 'Valor', type: 'money', max: 99_999_999.99 },
      { key: 'responsavel', label: 'Responsável', type: 'ref', ref: 'pessoas', refKey: 'responsavelId', livre: true, formOnly: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Vigente', 'Em renovação', 'Encerrado'], default: 'Vigente' },
      { key: 'observacoes', label: 'Cláusulas relevantes', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      {
        label: 'Prazo', format: 'badge',
        get: (r) => {
          if (r.status === 'Encerrado' || !r.vencimento) return '—';
          const d = daysUntil(r.vencimento);
          return d < 0 ? 'Vencido' : d === 0 ? 'Vence hoje' : `${d} dias`;
        },
        tone: (r) => {
          if (r.status === 'Encerrado' || !r.vencimento) return 'neutral';
          const d = daysUntil(r.vencimento);
          return d < 0 ? 'bad' : d <= 30 ? 'warn' : 'good';
        },
      },
    ],
    kpis: (rows) => {
      const vig = rows.filter((r) => r.status !== 'Encerrado');
      const vencendo = vig.filter((r) => daysUntil(r.vencimento) >= 0 && daysUntil(r.vencimento) <= 30).length;
      return [
        { label: 'Contratos vigentes', value: num(vig.length) },
        { label: 'Vencem em 30 dias', value: num(vencendo), tone: vencendo ? 'warn' : 'good' },
        { label: 'Vencidos', value: num(vig.filter((r) => daysUntil(r.vencimento) < 0).length), tone: 'bad' },
      ];
    },
  },

  /* ---------------- Financeiro ---------------- */
  receitas: {
    id: 'receitas', anexos: 'Notas fiscais e comprovantes', feminino: true, area: 'receitas', title: 'Receitas', singular: 'receita',
    description: 'Entradas do caixa. Consumos lançados para clientes do aplicativo aparecem aqui automaticamente.',
    filterKey: 'categoria', filtros: ['formaPagamento'], sortKey: 'data', sortDir: 'desc',
    fields: [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'descricao', label: 'Descrição', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Vendas no salão', 'Vendas no balcão', 'Delivery', 'Eventos', 'Consumo de clientes', 'Outras receitas'], required: true },
      { key: 'formaPagamento', label: 'Forma de pagamento', type: 'select', options: ['Pix', 'Crédito', 'Débito', 'Dinheiro', 'Vale-refeição', 'Não informado'] },
      { key: 'valor', label: 'Valor', type: 'money', required: true, min: 0.01, max: 1_000_000 },
    ],
  },
  despesas: {
    id: 'despesas', anexos: 'Notas fiscais, boletos e comprovantes', feminino: true, area: 'despesas', title: 'Despesas', singular: 'despesa',
    description: 'Contas a pagar e lançamentos de despesa, inclusive a folha de pagamento.',
    filterKey: 'status', filtros: ['categoria'], sortKey: 'vencimento', sortDir: 'asc',
    fields: [
      { key: 'descricao', label: 'Descrição', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Fornecedores', 'Folha de pagamento', 'Encargos', 'Aluguel', 'Energia e água', 'Impostos', 'Terceirizados', 'Marketing', 'Manutenção', 'Tarifas bancárias', 'Outras despesas'], required: true },
      { key: 'natureza', label: 'Natureza (fixa ou variável)', type: 'select', options: ['Variável', 'Fixa'], formOnly: true },
      { key: 'data', label: 'Competência', type: 'date', required: true },
      { key: 'vencimento', label: 'Vencimento', type: 'date' },
      { key: 'valor', label: 'Valor', type: 'money', required: true, min: 0.01, max: 1_000_000 },
      { key: 'status', label: 'Status', type: 'select', options: ['A pagar', 'Pago', 'Cancelado'], default: 'A pagar' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      { label: 'Natureza', format: 'text', get: (r) => naturezaDe(r) },
      {
        label: 'Situação', format: 'badge',
        get: (r) => (r.status === 'A pagar' && daysUntil(r.vencimento) < 0 ? 'Vencido' : s(r.status)),
        tone: (r) => (r.status === 'A pagar' && daysUntil(r.vencimento) < 0 ? 'bad' : toneOf(r.status)),
      },
    ],
  },

  /* ---------------- Marketing e Vendas (produtos são de Vendas) ---------------- */
  criacao: {
    id: 'criacao', anexos: 'Artes e briefings', comFoto: true, fotoGrande: true, feminino: true, area: 'criacao', title: 'Criação', singular: 'peça',
    description: 'Fluxo de produção de peças: do briefing à publicação.',
    filterKey: 'status', filtros: ['formato', 'campanha', 'responsavel'], sortKey: 'entrega', sortDir: 'asc',
    fields: [
      { key: 'peca', label: 'Peça', type: 'text', required: true, wide: true },
      { key: 'formato', label: 'Formato', type: 'select', options: ['Post feed', 'Story', 'Reels / vídeo', 'Cardápio', 'Banner', 'Flyer', 'Identidade visual', 'Outro'] },
      { key: 'campanha', label: 'Campanha', type: 'text' },
      { key: 'responsavel', label: 'Responsável', type: 'ref', ref: 'pessoas', refKey: 'responsavelId', livre: true },
      { key: 'entrega', label: 'Entrega', type: 'date' },
      { key: 'status', label: 'Etapa', type: 'select', options: ['Briefing', 'Em produção', 'Em aprovação', 'Aprovado', 'Publicado', 'Cancelado'], default: 'Briefing' },
      { key: 'briefing', label: 'Briefing', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => [
      { label: 'Em produção', value: num(count(rows, 'status', ['Briefing', 'Em produção'])) },
      { label: 'Aguardando aprovação', value: num(count(rows, 'status', ['Em aprovação'])), tone: 'warn' },
      { label: 'Publicadas', value: num(count(rows, 'status', ['Publicado'])), tone: 'good' },
    ],
  },
  midias: {
    id: 'midias', anexos: 'Artes e relatórios', comFoto: true, fotoGrande: true, feminino: true, area: 'midias', title: 'Gestão de mídias', singular: 'publicação',
    despesa: (r) => ({ descricao: juntar('Mídia', r.conteudo, r.canal), categoria: 'Marketing', valor: n(r.investimento) }),
    description: 'Calendário de publicações e resultados por canal.',
    filterKey: 'canal', filtros: ['tipo', 'status'], sortKey: 'data', sortDir: 'desc',
    fields: [
      { key: 'conteudo', label: 'Conteúdo', type: 'text', required: true, wide: true },
      { key: 'canal', label: 'Canal', type: 'select', options: ['Instagram', 'Facebook', 'TikTok', 'Google Perfil da Empresa', 'WhatsApp', 'iFood', 'Site', 'Outro'], required: true },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Orgânico', 'Patrocinado'], default: 'Orgânico', formOnly: true },
      { key: 'investimento', label: 'Investimento', type: 'money', max: 10_000_000 },
      { key: 'alcance', label: 'Alcance', type: 'number', max: 999_999_999 },
      { key: 'engajamento', label: 'Interações', type: 'number', max: 999_999_999, formOnly: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Rascunho', 'Agendado', 'Publicado'], default: 'Agendado' },
    ],
    computed: [
      { label: 'Taxa de engajamento', get: (r) => (n(r.alcance) ? n(r.engajamento) / n(r.alcance) : null), format: 'percent' },
    ],
    kpis: (rows) => {
      const pub = rows.filter((r) => r.status === 'Publicado');
      const alcance = sum(pub, 'alcance');
      return [
        { label: 'Publicações', value: num(pub.length) },
        { label: 'Alcance total', value: num(alcance) },
        { label: 'Engajamento médio', value: alcance ? pct(sum(pub, 'engajamento') / alcance) : '—' },
        { label: 'Investimento', value: brl(sum(rows, 'investimento')) },
      ];
    },
  },
  produtos: {
    id: 'produtos', comFoto: true, fichaTecnica: true, iaProduto: true, tamanhos: true, area: 'produtos', title: 'Produtos e cardápio', singular: 'produto',
    // os tamanhos ficam dentro do item principal (e cada um conta como um produto nos indicadores);
    // filtrando por tamanho, a lista mostra os tamanhos (ex.: todos os de 500 ml) no lugar dos itens
    ocultarNaLista: (r, f) => (f.tamanho ? temTamanhos(r) : !!r.pai),
    description: 'Produtos marcados como "No cardápio" e ativos aparecem no aplicativo dos clientes.',
    filterKey: 'categoria', filtros: ['tamanho', 'status', 'noCardapio', 'destaque'], sortKey: 'nome',
    fields: [
      { key: 'nome', label: 'Produto', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Cervejas', 'Chopes', 'Drinks', 'Destilados', 'Vinhos', 'Petiscos', 'Porções', 'Pratos', 'Sobremesas', 'Sem álcool'], required: true },
      // item principal com tamanhos: cada tamanho tem preço, pontos e ficha técnica próprios (ver "Tamanhos" no formulário)
      { key: 'comTamanhos', label: 'Vendido em tamanhos', type: 'check', formOnly: true, wide: true, placeholder: 'Este item tem tamanhos (ex.: chopp de 300 ml, 500 ml e 1 litro), cada um com preço e ficha técnica', mostrarSe: (d) => !d.pai },
      { key: 'tamanho', label: 'Tamanho', type: 'text', formOnly: true, placeholder: 'Ex.: 300 ml', mostrarSe: (d) => !!d.pai },
      { key: 'preco', label: 'Preço de venda', type: 'money', required: true, min: 0.01, max: 100_000, mostrarSe: vendavel },
      { key: 'custo', label: 'Custo', type: 'money', max: 100_000, mostrarSe: vendavel },
      { key: 'pontuacaoPersonalizada', label: 'Pontuação personalizada', type: 'check', formOnly: true, placeholder: 'Definir os pontos deste produto (senão, vale a tabela de Parâmetros pelo preço)', mostrarSe: vendavel },
      { key: 'pontos', label: 'Pontos por unidade', type: 'number', max: 100_000, formOnly: true, ativadoPor: 'pontuacaoPersonalizada', placeholder: 'Pela tabela de Parâmetros', mostrarSe: vendavel },
      { key: 'noCardapio', label: 'No cardápio do app', type: 'select', options: ['Sim', 'Não'], default: 'Sim' },
      { key: 'destaque', label: 'Destaque', type: 'select', options: ['Não', 'Sim'], default: 'Não' },
      { key: 'status', label: 'Status', type: 'select', options: ['Ativo', 'Sazonal', 'Inativo'], default: 'Ativo' },
      { key: 'resumo', label: 'Descrição curta (aparece na lista do app)', type: 'text', formOnly: true, wide: true, placeholder: 'Ex.: Aperol, espumante e um toque de laranja. Leve e refrescante.' },
      { key: 'descricao', label: 'História / descrição completa', type: 'textarea', formOnly: true, wide: true },
      { key: 'ingredientes', label: 'Ingredientes (separados por vírgula)', type: 'text', formOnly: true, wide: true, placeholder: 'Ex.: Aperol, Espumante brut, Água com gás, Rodela de laranja, Gelo' },
      // perfil da bebida, mostrado no app ao tocar no item (0 = não mostrar)
      { key: 'teor', label: 'Teor alcoólico', type: 'percent', decimals: 1, max: 100, formOnly: true, placeholder: 'Ex.: 11 (deixe vazio se não tiver álcool)' },
      { key: 'docura', label: 'Doçura (0 a 5)', type: 'number', min: 0, max: 5, formOnly: true },
      { key: 'amargor', label: 'Amargor (0 a 5)', type: 'number', min: 0, max: 5, formOnly: true },
      { key: 'acidez', label: 'Acidez (0 a 5)', type: 'number', min: 0, max: 5, formOnly: true },
      { key: 'intensidade', label: 'Intensidade (0 a 5)', type: 'number', min: 0, max: 5, formOnly: true },
      { key: 'notas', label: 'Notas de sabor (separadas por vírgula)', type: 'text', formOnly: true, wide: true, placeholder: 'Ex.: Cítrico, Refrescante, Levemente amargo' },
    ],
    computed: [
      {
        label: 'Ficha técnica', format: 'text',
        get: (r) => {
          if (temTamanhos(r)) { const t = tamanhosDe(r); return t.length ? `${t.length} ${t.length === 1 ? 'tamanho' : 'tamanhos'}` : 'Sem tamanhos'; }
          const q = fichaDe(r.ficha).itens.length; return q ? `${q} ${q === 1 ? 'insumo' : 'insumos'}` : null;
        },
      },
      {
        label: 'Margem', format: 'percent',
        get: (r) => (n(r.preco) && n(r.custo) ? (n(r.preco) - n(r.custo)) / n(r.preco) : null),
        tone: (r) => (n(r.preco) && n(r.custo) && (n(r.preco) - n(r.custo)) / n(r.preco) < 0.3 ? 'warn' : 'neutral'),
      },
    ],
    kpis: (todos) => {
      // cada tamanho conta como um produto; o item principal que os agrupa, não
      const rows = todos.filter(vendavel);
      const comCusto = rows.filter((r) => n(r.preco) && n(r.custo));
      const margem = comCusto.length ? comCusto.reduce((t, r) => t + (n(r.preco) - n(r.custo)) / n(r.preco), 0) / comCusto.length : null;
      return [
        { label: 'Produtos ativos', value: num(count(rows, 'status', ['Ativo'])) },
        { label: 'Publicados no app', value: num(rows.filter((r) => r.status === 'Ativo' && r.noCardapio !== 'Não').length), tone: 'info' },
        { label: 'Margem média', value: margem === null ? '—' : pct(margem) },
      ];
    },
  },
  guarnicoes: {
    id: 'guarnicoes', area: 'guarnicoes', title: 'Guarnições e itens fixos', singular: 'item fixo',
    description: 'Gelo, rodelas de fruta, canudos e outros itens que não se pesam: cada um tem um valor fixo por drink, somado nas fichas técnicas em que for marcado.',
    filterKey: 'status', filtros: ['padrao'], sortKey: 'nome',
    fields: [
      { key: 'nome', label: 'Item', type: 'text', required: true, wide: true, placeholder: 'Ex.: Gelo, Rodela de laranja, Canudo' },
      { key: 'custo', label: 'Valor por drink / porção', type: 'money', required: true, min: 0.01, max: 1_000 },
      { key: 'padrao', label: 'Já vem marcado nas fichas novas', type: 'select', options: ['Não', 'Sim'], default: 'Não' },
      { key: 'status', label: 'Situação', type: 'select', options: ['Ativo', 'Inativo'], default: 'Ativo' },
      { key: 'observacoes', label: 'Como chegou ao valor', type: 'textarea', formOnly: true, wide: true, placeholder: 'Ex.: saco de gelo de 5 kg a R$ 15,00 serve uns 50 copos → R$ 0,30 por drink' },
    ],
    kpis: (rows) => [
      { label: 'Itens ativos', value: num(count(rows, 'status', ['Ativo'])) },
      { label: 'Marcados por padrão', value: num(rows.filter((r) => r.status !== 'Inativo' && r.padrao === 'Sim').length), tone: 'info' },
    ],
  },
  recompensas: {
    id: 'recompensas', comFoto: true, feminino: true, area: 'recompensas', title: 'Recompensas', singular: 'recompensa',
    description: 'Catálogo de recompensas do programa de fidelidade. As ativas aparecem no aplicativo.',
    filterKey: 'status', sortKey: 'custo', sortDir: 'asc',
    fields: [
      { key: 'nome', label: 'Recompensa', type: 'text', required: true, wide: true },
      { key: 'custo', label: 'Custo em pontos', type: 'number', required: true, min: 1, max: 1_000_000 },
      { key: 'status', label: 'Status', type: 'select', options: ['Ativa', 'Inativa'], default: 'Ativa' },
      { key: 'descricao', label: 'Descrição', type: 'textarea', wide: true },
    ],
  },
  reservas: {
    id: 'reservas', feminino: true, area: 'reservas', title: 'Reservas', singular: 'reserva',
    description: 'Solicitações feitas pelo aplicativo e reservas registradas pela equipe.',
    filterKey: 'status', filtros: ['ambiente', 'origem'], sortKey: 'data', sortDir: 'asc',
    fields: [
      { key: 'clienteNome', label: 'Cliente', type: 'ref', ref: 'clientes', refKey: 'clienteId', livre: true, required: true, fill: { clienteTelefone: 'telefone' } },
      { key: 'clienteTelefone', label: 'Telefone', type: 'phone' },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'hora', label: 'Horário', type: 'time', required: true },
      { key: 'pessoas', label: 'Pessoas', type: 'number', required: true, default: 2, min: 1, max: 50 },
      { key: 'ambiente', label: 'Ambiente', type: 'text' },
      { key: 'mesa', label: 'Mesa', type: 'number', min: 1, max: 999 },
      { key: 'extras', label: 'Reservou junto', type: 'text', placeholder: 'Ex.: PS5, Karaokê' },
      { key: 'origem', label: 'Origem', type: 'select', options: ['Aplicativo', 'Telefone', 'WhatsApp', 'Presencial'], default: 'Telefone', formOnly: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Pendente', 'Confirmada', 'Recusada', 'Concluída', 'Não compareceu', 'Cancelada', 'Cancelada pelo cliente'], default: 'Confirmada' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', wide: true, formOnly: true },
    ],
    kpis: (rows) => {
      const hoje = isoToday();
      return [
        { label: 'Aguardando confirmação', value: num(count(rows, 'status', ['Pendente'])), tone: count(rows, 'status', ['Pendente']) ? 'warn' : 'good' },
        { label: 'Confirmadas hoje', value: num(rows.filter((r) => r.data === hoje && r.status === 'Confirmada').length) },
        { label: 'Pessoas esperadas hoje', value: num(sum(rows.filter((r) => r.data === hoje && r.status === 'Confirmada'), 'pessoas')) },
      ];
    },
  },

  /* ---------------- Jurídico ---------------- */
  trabalhista: {
    id: 'trabalhista', anexos: 'Peças do processo e documentos', area: 'trabalhista', title: 'Processos trabalhistas', singular: 'processo',
    description: 'Reclamações trabalhistas, audiências e valores envolvidos.',
    filterKey: 'status', filtros: ['advogado', 'reclamante'], sortKey: 'audiencia', sortDir: 'asc',
    fields: [
      { key: 'numero', label: 'Número do processo', type: 'text', required: true },
      { key: 'reclamante', label: 'Reclamante', type: 'ref', ref: 'colaboradores', refKey: 'colaboradorId', livre: true, required: true },
      { key: 'assunto', label: 'Assunto', type: 'text', wide: true },
      { key: 'vara', label: 'Vara / tribunal', type: 'text', formOnly: true },
      { key: 'advogado', label: 'Advogado responsável', type: 'text', formOnly: true },
      { key: 'valor', label: 'Valor da causa', type: 'money', max: 999_999_999.99 },
      { key: 'audiencia', label: 'Próxima audiência', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Em andamento', 'Acordo', 'Encerrado (favorável)', 'Encerrado (desfavorável)'], default: 'Em andamento' },
      { key: 'observacoes', label: 'Andamento', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => {
      const ativos = rows.filter((r) => ['Em andamento', 'Acordo'].includes(s(r.status)));
      return [
        { label: 'Processos ativos', value: num(ativos.length) },
        { label: 'Valor em discussão', value: brl(sum(ativos, 'valor')) },
        { label: 'Audiências em 30 dias', value: num(ativos.filter((r) => daysUntil(r.audiencia) >= 0 && daysUntil(r.audiencia) <= 30).length), tone: 'warn' },
      ];
    },
  },
  consultoria: {
    id: 'consultoria', anexos: 'Pareceres e relatórios', feminino: true, area: 'consultoria', title: 'Demandas de consultoria', singular: 'demanda',
    description: 'Pareceres, revisões contratuais, licenças e questões societárias.',
    filterKey: 'tipo', filtros: ['status', 'solicitante', 'consultor'], sortKey: 'prazo', sortDir: 'asc',
    fields: [
      { key: 'tema', label: 'Tema', type: 'text', required: true, wide: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Parecer', 'Revisão contratual', 'Societário', 'Tributário', 'Licenças e alvarás', 'LGPD', 'Consumidor', 'Outro'], required: true },
      { key: 'solicitante', label: 'Solicitante', type: 'ref', ref: 'pessoas', refKey: 'solicitanteId', livre: true },
      { key: 'consultor', label: 'Consultor', type: 'text' },
      { key: 'abertura', label: 'Abertura', type: 'date' },
      { key: 'prazo', label: 'Prazo', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Aberta', 'Em análise', 'Concluída'], default: 'Aberta' },
      { key: 'parecer', label: 'Parecer / orientação', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => [
      { label: 'Em aberto', value: num(count(rows, 'status', ['Aberta', 'Em análise'])) },
      { label: 'Concluídas', value: num(count(rows, 'status', ['Concluída'])), tone: 'good' },
    ],
  },

  /* ---------------- Fiscalização ---------------- */
  qualidade: {
    id: 'qualidade', anexos: 'Laudos e checklists', feminino: true, area: 'qualidade', title: 'Controle de qualidade', singular: 'inspeção',
    description: 'Inspeções periódicas por área com nota e resultado.',
    filterKey: 'area', filtros: ['resultado', 'responsavel'], sortKey: 'data', sortDir: 'desc',
    fields: [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'area', label: 'Área', type: 'select', options: ['Cozinha', 'Bar', 'Salão', 'Banheiros', 'Estoque', 'Área externa'], required: true },
      { key: 'checklist', label: 'Inspeção', type: 'text', required: true, placeholder: 'Ex.: Higienização e temperatura' },
      { key: 'responsavel', label: 'Responsável', type: 'ref', ref: 'pessoas', refKey: 'responsavelId', livre: true },
      { key: 'nota', label: 'Nota (0 a 10)', type: 'number', required: true, decimals: 1, min: 0, max: 10 },
      { key: 'resultado', label: 'Resultado', type: 'select', options: ['Conforme', 'Conforme com ressalvas', 'Não conforme'], required: true },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => {
      const ult30 = rows.filter((r) => daysUntil(r.data) >= -30);
      return [
        { label: 'Inspeções (30 dias)', value: num(ult30.length) },
        { label: 'Nota média (30 dias)', value: ult30.length ? num(sum(ult30, 'nota') / ult30.length, 1) : '—' },
        { label: 'Não conformes (30 dias)', value: num(count(ult30, 'resultado', ['Não conforme'])), tone: count(ult30, 'resultado', ['Não conforme']) ? 'bad' : 'good' },
      ];
    },
  },
  naoconformidades: {
    id: 'naoconformidades', anexos: 'Relatórios e evidências', feminino: true, area: 'naoconformidades', title: 'Não conformidades', singular: 'não conformidade',
    description: 'Problemas identificados e o plano de ação corretiva.',
    filterKey: 'status', filtros: ['area', 'gravidade', 'responsavel'], sortKey: 'prazo', sortDir: 'asc',
    fields: [
      { key: 'descricao', label: 'Descrição', type: 'text', required: true, wide: true },
      { key: 'area', label: 'Área', type: 'select', options: ['Cozinha', 'Bar', 'Salão', 'Banheiros', 'Estoque', 'Área externa', 'Atendimento'] },
      { key: 'data', label: 'Identificada em', type: 'date', required: true },
      { key: 'gravidade', label: 'Gravidade', type: 'select', options: ['Baixa', 'Média', 'Alta', 'Crítica'], default: 'Média' },
      { key: 'responsavel', label: 'Responsável', type: 'ref', ref: 'pessoas', refKey: 'responsavelId', livre: true },
      { key: 'prazo', label: 'Prazo da ação', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Aberta', 'Em tratamento', 'Resolvida'], default: 'Aberta' },
      { key: 'acao', label: 'Ação corretiva', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => {
      const abertas = rows.filter((r) => r.status !== 'Resolvida');
      return [
        { label: 'Em aberto', value: num(abertas.length), tone: abertas.length ? 'warn' : 'good' },
        { label: 'Altas ou críticas', value: num(count(abertas, 'gravidade', ['Alta', 'Crítica'])), tone: 'bad' },
        { label: 'Prazo vencido', value: num(abertas.filter((r) => daysUntil(r.prazo) < 0).length), tone: 'bad' },
      ];
    },
  },

  /* ---------------- Atendimento: eventos do calendário ---------------- */
  eventos: {
    id: 'eventos', area: 'eventos', title: 'Calendário', singular: 'evento',
    description: 'Shows, festas, jogos e eventos fechados. O calendário junta os eventos com as reservas.',
    filterKey: 'tipo', filtros: ['status', 'responsavel'], sortKey: 'data', sortDir: 'asc',
    fields: [
      { key: 'titulo', label: 'Evento', type: 'text', required: true, wide: true, placeholder: 'Ex.: Samba de sexta' },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Show', 'Festa', 'Jogo / transmissão', 'Evento fechado', 'Degustação', 'Feriado', 'Outro'], required: true },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'horario', label: 'Horário', type: 'time' },
      { key: 'responsavel', label: 'Responsável', type: 'ref', ref: 'pessoas', refKey: 'responsavelId', livre: true, formOnly: true },
      { key: 'publico', label: 'Público esperado', type: 'number', max: 10_000 },
      { key: 'status', label: 'Status', type: 'select', options: ['Planejado', 'Confirmado', 'Realizado', 'Cancelado'], default: 'Planejado' },
      { key: 'descricao', label: 'Detalhes', type: 'textarea', formOnly: true, wide: true },
    ],
  },

  /* ---------------- Marketing: publicidade e propaganda ---------------- */
  publicidade: {
    id: 'publicidade', anexos: 'Peças, orçamentos e relatórios', feminino: true, area: 'publicidade', title: 'Publicidade e propaganda', singular: 'campanha',
    description: 'Campanhas pagas e ações de divulgação: canal, período, investimento e resultado.',
    filterKey: 'status', filtros: ['canal'], sortKey: 'inicio', sortDir: 'desc',
    despesa: (r) => ({ descricao: juntar('Publicidade', r.campanha, r.canal), categoria: 'Marketing', valor: n(r.investimento) }),
    fields: [
      { key: 'campanha', label: 'Campanha', type: 'text', required: true, wide: true },
      { key: 'canal', label: 'Canal', type: 'select', options: ['Instagram / Facebook Ads', 'Google Ads', 'TikTok', 'Influenciador', 'Panfletos e cartazes', 'Rádio', 'Parceria', 'Outro'], required: true },
      { key: 'inicio', label: 'Início', type: 'date', required: true },
      { key: 'fim', label: 'Término', type: 'date' },
      { key: 'investimento', label: 'Investimento', type: 'money', max: 1_000_000 },
      { key: 'alcance', label: 'Alcance / impressões', type: 'number', max: 100_000_000 },
      { key: 'status', label: 'Status', type: 'select', options: ['Planejado', 'Em andamento', 'Concluída', 'Cancelada'], default: 'Planejado' },
      { key: 'resultado', label: 'Resultado', type: 'textarea', formOnly: true, wide: true, placeholder: 'Novos afilhados, reservas, vendas no período…' },
    ],
    kpis: (rows) => [
      { label: 'Em andamento', value: num(count(rows, 'status', ['Em andamento'])) },
      { label: 'Investido no ano', value: brl(sum(rows.filter((r) => s(r.inicio).slice(0, 4) === isoToday().slice(0, 4) && r.status !== 'Cancelada'), 'investimento')) },
    ],
  },

  /* ---------------- Fiscalização: atestados emitidos ---------------- */
  atestados: {
    id: 'atestados', anexos: 'Documento emitido (PDF)', area: 'atestados', title: 'Atestados emitidos', singular: 'atestado',
    description: 'Alvarás, licenças, AVCB, laudos e certificados da casa, com a validade de cada um.',
    filterKey: 'documento', filtros: ['orgao'], sortKey: 'validade', sortDir: 'asc',
    fields: [
      { key: 'documento', label: 'Documento', type: 'select', options: ['Alvará de funcionamento', 'Licença sanitária', 'AVCB / Bombeiros', 'Licença ambiental', 'Certificado de dedetização', 'Limpeza da caixa d’água', 'Laudo elétrico', 'Laudo de gás', 'Outro'], required: true },
      { key: 'orgao', label: 'Órgão / empresa emissora', type: 'text', required: true },
      { key: 'numero', label: 'Número', type: 'text' },
      { key: 'emissao', label: 'Emissão', type: 'date' },
      { key: 'validade', label: 'Validade', type: 'date' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      {
        label: 'Situação', format: 'badge',
        get: (r) => (!r.validade ? 'Sem validade' : daysUntil(r.validade) < 0 ? 'Vencido' : daysUntil(r.validade) <= 30 ? 'Vence em 30 dias' : 'Vigente'),
        tone: (r) => (!r.validade ? 'neutral' : daysUntil(r.validade) < 0 ? 'bad' : daysUntil(r.validade) <= 30 ? 'warn' : 'good'),
      },
    ],
    kpis: (rows) => [
      { label: 'Vigentes', value: num(rows.filter((r) => r.validade && daysUntil(r.validade) >= 0).length), tone: 'good' },
      { label: 'Vencem em 30 dias', value: num(rows.filter((r) => r.validade && daysUntil(r.validade) >= 0 && daysUntil(r.validade) <= 30).length), tone: 'warn' },
      { label: 'Vencidos', value: num(rows.filter((r) => r.validade && daysUntil(r.validade) < 0).length), tone: 'bad' },
    ],
  },

  /* ---------------- Financeiro: investidores, documentos e investimentos ---------------- */
  acoes: {
    id: 'acoes', anexos: 'Contrato social, acordos e comprovantes', feminino: true, area: 'acoes', title: 'Ações da empresa', singular: 'participação',
    description: 'Sócios e investidores: quantidade de ações ou cotas, participação e valor aportado.',
    filterKey: 'tipo', filtros: ['status'], sortKey: 'participacao', sortDir: 'desc',
    fields: [
      { key: 'nome', label: 'Sócio / investidor', type: 'text', required: true, wide: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Sócio administrador', 'Sócio', 'Investidor', 'Investidor-anjo'], required: true },
      { key: 'documento', label: 'CPF / CNPJ', type: 'text', formOnly: true },
      { key: 'quantidade', label: 'Ações / cotas', type: 'number', max: 100_000_000 },
      { key: 'participacao', label: 'Participação', type: 'percent', decimals: 2 },
      { key: 'aporte', label: 'Valor aportado', type: 'money', max: 99_999_999.99 },
      { key: 'entrada', label: 'Data de entrada', type: 'date' },
      { key: 'status', label: 'Situação', type: 'select', options: ['Ativo', 'Inativo'], default: 'Ativo' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => {
      const ativos = rows.filter((r) => r.status !== 'Inativo');
      const total = sum(ativos, 'participacao');
      return [
        { label: 'Sócios e investidores', value: num(ativos.length) },
        { label: 'Capital aportado', value: brl(sum(ativos, 'aporte')) },
        { label: 'Participação distribuída', value: `${num(total, 2)}%`, tone: Math.abs(total - 100) < 0.01 || !ativos.length ? 'good' : 'warn', hint: Math.abs(total - 100) < 0.01 || !ativos.length ? undefined : 'a soma deveria dar 100%' },
      ];
    },
  },
  creditos: {
    id: 'creditos', anexos: 'Contrato e extratos', area: 'creditos', title: 'Crédito CNPJ', singular: 'crédito',
    description: 'Empréstimos, financiamentos e limites no CNPJ: taxa, parcelas e saldo devedor.',
    filterKey: 'status', filtros: ['modalidade', 'instituicao'], sortKey: 'proximaParcela', sortDir: 'asc',
    despesa: (r) => ({ descricao: juntar('Parcela', r.modalidade, r.instituicao), categoria: 'Tarifas bancárias', valor: n(r.parcela) }),
    fields: [
      { key: 'instituicao', label: 'Instituição', type: 'text', required: true, placeholder: 'Ex.: Banrisul, Sicredi, Pronampe' },
      { key: 'modalidade', label: 'Modalidade', type: 'select', options: ['Capital de giro', 'Financiamento de equipamentos', 'Pronampe', 'Cheque especial / limite', 'Cartão de crédito PJ', 'Antecipação de recebíveis', 'Outro'], required: true },
      { key: 'valor', label: 'Valor contratado', type: 'money', required: true, max: 99_999_999.99 },
      { key: 'taxa', label: 'Taxa ao mês', type: 'percent', decimals: 2 },
      { key: 'parcelas', label: 'Parcelas', type: 'number', max: 600 },
      { key: 'parcela', label: 'Valor da parcela', type: 'money', max: 9_999_999.99 },
      { key: 'saldo', label: 'Saldo devedor', type: 'money', max: 99_999_999.99 },
      { key: 'proximaParcela', label: 'Próxima parcela', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Em análise', 'Ativo', 'Quitado', 'Recusado'], default: 'Ativo' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => {
      const ativos = rows.filter((r) => r.status === 'Ativo');
      return [
        { label: 'Saldo devedor', value: brl(sum(ativos, 'saldo')), tone: sum(ativos, 'saldo') ? 'warn' : 'good' },
        { label: 'Parcelas por mês', value: brl(sum(ativos, 'parcela')) },
        { label: 'Contratos ativos', value: num(ativos.length) },
      ];
    },
  },
  docfin: {
    id: 'docfin', anexos: 'Documento (PDF)', area: 'docfin', title: 'Contratos onerosos e títulos', singular: 'documento',
    description: 'Contratos onerosos, títulos concedidos (notas promissórias, duplicatas, cheques) e relatórios financeiros.',
    filterKey: 'tipo', filtros: ['status', 'parte'], sortKey: 'data', sortDir: 'desc',
    fields: [
      { key: 'titulo', label: 'Documento', type: 'text', required: true, wide: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Contrato oneroso', 'Título concedido', 'Nota promissória', 'Duplicata', 'Relatório'], required: true },
      { key: 'parte', label: 'Parte envolvida', type: 'text' },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'vencimento', label: 'Vencimento', type: 'date' },
      { key: 'valor', label: 'Valor', type: 'money', max: 99_999_999.99 },
      { key: 'status', label: 'Status', type: 'select', options: ['Vigente', 'Pago', 'Encerrado', 'Cancelado'], default: 'Vigente' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
  },
  arquivos: {
    id: 'arquivos', anexos: 'Arquivo do documento', area: 'arquivos', title: 'Arquivos', singular: 'arquivo',
    description: 'Arquivo de documentos da empresa: ofícios, memorandos, contratos, e-mails em PDF e, principalmente, os documentos que constituíram a empresa.',
    filterKey: 'tipo', filtros: ['status', 'origem'], sortKey: 'data', sortDir: 'desc',
    fields: [
      { key: 'titulo', label: 'Documento', type: 'text', required: true, wide: true, placeholder: 'Ex.: Contrato social da Bar do Dindo Ltda.' },
      { key: 'tipo', label: 'Tipo', type: 'select', options: TIPOS_DE_ARQUIVO, required: true },
      { key: 'constituicao', label: 'Constituição da empresa', type: 'check', formOnly: true, placeholder: 'É documento de constituição da empresa (contrato social, CNPJ, inscrições, atas…)' },
      { key: 'numero', label: 'Número / protocolo', type: 'text' },
      { key: 'data', label: 'Data do documento', type: 'date', required: true },
      { key: 'origem', label: 'Emitente ou destinatário', type: 'text', placeholder: 'Ex.: Junta Comercial, Prefeitura, contador' },
      { key: 'validade', label: 'Validade', type: 'date', formOnly: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Vigente', 'Arquivado', 'Substituído', 'Vencido'], default: 'Vigente' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      { label: 'Grupo', get: (r) => (ehConstituicao(r) ? 'Constituição' : 'Geral'), format: 'badge', tone: (r) => (ehConstituicao(r) ? 'info' : 'neutral') },
      { label: 'PDFs', get: (r) => (Array.isArray(r.anexos) ? r.anexos.length : 0), format: 'number', tone: (r) => (Array.isArray(r.anexos) && r.anexos.length ? 'neutral' : 'warn') },
    ],
    kpis: (rows) => {
      const semArquivo = rows.filter((r) => !Array.isArray(r.anexos) || !r.anexos.length).length;
      const vencendo = rows.filter((r) => r.validade && r.status !== 'Substituído' && daysUntil(r.validade) <= 30).length;
      return [
        { label: 'Documentos guardados', value: num(rows.length) },
        { label: 'Constituição da empresa', value: num(rows.filter(ehConstituicao).length), tone: 'info' },
        { label: 'Sem PDF anexado', value: num(semArquivo), tone: semArquivo ? 'warn' : 'good' },
        { label: 'Vencidos ou vencendo em 30 dias', value: num(vencendo), tone: vencendo ? 'warn' : 'good' },
      ];
    },
  },
  investimentos: {
    id: 'investimentos', anexos: 'Notas, orçamentos e comprovantes', area: 'investimentos', title: 'Lançamento de investimentos', singular: 'investimento',
    description: 'Dinheiro aplicado na casa (equipamentos, reformas, estoque inicial…) e de onde ele veio.',
    filterKey: 'categoria', filtros: ['origem', 'status'], sortKey: 'data', sortDir: 'desc',
    fields: [
      { key: 'descricao', label: 'Descrição', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Equipamentos', 'Reforma e obras', 'Mobiliário', 'Estoque inicial', 'Tecnologia', 'Marketing', 'Outros'], required: true },
      { key: 'origem', label: 'Origem do dinheiro', type: 'select', options: ['Caixa próprio', 'Aporte de sócio', 'Crédito CNPJ', 'Outro'], required: true },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'valor', label: 'Valor', type: 'money', required: true, min: 0.01, max: 99_999_999.99 },
      { key: 'status', label: 'Status', type: 'select', options: ['Planejado', 'Pago', 'Cancelado'], default: 'Pago' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => {
      const pagos = rows.filter((r) => r.status === 'Pago');
      return [
        { label: 'Investido no ano', value: brl(sum(pagos.filter((r) => s(r.data).slice(0, 4) === isoToday().slice(0, 4)), 'valor')) },
        { label: 'Investido no total', value: brl(sum(pagos, 'valor')) },
        { label: 'Planejado', value: brl(sum(rows.filter((r) => r.status === 'Planejado'), 'valor')), tone: 'info' },
      ];
    },
  },

  /* ---------------- Pessoal: prestadores (PF e PJ) e regras de conduta ---------------- */
  prestadores: {
    id: 'prestadores', anexos: 'Contrato, documentos e notas', area: 'prestadores', title: 'Fornecedores de mão de obra', singular: 'contratado',
    description: 'Pessoas físicas e jurídicas contratadas para prestar serviço à casa (freelas, músicos, segurança, contabilidade…).',
    filterKey: 'status', filtros: ['servico', 'pagamento'], sortKey: 'nome',
    despesa: (r) => ({ descricao: juntar(r.servico, r.nome), categoria: 'Terceirizados', valor: n(r.valor) }),
    fields: [
      { key: 'nome', label: 'Nome / razão social', type: 'text', required: true, wide: true },
      { key: 'tipo', label: 'Pessoa', type: 'select', options: ['Pessoa física', 'Pessoa jurídica'], required: true, default: 'Pessoa física' },
      { key: 'documento', label: 'CPF / CNPJ', type: 'text' },
      { key: 'servico', label: 'Serviço', type: 'text', required: true, placeholder: 'Ex.: Músico, segurança, contador' },
      { key: 'telefone', label: 'Telefone', type: 'phone' },
      { key: 'email', label: 'E-mail', type: 'email', formOnly: true },
      { key: 'pagamento', label: 'Forma de pagamento', type: 'select', options: ['Por serviço / diária', 'Por hora', 'Mensal'], formOnly: true },
      { key: 'valor', label: 'Valor combinado', type: 'money', max: 1_000_000 },
      { key: 'status', label: 'Situação', type: 'select', options: ['Ativo', 'Inativo'], default: 'Ativo' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
  },
  conduta: {
    id: 'conduta', anexos: 'Manual de Conduta (PDF)', feminino: true, area: 'conduta', title: 'Regras de conduta', singular: 'versão do manual',
    description: 'Manual de Conduta do Bar do Dindo: a versão em vigor fica disponível em PDF para toda a equipe com acesso ao Pessoal.',
    filterKey: 'status', sortKey: 'vigencia', sortDir: 'desc',
    fields: [
      { key: 'titulo', label: 'Título', type: 'text', required: true, wide: true, default: 'Manual de Conduta do Bar do Dindo' },
      { key: 'versao', label: 'Versão', type: 'text', placeholder: 'Ex.: 2026.1' },
      { key: 'vigencia', label: 'Em vigor desde', type: 'date' },
      { key: 'status', label: 'Status', type: 'select', options: ['Vigente', 'Rascunho', 'Encerrado'], default: 'Vigente' },
      { key: 'resumo', label: 'Principais regras / o que mudou', type: 'textarea', formOnly: true, wide: true },
    ],
  },

  /* ---------------- Jurídico: advogados e normas ---------------- */
  advogados: {
    id: 'advogados', anexos: 'Procuração, contrato de honorários e documentos', area: 'advogados', title: 'Advogados', singular: 'advogado',
    description: 'Advogados e escritórios que atendem a casa, por área de atuação.',
    filterKey: 'status', filtros: ['atuacao', 'escritorio'], sortKey: 'nome',
    fields: [
      { key: 'nome', label: 'Nome', type: 'text', required: true, wide: true },
      { key: 'atuacao', label: 'Área de atuação', type: 'select', options: ['Consultoria jurídica', 'Trabalhista e Tributário', 'Empresarial'], required: true },
      { key: 'oab', label: 'OAB', type: 'text', placeholder: 'Ex.: RS 123.456' },
      { key: 'escritorio', label: 'Escritório', type: 'text' },
      { key: 'telefone', label: 'Telefone', type: 'phone' },
      { key: 'email', label: 'E-mail', type: 'email', formOnly: true },
      { key: 'honorarios', label: 'Honorários (mensal)', type: 'money', max: 1_000_000, formOnly: true },
      { key: 'status', label: 'Situação', type: 'select', options: ['Ativo', 'Inativo'], default: 'Ativo' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
  },
  normas: {
    id: 'normas', anexos: 'Texto da norma ou resumo (PDF)', feminino: true, area: 'normas', title: 'Leis e normas', singular: 'norma',
    description: 'Biblioteca de leis, normas e orientações que valem para a casa, com o link do texto oficial.',
    filterKey: 'ambito', sortKey: 'titulo',
    fields: [
      { key: 'titulo', label: 'Norma', type: 'text', required: true, wide: true, placeholder: 'Ex.: CLT, art. 59 – horas extras' },
      { key: 'ambito', label: 'Âmbito', type: 'select', options: ['Trabalhista (CLT)', 'Tributário', 'Empresarial', 'Constitucional', 'Civil', 'Registro de empresas', 'Sanitário', 'Consumidor', 'Outro'], required: true },
      { key: 'link', label: 'Texto oficial', type: 'url', acao: 'site', formOnly: true, wide: true, placeholder: 'Link do Planalto ou do órgão oficial' },
      { key: 'resumo', label: 'O que diz / como se aplica à casa', type: 'textarea', formOnly: true, wide: true },
    ],
  },

  /* ---------------- TI: chamados e equipamentos ---------------- */
  chamados: {
    id: 'chamados', area: 'chamados', title: 'Chamados de suporte', singular: 'chamado',
    description: 'Problemas de sistema, internet, equipamentos e impressoras, até a solução.',
    filterKey: 'status', filtros: ['categoria', 'prioridade', 'solicitante'], sortKey: 'abertura', sortDir: 'desc',
    fields: [
      { key: 'titulo', label: 'Problema', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Cérebro / sistema', 'Aplicativo do afilhado', 'Internet / Wi-Fi', 'Computador / celular', 'Impressora / maquininha', 'Câmeras', 'Outro'], required: true },
      { key: 'prioridade', label: 'Prioridade', type: 'select', options: ['Baixa', 'Média', 'Alta', 'Crítica'], default: 'Média' },
      { key: 'solicitante', label: 'Aberto por', type: 'ref', ref: 'pessoas', refKey: 'solicitanteId', livre: true },
      { key: 'abertura', label: 'Aberto em', type: 'date', required: true },
      { key: 'status', label: 'Status', type: 'select', options: ['Aberta', 'Em andamento', 'Resolvida'], default: 'Aberta' },
      { key: 'descricao', label: 'Detalhes e solução', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => [
      { label: 'Em aberto', value: num(count(rows, 'status', ['Aberta', 'Em andamento'])), tone: count(rows, 'status', ['Aberta', 'Em andamento']) ? 'warn' : 'good' },
      { label: 'Altos ou críticos', value: num(rows.filter((r) => r.status !== 'Resolvida' && ['Alta', 'Crítica'].includes(s(r.prioridade))).length), tone: 'bad' },
    ],
  },
  equipamentos: {
    id: 'equipamentos', anexos: 'Notas fiscais, garantias e licenças', area: 'equipamentos', title: 'Equipamentos e licenças', singular: 'equipamento',
    description: 'Computadores, celulares, maquininhas, rede, câmeras e as assinaturas de software, com garantia e renovação.',
    filterKey: 'tipo', filtros: ['status', 'local'], sortKey: 'vencimento', sortDir: 'asc',
    fields: [
      { key: 'item', label: 'Item', type: 'text', required: true, wide: true, placeholder: 'Ex.: Notebook do caixa, Wi-Fi do salão, Canva Pro' },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Computador', 'Celular / tablet', 'Maquininha', 'Impressora', 'Rede / internet', 'Câmera', 'Software / licença', 'Outro'], required: true },
      { key: 'local', label: 'Local / responsável', type: 'text' },
      { key: 'identificacao', label: 'Marca, modelo ou série', type: 'text', formOnly: true },
      { key: 'custo', label: 'Custo (ou mensalidade)', type: 'money', max: 1_000_000 },
      { key: 'vencimento', label: 'Garantia / renovação até', type: 'date' },
      { key: 'status', label: 'Situação', type: 'select', options: ['Ativo', 'Manutenção', 'Inativo'], default: 'Ativo' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      {
        label: 'Renovação', format: 'badge',
        get: (r) => (!r.vencimento ? null : daysUntil(r.vencimento) < 0 ? 'Vencido' : daysUntil(r.vencimento) <= 30 ? 'Em renovação' : 'Vigente'),
        tone: (r) => (daysUntil(r.vencimento) < 0 ? 'bad' : daysUntil(r.vencimento) <= 30 ? 'warn' : 'good'),
      },
    ],
  },
};

/** Fichas técnicas (Vendas): os mesmos produtos, vistos pela receita. Um registro novo aqui cria o produto do cardápio. */
const temFicha = (r: Row) => { const f = fichaDe(r.ficha); return f.itens.length > 0 || f.fixos.length > 0; };
const cmvDe = (r: Row) => (temFicha(r) ? calcularFicha(fichaDe(r.ficha), n(r.preco)) : null);
const acimaDoAlvo = (r: Row) => { const c = cmvDe(r)?.cmv; return c != null && c > fichaDe(r.ficha).cmvAlvo / 100; };
COLLECTIONS.fichas = {
  ...COLLECTIONS.produtos,
  title: 'Fichas técnicas', singular: 'ficha técnica', feminino: true, fichaPrimeiro: true,
  description: 'Monte a receita com os insumos do Estoque e os preços dos fornecedores: o sistema calcula custo, CMV e preço sugerido e cria o produto do cardápio.',
  fields: COLLECTIONS.produtos.fields.map((f) => (['nome', 'categoria', 'preco'].includes(f.key) ? f : { ...f, formOnly: true })),
  // cada tamanho tem a sua ficha; o item principal que os agrupa não tem receita
  ocultarNaLista: (r) => temTamanhos(r),
  computed: [
    { label: 'Insumos', format: 'number', get: (r) => fichaDe(r.ficha).itens.length || null },
    { label: 'Custo por porção', format: 'money', get: (r) => cmvDe(r)?.porcao ?? (n(r.custo) || null) },
    {
      label: 'CMV', format: 'percent', get: (r) => cmvDe(r)?.cmv ?? null,
      tone: (r) => { const c = cmvDe(r)?.cmv; const alvo = fichaDe(r.ficha).cmvAlvo / 100; return c == null ? 'neutral' : c <= alvo ? 'good' : c <= alvo + 0.05 ? 'warn' : 'bad'; },
    },
    { label: 'Preço sugerido', format: 'money', get: (r) => cmvDe(r)?.sugerido || null },
  ],
  kpis: (todos) => {
    const rows = todos.filter(vendavel);
    const cmvs = rows.map((r) => cmvDe(r)?.cmv).filter((c): c is number => c != null);
    const acima = rows.filter(acimaDoAlvo).length;
    return [
      { label: 'Produtos com ficha', value: `${num(rows.filter(temFicha).length)} de ${num(rows.length)}` },
      { label: 'CMV médio', value: cmvs.length ? pct(cmvs.reduce((t, c) => t + c, 0) / cmvs.length) : '—' },
      { label: 'Acima do CMV desejado', value: num(acima), tone: acima ? 'bad' : 'good' },
    ];
  },
};

/** Textos com concordância de gênero para cada módulo. */
export const termos = (def: CollectionDef) => ({
  novo: `${def.feminino ? 'Nova' : 'Novo'} ${def.singular}`,
  nenhum: `${def.feminino ? 'Nenhuma' : 'Nenhum'} ${def.singular} ${def.feminino ? 'cadastrada' : 'cadastrado'}`,
  detalhes: `Detalhes ${def.feminino ? 'da' : 'do'} ${def.singular}`,
});
