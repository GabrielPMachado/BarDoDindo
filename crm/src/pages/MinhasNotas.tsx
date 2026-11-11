import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, NotebookPen, Plus, Search, Send, Trash2 } from 'lucide-react';
import { EmptyState, ErrorBox, Loading, PageHead, notify } from '../components/ui';
import { confirmar } from '../components/pickers';
import { EnviarAoChat } from '../components/EnviarAoChat';
import { LIMITES_CHAT, notas as api, type Nota } from '../lib/api';

const quando = (iso: string) => {
  const d = new Date(iso), hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: d.getFullYear() === hoje.getFullYear() ? undefined : '2-digit' });
};
const tituloDe = (n: Pick<Nota, 'titulo' | 'texto'>) => n.titulo.trim() || n.texto.trim().split('\n')[0].slice(0, 60) || 'Nota sem título';

/**
 * Bloco de notas pessoal: só a própria pessoa vê as suas notas. Uma nota pode ir para o chat da equipe (cópia),
 * e uma nota recebida no chat pode ser salva aqui. Salva sozinho enquanto a pessoa escreve.
 */
export default function MinhasNotas() {
  const [lista, setLista] = useState<Nota[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const aberta = params.get('n');
  const [q, setQ] = useState('');
  const [compartilhar, setCompartilhar] = useState<Nota | null>(null);

  useEffect(() => api.ouvir(setLista, () => setErro('Não foi possível carregar as notas.')), []);

  const abrir = (id: string | null) => setParams(id ? { n: id } : {});
  async function nova() {
    try { abrir(await api.criar()); } catch { notify('Não foi possível criar a nota.', 'error'); }
  }
  const term = q.trim().toLowerCase();
  const filtradas = (lista ?? []).filter((n) => !term || `${n.titulo} ${n.texto}`.toLowerCase().includes(term));
  const atual = lista?.find((n) => n.id === aberta) ?? null;

  return (
    <div className="page">
      <PageHead title="Minhas notas" description="Seu bloco de notas: só você vê. Para mostrar uma nota a alguém, use “Mandar para o chat”."
        actions={<button type="button" className="btn btn--primary" onClick={nova}><Plus size={16} /> Nova nota</button>} />
      {erro && <ErrorBox>{erro}</ErrorBox>}
      <div className={`conversas notas ${aberta ? 'conversas--aberta' : ''}`}>
        <aside className="panel conversas__lista">
          <div className="toolbar">
            <label className="search"><Search size={16} /><input placeholder="Buscar nas notas" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          </div>
          {lista === null ? <Loading /> : !filtradas.length ? (
            <EmptyState title={term ? 'Nenhuma nota encontrada' : 'Nenhuma nota ainda'}>{!term && 'Crie a primeira em “Nova nota”.'}</EmptyState>
          ) : (
            <ul className="conversas__itens">
              {filtradas.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`conversa-item ${n.id === aberta ? 'is-active' : ''}`} onClick={() => abrir(n.id)}>
                    <span className="conversa-item__topo"><strong>{tituloDe(n)}</strong><small className="muted">{quando(n.atualizadaEm)}</small></span>
                    <span className="muted small conversa-item__previa">{n.texto.replace(/\s+/g, ' ').slice(0, 120) || 'Sem texto'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="panel conversas__chat">
          {!aberta ? (
            <EmptyState title="Escolha uma nota">Abra uma nota na lista ao lado ou crie uma nova.</EmptyState>
          ) : lista === null ? <Loading /> : !atual ? (
            <EmptyState title="Nota não encontrada">Ela pode ter sido apagada.</EmptyState>
          ) : (
            <Editor key={atual.id} nota={atual} onVoltar={() => abrir(null)} onCompartilhar={setCompartilhar}
              onApagar={async () => {
                if (!(await confirmar({ title: 'Apagar esta nota?', message: 'A nota sai do seu bloco. Cópias já mandadas no chat continuam lá.', confirmLabel: 'Apagar', danger: true }))) return;
                await api.apagar(atual.id).then(() => abrir(null)).catch(() => notify('Não foi possível apagar.', 'error'));
              }} />
          )}
        </section>
      </div>
      {compartilhar && <EnviarAoChat nota={{ titulo: tituloDe(compartilhar), texto: compartilhar.texto.slice(0, LIMITES_CHAT.notaNoChat) }} onClose={() => setCompartilhar(null)} />}
    </div>
  );
}

function Editor({ nota, onVoltar, onCompartilhar, onApagar }: {
  nota: Nota; onVoltar: () => void; onCompartilhar: (n: Nota) => void; onApagar: () => void;
}) {
  const [titulo, setTitulo] = useState(nota.titulo);
  const [texto, setTexto] = useState(nota.texto);
  const [estado, setEstado] = useState<'salvo' | 'salvando' | 'pendente' | 'erro'>('salvo');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ultimo = useRef({ titulo: nota.titulo, texto: nota.texto });

  // salva sozinho 1 s depois da última tecla (e ao sair da nota)
  const salvar = async (t = titulo, x = texto) => {
    clearTimeout(timer.current);
    if (t === ultimo.current.titulo && x === ultimo.current.texto) return;
    setEstado('salvando');
    try {
      await api.salvar(nota.id, { titulo: t, texto: x });
      ultimo.current = { titulo: t, texto: x };
      setEstado('salvo');
    } catch {
      setEstado('erro');
    }
  };
  useEffect(() => {
    if (titulo === ultimo.current.titulo && texto === ultimo.current.texto) return;
    setEstado('pendente');
    timer.current = setTimeout(() => void salvar(titulo, texto), 1000);
    return () => clearTimeout(timer.current);
  }, [titulo, texto]);
  // ao trocar de nota ou sair da tela, grava o que faltou
  const atual = useRef({ titulo, texto });
  atual.current = { titulo, texto };
  useEffect(() => () => { void salvar(atual.current.titulo, atual.current.texto); }, []);

  return (
    <>
      <header className="conversas__cabeca notas__cabeca">
        <button type="button" className="icon-btn conversas__voltar" onClick={onVoltar} aria-label="Voltar para a lista"><ArrowLeft size={18} /></button>
        <NotebookPen size={18} className="gold" />
        <span className="muted small notas__estado">
          {estado === 'salvando' ? 'Salvando…' : estado === 'pendente' ? 'Editando…' : estado === 'erro' ? 'Não foi possível salvar' : 'Salvo'}
        </span>
        <span className="spacer" />
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { void salvar(); onCompartilhar({ ...nota, titulo, texto }); }}><Send size={15} /> Mandar para o chat</button>
        <button type="button" className="icon-btn" onClick={onApagar} aria-label="Apagar nota" title="Apagar nota"><Trash2 size={17} /></button>
      </header>
      <div className="notas__editor">
        <input className="notas__titulo" placeholder="Título" maxLength={LIMITES_CHAT.notaTitulo} value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={() => void salvar()} />
        <textarea className="notas__texto" placeholder="Escreva aqui…" maxLength={LIMITES_CHAT.notaTexto} value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={() => void salvar()} />
        <small className="muted notas__conta">{texto.length}/{LIMITES_CHAT.notaTexto}</small>
      </div>
    </>
  );
}
