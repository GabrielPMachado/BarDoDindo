import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, PartyPopper, Users } from 'lucide-react';
import { COLLECTIONS } from '../collections';
import { CollectionPage } from '../components/CollectionPage';
import { useCollection, type Row } from '../lib/data';
import { isoToday, num } from '../lib/format';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const reservaAtiva = (r: Row) => !['Recusada', 'Cancelada', 'Cancelada pelo cliente'].includes(String(r.status));

/** O mês em grade: eventos da casa e reservas de cada dia; tocar num dia mostra o que tem nele. */
function Mes({ eventos }: { eventos: Row[] }) {
  const reservas = useCollection('reservas').rows.filter(reservaAtiva);
  const [base, setBase] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dia, setDia] = useState(isoToday());
  const hoje = isoToday();

  const celulas = useMemo(() => {
    const ini = new Date(base); ini.setDate(1 - base.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d; });
  }, [base]);
  const doDia = (d: string) => ({
    ev: eventos.filter((e) => e.data === d && e.status !== 'Cancelado'),
    rs: reservas.filter((r) => r.data === d),
  });
  const mudar = (n: number) => setBase((b) => { const d = new Date(b); d.setMonth(b.getMonth() + n); return d; });
  const sel = doDia(dia);
  const titulo = base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <section className="panel calendario">
      <div className="calendario__topo">
        <button className="icon-btn" onClick={() => mudar(-1)} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
        <h2>{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</h2>
        <button className="icon-btn" onClick={() => mudar(1)} aria-label="Próximo mês"><ChevronRight size={18} /></button>
        <button className="btn btn--ghost btn--sm" onClick={() => { const d = new Date(); d.setDate(1); setBase(d); setDia(hoje); }}>Hoje</button>
        <span className="calendario__legenda muted small"><i className="ponto ponto--ev" /> Evento <i className="ponto ponto--rs" /> Reservas</span>
      </div>
      <div className="calendario__grade" role="grid" aria-label={`Calendário de ${titulo}`}>
        {SEMANA.map((s) => <div key={s} className="calendario__semana">{s}</div>)}
        {celulas.map((d) => {
          const k = iso(d);
          const { ev, rs } = doDia(k);
          const pessoas = rs.reduce((t, r) => t + (Number(r.pessoas) || 0), 0);
          return (
            <button
              key={k} role="gridcell" onClick={() => setDia(k)} aria-selected={dia === k}
              className={`calendario__dia ${d.getMonth() !== base.getMonth() ? 'is-fora' : ''} ${k === hoje ? 'is-hoje' : ''} ${dia === k ? 'is-sel' : ''}`}
            >
              <span className="calendario__n">{d.getDate()}</span>
              {ev.slice(0, 2).map((e) => <span key={e.id} className="calendario__ev" title={String(e.titulo)}>{String(e.titulo)}</span>)}
              {ev.length > 2 && <span className="calendario__mais">+{ev.length - 2}</span>}
              {rs.length > 0 && <span className="calendario__rs" title={`${rs.length} reservas · ${pessoas} pessoas`}><Users size={11} /> {rs.length}</span>}
            </button>
          );
        })}
      </div>
      <div className="calendario__detalhe">
        <h3>{((t) => t.charAt(0).toUpperCase() + t.slice(1))(new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</h3>
        {!sel.ev.length && !sel.rs.length && <p className="muted small">Nada marcado neste dia.</p>}
        {sel.ev.map((e) => (
          <div key={e.id} className="calendario__item"><PartyPopper size={15} className="gold" /><b>{String(e.titulo)}</b><span className="muted small">{[e.tipo, e.horario ? String(e.horario).slice(0, 5) : ''].filter(Boolean).join(' · ')}</span></div>
        ))}
        {sel.rs.length > 0 && (
          <div className="calendario__item">
            <CalendarDays size={15} className="gold" />
            <b>{sel.rs.length} {sel.rs.length === 1 ? 'reserva' : 'reservas'}</b>
            <span className="muted small">{num(sel.rs.reduce((t, r) => t + (Number(r.pessoas) || 0), 0))} pessoas · {sel.rs.slice().sort((a, b) => String(a.hora).localeCompare(String(b.hora))).map((r) => `${String(r.hora ?? '').slice(0, 5)} ${String(r.clienteNome ?? '').split(' ')[0]}`).join(', ')}</span>
            <Link to="/atendimento/reservas" className="small">Ver reservas</Link>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Calendario() {
  return <CollectionPage def={COLLECTIONS.eventos} before={(rows) => <Mes eventos={rows} />} />;
}
