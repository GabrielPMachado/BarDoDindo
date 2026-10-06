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
}

const PATH = '/crm/preferencias';
const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const normalizar = (p?: Partial<PainelPrefs>): PainelPrefs => ({ ordem: lista(p?.ordem), fixados: lista(p?.fixados), ocultos: lista(p?.ocultos), atalhos: lista(p?.atalhos), extras: lista(p?.extras) });

/** Preferências do painel, salvas na conta do usuário (valem em qualquer computador). */
export function usePainelPrefs() {
  const { data, loading } = useResource<{ painel?: Partial<PainelPrefs> }>(PATH);
  // mostra a mudança na hora; a cópia salva substitui esta assim que volta do servidor
  const [local, setLocal] = useState<PainelPrefs | null>(null);
  const prefs = local ?? normalizar(data?.painel);

  const salvar = async (painel: PainelPrefs) => {
    setLocal(painel);
    try {
      await api(PATH, { method: 'PUT', body: { painel } });
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
