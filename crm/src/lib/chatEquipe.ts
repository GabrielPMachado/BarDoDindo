import { useEffect, useState, useSyncExternalStore } from 'react';
import { chatEquipe, type Colega, type ConversaEquipe } from './api';

/*
 * Chat interno da equipe: um único conjunto de listeners por aba (canal geral, conversas diretas da pessoa e o que ela já leu),
 * usado pelo aviso no topo e pela tela do chat. Liga quando alguém com acesso ao chat abre o CRM e desliga ao sair.
 */
interface Estado { conversas: ConversaEquipe[] | null; lidas: Record<string, string>; erro: boolean }
let estado: Estado = { conversas: null, lidas: {}, erro: false };
let parar: (() => void) | null = null;
let dono: string | null = null;
let usos = 0;
const avisos = new Set<() => void>();
const assinar = (fn: () => void) => (avisos.add(fn), () => avisos.delete(fn));
const mudar = (p: Partial<Estado>) => { estado = { ...estado, ...p }; avisos.forEach((f) => f()); };
const VAZIO: Estado = { conversas: null, lidas: {}, erro: false };

/** A conversa tem mensagem de outra pessoa depois da última vez que esta pessoa a abriu. */
export const temNovidade = (c: ConversaEquipe, uid: string, lidas: Record<string, string>) =>
  !!c.ultimoAutorId && c.ultimoAutorId !== uid && (!lidas[c.id] || c.ultimaEm > lidas[c.id]);

export function useChatEquipe(uid: string | null | undefined, ligado: boolean) {
  const ativo = ligado && !!uid;
  useEffect(() => {
    if (!ativo || !uid) return;
    if (usos++ === 0 || dono !== uid) {
      parar?.();
      dono = uid;
      estado = { ...VAZIO };
      const a = chatEquipe.ouvirConversas(uid, (conversas) => mudar({ conversas, erro: false }), () => mudar({ erro: true, conversas: estado.conversas ?? [] }));
      const b = chatEquipe.ouvirLidas(uid, (lidas) => mudar({ lidas }));
      parar = () => { a(); b(); };
    }
    return () => {
      if (--usos === 0) { parar?.(); parar = null; dono = null; estado = { ...VAZIO }; }
    };
  }, [ativo, uid]);
  const atual = useSyncExternalStore(assinar, () => (ativo ? estado : VAZIO));
  const novas = uid ? (atual.conversas ?? []).filter((c) => temNovidade(c, uid, atual.lidas)).length : 0;
  return { ...atual, novas };
}

// os colegas (usuários ativos) são lidos uma vez por sessão: dão o nome e a foto de quem está do outro lado
let colegasCache: Promise<Colega[]> | null = null;
export function useColegas() {
  const [colegas, setColegas] = useState<Colega[] | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    (colegasCache ??= chatEquipe.colegas().catch((e) => { colegasCache = null; throw e; }))
      .then((c) => vivo && setColegas(c)).catch(() => vivo && setErro(true));
    return () => { vivo = false; };
  }, []);
  return { colegas, erro };
}

