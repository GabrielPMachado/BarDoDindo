import type { Row } from './data';

export const monthOf = (isoDate: unknown) => String(isoDate ?? '').slice(0, 7);

export function currentMonth(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Últimos N meses (do mais antigo ao atual), no formato YYYY-MM. */
export const lastMonths = (count: number) => Array.from({ length: count }, (_, i) => currentMonth(i - count + 1));

export const sumBy = (rows: Row[], key = 'valor') => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);

export const despesaValida = (r: Row) => r.status !== 'Cancelado';

export function monthName(key: string) {
  const [y, m] = key.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

