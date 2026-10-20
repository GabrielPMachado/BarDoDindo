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

/** 000.000.000-00 */
export function maskCpf(v: unknown) {
  const d = String(v ?? '').replace(/\D/g, '').slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}
/** Data mais recente de nascimento aceita (18 anos atrás), para o campo de data. */
export function nascimentoMaximo() {
  const d = new Date(); d.setFullYear(d.getFullYear() - 18);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
