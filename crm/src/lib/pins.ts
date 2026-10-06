import { useEffect, useState } from 'react';
import { api } from './api';
import { reload, useResource } from './data';
import { notify } from '../components/ui';

/** Páginas fixadas na barra superior, salvas na conta do usuário (valem em qualquer computador). */
const PATH = '/crm/preferencias';
// onde os fixados ficavam antes (só neste navegador); são levados para a conta no primeiro acesso
const chaveAntiga = (uid: string) => `dindo-crm:fixados:${uid}`;

function lerAntigos(uid: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(chaveAntiga(uid)) ?? '[]');
    return Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function usePins(uid: string | undefined) {
  const { data, loading } = useResource<{ paginas?: string[] }>(PATH);
  const salvos = Array.isArray(data?.paginas) ? data.paginas : null;
  // mostra a mudança na hora; a cópia salva substitui esta assim que volta do servidor
  const [local, setLocal] = useState<string[] | null>(null);
  const pins = local ?? salvos ?? [];

  const save = async (next: string[]) => {
    setLocal(next);
    try {
      await api(PATH, { method: 'PUT', body: { paginas: next } });
      await reload(PATH);
      if (uid) try { localStorage.removeItem(chaveAntiga(uid)); } catch { /* ignora */ }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível salvar as páginas fixadas.', 'error');
    } finally {
      setLocal(null);
    }
  };

  // conta ainda sem fixados salvos: traz os que estavam guardados neste navegador
  useEffect(() => {
    if (!uid || loading || salvos) return;
    const antigos = lerAntigos(uid);
    if (antigos.length) void save(antigos);
  }, [uid, loading, salvos === null]);

  return {
    pins,
    isPinned: (path: string) => pins.includes(path),
    toggle: (path: string) => save(pins.includes(path) ? pins.filter((p) => p !== path) : [...pins, path]),
    unpin: (path: string) => save(pins.filter((p) => p !== path)),
  };
}
