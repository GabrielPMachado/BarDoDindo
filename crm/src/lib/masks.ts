/** Máscaras e formatação de campos numéricos no padrão brasileiro. */

const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** (11) 91234-5678 ou (11) 1234-5678 */
export function maskPhone(v: unknown) {
  const d = onlyDigits(String(v ?? '')).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 00.000.000/0000-00 */
export function maskCnpj(v: unknown) {
  const d = onlyDigits(String(v ?? '')).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** Formata número para exibição em campo editável (sem símbolo de moeda). */
export function formatNumber(v: number, decimals: number, fixed = decimals > 0) {
  return v.toLocaleString('pt-BR', {
    minimumFractionDigits: fixed ? decimals : 0,
    maximumFractionDigits: decimals,
  });
}

/** Converte texto digitado no padrão brasileiro ("1.234,5") em número. */
export function parseBR(s: string): number | null {
  const clean = s.replace(/\./g, '').replace(',', '.').trim();
  if (!clean || clean === '.' || clean === '-') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export interface NumberSpec {
  /** Casas decimais permitidas (0 = inteiro). */
  decimals: number;
  min: number;
  max: number;
  /** Moeda: digitação da direita para a esquerda, sempre com 2 casas. */
  money?: boolean;
}

/**
 * Trata o texto digitado e devolve [texto formatado, valor numérico].
 * Nunca deixa ultrapassar o máximo nem o número de casas decimais.
 */
export function applyNumberMask(raw: string, spec: NumberSpec): [string, number | ''] {
  if (spec.money) {
    // digitação em centavos: 1 → 0,01 · 12 → 0,12 · 1234 → 12,34
    const d = onlyDigits(raw).replace(/^0+/, '').slice(0, 15);
    if (!d) return ['', ''];
    let n = Number(d) / 100;
    if (n > spec.max) n = spec.max;
    return [formatNumber(n, 2, true), n];
  }
  if (spec.decimals === 0) {
    const d = onlyDigits(raw).replace(/^0+(?=\d)/, '').slice(0, 15);
    if (!d) return ['', ''];
    let n = Number(d);
    if (n > spec.max) n = spec.max;
    return [formatNumber(n, 0), n];
  }
  // decimal livre: mantém a vírgula enquanto o usuário digita (ex.: "8,")
  // um ponto digitado no fim (teclado numérico) vale como vírgula decimal
  if (raw.endsWith('.') && !raw.includes(',')) raw = raw.slice(0, -1) + ',';
  let s = raw.replace(/[^\d,]/g, '');
  const firstComma = s.indexOf(',');
  if (firstComma !== -1) s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '');
  let [int, frac] = s.split(',');
  int = (int ?? '').replace(/^0+(?=\d)/, '').slice(0, 12);
  if (frac !== undefined) frac = frac.slice(0, spec.decimals);
  if (!int && frac === undefined) return ['', ''];
  let n = Number(`${int || '0'}.${frac || '0'}`);
  if (n > spec.max) {
    n = spec.max;
    return [formatNumber(n, spec.decimals, false), n];
  }
  const intFmt = Number(int || '0').toLocaleString('pt-BR');
  return [frac !== undefined ? `${intFmt},${frac}` : intFmt, n];
}
