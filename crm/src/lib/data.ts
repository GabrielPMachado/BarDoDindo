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
    // a cada 1 s: o sinal de mudança vem dos dados que já chegam ao vivo do Firestore, sem leituras extras
    if (watching()) setTimeout(tick, 1000);
  };
  tick();
}

/**
 * Versão nova publicada: a cada minuto confere se o site mudou (o nome do arquivo principal muda a cada publicação)
 * e recarrega sozinho, sem a pessoa precisar reiniciar o navegador. Nunca recarrega com uma janela aberta ou
 * um campo em edição: nesse caso tenta de novo no minuto seguinte.
 */
export function vigiarNovaVersao() {
  const atual = Array.from(document.scripts).map((s) => s.src).find((src) => /\/assets\/index-[^/]+\.js$/.test(src));
  if (!atual) return; // ambiente de desenvolvimento
  setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const html = await (await fetch(location.pathname, { cache: 'no-store' })).text();
      const nova = html.match(/assets\/index-[^"']+\.js/)?.[0];
      if (!nova || atual.endsWith(nova)) return;
      const editando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
      if (document.querySelector('.modal, .confirm, .ctx') || editando) return;
      location.reload();
    } catch {
      /* sem conexão: tenta de novo no próximo ciclo */
    }
  }, 60000);
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
