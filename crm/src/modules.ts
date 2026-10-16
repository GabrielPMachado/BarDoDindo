import {
  BarChart3, Briefcase, Building, Calculator, Cctv, ClipboardCheck, ConciergeBell, Cpu, FileStack, FolderOpen, Gavel, HandCoins, History, KeyRound, Landmark,
  Library, LifeBuoy, Megaphone, MonitorSmartphone, Plane, Receipt, Scale, ScrollText, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal, Truck, UserCog,
  UserRound, Users, Wallet, Warehouse, type LucideIcon,
} from 'lucide-react';

export type AreaKey = 'eu' | 'dir' | 'atd' | 'vnd' | 'mkt' | 'rh' | 'dp' | 'adm' | 'fin' | 'jur' | 'fis' | 'mon' | 'ti' | 'cfg';
/** Resumo do acesso a uma área: sem acesso, só leitura ou com alguma permissão de alteração. */
export type Access = 'none' | 'view' | 'edit';

/** Permissões que cada função marca, área por área. */
export type Acao = 'ver' | 'criar' | 'editar' | 'excluir';
const TODAS: Acao[] = ['ver', 'criar', 'editar', 'excluir'];
/**
 * Permissões gravadas numa função. Aceita o formato antigo (um nível por área):
 * "edit" equivale a todas as permissões e "view" a só ver.
 */
/**
 * Permissões de uma função numa área. Vendas foi separada de Marketing: enquanto a função não tiver
 * permissões próprias para Vendas, valem as que ela tinha em Marketing.
 */
export function acoesNaArea(permissoes: Record<string, unknown> | undefined, area: string): Acao[] {
  const p = permissoes ?? {};
  return acoesDe(area === 'vnd' && !('vnd' in p) ? p.mkt : p[area]);
}
export function acoesDe(p: unknown): Acao[] {
  if (Array.isArray(p)) return TODAS.filter((a) => p.includes(a));
  if (p === 'edit') return [...TODAS];
  if (p === 'view') return ['ver'];
  return [];
}
/** Os 4 níveis escolhidos na tela de funções; por baixo cada um vira uma lista de permissões. */
type Nivel = 'none' | 'ver' | 'editar' | 'total';
export const NIVEIS: { key: Nivel; label: string; dica: string; acoes: Acao[] }[] = [
  { key: 'none', label: 'Sem acesso', dica: 'A área não aparece para o usuário', acoes: [] },
  { key: 'ver', label: 'Ver', dica: 'Abrir e consultar, sem alterar nada', acoes: ['ver'] },
  { key: 'editar', label: 'Editar', dica: 'Ver, cadastrar e alterar (sem excluir)', acoes: ['ver', 'criar', 'editar'] },
  { key: 'total', label: 'Total', dica: 'Editar e também excluir (inclui estornos)', acoes: ['ver', 'criar', 'editar', 'excluir'] },
];
/** Nível que corresponde a uma lista de permissões (combinações fora dos 4 níveis ficam "personalizado"). */
export function nivelDe(acoes: Acao[]): Nivel | null {
  const n = NIVEIS.find((x) => x.acoes.length === acoes.length && x.acoes.every((a) => acoes.includes(a)));
  return n ? n.key : null;
}
export const resumoAcesso = (acoes: Acao[]): Access => (!acoes.includes('ver') ? 'none' : acoes.length > 1 ? 'edit' : 'view');

export interface SubModule {
  path: string;
  label: string;
  /** Setor do departamento (Financeiro, Pessoal, Jurídico, TI): itens com o mesmo grupo formam um setor no menu. */
  group?: string;
  /** Ícone do setor (no primeiro item do grupo). */
  icon?: LucideIcon;
}

export interface Area {
  key: AreaKey;
  label: string;
  description: string;
  icon: LucideIcon;
  items: SubModule[];
  /** Área de cada usuário (Meu perfil): sempre liberada e fora da tela de permissões. */
  pessoal?: boolean;
  /** Oculta por enquanto: fora do menu, das rotas e da tela de permissões (o código continua aqui). */
  oculta?: boolean;
}

/*
 * Áreas = unidades de permissão (cada função marca ver/criar/editar/excluir por área).
 * O menu segue a organização da casa: Meu perfil, Diretoria e os Departamentos, cada um com os seus setores.
 * No Administrativo cada setor é uma área (permissão própria); nos demais, os setores são grupos de páginas da área.
 */
