import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AppWindow, ChevronDown, Copy, ExternalLink, KeyRound, LogOut, MousePointerClick, Pin, PinOff, X } from 'lucide-react';
import { GROUPS, findModule, groupOf, type Area } from '../modules';
import { useSession } from '../lib/session';
import { initials } from '../lib/format';
import { useLastSync } from '../lib/data';
import { usePins } from '../lib/pins';
import { AtividadesButton, PainelAtualizacoes, usePainelAoAbrir } from './Atividades';
import { notify } from './ui';
import logoUrl from '../../../shared/assets/logo.webp';

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={`brand ${large ? 'brand--lg' : ''}`}>
      <img className="brand__logo" src={logoUrl} alt="Bar do Dindo" width={large ? 280 : 116} height={large ? 280 : 116} />
      <div className="brand__title">
        <span className="brand__line" aria-hidden="true" />
        <span className="brand__name">Cérebro</span>
        <span className="brand__line brand__line--right" aria-hidden="true" />
      </div>
    </div>
  );
}

/** Endereço completo de uma página do CRM, para abrir em outra guia ou copiar. */
const fullUrl = (path: string) => `${location.origin}${location.pathname}${location.search}#${path}`;

interface MenuState { x: number; y: number; path: string }

/** Menu do botão direito sobre uma página: abrir em outra guia/janela, copiar o link e fixar no topo. */
function ContextMenu({ menu, pinned, onPin, onClose }: { menu: MenuState; pinned: boolean; onPin: () => void; onClose: () => void }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });

  useEffect(() => {
    // mantém o menu dentro da tela
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.min(menu.x, innerWidth - r.width - 8), top: Math.min(menu.y, innerHeight - r.height - 8) });
    const fora = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [menu, onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl(menu.path));
      notify('Link copiado.');
    } catch {
      notify('Não foi possível copiar o link.', 'error');
    }
  };

  return (
    <div className="ctx" ref={ref} style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      <button role="menuitem" onClick={run(() => navigate(menu.path))}><MousePointerClick size={15} /> Abrir</button>
      <button role="menuitem" onClick={run(() => window.open(fullUrl(menu.path), '_blank'))}><ExternalLink size={15} /> Abrir em nova guia</button>
      <button role="menuitem" onClick={run(() => window.open(fullUrl(menu.path), '_blank', 'popup,width=1320,height=860'))}><AppWindow size={15} /> Abrir em nova janela</button>
      <button role="menuitem" onClick={run(copiar)}><Copy size={15} /> Copiar link</button>
      <div className="ctx__sep" />
      <button role="menuitem" onClick={run(onPin)}>
        {pinned ? <><PinOff size={15} /> Desafixar</> : <><Pin size={15} /> Fixar</>}
      </button>
    </div>
  );
}

