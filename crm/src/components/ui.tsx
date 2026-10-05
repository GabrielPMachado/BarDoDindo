import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, X, XCircle } from 'lucide-react';
import { numberSpec, type Field, type Kpi, type Tone } from '../collections';
import { applyNumberMask, formatNumber, maskCnpj, maskPhone, type NumberSpec } from '../lib/masks';
import { confirmar, DatePicker, SelectPicker, TimePicker, type ConfirmOptions } from './pickers';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function KpiRow({ items }: { items: Kpi[] }) {
  if (!items.length) return null;
  return (
    <div className="kpis">
      {items.map((k) => (
        <div key={k.label} className={`kpi ${k.tone ? `kpi--${k.tone}` : ''}`}>
          <span className="kpi__label">{k.label}</span>
          <strong className="kpi__value">{k.value}</strong>
          {k.hint && <span className="kpi__hint">{k.hint}</span>}
        </div>
      ))}
    </div>
  );
}

export function PageHead({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="page-head__actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={28} strokeWidth={1.5} />
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, width = 720 }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function FieldInput({ field, value, onChange, disabled }: {
  field: Field; value: unknown; onChange: (v: unknown) => void; disabled?: boolean;
}) {
  const v = value === undefined || value === null ? '' : String(value);
  const common = { id: `f-${field.key}`, className: 'input', disabled, required: field.required, placeholder: field.placeholder };
  switch (field.type) {
    case 'textarea':
      return <textarea {...common} rows={3} value={v} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return <SelectPicker id={common.id} disabled={disabled} options={field.options ?? []} value={v} onChange={onChange} />;
    case 'number':
    case 'money':
    case 'percent':
      return (
        <NumberInput
          id={common.id}
          disabled={disabled}
          required={field.required}
          spec={numberSpec(field)}
          value={value}
          onChange={onChange}
          prefix={field.type === 'money' ? 'R$' : undefined}
          suffix={field.type === 'percent' ? '%' : undefined}
        />
      );
    case 'date':
      return <DatePicker id={common.id} disabled={disabled} required={field.required} value={v} onChange={onChange} />;
    case 'time':
      return <TimePicker id={common.id} disabled={disabled} required={field.required} value={v} onChange={onChange} />;
    case 'email':
      return <input {...common} type="email" maxLength={160} value={v} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <input {...common} type="tel" inputMode="tel" maxLength={15} placeholder="(00) 00000-0000" value={maskPhone(v)} onChange={(e) => onChange(maskPhone(e.target.value))} />;
    case 'cnpj':
      return <input {...common} inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" value={maskCnpj(v)} onChange={(e) => onChange(maskCnpj(e.target.value))} />;
    default:
      return <input {...common} type="text" maxLength={field.wide ? 200 : 120} value={v} onChange={(e) => onChange(e.target.value)} />;
  }
}

/**
 * Campo numérico formatado no padrão brasileiro (1.234,56), com limites de
 * mínimo/máximo e casas decimais. Valores em R$ são digitados em centavos.
 */
export function NumberInput({ value, onChange, spec, id, disabled, required, prefix, suffix, ariaLabel, placeholder }: {
  value: unknown; onChange: (v: number | '') => void; spec: NumberSpec;
  id?: string; disabled?: boolean; required?: boolean; prefix?: string; suffix?: string; ariaLabel?: string; placeholder?: string;
}) {
  const fmt = (x: unknown) =>
    x === '' || x === null || x === undefined || !Number.isFinite(Number(x))
      ? ''
      : formatNumber(Number(x), spec.money ? 2 : spec.decimals, !!spec.money);
  const [text, setText] = useState(() => fmt(value));
  const current = useRef<unknown>(value);

  // sincroniza quando o valor muda por fora (ex.: outro registro aberto)
  useEffect(() => {
    if (value !== current.current) {
      current.current = value;
      setText(fmt(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const hint = `Entre ${formatNumber(spec.min, spec.money ? 2 : spec.decimals, !!spec.money)} e ${formatNumber(spec.max, spec.money ? 2 : spec.decimals, !!spec.money)}`;

  return (
    <div className="input-affix" title={hint}>
      {prefix && <span>{prefix}</span>}
      <input
        id={id}
        className="input input--num"
        inputMode={spec.decimals > 0 || spec.money ? 'decimal' : 'numeric'}
        autoComplete="off"
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        placeholder={placeholder ?? (spec.money ? '0,00' : '0')}
        value={text}
        onChange={(e) => {
          const [t, n] = applyNumberMask(e.target.value, spec);
          setText(t);
          current.current = n;
          onChange(n);
        }}
        onBlur={() => setText(fmt(current.current))}
      />
      {suffix && <span>{suffix}</span>}
    </div>
  );
}

/** Valida mínimo/máximo de um valor numérico; devolve a mensagem de erro ou null. */
export function checkRange(label: string, value: unknown, spec: NumberSpec) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  const f = (x: number) => (spec.money ? 'R$ ' : '') + formatNumber(x, spec.money ? 2 : spec.decimals, !!spec.money);
  if (!Number.isFinite(n)) return `O campo "${label}" tem um valor inválido.`;
  if (n < spec.min) return `O campo "${label}" deve ser no mínimo ${f(spec.min)}.`;
  if (n > spec.max) return `O campo "${label}" deve ser no máximo ${f(spec.max)}.`;
  return null;
}

/* ---------- avisos (toast) ---------- */
type ToastMsg = { id: number; text: string; tone: 'ok' | 'error' };
let toasts: ToastMsg[] = [];
const toastListeners = new Set<() => void>();
export function notify(text: string, tone: 'ok' | 'error' = 'ok') {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, text, tone }];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    toastListeners.forEach((l) => l());
  }, 4000);
}
export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts">
      {list.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`} role="status">
          {t.tone === 'ok' ? <CheckCircle2 size={18} /> : <XCircle size={18} />} {t.text}
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="error-box"><AlertTriangle size={18} /> {children}</div>
  );
}

export function Loading() {
  return <div className="loading"><div className="spinner" /> Carregando…</div>;
}

/** Botão de ação assíncrona com estado de carregamento e aviso de erro. */
export function AsyncButton({ onClick, children, className = 'btn', disabled, confirm }: {
  onClick: () => Promise<unknown>; children: ReactNode; className?: string; disabled?: boolean; confirm?: string | ConfirmOptions;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={disabled || busy}
      onClick={async () => {
        if (confirm && !(await confirmar(confirm))) return;
        setBusy(true);
        try {
          await onClick();
        } catch (e) {
          notify(e instanceof Error ? e.message : 'Não foi possível concluir.', 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}
