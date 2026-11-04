import { Fragment, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cake, CalendarCheck, Check, ChevronLeft, ChevronRight, Clock, Landmark, MapPin, PartyPopper, Phone, Users, X } from 'lucide-react';
import { COLLECTIONS, toneOf } from '../collections';
import { CollectionPage } from '../components/CollectionPage';
import { Badge, notify } from '../components/ui';
import { useCollection, useResource, type Row } from '../lib/data';
import { isoToday, num } from '../lib/format';
import { maskPhone } from '../lib/masks';
import { useSession } from '../lib/session';

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const reservaAtiva = (r: Row) => !['Recusada', 'Cancelada', 'Cancelada pelo cliente'].includes(String(r.status));
const hora = (v: unknown) => String(v ?? '').slice(0, 5);
const pessoasDe = (rs: Row[]) => rs.reduce((t, r) => t + (Number(r.pessoas) || 0), 0);
const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;
/** Reuniões (diretoria ou equipe) ficam na categoria própria; os demais tipos são eventos. */
const ehReuniao = (e: Row) => /reuni|diretoria/i.test(String(e.tipo ?? ''));

type Cat = 'aniv' | 'rs' | 'ev' | 'dir';
const CATS: { id: Cat; label: string; Icone: typeof Cake }[] = [
  { id: 'aniv', label: 'Aniversários', Icone: Cake },
  { id: 'rs', label: 'Reservas', Icone: CalendarCheck },
  { id: 'ev', label: 'Eventos', Icone: PartyPopper },
  { id: 'dir', label: 'Diretoria / reuniões', Icone: Landmark },
];

/** O que o calendário precisa de cada afilhado (vem de /crm/clientes, a lista que o Cérebro já vigia: nenhuma leitura a mais). */
type Aniversariante = { uid: string; numero: number; nome: string; telefone?: string; origem?: string; nascimento?: string; aniversario?: string };
/** MM-DD do aniversário; quem nasceu em 29/02 comemora em 28/02 nos anos que não são bissextos. */
function diaDoAniversario(c: Aniversariante, ano: number) {
  const md = c.aniversario || (/^\d{4}-\d{2}-\d{2}$/.test(c.nascimento ?? '') ? c.nascimento!.slice(5) : '');
  if (!md) return '';
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  return md === '02-29' && !bissexto ? '02-28' : md;
}
const numeroAfilhado = (n: number) => `#${n < 0 ? '-' : ''}${String(Math.abs(n)).padStart(3, '0')}`;
const whatsapp = (tel?: string) => {
  const d = String(tel ?? '').replace(/\D/g, '');
  return d.length >= 10 ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : '';
};

/**
 * O mês em grade, com quadrados grandes. Cada dia mostra só os ícones das categorias que têm algo
 * (aniversários, reservas, eventos, diretoria/reuniões); tocar no dia ou num ícone abre os detalhes ao lado (ou abaixo, no celular).
 */
