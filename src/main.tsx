import { StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { StoreProvider, useStore } from './store';
import { BottomNav, ConfirmSheet, Spinner, TopBar } from './components/ui';
import Home from './pages/Home';
import Reservas from './pages/Reservas';
import Historico from './pages/Historico';
import Cardapio from './pages/Cardapio';
import Recompensas from './pages/Recompensas';
import Perfil from './pages/Perfil';
import Entrar from './pages/Entrar';
import './styles.css';

// na primeira visita o service worker é só instalado: recarregar ali apagava o formulário de quem já estava se cadastrando.
// A página só recarrega quando uma versão nova substitui uma que já controlava o app.
const jaControlado = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
registerSW({
  immediate: true,
  onNeedReload: () => { if (jaControlado) window.location.reload(); },
  // procura versão nova a cada minuto, sem a pessoa precisar fechar e abrir o app
  onRegisteredSW: (_url, r) => { if (r) setInterval(() => r.update().catch(() => undefined), 60000); },
});

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Shell() {
  const { ready, me, refresh } = useStore();
  const { pathname } = useLocation();

  // ao trocar de tela, busca as novidades do bar (pontos, confirmações, cardápio)
  useEffect(() => {
    if (me) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!ready) {
    return (
      <div className="app app--center">
        <Spinner />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="app">
        <Entrar />
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/reservas" element={<Reservas />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/cardapio" element={<Cardapio />} />
          <Route path="/recompensas" element={<Recompensas />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

// HashRouter funciona igual na web e dentro do Capacitor (Android/iOS)
// reaproveita a raiz se o módulo for reexecutado (atualização em desenvolvimento)
const container = document.getElementById('root') as HTMLElement & { __root?: Root };
container.__root ??= createRoot(container);
container.__root.render(
  <StrictMode>
    <StoreProvider>
      <HashRouter>
        <ScrollTop />
        <Shell />
        <ConfirmSheet />
      </HashRouter>
    </StoreProvider>
  </StrictMode>,
);
