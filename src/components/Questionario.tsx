import { useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import { useStore } from '../store';
import { Logo } from './ui';
import { INSTAGRAM, LIMITE_TEXTO, alternar, contador, ehOutro, montarResposta, nomeBonito } from '../../shared/questionario';

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

/**
 * Questionário opcional do afilhado: abre com o emblema e "Começar", mostra uma pergunta por vez ("Pergunta 01/10")
 * e termina com o agradecimento. Responder em branco só pula a pergunta; as respostas vão juntas no fim.
 */
export function Questionario({ onClose }: { onClose: () => void }) {
  const { config, me, atualizarPerfil } = useStore();
  const q = config?.questionario;
  const [passo, setPasso] = useState<'inicio' | number | 'fim'>('inicio');
  const [marcadas, setMarcadas] = useState<Record<string, string[]>>({});
  const [outros, setOutros] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!q) return null;
  const total = q.perguntas.length;

  const enviar = async () => {
    setBusy(true); setErro(null);
    const finais = Object.fromEntries(q.perguntas.map((p) => [p.id, montarResposta(p, marcadas[p.id] ?? [], outros[p.id] ?? '')]).filter(([, v]) => v));
    try { await atualizarPerfil({ respostas: finais }); setPasso('fim'); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar.'); } finally { setBusy(false); }
  };
  const responder = (i: number) => (i + 1 < total ? setPasso(i + 1) : void enviar());

  let conteudo;
  if (passo === 'inicio') {
    conteudo = (
      <div className="quiz-app__centro">
        <Logo asLink={false} size={112} />
        <h2>{q.titulo}</h2>
        <p className="muted">São {total} perguntas rápidas, uma de cada vez. É opcional: responda só o que quiser.</p>
        <button type="button" className="btn btn--primary" onClick={() => setPasso(0)}>Começar</button>
        <button type="button" className="quiz-app__depois" onClick={onClose}>Agora não</button>
      </div>
    );
  } else if (passo === 'fim') {
    conteudo = (
      <div className="quiz-app__centro">
        <Logo asLink={false} size={112} />
        <h2>Sua ajuda é o que nos move!</h2>
        <p>Obrigado pelo seu tempo, <strong>{nomeBonito(me?.cliente.nome ?? '')}</strong>!</p>
        <a className="quiz-app__insta" href={INSTAGRAM.url} target="_blank" rel="noreferrer">{INSTAGRAM.arroba}</a>
        <button type="button" className="btn btn--primary" onClick={onClose}>Fechar</button>
      </div>
    );
  } else {
    const p = q.perguntas[passo];
    const sel = marcadas[p.id] ?? [];
    conteudo = (
      <div className="quiz-app__pergunta" key={p.id}>
        <div className="quiz-app__barra" aria-hidden="true"><span style={{ width: `${((passo + 1) / total) * 100}%` }} /></div>
        <small className="quiz-app__contador">{contador(passo, total)}</small>
        <h2 id={`q-${p.id}-t`}>{p.texto}</h2>
        {p.opcoes.length ? (
          <div className="questionario__opcoes" role={p.multipla ? 'group' : 'radiogroup'} aria-labelledby={`q-${p.id}-t`}>
            {p.multipla && <p className="muted small quiz-app__dica">Pode marcar quantas quiser.</p>}
            {p.opcoes.map((o) => (
              <button key={o} type="button" role={p.multipla ? 'checkbox' : 'radio'} aria-checked={sel.includes(o)} className={sel.includes(o) ? 'is-on' : ''}
                onClick={() => setMarcadas((r) => ({ ...r, [p.id]: alternar(p, r[p.id] ?? [], o) }))}>
                {p.multipla && sel.includes(o) && <Check size={14} />} {o}
              </button>
            ))}
          </div>
        ) : (
          <textarea className="input quiz-app__texto" rows={6} maxLength={LIMITE_TEXTO} aria-labelledby={`q-${p.id}-t`} placeholder="Escreva aqui…"
            value={sel[0] ?? ''} onChange={(e) => setMarcadas((r) => ({ ...r, [p.id]: [e.target.value] }))} />
        )}
        {/* "Outro": abre um campo para contar o que é (a resposta fica "Outro: …") */}
        {sel.some(ehOutro) && (
          <input className="input questionario__outro" maxLength={200} autoFocus placeholder="Conta pra gente: qual? (se quiser)"
            aria-label={`${p.texto} (outro)`} value={outros[p.id] ?? ''} onChange={(e) => setOutros((r) => ({ ...r, [p.id]: e.target.value }))} />
        )}
        {erro && <p className="error">{erro}</p>}
        <div className="quiz-app__acoes">
          <button type="button" className="btn btn--ghost" onClick={() => setPasso(passo ? passo - 1 : 'inicio')} aria-label="Voltar"><ArrowLeft size={18} /></button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => responder(passo)}>
            {busy ? 'Enviando…' : 'Responder'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay quiz-app__fundo">
      <div className="sheet questionario quiz-app" role="dialog" aria-label={q.titulo}>
        <button type="button" className="icon-btn quiz-app__fechar" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        {conteudo}
      </div>
    </div>
  );
}
