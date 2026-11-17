import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, NotebookPen, Search, Users } from 'lucide-react';
import { ErrorBox, Loading, Modal, notify } from './ui';
import { Avatar } from './Avatar';
import { chatEquipe, idConversaDireta, type LinkDoCerebro, type NotaCompartilhada } from '../lib/api';
import { useColegas } from '../lib/chatEquipe';
import { useSession } from '../lib/session';

/**
 * Manda algo para o chat da equipe: uma nota do bloco de notas ou o link de uma página do Cérebro ("pingar" o que foi feito).
 * Escolhe o canal geral ou um colega e, se quiser, escreve um comentário junto.
 */
export function EnviarAoChat({ nota, link, onClose, onEnviado }: {
  nota?: NotaCompartilhada; link?: LinkDoCerebro; onClose: () => void; onEnviado?: () => void;
}) {
  const { usuario, pode } = useSession();
  const eu = usuario?.id ?? '';
  const navigate = useNavigate();
  const { colegas, erro } = useColegas();
  const [q, setQ] = useState('');
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const term = q.trim().toLowerCase();
  const lista = (colegas ?? []).filter((c) => c.id !== eu && (!term || c.nome.toLowerCase().includes(term)));

  async function enviar(conversa: string, nome: string) {
    setEnviando(conversa);
    try {
      await chatEquipe.enviar(conversa, comentario, { nota, link });
      onClose();
      onEnviado?.();
      notify(`Enviado para ${nome}.`);
      navigate(`/equipe/chat?c=${conversa}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível enviar.', 'error');
      setEnviando(null);
    }
  }

  if (!pode('chat', 'criar')) {
    return (
      <Modal title="Mandar para o chat" onClose={onClose} width={440}>
        <p className="muted">Sua função não permite enviar mensagens no chat da equipe.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Mandar para o chat" onClose={onClose} width={460}>
      <div className="enviar-chat__anexo">
        {nota ? <NotebookPen size={16} /> : <Link2 size={16} />}
        <span><strong>{nota ? (nota.titulo || 'Nota sem título') : link?.titulo}</strong>{link?.detalhe && <small className="muted"> · {link.detalhe}</small>}</span>
      </div>
      <textarea className="input enviar-chat__comentario" rows={2} maxLength={1000} placeholder="Comentário (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
      <label className="search"><Search size={16} /><input placeholder="Buscar colega" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {erro && <ErrorBox>Não foi possível carregar a equipe.</ErrorBox>}
      <ul className="conversas__itens conversas__escolha">
        {!term && (
          <li>
            <button type="button" className="conversa-item conversa-item--equipe" disabled={!!enviando} onClick={() => enviar('geral', 'o Geral')}>
              <span className="chat-equipe__avatar chat-equipe__avatar--geral"><Users size={16} /></span>
              <span className="conversa-item__corpo"><strong>Geral (toda a equipe)</strong></span>
              {enviando === 'geral' && <small className="muted">Enviando…</small>}
            </button>
          </li>
        )}
        {!colegas && !erro ? <li><Loading /></li> : lista.map((c) => {
          const conversa = idConversaDireta(eu, c.id);
          return (
            <li key={c.id}>
              <button type="button" className="conversa-item conversa-item--equipe" disabled={!!enviando} onClick={() => enviar(conversa, c.nome.split(' ')[0])}>
                <Avatar className="chat-equipe__avatar" nome={c.nome} foto={c.foto} />
                <span className="conversa-item__corpo"><strong>{c.nome}</strong></span>
                {enviando === conversa && <small className="muted">Enviando…</small>}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
