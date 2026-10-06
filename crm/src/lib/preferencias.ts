import { useState } from 'react';
import { api } from './api';
import { reload, useResource } from './data';

/** Como cada usuário quer o painel executivo: ordem dos blocos, os fixados no topo e os ocultos. */
export interface PainelPrefs {
  ordem: string[];
  fixados: string[];
  ocultos: string[];
}

const PATH = '/crm/preferencias';
const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const normalizar = (p?: Partial<PainelPrefs>): PainelPrefs => ({ ordem: lista(p?.ordem), fixados: lista(p?.fixados), ocultos: lista(p?.ocultos) });

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
