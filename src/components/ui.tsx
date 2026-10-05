import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  AlertCircle, Bell, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Gift, Home, Menu,
  ReceiptText, Star, Ticket, User, Utensils, X, XCircle,
} from 'lucide-react';
import { brl } from '../data';
import { ItemIcon } from './ItemIcon';
import { dateParts, formatDateTime, parseDate, upcoming, useStore, type Consumption, type Reservation } from '../store';

export function CrownIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 50 30" aria-hidden="true">
      <path d="M3 26 L7 6 L17 16 L25 2 L33 16 L43 6 L47 26 Z" fill="currentColor" />
      <rect x="3" y="26" width="44" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}

export function Logo({ small = false, asLink = true }: { small?: boolean; asLink?: boolean }) {
  const inner = (
    <>
      <span className="logo__crown"><CrownIcon size={small ? 18 : 26} /></span>
      <span className="logo__bar">BAR DO</span>
      <span className="logo__dindo">DINDO</span>
      <svg className="logo__swash" viewBox="0 0 100 8" aria-hidden="true">
        <path d="M5 2 Q50 10 95 2" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
    </>
  );
  const cls = `logo ${small ? 'logo--small' : ''}`;
  return asLink ? <Link to="/" className={cls} aria-label="Bar do Dindo — início">{inner}</Link> : <div className={cls}>{inner}</div>;
}

const NAV = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/recompensas', label: 'Pontos', icon: Star },
  { to: '/reservas', label: 'Reservas', icon: CalendarDays },
  { to: '/cardapio', label: 'Cardápio', icon: Utensils },
  { to: '/perfil', label: 'Perfil', icon: User },
];

const DRAWER = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/reservas', label: 'Fazer Reserva', icon: CalendarDays },
  { to: '/historico', label: 'Meu Histórico', icon: ReceiptText },
  { to: '/cardapio', label: 'Cardápio', icon: Utensils },
  { to: '/recompensas', label: 'Minhas Recompensas', icon: Gift },
  { to: '/perfil', label: 'Meu Perfil', icon: User },
];

const SEEN_KEY = 'bar-do-dindo:notificacoes-vistas';

/** Notificações montadas a partir dos dados reais do cliente. */
function useNotifications() {
  const { me } = useStore();
  return useMemo(() => {
    if (!me) return [];
    const out: { id: string; title: string; body: string; icon: typeof Bell }[] = [];
    for (const r of upcoming(me.reservas)) {
      const quando = `${parseDate(r.data).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}, às ${r.hora}`;
      out.push(
        r.status === 'Confirmada'
          ? { id: `r-${r.id}-ok`, title: 'Reserva confirmada', body: `Sua mesa para ${r.pessoas} está garantida: ${quando}.`, icon: CheckCircle2 }
          : { id: `r-${r.id}-pend`, title: 'Reserva em análise', body: `Aguardando confirmação do bar para ${quando}.`, icon: Clock },
      );
    }
    for (const r of me.reservas.filter((x) => x.status === 'Recusada')) {
      out.push({ id: `r-${r.id}-rec`, title: 'Reserva não confirmada', body: `Não foi possível atender a reserva de ${parseDate(r.data).toLocaleDateString('pt-BR')}.`, icon: XCircle });
    }
    for (const v of me.resgates.filter((x) => x.status === 'Disponível')) {
      out.push({ id: `v-${v.id}`, title: 'Voucher disponível', body: `${v.recompensa} — código ${v.codigo}.`, icon: Ticket });
    }
    return out;
  }, [me]);
}

