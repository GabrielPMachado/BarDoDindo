/**
 * Acesso aos dados do CRM. Não há servidor próprio: as rotas (`/crm/...`) são atendidas
 * no navegador, sobre Firebase Auth + Firestore (ver `shared/backend.ts`).
 */
import { ApiError, createBackend } from '../../../shared/backend';


const backend = createBackend('crm');

/** Identificador da sessão atual; só é confiável depois da primeira chamada a `api`. */
export const getToken = () => backend.uid();
/** A sessão é guardada pelo Firebase; aqui só é possível encerrá-la. */
export function setToken(token: string | null) {
  if (!token) void backend.sair();
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

/** Sessão expirada (401) leva ao login, como em qualquer chamada do CRM. */
async function comSessao<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && getToken()) onUnauthorized?.();
    throw e;
  }
}

/** Documentos em PDF dos cadastros: anexar e obter o arquivo. */
export const anexos = {
  enviar: (col: string, registroId: string, arquivo: File) => comSessao(() => backend.anexos.enviar(col, registroId, arquivo)),
  baixar: (col: string, anexoId: string) => comSessao(() => backend.anexos.baixar(col, anexoId)),
};

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await backend.request<T>(path, options);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && getToken()) onUnauthorized?.();
    throw e;
  }
}
