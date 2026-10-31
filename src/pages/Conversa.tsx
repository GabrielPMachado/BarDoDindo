import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, SendHorizontal } from 'lucide-react';
import { chat, getToken, type Mensagem } from '../api';
import { Empty, PageHeader, Spinner } from '../components/ui';
import { useMe, useStore } from '../store';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function diaDe(iso: string) {
  const d = new Date(iso), hoje = new Date(), ontem = new Date(Date.now() - 864e5);
  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric' });
}

/** Conversa do afilhado com a equipe do bar: as últimas mensagens ao vivo, as anteriores sob demanda. */
export default function Conversa() {
  const me = useMe();
  const { naoLidasChat } = useStore();
  const uid = getToken();
  const [recentes, setRecentes] = useState<Mensagem[] | null>(null);
  const [antigas, setAntigas] = useState<Mensagem[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const segurarRolagem = useRef(false);
  // depois de buscar as anteriores, quem diz se há mais é a busca (e não as mensagens ao vivo)
  const buscouAnteriores = useRef(false);

  useEffect(() => {
    if (!uid) return;
    return chat.ouvirMensagens(uid, (m, mais) => {
      setRecentes(m);
      setTemMais((t) => (buscouAnteriores.current ? t : mais));
    }, () => setRecentes([]));
  }, [uid]);

  // com a tela aberta, o que chega já está lido
  useEffect(() => {
    if (uid && naoLidasChat > 0 && document.visibilityState === 'visible') void chat.marcarLida(uid);
  }, [uid, naoLidasChat]);

  useLayoutEffect(() => {
    if (segurarRolagem.current) { segurarRolagem.current = false; return; }
    fim.current?.scrollIntoView({ block: 'end' });
  }, [recentes]);

  async function verAnteriores() {
    if (!uid) return;
    setCarregando(true);
    try {
      const r = await chat.anteriores(uid);
      buscouAnteriores.current = true;
      segurarRolagem.current = true;
      setAntigas((a) => [...r.mensagens, ...a]);
      setTemMais(r.temMais);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar.');
    } finally {
      setCarregando(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || !uid) return;
    setTexto('');
    setErro(null);
    try {
      await chat.enviar(uid, t, { nome: me.cliente.nome, numero: me.cliente.numero });
    } catch (err) {
      setTexto(t);
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar.');
    }
  }

  const todas = [...antigas.filter((a) => !recentes?.some((r) => r.id === a.id)), ...(recentes ?? [])];
  let diaAnterior = '';

  return (
    <div className="page chat">
      <PageHeader title="Fale com o bar" subtitle="Dúvidas, pedidos e reservas: a equipe do Dindo responde por aqui." />

      {recentes === null ? <Spinner /> : todas.length === 0 ? (
        <Empty icon={<MessageCircle size={26} />}>Nenhuma mensagem ainda. Mande um oi: a resposta aparece aqui mesmo.</Empty>
      ) : (
        <div className="chat__lista">
          {temMais && (
            <button className="btn btn--ghost btn--small chat__mais" onClick={verAnteriores} disabled={carregando}>
              {carregando ? 'Carregando…' : 'Ver mensagens anteriores'}
            </button>
          )}
          {todas.map((m) => {
            const dia = diaDe(m.criadaEm);
            const mostrarDia = dia !== diaAnterior;
            diaAnterior = dia;
            return (
              <div key={m.id} className="chat__item">
                {mostrarDia && <div className="chat__dia">{dia}</div>}
                <div className={`chat__msg ${m.autor === 'afilhado' ? 'chat__msg--minha' : ''}`}>
                  {m.autor === 'equipe' && <small className="chat__autor">{m.usuarioNome.split(' ')[0] || 'Bar do Dindo'} · Bar do Dindo</small>}
                  <p>{m.texto}</p>
                  <small className="chat__hora">{m.pendente ? 'Enviando…' : hora(m.criadaEm)}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div ref={fim} />

      <form className="chat__form" onSubmit={enviar}>
        {erro && <p className="chat__erro">{erro}</p>}
        <div className="chat__campo">
          <textarea
            className="input" rows={1} maxLength={1000} placeholder="Escreva sua mensagem" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          />
          <button className="btn btn--primary chat__enviar" disabled={!texto.trim()} aria-label="Enviar"><SendHorizontal size={20} /></button>
        </div>
      </form>
    </div>
  );
}
