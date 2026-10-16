import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Clock, MapPin, PartyPopper, Phone, Users, X } from 'lucide-react';
import { COLLECTIONS, toneOf } from '../collections';
import { CollectionPage } from '../components/CollectionPage';
import { Badge, notify } from '../components/ui';
import { useCollection, type Row } from '../lib/data';
import { isoToday, num } from '../lib/format';
import { maskPhone } from '../lib/masks';
import { useSession } from '../lib/session';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const reservaAtiva = (r: Row) => !['Recusada', 'Cancelada', 'Cancelada pelo cliente'].includes(String(r.status));
const hora = (v: unknown) => String(v ?? '').slice(0, 5);
const primeiro = (nome: unknown) => String(nome ?? '').trim().split(/\s+/)[0] || 'Cliente';
const pessoasDe = (rs: Row[]) => rs.reduce((t, r) => t + (Number(r.pessoas) || 0), 0);
const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
type Filtro = 'tudo' | 'reservas' | 'eventos';

/** O mês em grade, grande: em cada dia, os eventos e as reservas (horário, nome e pessoas); ao lado, o dia escolhido em detalhe. */
function Mes({ eventos }: { eventos: Row[] }) {
  const { pode } = useSession();
  const col = useCollection('reservas');
  const reservas = col.rows.filter(reservaAtiva);
  const [base, setBase] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dia, setDia] = useState(isoToday());
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const hoje = isoToday();
  const podeConfirmar = pode('reservas', 'editar');

  const celulas = useMemo(() => {
    const ini = new Date(base); ini.setDate(1 - base.getDay());
    // 5 ou 6 semanas, conforme o mês
    const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const semanas = Math.ceil((base.getDay() + fim.getDate()) / 7);
    return Array.from({ length: semanas * 7 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d; });
  }, [base]);
  const doDia = (d: string) => ({
    ev: filtro === 'reservas' ? [] : eventos.filter((e) => e.data === d && e.status !== 'Cancelado'),
    rs: filtro === 'eventos' ? [] : reservas.filter((r) => r.data === d).sort((a, b) => hora(a.hora).localeCompare(hora(b.hora))),
  });
  const mudar = (n: number) => setBase((b) => { const d = new Date(b); d.setMonth(b.getMonth() + n); return d; });
  const mesIso = iso(base).slice(0, 7);
  const doMes = reservas.filter((r) => String(r.data).slice(0, 7) === mesIso);
  const sel = doDia(dia);
  const titulo = capitalizar(base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  const status = async (r: Row, novo: string) => {
    try { await col.update(r.id, { status: novo }); notify(novo === 'Confirmada' ? 'Reserva confirmada.' : `Reserva marcada como ${novo.toLowerCase()}.`); }
    catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível alterar.', 'error'); }
  };

  return (
    <section className="panel calendario">
      <div className="calendario__topo">
        <div className="calendario__nav">
          <button className="icon-btn" onClick={() => mudar(-1)} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
          <h2>{titulo}</h2>
          <button className="icon-btn" onClick={() => mudar(1)} aria-label="Próximo mês"><ChevronRight size={18} /></button>
          <button className="btn btn--ghost btn--sm" onClick={() => { const d = new Date(); d.setDate(1); setBase(d); setDia(hoje); }}>Hoje</button>
        </div>
        <span className="calendario__resumo muted small">
          <b>{num(doMes.length)}</b> {doMes.length === 1 ? 'reserva' : 'reservas'} · <b>{num(pessoasDe(doMes))}</b> pessoas no mês
          {doMes.some((r) => r.status === 'Pendente') && <> · <span className="text-warn">{num(doMes.filter((r) => r.status === 'Pendente').length)} aguardando</span></>}
        </span>
        <div className="segmented" role="radiogroup" aria-label="Mostrar">
          {(['tudo', 'reservas', 'eventos'] as Filtro[]).map((f) => (
            <button key={f} role="radio" aria-checked={filtro === f} className={filtro === f ? 'is-active' : ''} onClick={() => setFiltro(f)}>
              {f === 'tudo' ? 'Tudo' : f === 'reservas' ? 'Reservas' : 'Eventos'}
            </button>
          ))}
        </div>
      </div>

      <div className="calendario__corpo">
        <div className="calendario__grade" role="grid" aria-label={`Calendário de ${titulo}`}>
          {SEMANA.map((s) => <div key={s} className="calendario__semana">{s}</div>)}
          {celulas.map((d) => {
            const k = iso(d);
            const { ev, rs } = doDia(k);
            const itens = [...ev.map((e) => ({ tipo: 'ev' as const, r: e })), ...rs.map((r) => ({ tipo: 'rs' as const, r }))];
            const pessoas = pessoasDe(rs);
            return (
              <button
                key={k} role="gridcell" onClick={() => setDia(k)} aria-selected={dia === k}
                className={`calendario__dia ${d.getMonth() !== base.getMonth() ? 'is-fora' : ''} ${k === hoje ? 'is-hoje' : ''} ${dia === k ? 'is-sel' : ''} ${k < hoje ? 'is-passado' : ''}`}
              >
                <span className="calendario__cab">
                  <span className="calendario__n">{d.getDate()}</span>
                  {pessoas > 0 && <span className="calendario__pessoas" title={`${rs.length} reservas · ${pessoas} pessoas`}><Users size={11} /> {pessoas}</span>}
                </span>
                {itens.slice(0, 4).map(({ tipo, r }) => tipo === 'ev' ? (
                  <span key={r.id} className="calendario__ev" title={String(r.titulo)}><PartyPopper size={10} /> {String(r.titulo)}</span>
                ) : (
                  <span key={r.id} className={`calendario__rs tom-${toneOf(r.status)}`} title={`${hora(r.hora)} · ${r.clienteNome} · ${r.pessoas} pessoas · ${r.status}`}>
                    <i /> <b>{hora(r.hora)}</b> {primeiro(r.clienteNome)} <small>{num(Number(r.pessoas) || 0)}p</small>
                  </span>
                ))}
                {itens.length > 4 && <span className="calendario__mais">+{itens.length - 4} mais</span>}
                {/* celular: só os pontinhos */}
                {itens.length > 0 && (
                  <span className="calendario__pontos" aria-hidden="true">
                    {ev.length > 0 && <i className="ponto ponto--ev" />}
                    {rs.length > 0 && <i className="ponto ponto--rs" />}
                    {rs.length > 1 && <small>{rs.length}</small>}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <aside className="calendario__detalhe" aria-live="polite">
          <h3>{capitalizar(new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</h3>
          <p className="muted small">
            {num(sel.rs.length)} {sel.rs.length === 1 ? 'reserva' : 'reservas'} · {num(pessoasDe(sel.rs))} pessoas
            {sel.ev.length > 0 && ` · ${sel.ev.length} ${sel.ev.length === 1 ? 'evento' : 'eventos'}`}
          </p>
          {!sel.ev.length && !sel.rs.length && <p className="muted small calendario__vazio">Nada marcado neste dia.</p>}
          {sel.ev.map((e) => (
            <div key={e.id} className="cal-card cal-card--ev">
              <PartyPopper size={16} />
              <div>
                <b>{String(e.titulo)}</b>
                <span className="muted small">{[e.tipo, e.horario ? hora(e.horario) : '', e.publico ? `${e.publico} pessoas esperadas` : ''].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
          ))}
          {sel.rs.map((r) => (
            <div key={r.id} className={`cal-card tom-${toneOf(r.status)}`}>
              <span className="cal-card__hora"><Clock size={12} /> {hora(r.hora)}</span>
              <div className="cal-card__corpo">
                <div className="cal-card__linha"><b>{String(r.clienteNome ?? 'Cliente')}</b><Badge tone={toneOf(r.status)}>{String(r.status)}</Badge></div>
                <span className="muted small cal-card__info">
                  <span><Users size={12} /> {num(Number(r.pessoas) || 0)} {Number(r.pessoas) === 1 ? 'pessoa' : 'pessoas'}</span>
                  {r.ambiente ? <span><MapPin size={12} /> {String(r.ambiente)}</span> : null}
                  {r.clienteTelefone ? <a href={`tel:${String(r.clienteTelefone).replace(/\D/g, '')}`} onClick={(e) => e.stopPropagation()}><Phone size={12} /> {maskPhone(r.clienteTelefone)}</a> : null}
                  {r.origem ? <span>{String(r.origem)}</span> : null}
                </span>
                {r.observacoes ? <span className="small cal-card__obs">{String(r.observacoes)}</span> : null}
                {podeConfirmar && r.status === 'Pendente' && (
                  <div className="cal-card__acoes">
                    <button className="btn btn--sm btn--ok" onClick={() => void status(r, 'Confirmada')}><Check size={14} /> Confirmar</button>
                    <button className="btn btn--sm btn--ghost" onClick={() => void status(r, 'Recusada')}><X size={14} /> Recusar</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <Link to="/atendimento/reservas" className="small calendario__link">Abrir todas as reservas</Link>
        </aside>
      </div>
    </section>
  );
}

export default function Calendario() {
  return <CollectionPage def={COLLECTIONS.eventos} before={(rows) => <Mes eventos={rows} />} />;
}
