import {
  BarChart3, Briefcase, Building, Calculator, Cctv, ClipboardCheck, ConciergeBell, Cpu, FileStack, FolderOpen, Gavel, HandCoins, History, KeyRound, Landmark,
  Library, LifeBuoy, Megaphone, MonitorSmartphone, Plane, Receipt, Scale, ScrollText, Settings, ShieldCheck, ShoppingBag, SlidersHorizontal, Truck, UserCog,
  UserRound, Users, Wallet, Warehouse, type LucideIcon,
} from 'lucide-react';
import { PAI_DO_MODULO, permissaoDe } from '../../shared/backend';

export type AreaKey = 'eu' | 'dir' | 'atd' | 'vnd' | 'mkt' | 'rh' | 'dp' | 'adm' | 'fin' | 'jur' | 'fis' | 'mon' | 'ti' | 'cfg';
/** Resumo do acesso a uma área: sem acesso, só leitura ou com alguma permissão de alteração. */
export type Access = 'none' | 'view' | 'edit';

/** Permissões que cada função marca, área por área. */
export type Acao = 'ver' | 'criar' | 'editar' | 'excluir';
const TODAS: Acao[] = ['ver', 'criar', 'editar', 'excluir'];
/**
 * Permissões de uma função num módulo (tela ou cadastro). Funções de antes da separação por tela não têm o módulo:
 * valem as da área dele (e Vendas herda de Marketing). "edit" equivale a todas as permissões e "view" a só ver.
 */
