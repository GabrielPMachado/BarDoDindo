import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, BellRing, History } from 'lucide-react';
import { AREAS, COLLECTION_PAGE, type AreaKey } from '../modules';
import { useResource } from '../lib/data';
import { useSession } from '../lib/session';
import { initials } from '../lib/format';
import { Modal } from './ui';

export interface Atividade {
  id: string;
  area: AreaKey;
  acao: string;
  colecao?: string;
  alvo?: string;
  detalhe?: string;
  usuarioId: string;
  usuarioNome: string;
  criadoEm: string;
}

const areaLabel = (k: string) => AREAS.find((a) => a.key === k)?.label ?? k;
const pageOf = (a: Atividade) => (a.colecao && COLLECTION_PAGE[a.colecao]) || AREAS.find((x) => x.key === a.area)?.items[0]?.path;
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function diaLabel(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  const txt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** Agrupa as atualizações por dia, mantendo a ordem (mais recentes primeiro). */
function porDia(items: Atividade[]) {
  const grupos: { dia: string; items: Atividade[] }[] = [];
  for (const a of items) {
    const dia = diaLabel(a.criadoEm);
    const g = grupos.at(-1);
    if (g && g.dia === dia) g.items.push(a);
    else grupos.push({ dia, items: [a] });
  }
  return grupos;
}

/* ---------- o que já foi visto (por usuário, neste navegador) ---------- */
const seenKey = (uid: string) => `dindo-crm:atividades-vistas:${uid}`;
const shownKey = (uid: string) => `dindo-crm:painel-mostrado:${uid}`;
function storage(kind: 'local' | 'session') {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}
// compartilhado entre o botão do topo e o painel: marcar como visto em um vale para o outro
const seenCache: Record<string, string> = {};
const seenListeners = new Set<() => void>();
const subscribeSeen = (l: () => void) => {
  seenListeners.add(l);
  return () => seenListeners.delete(l);
};
function getSeen(uid: string) {
  if (!(uid in seenCache)) {
    try { seenCache[uid] = storage('local')?.getItem(seenKey(uid)) ?? ''; } catch { seenCache[uid] = ''; }
  }
  return seenCache[uid];
}
function setSeen(uid: string, iso: string) {
  seenCache[uid] = iso;
  try { storage('local')?.setItem(seenKey(uid), iso); } catch { /* ignora */ }
  seenListeners.forEach((l) => l());
}

export function useAtividades() {
  const { usuario } = useSession();
  const { data, loading } = useResource<Atividade[]>(usuario ? '/crm/atividades' : null);
  const items = useMemo(() => data ?? [], [data]);
  const seen = useSyncExternalStore(subscribeSeen, () => (usuario ? getSeen(usuario.id) : ''));
  // novidades: o que outras pessoas fizeram depois da última vez que o painel foi aberto
  const novas = items.filter((a) => a.criadoEm > seen && a.usuarioId !== usuario?.id);
  const marcarVistas = () => {
    if (!usuario || !items.length || items[0].criadoEm <= seen) return;
    setSeen(usuario.id, items[0].criadoEm);
  };
  return { items, loading, seen, novas, marcarVistas };
}

function Linha({ a, nova, piscar, onOpen }: { a: Atividade; nova: boolean; piscar: boolean; onOpen: (a: Atividade) => void }) {
  return (
    <li>
      <button className={`activity ${nova ? 'is-new' : ''} ${nova && piscar ? 'is-blink' : ''}`} onClick={() => onOpen(a)} title="Abrir a página deste registro">
        <span className="activity__avatar">{initials(a.usuarioNome)}</span>
        <span className="activity__body">
          <span className="activity__text">
            <strong>{a.usuarioNome}</strong> {a.acao}{a.alvo ? <> <em>{a.alvo}</em></> : null}
          </span>
          {a.detalhe && <span className="activity__detail">{a.detalhe}</span>}
          <span className="activity__meta">
            <span className="activity__area">{areaLabel(a.area)}</span>
            <span>{hora(a.criadoEm)}</span>
          </span>
        </span>
        <ArrowUpRight size={15} className="activity__go" />
      </button>
    </li>
  );
}

function Lista({ items, seen, onOpen, empty, piscar = false }: {
  items: Atividade[]; seen: string; onOpen: (a: Atividade) => void; empty: string; piscar?: boolean;
}) {
  const { usuario } = useSession();
  if (!items.length) return <p className="activity-empty muted">{empty}</p>;
  return (
    <div className="activity-days">
      {porDia(items).map((g) => (
        <section key={g.dia}>
          <h3 className="activity-day">{g.dia}</h3>
          <ul className="activity-list">
            {g.items.map((a) => <Linha key={a.id} a={a} nova={a.criadoEm > seen && a.usuarioId !== usuario?.id} piscar={piscar} onOpen={onOpen} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Painel completo de atualizações, com filtros por área e por pessoa.
 * `piscar`: só quando o painel abre sozinho ao carregar o sistema (primeiro acesso ou F5).
 */
export function PainelAtualizacoes({ onClose, piscar = false }: { onClose: () => void; piscar?: boolean }) {
  const { items, seen, novas, marcarVistas } = useAtividades();
  const navigate = useNavigate();
  const [area, setArea] = useState('');
  const [pessoa, setPessoa] = useState('');
  // o que era novidade ao abrir continua destacado enquanto o painel estiver aberto
  const [destaque] = useState(seen);
  const visto = useRef(false);
  useEffect(() => {
    if (items.length && !visto.current) {
      visto.current = true;
      marcarVistas();
    }
  }, [items.length]);

  const areas = [...new Set(items.map((a) => a.area))];
  const pessoas = [...new Map(items.map((a) => [a.usuarioId, a.usuarioNome])).entries()].sort((x, y) => x[1].localeCompare(y[1], 'pt-BR'));
  const filtradas = items.filter((a) => (!area || a.area === area) && (!pessoa || a.usuarioId === pessoa));
  const abrir = (a: Atividade) => {
    const p = pageOf(a);
    if (p) navigate(p);
    onClose();
  };

  return (
    <Modal title="Painel de atualizações" onClose={onClose} width={760}>
      <div className="activity-head">
        <p className="muted">
          {novas.length
            ? <><BellRing size={15} className="inline-icon gold" />{novas.length} {novas.length === 1 ? 'novidade' : 'novidades'} desde o seu último acesso.</>
            : 'O que a equipe fez no sistema, por dia e horário.'}
        </p>
        <div className="activity-filters">
          <select className="input input--sm" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filtrar por área">
            <option value="">Todas as áreas</option>
            {areas.map((k) => <option key={k} value={k}>{areaLabel(k)}</option>)}
          </select>
          <select className="input input--sm" value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Filtrar por usuário">
            <option value="">Todos os usuários</option>
            {pessoas.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </div>
      </div>
      <div className="activity-scroll">
        <Lista items={filtradas} seen={destaque} onOpen={abrir} piscar={piscar} empty="Nenhuma atualização registrada ainda." />
      </div>
    </Modal>
  );
}

/** Botão ao lado do perfil: mostra as últimas atualizações por dia e horário. */
export function AtividadesButton({ onOpenPanel }: { onOpenPanel: () => void }) {
  const { items, loading, seen, novas, marcarVistas } = useAtividades();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [destaque, setDestaque] = useState(seen);
  const ref = useRef<HTMLDivElement>(null);
  // o botão só pisca se já havia novidades quando o sistema carregou; as que chegam depois só aparecem no contador
  const [piscar, setPiscar] = useState(false);
  const carregou = useRef(false);
  useEffect(() => {
    if (loading || carregou.current) return;
    carregou.current = true;
    if (novas.length) setPiscar(true);
  }, [loading]);

  useEffect(() => {
    if (!open) return;
    const fora = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setDestaque(seen);
      marcarVistas();
      setPiscar(false);
    }
    setOpen(!open);
  };

  return (
    <div className="activity-pop" ref={ref}>
      <button className={`topbar-btn ${open ? 'is-open' : ''} ${piscar && novas.length && !open ? 'has-new' : ''}`} onClick={toggle} aria-expanded={open} aria-label="Atualizações" title="Atualizações">
        <History size={18} />
        {novas.length > 0 && <span className="topbar-btn__badge">{novas.length > 99 ? '99+' : novas.length}</span>}
      </button>
      {open && (
        <div className="activity-pop__panel">
          <div className="activity-pop__head">
            <strong>Atualizações</strong>
            <button className="link small" onClick={() => { setOpen(false); onOpenPanel(); }}>Abrir painel</button>
          </div>
          <div className="activity-pop__scroll">
            <Lista
              items={items.slice(0, 40)}
              seen={destaque}
              onOpen={(a) => { setOpen(false); const p = pageOf(a); if (p) navigate(p); }}
              empty="Nenhuma atualização registrada ainda."
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Ao carregar o sistema (primeiro acesso ou F5): abre o painel de atualizações na primeira vez da sessão
 * ou sempre que houver novidades ainda não lidas — e só nesse momento as novidades piscam.
 */
export function usePainelAoAbrir() {
  const { usuario } = useSession();
  const { items, loading, novas } = useAtividades();
  const [aberto, setAberto] = useState(false);
  const [piscar, setPiscar] = useState(false);
  const decidido = useRef(false);
  useEffect(() => {
    if (!usuario || loading || decidido.current) return;
    decidido.current = true;
    if (!items.length) return;
    const s = storage('session');
    const primeiraVez = !s?.getItem(shownKey(usuario.id));
    try { s?.setItem(shownKey(usuario.id), '1'); } catch { /* ignora */ }
    if (!primeiraVez && !novas.length) return;
    setPiscar(novas.length > 0);
    setAberto(true);
  }, [usuario?.id, loading]);
  return {
    aberto,
    piscar,
    /** Aberto pelo usuário (botão "Abrir painel"): sem piscar. */
    abrir: () => { setPiscar(false); setAberto(true); },
    fechar: () => { setPiscar(false); setAberto(false); },
  };
}
