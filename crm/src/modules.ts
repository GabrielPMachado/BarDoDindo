import {
  Briefcase, Building2, Cctv, ClipboardCheck, ConciergeBell, Landmark, Megaphone, Scale, Settings, Users, Wallet, Warehouse, type LucideIcon,
} from 'lucide-react';

export type AreaKey = 'dir' | 'atd' | 'mkt' | 'rh' | 'dp' | 'adm' | 'fin' | 'jur' | 'fis' | 'mon' | 'cfg';
export type Access = 'none' | 'view' | 'edit';

export interface SubModule {
  path: string;
  label: string;
  group?: string;
}

export interface Area {
  key: AreaKey;
  label: string;
  description: string;
  icon: LucideIcon;
  items: SubModule[];
}

export const AREAS: Area[] = [
  {
    key: 'dir', label: 'Diretoria', icon: Landmark,
    description: 'Visão consolidada da operação, metas e decisões estratégicas.',
    items: [
      { path: '/diretoria', label: 'Painel executivo' },
      { path: '/diretoria/metas', label: 'Metas e decisões' },
    ],
  },
  {
    key: 'atd', label: 'Atendimento', icon: ConciergeBell,
    description: 'Operação do salão: reservas, comandas dos afilhados e vouchers.',
    items: [
      { path: '/atendimento/reservas', label: 'Reservas' },
      { path: '/atendimento/consumo', label: 'Lançar consumo' },
      { path: '/atendimento/vouchers', label: 'Validar vouchers' },
    ],
  },
  {
    key: 'mkt', label: 'Marketing e Vendas', icon: Megaphone,
    description: 'Cardápio, clientes, programa de fidelidade, criação e mídias.',
    items: [
      { path: '/marketing/produtos', label: 'Produtos e cardápio' },
      { path: '/vendas/clientes', label: 'Clientes (afilhados)' },
      { path: '/vendas/recompensas', label: 'Recompensas' },
      { path: '/marketing/criacao', label: 'Criação' },
      { path: '/marketing/midias', label: 'Gestão de mídias' },
    ],
  },
  {
    key: 'rh', label: 'Pessoal (RH/DP)', icon: Users,
    description: 'Colaboradores, férias, afastamentos e folha de pagamento.',
    items: [
      { path: '/rh/colaboradores', label: 'Colaboradores' },
      { path: '/rh/ferias', label: 'Férias e afastamentos' },
      { path: '/rh/folha', label: 'Folha de pagamento' },
    ],
  },
  {
    key: 'dp', label: 'Estrutura', icon: Warehouse,
    description: 'Projetos, estoque e materiais.',
    items: [
      { path: '/estrutura/projetos', label: 'Projetos' },
      { path: '/estrutura/estoque', label: 'Estoque' },
      { path: '/estrutura/materiais', label: 'Materiais' },
    ],
  },
  {
    key: 'adm', label: 'Administrativo', icon: Briefcase,
    description: 'Serviços terceirizados, fornecedores e contratos.',
    items: [
      { path: '/adm/terceirizados', label: 'Serviços terceirizados' },
      { path: '/adm/fornecedores', label: 'Fornecedores' },
      { path: '/adm/contratos', label: 'Contratos' },
    ],
  },
  {
    key: 'fin', label: 'Financeiro', icon: Wallet,
    description: 'Receitas, despesas (incluindo o lançamento da folha) e resultado.',
    items: [
      { path: '/financeiro/receitas', label: 'Receitas' },
      { path: '/financeiro/despesas', label: 'Despesas' },
      { path: '/financeiro/resultado', label: 'Resultado (DRE)' },
    ],
  },
  {
    key: 'jur', label: 'Jurídico', icon: Scale,
    description: 'Processos trabalhistas e consultoria empresarial.',
    items: [
      { path: '/juridico/trabalhista', label: 'Trabalhista' },
      { path: '/juridico/consultoria', label: 'Consultoria empresarial' },
    ],
  },
  {
    key: 'fis', label: 'Fiscalização', icon: ClipboardCheck,
    description: 'Controle de qualidade e não conformidades.',
    items: [
      { path: '/fiscalizacao/qualidade', label: 'Controle de qualidade' },
      { path: '/fiscalizacao/nao-conformidades', label: 'Não conformidades' },
    ],
  },
  {
    key: 'mon', label: 'Monitoramento', icon: Cctv,
    description: 'Visualização das câmeras do estabelecimento.',
    items: [{ path: '/monitoramento', label: 'Câmeras' }],
  },
  {
    key: 'cfg', label: 'Configurações', icon: Settings,
    description: 'Usuários, funções de acesso e parâmetros do aplicativo.',
    items: [
      { path: '/config/usuarios', label: 'Usuários' },
      { path: '/config/funcoes', label: 'Funções e permissões' },
      { path: '/config/parametros', label: 'Parâmetros do aplicativo' },
    ],
  },
];

/** Os três grandes grupos do menu: Diretoria, Departamentos (as demais áreas) e Configurações. */
export interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Grupo de uma área só: os itens da área aparecem direto, sem um nível intermediário. */
  single?: AreaKey;
  areas: Area[];
}
const areaByKey = (k: AreaKey) => AREAS.find((a) => a.key === k)!;
export const GROUPS: NavGroup[] = [
  { key: 'dir', label: 'Diretoria', icon: Landmark, single: 'dir', areas: [areaByKey('dir')] },
  { key: 'dep', label: 'Departamentos', icon: Building2, areas: AREAS.filter((a) => a.key !== 'dir' && a.key !== 'cfg') },
  { key: 'cfg', label: 'Configurações', icon: Settings, single: 'cfg', areas: [areaByKey('cfg')] },
];
export const groupOf = (area: AreaKey) => GROUPS.find((g) => g.areas.some((a) => a.key === area))!;

export function findModule(path: string) {
  for (const area of AREAS) {
    const item = area.items.find((i) => i.path === path);
    if (item) return { area, item };
  }
  return null;
}

/** Página de cada coleção, para abrir o registro citado no painel de atualizações. */
export const COLLECTION_PAGE: Record<string, string> = {
  metas: '/diretoria/metas',
  reservas: '/atendimento/reservas', consumos: '/atendimento/consumo', resgates: '/atendimento/vouchers',
  produtos: '/marketing/produtos', recompensas: '/vendas/recompensas', criacao: '/marketing/criacao', midias: '/marketing/midias',
  colaboradores: '/rh/colaboradores', ferias: '/rh/ferias',
  projetos: '/estrutura/projetos', estoque: '/estrutura/estoque', materiais: '/estrutura/materiais',
  terceirizados: '/adm/terceirizados', fornecedores: '/adm/fornecedores', contratos: '/adm/contratos',
  receitas: '/financeiro/receitas', despesas: '/financeiro/despesas',
  trabalhista: '/juridico/trabalhista', consultoria: '/juridico/consultoria',
  qualidade: '/fiscalizacao/qualidade', naoconformidades: '/fiscalizacao/nao-conformidades',
  usuarios: '/config/usuarios', funcoes: '/config/funcoes',
};