export function acoesNaArea(permissoes: Record<string, unknown> | undefined, modulo: string): Acao[] {
  return acoesDe(permissaoDe(permissoes ?? {}, modulo));
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
  /** Permissão (módulo) que a página exige: uma por tela ou cadastro; páginas do mesmo cadastro dividem a mesma. */
  perm: string;
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
      { path: '/perfil', perm: 'eu', label: 'Meus dados' },
      { path: '/perfil/painel', perm: 'eu', label: 'Meu painel' },
      // temporário: será retirado depois
      { path: '/perfil/pintura', perm: 'eu', label: 'Simular pintura (3D)' },
    ],
  },
  {
    key: 'dir', label: 'Diretoria', icon: Landmark,
    description: 'Visão consolidada da operação, metas e decisões estratégicas.',
    items: [
      { path: '/diretoria', perm: 'painel', label: 'Painel executivo' },
      { path: '/diretoria/metas', perm: 'metas', label: 'Metas e decisões' },
    ],
  },
  /* ---------- Departamento Administrativo (um setor = uma área) ---------- */
  {
    key: 'atd', label: 'Atendimento', icon: ConciergeBell,
    description: 'Reservas, caixa, comandas, mapa de mesas, vouchers e o calendário da casa.',
    items: [
      { path: '/atendimento/reservas', perm: 'reservas', label: 'Reservas' },
      { path: '/atendimento/caixa', perm: 'caixas', label: 'Caixa' },
      { path: '/atendimento/comandas', perm: 'comandas', label: 'Comandas' },
      { path: '/atendimento/mesas', perm: 'mesas', label: 'Mapa de mesas' },
      { path: '/atendimento/consumo', perm: 'consumos', label: 'Lançar consumo' },
      { path: '/atendimento/vouchers', perm: 'resgates', label: 'Validar vouchers' },
      { path: '/atendimento/calendario', perm: 'eventos', label: 'Calendário' },
    ],
  },
  {
    key: 'vnd', label: 'Vendas', icon: ShoppingBag,
    description: 'Produtos e cardápio do aplicativo, fichas técnicas e os clientes (afilhados).',
    items: [
      { path: '/vendas/produtos', perm: 'produtos', label: 'Produtos e cardápio' },
      { path: '/vendas/fichas', perm: 'fichas', label: 'Fichas técnicas' },
      { path: '/vendas/guarnicoes', perm: 'guarnicoes', label: 'Guarnições e itens fixos' },
      { path: '/vendas/clientes', perm: 'clientes', label: 'Clientes (afilhados)' },
      { path: '/vendas/qrcode', perm: 'qrcode', label: 'QR Code Afilie-se' },
    ],
  },
  {
    key: 'mkt', label: 'Marketing', icon: Megaphone,
    description: 'Recompensas do programa de fidelidade, criação, mídias e publicidade.',
    items: [
      { path: '/marketing/recompensas', perm: 'recompensas', label: 'Recompensas' },
      { path: '/marketing/criacao', perm: 'criacao', label: 'Criação' },
      { path: '/marketing/midias', perm: 'midias', label: 'Gestão de mídias' },
      { path: '/marketing/publicidade', perm: 'publicidade', label: 'Publicidade e propaganda' },
    ],
  },
  {
    key: 'dp', label: 'Estrutura', icon: Warehouse,
    description: 'Projetos, estoque, materiais, patrimônio e entrada de notas.',
    items: [
      { path: '/estrutura/projetos', perm: 'projetos', label: 'Projetos' },
      { path: '/estrutura/estoque', perm: 'estoque', label: 'Estoque' },
      { path: '/estrutura/materiais', perm: 'materiais', label: 'Materiais' },
      { path: '/estrutura/patrimonio', perm: 'patrimonio', label: 'Patrimônio' },
      { path: '/estrutura/notas', perm: 'compras', label: 'Entrada de notas' },
    ],
  },
  {
    key: 'adm', label: 'Logística e Compras', icon: Truck,
    description: 'Serviços terceirizados, fornecedores, tabela de preços e contratos.',
    items: [
      { path: '/adm/terceirizados', perm: 'terceirizados', label: 'Serviços terceirizados' },
      { path: '/adm/fornecedores', perm: 'fornecedores', label: 'Fornecedores' },
      { path: '/adm/precos', perm: 'precos', label: 'Tabela de preços' },
      { path: '/adm/contratos', perm: 'contratos', label: 'Contratos' },
    ],
  },
  {
    key: 'fis', label: 'Fiscalização', icon: ClipboardCheck,
    description: 'Controle de qualidade, atestados emitidos (alvarás, licenças, laudos) e não conformidades.',
    items: [
      { path: '/fiscalizacao/qualidade', perm: 'qualidade', label: 'Controle de qualidade' },
      { path: '/fiscalizacao/atestados', perm: 'atestados', label: 'Atestados emitidos' },
      { path: '/fiscalizacao/nao-conformidades', perm: 'naoconformidades', label: 'Não conformidades' },
    ],
  },
  /* ---------- Departamento Financeiro ---------- */
  {
    key: 'fin', label: 'Financeiro', icon: Wallet,
    description: 'Contabilidade, resultado (DRE), investidores, documentos e arquivos da empresa e lançamentos.',
    items: [
      { path: '/financeiro/receitas', perm: 'receitas', label: 'Receitas', group: 'Contabilidade geral', icon: Calculator },
      { path: '/financeiro/despesas/variaveis', perm: 'despesas_variaveis', label: 'Despesas variáveis', group: 'Contabilidade geral' },
      { path: '/financeiro/despesas/fixas', perm: 'despesas_fixas', label: 'Despesas invariáveis (fixas)', group: 'Contabilidade geral' },
      { path: '/financeiro/resultado', perm: 'resultado', label: 'Resultado orçamentário', group: 'Resultado (DRE)', icon: BarChart3 },
      { path: '/financeiro/ticket-medio', perm: 'ticket', label: 'Ticket médio', group: 'Resultado (DRE)' },
      { path: '/financeiro/renda', perm: 'renda', label: 'Renda diária e mensal', group: 'Resultado (DRE)' },
      { path: '/financeiro/acoes', perm: 'acoes', label: 'Ações da empresa', group: 'Investidores', icon: HandCoins },
      { path: '/financeiro/credito', perm: 'creditos', label: 'Crédito CNPJ', group: 'Investidores' },
      { path: '/financeiro/documentos', perm: 'docfin', label: 'Contratos onerosos e títulos', group: 'Documentos', icon: FileStack },
      { path: '/financeiro/relatorios', perm: 'relatorios', label: 'Relatórios', group: 'Documentos' },
      { path: '/financeiro/arquivos', perm: 'arquivos', label: 'Arquivos', group: 'Documentos' },
      { path: '/financeiro/despesas', perm: 'despesas', label: 'Lançamento de despesas', group: 'Lançamentos', icon: Receipt },
      { path: '/financeiro/investimentos', perm: 'investimentos', label: 'Lançamento de investimentos', group: 'Lançamentos' },
    ],
  },
  /* ---------- Departamento de Recursos Humanos / Pessoal ---------- */
  {
    key: 'rh', label: 'Recursos Humanos / Pessoal', icon: Users,
    description: 'Colaboradores, fornecedores pessoa física e jurídica, folha, férias, afastamentos e regras de conduta.',
    items: [
      { path: '/rh/colaboradores', perm: 'colaboradores', label: 'Colaboradores', group: 'Colaboradores', icon: Users },
      { path: '/rh/prestadores/pf', perm: 'prestadores', label: 'Pessoas físicas contratadas', group: 'Fornecedores', icon: UserCog },
      { path: '/rh/prestadores/pj', perm: 'prestadores_pj', label: 'Pessoas jurídicas contratadas', group: 'Fornecedores' },
      { path: '/rh/folha', perm: 'folha', label: 'Folha de pagamento', group: 'Folha de pagamento', icon: Wallet },
      { path: '/rh/ferias', perm: 'ferias', label: 'Férias', group: 'Férias e afastamentos', icon: Plane },
      { path: '/rh/afastamentos', perm: 'afastamentos', label: 'Atestados, faltas e afastamentos', group: 'Férias e afastamentos' },
      { path: '/rh/conduta', perm: 'conduta', label: 'Regras de conduta', group: 'Regras de conduta', icon: ScrollText },
    ],
  },
  /* ---------- Departamento Jurídico ---------- */
  {
    key: 'jur', label: 'Jurídico', icon: Scale,
    description: 'Consultoria jurídica, trabalhista e tributário, área empresarial, advogados e a biblioteca de leis.',
    items: [
      { path: '/juridico/consultoria', perm: 'consultoria', label: 'Demandas de consultoria', group: 'Consultoria jurídica', icon: Gavel },
      { path: '/juridico/advogados/consultoria', perm: 'advogados', label: 'Advogados', group: 'Consultoria jurídica' },
      { path: '/juridico/trabalhista', perm: 'trabalhista', label: 'Processos', group: 'Trabalhista e Tributário', icon: FolderOpen },
      { path: '/juridico/normas/trabalhista', perm: 'normas_trabalhista', label: 'Normas da CLT e tributárias', group: 'Trabalhista e Tributário' },
      { path: '/juridico/advogados/trabalhista', perm: 'advogados_trabalhista', label: 'Advogados', group: 'Trabalhista e Tributário' },
      { path: '/juridico/normas/empresarial', perm: 'normas_empresarial', label: 'Normas da área empresarial', group: 'Área empresarial', icon: Building },
      { path: '/juridico/advogados/empresarial', perm: 'advogados_empresarial', label: 'Advogados', group: 'Área empresarial' },
      { path: '/juridico/leis', perm: 'normas', label: 'Leis e normas', group: 'Leis e normas', icon: Library },
    ],
  },
  /* ---------- Departamento de Tecnologia da Informação ---------- */
  {
    key: 'mon', label: 'Sistema de monitoramento', icon: Cctv,
    description: 'Visualização das câmeras do estabelecimento.',
    items: [{ path: '/monitoramento', perm: 'mon', label: 'Sistema de monitoramento' }],
  },
  {
    key: 'ti', label: 'Tecnologia', icon: Cpu,
    description: 'Logs de alterações, chamados de suporte e o inventário de equipamentos e licenças.',
    items: [
      { path: '/ti/logs', perm: 'logs', label: 'Logs de alterações', group: 'Logs de alterações', icon: History },
      { path: '/ti/chamados', perm: 'chamados', label: 'Chamados de suporte', group: 'Chamados de suporte', icon: LifeBuoy },
      { path: '/ti/equipamentos', perm: 'equipamentos', label: 'Equipamentos e licenças', group: 'Equipamentos e licenças', icon: MonitorSmartphone },
    ],
  },
  {
    key: 'cfg', label: 'Usuários e configurações', icon: Settings,
    description: 'Usuários, funções de acesso e parâmetros do aplicativo.',
    items: [
      { path: '/config/usuarios', perm: 'usuarios', label: 'Usuários', group: 'Usuários', icon: KeyRound },
      { path: '/config/funcoes', perm: 'funcoes', label: 'Funções e permissões', group: 'Funções e permissões', icon: ShieldCheck },
      { path: '/config/parametros', perm: 'parametros', label: 'Parâmetros do aplicativo', group: 'Parâmetros do aplicativo', icon: SlidersHorizontal },
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

/* ---------- módulos (uma permissão por tela ou cadastro) ---------- */
export interface Modulo { key: string; label: string; area: AreaKey; setor: string; paginas: string[] }
/** Nome da tela no editor de permissões, quando o do menu sozinho não diz tudo. */
const NOME_DO_MODULO: Record<string, string> = {
  painel: 'Painel executivo', despesas: 'Lançamento de despesas', advogados: 'Advogados · Consultoria jurídica',
  advogados_trabalhista: 'Advogados · Trabalhista e Tributário', advogados_empresarial: 'Advogados · Área empresarial',
  normas: 'Leis e normas (biblioteca completa)',
};
/** Todos os módulos, na ordem do menu (cada um uma vez), com o setor onde aparece primeiro. */
export const MODULOS: Modulo[] = (() => {
  const lista: Modulo[] = [];
  const setorDe = (path: string) => localDe(path)?.setor.label ?? AREAS.find((a) => a.items.some((i) => i.path === path))?.label ?? '';
  for (const a of AREAS) {
    if (a.pessoal || a.oculta) continue;
    for (const i of a.items) {
      const m = lista.find((x) => x.key === i.perm);
      if (m) m.paginas.push(i.label);
      else lista.push({ key: i.perm, label: NOME_DO_MODULO[i.perm] ?? i.label, area: a.key, setor: setorDe(i.path), paginas: [i.label] });
    }
  }
  return lista;
})();
/** Grupos da tela de permissões: Diretoria e cada departamento, com os seus módulos. */
export const GRUPOS_DE_PERMISSAO: { label: string; modulos: Modulo[] }[] = [
  { label: 'Diretoria', modulos: MODULOS.filter((m) => m.area === 'dir') },
  ...DEPARTAMENTOS.map((d) => {
    const areas = new Set(d.setores.map((st) => st.area.key));
    return { label: `Departamento ${d.label}`, modulos: MODULOS.filter((m) => areas.has(m.area)) };
  }),
];
/** Área antiga de cada módulo (para cargos definidos por área). */
const areaDoModulo = (k: string): string => PAI_DO_MODULO[k] ?? k;
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
  projetos: '/estrutura/projetos', estoque: '/estrutura/estoque', materiais: '/estrutura/materiais', patrimonio: '/estrutura/patrimonio', compras: '/estrutura/notas',
  terceirizados: '/adm/terceirizados', fornecedores: '/adm/fornecedores', contratos: '/adm/contratos', precos: '/adm/precos',
  receitas: '/financeiro/receitas', despesas: '/financeiro/despesas',
  trabalhista: '/juridico/trabalhista', consultoria: '/juridico/consultoria',
  qualidade: '/fiscalizacao/qualidade', naoconformidades: '/fiscalizacao/nao-conformidades',
  usuarios: '/config/usuarios', funcoes: '/config/funcoes',
  eventos: '/atendimento/calendario', publicidade: '/marketing/publicidade', atestados: '/fiscalizacao/atestados',
  acoes: '/financeiro/acoes', creditos: '/financeiro/credito', docfin: '/financeiro/documentos', arquivos: '/financeiro/arquivos', investimentos: '/financeiro/investimentos',
  prestadores: '/rh/prestadores/pf', conduta: '/rh/conduta',
  advogados: '/juridico/advogados/consultoria', normas: '/juridico/leis',
  chamados: '/ti/chamados', equipamentos: '/ti/equipamentos',
};

/* ---------- cargos sugeridos (Funções e permissões → "Adicionar cargos sugeridos") ---------- */
type NivelCargo = 'ver' | 'editar' | 'total';
const ACOES_DO_NIVEL: Record<NivelCargo, Acao[]> = { ver: ['ver'], editar: ['ver', 'criar', 'editar'], total: [...TODAS] };
export interface CargoSugerido { nome: string; descricao: string; permissoes: Record<string, Acao[]> }
/** O cargo é pensado por área; grava uma permissão para cada módulo (os que ficam sem acesso, vazios). */
const cargo = (nome: string, descricao: string, niveis: Partial<Record<AreaKey, NivelCargo>>, ajustes: Record<string, NivelCargo | 'none'> = {}): CargoSugerido => ({
  nome, descricao,
  permissoes: Object.fromEntries(MODULOS.map((m) => {
    const n = ajustes[m.key] ?? niveis[areaDoModulo(m.key) as AreaKey];
    return [m.key, n && n !== 'none' ? ACOES_DO_NIVEL[n] : []];
  })),
});
const OPERACAO: AreaKey[] = ['atd', 'vnd', 'mkt', 'dp', 'adm', 'fis'];
const TUDO: AreaKey[] = [...OPERACAO, 'dir', 'fin', 'rh', 'jur', 'mon', 'ti'];
const todasEm = (areas: AreaKey[], n: NivelCargo) => Object.fromEntries(areas.map((a) => [a, n])) as Partial<Record<AreaKey, NivelCargo>>;
/** Quanto poder uma lista de permissões dá: soma das ações liberadas em todas as telas (usado para ordenar os cargos). */
export const poderDe = (acoesDe: (k: string) => Acao[]) => MODULOS.reduce((t, m) => t + acoesDe(m.key).length, 0);
const CARGOS: CargoSugerido[] = [
  cargo('Sócio / Diretoria', 'Vê toda a casa e decide na Diretoria; não mexe em usuários.', { ...todasEm(TUDO, 'ver'), dir: 'total', cfg: 'ver' }),
  cargo('Gerente geral', 'Comanda a operação inteira: edita tudo e exclui no Administrativo.', { ...todasEm(OPERACAO, 'total'), dir: 'editar', fin: 'editar', rh: 'editar', jur: 'ver', mon: 'ver', ti: 'editar', cfg: 'ver' }),
  cargo('Gerente de salão', 'Atendimento, vendas e qualidade do salão.', { atd: 'total', vnd: 'editar', mkt: 'ver', dp: 'ver', fis: 'editar', mon: 'ver' }),
  cargo('Atendente / Garçom', 'Reservas, consumos e vouchers; consulta o cardápio.', { atd: 'editar', vnd: 'ver' }, { clientes: 'none', guarnicoes: 'none', caixas: 'ver' }),
  cargo('Caixa', 'Lança consumos e vouchers e acompanha as receitas.', { atd: 'editar' }, { produtos: 'ver', clientes: 'ver', receitas: 'ver', ticket: 'ver', renda: 'ver' }),
  cargo('Bartender', 'Fichas técnicas e cardápio, com o estoque do bar.', { vnd: 'editar' }, { clientes: 'none', estoque: 'editar', compras: 'ver', eventos: 'ver', reservas: 'ver' }),
  cargo('Compras e estoque', 'Estoque, materiais, patrimônio, notas, fornecedores e preços.', { dp: 'total', adm: 'total', vnd: 'ver', fin: 'ver' }),
  cargo('Marketing', 'Recompensas, criação, mídias e publicidade; edita o cardápio.', { mkt: 'total', vnd: 'editar', atd: 'ver' }),
  cargo('Financeiro', 'Contabilidade, DRE, investidores e lançamentos.', { fin: 'total', adm: 'ver', dir: 'ver' }, { folha: 'ver', compras: 'ver' }),
  cargo('Recursos Humanos', 'Colaboradores, prestadores, folha, férias e conduta.', { rh: 'total' }, { trabalhista: 'ver', advogados_trabalhista: 'ver', normas_trabalhista: 'ver' }),
  cargo('Jurídico', 'Consultoria, processos, advogados e normas.', { jur: 'total', rh: 'ver', adm: 'ver', fin: 'ver', fis: 'ver' }),
  cargo('Fiscal / Qualidade', 'Inspeções, atestados emitidos e não conformidades.', { fis: 'total', dp: 'ver', adm: 'ver', atd: 'ver' }),
  cargo('TI / Suporte', 'Monitoramento, logs, chamados, equipamentos e usuários.', { ti: 'total', mon: 'total', cfg: 'editar' }, { funcoes: 'ver' }),
];
/** Os cargos prontos, do que tem mais poderes para o que tem menos. */
export const CARGOS_SUGERIDOS: CargoSugerido[] = [...CARGOS].sort((a, b) => poderDe((k) => b.permissoes[k] ?? []) - poderDe((k) => a.permissoes[k] ?? []));
