import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

export type Row = { id: string; criadoEm?: string; atualizadoEm?: string } & Record<string, unknown>;

interface Entry {
  data: unknown;
  loading: boolean;
  error: string | null;
  loaded: boolean;
  promise?: Promise<void>;
}

/** Cache compartilhado de recursos da API (coleções e endpoints próprios). */
const store = new Map<string, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function entry(path: string): Entry {
  let e = store.get(path);
  if (!e) {
    e = { data: undefined, loading: false, error: null, loaded: false };
    store.set(path, e);
  }
  return e;
}

export function reload(path: string) {
  const e = entry(path);
  e.loading = true;
  e.promise = api<unknown>(path)
    .then((d) => {
      store.set(path, { data: d, loading: false, error: null, loaded: true });
    })
    .catch((err: Error) => {
      store.set(path, { ...entry(path), loading: false, error: err.message, loaded: true });
    })
    .finally(emit);
  store.set(path, { ...e });
  emit();
  return e.promise;
}

/** Limpa o cache (ex.: ao trocar de usuário). */
export function clearCache() {
  store.clear();
  emit();
}

export function useResource<T>(path: string | null) {
  const snap = useSyncExternalStore(subscribe, () => (path ? entry(path) : null));
  useEffect(() => {
    if (!path) return;
    // sempre revalida ao abrir a tela; mantém os dados atuais enquanto recarrega
    if (!entry(path).loading) reload(path);
    const refresh = () => document.visibilityState === 'visible' && !entry(path).loading && reload(path);
    const timer = setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [path]);
  return {
    data: (snap?.data as T | undefined) ?? undefined,
    loading: !snap?.loaded,
    error: snap?.error ?? null,
    reload: useCallback(() => (path ? reload(path) : Promise.resolve()), [path]),
  };
}

/** `desde` (AAAA-MM-DD): carrega só os registros a partir dessa data (receitas, despesas, consumos e reservas). */
export function useCollection<T extends Row = Row>(name: string, enabled = true, desde?: string) {
  const base = `/crm/c/${name}`;
  const path = enabled ? (desde ? `${base}?desde=${desde}` : base) : null;
  const res = useResource<T[]>(path);
  return {
    rows: res.data ?? [],
    loading: res.loading && enabled,
    error: res.error,
    reload: res.reload,
    add: async (data: Partial<T>) => {
      const row = await api<T>(base, { method: 'POST', body: data });
      await reload(path ?? base);
      return row;
    },
    update: async (id: string, data: Partial<T>) => {
      const row = await api<T>(`${base}/${id}`, { method: 'PUT', body: data });
      await reload(path ?? base);
      return row;
    },
    remove: async (id: string) => {
      await api(`${base}/${id}`, { method: 'DELETE' });
      await reload(path ?? base);
    },
  };
}

/* ---------- atualização ao vivo ---------- */
let generation = 0;
let lastSync: Date | null = null;
const syncListeners = new Set<() => void>();

/** Consulta o sinal de mudança do servidor e recarrega os dados abertos quando algo muda. */
export function startLiveUpdates() {
  const mine = ++generation;
  const watching = () => mine === generation;
  let last: number | null = null;
  const tick = async () => {
    if (!watching()) return;
    try {
      if (document.visibilityState === 'visible') {
        const { versao } = await api<{ versao: number }>('/crm/versao');
        if (last !== null && versao !== last) {
          for (const [path, e] of store) if (e.loaded && !e.loading) reload(path);
        }
        last = versao;
        lastSync = new Date();
        syncListeners.forEach((l) => l());
      }
    } catch {
      /* servidor indisponível: tenta de novo no próximo ciclo */
    }
    if (watching()) setTimeout(tick, 2000);
  };
  tick();
}

export function stopLiveUpdates() {
  generation++;
}

export function useLastSync() {
  return useSyncExternalStore(
    (l) => {
      syncListeners.add(l);
      return () => syncListeners.delete(l);
    },
    () => lastSync,
  );
}
