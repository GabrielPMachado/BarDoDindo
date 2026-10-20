import { useState } from 'react';
import { MessageCircleQuestion, X } from 'lucide-react';
import { useStore } from '../store';

const chave = (n: number) => `dindo:questionario-depois:${n}`;
/** Mostra o convite do questionário opcional? (ativo, com perguntas, ainda não respondido e não adiado nesta semana) */
export function useQuestionario() {
  const { me, config } = useStore();
  const q = config?.questionario;
  const [adiado, setAdiado] = useState(() => {
    try { return Number(localStorage.getItem(chave(me?.cliente.numero ?? 0))) > Date.now(); } catch { return false; }
  });
  const mostrar = !!(q?.ativo && q.perguntas.length && me && !me.cliente.respostas && !adiado);
  const adiar = () => {
    setAdiado(true);
    try { localStorage.setItem(chave(me?.cliente.numero ?? 0), String(Date.now() + 7 * 86400000)); } catch { /* sem armazenamento: só nesta visita */ }
  };
  return { mostrar, adiar, questionario: q };
}

/** Questionário opcional do afilhado: perguntas curtas (texto ou opções), respondidas uma vez. */
export function Questionario({ onClose }: { onClose: () => void }) {
  const { config, atualizarPerfil } = useStore();
  const q = config?.questionario;
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!q) return null;
  const enviar = async () => {
    setBusy(true); setErro(null);
    try { await atualizarPerfil({ respostas }); onClose(); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar.'); } finally { setBusy(false); }
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet questionario" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={q.titulo}>
        <div className="sheet__handle" />
        <header className="questionario__topo">
          <h2><MessageCircleQuestion size={20} /> {q.titulo}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        </header>
        <p className="muted small">É opcional e rapidinho. Responda só o que quiser.</p>
        {q.perguntas.map((p) => (
          <div key={p.id} className="questionario__pergunta">
            <label className="label" htmlFor={`q-${p.id}`}>{p.texto}</label>
            {p.opcoes.length ? (
              <div className="questionario__opcoes" role="radiogroup" aria-label={p.texto}>
                {p.opcoes.map((o) => (
                  <button key={o} type="button" role="radio" aria-checked={respostas[p.id] === o} className={respostas[p.id] === o ? 'is-on' : ''}
                    onClick={() => setRespostas((r) => ({ ...r, [p.id]: r[p.id] === o ? '' : o }))}>{o}</button>
                ))}
              </div>
            ) : (
              <input id={`q-${p.id}`} className="input" maxLength={300} value={respostas[p.id] ?? ''} onChange={(e) => setRespostas((r) => ({ ...r, [p.id]: e.target.value }))} />
            )}
          </div>
        ))}
        {erro && <p className="error">{erro}</p>}
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void enviar()}>{busy ? 'Enviando…' : 'Enviar respostas'}</button>
      </div>
    </div>
  );
}
