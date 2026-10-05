import { useCallback, useEffect, useState } from 'react';

/** Páginas fixadas no topo, guardadas neste navegador para cada usuário. */
const key = (uid: string) => `dindo-crm:fixados:${uid}`;

function read(uid: string | undefined): string[] {
  if (!uid) return [];
  try {
    const v = JSON.parse(localStorage.getItem(key(uid)) ?? '[]');
    return Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

export function usePins(uid: string | undefined) {
  const [pins, setPins] = useState<string[]>(() => read(uid));
  useEffect(() => setPins(read(uid)), [uid]);

  const save = useCallback((next: string[]) => {
    setPins(next);
    if (!uid) return;
    try {
      localStorage.setItem(key(uid), JSON.stringify(next));
    } catch {
      /* armazenamento indisponível: os fixados valem só até recarregar */
    }
  }, [uid]);

  return {
    pins,
    isPinned: (path: string) => pins.includes(path),
    toggle: (path: string) => save(pins.includes(path) ? pins.filter((p) => p !== path) : [...pins, path]),
    unpin: (path: string) => save(pins.filter((p) => p !== path)),
  };
}
