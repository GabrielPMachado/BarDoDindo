import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessagesSquare, X } from 'lucide-react';
import { temNovidade, useChatEquipe } from '../lib/chatEquipe';
import { useSession } from '../lib/session';

interface Aviso { chave: string; conversa: string; geral: boolean; autor: string; texto: string }
const CHAT = '/equipe/chat';
const DURACAO = 10000;

/**
 * Aviso piscando no canto da tela quando chega mensagem no chat da equipe, em qualquer tela do Cérebro.
 * Não lê nada a mais: usa os resumos das conversas que já ficam ao vivo para o contador do topo.
 * Com a aba em segundo plano, o título da aba também pisca até a pessoa voltar.
 */
export function AvisoChatEquipe() {
  const { usuario, access } = useSession();
  const eu = usuario?.id ?? '';
  const { conversas, lidas } = useChatEquipe(eu, access('chat') !== 'none');
  const navigate = useNavigate();
  const local = useLocation();
  const onde = useRef(local);
  onde.current = local;
  // a última mensagem já vista de cada conversa: o que estava lá ao abrir o Cérebro não vira aviso
  const vistas = useRef<Map<string, string> | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    if (!conversas || !eu) return;
    if (!vistas.current) {
      vistas.current = new Map(conversas.map((c) => [c.id, c.ultimaId]));
      return;
    }
    const novos: Aviso[] = [];
    for (const c of conversas) {
      const antes = vistas.current.get(c.id);
      vistas.current.set(c.id, c.ultimaId);
      if (!c.ultimaId || antes === c.ultimaId || !temNovidade(c, eu, lidas)) continue;
      // a conversa já está aberta na tela: a mensagem aparece lá mesmo
      const { pathname, search } = onde.current;
      if (pathname === CHAT && new URLSearchParams(search).get('c') === c.id && document.visibilityState === 'visible') continue;
      novos.push({ chave: `${c.id}:${c.ultimaId}`, conversa: c.id, geral: c.tipo === 'geral', autor: c.ultimoAutorNome || 'Colega', texto: c.ultimaMensagem });
    }
    if (novos.length) setAvisos((a) => [...a.filter((x) => !novos.some((n) => n.conversa === x.conversa)), ...novos].slice(-3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, eu]);

  // cada aviso some sozinho depois de alguns segundos
  useEffect(() => {
    if (!avisos.length) return;
    const t = setTimeout(() => setAvisos((a) => a.slice(1)), DURACAO);
    return () => clearTimeout(t);
  }, [avisos]);

  // aba em segundo plano: o título pisca até a pessoa voltar
  const ultimo = avisos[avisos.length - 1];
  useEffect(() => {
    if (!ultimo || document.visibilityState === 'visible') return;
    const original = document.title;
    const alerta = ultimo.geral ? `💬 ${ultimo.autor.split(' ')[0]} no Geral` : `💬 Mensagem de ${ultimo.autor.split(' ')[0]}`;
    let ligado = false;
    const i = setInterval(() => { ligado = !ligado; document.title = ligado ? alerta : original; }, 1000);
    const voltar = () => { if (document.visibilityState === 'visible') parar(); };
    const parar = () => { clearInterval(i); document.title = original; document.removeEventListener('visibilitychange', voltar); };
    document.addEventListener('visibilitychange', voltar);
    return parar;
  }, [ultimo?.chave]);

  if (!avisos.length) return null;
  const fechar = (chave: string) => setAvisos((a) => a.filter((x) => x.chave !== chave));
  return (
    <div className="aviso-chat" role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.chave} className="aviso-chat__item">
          <button type="button" className="aviso-chat__abrir" onClick={() => { fechar(a.chave); navigate(`${CHAT}?c=${a.conversa}`); }}>
            <span className="aviso-chat__icone"><MessagesSquare size={17} /></span>
            <span className="aviso-chat__texto">
              <strong>{a.geral ? `${a.autor} · Geral` : a.autor}</strong>
              <span>{a.texto}</span>
            </span>
          </button>
          <button type="button" className="aviso-chat__fechar" onClick={() => fechar(a.chave)} aria-label="Fechar aviso"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
