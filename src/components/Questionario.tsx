import { useState } from 'react';
import { ArrowLeft, Check, ListChecks, X } from 'lucide-react';
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
  const [passo, setPassoAgora] = useState<'inicio' | number | 'fim'>('inicio');
  // direção da animação entre perguntas: avança pela direita, volta pela esquerda
  const [volta, setVolta] = useState(false);
  const setPasso = (novo: 'inicio' | number | 'fim') => {
    setVolta(novo === 'inicio' || (typeof novo === 'number' && typeof passo === 'number' && novo < passo));
    setPassoAgora(novo);
  };
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
      <div className={`quiz-app__centro${volta ? ' is-volta' : ''}`}>
        <span className="quiz-app__emblema"><Logo asLink={false} size={112} /></span>
        <h2>{q.titulo}</h2>
        <p className="muted">São {total} perguntas rápidas, uma de cada vez. É opcional: responda só o que quiser.</p>
        <button type="button" className="btn btn--primary" onClick={() => setPasso(0)}>Começar</button>
        <button type="button" className="quiz-app__depois" onClick={onClose}>Agora não</button>
      </div>
    );
  } else if (passo === 'fim') {
    conteudo = (
      <div className="quiz-app__centro is-fim">
        <span className="quiz-app__emblema"><Logo asLink={false} size={112} /></span>
        <h2>Sua ajuda é o que nos move!</h2>
        <p>Obrigado pelo seu tempo, <strong>{nomeBonito(me?.cliente.nome ?? '')}</strong>!</p>
        <a className="quiz-app__insta" href={INSTAGRAM.url} target="_blank" rel="noreferrer">{INSTAGRAM.arroba}</a>
        <button type="button" className="btn btn--primary" onClick={onClose}>Fechar</button>
      </div>
    );
  } else {
    const p = q.perguntas[passo];
    const sel = marcadas[p.id] ?? [];
    const texto = sel[0] ?? '';
    conteudo = (
      <div className={`quiz-app__pergunta${volta ? ' is-volta' : ''}`} key={p.id}>
        <header className="quiz-app__cabeca">
          <ol className="quiz-app__passos" aria-hidden="true">
            {q.perguntas.map((x, k) => <li key={x.id} className={k < passo ? 'is-feito' : k === passo ? 'is-atual' : ''} />)}
          </ol>
          <small className="quiz-app__contador">{contador(passo, total)}</small>
        </header>
        <div className="quiz-app__miolo">
          <h2 id={`q-${p.id}-t`}>{p.texto}</h2>
          {p.multipla && <p className="quiz-app__dica"><ListChecks size={15} /> Pode marcar quantas quiser</p>}
          {p.opcoes.length ? (
            <div className="quiz-opcoes" role={p.multipla ? 'group' : 'radiogroup'} aria-labelledby={`q-${p.id}-t`}>
              {p.opcoes.map((o, k) => {
                const on = sel.includes(o);
                return (
                  <div key={o} className="quiz-opcoes__item" style={{ animationDelay: `${60 + k * 45}ms` }}>
                    <button type="button" role={p.multipla ? 'checkbox' : 'radio'} aria-checked={on} className={`quiz-opcao${on ? ' is-on' : ''}${p.multipla ? ' is-multipla' : ''}`}
                      onClick={() => setMarcadas((r) => ({ ...r, [p.id]: alternar(p, r[p.id] ?? [], o) }))}>
                      <span className="quiz-opcao__marca" aria-hidden="true">{on && <Check size={13} strokeWidth={3} />}</span>
                      <span className="quiz-opcao__texto">{o}</span>
                    </button>
                    {/* "Outro": abre um campo logo abaixo para contar o que é (a resposta fica "Outro: …") */}
                    {on && ehOutro(o) && (
                      <input className="input quiz-opcao__outro" maxLength={200} autoFocus placeholder="Conta pra gente: qual? (se quiser)"
                        aria-label={`${p.texto} (outro)`} value={outros[p.id] ?? ''} onChange={(e) => setOutros((r) => ({ ...r, [p.id]: e.target.value }))} />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="quiz-app__texto-caixa">
              <textarea className="input quiz-app__texto" rows={6} maxLength={LIMITE_TEXTO} aria-labelledby={`q-${p.id}-t`} placeholder="Escreva aqui, com suas palavras…"
                value={texto} onChange={(e) => setMarcadas((r) => ({ ...r, [p.id]: [e.target.value] }))} />
              <small className="quiz-app__conta">{texto.length}/{LIMITE_TEXTO}</small>
            </div>
          )}
          {erro && <p className="error">{erro}</p>}
        </div>
        <footer className="quiz-app__acoes">
          <button type="button" className="btn btn--ghost" onClick={() => setPasso(passo ? passo - 1 : 'inicio')} aria-label="Voltar"><ArrowLeft size={18} /></button>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => responder(passo)}>
            {busy ? 'Enviando…' : passo + 1 < total ? 'Responder' : 'Responder e enviar'}
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="overlay quiz-app__fundo">
      <div className="sheet questionario quiz-app" role="dialog" aria-modal="true" aria-label={q.titulo}>
        <div className="sheet__handle" />
        <button type="button" className="icon-btn quiz-app__fechar" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        {conteudo}
      </div>
    </div>
  );
}
