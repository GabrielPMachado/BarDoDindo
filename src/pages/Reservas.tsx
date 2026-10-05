import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarDays, Minus, Plus, Trash2 } from 'lucide-react';
import { confirmar, Empty, PageHeader, ReservationCard, SectionHeader, Toast } from '../components/ui';
import { dateParts, isoDate, parseDate, todayISO, upcoming, useMe, useStore, type Reservation } from '../store';

export default function Reservas() {
  const me = useMe();
  const { config, criarReserva, cancelarReserva } = useStore();
  const horarios = config?.horarios ?? [];
  const ambientes = config?.ambientes ?? [];
  const antecedencia = config?.antecedenciaMinutos ?? 30;

  const days = useMemo(() => {
    const abertos = config?.diasFuncionamento ?? [];
    const out: Date[] = [];
    const d = new Date();
    for (let i = 0; i < 60 && out.length < 14; i++) {
      if (abertos.includes(d.getDay())) out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [config]);

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [people, setPeople] = useState(2);
  const [area, setArea] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Reservation | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const timeDisabled = useCallback(
    (d: string, t: string) => {
      if (d !== todayISO()) return false;
      const [h, m] = t.split(':').map(Number);
      const now = new Date();
      return h * 60 + m < now.getHours() * 60 + now.getMinutes() + antecedencia;
    },
    [antecedencia],
  );

  // escolhe automaticamente o primeiro dia/horário disponível
  useEffect(() => {
    if (!date && days.length) {
      const first = days.find((d) => horarios.some((t) => !timeDisabled(isoDate(d), t)));
      if (first) setDate(isoDate(first));
    }
    if (!area && ambientes.length) setArea(ambientes[0]);
  }, [days, horarios, ambientes, date, area, timeDisabled]);

  useEffect(() => {
    if (date && (!time || timeDisabled(date, time))) setTime(horarios.find((t) => !timeDisabled(date, t)) ?? '');
  }, [date, time, horarios, timeDisabled]);

  const canSubmit = !!date && !!time && !!area && !timeDisabled(date, time) && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      const r = await criarReserva({ data: date, hora: time, pessoas: people, ambiente: area, observacoes: notes.trim() });
      setConfirm(r);
      setNotes('');
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Não foi possível reservar.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    const ok = await confirmar({ title: 'Cancelar esta reserva?', message: 'A mesa será liberada para outros clientes.', confirmLabel: 'Cancelar reserva', danger: true });
    if (!ok) return;
    try {
      await cancelarReserva(id);
      setToast({ msg: 'Reserva cancelada', tone: 'ok' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Não foi possível cancelar.', tone: 'error' });
    }
  };

  const next = upcoming(me.reservas);
  const past = me.reservas
    .filter((r) => !next.includes(r))
    .sort((a, b) => (b.data + b.hora).localeCompare(a.data + a.hora));

  const semConfig = !horarios.length || !ambientes.length || !days.length;

  return (
    <div className="page">
      <PageHeader title="Fazer Reserva" subtitle="Garanta sua mesa no Dindo" />

      {semConfig ? (
        <Empty icon={<CalendarDays />}>As reservas pelo aplicativo estão temporariamente indisponíveis.</Empty>
      ) : (
        <form className="card form" onSubmit={submit}>
          <label className="label">Dia</label>
          <div className="chips chips--scroll">
            {days.map((d) => {
              const v = isoDate(d);
              const p = dateParts(v);
              return (
                <button type="button" key={v} className={`day-chip ${date === v ? 'is-active' : ''}`} onClick={() => setDate(v)}>
                  <span>{p.week}</span>
                  <strong>{p.day}</strong>
                  <span>{p.month}</span>
                </button>
              );
            })}
          </div>

          <label className="label">Horário</label>
          <div className="chips">
            {horarios.map((t) => (
              <button
                type="button"
                key={t}
                disabled={!date || timeDisabled(date, t)}
                className={`chip ${time === t ? 'is-active' : ''}`}
                onClick={() => setTime(t)}
              >
                {t}
              </button>
            ))}
          </div>

          <label className="label">Pessoas</label>
          <div className="stepper">
            <button type="button" className="icon-btn" onClick={() => setPeople((p) => Math.max(1, p - 1))} aria-label="Menos pessoas">
              <Minus size={20} />
            </button>
            <strong>{people}</strong>
            <button type="button" className="icon-btn" onClick={() => setPeople((p) => Math.min(50, p + 1))} aria-label="Mais pessoas">
              <Plus size={20} />
            </button>
          </div>

          {ambientes.length > 1 && (
            <>
              <label className="label">Ambiente</label>
              <div className="chips" id="area" role="radiogroup" aria-label="Ambiente">
                {ambientes.map((a) => (
                  <button type="button" key={a} role="radio" aria-checked={area === a} className={`chip ${area === a ? 'is-active' : ''}`} onClick={() => setArea(a)}>
                    {a}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="label" htmlFor="notes">Observações (opcional)</label>
          <textarea
            id="notes"
            className="input"
            rows={2}
            maxLength={300}
            placeholder="Aniversário, cadeira para criança, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {date && !time && <p className="error">Não há horários disponíveis neste dia.</p>}
          <button className="btn btn--primary" disabled={!canSubmit}>
            <CalendarCheck size={20} /> {busy ? 'Enviando…' : 'Solicitar reserva'}
          </button>
        </form>
      )}

      <SectionHeader title="Minhas próximas reservas" />
      {next.length ? (
        <div className="stack">
          {next.map((r) => (
            <ReservationCard
              key={r.id}
              r={r}
              action={
                <button className="btn btn--ghost btn--small" onClick={() => cancel(r.id)}>
                  <Trash2 size={16} /> Cancelar
                </button>
              }
            />
          ))}
        </div>
      ) : (
        <Empty icon={<CalendarDays />}>Você ainda não tem reservas futuras.</Empty>
      )}

      {past.length > 0 && (
        <>
          <SectionHeader title="Anteriores e canceladas" />
          <div className="stack">{past.map((r) => <ReservationCard key={r.id} r={r} />)}</div>
        </>
      )}

      {confirm && (
        <div className="overlay" onClick={() => setConfirm(null)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="success-icon"><CalendarCheck size={36} /></div>
            <h3>Solicitação enviada</h3>
            <p className="muted">
              {parseDate(confirm.data).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}, às{' '}
              {confirm.hora}
              <br />
              {confirm.pessoas} {confirm.pessoas === 1 ? 'pessoa' : 'pessoas'} · {confirm.ambiente}
            </p>
            <p className="small muted">Você será avisado aqui assim que o bar confirmar a reserva.</p>
            <button className="btn btn--primary" onClick={() => setConfirm(null)}>Entendido</button>
          </div>
        </div>
      )}
      <Toast msg={toast?.msg ?? null} tone={toast?.tone} onDone={clearToast} />
    </div>
  );
}
