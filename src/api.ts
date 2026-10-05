/**
 * Acesso aos dados do Bar do Dindo. Não há servidor próprio: as rotas (`/app/...`, `/public/...`)
 * são atendidas no próprio aparelho, sobre Firebase Auth + Firestore (ver `shared/backend.ts`).
 */
import { ApiError, createBackend } from '../shared/backend';

export { ApiError };

const backend = createBackend('app');

/** Identificador da sessão atual; só é confiável depois da primeira chamada a `api`. */
export const getToken = () => backend.uid();
/** A sessão é guardada pelo Firebase; aqui só é possível encerrá-la. */
export function setToken(token: string | null) {
  if (!token) void backend.sair();
}

export const api = backend.request;