export function TopBar() {
  const [drawer, setDrawer] = useState(false);
  const [notif, setNotif] = useState(false);
  const notifications = useNotifications();
  const [seen, setSeen] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const unread = notifications.some((n) => !seen.includes(n.id));

  useEffect(() => {
    document.body.style.overflow = drawer || notif ? 'hidden' : '';
  }, [drawer, notif]);

  const openNotif = () => {
    setNotif(true);
    const ids = notifications.map((n) => n.id);
    setSeen(ids);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
    } catch {
      /* ignora */
    }
  };

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" onClick={() => setDrawer(true)} aria-label="Abrir menu">
          <Menu size={26} />
        </button>
        <Logo />
        <button className="icon-btn" onClick={openNotif} aria-label="Notificações">
          <Bell size={26} />
          {unread && <span className="dot" />}
        </button>
      </header>

      {drawer && (
        <div className="overlay" onClick={() => setDrawer(false)}>
          <nav className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer__head">
              <Logo small />
              <button className="icon-btn" onClick={() => setDrawer(false)} aria-label="Fechar menu"><X /></button>
            </div>
            {DRAWER.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end onClick={() => setDrawer(false)} className="drawer__link">
                <Icon size={20} /> {label}
              </NavLink>
            ))}
            <p className="drawer__foot">Aqui a amizade sempre vale mais.</p>
          </nav>
        </div>
      )}

      {notif && (
        <div className="overlay" onClick={() => setNotif(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__handle" />
            <h3 className="section-title">Notificações</h3>
            {notifications.length === 0 ? (
              <p className="muted">Você não tem notificações no momento.</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="notif">
                  <n.icon size={18} className="gold" />
                  <div>
                    <strong>{n.title}</strong>
                    <p className="muted">{n.body}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function BottomNav() {
  return (
    <nav className="bottomnav">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end className="bottomnav__item">
          <Icon size={24} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const nav = useNavigate();
  return (
    <div className="page-header">
      <button className="icon-btn" onClick={() => nav(-1)} aria-label="Voltar"><ChevronLeft size={26} /></button>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
    </div>
  );
}

export function SectionHeader({ title, to, linkLabel = 'Ver todas' }: { title: string; to?: string; linkLabel?: string }) {
  return (
    <div className="section-header">
      <h2 className="section-title">{title}</h2>
      {to && (
        <Link to={to} className="section-link">
          {linkLabel} <ChevronRight size={18} />
        </Link>
      )}
    </div>
  );
}

const STATUS_VIEW: Record<string, { label: string; tone: 'ok' | 'wait' | 'off' }> = {
  Pendente: { label: 'Aguardando confirmação', tone: 'wait' },
  Confirmada: { label: 'Confirmada', tone: 'ok' },
  Concluída: { label: 'Concluída', tone: 'ok' },
  Recusada: { label: 'Não confirmada', tone: 'off' },
  Cancelada: { label: 'Cancelada', tone: 'off' },
  'Cancelada pelo cliente': { label: 'Cancelada', tone: 'off' },
  'Não compareceu': { label: 'Não compareceu', tone: 'off' },
};

export function ReservationCard({ r, action }: { r: Reservation; action?: ReactNode }) {
  const p = dateParts(r.data);
  const st = STATUS_VIEW[r.status] ?? { label: r.status, tone: 'wait' as const };
  const Icon = st.tone === 'ok' ? CheckCircle2 : st.tone === 'wait' ? Clock : XCircle;
  return (
    <div className={`card res-card ${st.tone === 'off' ? 'is-cancelled' : ''}`}>
      <div className="res-card__date">
        <span>{p.week}</span>
        <strong>{p.day}</strong>
        <span>{p.month}</span>
      </div>
      <div className="res-card__body">
        <div className="res-card__time">{r.hora}</div>
        <div className="muted">Mesa para {r.pessoas} {r.pessoas === 1 ? 'pessoa' : 'pessoas'}</div>
        <div className="muted small">{r.ambiente}</div>
        <div className={`status status--${st.tone}`}><Icon size={18} /> {st.label}</div>
      </div>
      <div className="res-card__art" aria-hidden={!action}>
        {action ?? <TableArt />}
      </div>
    </div>
  );
}

/** Ilustração de mesa de boteco (sem depender de imagens externas). */
function TableArt() {
  return (
    <svg viewBox="0 0 120 90" className="table-art">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a2414" />
          <stop offset="1" stopColor="#1a0f08" />
        </linearGradient>
        <radialGradient id="lamp" cx="0.5" cy="0.35" r="0.6">
          <stop offset="0" stopColor="#f2b14a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f2b14a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="120" height="90" fill="url(#wall)" />
      {[8, 34, 60, 86].map((x) => (
        <rect key={x} x={x} y="8" width="20" height="16" rx="1" fill="#5a3a1e" stroke="#b07a35" strokeWidth="1" />
      ))}
      {[20, 72].map((x) => (
        <rect key={x} x={x} y="30" width="22" height="14" rx="1" fill="#4a2f17" stroke="#b07a35" strokeWidth="1" />
      ))}
      <rect width="120" height="90" fill="url(#lamp)" />
      <ellipse cx="60" cy="64" rx="38" ry="7" fill="#8a5426" />
      <rect x="57" y="66" width="6" height="20" fill="#4a2b12" />
      <rect x="54" y="52" width="4" height="10" rx="1" fill="#e2a63a" />
      <rect x="64" y="54" width="4" height="8" rx="1" fill="#e2a63a" />
      <path d="M14 60 v26 M30 58 v28 M14 66 h16" stroke="#3a210d" strokeWidth="3" />
      <path d="M90 58 v28 M106 60 v26 M90 66 h16" stroke="#3a210d" strokeWidth="3" />
    </svg>
  );
}

export function consumoTitulo(c: Consumption) {
  const [first, ...rest] = c.itens;
  if (!first) return 'Consumo';
  const nome = first.quantidade > 1 ? `${first.quantidade}× ${first.nome}` : first.nome;
  return rest.length ? `${nome} + ${rest.length} ${rest.length === 1 ? 'item' : 'itens'}` : nome;
}

export function HistoryRow({ c, onClick }: { c: Consumption; onClick?: () => void }) {
  return (
    <button className="hist-row" onClick={onClick} type="button">
      <ItemIcon categoria="consumo" />
      <div className="hist-row__main">
        <strong>{consumoTitulo(c)}</strong>
        <span className="muted">{formatDateTime(c.data)}</span>
      </div>
      <div className="hist-row__value">
        <strong>{brl(c.valor)}</strong>
        <span className="gold">+ {c.pontos} pontos</span>
      </div>
      <ChevronRight size={20} className="muted" />
    </button>
  );
}

/** Detalhe da comanda (itens consumidos). */
export function ConsumoSheet({ c, onClose }: { c: Consumption; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__handle" />
        <h3 className="section-title">Detalhes do consumo</h3>
        <p className="muted small">{formatDateTime(c.data)}</p>
        <div className="card list">
          {c.itens.map((i, idx) => (
            <div key={idx} className="line-item">
              <span>{i.quantidade}× {i.nome}</span>
              <strong>{brl(i.total)}</strong>
            </div>
          ))}
          <div className="line-item line-item--total">
            <span>Total</span>
            <strong>{brl(c.valor)}</strong>
          </div>
        </div>
        <p className="gold">+ {c.pontos} pontos creditados</p>
        <button className="btn btn--primary" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <p className="muted">{children}</p>
    </div>
  );
}

export function Toast({ msg, onDone, tone = 'ok' }: { msg: string | null; onDone: () => void; tone?: 'ok' | 'error' }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div className={`toast toast--${tone}`} role="status">
      {tone === 'ok' ? <CheckCircle2 size={18} /> : <XCircle size={18} />} {msg}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Carregando" />;
}

/* ---------- confirmação no estilo do app (substitui o confirm do navegador) ---------- */
interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}
let pendente: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((l) => l());

export function confirmar(opts: ConfirmOptions): Promise<boolean> {
  pendente?.resolve(false);
  return new Promise((resolve) => {
    pendente = { ...opts, resolve };
    avisar();
  });
}

export function ConfirmSheet() {
  const p = useSyncExternalStore(
    (l) => {
      ouvintes.add(l);
      return () => ouvintes.delete(l);
    },
    () => pendente,
  );
  if (!p) return null;
  const fechar = (ok: boolean) => {
    p.resolve(ok);
    pendente = null;
    avisar();
  };
  return (
    <div className="overlay overlay--top" onClick={() => fechar(false)}>
      <div className="sheet sheet--center" role="alertdialog" aria-modal="true" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <div className={`success-icon ${p.danger ? 'success-icon--danger' : ''}`}>{p.danger ? <XCircle size={32} /> : <AlertCircle size={30} />}</div>
        <h3>{p.title}</h3>
        {p.message && <p className="muted">{p.message}</p>}
        <div className="row">
          <button className="btn btn--ghost" onClick={() => fechar(false)}>Voltar</button>
          <button className={`btn ${p.danger ? 'btn--danger' : 'btn--primary'}`} onClick={() => fechar(true)}>{p.confirmLabel ?? 'Confirmar'}</button>
        </div>
      </div>
    </div>
  );
}
