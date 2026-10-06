export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Ordem de exibição preferida das categorias do cardápio; categorias novas aparecem no fim. */
const CATEGORY_ORDER = ['Cervejas', 'Chopes', 'Drinks', 'Destilados', 'Vinhos', 'Petiscos', 'Porções', 'Pratos', 'Sobremesas', 'Sem álcool'];

export function sortCategories(cats: string[]) {
  const idx = (c: string) => {
    const i = CATEGORY_ORDER.findIndex((o) => o.toLowerCase() === c.toLowerCase());
    return i === -1 ? 999 : i;
  };
  return [...cats].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b, 'pt-BR'));
}
