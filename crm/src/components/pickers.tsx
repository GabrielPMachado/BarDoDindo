import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Link2, Search, Trash2, X } from 'lucide-react';
import type { Field } from '../collections';
import { useResource } from '../lib/data';

/* ======================================================================
   Popover: fecha ao clicar fora ou com Esc
   ====================================================================== */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    // Tab (ou clique) para outro campo também fecha: senão o calendário/lista fica aberto cobrindo os campos de baixo
    const onFocus = (e: FocusEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/* ======================================================================
   Calendário
   ====================================================================== */
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoToBr = (iso: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function brToIso(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number) as unknown as number[];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || y < 1900 || y > 2100) return null;
  return toIso(date);
}
const maskDate = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

export function DatePicker({ value, onChange, id, disabled, required, placeholder = 'dd/mm/aaaa' }: {
  value: unknown; onChange: (iso: string) => void; id?: string; disabled?: boolean; required?: boolean; placeholder?: string;
}) {
  const iso = typeof value === 'string' ? value.slice(0, 10) : '';
  const [text, setText] = useState(isoToBr(iso));
  const [view, setView] = useState(() => (iso ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1) : new Date()));
  const { open, setOpen, ref } = usePopover();

  useEffect(() => {
    setText(isoToBr(iso));
    if (iso) setView(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1));
  }, [iso]);

  const hoje = toIso(new Date());
  const dias = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [view]);

  const escolher = (d: string) => {
    onChange(d);
    setOpen(false);
  };
  const mudarMes = (delta: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <div className="picker" ref={ref}>
      <div className={`input-affix ${open ? 'is-focus' : ''}`}>
        <input
          id={id}
          className="input"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          value={text}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            const t = maskDate(e.target.value);
            setText(t);
            const parsed = brToIso(t);
            if (parsed) {
              onChange(parsed);
              setView(new Date(Number(parsed.slice(0, 4)), Number(parsed.slice(5, 7)) - 1, 1));
            } else if (!t) onChange('');
          }}
          onBlur={() => {
            if (text && !brToIso(text)) setText(isoToBr(iso));
          }}
        />
        <button type="button" className="picker__btn" disabled={disabled} onClick={() => setOpen(!open)} aria-label="Abrir calendário">
          <CalendarDays size={16} />
        </button>
      </div>
      {open && (
        <div className="popover calendar" role="dialog" aria-label="Calendário">
          <div className="calendar__head">
            <button type="button" className="icon-btn" onClick={() => mudarMes(-1)} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
            <div className="calendar__title">
              <select value={view.getMonth()} onChange={(e) => setView(new Date(view.getFullYear(), Number(e.target.value), 1))} aria-label="Mês">
                {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <input
                type="number"
                value={view.getFullYear()}
                min={1900}
                max={2100}
                aria-label="Ano"
                onChange={(e) => {
                  const y = Number(e.target.value);
                  if (y >= 1900 && y <= 2100) setView(new Date(y, view.getMonth(), 1));
                }}
              />
            </div>
            <button type="button" className="icon-btn" onClick={() => mudarMes(1)} aria-label="Próximo mês"><ChevronRight size={16} /></button>
          </div>
          <div className="calendar__grid">
            {SEMANA.map((s, i) => <span key={i} className="calendar__dow">{s}</span>)}
            {dias.map((d) => {
              const k = toIso(d);
              const fora = d.getMonth() !== view.getMonth();
              return (
                <button
                  type="button"
                  key={k}
                  className={`calendar__day ${fora ? 'is-out' : ''} ${k === hoje ? 'is-today' : ''} ${k === iso ? 'is-selected' : ''}`}
                  onClick={() => escolher(k)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="calendar__foot">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => escolher(hoje)}>Hoje</button>
            {!required && iso && <button type="button" className="btn btn--ghost btn--sm" onClick={() => escolher('')}>Limpar</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ======================================================================
   Horário
   ====================================================================== */
const HORARIOS = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);
const maskTime = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
};
const timeOk = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function TimePicker({ value, onChange, id, disabled, required }: {
  value: unknown; onChange: (v: string) => void; id?: string; disabled?: boolean; required?: boolean;
}) {
  const atual = typeof value === 'string' ? value.slice(0, 5) : '';
  const [text, setText] = useState(atual);
  const { open, setOpen, ref } = usePopover();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(atual), [atual]);
  useEffect(() => {
    if (open) listRef.current?.querySelector('.is-selected, [data-near]')?.scrollIntoView({ block: 'center' });
  }, [open]);

  const perto = HORARIOS.find((h) => h >= (atual || '18:00'));

  return (
    <div className="picker" ref={ref}>
      <div className={`input-affix ${open ? 'is-focus' : ''}`}>
        <input
          id={id}
          className="input"
          inputMode="numeric"
          autoComplete="off"
          placeholder="hh:mm"
          disabled={disabled}
          required={required}
          value={text}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            const t = maskTime(e.target.value);
            setText(t);
            if (timeOk(t)) onChange(t);
            else if (!t) onChange('');
          }}
          onBlur={() => {
            if (text && !timeOk(text)) setText(atual);
          }}
        />
        <button type="button" className="picker__btn" disabled={disabled} onClick={() => setOpen(!open)} aria-label="Escolher horário">
          <Clock size={16} />
        </button>
      </div>
      {open && (
        <div className="popover times" ref={listRef} role="listbox" aria-label="Horários">
          {HORARIOS.map((h) => (
            <button
              type="button"
              key={h}
              role="option"
              aria-selected={h === atual}
              data-near={h === perto ? '' : undefined}
              className={h === atual ? 'is-selected' : ''}
              onClick={() => {
                onChange(h);
                setOpen(false);
              }}
            >
              {h}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ======================================================================
   Lista de opções (substitui o select do navegador nos formulários)
   ====================================================================== */
type SelectOption = string | { value: string; label: string };

export function SelectPicker({ options, value, onChange, id, disabled, placeholder = 'Selecione…' }: {
  options: SelectOption[]; value: unknown; onChange: (v: string) => void; id?: string; disabled?: boolean; placeholder?: string;
}) {
  const atual = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const opts = atual && !norm.some((o) => o.value === atual) ? [...norm, { value: atual, label: atual }] : norm;
  const lista = opts.map((o) => o.value);
  const rotulo = (v: string) => opts.find((o) => o.value === v)?.label ?? v;
  const { open, setOpen, ref } = usePopover();
  const [hi, setHi] = useState(0);

  const abrir = () => {
    if (disabled) return;
    setHi(Math.max(0, lista.indexOf(atual)));
    setOpen(true);
  };
  const escolher = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="picker" ref={ref}>
      <button
        type="button"
        id={id}
        className={`input select-btn ${open ? 'is-open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : abrir())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(); return; }
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, lista.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); escolher(lista[hi]); }
        }}
      >
        <span className={atual ? '' : 'muted'}>{atual ? rotulo(atual) : placeholder}</span>
        <ChevronRight size={14} className="select-btn__chev" />
      </button>
      {open && (
        <div className="popover reflist" role="listbox">
          {lista.map((o, idx) => (
            <button
              type="button"
              key={o}
              role="option"
              aria-selected={o === atual}
              className={`reflist__item ${idx === hi ? 'is-hi' : ''}`}
              onMouseEnter={() => setHi(idx)}
              onClick={() => escolher(o)}
            >
              <span className="reflist__name">{rotulo(o)}</span>
              <span className="reflist__detail" />
              {o === atual && <Check size={14} className="gold" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ======================================================================
   Vínculo com outro cadastro (busca + seleção, com opção de texto livre)
   ====================================================================== */
interface RefItem {
  id: string | number;
  nome: string;
  detalhe?: string;
  inativo?: boolean;
  [k: string]: unknown;
}

export function RefPicker({ field, value, linkedId, onChange, disabled, id }: {
  field: Field; value: unknown; linkedId: unknown; disabled?: boolean; id?: string;
  /** Recebe os campos a gravar: nome, identificador e dados copiados. */
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const { data, loading, error } = useResource<RefItem[]>(field.ref ? `/crm/referencias/${field.ref}` : null);
  const nome = typeof value === 'string' ? value : '';
  const [q, setQ] = useState(nome);
  const { open, setOpen, ref } = usePopover();
  const [hi, setHi] = useState(0);

  useEffect(() => setQ(nome), [nome]);

  const itens = useMemo(() => [...(data ?? [])].sort((a, b) => Number(!!a.inativo) - Number(!!b.inativo) || String(a.nome).localeCompare(String(b.nome), 'pt-BR')), [data]);
  const termo = q.trim().toLowerCase();
  const filtrados = itens.filter((i) => !termo || `${i.nome} ${i.detalhe ?? ''}`.toLowerCase().includes(termo)).slice(0, 50);
  const vinculado = linkedId !== undefined && linkedId !== null && linkedId !== '';
  const exato = itens.some((i) => i.nome.toLowerCase() === termo);
  const podeLivre = !!field.livre && !!termo && !exato;
  const opcoes = filtrados.length + (podeLivre ? 1 : 0);

  const escolher = (item: RefItem) => {
    const patch: Record<string, unknown> = { [field.key]: item.nome, [field.refKey!]: item.id };
    for (const [destino, origem] of Object.entries(field.fill ?? {})) if (item[origem] !== undefined) patch[destino] = item[origem];
    onChange(patch);
    setQ(item.nome);
    setOpen(false);
  };
  const usarLivre = () => {
    onChange({ [field.key]: q.trim(), [field.refKey!]: null });
    setOpen(false);
  };

  return (
    <div className="picker" ref={ref}>
      <div className={`input-affix ${open ? 'is-focus' : ''}`}>
        <span className="picker__lead">{vinculado ? <Link2 size={15} className="gold" /> : <Search size={15} />}</span>
        <input
          id={id}
          className="input"
          autoComplete="off"
          disabled={disabled}
          maxLength={160}
          placeholder={field.livre ? 'Buscar ou digitar um nome' : 'Buscar e selecionar'}
          value={q}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setHi(0);
            // ao editar o texto, o vínculo anterior deixa de valer
            if (vinculado) onChange({ [field.key]: field.livre ? e.target.value : nome, [field.refKey!]: null });
            else if (field.livre) onChange({ [field.key]: e.target.value });
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, opcoes - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (hi < filtrados.length) escolher(filtrados[hi]);
              else if (podeLivre) usarLivre();
            }
          }}
          onBlur={() => {
            // sem texto livre: se não escolheu da lista, volta ao valor vinculado
            if (!field.livre && !vinculado) setTimeout(() => setQ((cur) => (itens.some((i) => i.nome === cur) ? cur : nome)), 150);
          }}
        />
        {q && !disabled && (
          <button type="button" className="picker__btn" aria-label="Limpar" onClick={() => { setQ(''); onChange({ [field.key]: '', [field.refKey!]: null }); }}>
            <X size={14} />
          </button>
        )}
      </div>
      {vinculado && <span className="picker__hint gold"><Link2 size={11} /> vinculado ao cadastro</span>}
      {open && (
        <div className="popover reflist" role="listbox">
          {error ? (
            <p className="reflist__empty">{error}</p>
          ) : loading ? (
            <p className="reflist__empty">Carregando…</p>
          ) : (
            <>
              {filtrados.map((i, idx) => (
                <button
                  type="button"
                  key={String(i.id)}
                  role="option"
                  aria-selected={String(linkedId) === String(i.id)}
                  className={`reflist__item ${idx === hi ? 'is-hi' : ''} ${i.inativo ? 'is-inactive' : ''}`}
                  onMouseEnter={() => setHi(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(i)}
                >
                  <span className="reflist__name">{i.nome}</span>
                  {i.detalhe && <span className="reflist__detail">{i.detalhe}</span>}
                  {String(linkedId) === String(i.id) && <Check size={14} className="gold" />}
                </button>
              ))}
              {podeLivre && (
                <button
                  type="button"
                  className={`reflist__item reflist__free ${hi === filtrados.length ? 'is-hi' : ''}`}
                  onMouseEnter={() => setHi(filtrados.length)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={usarLivre}
                >
                  Usar “{q.trim()}” sem vínculo
                </button>
              )}
              {!filtrados.length && !podeLivre && (
                <p className="reflist__empty">{itens.length ? 'Nenhum resultado.' : 'Nenhum cadastro disponível para vincular.'}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ======================================================================
   Confirmação no estilo do sistema (substitui o confirm do navegador)
   ====================================================================== */
export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let pending: Pending | null = null;
const confirmListeners = new Set<() => void>();
const emitConfirm = () => confirmListeners.forEach((l) => l());

/** Abre a janela de confirmação e devolve true se a pessoa confirmar. */
export function confirmar(opts: ConfirmOptions | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { title: opts } : opts;
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { ...o, resolve };
    emitConfirm();
  });
}

export function ConfirmHost() {
  const p = useSyncExternalStore(
    (l) => {
      confirmListeners.add(l);
      return () => confirmListeners.delete(l);
    },
    () => pending,
  );
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!p) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [p]);

  if (!p) return null;
  function close(ok: boolean) {
    p!.resolve(ok);
    pending = null;
    emitConfirm();
  }
  const danger = p.danger ?? /exclu|estorn|cancel|recus|remov/i.test(p.title);

  return (
    <div className="modal-overlay modal-overlay--confirm" onMouseDown={() => close(false)}>
      <div className="modal confirm" role="alertdialog" aria-modal="true" aria-label={p.title} onMouseDown={(e) => e.stopPropagation()}>
        <div className={`confirm__icon ${danger ? 'is-danger' : ''}`}>{danger ? <Trash2 size={22} /> : <AlertTriangle size={22} />}</div>
        <h2>{p.title}</h2>
        {p.message && <div className="confirm__msg">{p.message}</div>}
        <div className="confirm__actions">
          <button className="btn btn--ghost" onClick={() => close(false)}>Cancelar</button>
          <button ref={okRef} className={`btn ${danger ? 'btn--danger-solid' : 'btn--primary'}`} onClick={() => close(true)}>
            {p.confirmLabel ?? (danger ? 'Sim, continuar' : 'Confirmar')}
          </button>
        </div>
      </div>
    </div>
  );
}
