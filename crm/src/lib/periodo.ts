import { isoFromToday } from './format';

/** Coleções que crescem com o tempo: as telas carregam só um período (o padrão de cada uma fica abaixo). */
export const PERIODO_PADRAO: Record<string, PeriodoKey> = { receitas: '365', despesas: '365', reservas: '90', consumos: '90' };

export type PeriodoKey = '30' | '90' | '365' | 'tudo';
export const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: '30', label: 'Últimos 30 dias' },
  { key: '90', label: 'Últimos 90 dias' },
  { key: '365', label: 'Últimos 12 meses' },
  { key: 'tudo', label: 'Todo o período' },
];

/** Data inicial (AAAA-MM-DD) do período; "tudo" não tem limite. */
export const desdeDe = (p: PeriodoKey) => (p === 'tudo' ? undefined : isoFromToday(-Number(p)));