export function Layout({ children, onChangePassword }: { children: ReactNode; onChangePassword: () => void }) {
  const { usuario, funcao, access, logout } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = findModule(pathname);
  const lastSync = useLastSync();
  const { pins, isPinned, toggle, unpin } = usePins(usuario?.id);
  const [menu, setMenu] = useState(false);
  const [ctx, setCtx] = useState<MenuState | null>(null);
  const painel = usePainelAoAbrir();
  const navRef = useRef<HTMLElement>(null);

  // grupos começam abertos; departamentos começam fechados, exceto o da página atual
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ 'g:dir': true, 'g:dep': true, 'g:cfg': true }));
  const expand = (areaKey: Area['key']) => setOpen((o) => ({ ...o, [`g:${groupOf(areaKey).key}`]: true, [`a:${areaKey}`]: true }));
  useEffect(() => {
    if (!current) return;
    expand(current.area.key);
    // leva a página atual para a área visível do menu
    requestAnimationFrame(() => navRef.current?.querySelector('.nav__link.active')?.scrollIntoView({ block: 'nearest' }));
  }, [current?.area.key, current?.item.path]);
  const flip = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const openMenu = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, path });
  };
  const goPinned = (path: string) => {
    const m = findModule(path);
    if (m) expand(m.area.key);
    navigate(path);
  };

  const items = (a: Area) => {
    let lastGroup: string | undefined;
    return (
      <div className="nav__items">
        {a.items.map((i) => {
          const header = i.group && i.group !== lastGroup ? i.group : null;
          lastGroup = i.group;
          return (
            <div key={i.path}>
              {header && <div className="nav__group">{header}</div>}
              <NavLink to={i.path} end className="nav__link" onContextMenu={openMenu(i.path)}>
                <span>{i.label}</span>
                {isPinned(i.path) && <Pin size={12} className="nav__pin" aria-label="Fixado" />}
              </NavLink>
            </div>
          );
        })}
      </div>
    );
  };

  const fixados = pins
    .map((p) => findModule(p))
    .filter((m): m is NonNullable<typeof m> => !!m && access(m.area.key) !== 'none');

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav" ref={navRef}>
          {GROUPS.map((g) => {
            const areas = g.areas.filter((a) => access(a.key) !== 'none');
            if (!areas.length) return null;
            const gOpen = !!open[`g:${g.key}`];
            const isCurrent = current && groupOf(current.area.key).key === g.key;
            return (
              <div key={g.key} className="nav__block">
                <button className={`nav__head nav__head--group ${isCurrent ? 'is-current' : ''}`} onClick={() => flip(`g:${g.key}`)} aria-expanded={gOpen}>
                  <g.icon size={18} strokeWidth={1.7} />
                  <span>{g.label}</span>
                  {g.single && access(g.single) === 'view' && <span className="nav__ro" title="Somente leitura">leitura</span>}
                  <ChevronDown size={14} className={`nav__chev ${gOpen ? '' : 'is-closed'}`} />
                </button>
                {gOpen && (g.single ? items(areas[0]) : (
                  <div className="nav__depts">
                    {areas.map((a) => {
                      const aOpen = !!open[`a:${a.key}`];
                      return (
                        <div key={a.key} className="nav__area">
                          <button className={`nav__head nav__head--dept ${current?.area.key === a.key ? 'is-current' : ''}`} onClick={() => flip(`a:${a.key}`)} aria-expanded={aOpen}>
                            <a.icon size={16} strokeWidth={1.7} />
                            <span>{a.label}</span>
                            {access(a.key) === 'view' && <span className="nav__ro" title="Somente leitura">leitura</span>}
                            <ChevronDown size={13} className={`nav__chev ${aOpen ? '' : 'is-closed'}`} />
                          </button>
                          {aOpen && items(a)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          {/* páginas fixadas pelo usuário (botão direito sobre uma página do menu → Fixar) */}
          <div className="pins" aria-label="Páginas fixadas">
            {fixados.length ? fixados.map((m) => (
              <div key={m.item.path} className={`pin ${current?.item.path === m.item.path ? 'is-active' : ''}`} title={`${m.area.label} · ${m.item.label}`}>
                <button className="pin__go" onClick={() => goPinned(m.item.path)} onContextMenu={openMenu(m.item.path)}>
                  <m.area.icon size={14} strokeWidth={1.8} />
                  <span>{m.item.label}</span>
                </button>
                <button className="pin__x" onClick={() => unpin(m.item.path)} aria-label={`Desafixar ${m.item.label}`}><X size={12} /></button>
              </div>
            )) : (
              <span className="pins__hint"><Pin size={13} /> Clique com o botão direito em uma página do menu para fixá-la aqui</span>
            )}
          </div>
          <div className="live" title="Os dados são atualizados automaticamente">
            <span className={`live__dot ${lastSync && Date.now() - lastSync.getTime() < 10000 ? 'is-on' : ''}`} />
            {lastSync ? `Ao vivo · ${lastSync.toLocaleTimeString('pt-BR')}` : 'Conectando…'}
          </div>
          <AtividadesButton onOpenPanel={painel.abrir} />
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

      {ctx && <ContextMenu menu={ctx} pinned={isPinned(ctx.path)} onPin={() => toggle(ctx.path)} onClose={() => setCtx(null)} />}
      {painel.aberto && <PainelAtualizacoes piscar={painel.piscar} onClose={painel.fechar} />}
    </div>
  );
}
