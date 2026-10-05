import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { clearCache } from './data';
import type { Access, AreaKey } from '../modules';

export interface Funcao {
  id: string;
  nome: string;
  descricao: string;
  permissoes: Partial<Record<AreaKey, Access>>;
  sistema?: boolean;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  funcaoId: string;
  status: 'Ativo' | 'Inativo';
  ultimoAcesso?: string | null;
  criadoEm?: string;
}

export interface Config {
  nomeEstabelecimento: string;
  pontosPorReal: number;
  horarios: string[];
  ambientes: string[];
  diasFuncionamento: number[];
  antecedenciaMinutos: number;
  niveis: { nome: string; minimo: number }[];
  faixasInss: { ate: number; aliquota: number }[];
  aliquotaFgts: number;
}

interface Session {
  ready: boolean;
  setupPendente: boolean;
  usuario: Usuario | null;
  funcao: Funcao | null;
  access: (area: AreaKey) => Access;
  login: (email: string, senha: string) => Promise<void>;
  setup: (nome: string, email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  serverError: string | null;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [setupPendente, setSetupPendente] = useState(false);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [funcao, setFuncao] = useState<Funcao | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setToken(null);
    setUsuario(null);
    setFuncao(null);
    clearCache();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { pendente } = await api<{ pendente: boolean }>('/crm/setup');
      setSetupPendente(pendente);
      if (getToken()) {
        const me = await api<{ usuario: Usuario; funcao: Funcao | null }>('/crm/me');
        setUsuario(me.usuario);
        setFuncao(me.funcao);
      }
      setServerError(null);
    } catch (e) {
      if (!getToken()) setServerError(e instanceof Error ? e.message : 'Servidor indisponível.');
      else reset();
    } finally {
      setReady(true);
    }
  }, [reset]);

  useEffect(() => {
    setUnauthorizedHandler(reset);
    refresh();
  }, [refresh, reset]);

  const value: Session = {
    ready,
    setupPendente,
    usuario,
    funcao,
    serverError,
    refresh,
    // a função Administrador (de sistema) tem acesso total, inclusive a áreas criadas depois
    access: (area) => (funcao?.sistema ? 'edit' : funcao?.permissoes?.[area] ?? 'none'),
    login: async (email, senha) => {
      const { token } = await api<{ token: string }>('/crm/login', { method: 'POST', body: { email, senha } });
      clearCache();
      setToken(token);
      await refresh();
    },
    setup: async (nome, email, senha) => {
      const { token } = await api<{ token: string }>('/crm/setup', { method: 'POST', body: { nome, email, senha } });
      setToken(token);
      await refresh();
    },
    logout: async () => {
      await api('/crm/logout', { method: 'POST' }).catch(() => undefined);
      reset();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession fora do SessionProvider');
  return s;
}
