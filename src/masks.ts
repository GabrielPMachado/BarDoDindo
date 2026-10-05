/** (11) 91234-5678 ou (11) 1234-5678 */
export function maskPhone(v: unknown) {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone vazio ou com DDD + número completo (10 ou 11 dígitos). */
export const phoneOk = (v: string) => {
  const n = v.replace(/\D/g, '').length;
  return n === 0 || n === 10 || n === 11;
};