export const AREAS: Area[] = [
  {
    key: 'eu', label: 'Meu perfil', icon: UserRound, pessoal: true,
    description: 'Seus dados, sua senha e o seu painel.',
    items: [
      { path: '/perfil', label: 'Meus dados' },
      { path: '/perfil/painel', label: 'Meu painel' },
    ],
  },
  {
    key: 'dir', label: 'Diretoria', icon: Landmark,
    description: 'Visão consolidada da operação, metas e decisões estratégicas.',
    items: [
      { path: '/diretoria', label: 'Painel executivo' },
      { path: '/diretoria/metas', label: 'Metas e decisões' },
    ],
  },
  /* ---------- Departamento Administrativo (um setor = uma área) ---------- */
  {
    key: 'atd', label: 'Atendimento', icon: ConciergeBell,
    description: 'Reservas, comandas dos afilhados, vouchers e o calendário da casa.',
    items: [
      { path: '/atendimento/reservas', label: 'Reservas' },
      { path: '/atendimento/consumo', label: 'Lançar consumo' },
      { path: '/atendimento/vouchers', label: 'Validar vouchers' },
      { path: '/atendimento/calendario', label: 'Calendário' },
    ],
  },
  {
    key: 'vnd', label: 'Vendas', icon: ShoppingBag,
    description: 'Produtos e cardápio do aplicativo, fichas técnicas e os clientes (afilhados).',
    items: [
      { path: '/vendas/produtos', label: 'Produtos e cardápio' },
      { path: '/vendas/fichas', label: 'Fichas técnicas' },
      { path: '/vendas/guarnicoes', label: 'Guarnições e itens fixos' },
      { path: '/vendas/clientes', label: 'Clientes (afilhados)' },
    ],
  },
  {
    key: 'mkt', label: 'Marketing', icon: Megaphone,
    description: 'Recompensas do programa de fidelidade, criação, mídias e publicidade.',
    items: [
      { path: '/marketing/recompensas', label: 'Recompensas' },
      { path: '/marketing/criacao', label: 'Criação' },
      { path: '/marketing/midias', label: 'Gestão de mídias' },
      { path: '/marketing/publicidade', label: 'Publicidade e propaganda' },
    ],
  },
  {
    key: 'dp', label: 'Estrutura', icon: Warehouse,
    description: 'Projetos, estoque, materiais e entrada de notas.',
    items: [
      { path: '/estrutura/projetos', label: 'Projetos' },
      { path: '/estrutura/estoque', label: 'Estoque' },
      { path: '/estrutura/materiais', label: 'Materiais' },
      { path: '/estrutura/notas', label: 'Entrada de notas' },
    ],
  },
  {
    key: 'adm', label: 'Logística e Compras', icon: Truck,
    description: 'Serviços terceirizados, fornecedores, tabela de preços e contratos.',
    items: [
      { path: '/adm/terceirizados', label: 'Serviços terceirizados' },
      { path: '/adm/fornecedores', label: 'Fornecedores' },
      { path: '/adm/precos', label: 'Tabela de preços' },
      { path: '/adm/contratos', label: 'Contratos' },
    ],
  },
  {
    key: 'fis', label: 'Fiscalização', icon: ClipboardCheck,
    description: 'Controle de qualidade, atestados emitidos (alvarás, licenças, laudos) e não conformidades.',
    items: [
      { path: '/fiscalizacao/qualidade', label: 'Controle de qualidade' },
      { path: '/fiscalizacao/atestados', label: 'Atestados emitidos' },
      { path: '/fiscalizacao/nao-conformidades', label: 'Não conformidades' },
    ],
  },
  /* ---------- Departamento Financeiro ---------- */
  {
    key: 'fin', label: 'Financeiro', icon: Wallet,
    description: 'Contabilidade, resultado (DRE), investidores, documentos e lançamentos.',
    items: [
      { path: '/financeiro/receitas', label: 'Receitas', group: 'Contabilidade geral', icon: Calculator },
      { path: '/financeiro/despesas/variaveis', label: 'Despesas variáveis', group: 'Contabilidade geral' },
      { path: '/financeiro/despesas/fixas', label: 'Despesas invariáveis (fixas)', group: 'Contabilidade geral' },
      { path: '/financeiro/resultado', label: 'Resultado orçamentário', group: 'Resultado (DRE)', icon: BarChart3 },
      { path: '/financeiro/ticket-medio', label: 'Ticket médio', group: 'Resultado (DRE)' },
      { path: '/financeiro/renda', label: 'Renda diária e mensal', group: 'Resultado (DRE)' },
      { path: '/financeiro/acoes', label: 'Ações da empresa', group: 'Investidores', icon: HandCoins },
      { path: '/financeiro/credito', label: 'Crédito CNPJ', group: 'Investidores' },
      { path: '/financeiro/documentos', label: 'Contratos onerosos e títulos', group: 'Documentos', icon: FileStack },
      { path: '/financeiro/relatorios', label: 'Relatórios', group: 'Documentos' },
      { path: '/financeiro/despesas', label: 'Lançamento de despesas', group: 'Lançamentos', icon: Receipt },
      { path: '/financeiro/investimentos', label: 'Lançamento de investimentos', group: 'Lançamentos' },
    ],
  },
  /* ---------- Departamento de Recursos Humanos / Pessoal ---------- */
  {
    key: 'rh', label: 'Recursos Humanos / Pessoal', icon: Users,
    description: 'Colaboradores, fornecedores pessoa física e jurídica, folha, férias, afastamentos e regras de conduta.',
    items: [
      { path: '/rh/colaboradores', label: 'Colaboradores', group: 'Colaboradores', icon: Users },
      { path: '/rh/prestadores/pf', label: 'Pessoas físicas contratadas', group: 'Fornecedores', icon: UserCog },
      { path: '/rh/prestadores/pj', label: 'Pessoas jurídicas contratadas', group: 'Fornecedores' },
      { path: '/rh/folha', label: 'Folha de pagamento', group: 'Folha de pagamento', icon: Wallet },
      { path: '/rh/ferias', label: 'Férias', group: 'Férias e afastamentos', icon: Plane },
      { path: '/rh/afastamentos', label: 'Atestados, faltas e afastamentos', group: 'Férias e afastamentos' },
      { path: '/rh/conduta', label: 'Regras de conduta', group: 'Regras de conduta', icon: ScrollText },
    ],
  },
  /* ---------- Departamento Jurídico ---------- */
  {
    key: 'jur', label: 'Jurídico', icon: Scale,
    description: 'Consultoria jurídica, trabalhista e tributário, área empresarial, advogados e a biblioteca de leis.',
    items: [
      { path: '/juridico/consultoria', label: 'Demandas de consultoria', group: 'Consultoria jurídica', icon: Gavel },
      { path: '/juridico/advogados/consultoria', label: 'Advogados', group: 'Consultoria jurídica' },
      { path: '/juridico/trabalhista', label: 'Processos', group: 'Trabalhista e Tributário', icon: FolderOpen },
      { path: '/juridico/normas/trabalhista', label: 'Normas da CLT e tributárias', group: 'Trabalhista e Tributário' },
      { path: '/juridico/advogados/trabalhista', label: 'Advogados', group: 'Trabalhista e Tributário' },
      { path: '/juridico/normas/empresarial', label: 'Normas da área empresarial', group: 'Área empresarial', icon: Building },
      { path: '/juridico/advogados/empresarial', label: 'Advogados', group: 'Área empresarial' },
      { path: '/juridico/leis', label: 'Leis e normas', group: 'Leis e normas', icon: Library },
    ],
  },
  /* ---------- Departamento de Tecnologia da Informação ---------- */
  {
    key: 'mon', label: 'Sistema de monitoramento', icon: Cctv,
    description: 'Visualização das câmeras do estabelecimento.',
    items: [{ path: '/monitoramento', label: 'Sistema de monitoramento' }],
  },
  {
    key: 'ti', label: 'Tecnologia', icon: Cpu,
    description: 'Logs de alterações, chamados de suporte e o inventário de equipamentos e licenças.',
    items: [
      { path: '/ti/logs', label: 'Logs de alterações', group: 'Logs de alterações', icon: History },
      { path: '/ti/chamados', label: 'Chamados de suporte', group: 'Chamados de suporte', icon: LifeBuoy },
      { path: '/ti/equipamentos', label: 'Equipamentos e licenças', group: 'Equipamentos e licenças', icon: MonitorSmartphone },
    ],
  },
  {
    key: 'cfg', label: 'Usuários e configurações', icon: Settings,
    description: 'Usuários, funções de acesso e parâmetros do aplicativo.',
    items: [
      { path: '/config/usuarios', label: 'Usuários', group: 'Usuários', icon: KeyRound },
      { path: '/config/funcoes', label: 'Funções e permissões', group: 'Funções e permissões', icon: ShieldCheck },
      { path: '/config/parametros', label: 'Parâmetros do aplicativo', group: 'Parâmetros do aplicativo', icon: SlidersHorizontal },
    ],
  },
];

