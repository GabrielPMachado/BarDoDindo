import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { clearCache } from './data';
import { acoesDe, acoesNaArea, resumoAcesso, type Acao, type Access } from '../modules';

export interface Funcao {
  id: string;
  nome: string;
  descricao: string;
  /** Por módulo (tela ou cadastro) — ou, no formato antigo, por área: lista de permissões (ou o nível "view"/"edit"). */
  permissoes: Record<string, Acao[] | 'view' | 'edit' | 'none'>;
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
  telefone?: string;
  nascimento?: string;
  sobre?: string;
  /** Foto do perfil (imagem pequena, já reduzida). */
  foto?: string | null;
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
  access: (modulo: string) => Access;
  /** Se a função do usuário tem uma permissão (ver, criar, editar, excluir) na área. */
  pode: (modulo: string, acao: Acao) => boolean;
  /** Acabou de entrar (login ou primeiro acesso): mostra a tela de boas-vindas até ser dispensada. */
  boasVindas: boolean;
  dispensarBoasVindas: () => void;
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
  const [boasVindas, setBoasVindas] = useState(false);

  const reset = useCallback(() => {
    setToken(null);
    setUsuario(null);
    setFuncao(null);
    setBoasVindas(false);
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

  // "Meu perfil" é de todo usuário; a Presidência (função de sistema) tem tudo; as demais áreas dependem da função
  const acoes = (modulo: string): Acao[] => (modulo === 'eu' || funcao?.sistema ? acoesDe('edit') : acoesNaArea(funcao?.permissoes as Record<string, unknown> | undefined, modulo));
  const access = (modulo: string): Access => resumoAcesso(acoes(modulo));

  const value: Session = {
    ready,
    setupPendente,
    usuario,
    funcao,
    serverError,
    refresh,
    // a Presidência (função de sistema) tem acesso total, inclusive a áreas criadas depois
    access,
    pode: (area, acao) => acoes(area).includes(acao),
    boasVindas,
    dispensarBoasVindas: () => setBoasVindas(false),
    login: async (email, senha) => {
      const { token } = await api<{ token: string }>('/crm/login', { method: 'POST', body: { email, senha } });
      clearCache();
      setToken(token);
      await refresh();
      setBoasVindas(true);
    },
    setup: async (nome, email, senha) => {
      const { token } = await api<{ token: string }>('/crm/setup', { method: 'POST', body: { nome, email, senha } });
      setToken(token);
      await refresh();
      setBoasVindas(true);
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
