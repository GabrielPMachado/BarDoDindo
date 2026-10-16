/** Links de compra e sites de fornecedores: só abre http(s), e completa "loja.com.br" com https://. */
export function linkSeguro(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const comEsquema = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : /^[\w-]+(\.[\w-]+)+/.test(s) ? `https://${s}` : '';
  try {
    const u = new URL(comEsquema);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
