import { useEffect, useSyncExternalStore } from 'react';
import { chat } from './api';

/*
 * Quantas conversas têm mensagem do afilhado ainda não lida: um único listener por aba, que só lê as conversas nessa
 * situação (1 leitura por mensagem nova). Liga quando alguém com acesso a Conversas abre o CRM e desliga ao sair.
 */
let naoLidas = 0;
let parar: (() => void) | null = null;
let usos = 0;
const avisos = new Set<() => void>();
const assinar = (fn: () => void) => (avisos.add(fn), () => avisos.delete(fn));

export function useNaoLidasConversas(ligado: boolean) {
  useEffect(() => {
    if (!ligado) return;
    if (usos++ === 0) parar = chat.ouvirNaoLidas((n) => { naoLidas = n; avisos.forEach((f) => f()); });
    return () => {
      if (--usos === 0) { parar?.(); parar = null; naoLidas = 0; }
    };
  }, [ligado]);
  return useSyncExternalStore(assinar, () => (ligado ? naoLidas : 0));
}
