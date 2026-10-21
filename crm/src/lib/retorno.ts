import type { Row } from './data';

/**
 * Previsão do retorno de cada sócio/investidor. É uma estimativa: parte do resultado (DRE) e de premissas
 * que a pessoa ajusta na tela. As regras seguem o Código Civil (lucros proporcionais às quotas, só lucro real),
 * o CTN (IR sobre o lucro real ou presumido) e a tributação de dividendos na pessoa física.
 */
export type Regime = 'simples' | 'presumido' | 'real';

export interface Premissas {
  regime: Regime;
  /** De onde vem o resultado: média do DRE ou valores digitados. */
  origem: 'dre' | 'manual';
  receitaMensal: number | '';
  despesasMensal: number | '';
  /** Usar os impostos já lançados nas despesas (categoria Impostos) em vez de estimar pelo regime. */
  usarLancados: boolean;
  /** % sobre a receita; null = sugestão do regime. */
  tributosReceita: number | null;
  /** % sobre o lucro; null = sugestão do regime. */
  tributosLucro: number | null;
  /** Provisão para riscos trabalhistas (CLT) e de consumidores (CDC), em % do lucro líquido. */
  contingencias: number;
  /** Reserva de lucros / reinvestimento prevista no contrato social, em % do que sobra. */
  reserva: number;
  /** IR retido sobre os lucros pagos a cada pessoa física acima do limite mensal. */
  irDividendos: number;
  limiteMensal: number;
}

export const PREMISSAS_PADRAO: Premissas = {
  regime: 'simples', origem: 'dre', receitaMensal: '', despesasMensal: '', usarLancados: false,
  tributosReceita: null, tributosLucro: null, contingencias: 0, reserva: 5, irDividendos: 10, limiteMensal: 50_000,
};

export const REGIMES: { valor: Regime; nome: string; explica: string }[] = [
  { valor: 'simples', nome: 'Simples Nacional', explica: 'DAS sobre a receita, com a alíquota efetiva do Anexo I (comércio, bares e restaurantes) pela receita dos últimos 12 meses. Já inclui IRPJ, CSLL, PIS, Cofins, ICMS e a contribuição patronal.' },
  { valor: 'presumido', nome: 'Lucro Presumido', explica: 'PIS 0,65% + Cofins 3% + IRPJ 15% sobre 8% da receita + CSLL 9% sobre 12% da receita = 5,93% da receita. ICMS/ISS e o adicional de IRPJ ficam de fora; some no percentual se quiser.' },
  { valor: 'real', nome: 'Lucro Real', explica: 'PIS e Cofins não cumulativos de 9,25% sobre a receita (sem contar créditos) e IRPJ 15% + CSLL 9% sobre o lucro, mais o adicional de 10% do IRPJ sobre o lucro acima de R$ 240 mil por ano.' },
];

/** Faixas do Anexo I do Simples (LC 123/2006): até a receita de 12 meses, alíquota nominal e parcela a deduzir. */
const ANEXO_I: [number, number, number][] = [
  [180_000, 4, 0], [360_000, 7.3, 5_940], [720_000, 9.5, 13_860],
  [1_800_000, 10.7, 22_500], [3_600_000, 14.3, 87_300], [4_800_000, 19, 378_000],
];

/** Alíquota efetiva do Simples (Anexo I) para uma receita bruta de 12 meses, em %. */
export function aliquotaSimples(rbt12: number) {
  if (!(rbt12 > 0)) return 4;
  const [, nominal, deduzir] = ANEXO_I.find(([teto]) => rbt12 <= teto) ?? ANEXO_I[ANEXO_I.length - 1];
  return Math.max(0, (rbt12 * nominal / 100 - deduzir) / rbt12 * 100);
}

/** Percentuais sugeridos para o regime (sobre a receita e sobre o lucro). */
export function sugestaoTributos(regime: Regime, receitaAnual: number) {
  if (regime === 'simples') return { receita: aliquotaSimples(receitaAnual), lucro: 0 };
  if (regime === 'presumido') return { receita: 5.93, lucro: 0 };
  return { receita: 9.25, lucro: 24 };
}