/** Setor de um departamento: uma área inteira (Administrativo) ou um grupo de páginas de uma área. */
export interface Setor {
  key: string;
  label: string;
  icon: LucideIcon;
  area: Area;
  items: SubModule[];
}
export interface Departamento {
  key: string;
  label: string;
  icon: LucideIcon;
  setores: Setor[];
}
const areaByKey = (k: AreaKey) => AREAS.find((a) => a.key === k)!;
function setoresDe(a: Area): Setor[] {
  if (!a.items.some((i) => i.group)) return [{ key: a.key, label: a.label, icon: a.icon, area: a, items: a.items }];
  const lista: Setor[] = [];
  for (const i of a.items) {
    const g = i.group ?? a.label;
    const s = lista.find((x) => x.label === g);
    if (s) s.items.push(i);
    else lista.push({ key: `${a.key}:${g}`, label: g, icon: i.icon ?? a.icon, area: a, items: [i] });
  }
  return lista;
}
const depto = (key: string, label: string, icon: LucideIcon, areas: AreaKey[]): Departamento =>
  ({ key, label, icon, setores: areas.map(areaByKey).filter((a) => !a.oculta).flatMap(setoresDe) });
/** III - Departamentos, na ordem da casa. */
export const DEPARTAMENTOS: Departamento[] = [
  depto('adm', 'Administrativo', Briefcase, ['atd', 'vnd', 'mkt', 'dp', 'adm', 'fis']),
  depto('fin', 'Financeiro', Wallet, ['fin']),
  depto('rh', 'Recursos Humanos / Pessoal', Users, ['rh']),
  depto('jur', 'Jurídico', Scale, ['jur']),
  depto('ti', 'Tecnologia da Informação', Cpu, ['mon', 'ti', 'cfg']),
];
/** Onde fica uma página no menu: departamento e setor (Meu perfil e Diretoria não têm). */
export function localDe(path: string) {
  for (const d of DEPARTAMENTOS) for (const s of d.setores) if (s.items.some((i) => i.path === path)) return { departamento: d, setor: s };
  return null;
}

