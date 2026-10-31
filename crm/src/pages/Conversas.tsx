import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageCirclePlus, Search, SendHorizontal } from 'lucide-react';
import { EmptyState, ErrorBox, Loading, Modal, PageHead } from '../components/ui';
import { chat, type Conversa, type Mensagem } from '../lib/api';
import { useResource } from '../lib/data';
import { useSession } from '../lib/session';
import { numero } from './Vendas';
import { ocultarEmail } from '../components/DadosOcultos';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function diaDe(iso: string) {
  const d = new Date(iso), hoje = new Date(), ontem = new Date(Date.now() - 864e5);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' });
}
/** Na lista: a hora para hoje, a data para os outros dias. */
const quandoCurto = (iso: string) => (diaDe(iso) === 'Hoje' ? hora(iso) : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));

type Afilhado = { uid: string; nome: string; numero: number };

/**
 * Conversas com os afilhados (Fale com o bar, no aplicativo). Para gastar poucas leituras, a lista lê só o resumo das
 * conversas mais recentes e só a conversa aberta tem as mensagens ao vivo (as últimas 30; as anteriores sob demanda).
 */
export default function Conversas() {
  const { pode } = useSession();
  const [params, setParams] = useSearchParams();
  const aberta = params.get('c');
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [nova, setNova] = useState(false);
  // afilhado escolhido em "Nova conversa", que ainda não tem conversa
  const [escolhido, setEscolhido] = useState<Afilhado | null>(null);

  useEffect(() => chat.ouvirConversas(setConversas, () => setErro('Não foi possível carregar as conversas.')), []);

  const abrir = (uid: string | null) => setParams(uid ? { c: uid } : {});
  const daLista = conversas?.find((c) => c.id === aberta);
  const atual: Afilhado | null = daLista ? { uid: daLista.id, nome: daLista.clienteNome, numero: daLista.clienteNumero }
    : escolhido?.uid === aberta ? escolhido : null;
  const term = q.trim().toLowerCase();
  const lista = (conversas ?? []).filter((c) => !term || `${c.clienteNome} ${numero(c.clienteNumero)}`.toLowerCase().includes(term));

  return (
    <div className="page">
      <PageHead title="Conversas" description="Mensagens dos afilhados pelo aplicativo (Fale com o bar). Responda por aqui: a resposta aparece na hora no app."
        actions={pode('conversas', 'criar') && <button type="button" className="btn btn--primary" onClick={() => setNova(true)}><MessageCirclePlus size={16} /> Nova conversa</button>} />
      {erro && <ErrorBox>{erro}</ErrorBox>}
      <div className={`conversas ${aberta ? 'conversas--aberta' : ''}`}>
        <aside className="panel conversas__lista">
          <div className="toolbar">
            <label className="search"><Search size={16} /><input placeholder="Buscar por nome ou número" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          </div>
          {conversas === null ? <Loading /> : !lista.length ? (
            <EmptyState title={term ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}>
              {!term && 'Quando um afilhado mandar mensagem pelo aplicativo, ela aparece aqui.'}
            </EmptyState>
          ) : (
            <ul className="conversas__itens">
              {lista.map((c) => (
                <li key={c.id}>
                  <button type="button" className={`conversa-item ${c.id === aberta ? 'is-active' : ''} ${c.naoLidasEquipe ? 'has-new' : ''}`} onClick={() => abrir(c.id)}>
                    <span className="conversa-item__topo">
                      <strong>{c.clienteNome || 'Afilhado'}</strong>
                      <small className="muted">{quandoCurto(c.ultimaEm)}</small>
                    </span>
                    <span className="conversa-item__linha">
                      <span className="muted small conversa-item__previa">{c.ultimoAutor === 'equipe' && 'Você: '}{c.ultimaMensagem}</span>
                      {c.naoLidasEquipe > 0 && <span className="nav__badge">{c.naoLidasEquipe}</span>}
                    </span>
                    <small className="muted">{numero(c.clienteNumero)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="panel conversas__chat">
          {!aberta ? (
            <EmptyState title="Escolha uma conversa">Abra uma conversa na lista ao lado ou comece uma nova.</EmptyState>
          ) : (
            <ConversaAberta key={aberta} uid={aberta} afilhado={atual} naoLidas={daLista?.naoLidasEquipe ?? 0} onVoltar={() => abrir(null)} />
          )}
        </section>
      </div>
      {nova && <NovaConversa onClose={() => setNova(false)} onEscolher={(a) => { setEscolhido(a); setNova(false); abrir(a.uid); }} />}
    </div>
  );
}

function ConversaAberta({ uid, afilhado, naoLidas, onVoltar }: { uid: string; afilhado: Afilhado | null; naoLidas: number; onVoltar: () => void }) {
  const { pode } = useSession();
  const [recentes, setRecentes] = useState<Mensagem[] | null>(null);
  const [antigas, setAntigas] = useState<Mensagem[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  // conversa aberta pelo link (fora das mais recentes da lista): lê o resumo dela
  const [resumo, setResumo] = useState<Conversa | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const segurarRolagem = useRef(false);
  const buscouAnteriores = useRef(false);

  useEffect(() => chat.ouvirMensagens(uid, (m, mais) => {
    setRecentes(m);
    if (!buscouAnteriores.current) setTemMais(mais);
  }, () => setErro('Não foi possível carregar as mensagens.')), [uid]);
  useEffect(() => (afilhado ? undefined : chat.ouvirConversa(uid, setResumo)), [uid, !afilhado]);
  const quem = afilhado ?? (resumo ? { uid, nome: resumo.clienteNome, numero: resumo.clienteNumero } : null);
  const pendentes = afilhado ? naoLidas : resumo?.naoLidasEquipe ?? 0;

  // com a conversa aberta na tela, o que chega já está lido
  useEffect(() => {
    if (pendentes > 0 && document.visibilityState === 'visible') void chat.marcarLida(uid);
  }, [uid, pendentes]);

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    if (segurarRolagem.current) { segurarRolagem.current = false; return; }
    el.scrollTop = el.scrollHeight;
  }, [recentes]);

  async function verAnteriores() {
    setCarregando(true);
    const el = caixa.current, altura = el?.scrollHeight ?? 0;
    try {
      const r = await chat.anteriores(uid);
      buscouAnteriores.current = true;
      segurarRolagem.current = true;
      setAntigas((a) => [...r.mensagens, ...a]);
      setTemMais(r.temMais);
      // mantém à vista a mensagem que estava no topo
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - altura; });
    } catch {
      setErro('Não foi possível carregar as mensagens anteriores.');
    } finally {
      setCarregando(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !quem) return;
    setTexto('');
    setErro(null);
    try {
      await chat.enviar(uid, t, { nome: quem.nome, numero: quem.numero });
    } catch (err) {
      setTexto(t);
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar.');
    }
  }

  const todas = [...antigas.filter((a) => !recentes?.some((r) => r.id === a.id)), ...(recentes ?? [])];
  let diaAnterior = '';
  const podeResponder = pode('conversas', 'criar');

  return (
    <>
      <header className="conversas__cabeca">
        <button type="button" className="icon-btn conversas__voltar" onClick={onVoltar} aria-label="Voltar para a lista"><ArrowLeft size={18} /></button>
        <div>
          <strong>{quem?.nome || 'Afilhado'}</strong>
          {quem && <div className="muted small">Afilhado {numero(quem.numero)}</div>}
        </div>
      </header>
      <div className="conversas__mensagens" ref={caixa}>
        {recentes === null ? <Loading /> : !todas.length ? (
          <p className="muted small conversas__vazio">Nenhuma mensagem ainda. Escreva abaixo para começar a conversa.</p>
        ) : (
          <>
            {temMais && (
              <button type="button" className="btn btn--ghost conversas__mais" onClick={verAnteriores} disabled={carregando}>
                {carregando ? 'Carregando…' : 'Ver mensagens anteriores'}
              </button>
            )}
            {todas.map((m) => {
              const dia = diaDe(m.criadaEm);
              const mostrarDia = dia !== diaAnterior;
              diaAnterior = dia;
              return (
                <div key={m.id} className="msg-linha">
                  {mostrarDia && <div className="msg-dia">{dia}</div>}
                  <div className={`msg ${m.autor === 'equipe' ? 'msg--equipe' : ''}`}>
                    {m.autor === 'equipe' && <small className="msg__autor">{m.usuarioNome || 'Equipe'}</small>}
                    <p>{m.texto}</p>
                    <small className="msg__hora">{m.pendente ? 'Enviando…' : hora(m.criadaEm)}</small>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      {podeResponder ? (
        <form className="conversas__form" onSubmit={enviar}>
          {erro && <p className="conversas__erro">{erro}</p>}
          <div className="conversas__campo">
            <textarea
              className="input" rows={1} maxLength={1000} placeholder={quem ? `Responder a ${quem.nome.split(' ')[0]}` : 'Carregando…'} value={texto} disabled={!quem}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            />
            <button className="btn btn--primary conversas__enviar" disabled={!texto.trim() || !quem} aria-label="Enviar"><SendHorizontal size={18} /></button>
          </div>
        </form>
      ) : <p className="muted small conversas__form">Sua função só permite ver as conversas.</p>}
    </>
  );
}

/** Escolhe o afilhado para começar uma conversa (só quem já tem conversa aparece na lista). */
function NovaConversa({ onClose, onEscolher }: { onClose: () => void; onEscolher: (a: Afilhado) => void }) {
  const { data, loading, error } = useResource<{ uid: string; nome: string; numero: number; email: string }[]>('/crm/clientes');
  const [q, setQ] = useState('');
  const verDados = useSession().pode('clientes', 'editar');
  const term = q.trim().toLowerCase();
  const lista = (data ?? []).filter((c) => !term || `${c.nome} ${c.email} ${numero(c.numero)}`.toLowerCase().includes(term)).slice(0, 50);
  return (
    <Modal title="Nova conversa" onClose={onClose} width={480}>
      <label className="search"><Search size={16} /><input autoFocus placeholder="Buscar afilhado por nome, e-mail ou número" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? <Loading /> : (
        <ul className="conversas__itens conversas__escolha">
          {lista.map((c) => (
            <li key={c.uid}>
              <button type="button" className="conversa-item" onClick={() => onEscolher({ uid: c.uid, nome: c.nome, numero: c.numero })}>
                <span className="conversa-item__topo"><strong>{c.nome}</strong><small className="muted">{numero(c.numero)}</small></span>
                <span className="muted small">{verDados ? c.email : ocultarEmail(c.email)}</span>
              </button>
            </li>
          ))}
          {!lista.length && <li className="muted small">Nenhum afilhado encontrado.</li>}
        </ul>
      )}
    </Modal>
  );
}
