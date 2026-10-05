import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { SessionProvider, useSession } from './lib/session';
import { startLiveUpdates, stopLiveUpdates } from './lib/data';
import { AREAS, findModule, type AreaKey } from './modules';
import { COLLECTIONS } from './collections';
import { Layout } from './components/Layout';
import { CollectionPage } from './components/CollectionPage';
import { EmptyState, Toasts } from './components/ui';
import { ConfirmHost } from './components/pickers';
import Login from './pages/Login';
import Diretoria from './pages/Diretoria';
import { Despesas, Folha, Receitas, Resultado } from './pages/Financeiro';
import Monitoramento from './pages/Monitoramento';
import { Clientes, Consumo, Reservas, Resgates } from './pages/Vendas';
import { ChangePassword, Funcoes, Parametros, Usuarios } from './pages/Config';
import './styles.css';

/** Módulos de cadastro que usam a tela genérica. */
const GENERIC: Record<string, string> = {
  '/diretoria/metas': 'metas',
  '/rh/colaboradores': 'colaboradores',
  '/rh/ferias': 'ferias',
  '/estrutura/projetos': 'projetos',
  '/estrutura/estoque': 'estoque',
  '/estrutura/materiais': 'materiais',
  '/adm/terceirizados': 'terceirizados',
  '/adm/fornecedores': 'fornecedores',
  '/adm/contratos': 'contratos',
  '/marketing/criacao': 'criacao',
  '/marketing/midias': 'midias',
  '/marketing/produtos': 'produtos',
  '/vendas/recompensas': 'recompensas',
  '/juridico/trabalhista': 'trabalhista',
  '/juridico/consultoria': 'consultoria',
  '/fiscalizacao/qualidade': 'qualidade',
  '/fiscalizacao/nao-conformidades': 'naoconformidades',
};

const CUSTOM: Record<string, () => ReactNode> = {
  '/diretoria': () => <Diretoria />,
  '/rh/folha': () => <Folha />,
  '/financeiro/receitas': () => <Receitas />,
  '/financeiro/despesas': () => <Despesas />,
  '/financeiro/resultado': () => <Resultado />,
  '/vendas/clientes': () => <Clientes />,
  '/atendimento/reservas': () => <Reservas />,
  '/atendimento/consumo': () => <Consumo />,
  '/atendimento/vouchers': () => <Resgates />,
  '/monitoramento': () => <Monitoramento />,
  '/config/usuarios': () => <Usuarios />,
  '/config/funcoes': () => <Funcoes />,
  '/config/parametros': () => <Parametros />,
};

function Guard({ area, children }: { area: AreaKey; children: ReactNode }) {
  const { access } = useSession();
  if (access(area) === 'none') {
    return (
      <div className="page">
        <EmptyState title="Acesso não permitido">
          <ShieldOff size={16} className="inline-icon" /> Sua função não tem acesso a esta área. Fale com o administrador do sistema.
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}

function Home() {
  const { access } = useSession();
  const first = AREAS.find((a) => access(a.key) !== 'none');
  if (!first) {
    return (
      <div className="page">
        <EmptyState title="Nenhuma área liberada">Sua função ainda não tem acesso a nenhuma área. Fale com o administrador do sistema.</EmptyState>
      </div>
    );
  }
  return <Navigate to={first.items[0].path} replace />;
}

function App() {
  const { ready, usuario } = useSession();
  const [pw, setPw] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    startLiveUpdates();
    return stopLiveUpdates;
  }, [usuario?.id]);

  if (!ready) return <div className="boot"><div className="spinner" /></div>;
  if (!usuario) return <Login />;

  const paths = AREAS.flatMap((a) => a.items.map((i) => i.path));
  return (
    <Layout onChangePassword={() => setPw(true)}>
      <Routes>
        <Route path="/" element={<Home />} />
        {paths.map((p) => {
          const area = findModule(p)!.area.key;
          const element = CUSTOM[p] ? CUSTOM[p]() : GENERIC[p] ? <CollectionPage key={p} def={COLLECTIONS[GENERIC[p]]} /> : null;
          return <Route key={p} path={p} element={<Guard area={area}>{element}</Guard>} />;
        })}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </Layout>
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