/** Áreas controladas pelas funções (tela de permissões); "Meu perfil" fica de fora, é de todos. */
export const AREAS_COM_PERMISSAO = AREAS.filter((a) => !a.pessoal && !a.oculta);
/** Áreas que aparecem no sistema (menu, rotas, atalhos). */
export const AREAS_VISIVEIS = AREAS.filter((a) => !a.oculta);

/** Endereços antigos (antes de separar Marketing e Vendas), para fixados e atalhos já salvos. */
export const CAMINHOS_ANTIGOS: Record<string, string> = { '/marketing/produtos': '/vendas/produtos', '/vendas/recompensas': '/marketing/recompensas' };

export function findModule(caminho: string) {
  const path = CAMINHOS_ANTIGOS[caminho] ?? caminho;
  for (const area of AREAS_VISIVEIS) {
    const item = area.items.find((i) => i.path === path);
    if (item) return { area, item };
  }
  return null;
}

/** Página de cada coleção, para abrir o registro citado no painel de atualizações. */
export const COLLECTION_PAGE: Record<string, string> = {
  metas: '/diretoria/metas',
  reservas: '/atendimento/reservas', consumos: '/atendimento/consumo', resgates: '/atendimento/vouchers',
  produtos: '/vendas/produtos', guarnicoes: '/vendas/guarnicoes', recompensas: '/marketing/recompensas', criacao: '/marketing/criacao', midias: '/marketing/midias',
  colaboradores: '/rh/colaboradores', ferias: '/rh/ferias',
  projetos: '/estrutura/projetos', estoque: '/estrutura/estoque', materiais: '/estrutura/materiais', compras: '/estrutura/notas',
  terceirizados: '/adm/terceirizados', fornecedores: '/adm/fornecedores', contratos: '/adm/contratos', precos: '/adm/precos',
  receitas: '/financeiro/receitas', despesas: '/financeiro/despesas',
  trabalhista: '/juridico/trabalhista', consultoria: '/juridico/consultoria',
  qualidade: '/fiscalizacao/qualidade', naoconformidades: '/fiscalizacao/nao-conformidades',
  usuarios: '/config/usuarios', funcoes: '/config/funcoes',
  eventos: '/atendimento/calendario', publicidade: '/marketing/publicidade', atestados: '/fiscalizacao/atestados',
  acoes: '/financeiro/acoes', creditos: '/financeiro/credito', docfin: '/financeiro/documentos', investimentos: '/financeiro/investimentos',
  prestadores: '/rh/prestadores/pf', conduta: '/rh/conduta',
  advogados: '/juridico/advogados/consultoria', normas: '/juridico/leis',
  chamados: '/ti/chamados', equipamentos: '/ti/equipamentos',
};

