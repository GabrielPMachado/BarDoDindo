import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ImagePlus, MessageCirclePlus, NotebookPen, Search, SendHorizontal, Trash2, Users, X } from 'lucide-react';
import { EmptyState, ErrorBox, Loading, Modal, PageHead, notify } from '../components/ui';
import { confirmar } from '../components/pickers';
import { Avatar, fotoNoTamanho } from '../components/Avatar';
import { LIMITES_CHAT, chatEquipe, idConversaDireta, notas, type Colega, type ConversaEquipe, type MensagemEquipe } from '../lib/api';
import { temNovidade, useChatEquipe, useColegas } from '../lib/chatEquipe';
import { useSession } from '../lib/session';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function diaDe(iso: string) {
  const d = new Date(iso), hoje = new Date(), ontem = new Date(Date.now() - 864e5);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' });
}
const quandoCurto = (iso: string) => (diaDe(iso) === 'Hoje' ? hora(iso) : new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] || n;

/**
 * Chat interno da equipe: o canal geral (todos os usuários com acesso ao chat) e conversas diretas entre duas pessoas.
 * Para gastar poucas leituras, a lista lê só o resumo das conversas e só a conversa aberta tem as mensagens ao vivo.
 */
export default function ChatEquipe() {
  const { usuario, pode } = useSession();
  const eu = usuario?.id ?? '';
  const [params, setParams] = useSearchParams();
  const aberta = params.get('c');
  const { conversas, lidas, erro } = useChatEquipe(eu, true);
  const { colegas } = useColegas();
  const [q, setQ] = useState('');
  const [nova, setNova] = useState(false);

  const abrir = (id: string | null) => setParams(id ? { c: id } : {});
  const outroDe = (c: { id: string; membros?: string[] }) => (c.membros?.length ? c.membros : c.id.slice(2).split('_')).find((u) => u !== eu) ?? '';
  const colega = (uid: string) => colegas?.find((x) => x.id === uid);
  const nomeDe = (c: ConversaEquipe) => (c.tipo === 'geral' ? 'Geral (toda a equipe)' : colega(outroDe(c))?.nome || 'Colega');

  // o canal geral fica sempre no topo, mesmo antes da primeira mensagem
  const geral = conversas?.find((c) => c.id === 'geral') ?? { id: 'geral', tipo: 'geral', membros: [], ultimaMensagem: '', ultimaEm: '', ultimoAutorId: '', ultimoAutorNome: '', ultimaId: '' } as ConversaEquipe;
  const diretas = (conversas ?? []).filter((c) => c.tipo === 'direta');
  const term = q.trim().toLowerCase();
  const lista = [geral, ...diretas].filter((c) => !term || nomeDe(c).toLowerCase().includes(term));

  const atual = aberta ? (conversas?.find((c) => c.id === aberta) ?? null) : null;
  const tituloAberta = !aberta ? '' : aberta === 'geral' ? 'Geral (toda a equipe)' : colega(outroDe({ id: aberta }))?.nome || 'Colega';

  return (
    <div className="page">
      <PageHead title="Chat da equipe" description="Converse com a equipe no canal geral ou mande mensagem direta para um colega. As mensagens chegam na hora para quem estiver com o Cérebro aberto."
        actions={pode('chat', 'criar') && <button type="button" className="btn btn--primary" onClick={() => setNova(true)}><MessageCirclePlus size={16} /> Nova conversa</button>} />
      {erro && <ErrorBox>Não foi possível carregar as conversas.</ErrorBox>}
      <div className={`conversas ${aberta ? 'conversas--aberta' : ''}`}>
        <aside className="panel conversas__lista">
          <div className="toolbar">
            <label className="search"><Search size={16} /><input placeholder="Buscar colega" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          </div>
          {conversas === null ? <Loading /> : (
            <ul className="conversas__itens">
              {lista.map((c) => {
                const temNova = temNovidade(c, eu, lidas);
                const outro = c.tipo === 'direta' ? colega(outroDe(c)) : undefined;
                return (
                  <li key={c.id}>
                    <button type="button" className={`conversa-item conversa-item--equipe ${c.id === aberta ? 'is-active' : ''} ${temNova ? 'has-new' : ''}`} onClick={() => abrir(c.id)}>
                      {c.tipo === 'geral'
                        ? <span className="chat-equipe__avatar chat-equipe__avatar--geral"><Users size={16} /></span>
                        : <Avatar className="chat-equipe__avatar" nome={outro?.nome ?? 'Colega'} foto={outro?.foto} />}
                      <span className="conversa-item__corpo">
                        <span className="conversa-item__topo">
                          <strong>{nomeDe(c)}</strong>
                          {c.ultimaEm && <small className="muted">{quandoCurto(c.ultimaEm)}</small>}
                        </span>
                        <span className="conversa-item__linha">
                          <span className="muted small conversa-item__previa">
                            {c.ultimaMensagem
                              ? <>{c.ultimoAutorId === eu ? 'Você: ' : c.tipo === 'geral' ? `${primeiroNome(c.ultimoAutorNome)}: ` : ''}{c.ultimaMensagem}</>
                              : 'Nenhuma mensagem ainda'}
                          </span>
                          {temNova && <span className="nav__badge" aria-label="Mensagem nova">nova</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {!lista.length && <li className="muted small conversas__vazio">Nenhum colega encontrado.</li>}
              {!term && !diretas.length && (
                <li className="muted small chat-equipe__dica">Para falar só com uma pessoa, use “Nova conversa”.</li>
              )}
            </ul>
          )}
        </aside>
        <section className="panel conversas__chat">
          {!aberta ? (
            <EmptyState title="Escolha uma conversa">Abra o canal geral ou uma conversa na lista ao lado, ou comece uma nova.</EmptyState>
          ) : (
            <ConversaAberta key={aberta} id={aberta} titulo={tituloAberta} resumo={atual} novidade={!!atual && temNovidade(atual, eu, lidas)}
              colegas={colegas} onVoltar={() => abrir(null)} />
          )}
        </section>
      </div>
      {nova && (
        <NovaConversa eu={eu} onClose={() => setNova(false)} onEscolher={(c) => { setNova(false); abrir(idConversaDireta(eu, c.id)); }} />
      )}
    </div>
  );
}

function ConversaAberta({ id, titulo, resumo, novidade, colegas, onVoltar }: {
  id: string; titulo: string; resumo: ConversaEquipe | null; novidade: boolean; colegas: Colega[] | null; onVoltar: () => void;
}) {
  const { usuario, pode } = useSession();
  const eu = usuario?.id ?? '';
  const [recentes, setRecentes] = useState<MensagemEquipe[] | null>(null);
  const [antigas, setAntigas] = useState<MensagemEquipe[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  // foto ou print escolhido (ou colado com Ctrl+V), já reduzido, esperando o envio
  const [imagem, setImagem] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const segurarRolagem = useRef(false);
  const buscouAnteriores = useRef(false);
  const geral = id === 'geral';
  const outro = geral ? null : colegas?.find((c) => c.id !== eu && id.slice(2).split('_').includes(c.id)) ?? null;

  useEffect(() => chatEquipe.ouvirMensagens(id, (m, mais) => {
    setRecentes(m);
    if (!buscouAnteriores.current) setTemMais(mais);
  }, () => setErro('Não foi possível carregar as mensagens.')), [id]);

  // com a conversa aberta na tela, o que chega já está lido (e ao voltar para a aba)
  useEffect(() => {
    if (!novidade) return;
    const marcar = () => { if (document.visibilityState === 'visible') void chatEquipe.marcarLida(id); };
    marcar();
    document.addEventListener('visibilitychange', marcar);
    return () => document.removeEventListener('visibilitychange', marcar);
  }, [id, novidade, resumo?.ultimaEm]);

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
      const r = await chatEquipe.anteriores(id);
      buscouAnteriores.current = true;
      segurarRolagem.current = true;
      setAntigas((a) => [...r.mensagens, ...a]);
      setTemMais(r.temMais);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - altura; });
    } catch {
      setErro('Não foi possível carregar as mensagens anteriores.');
    } finally {
      setCarregando(false);
    }
  }

  async function anexar(f: Blob | null | undefined) {
    if (!f || !f.type.startsWith('image/')) return;
    setPreparando(true);
    setErro(null);
    try {
      const foto = await fotoNoTamanho(f);
      if (foto.length > LIMITES_CHAT.imagem) throw new Error('Imagem grande demais para o chat.');
      setImagem(foto);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível ler a imagem.');
    } finally {
      setPreparando(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim(), img = imagem;
    if (!t && !img) return;
    setTexto('');
    setImagem(null);
    setErro(null);
    try {
      await chatEquipe.enviar(id, t, img ? { imagem: img } : {});
    } catch (err) {
      setTexto(t);
      setImagem(img);
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar.');
    }
  }

  async function apagar(m: MensagemEquipe) {
    if (!(await confirmar({ title: 'Apagar esta mensagem?', message: 'Ela some do chat para todos.', confirmLabel: 'Apagar', danger: true }))) return;
    try {
      await chatEquipe.apagar(id, m.id);
      setAntigas((a) => a.filter((x) => x.id !== m.id));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Não foi possível apagar.', 'error');
    }
  }
  const podeApagarTodas = pode('chat', 'excluir');

  const todas = [...antigas.filter((a) => !recentes?.some((r) => r.id === a.id)), ...(recentes ?? [])];
  let diaAnterior = '';
  let autorAnterior = '';

  return (
    <>
      <header className="conversas__cabeca">
        <button type="button" className="icon-btn conversas__voltar" onClick={onVoltar} aria-label="Voltar para a lista"><ArrowLeft size={18} /></button>
        {geral
          ? <span className="chat-equipe__avatar chat-equipe__avatar--geral"><Users size={16} /></span>
          : <Avatar className="chat-equipe__avatar" nome={outro?.nome ?? titulo} foto={outro?.foto} />}
        <div>
          <strong>{titulo}</strong>
          <div className="muted small">{geral ? 'Canal de toda a equipe' : 'Conversa direta'}</div>
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
              const minha = m.usuarioId === eu;
              // no canal geral, o nome aparece na primeira de uma sequência de mensagens da mesma pessoa
              const mostrarAutor = geral && !minha && (mostrarDia || autorAnterior !== m.usuarioId);
              diaAnterior = dia;
              autorAnterior = m.usuarioId;
              return (
                <div key={m.id} className="msg-linha">
                  {mostrarDia && <div className="msg-dia">{dia}</div>}
                  <div className={`msg ${minha ? 'msg--equipe' : ''} ${m.imagem ? 'msg--imagem' : ''}`}>
                    {mostrarAutor && <small className="msg__autor">{m.usuarioNome || 'Colega'}</small>}
                    {m.imagem && (
                      <button type="button" className="msg__foto" onClick={() => setAmpliada(m.imagem!)} aria-label="Ver a imagem maior">
                        <img src={m.imagem} alt="" loading="lazy" />
                      </button>
                    )}
                    {m.nota && <NotaNoChat nota={m.nota} />}
                    {m.link && <LinkNoChat link={m.link} />}
                    {m.texto && <p><TextoComLinks texto={m.texto} /></p>}
                    <small className="msg__hora">
                      {(minha || podeApagarTodas) && !m.pendente && (
                        <button type="button" className="msg__apagar" onClick={() => apagar(m)} aria-label="Apagar mensagem" title="Apagar mensagem"><Trash2 size={12} /></button>
                      )}
                      {m.pendente ? 'Enviando…' : hora(m.criadaEm)}
                    </small>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      {pode('chat', 'criar') ? (
        <form className="conversas__form" onSubmit={enviar}>
          {erro && <p className="conversas__erro">{erro}</p>}
          {(imagem || preparando) && (
            <div className="chat-anexo">
              {imagem ? <img src={imagem} alt="Imagem a enviar" /> : <span className="muted small">Preparando a imagem…</span>}
              {imagem && <button type="button" className="chat-anexo__tirar" onClick={() => setImagem(null)} aria-label="Tirar a imagem"><X size={14} /></button>}
            </div>
          )}
          <div className="conversas__campo">
            <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => { void anexar(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className="btn btn--ghost conversas__enviar" onClick={() => arquivo.current?.click()} aria-label="Mandar foto ou print" title="Mandar foto ou print (ou cole com Ctrl+V)"><ImagePlus size={18} /></button>
            <textarea
              className="input" rows={1} maxLength={1000} value={texto}
              placeholder={imagem ? 'Legenda (opcional)' : geral ? 'Mensagem para toda a equipe' : `Mensagem para ${primeiroNome(titulo)}`}
              onChange={(e) => setTexto(e.target.value)}
              onPaste={(e) => {
                const img = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
                if (img) { e.preventDefault(); void anexar(img.getAsFile()); }
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            />
            <button className="btn btn--primary conversas__enviar" disabled={(!texto.trim() && !imagem) || preparando} aria-label="Enviar"><SendHorizontal size={18} /></button>
          </div>
        </form>
      ) : <p className="muted small conversas__form">Sua função só permite ler o chat.</p>}
      {ampliada && (
        <div className="foto-ampliada" onClick={() => setAmpliada(null)} role="dialog" aria-label="Imagem ampliada">
          <img src={ampliada} alt="" />
          <button type="button" className="foto-ampliada__fechar" aria-label="Fechar"><X size={20} /></button>
        </div>
      )}
    </>
  );
}

/** Nota do bloco de notas mandada no chat: dá para ler aqui e salvar uma cópia nas próprias notas. */
function NotaNoChat({ nota }: { nota: { titulo: string; texto: string } }) {
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try {
      const id = await notas.criar(nota);
      notify('Nota salva em Minhas notas.');
      navigate(`/perfil/notas?n=${id}`);
    } catch {
      notify('Não foi possível salvar a nota.', 'error');
      setSalvando(false);
    }
  };
  return (
    <div className="msg-nota">
      <div className="msg-nota__topo"><NotebookPen size={14} /><strong>{nota.titulo || 'Nota'}</strong></div>
      {nota.texto && <p className="msg-nota__texto">{nota.texto}</p>}
      <button type="button" className="btn btn--ghost btn--sm" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar nas minhas notas'}</button>
    </div>
  );
}

/** Página do Cérebro citada no chat: um clique abre a página. */
function LinkNoChat({ link }: { link: { caminho: string; titulo: string; detalhe?: string } }) {
  return (
    <Link to={link.caminho} className="msg-link">
      <span className="msg-link__texto"><strong>{link.titulo}</strong>{link.detalhe && <small className="muted">{link.detalhe}</small>}</span>
      <ArrowUpRight size={16} />
    </Link>
  );
}

// links do próprio Cérebro (…/crm/#/página) abrem aqui dentro; os demais, em outra guia
const URL_RE = /(https?:\/\/[^\s]+)/g;
function TextoComLinks({ texto }: { texto: string }) {
  const partes = texto.split(URL_RE);
  return (
    <>
      {partes.map((p, i) => {
        if (i % 2 === 0) return p;
        const interno = p.match(/\/crm\/?#(\/[^\s]*)/);
        return interno
          ? <Link key={i} to={interno[1]} className="msg__url">{p}</Link>
          : <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="msg__url">{p}</a>;
      })}
    </>
  );
}

/** Escolhe o colega para uma conversa direta. */
function NovaConversa({ eu, onClose, onEscolher }: { eu: string; onClose: () => void; onEscolher: (c: Colega) => void }) {
  const { colegas, erro } = useColegas();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const lista = (colegas ?? []).filter((c) => c.id !== eu && (!term || c.nome.toLowerCase().includes(term)));
  return (
    <Modal title="Nova conversa" onClose={onClose} width={440}>
      <label className="search"><Search size={16} /><input autoFocus placeholder="Buscar colega pelo nome" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {erro && <ErrorBox>Não foi possível carregar a equipe.</ErrorBox>}
      {!colegas && !erro ? <Loading /> : (
        <ul className="conversas__itens conversas__escolha">
          {lista.map((c) => (
            <li key={c.id}>
              <button type="button" className="conversa-item conversa-item--equipe" onClick={() => onEscolher(c)}>
                <Avatar className="chat-equipe__avatar" nome={c.nome} foto={c.foto} />
                <span className="conversa-item__corpo"><strong>{c.nome}</strong></span>
              </button>
            </li>
          ))}
          {!lista.length && <li className="muted small">Nenhum colega encontrado.</li>}
        </ul>
      )}
    </Modal>
  );
}
