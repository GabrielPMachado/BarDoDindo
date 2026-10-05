import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Brain, ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { AREAS, findModule } from '../modules';
import { useSession } from '../lib/session';
import { initials } from '../lib/format';
import { useLastSync } from '../lib/data';

function Crown({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 50 30" aria-hidden="true">
      <path d="M3 26 L7 6 L17 16 L25 2 L33 16 L43 6 L47 26 Z" fill="currentColor" />
      <rect x="3" y="26" width="44" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={`brand ${large ? 'brand--lg' : ''}`}>
      <span className="brand__crown"><Crown size={large ? 30 : 20} /></span>
      <span className="brand__bar">BAR DO</span>
      <span className="brand__dindo">DINDO</span>
      <span className="brand__sub">Gestão</span>
    </div>
  );
}

export function Layout({ children, onChangePassword }: { children: ReactNode; onChangePassword: () => void }) {
  const { usuario, funcao, access, logout } = useSession();
  const { pathname } = useLocation();
  const current = findModule(pathname);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState(false);
  const areas = AREAS.filter((a) => access(a.key) !== 'none');
  const lastSync = useLastSync();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav">
          {/* Cérebro: categoria principal, que reúne todas as áreas; sempre aberta */}
          <div className="brain" aria-label="Cérebro — todas as áreas">
            <div className="brain__title">
              <span className="brain__line" aria-hidden="true" />
              <Brain size={18} strokeWidth={1.6} />
              <span className="brain__name">Cérebro</span>
              <span className="brain__line brain__line--right" aria-hidden="true" />
            </div>
            <span className="brain__sub">Todas as áreas</span>
          </div>
          {areas.map((a) => {
            const open = !collapsed[a.key];
            let lastGroup: string | undefined;
            return (
              <div key={a.key} className="nav__area">
                <button className={`nav__head ${current?.area.key === a.key ? 'is-current' : ''}`} onClick={() => setCollapsed((c) => ({ ...c, [a.key]: open }))}>
                  <a.icon size={18} strokeWidth={1.7} />
                  <span>{a.label}</span>
                  {access(a.key) === 'view' && <span className="nav__ro" title="Somente leitura">leitura</span>}
                  <ChevronDown size={14} className={`nav__chev ${open ? '' : 'is-closed'}`} />
                </button>
                {open && (
                  <div className="nav__items">
                    {a.items.map((i) => {
                      const header = i.group && i.group !== lastGroup ? i.group : null;
                      lastGroup = i.group;
                      return (
                        <div key={i.path}>
                          {header && <div className="nav__group">{header}</div>}
                          <NavLink to={i.path} end className="nav__link">{i.label}</NavLink>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            {current ? (
              <>
                <span className="crumbs__root">Cérebro</span>
                <span className="crumbs__sep">/</span>
                <span className="muted">{current.area.label}</span>
                <span className="crumbs__sep">/</span>
                <strong>{current.item.label}</strong>
              </>
            ) : (
              <strong>Início</strong>
            )}
          </div>
          <div className="live" title="Os dados são atualizados automaticamente">
            <span className={`live__dot ${lastSync && Date.now() - lastSync.getTime() < 10000 ? 'is-on' : ''}`} />
            {lastSync ? `Ao vivo · ${lastSync.toLocaleTimeString('pt-BR')}` : 'Conectando…'}
          </div>
          <div className="user">
            <button className="user__btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              <span className="user__avatar">{initials(usuario?.nome ?? '')}</span>
              <span className="user__info">
                <strong>{usuario?.nome}</strong>
                <small>{funcao?.nome ?? 'Sem função'}</small>
              </span>
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="user__menu" onMouseLeave={() => setMenu(false)}>
                <button onClick={() => { setMenu(false); onChangePassword(); }}><KeyRound size={16} /> Alterar senha</button>
                <button onClick={() => logout()}><LogOut size={16} /> Sair</button>
              </div>
            )}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
