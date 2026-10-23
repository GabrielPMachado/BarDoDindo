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
  /** De onde vem o custo: preço de um fornecedor (Tabela de preços) ou, sem `precoId`, o custo do Estoque. */
  precoId?: string | null;
  fornecedor?: string;
}

/** Guarnição ou item de valor fixo por porção (gelo, rodela de laranja, canudo…): não se pesa, só se marca. */
export interface FixoFicha { id: string; nome: string; custo: number }

export interface Ficha {
  itens: ItemFicha[];
  /** Itens de valor fixo marcados nesta ficha (cadastro "Guarnições e itens fixos"). */
  fixos: FixoFicha[];
  /** Quantas porções a receita rende. */
  rendimento: number;
  /** Perdas e quebras, em % sobre o custo dos insumos (não vale para os itens fixos). */
  perdas: number;
  /** CMV desejado (% do preço de venda) para sugerir o preço. */
  cmvAlvo: number;
  /** Texto livre das fichas antigas; ao abrir, vira a lista de passos. */
  preparo: string;
  /** Técnica de preparo (montado, batido, mexido…). */
  tecnica: string;
  /** Copo ou recipiente; `copoId` liga ao cadastro ("e:" Estoque, "m:" Materiais, "s:" sugestão). */
  copo: string;
  copoId: string | null;
  /** Copo descartável do Estoque: custo por drink, somado à porção. */
  copoCusto: number;
  utensilios: Ligado[];
  /** Passo a passo, na ordem. */
  passos: string[];
  /** Finalização e decoração. */
  montagem: string;
}

/** Item ligado a um cadastro (Estoque, Materiais) ou digitado (`id` nulo). */
export interface Ligado { id: string | null; nome: string }
/** Copo ou utensílio como vem de /crm/referencias/copos|utensilios. */
export interface Recipiente extends Ligado { id: string; detalhe?: string; custo: number; descartavel: boolean }

export const TECNICAS = ['Montado', 'Batido', 'Mexido', 'Macerado', 'Liquidificador'];

export const FICHA_VAZIA: Ficha = {
  itens: [], fixos: [], rendimento: 1, perdas: 0, cmvAlvo: 30, preparo: '', tecnica: '', copo: '', copoId: null, copoCusto: 0, utensilios: [], passos: [], montagem: '',
};

/** Texto de preparo antigo ("1. Macerar…\n2. Completar…") em passos, sem a numeração. */
const passosDoTexto = (t: string) => t.split(/\r?\n/).map((l) => l.replace(/^\s*(\d+\s*[.)\-–]|[-•*])\s*/, '').trim()).filter(Boolean);

