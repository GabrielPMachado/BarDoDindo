/**
 * Ficha técnica dos produtos: insumos (do Estoque ou digitados), quantidades e o custo de cada porção.
 * O custo vem do cadastro de Estoque (custo por unidade de compra) convertido para a unidade usada na receita.
 */

/** Unidades usadas na receita; kg/g e L/ml se convertem entre si. */
export const UNIDADES = ['ml', 'L', 'g', 'kg', 'un', 'dose', 'cx', 'fardo', 'pct'];
const FATOR: Record<string, { grupo: string; fator: number }> = {
  ml: { grupo: 'volume', fator: 1 }, L: { grupo: 'volume', fator: 1000 },
  g: { grupo: 'massa', fator: 1 }, kg: { grupo: 'massa', fator: 1000 },
};

export interface ItemFicha {
  insumo: string;
  /** Item do Estoque (vazio quando digitado à mão). */
  insumoId: string | null;
  quantidade: number;
  /** Unidade usada na receita (ex.: ml). */
  unidade: string;
  /** Unidade de compra e custo por essa unidade (ex.: L e R$ 40,00), copiados do Estoque. */
  unidadeBase: string;
  custoBase: number;
}

export interface Ficha {
  itens: ItemFicha[];
  /** Quantas porções a receita rende. */
  rendimento: number;
  /** Perdas, quebras e guarnições não listadas, em % sobre o custo dos insumos. */
  perdas: number;
  /** CMV desejado (% do preço de venda) para sugerir o preço. */
  cmvAlvo: number;
  preparo: string;
  montagem: string;
}

export const FICHA_VAZIA: Ficha = { itens: [], rendimento: 1, perdas: 0, cmvAlvo: 30, preparo: '', montagem: '' };

export function fichaDe(v: unknown): Ficha {
  const f = (v && typeof v === 'object' ? v : {}) as Partial<Ficha>;
  return {
    ...FICHA_VAZIA, ...f,
    itens: Array.isArray(f.itens) ? f.itens : [],
    rendimento: Number(f.rendimento) > 0 ? Number(f.rendimento) : 1,
    perdas: Number(f.perdas) || 0,
    cmvAlvo: Number(f.cmvAlvo) > 0 ? Number(f.cmvAlvo) : FICHA_VAZIA.cmvAlvo,
  };
}

/** Unidades em que a receita pode medir um insumo comprado em `base`. */
export function unidadesCompativeis(base: string) {
  const g = FATOR[base]?.grupo;
  return g ? UNIDADES.filter((u) => FATOR[u]?.grupo === g) : [base || 'un'];
}

/** Quantas unidades de compra (`base`) cabem em 1 unidade da receita (`unidade`). Ex.: ml → L = 0,001. */
export function conversao(unidade: string, base: string) {
  const a = FATOR[unidade], b = FATOR[base];
  if (a && b && a.grupo === b.grupo) return a.fator / b.fator;
  return 1;
}

export const custoDoItem = (i: ItemFicha) => (Number(i.quantidade) || 0) * conversao(i.unidade, i.unidadeBase) * (Number(i.custoBase) || 0);

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Todos os números da ficha, a partir do preço de venda atual. */
export function calcularFicha(f: Ficha, preco: number) {
  const insumos = f.itens.reduce((t, i) => t + custoDoItem(i), 0);
  const total = insumos * (1 + (f.perdas || 0) / 100);
  const porcao = total / (f.rendimento || 1);
  const cmv = preco > 0 ? porcao / preco : null;
  const sugerido = f.cmvAlvo > 0 ? porcao / (f.cmvAlvo / 100) : 0;
  return {
    insumos, total, porcao,
    /** Custo por porção arredondado: é o que vai para o campo "Custo" do produto. */
    custoPorcao: centavos(porcao),
    cmv,
    margem: preco > 0 ? preco - porcao : null,
    markup: porcao > 0 && preco > 0 ? preco / porcao : null,
    /** Preço que deixa o CMV no alvo, arredondado para cima em R$ 0,50 (ex.: 18,37 → 18,50). */
    sugerido: sugerido ? Math.ceil(sugerido * 2) / 2 : 0,
  };
}

export interface Insumo { id: string; nome: string; unidade: string; custo: number }

/**
 * Atualiza os itens vinculados ao Estoque com o custo e a unidade de hoje.
 * Devolve a ficha nova e quantos itens mudaram (para avisar a pessoa).
 */
export function atualizarCustos(f: Ficha, insumos: Insumo[]) {
  let mudou = 0;
  const itens = f.itens.map((i) => {
    const e = i.insumoId ? insumos.find((x) => x.id === i.insumoId) : undefined;
    if (!e) return i;
    if (e.custo === Number(i.custoBase) && e.unidade === i.unidadeBase) return i;
    mudou++;
    const unidade = unidadesCompativeis(e.unidade).includes(i.unidade) ? i.unidade : e.unidade;
    return { ...i, custoBase: e.custo, unidadeBase: e.unidade, unidade };
  });
  return { ficha: { ...f, itens }, mudou };
}
