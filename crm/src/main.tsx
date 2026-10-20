import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { SessionProvider, useSession } from './lib/session';
import { startLiveUpdates, stopLiveUpdates, vigiarNovaVersao } from './lib/data';
import { AREAS_VISIVEIS as AREAS, CAMINHOS_ANTIGOS, findModule } from './modules';
import { COLLECTIONS } from './collections';
import { Brand, Layout } from './components/Layout';
import { CollectionPage } from './components/CollectionPage';
import { CalculadoraGuarnicoes } from './components/CalculadoraGuarnicoes';
import { EmptyState, Toasts } from './components/ui';
import { ConfirmHost } from './components/pickers';
import Login from './pages/Login';
import Diretoria, { MeuPainel } from './pages/Diretoria';
import { Despesas, Folha, Receitas, Renda, Resultado, TicketMedio } from './pages/Financeiro';
import Calendario from './pages/Calendario';
import Logs from './pages/Logs';
import { Advogados, Leis, Normas } from './pages/Juridico';
import Monitoramento from './pages/Monitoramento';
import { Clientes, Consumo, Reservas, Resgates } from './pages/Vendas';
import { Funcoes, Parametros, Usuarios } from './pages/Config';
import MeuPerfil from './pages/MeuPerfil';
import QrCodeAfilhados from './pages/QrCode';
import { CaixaPage, ComandasPage, MesasPage } from './pages/Salao';
import './styles.css';

vigiarNovaVersao();

/** Módulos de cadastro que usam a tela genérica. */
const GENERIC: Record<string, string> = {
  '/diretoria/metas': 'metas',
  '/rh/colaboradores': 'colaboradores',
  '/rh/conduta': 'conduta',
  '/marketing/publicidade': 'publicidade',
  '/fiscalizacao/atestados': 'atestados',
  '/financeiro/acoes': 'acoes',
  '/financeiro/credito': 'creditos',
  '/financeiro/investimentos': 'investimentos',
  '/ti/chamados': 'chamados',
  '/ti/equipamentos': 'equipamentos',
  '/estrutura/projetos': 'projetos',
  '/estrutura/estoque': 'estoque',
  '/estrutura/materiais': 'materiais',
  '/estrutura/notas': 'compras',
  '/adm/terceirizados': 'terceirizados',
  '/adm/fornecedores': 'fornecedores',
  '/adm/precos': 'precos',
  '/vendas/fichas': 'fichas',
  '/adm/contratos': 'contratos',
  '/marketing/criacao': 'criacao',
  '/marketing/midias': 'midias',
  '/vendas/produtos': 'produtos',
  '/marketing/recompensas': 'recompensas',
  '/juridico/trabalhista': 'trabalhista',
  '/juridico/consultoria': 'consultoria',
  '/fiscalizacao/qualidade': 'qualidade',
  '/fiscalizacao/nao-conformidades': 'naoconformidades',
};

/** A mesma lista vista por partes (ex.: só as férias, só os prestadores pessoa física). */
function Parte({ col, titulo, descricao, campo, valores, fora }: { col: string; titulo: string; descricao?: string; campo: string; valores: string[]; fora?: boolean }) {
  const def = { ...COLLECTIONS[col], title: titulo, description: descricao ?? COLLECTIONS[col].description };
  return (
    <CollectionPage
      key={titulo} def={def}
      filterRows={(r) => valores.includes(String(r[campo] ?? '')) !== !!fora}
      newDefaults={fora ? undefined : { [campo]: valores[0] }}
    />
  );
}

