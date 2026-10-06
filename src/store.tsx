import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, setToken } from './api';

export interface Config {
  nomeEstabelecimento: string;
  horarios: string[];
  ambientes: string[];
  diasFuncionamento: number[];
  antecedenciaMinutos: number;
  pontosPorReal: number;
  niveis: { nome: string; minimo: number }[];
}

export interface Produto {
  id: string;
  nome: string;
  categoria: string;
  descricao: string;
  preco: number;
  destaque: boolean;
}

export interface Recompensa {
  id: string;
  nome: string;
  descricao: string;
  custo: number;
}

export type ReservaStatus = 'Pendente' | 'Confirmada' | 'Recusada' | 'Cancelada pelo cliente' | 'Cancelada' | 'Concluída' | 'Não compareceu';

export interface Reservation {
  id: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:mm
  pessoas: number;
  ambiente: string;
  observacoes?: string;
  status: ReservaStatus;
}

export interface Consumption {
  id: string;
  itens: { nome: string; quantidade: number; preco: number; total: number }[];
  valor: number;
  pontos: number;
  data: string; // ISO
}

export interface Redemption {
  id: string;
  recompensa: string;
  custo: number;
  codigo: string;
  status: 'Disponível' | 'Utilizado' | 'Cancelado';
  data: string;
}

export interface Me {
  cliente: { id: number; numero: number; nome: string; email: string; telefone: string; foto: string | null; desde: string };
  pontos: number;
  acumulados: number;
  totalGasto: number;
  visitas: number;
  nivel: { atual: { nome: string; minimo: number }; proximo: { nome: string; minimo: number } | null };
  consumos: Consumption[];
  resgates: Redemption[];
  reservas: Reservation[];
}

interface Store {
  ready: boolean;
  me: Me | null;
  config: Config | null;
  cardapio: Produto[];
  recompensas: Recompensa[];
  error: string | null;
  login: (email: string, senha: string) => Promise<void>;
  cadastro: (dados: { nome: string; email: string; telefone: string; senha: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  criarReserva: (r: { data: string; hora: string; pessoas: number; ambiente: string; observacoes: string }) => Promise<Reservation>;
  cancelarReserva: (id: string) => Promise<void>;
  resgatar: (recompensaId: string) => Promise<Redemption>;
  atualizarPerfil: (dados: { nome?: string; telefone?: string; foto?: string | null }) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [cardapio, setCardapio] = useState<Produto[]>([]);
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadPublic = useCallback(async () => {
    const [c, p, r] = await Promise.all([
      api<Config>('/public/config'),
      api<Produto[]>('/public/cardapio'),
      api<Recompensa[]>('/public/recompensas'),
    ]);
    setConfig(c);
    setCardapio(p);
    setRecompensas(r);
  }, []);

  const loadMe = useCallback(async () => {
    try {
      setMe(await api<Me>('/app/me'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setToken(null);
        setMe(null);
      } else throw e;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadPublic(), loadMe()]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.');
    } finally {
      setReady(true);
    }
  }, [loadPublic, loadMe]);

  useEffect(() => {
    refresh();
    // atualiza ao voltar para o app (ex.: pontos lançados pelo bar)
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onFocus);
    // ao vivo: a cada 1 s pergunta se algo mudou (reserva confirmada, pontos, voucher entregue) e só então recarrega.
    // A pergunta é respondida pelos dados que já chegam em tempo real do Firestore, sem leituras extras.
    let ultima: number | null = null;
    const vigia = setInterval(async () => {
      if (document.visibilityState !== 'visible' || !getToken()) return;
      try {
        const { versao } = await api<{ versao: number }>('/app/versao');
        if (ultima !== null && versao !== ultima) refresh();
        ultima = versao;
      } catch {
        /* sem sessão ou sem conexão: tenta de novo no próximo ciclo */
      }
    }, 1000);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(vigia);
    };
  }, [refresh]);

  const store: Store = {
    ready,
    me,
    config,
    cardapio,
    recompensas,
    error,
    refresh,
    login: async (email, senha) => {
      const { token } = await api<{ token: string }>('/app/login', { method: 'POST', body: { email, senha } });
      setToken(token);
      await loadMe();
    },
    cadastro: async (dados) => {
      const { token } = await api<{ token: string }>('/app/cadastro', { method: 'POST', body: dados });
      setToken(token);
      await loadMe();
    },
    logout: async () => {
      await api('/app/logout', { method: 'POST' }).catch(() => undefined);
      setToken(null);
      setMe(null);
    },
    criarReserva: async (r) => {
      const res = await api<Reservation>('/app/reservas', { method: 'POST', body: r });
      await loadMe();
      return res;
    },
    cancelarReserva: async (id) => {
      await api(`/app/reservas/${id}/cancelar`, { method: 'POST' });
      await loadMe();
    },
    resgatar: async (recompensaId) => {
      const r = await api<Redemption>('/app/resgates', { method: 'POST', body: { recompensaId } });
      await loadMe();
      return r;
    },
    atualizarPerfil: async (dados) => {
      await api('/app/me', { method: 'PATCH', body: dados });
      await loadMe();
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do StoreProvider');
  return s;
}

/** Usuário logado (as telas internas só renderizam com sessão ativa). */
export function useMe() {
  const { me } = useStore();
  if (!me) throw new Error('useMe sem sessão');
  return me;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayISO = () => iso(new Date());
export const isoDate = iso;

/** Dia local (YYYY-MM-DD) de um timestamp ISO — evita deslocamento de fuso. */
export const dayKey = (isoStr: string) => iso(new Date(isoStr));

export function parseDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const ACTIVE_STATUS: ReservaStatus[] = ['Pendente', 'Confirmada'];

export function upcoming(reservations: Reservation[]) {
  const today = todayISO();
  return reservations
    .filter((r) => ACTIVE_STATUS.includes(r.status) && r.data >= today)
    .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
}

const WEEK = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export function dateParts(date: string) {
  const d = parseDate(date);
  return { week: WEEK[d.getDay()], day: d.getDate(), month: MONTHS[d.getMonth()] };
}

export function formatDateTime(isoStr: string) {
  const d = new Date(isoStr);
  const date = d.toLocaleDateString('pt-BR');
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} • ${time}`;
}

export const memberNumber = (n: number) => String(n).padStart(3, '0');
