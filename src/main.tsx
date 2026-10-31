import { StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';
import { StoreProvider, useStore } from './store';
import { BottomNav, ConfirmSheet, Spinner, TopBar } from './components/ui';
import Home from './pages/Home';
import Reservas from './pages/Reservas';
import Historico from './pages/Historico';
import Cardapio from './pages/Cardapio';
import Recompensas from './pages/Recompensas';
import Perfil from './pages/Perfil';
import Conversa from './pages/Conversa';
import Entrar from './pages/Entrar';
import CompletarCadastro from './components/CompletarCadastro';
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

  // demonstração da tela de reserva: abre sem login e não grava nada (para testar o PS5, o karaokê e as animações)
  if (pathname === '/demo/reservas') {
    return (
      <div className="app">
        <main><Reservas demo /></main>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="app app--center">
        <Spinner />
      </div>
    );
  }

  // cardápio aberto, sem login: o cardápio já é público (para mostrar a quem ainda não é afilhado)
  if (pathname === '/demo/cardapio') {
    return (
      <div className="app">
        <main><Cardapio /></main>
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

  // +18: cadastros de antes do lançamento completam CPF e data de nascimento antes de usar o app
  if (!me.cliente.cadastroCompleto) {
    return (
      <div className="app">
        <CompletarCadastro />
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
          <Route path="/conversa" element={<Conversa />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

// Antes do lançamento só o pré-cadastro fica aberto no domínio oficial: quem abre bardodindo.com.br vai para
// /queroserafilhado. No endereço do Firebase (bardo-c0878.web.app) o app segue aberto.
// Para liberar o app em todo lugar, troque para true. Para testar o app mesmo assim, abra com ?app=1 (vale até fechar a aba).
const APP_LIBERADO = !/^(www\.)?bardodindo\.com\.br$/.test(location.hostname);
const testeDoApp = (() => {
  try {
    if (new URLSearchParams(location.search).has('app')) sessionStorage.setItem('app-liberado', '1');
    return sessionStorage.getItem('app-liberado') === '1';
  } catch {
    return false;
  }
})();
const redirecionar = !APP_LIBERADO && !testeDoApp && !Capacitor.isNativePlatform() && !import.meta.env.DEV
  && !/^\/(queroserafilhado|afilhado)/.test(location.pathname) // nunca em laço, se o servidor errar a rota
  && !location.hash.startsWith('#/demo/'); // demonstrações abrem sem login e não gravam nada
if (redirecionar) location.replace('/queroserafilhado');

// HashRouter funciona igual na web e dentro do Capacitor (Android/iOS)
// reaproveita a raiz se o módulo for reexecutado (atualização em desenvolvimento)
const container = document.getElementById('root') as HTMLElement & { __root?: Root };
container.__root ??= createRoot(container);
if (!redirecionar) container.__root.render(
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