export function fichaDe(v: unknown): Ficha {
  const f = (v && typeof v === 'object' ? v : {}) as Partial<Ficha>;
  return {
    ...FICHA_VAZIA, ...f,
    itens: Array.isArray(f.itens) ? f.itens : [],
    fixos: Array.isArray(f.fixos) ? f.fixos : [],
    utensilios: Array.isArray(f.utensilios) ? f.utensilios.map((u) => (typeof u === 'string' ? { id: null, nome: u } : { id: u?.id ?? null, nome: String(u?.nome ?? '') })) : [],
    copoCusto: Number(f.copoCusto) || 0,
    // fichas antigas: o texto de preparo vira a lista de passos
    ...(Array.isArray(f.passos) && f.passos.length ? { passos: f.passos.map(String), preparo: f.preparo ?? '' }
      : { passos: passosDoTexto(String(f.preparo ?? '')), preparo: '' }),
    copo: String(f.copo ?? ''), copoId: f.copoId ?? null, tecnica: String(f.tecnica ?? ''), montagem: String(f.montagem ?? ''),
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

/** Preço de uma embalagem por L, kg ou unidade, para comparar fornecedores (ex.: R$ 52,00 por 750 ml → "R$ 69,33/L"). */
export function precoNormalizado(preco: number, conteudo: number, unidade: string) {
  if (!(preco > 0) || !(conteudo > 0)) return null;
  const grande = unidade === 'ml' ? 'L' : unidade === 'g' ? 'kg' : unidade;
  const v = (preco / conteudo) * conversao(grande, unidade);
  return `${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/${grande}`;
}

/** Custo de compra legível: o que custa em ml ou g aparece por L ou kg (R$ 0,0693/ml → "R$ 69,33/L"). */
export const custoBaseTxt = (i: Pick<ItemFicha, 'custoBase' | 'unidadeBase'>) =>
  precoNormalizado(Number(i.custoBase) || 0, 1, i.unidadeBase) ?? '—';

export const custoDoItem = (i: ItemFicha) => (Number(i.quantidade) || 0) * conversao(i.unidade, i.unidadeBase) * (Number(i.custoBase) || 0);

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Todos os números da ficha, a partir do preço de venda atual. */
export function calcularFicha(f: Ficha, preco: number) {
  const insumos = f.itens.reduce((t, i) => t + custoDoItem(i), 0);
  // itens fixos (gelo, guarnições) entram por porção, com o valor cadastrado, sem pesar nem aplicar perdas
  // copo descartável também é um custo fixo por porção
  const fixos = f.fixos.reduce((t, x) => t + (Number(x.custo) || 0), 0) + (Number(f.copoCusto) || 0);
  const porcao = (insumos * (1 + (f.perdas || 0) / 100)) / (f.rendimento || 1) + fixos;
  const total = porcao * (f.rendimento || 1);
  const cmv = preco > 0 ? porcao / preco : null;
  const sugerido = f.cmvAlvo > 0 ? porcao / (f.cmvAlvo / 100) : 0;
  return {
    insumos, fixos, total, porcao,
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
/** Preço de um fornecedor para um insumo (Tabela de preços): `preco` pela embalagem com `conteudo` em `unidade`. */
export interface Cotacao { id: string; nome: string; insumoId: string; fornecedorId: string | null; embalagem: string; conteudo: number; unidade: string; preco: number; data: string }

/** Uma origem de custo possível para o item: o Estoque ou um fornecedor. */
export interface Opcao {
  precoId: string | null;
  fornecedor: string;
  detalhe: string;
  unidadeBase: string;
  custoBase: number;
  /** A unidade da receita se converte na desta origem (ml × garrafa em "un" não se compara). */
  compativel: boolean;
  /** Custo da quantidade usada na receita. */
  custo: number;
  /** Custo de 1 unidade da receita (ex.: 1 ml): ordena as opções mesmo antes de a quantidade ser informada. */
  unitario: number;
}

const brlTxt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Estoque e fornecedores que podem dar o custo do item, do mais barato ao mais caro. */
export function opcoesDoItem(i: ItemFicha, insumos: Insumo[], cotacoes: Cotacao[]): Opcao[] {
  if (!i.insumoId) return [];
  const opcoes: Opcao[] = [];
  const e = insumos.find((x) => x.id === i.insumoId);
  const montar = (precoId: string | null, fornecedor: string, detalhe: string, unidadeBase: string, custoBase: number): Opcao => {
    const compativel = unidadesCompativeis(unidadeBase).includes(i.unidade);
    const unitario = compativel ? conversao(i.unidade, unidadeBase) * custoBase : 0;
    return { precoId, fornecedor, detalhe, unidadeBase, custoBase, compativel, unitario, custo: compativel ? custoDoItem({ ...i, unidadeBase, custoBase }) : 0 };
  };
  if (e && e.custo > 0) opcoes.push(montar(null, 'Custo do Estoque', custoBaseTxt({ custoBase: e.custo, unidadeBase: e.unidade }), e.unidade, e.custo));
  for (const c of cotacoes.filter((x) => x.insumoId === i.insumoId)) {
    const emb = c.embalagem || `${num(c.conteudo)} ${c.unidade}`;
    opcoes.push(montar(c.id, c.nome, `${brlTxt(c.preco)} · ${emb}`, c.unidade, c.preco / c.conteudo));
  }
  return opcoes.sort((a, b) => Number(b.compativel) - Number(a.compativel) || a.unitario - b.unitario);
}
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Aplica uma origem de custo ao item. */
export const usarOpcao = (i: ItemFicha, o: Opcao): ItemFicha =>
  ({ ...i, precoId: o.precoId, fornecedor: o.precoId ? o.fornecedor : '', unidadeBase: o.unidadeBase, custoBase: o.custoBase });

/**
 * Atualiza os itens com o custo de hoje: o preço do fornecedor escolhido (Tabela de preços) ou o custo do Estoque.
 * Devolve a ficha nova e quantos itens mudaram (para avisar a pessoa).
 */
export function atualizarCustos(f: Ficha, insumos: Insumo[], cotacoes: Cotacao[] = [], guarnicoes: FixoFicha[] = [], copos: Recipiente[] = [], utensilios: Recipiente[] = []) {
  let mudou = 0;
  // copo e utensílios ligados aos cadastros acompanham nome e custo de hoje (apagados ficam como estavam)
  const copo = f.copoId ? copos.find((x) => x.id === f.copoId) : undefined;
  const copoNovo = copo ? { copo: copo.nome, copoCusto: copo.descartavel ? copo.custo : 0 } : { copo: f.copo, copoCusto: f.copoCusto };
  if (copoNovo.copo !== f.copo || Math.abs(copoNovo.copoCusto - f.copoCusto) > 1e-9) mudou++;
  const utens = f.utensilios.map((u) => {
    const r = u.id ? utensilios.find((x) => x.id === u.id) : undefined;
    if (!r || r.nome === u.nome) return u;
    mudou++;
    return { ...u, nome: r.nome };
  });
  // itens fixos pegam o valor de hoje do cadastro (apagados ficam com o último valor)
  const fixos = f.fixos.map((x) => {
    const g = guarnicoes.find((y) => y.id === x.id);
    if (!g || (Math.abs(g.custo - Number(x.custo)) < 1e-9 && g.nome === x.nome)) return x;
    mudou++;
    return { ...x, nome: g.nome, custo: g.custo };
  });
  const itens = f.itens.map((i) => {
    if (!i.insumoId) return i;
    const c = i.precoId ? cotacoes.find((x) => x.id === i.precoId) : undefined;
    const e = insumos.find((x) => x.id === i.insumoId);
    // preço de fornecedor apagado ou desativado: volta para o custo do Estoque
    const novo = c ? { custoBase: c.preco / c.conteudo, unidadeBase: c.unidade, precoId: c.id, fornecedor: c.nome }
      : e ? { custoBase: e.custo, unidadeBase: e.unidade, precoId: null, fornecedor: '' } : null;
    if (!novo) return i;
    if (Math.abs(novo.custoBase - Number(i.custoBase)) < 1e-9 && novo.unidadeBase === i.unidadeBase && (novo.precoId ?? null) === (i.precoId ?? null)) return i;
    mudou++;
    const unidade = unidadesCompativeis(novo.unidadeBase).includes(i.unidade) ? i.unidade : novo.unidadeBase;
    return { ...i, ...novo, unidade };
  });
  return { ficha: { ...f, ...copoNovo, utensilios: utens, itens, fixos }, mudou };
}

/* ---------- preparo ---------- */

/** Utensílios de costume para cada técnica (sugeridos ao gerar o passo a passo). */
export const UTENSILIOS_DA_TECNICA: Record<string, string[]> = {
  Montado: ['Dosador (jigger)', 'Bailarina'],
  Batido: ['Coqueteleira', 'Dosador (jigger)', 'Peneira (strainer)'],
  Mexido: ['Mixing glass', 'Bailarina', 'Dosador (jigger)', 'Peneira (strainer)'],
  Macerado: ['Socador', 'Dosador (jigger)', 'Bailarina'],
  Liquidificador: ['Liquidificador', 'Dosador (jigger)'],
};

const qtdTxt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
/** "a, b e c" */
const juntarLista = (l: string[]) => (l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
const comQtd = (i: ItemFicha) => `${qtdTxt(Number(i.quantidade) || 0)} ${i.unidade} de ${i.insumo}`;

/**
 * Rascunho do passo a passo a partir da técnica, dos insumos, do copo e das guarnições marcadas.
 * A pessoa revisa e ajusta; é só um ponto de partida.
 */
export function gerarPassos(f: Ficha): string[] {
  const copo = f.copo.trim() ? f.copo.trim().replace(/^copo /i, 'copo ') : 'copo';
  const noCopo = /^(taça|caneca|tulipa|jarra)/i.test(copo) ? `na ${copo.toLowerCase()}` : `no ${copo.toLowerCase()}`;
  const temGelo = f.fixos.some((x) => /gelo/i.test(x.nome));
  const guarnicoes = f.fixos.filter((x) => !/gelo|canudo/i.test(x.nome)).map((x) => x.nome.toLowerCase());
  const itens = f.itens.filter((i) => i.insumo.trim() && Number(i.quantidade) > 0);
  const liquidos = itens.filter((i) => ['ml', 'L', 'dose'].includes(i.unidade));
  const solidos = itens.filter((i) => !['ml', 'L', 'dose'].includes(i.unidade));
  const todos = juntarLista(itens.map(comQtd)) || 'os ingredientes';
  const fim = [
    ...(guarnicoes.length ? [`Finalize com ${juntarLista(guarnicoes)}.`] : []),
    ...(f.fixos.some((x) => /canudo/i.test(x.nome)) ? ['Sirva com canudo.'] : []),
  ];
  switch (f.tecnica) {
    case 'Batido':
      return [`Coloque ${todos} na coqueteleira com gelo.`, 'Bata vigorosamente por cerca de 10 segundos.', `Coe ${noCopo}${temGelo ? ' com gelo novo' : ''}.`, ...fim];
    case 'Mexido':
      return [`Coloque ${todos} no mixing glass com gelo.`, 'Mexa com a bailarina por cerca de 20 segundos.', `Coe ${noCopo}${temGelo ? ' com gelo' : ''}.`, ...fim];
    case 'Macerado':
      return [
        solidos.length ? `${noCopo[0].toUpperCase()}${noCopo.slice(1)}, macere ${juntarLista(solidos.map(comQtd))}.` : `Macere os ingredientes ${noCopo}.`,
        temGelo ? 'Complete com gelo.' : '',
        liquidos.length ? `Adicione ${juntarLista(liquidos.map(comQtd))}.` : '',
        'Mexa com a bailarina.', ...fim,
      ].filter(Boolean);
    case 'Liquidificador':
      return [`Bata ${todos} no liquidificador${temGelo ? ' com gelo' : ''} até ficar homogêneo.`, `Sirva ${noCopo}.`, ...fim];
    default:
      const oCopo = noCopo.replace(/^n/, '');
      return [temGelo ? `Encha ${oCopo} com gelo.` : `Separe ${oCopo}.`, `Adicione ${todos}.`, 'Mexa levemente com a bailarina.', ...fim];
  }
}
