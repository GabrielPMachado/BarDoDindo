import type { AreaKey } from './modules';
import type { Row } from './lib/data';
import { brl, daysUntil, isoToday, num, pct } from './lib/format';

export type FieldType = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'email' | 'phone' | 'percent' | 'cnpj' | 'time' | 'ref';

/** Listas que podem ser vinculadas (servidas por /api/crm/referencias/:tipo). */
export type RefSource = 'pessoas' | 'colaboradores' | 'fornecedores' | 'clientes';

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
  /** Ao escolher um item, copia outros dados dele (campo do registro → campo do item). */
  fill?: Record<string, string>;
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
  format?: 'money' | 'number' | 'percent' | 'badge' | 'text';
  tone?: (r: Row) => Tone;
}

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}

export interface CollectionDef {
  id: string;
  area: AreaKey;
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
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  /** Cada registro pode ter uma foto (miniatura na tabela, campo no formulário e imagem nas exportações). */
  comFoto?: boolean;
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
/** Categoria de despesa sugerida para cada tipo de contrato. */
const CATEGORIA_DO_CONTRATO: Record<string, string> = { Locação: 'Aluguel', 'Prestação de serviço': 'Terceirizados', Fornecimento: 'Fornecedores' };

/** Tons de status reconhecidos em todos os módulos. */
const TONES: Record<string, Tone> = {
  Ativo: 'good', Ativa: 'good', Concluído: 'good', Concluída: 'good', Pago: 'good', Aprovado: 'good', Conforme: 'good',
  Vigente: 'good', Publicado: 'good', Confirmada: 'good', Resolvida: 'good', 'Encerrado (favorável)': 'good', Utilizado: 'good',
  Bom: 'good', Novo: 'good', Disponível: 'info',
  Pendente: 'warn', 'Em andamento': 'warn', 'Em análise': 'warn', Agendado: 'warn', 'Em produção': 'warn', 'Em aprovação': 'warn',
  'A pagar': 'warn', 'Em renovação': 'warn', 'Conforme com ressalvas': 'warn', 'Em tratamento': 'warn', Férias: 'info',
  Afastado: 'warn', Planejado: 'info', Briefing: 'info', Rascunho: 'neutral', Pausado: 'neutral', Regular: 'warn',
  Manutenção: 'warn', 'Em avaliação': 'warn', Suspenso: 'warn', Aberta: 'warn', Acordo: 'info', Média: 'warn', Sazonal: 'info',
  Atrasado: 'bad', Atrasada: 'bad', Cancelado: 'bad', Cancelada: 'bad', Vencido: 'bad', 'Não conforme': 'bad', Desligado: 'neutral',
  Encerrado: 'neutral', Inativo: 'neutral', Inativa: 'neutral', Recusada: 'bad', 'Cancelada pelo cliente': 'neutral',
  'Não compareceu': 'bad', Descartar: 'bad', Alta: 'bad', Crítica: 'bad', Baixa: 'neutral', 'Encerrado (desfavorável)': 'bad',
};
export const toneOf = (value: unknown): Tone => TONES[s(value)] ?? 'neutral';

export const STATUS_KEYS = ['status', 'resultado', 'estado', 'gravidade', 'prioridade'];

export const COLLECTIONS: Record<string, CollectionDef> = {
  /* ---------------- Diretoria ---------------- */
  metas: {
    id: 'metas', feminino: true, area: 'dir', title: 'Metas e decisões', singular: 'meta ou decisão',
    description: 'Objetivos da casa e decisões registradas pela diretoria.',
    filterKey: 'status', sortKey: 'prazo', sortDir: 'asc',
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
    id: 'colaboradores', comFoto: true, area: 'rh', title: 'Colaboradores', singular: 'colaborador',
    description: 'Cadastro da equipe, cargos e vínculos.',
    filterKey: 'setor', sortKey: 'nome',
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
    id: 'ferias', area: 'rh', title: 'Férias e afastamentos', singular: 'registro',
    description: 'Programação de férias, atestados e licenças.',
    filterKey: 'tipo', sortKey: 'inicio',
    fields: [
      { key: 'colaborador', label: 'Colaborador', type: 'ref', ref: 'colaboradores', refKey: 'colaboradorId', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Férias', 'Atestado médico', 'Licença maternidade', 'Licença paternidade', 'Afastamento INSS', 'Outro'], required: true },
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
    id: 'projetos', area: 'dp', title: 'Projetos', singular: 'projeto',
    // o "Realizado" do projeto é acumulado: o valor de cada lançamento é digitado, para não contar o mesmo gasto duas vezes
    despesa: (r) => ({ descricao: juntar('Projeto', r.nome), categoria: 'Outras despesas', valor: 0 }),
    description: 'Obras, reformas, melhorias e implantações.',
    filterKey: 'status', sortKey: 'prazo', sortDir: 'asc',
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
    id: 'estoque', comFoto: true, area: 'dp', title: 'Estoque', singular: 'item de estoque',
    description: 'Insumos com controle de quantidade mínima e validade.',
    filterKey: 'categoria', sortKey: 'item',
    fields: [
      { key: 'item', label: 'Item', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Bebidas', 'Alimentos', 'Descartáveis', 'Limpeza', 'Outros'], required: true },
      { key: 'unidade', label: 'Unidade', type: 'select', options: ['un', 'cx', 'fardo', 'kg', 'g', 'L', 'ml', 'pct'], default: 'un' },
      { key: 'quantidade', label: 'Quantidade', type: 'number', required: true, decimals: 3, max: 1_000_000 },
      { key: 'minimo', label: 'Estoque mínimo', type: 'number', decimals: 3, max: 1_000_000 },
      { key: 'custo', label: 'Custo unitário', type: 'money', max: 100_000, formOnly: true },
      { key: 'fornecedor', label: 'Fornecedor', type: 'ref', ref: 'fornecedores', refKey: 'fornecedorId', livre: true, formOnly: true },
      { key: 'validade', label: 'Validade', type: 'date' },
    ],
    computed: [
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
    id: 'materiais', comFoto: true, area: 'dp', title: 'Materiais', singular: 'material',
    description: 'Patrimônio: equipamentos, utensílios, mobiliário e uniformes.',
    filterKey: 'tipo', sortKey: 'material',
    fields: [
      { key: 'material', label: 'Material', type: 'text', required: true, wide: true },
      { key: 'tipo', label: 'Tipo', type: 'select', options: ['Equipamento', 'Utensílio', 'Mobiliário', 'Uniforme', 'Eletrônico', 'Outro'], required: true },
      { key: 'quantidade', label: 'Quantidade', type: 'number', default: 1, min: 1, max: 100_000 },
      { key: 'local', label: 'Local', type: 'select', options: ['Salão', 'Bar', 'Cozinha', 'Depósito', 'Escritório', 'Área externa'] },
      { key: 'estado', label: 'Estado', type: 'select', options: ['Novo', 'Bom', 'Regular', 'Manutenção', 'Descartar'], default: 'Bom' },
      { key: 'valor', label: 'Valor unitário', type: 'money', max: 10_000_000 },
      { key: 'aquisicao', label: 'Aquisição', type: 'date' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    kpis: (rows) => [
      { label: 'Itens patrimoniais', value: num(sum(rows, 'quantidade')) },
      { label: 'Valor patrimonial', value: brl(rows.reduce((t, r) => t + n(r.quantidade) * n(r.valor), 0)) },
      { label: 'Em manutenção / descarte', value: num(count(rows, 'estado', ['Manutenção', 'Descartar'])) },
    ],
  },

  /* ---------------- Administrativo ---------------- */
  terceirizados: {
    id: 'terceirizados', area: 'adm', title: 'Serviços terceirizados', singular: 'serviço',
    despesa: (r) => ({ descricao: juntar(r.servico, r.empresa), categoria: 'Terceirizados', valor: n(r.valor) }),
    description: 'Prestadores recorrentes: segurança, limpeza, manutenção, música e outros.',
    filterKey: 'categoria', sortKey: 'proximo', sortDir: 'asc',
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
    id: 'fornecedores', area: 'adm', title: 'Fornecedores', singular: 'fornecedor',
    description: 'Cadastro e avaliação de fornecedores.',
    filterKey: 'categoria', sortKey: 'nome',
    fields: [
      { key: 'nome', label: 'Razão social / nome', type: 'text', required: true, wide: true },
      { key: 'cnpj', label: 'CNPJ', type: 'cnpj', placeholder: '00.000.000/0000-00' },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Bebidas', 'Carnes', 'Hortifrúti', 'Mercearia', 'Descartáveis', 'Limpeza', 'Gás', 'Equipamentos', 'Outro'], required: true },
      { key: 'contato', label: 'Contato', type: 'text' },
      { key: 'telefone', label: 'Telefone', type: 'phone' },
      { key: 'email', label: 'E-mail', type: 'email', formOnly: true },
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
    id: 'contratos', area: 'adm', title: 'Contratos', singular: 'contrato',
    despesa: (r) => ({ descricao: juntar(r.titulo, r.parte), categoria: CATEGORIA_DO_CONTRATO[s(r.tipo)] ?? 'Outras despesas', valor: n(r.valor) }),
    description: 'Contratos vigentes, vencimentos e renovações.',
    filterKey: 'status', sortKey: 'vencimento', sortDir: 'asc',
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
    id: 'receitas', feminino: true, area: 'fin', title: 'Receitas', singular: 'receita',
    description: 'Entradas do caixa. Consumos lançados para clientes do aplicativo entram aqui automaticamente.',
    filterKey: 'categoria', sortKey: 'data', sortDir: 'desc',
    fields: [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'descricao', label: 'Descrição', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Vendas no salão', 'Vendas no balcão', 'Delivery', 'Eventos', 'Consumo de clientes', 'Outras receitas'], required: true },
      { key: 'formaPagamento', label: 'Forma de pagamento', type: 'select', options: ['Pix', 'Crédito', 'Débito', 'Dinheiro', 'Vale-refeição', 'Não informado'] },
      { key: 'valor', label: 'Valor', type: 'money', required: true, min: 0.01, max: 1_000_000 },
    ],
  },
  despesas: {
    id: 'despesas', feminino: true, area: 'fin', title: 'Despesas', singular: 'despesa',
    description: 'Contas a pagar e lançamentos de despesa, inclusive a folha de pagamento.',
    filterKey: 'status', sortKey: 'vencimento', sortDir: 'asc',
    fields: [
      { key: 'descricao', label: 'Descrição', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Fornecedores', 'Folha de pagamento', 'Encargos', 'Aluguel', 'Energia e água', 'Impostos', 'Terceirizados', 'Marketing', 'Manutenção', 'Tarifas bancárias', 'Outras despesas'], required: true },
      { key: 'data', label: 'Competência', type: 'date', required: true },
      { key: 'vencimento', label: 'Vencimento', type: 'date' },
      { key: 'valor', label: 'Valor', type: 'money', required: true, min: 0.01, max: 1_000_000 },
      { key: 'status', label: 'Status', type: 'select', options: ['A pagar', 'Pago', 'Cancelado'], default: 'A pagar' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      {
        label: 'Situação', format: 'badge',
        get: (r) => (r.status === 'A pagar' && daysUntil(r.vencimento) < 0 ? 'Vencido' : s(r.status)),
        tone: (r) => (r.status === 'A pagar' && daysUntil(r.vencimento) < 0 ? 'bad' : toneOf(r.status)),
      },
    ],
  },

  /* ---------------- Marketing e Vendas (produtos são de Vendas) ---------------- */
  criacao: {
    id: 'criacao', comFoto: true, feminino: true, area: 'mkt', title: 'Criação', singular: 'peça',
    description: 'Fluxo de produção de peças: do briefing à publicação.',
    filterKey: 'status', sortKey: 'entrega', sortDir: 'asc',
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
    id: 'midias', comFoto: true, feminino: true, area: 'mkt', title: 'Gestão de mídias', singular: 'publicação',
    despesa: (r) => ({ descricao: juntar('Mídia', r.conteudo, r.canal), categoria: 'Marketing', valor: n(r.investimento) }),
    description: 'Calendário de publicações e resultados por canal.',
    filterKey: 'canal', sortKey: 'data', sortDir: 'desc',
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
    id: 'produtos', comFoto: true, area: 'vnd', title: 'Produtos e cardápio', singular: 'produto',
    description: 'Produtos marcados como "No cardápio" e ativos aparecem no aplicativo dos clientes.',
    filterKey: 'categoria', sortKey: 'nome',
    fields: [
      { key: 'nome', label: 'Produto', type: 'text', required: true, wide: true },
      { key: 'categoria', label: 'Categoria', type: 'select', options: ['Cervejas', 'Chopes', 'Drinks', 'Destilados', 'Vinhos', 'Petiscos', 'Porções', 'Pratos', 'Sobremesas', 'Sem álcool'], required: true },
      { key: 'preco', label: 'Preço de venda', type: 'money', required: true, min: 0.01, max: 100_000 },
      { key: 'custo', label: 'Custo', type: 'money', max: 100_000 },
      { key: 'noCardapio', label: 'No cardápio do app', type: 'select', options: ['Sim', 'Não'], default: 'Sim' },
      { key: 'destaque', label: 'Destaque', type: 'select', options: ['Não', 'Sim'], default: 'Não' },
      { key: 'status', label: 'Status', type: 'select', options: ['Ativo', 'Sazonal', 'Inativo'], default: 'Ativo' },
      { key: 'descricao', label: 'Descrição no cardápio', type: 'textarea', formOnly: true, wide: true },
    ],
    computed: [
      {
        label: 'Margem', format: 'percent',
        get: (r) => (n(r.preco) && n(r.custo) ? (n(r.preco) - n(r.custo)) / n(r.preco) : null),
        tone: (r) => (n(r.preco) && n(r.custo) && (n(r.preco) - n(r.custo)) / n(r.preco) < 0.3 ? 'warn' : 'neutral'),
      },
    ],
    kpis: (rows) => {
      const comCusto = rows.filter((r) => n(r.preco) && n(r.custo));
      const margem = comCusto.length ? comCusto.reduce((t, r) => t + (n(r.preco) - n(r.custo)) / n(r.preco), 0) / comCusto.length : null;
      return [
        { label: 'Produtos ativos', value: num(count(rows, 'status', ['Ativo'])) },
        { label: 'Publicados no app', value: num(rows.filter((r) => r.status === 'Ativo' && r.noCardapio !== 'Não').length), tone: 'info' },
        { label: 'Margem média', value: margem === null ? '—' : pct(margem) },
      ];
    },
  },
  recompensas: {
    id: 'recompensas', comFoto: true, feminino: true, area: 'mkt', title: 'Recompensas', singular: 'recompensa',
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
    id: 'reservas', feminino: true, area: 'atd', title: 'Reservas', singular: 'reserva',
    description: 'Solicitações feitas pelo aplicativo e reservas registradas pela equipe.',
    filterKey: 'status', sortKey: 'data', sortDir: 'asc',
    fields: [
      { key: 'clienteNome', label: 'Cliente', type: 'ref', ref: 'clientes', refKey: 'clienteId', livre: true, required: true, fill: { clienteTelefone: 'telefone' } },
      { key: 'clienteTelefone', label: 'Telefone', type: 'phone' },
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'hora', label: 'Horário', type: 'time', required: true },
      { key: 'pessoas', label: 'Pessoas', type: 'number', required: true, default: 2, min: 1, max: 50 },
      { key: 'ambiente', label: 'Ambiente', type: 'text' },
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
    id: 'trabalhista', area: 'jur', title: 'Trabalhista', singular: 'processo',
    description: 'Reclamações trabalhistas, audiências e valores envolvidos.',
    filterKey: 'status', sortKey: 'audiencia', sortDir: 'asc',
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
    id: 'consultoria', feminino: true, area: 'jur', title: 'Consultoria empresarial', singular: 'demanda',
    description: 'Pareceres, revisões contratuais, licenças e questões societárias.',
    filterKey: 'tipo', sortKey: 'prazo', sortDir: 'asc',
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
    id: 'qualidade', feminino: true, area: 'fis', title: 'Controle de qualidade', singular: 'inspeção',
    description: 'Inspeções periódicas por área com nota e resultado.',
    filterKey: 'area', sortKey: 'data', sortDir: 'desc',
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
    id: 'naoconformidades', feminino: true, area: 'fis', title: 'Não conformidades', singular: 'não conformidade',
    description: 'Problemas identificados e o plano de ação corretiva.',
    filterKey: 'status', sortKey: 'prazo', sortDir: 'asc',
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
};

/** Textos com concordância de gênero para cada módulo. */
export const termos = (def: CollectionDef) => ({
  novo: `${def.feminino ? 'Nova' : 'Novo'} ${def.singular}`,
  nenhum: `${def.feminino ? 'Nenhuma' : 'Nenhum'} ${def.singular} ${def.feminino ? 'cadastrada' : 'cadastrado'}`,
  detalhes: `Detalhes ${def.feminino ? 'da' : 'do'} ${def.singular}`,
});
