import {
  Briefcase, Building2, Cctv, ShoppingBag, UserRound, ClipboardCheck, ConciergeBell, Landmark, Megaphone, Scale, Settings, Users, Wallet, Warehouse, type LucideIcon,
} from 'lucide-react';

export type AreaKey = 'eu' | 'dir' | 'atd' | 'vnd' | 'mkt' | 'rh' | 'dp' | 'adm' | 'fin' | 'jur' | 'fis' | 'mon' | 'cfg';
/** Resumo do acesso a uma área: sem acesso, só leitura ou com alguma permissão de alteração. */
export type Access = 'none' | 'view' | 'edit';

/** Permissões que cada função marca, área por área. */
export type Acao = 'ver' | 'criar' | 'editar' | 'excluir';
export const ACOES: { key: Acao; label: string; sigla: string; dica: string }[] = [
  { key: 'ver', label: 'Ver', sigla: 'V', dica: 'Abrir a área e consultar os registros' },
  { key: 'criar', label: 'Criar', sigla: 'C', dica: 'Cadastrar e lançar registros novos' },
  { key: 'editar', label: 'Editar', sigla: 'E', dica: 'Alterar registros existentes' },
  { key: 'excluir', label: 'Excluir', sigla: 'X', dica: 'Apagar registros (inclui estornos)' },
];
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
export type Nivel = 'none' | 'ver' | 'editar' | 'total';
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
  group?: string;
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
    key: 'vnd', label: 'Vendas', icon: ShoppingBag,
    description: 'Produtos e cardápio do aplicativo e os clientes (afilhados).',
    items: [
      { path: '/vendas/produtos', label: 'Produtos e cardápio' },
      { path: '/vendas/clientes', label: 'Clientes (afilhados)' },
    ],
  },
  {
    key: 'mkt', label: 'Marketing', icon: Megaphone,
    description: 'Programa de fidelidade (recompensas), criação de peças e gestão de mídias.',
    items: [
      { path: '/marketing/recompensas', label: 'Recompensas' },
      { path: '/marketing/criacao', label: 'Criação' },
      { path: '/marketing/midias', label: 'Gestão de mídias' },
    ],
  },
  {
    key: 'rh', label: 'Pessoal', icon: Users,
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
    // oculto até as câmeras serem conectadas
    key: 'mon', label: 'Monitoramento', icon: Cctv, oculta: true,
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
  { key: 'eu', label: 'Meu perfil', icon: UserRound, single: 'eu', areas: [areaByKey('eu')] },
  { key: 'dir', label: 'Diretoria', icon: Landmark, single: 'dir', areas: [areaByKey('dir')] },
  { key: 'dep', label: 'Departamentos', icon: Building2, areas: AREAS.filter((a) => !a.pessoal && !a.oculta && a.key !== 'dir' && a.key !== 'cfg') },
  { key: 'cfg', label: 'Configurações', icon: Settings, single: 'cfg', areas: [areaByKey('cfg')] },
];
/** Áreas controladas pelas funções (tela de permissões); "Meu perfil" fica de fora, é de todos. */
export const AREAS_COM_PERMISSAO = AREAS.filter((a) => !a.pessoal && !a.oculta);
/** Áreas que aparecem no sistema (menu, rotas, atalhos). */
export const AREAS_VISIVEIS = AREAS.filter((a) => !a.oculta);

export const groupOf = (area: AreaKey) => GROUPS.find((g) => g.areas.some((a) => a.key === area))!;

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
  produtos: '/vendas/produtos', recompensas: '/marketing/recompensas', criacao: '/marketing/criacao', midias: '/marketing/midias',
  colaboradores: '/rh/colaboradores', ferias: '/rh/ferias',
  projetos: '/estrutura/projetos', estoque: '/estrutura/estoque', materiais: '/estrutura/materiais',
  terceirizados: '/adm/terceirizados', fornecedores: '/adm/fornecedores', contratos: '/adm/contratos',
  receitas: '/financeiro/receitas', despesas: '/financeiro/despesas',
  trabalhista: '/juridico/trabalhista', consultoria: '/juridico/consultoria',
  qualidade: '/fiscalizacao/qualidade', naoconformidades: '/fiscalizacao/nao-conformidades',
  usuarios: '/config/usuarios', funcoes: '/config/funcoes',
};