function Mes({ eventos }: { eventos: Row[] }) {
  const { pode, access } = useSession();
  const col = useCollection('reservas');
  const reservas = col.rows.filter(reservaAtiva);
  // os aniversários saem do cadastro dos afilhados (data de nascimento), para quem pode ver a lista de clientes
  const podeClientes = ['clientes', 'reservas', 'consumos', 'resgates', 'recompensas', 'comandas'].some((k) => access(k) !== 'none');
  const clientes = useResource<Aniversariante[]>(podeClientes ? '/crm/clientes' : null).data ?? [];
  const [base, setBase] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dia, setDia] = useState(isoToday());
  const [foco, setFoco] = useState<Cat | null>(null);
  const [ocultas, setOcultas] = useState<Set<Cat>>(() => new Set());
  const detalhe = useRef<HTMLElement>(null);
  const hoje = isoToday();
  const podeConfirmar = pode('reservas', 'editar');

  const celulas = useMemo(() => {
    const ini = new Date(base); ini.setDate(1 - base.getDay());
    // 5 ou 6 semanas, conforme o mês
    const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const semanas = Math.ceil((base.getDay() + fim.getDate()) / 7);
    return Array.from({ length: semanas * 7 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d; });
  }, [base]);
  const aniversariantes = useMemo(() => {
    const porDia = new Map<string, Aniversariante[]>();
    for (const ano of new Set(celulas.map((d) => d.getFullYear()))) {
      for (const c of clientes) {
        const md = diaDoAniversario(c, ano);
        if (!md) continue;
        const k = `${ano}-${md}`;
        porDia.set(k, [...(porDia.get(k) ?? []), c]);
      }
    }
    for (const l of porDia.values()) l.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    return porDia;
  }, [clientes, celulas]);

  const doDia = (d: string, todas = false) => {
    const ver = (c: Cat) => todas || !ocultas.has(c);
    const evs = eventos.filter((e) => e.data === d && e.status !== 'Cancelado').sort((a, b) => hora(a.horario).localeCompare(hora(b.horario)));
    return {
      aniv: ver('aniv') ? aniversariantes.get(d) ?? [] : [],
      rs: ver('rs') ? reservas.filter((r) => r.data === d).sort((a, b) => hora(a.hora).localeCompare(hora(b.hora))) : [],
      ev: ver('ev') ? evs.filter((e) => !ehReuniao(e)) : [],
      dir: ver('dir') ? evs.filter(ehReuniao) : [],
    };
  };
  const mudar = (n: number) => setBase((b) => { const d = new Date(b); d.setMonth(b.getMonth() + n); return d; });
  const mesIso = iso(base).slice(0, 7);
  const doMes = reservas.filter((r) => String(r.data).slice(0, 7) === mesIso);
  const anivMes = [...aniversariantes.entries()].filter(([k]) => k.slice(0, 7) === mesIso).reduce((t, [, l]) => t + l.length, 0);
  const sel = doDia(dia, true);
  const titulo = capitalizar(base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  const status = async (r: Row, novo: string) => {
    try { await col.update(r.id, { status: novo }); notify(novo === 'Confirmada' ? 'Reserva confirmada.' : `Reserva marcada como ${novo.toLowerCase()}.`); }
    catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível alterar.', 'error'); }
  };
  const abrir = (k: string, cat: Cat | null) => {
    setDia(k); setFoco(cat);
    // no celular e em telas estreitas os detalhes ficam abaixo da grade: rola até eles
    if (window.matchMedia('(max-width: 1180px)').matches) requestAnimationFrame(() => detalhe.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const alternar = (c: Cat) => setOcultas((o) => { const n = new Set(o); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const mostra = (c: Cat) => !foco || foco === c;
  const anoSel = Number(dia.slice(0, 4));
  const totalSel = sel.aniv.length + sel.rs.length + sel.ev.length + sel.dir.length;

  return (
    <section className="panel calendario">
      <div className="calendario__topo">
        <div className="calendario__nav">
          <button className="icon-btn" onClick={() => mudar(-1)} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
          <h2>{titulo}</h2>
          <button className="icon-btn" onClick={() => mudar(1)} aria-label="Próximo mês"><ChevronRight size={18} /></button>
          <button className="btn btn--ghost btn--sm" onClick={() => { const d = new Date(); d.setDate(1); setBase(d); setDia(hoje); setFoco(null); }}>Hoje</button>
        </div>
        <span className="calendario__resumo muted small">
          <b>{num(doMes.length)}</b> {doMes.length === 1 ? 'reserva' : 'reservas'} · <b>{num(pessoasDe(doMes))}</b> {pessoasDe(doMes) === 1 ? 'pessoa' : 'pessoas'}
          {podeClientes && <> · <b>{num(anivMes)}</b> {anivMes === 1 ? 'aniversário' : 'aniversários'}</>} no mês
          {doMes.some((r) => r.status === 'Pendente') && <> · <span className="text-warn">{num(doMes.filter((r) => r.status === 'Pendente').length)} aguardando</span></>}
        </span>
      </div>
      <div className="calendario__legenda" role="group" aria-label="Categorias mostradas">
        {CATS.filter((c) => c.id !== 'aniv' || podeClientes).map(({ id, label, Icone }) => (
          <button key={id} type="button" className={`cal-leg cat-${id} ${ocultas.has(id) ? 'is-off' : ''}`} aria-pressed={!ocultas.has(id)} onClick={() => alternar(id)} title={ocultas.has(id) ? `Mostrar ${label.toLowerCase()}` : `Esconder ${label.toLowerCase()}`}>
            <span className="cal-ico"><Icone size={14} /></span> {label}
          </button>
        ))}
      </div>

      <div className="calendario__corpo">
        <div className="calendario__grade" role="grid" aria-label={`Calendário de ${titulo}`}>
          {SEMANA.map((s) => <div key={s} className="calendario__semana">{s}</div>)}
          {celulas.map((d) => {
            const k = iso(d);
            const doK = doDia(k);
            const pendente = doK.rs.some((r) => r.status === 'Pendente');
            const qtd: Record<Cat, number> = { aniv: doK.aniv.length, rs: doK.rs.length, ev: doK.ev.length, dir: doK.dir.length };
            const resumoDia = CATS.filter((c) => qtd[c.id]).map((c) => `${qtd[c.id]} ${c.label.toLowerCase()}`).join(', ');
            return (
              <div
                key={k} role="gridcell" tabIndex={0} aria-selected={dia === k}
                aria-label={`${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'long' })}${resumoDia ? `: ${resumoDia}` : ''}`}
                onClick={() => abrir(k, null)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(k, null); } }}
                className={`calendario__dia ${d.getMonth() !== base.getMonth() ? 'is-fora' : ''} ${k === hoje ? 'is-hoje' : ''} ${dia === k ? 'is-sel' : ''} ${k < hoje ? 'is-passado' : ''}`}
              >
                <span className="calendario__n">{d.getDate()}</span>
                <span className="calendario__icones">
                  {CATS.filter((c) => qtd[c.id] > 0).map(({ id, label, Icone }) => (
                    <button
                      key={id} type="button" tabIndex={-1}
                      className={`cal-ico cat-${id} ${id === 'rs' && pendente ? 'is-pendente' : ''}`}
                      title={`${label}: ${qtd[id]}${id === 'rs' && pendente ? ' (há reserva aguardando)' : ''}`}
                      onClick={(e) => { e.stopPropagation(); abrir(k, id); }}
                    >
                      <Icone size={16} />
                      {qtd[id] > 1 && <small>{qtd[id]}</small>}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>

        <aside className="calendario__detalhe" aria-live="polite" ref={detalhe}>
          <h3>{capitalizar(new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</h3>
          <p className="muted small">
            {[
              sel.aniv.length ? plural(sel.aniv.length, 'aniversário', 'aniversários') : '',
              `${plural(sel.rs.length, 'reserva', 'reservas')} · ${plural(pessoasDe(sel.rs), 'pessoa', 'pessoas')}`,
              sel.ev.length ? plural(sel.ev.length, 'evento', 'eventos') : '',
              sel.dir.length ? plural(sel.dir.length, 'reunião', 'reuniões') : '',
            ].filter(Boolean).join(' · ')}
          </p>
          {foco && totalSel > 0 && (
            <button type="button" className="btn btn--ghost btn--sm calendario__tudo" onClick={() => setFoco(null)}>Ver tudo deste dia</button>
          )}
          {!totalSel && <p className="muted small calendario__vazio">Nada marcado neste dia.</p>}

          {mostra('aniv') && sel.aniv.length > 0 && <h4 className="cal-sec cat-aniv"><span className="cal-ico"><Cake size={14} /></span> Aniversários</h4>}
          {mostra('aniv') && sel.aniv.map((c) => {
            const idade = /^\d{4}/.test(c.nascimento ?? '') ? anoSel - Number(c.nascimento!.slice(0, 4)) : null;
            const wa = whatsapp(c.telefone);
            return (
              <div key={c.uid} className="cal-card cal-card--aniv">
                <Cake size={16} />
                <div className="cal-card__corpo">
                  <div className="cal-card__linha"><b>{String(c.nome)}</b><span className="muted small">{numeroAfilhado(Number(c.numero))}</span></div>
                  <span className="muted small cal-card__info">
                    <span>{idade !== null && idade > 0 ? `Faz ${idade} anos` : 'Faz aniversário'}</span>
                    {c.origem === 'Equipe' && <span>Equipe</span>}
                    {wa && <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Phone size={12} /> Mandar parabéns</a>}
                  </span>
                </div>
              </div>
            );
          })}

          {mostra('rs') && sel.rs.length > 0 && <h4 className="cal-sec cat-rs"><span className="cal-ico"><CalendarCheck size={14} /></span> Reservas</h4>}
          {mostra('rs') && sel.rs.map((r) => (
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

          {(['ev', 'dir'] as const).map((cat) => mostra(cat) && sel[cat].length > 0 && (
            <Fragment key={cat}>
              <h4 className={`cal-sec cat-${cat}`}><span className="cal-ico">{cat === 'ev' ? <PartyPopper size={14} /> : <Landmark size={14} />}</span> {cat === 'ev' ? 'Eventos' : 'Diretoria / reuniões'}</h4>
              {sel[cat].map((e) => (
                <div key={e.id} className={`cal-card cal-card--${cat}`}>
                  {cat === 'ev' ? <PartyPopper size={16} /> : <Landmark size={16} />}
                  <div className="cal-card__corpo">
                    <b>{String(e.titulo)}</b>
                    <span className="muted small">{[e.tipo, e.horario ? hora(e.horario) : '', e.responsavel ? `Resp.: ${e.responsavel}` : '', e.publico ? `${e.publico} ${Number(e.publico) === 1 ? 'pessoa esperada' : 'pessoas esperadas'}` : '', e.status].filter(Boolean).join(' · ')}</span>
                    {e.descricao ? <span className="small cal-card__obs">{String(e.descricao)}</span> : null}
                  </div>
                </div>
              ))}
            </Fragment>
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
