import { useState } from 'react';
import { api } from './api';
import { reload, useResource } from './data';

/** Como cada usuário quer o painel executivo: ordem dos blocos, os fixados no topo e os ocultos. */
export interface PainelPrefs {
  ordem: string[];
  fixados: string[];
  ocultos: string[];
  /** Páginas do CRM adicionadas ao painel (botão direito no menu → Adicionar ao painel). */
  atalhos: string[];
  /** Blocos do catálogo adicionados além dos padrões (botão "Adicionar bloco"). */
  extras: string[];
  /** Largura escolhida para cada bloco; os que não estão aqui usam o tamanho padrão do tipo. */
  tamanhos: Record<string, Tamanho>;
}

/** Largura de um bloco no painel: ¼, ½, ¾ ou a linha inteira. */
export type Tamanho = 'p' | 'm' | 'g' | 'c';
export const TAMANHOS: { valor: Tamanho; nome: string; fracao: string }[] = [
  { valor: 'p', nome: 'Pequeno', fracao: '¼' },
  { valor: 'm', nome: 'Médio', fracao: '½' },
  { valor: 'g', nome: 'Grande', fracao: '¾' },
  { valor: 'c', nome: 'Linha inteira', fracao: '1' },
];

const PATH = '/crm/preferencias';
const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const tamanhos = (v: unknown): Record<string, Tamanho> =>
  Object.fromEntries(Object.entries(v && typeof v === 'object' ? v : {}).filter(([, t]) => TAMANHOS.some((x) => x.valor === t))) as Record<string, Tamanho>;
const normalizar = (p?: Partial<PainelPrefs>): PainelPrefs => ({
  ordem: lista(p?.ordem), fixados: lista(p?.fixados), ocultos: lista(p?.ocultos), atalhos: lista(p?.atalhos), extras: lista(p?.extras), tamanhos: tamanhos(p?.tamanhos),
});

/** Qual painel: o executivo (Diretoria) ou o painel próprio de cada usuário (Meu perfil → Meu painel). */
export type PainelChave = 'painel' | 'meuPainel';

/** Preferências de um painel, salvas na conta do usuário (valem em qualquer computador). */
export function usePainelPrefs(chave: PainelChave = 'painel') {
  const { data, loading } = useResource<Partial<Record<PainelChave, Partial<PainelPrefs>>>>(PATH);
  // mostra a mudança na hora; a cópia salva substitui esta assim que volta do servidor
  const [local, setLocal] = useState<PainelPrefs | null>(null);
  const prefs = local ?? normalizar(data?.[chave]);

  const salvar = async (painel: PainelPrefs) => {
    setLocal(painel);
    try {
      await api(PATH, { method: 'PUT', body: { [chave]: painel } });
      await reload(PATH);
    } finally {
      setLocal(null);
    }
  };
  return { prefs, loading, salvar };
}

/** Identificador do bloco de atalho de uma página: "/atendimento/reservas" → "a-atendimento-reservas". */
export const atalhoId = (path: string) => 'a' + path.replace(/\//g, '-');

/** Adicionar ou remover uma página do painel; ao adicionar, o atalho já entra fixado no topo. */
export function alternarAtalho(prefs: PainelPrefs, path: string): PainelPrefs {
  const id = atalhoId(path);
  if (prefs.atalhos.includes(path)) {
    return { ...prefs, atalhos: prefs.atalhos.filter((p) => p !== path), fixados: prefs.fixados.filter((x) => x !== id), ocultos: prefs.ocultos.filter((x) => x !== id) };
  }
  return { ...prefs, atalhos: [...prefs.atalhos, path], fixados: [...prefs.fixados.filter((x) => x !== id), id], ocultos: prefs.ocultos.filter((x) => x !== id) };
}
