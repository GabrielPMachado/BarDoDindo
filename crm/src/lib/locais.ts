/**
 * Quantidade de cada item por local (Bar: 2, Depósito: 6…). O cadastro guarda `locais` e, por compatibilidade
 * com o resto do sistema (painel, valor em estoque, ficha técnica), também o total em `quantidade`.
 */
import type { Row } from './data';

export const LOCAIS = ['Bar', 'Salão', 'Cozinha', 'Depósito', 'Escritório', 'Área externa'];
export type Locais = Record<string, number>;

const arred = (v: number) => Math.round(v * 1000) / 1000;

/** Locais do registro; os antigos (só `quantidade` e `local`) viram um local só. */
export function locaisDe(r: Partial<Row> | Record<string, unknown>): Locais {
  const l = r.locais;
  if (l && typeof l === 'object' && !Array.isArray(l)) {
    const out: Locais = {};
    for (const [k, v] of Object.entries(l as Record<string, unknown>)) if (Number(v) > 0) out[k] = arred(Number(v));
    return out;
  }
  const q = Number(r.quantidade) || 0;
  return q > 0 ? { [String(r.local || 'Depósito')]: q } : {};
}

/** Para o formulário: mantém os locais recém-adicionados (ainda com 0) enquanto a pessoa digita. */
export function locaisNoFormulario(r: Record<string, unknown>): Locais {
  const l = r.locais;
  if (l && typeof l === 'object' && !Array.isArray(l)) {
    return Object.fromEntries(Object.entries(l as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0]));
  }
  return locaisDe(r);
}

export const totalLocais = (l: Locais) => arred(Object.values(l).reduce((t, v) => t + (Number(v) || 0), 0));

/** Onde tem mais (vai para o campo "Local" dos materiais). */
export const localPrincipal = (l: Locais) => Object.entries(l).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

export function resumoLocais(l: Locais) {
  const e = Object.entries(l).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return e.map(([k, v]) => `${k} ${v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`).join(' · ');
}

/** Soma (ou tira, com quantidade negativa) num local, sem deixar negativo. */
export function somarNoLocal(l: Locais, local: string, qtd: number): Locais {
  const novo = { ...l, [local]: arred(Math.max(0, (l[local] ?? 0) + qtd)) };
  if (!novo[local]) delete novo[local];
  return novo;
}

/** Dados a gravar no registro a partir dos locais. */
export const camposDosLocais = (l: Locais, comLocal: boolean) => ({
  locais: l, quantidade: totalLocais(l), ...(comLocal ? { local: localPrincipal(l) } : {}),
});