/* ---------- cargos sugeridos (Funções e permissões → "Adicionar cargos sugeridos") ---------- */
type NivelCargo = 'ver' | 'editar' | 'total';
const ACOES_DO_NIVEL: Record<NivelCargo, Acao[]> = { ver: ['ver'], editar: ['ver', 'criar', 'editar'], total: [...TODAS] };
export interface CargoSugerido { nome: string; descricao: string; permissoes: Partial<Record<AreaKey, Acao[]>> }
const cargo = (nome: string, descricao: string, niveis: Partial<Record<AreaKey, NivelCargo>>): CargoSugerido =>
  ({ nome, descricao, permissoes: Object.fromEntries(Object.entries(niveis).map(([k, n]) => [k, ACOES_DO_NIVEL[n as NivelCargo]])) });
const OPERACAO: AreaKey[] = ['atd', 'vnd', 'mkt', 'dp', 'adm', 'fis'];
const TUDO: AreaKey[] = [...OPERACAO, 'dir', 'fin', 'rh', 'jur', 'mon', 'ti'];
const todasEm = (areas: AreaKey[], n: NivelCargo) => Object.fromEntries(areas.map((a) => [a, n])) as Partial<Record<AreaKey, NivelCargo>>;
export const CARGOS_SUGERIDOS: CargoSugerido[] = [
  cargo('Sócio / Diretoria', 'Vê toda a casa e decide na Diretoria; não mexe em usuários.', { ...todasEm(TUDO, 'ver'), dir: 'total', cfg: 'ver' }),
  cargo('Gerente geral', 'Comanda a operação inteira: edita tudo e exclui no Administrativo.', { ...todasEm(OPERACAO, 'total'), dir: 'editar', fin: 'editar', rh: 'editar', jur: 'ver', mon: 'ver', ti: 'editar', cfg: 'ver' }),
  cargo('Gerente de salão', 'Atendimento, vendas e qualidade do salão.', { atd: 'total', vnd: 'editar', mkt: 'ver', dp: 'ver', fis: 'editar', mon: 'ver' }),
  cargo('Atendente / Garçom', 'Reservas, consumos e vouchers; consulta o cardápio.', { atd: 'editar', vnd: 'ver' }),
  cargo('Caixa', 'Lança consumos e vouchers e acompanha as receitas.', { atd: 'editar', vnd: 'ver', fin: 'ver' }),
  cargo('Bartender', 'Fichas técnicas e cardápio, com o estoque do bar.', { vnd: 'editar', dp: 'editar', atd: 'ver' }),
  cargo('Compras e estoque', 'Estoque, materiais, notas, fornecedores e preços.', { dp: 'total', adm: 'total', vnd: 'ver', fin: 'ver' }),
  cargo('Marketing', 'Recompensas, criação, mídias e publicidade; edita o cardápio.', { mkt: 'total', vnd: 'editar', atd: 'ver' }),
  cargo('Financeiro', 'Contabilidade, DRE, investidores e lançamentos.', { fin: 'total', adm: 'ver', rh: 'ver', dir: 'ver', dp: 'ver' }),
  cargo('Recursos Humanos', 'Colaboradores, prestadores, folha, férias e conduta.', { rh: 'total', jur: 'ver', fin: 'ver' }),
  cargo('Jurídico', 'Consultoria, processos, advogados e normas.', { jur: 'total', rh: 'ver', adm: 'ver', fin: 'ver', fis: 'ver' }),
  cargo('Fiscal / Qualidade', 'Inspeções, atestados emitidos e não conformidades.', { fis: 'total', dp: 'ver', adm: 'ver', atd: 'ver' }),
  cargo('TI / Suporte', 'Monitoramento, logs, chamados, equipamentos e usuários.', { ti: 'total', mon: 'total', cfg: 'editar' }),
];
