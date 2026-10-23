import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AppWindow, ChevronDown, LayoutDashboard, Menu, UserRound, Copy, ExternalLink, KeyRound, LogOut, MousePointerClick, Pin, PinOff, X } from 'lucide-react';
import { AREAS, DEPARTAMENTOS, findModule, localDe, type Area, type AreaKey, type Setor } from '../modules';
import { useSession } from '../lib/session';
import { useLastSync } from '../lib/data';
import { usePins } from '../lib/pins';
import { useToqueLongo } from '../lib/toque';
import { alternarAtalho, usePainelPrefs } from '../lib/preferencias';
import { AtividadesButton, PainelAtualizacoes, usePainelAoAbrir } from './Atividades';
import { notify } from './ui';
import { ContextMenu, type MenuPos } from './ContextMenu';
import { Avatar } from './Avatar';
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

interface MenuState extends MenuPos { path: string }

/** Menu do botão direito sobre uma página: abrir em outra guia/janela, copiar o link e fixar no topo. */
interface PainelOpcao { label: string; tem: boolean; alternar: () => void }

function PageMenu({ menu, pinned, onPin, paineis, onClose }: {
  menu: MenuState; pinned: boolean; onPin: () => void; paineis: PainelOpcao[]; onClose: () => void;
}) {
  const navigate = useNavigate();
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl(menu.path));
      notify('Link copiado.');
    } catch {
      notify('Não foi possível copiar o link.', 'error');
    }
  };
  return (
    <ContextMenu at={menu} onClose={onClose}>
      <button role="menuitem" onClick={() => navigate(menu.path)}><MousePointerClick size={15} /> Abrir</button>
      <button role="menuitem" onClick={() => window.open(fullUrl(menu.path), '_blank')}><ExternalLink size={15} /> Abrir em nova guia</button>
      <button role="menuitem" onClick={() => window.open(fullUrl(menu.path), '_blank', 'popup,width=1320,height=860')}><AppWindow size={15} /> Abrir em nova janela</button>
      <button role="menuitem" onClick={copiar}><Copy size={15} /> Copiar link</button>
      <div className="ctx__sep" />
      <button role="menuitem" onClick={onPin}>
        {pinned ? <><PinOff size={15} /> Desafixar</> : <><Pin size={15} /> Fixar</>}
      </button>
      {paineis.map((p) => (
        <button key={p.label} role="menuitem" onClick={p.alternar}>
          <LayoutDashboard size={15} /> {p.tem ? `Remover do ${p.label}` : `Adicionar ao ${p.label}`}
        </button>
      ))}
    </ContextMenu>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { usuario, funcao, access, logout } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = findModule(pathname);
  const lastSync = useLastSync();
  const { pins, isPinned, toggle, unpin } = usePins(usuario?.id);
  // atalhos de páginas: no painel próprio (todos) e no Painel executivo (quem acessa a Diretoria)
  const meuPainel = usePainelPrefs('meuPainel');
  const executivo = usePainelPrefs('painel');
  const opcoesPainel = (path: string): PainelOpcao[] => {
    const opcao = (label: string, nome: string, p: typeof meuPainel): PainelOpcao => {
      const tem = p.prefs.atalhos.includes(path);
      return {
        label, tem,
        alternar: () => p.salvar(alternarAtalho(p.prefs, path))
          .then(() => notify(tem ? `Atalho removido do ${nome}.` : `Atalho adicionado ao ${nome}.`))
          .catch((e: Error) => notify(e.message || 'Não foi possível salvar o painel.', 'error')),
      };
    };
    const lista = [opcao('meu painel', 'meu painel', meuPainel)];
    if (access('painel') !== 'none') lista.push(opcao('painel executivo', 'Painel executivo', executivo));
    return lista;
  };
  const [menu, setMenu] = useState(false);
  const [ctx, setCtx] = useState<MenuState | null>(null);
  const painel = usePainelAoAbrir();
  const navRef = useRef<HTMLElement>(null);
  // celular e tablet: o menu lateral vira uma gaveta, aberta pelo botão ☰
  const [gaveta, setGaveta] = useState(false);
  useEffect(() => setGaveta(false), [pathname]);
  const toqueLongo = useToqueLongo();

  // Meu perfil e Diretoria começam abertos; departamentos e setores, fechados, exceto os da página atual
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ 'g:eu': true, 'g:dir': true }));
  const expand = (path: string) => {
    const l = localDe(path);
    setOpen((o) => (l ? { ...o, [`d:${l.departamento.key}`]: true, [`s:${l.setor.key}`]: true } : { ...o, [`g:${findModule(path)?.area.key}`]: true }));
  };
  useEffect(() => {
    if (!current) return;
    expand(current.item.path);
    // leva a página atual para a área visível do menu
    requestAnimationFrame(() => navRef.current?.querySelector('.nav__link.active')?.scrollIntoView({ block: 'nearest' }));
  }, [current?.item.path]);
  const flip = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const openMenu = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, path });
  };
  /** Botão direito no computador; toque longo no celular. */
  const menuProps = (path: string) => ({ onContextMenu: openMenu(path), ...toqueLongo((x, y) => setCtx({ x, y, path })) });
  const goPinned = (path: string) => {
    expand(path);
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
              <NavLink to={i.path} end className="nav__link" {...menuProps(i.path)}>
                <span>{i.label}</span>
                {isPinned(i.path) && <Pin size={12} className="nav__pin" aria-label="Fixado" />}
              </NavLink>
            </div>
          );
        })}
      </div>
    );
  };

  const local = current ? localDe(current.item.path) : null;
  const temAcesso = (st: Setor) => st.items.some((i) => access(i.perm) !== 'none');
  /** Setor com uma página só vira link direto; com mais, abre e fecha. */
  const setorNav = (st: Setor) => {
    const paginas = st.items.filter((i) => access(i.perm) !== 'none');
    const ro = paginas.every((i) => access(i.perm) === 'view') && <span className="nav__ro" title="Somente leitura">leitura</span>;
    if (st.items.length === 1) {
      const i = st.items[0];
      return (
        <div key={st.key} className="nav__area">
          <NavLink to={i.path} end className="nav__head nav__head--dept nav__setor-link" {...menuProps(i.path)}>
            <st.icon size={16} strokeWidth={1.7} />
            <span>{st.label}</span>
            {ro}
            {isPinned(i.path) && <Pin size={12} className="nav__pin" aria-label="Fixado" />}
          </NavLink>
        </div>
      );
    }
    const sOpen = !!open[`s:${st.key}`];
    return (
      <div key={st.key} className="nav__area">
        <button className={`nav__head nav__head--dept ${local?.setor.key === st.key ? 'is-current' : ''}`} onClick={() => flip(`s:${st.key}`)} aria-expanded={sOpen}>
          <st.icon size={16} strokeWidth={1.7} />
          <span>{st.label}</span>
          {ro}
          <ChevronDown size={13} className={`nav__chev ${sOpen ? '' : 'is-closed'}`} />
        </button>
        {sOpen && items({ ...st.area, items: paginas.map((i) => ({ ...i, group: undefined })) })}
      </div>
    );
  };

  const fixados = pins
    .map((p) => findModule(p))
    .filter((m): m is NonNullable<typeof m> => !!m && access(m.item.perm) !== 'none');

  return (
    <div className="shell">
      {gaveta && <div className="sidebar-backdrop" onClick={() => setGaveta(false)} aria-hidden="true" />}
      <aside className={`sidebar ${gaveta ? 'is-open' : ''}`}>
        <Brand />
        {/* na gaveta (celular/tablet), escolher uma página fecha o menu — inclusive a página em que já se está */}
        <nav className="nav" ref={navRef} onClick={(e) => (e.target as HTMLElement).closest('a, .nav__fixado-go') && setGaveta(false)}>
          {(['eu', 'dir'] as AreaKey[]).map((k) => {
            const todas = AREAS.find((x) => x.key === k)!;
            const area = { ...todas, items: todas.items.filter((i) => access(i.perm) !== 'none') };
            if (!area.items.length) return null;
            const gOpen = !!open[`g:${k}`];
            return (
              <div key={k} className="nav__block">
                <button className={`nav__head nav__head--group ${current?.area.key === k ? 'is-current' : ''}`} onClick={() => flip(`g:${k}`)} aria-expanded={gOpen}>
                  <area.icon size={18} strokeWidth={1.7} />
                  <span>{area.label}</span>
                  {area.items.every((i) => access(i.perm) === 'view') && <span className="nav__ro" title="Somente leitura">leitura</span>}
                  <ChevronDown size={14} className={`nav__chev ${gOpen ? '' : 'is-closed'}`} />
                </button>
                {gOpen && items(area)}
                {gOpen && k === 'eu' && (
                  /* páginas fixadas (botão direito ou toque longo sobre uma página → Fixar) */
                  <div className="nav__items nav__fixados">
                    <div className="nav__group"><Pin size={11} /> Fixados</div>
                    {fixados.length ? fixados.map((m) => (
                      <div key={m.item.path} className={`nav__fixado ${current?.item.path === m.item.path ? 'is-current' : ''}`} title={`${m.area.label} · ${m.item.label}`}>
                        <button className="nav__fixado-go" onClick={() => goPinned(m.item.path)} {...menuProps(m.item.path)}>
                          <m.area.icon size={14} strokeWidth={1.8} />
                          <span>{m.item.label}</span>
                        </button>
                        <button className="nav__fixado-x" onClick={() => unpin(m.item.path)} aria-label={`Desafixar ${m.item.label}`} title="Desafixar"><X size={12} /></button>
                      </div>
                    )) : (
                      <p className="nav__fixados-dica">
                        <span className="pins__hint-desktop">Clique com o botão direito em uma página do menu e escolha “Fixar”.</span>
                        <span className="pins__hint-touch">Segure o dedo sobre uma página do menu e escolha “Fixar”.</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* III - Departamentos → setores → páginas */}
          {DEPARTAMENTOS.some((d) => d.setores.some(temAcesso)) && <div className="nav__secao">Departamentos</div>}
          {DEPARTAMENTOS.map((d) => {
            const setores = d.setores.filter(temAcesso);
            if (!setores.length) return null;
            const dOpen = !!open[`d:${d.key}`];
            return (
              <div key={d.key} className="nav__block">
                <button className={`nav__head nav__head--group ${local?.departamento.key === d.key ? 'is-current' : ''}`} onClick={() => flip(`d:${d.key}`)} aria-expanded={dOpen}>
                  <d.icon size={18} strokeWidth={1.7} />
                  <span>{d.label}</span>
                  <ChevronDown size={14} className={`nav__chev ${dOpen ? '' : 'is-closed'}`} />
                </button>
                {dOpen && <div className="nav__depts">{setores.map(setorNav)}</div>}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="topbar__menu" onClick={() => setGaveta(true)} aria-label="Abrir menu"><Menu size={22} /></button>
          {/* onde a pessoa está: Cérebro / grupo / departamento / página */}
          <nav className="crumbs" aria-label="Caminho">
            {current ? (
              <>
                <span className="crumbs__root">Cérebro</span>
                <span className="crumbs__sep">/</span>
                {local ? (
                  <>
                    <span className="crumbs__mid">{local.departamento.label}</span>
                    {local.setor.items.length > 1 && (
                      <>
                        <span className="crumbs__sep">/</span>
                        <span className="crumbs__mid">{local.setor.label}</span>
                      </>
                    )}
                  </>
                ) : <span className="crumbs__mid">{current.area.label}</span>}
                <span className="crumbs__sep">/</span>
                <strong className="crumbs__page">{current.item.label}</strong>
              </>
            ) : (
              <strong className="crumbs__page">Início</strong>
            )}
          </nav>
          <div className="live" title="Os dados são atualizados automaticamente">
            <span className={`live__dot ${lastSync && Date.now() - lastSync.getTime() < 10000 ? 'is-on' : ''}`} />
            <span className="live__text">{lastSync ? `Ao vivo · ${lastSync.toLocaleTimeString('pt-BR')}` : 'Conectando…'}</span>
          </div>
          <AtividadesButton onOpenPanel={painel.abrir} />
          <div className="user">
            <button className="user__btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
              <Avatar className="user__avatar" nome={usuario?.nome ?? ''} foto={usuario?.foto} />
              <span className="user__info">
                <strong>{usuario?.nome}</strong>
                <small>{funcao?.nome ?? 'Sem função'}</small>
              </span>
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="user__menu" onMouseLeave={() => setMenu(false)}>
                <button onClick={() => { setMenu(false); navigate('/perfil'); }}><UserRound size={16} /> Meu perfil</button>
                <button onClick={() => { setMenu(false); navigate('/perfil/painel'); }}><LayoutDashboard size={16} /> Meu painel</button>
                <button onClick={() => { setMenu(false); navigate('/perfil', { state: { foco: 'senha' } }); }}><KeyRound size={16} /> Alterar senha</button>
                <button onClick={() => logout()}><LogOut size={16} /> Sair</button>
              </div>
            )}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      {ctx && (
        <PageMenu
          menu={ctx} pinned={isPinned(ctx.path)} onPin={() => toggle(ctx.path)}
          paineis={opcoesPainel(ctx.path)}
          onClose={() => setCtx(null)}
        />
      )}
      {painel.aberto && <PainelAtualizacoes piscar={painel.piscar} onClose={painel.fechar} />}
    </div>
  );
}