/** Média mensal de receitas, despesas e impostos lançados nos últimos meses com movimento. */
export function mediaDre(receitas: Row[], despesas: Row[], meses: string[]) {
  const doMes = (rows: Row[], m: string) => rows.filter((r) => String(r.data ?? '').slice(0, 7) === m);
  const soma = (rows: Row[]) => rows.reduce((t, r) => t + (Number(r.valor) || 0), 0);
  const comMovimento = meses.filter((m) => doMes(receitas, m).length || doMes(despesas, m).length);
  const n = comMovimento.length || 1;
  const nos = (rows: Row[]) => comMovimento.flatMap((m) => doMes(rows, m));
  return {
    meses: comMovimento,
    receita: soma(nos(receitas)) / n,
    despesas: soma(nos(despesas)) / n,
    impostos: soma(nos(despesas).filter((r) => r.categoria === 'Impostos')) / n,
  };
}

export interface Base { receitaMensal: number; despesasMensal: number; impostosMensal: number }

/** Do resultado ao lucro que pode ser distribuído no ano. */
export function calcularEmpresa(p: Premissas, b: Base) {
  const receita = b.receitaMensal * 12;
  const sug = sugestaoTributos(p.regime, receita);
  const tr = p.tributosReceita ?? sug.receita;
  const tl = p.tributosLucro ?? sug.lucro;
  // com os impostos lançados, o DRE já é o lucro líquido; senão, tira os impostos lançados e estima pelo regime
  const despesas = (p.usarLancados ? b.despesasMensal : b.despesasMensal - b.impostosMensal) * 12;
  const antesTributos = receita - despesas;
  let tributos = p.usarLancados ? 0 : receita * tr / 100;
  if (!p.usarLancados) {
    const baseLucro = Math.max(0, antesTributos - tributos);
    tributos += baseLucro * tl / 100;
    if (p.regime === 'real' && p.tributosLucro === null) tributos += Math.max(0, baseLucro - 240_000) * 0.1;
  }
  const lucroLiquido = antesTributos - tributos;
  const contingencias = Math.max(0, lucroLiquido) * p.contingencias / 100;
  const reserva = Math.max(0, lucroLiquido - contingencias) * p.reserva / 100;
  const distribuivel = Math.max(0, lucroLiquido - contingencias - reserva);
  return { receita, despesas, antesTributos, tributos, tributosLancados: b.impostosMensal * 12, tr, tl, sug, lucroLiquido, contingencias, reserva, distribuivel };
}

export interface Previsao {
  id: string; nome: string; tipo: string; participacao: number | null; aporte: number;
  bruto: number; ir: number; liquido: number; mensal: number; retorno: number | null; payback: number | null;
}

/** Participação de cada um: a cadastrada ou, sem ela, a proporção das cotas. */
export function participacoes(rows: Row[]) {
  const ativos = rows.filter((r) => r.status !== 'Inativo');
  const cotas = ativos.reduce((t, r) => t + (Number(r.quantidade) || 0), 0);
  return ativos.map((r) => {
    const pc = Number(r.participacao);
    const q = Number(r.quantidade);
    return { r, participacao: pc > 0 ? pc : cotas > 0 && q > 0 ? q / cotas * 100 : null, pelasCotas: !(pc > 0) && cotas > 0 && q > 0 };
  });
}

/** Quanto cada sócio recebe no ano: a parte do lucro distribuível, menos o IR retido acima do limite mensal. */
export function preverInvestidores(rows: Row[], distribuivel: number, p: Premissas): Previsao[] {
  return participacoes(rows).map(({ r, participacao }) => {
    const bruto = participacao ? distribuivel * participacao / 100 : 0;
    const mensalBruto = bruto / 12;
    const ir = Math.max(0, mensalBruto - p.limiteMensal) * p.irDividendos / 100 * 12;
    const liquido = bruto - ir;
    const aporte = Number(r.aporte) || 0;
    return {
      id: r.id, nome: String(r.nome ?? ''), tipo: String(r.tipo ?? ''), participacao, aporte,
      bruto, ir, liquido, mensal: liquido / 12,
      retorno: aporte > 0 ? liquido / aporte : null,
      payback: aporte > 0 && liquido > 0 ? aporte / liquido : null,
    };
  });
}