const CUSTOM: Record<string, () => ReactNode> = {
  '/atendimento/calendario': () => <Calendario />,
  '/financeiro/despesas/variaveis': () => <Despesas natureza="Variável" />,
  '/financeiro/despesas/fixas': () => <Despesas natureza="Fixa" />,
  '/financeiro/ticket-medio': () => <TicketMedio />,
  '/financeiro/renda': () => <Renda />,
  '/financeiro/documentos': () => <Parte col="docfin" titulo="Contratos onerosos e títulos" campo="tipo" valores={['Relatório']} fora />,
  '/financeiro/relatorios': () => <Parte col="docfin" titulo="Relatórios" descricao="Relatórios financeiros, balancetes e prestações de contas (PDF)." campo="tipo" valores={['Relatório']} />,
  '/rh/prestadores/pf': () => <Parte col="prestadores" titulo="Pessoas físicas contratadas" descricao="Freelas, músicos, seguranças e outros profissionais autônomos que prestam serviço à casa." campo="tipo" valores={['Pessoa física']} />,
  '/rh/prestadores/pj': () => <Parte col="prestadores" titulo="Pessoas jurídicas contratadas" descricao="Empresas contratadas para serviços de pessoal: contabilidade, segurança, limpeza, eventos…" campo="tipo" valores={['Pessoa jurídica']} />,
  '/rh/ferias': () => <Parte col="ferias" titulo="Férias" descricao="Programação de férias da equipe." campo="tipo" valores={['Férias']} />,
  '/rh/afastamentos': () => <Parte col="ferias" titulo="Atestados, faltas e afastamentos" descricao="Atestados médicos, faltas, licenças e afastamentos." campo="tipo" valores={['Férias']} fora />,
  '/juridico/advogados/consultoria': () => <Advogados atuacao="Consultoria jurídica" />,
  '/juridico/advogados/trabalhista': () => <Advogados atuacao="Trabalhista e Tributário" />,
  '/juridico/advogados/empresarial': () => <Advogados atuacao="Empresarial" />,
  '/juridico/normas/trabalhista': () => <Normas tipo="trabalhista" />,
  '/juridico/normas/empresarial': () => <Normas tipo="empresarial" />,
  '/juridico/leis': () => <Leis />,
  '/ti/logs': () => <Logs />,
  '/perfil': () => <MeuPerfil />,
  '/perfil/painel': () => <MeuPainel />,
  '/diretoria': () => <Diretoria />,
  '/rh/folha': () => <Folha />,
  '/financeiro/receitas': () => <Receitas />,
  '/financeiro/despesas': () => <Despesas />,
  '/financeiro/resultado': () => <Resultado />,
  '/vendas/clientes': () => <Clientes />,
  '/vendas/qrcode': () => <QrCodeAfilhados />,
  '/vendas/guarnicoes': () => <CollectionPage def={COLLECTIONS.guarnicoes} before={(rows) => <CalculadoraGuarnicoes rows={rows} />} />,
  '/atendimento/reservas': () => <Reservas />,
  '/atendimento/consumo': () => <Consumo />,
  '/atendimento/caixa': () => <CaixaPage />,
  '/atendimento/comandas': () => <ComandasPage />,
  '/atendimento/mesas': () => <MesasPage />,
  '/atendimento/vouchers': () => <Resgates />,
  '/monitoramento': () => <Monitoramento />,
  '/config/usuarios': () => <Usuarios />,
  '/config/funcoes': () => <Funcoes />,
  '/config/parametros': () => <Parametros />,
};

function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  const { access } = useSession();
  if (access(perm) === 'none') {
    return (
      <div className="page">
        <EmptyState title="Acesso não permitido">
          <ShieldOff size={16} className="inline-icon" /> Sua função não tem acesso a esta área. Fale com a Presidência.
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}

function Home() {
  const { access } = useSession();
  // abre a primeira área liberada pela função; quem ainda não tem nenhuma cai no próprio painel (Meu perfil)
  const first = AREAS.filter((a) => !a.pessoal).flatMap((a) => a.items).find((i) => access(i.perm) !== 'none');
  return <Navigate to={first ? first.path : '/perfil/painel'} replace />;
}

/** Tela de passagem logo depois de entrar; some sozinha ou ao clicar. */
function BoasVindas({ nome, onDone }: { nome: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="welcome" role="status" onClick={onDone}>
      <Brand />
      <h1>Seja bem-vindo ao Cérebro</h1>
      <p>{nome.split(' ')[0]}</p>
    </div>
  );
}

function App() {
  const { ready, usuario, boasVindas, dispensarBoasVindas } = useSession();

  useEffect(() => {
    if (!usuario) return;
    startLiveUpdates();
    return stopLiveUpdates;
  }, [usuario?.id]);

  if (!ready) return <div className="boot"><div className="spinner" /></div>;
  if (!usuario) return <Login />;

  const paths = AREAS.flatMap((a) => a.items.map((i) => i.path));
  return (
    <>
    {boasVindas && <BoasVindas nome={usuario.nome} onDone={dispensarBoasVindas} />}
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        {paths.map((p) => {
          const perm = findModule(p)!.item.perm;
          const element = CUSTOM[p] ? CUSTOM[p]() : GENERIC[p] ? <CollectionPage key={p} def={COLLECTIONS[GENERIC[p]]} /> : null;
          return <Route key={p} path={p} element={<Guard perm={perm}>{element}</Guard>} />;
        })}
        {Object.entries(CAMINHOS_ANTIGOS).map(([antigo, novo]) => <Route key={antigo} path={antigo} element={<Navigate to={novo} replace />} />)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
    </>
  );
}

// reaproveita a raiz se o módulo for reexecutado (atualização em desenvolvimento)
const container = document.getElementById('root') as HTMLElement & { __root?: Root };
container.__root ??= createRoot(container);
container.__root.render(
  <StrictMode>
    <SessionProvider>
      <HashRouter>
        <App />
        <Toasts />
        <ConfirmHost />
      </HashRouter>
    </SessionProvider>
  </StrictMode>,
);
