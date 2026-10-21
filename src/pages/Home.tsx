import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Camera, ChevronRight, Clock, Gift, Info, MapPin, MessageCircleQuestion, ReceiptText, Star, Utensils, X } from 'lucide-react';
import { Questionario, useQuestionario } from '../components/Questionario';
import { ItemFoto, ItemIcon } from '../components/ItemIcon';
import { brl, sortCategories } from '../data';
import { memberNumber, upcoming, useMe, useStore } from '../store';

/** Atalhos do painel do afilhado. */
const ATALHOS = [
  { to: '/reservas', label: 'Reservar', icon: CalendarDays },
  { to: '/cardapio', label: 'Cardápio', icon: Utensils },
  { to: '/recompensas', label: 'Recompensas', icon: Gift },
  { to: '/historico', label: 'Histórico', icon: ReceiptText },
];

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dataCurta = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
};

export function Avatar({ editable = false, size = 'lg' }: { editable?: boolean; size?: 'lg' | 'md' }) {
  const { cliente } = useMe();
  const { atualizarPerfil } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const initials = cliente.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  const onFile = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      // reduz a foto antes de enviar ao servidor
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const s = 240;
        c.width = c.height = s;
        const ctx = c.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, s, s);
        atualizarPerfil({ foto: c.toDataURL('image/jpeg', 0.82) }).catch((e) => setErro(e.message));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className={`avatar avatar--${size}`} title={erro ?? undefined}>
      {cliente.foto ? <img src={cliente.foto} alt={cliente.nome} /> : <span className="avatar__initials">{initials}</span>}
      {editable && (
        <>
          <button className="avatar__cam" onClick={() => input.current?.click()} aria-label="Trocar foto">
            <Camera size={18} />
          </button>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </>
      )}
    </div>
  );
}

function BeerGlass() {
  return (
    <svg viewBox="0 0 120 170" className="beer" aria-hidden="true">
      <defs>
        <linearGradient id="beer" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e47a45" />
          <stop offset="0.55" stopColor="#c4572a" />
          <stop offset="1" stopColor="#8f340d" />
        </linearGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M14 30 L106 30 L96 160 Q60 168 24 160 Z" fill="url(#beer)" />
      <path d="M22 40 L34 40 L36 150 L28 150 Z" fill="url(#shine)" />
      <path d="M10 32 Q12 8 34 12 Q44 0 62 8 Q80 0 92 12 Q112 10 110 32 Q60 42 10 32 Z" fill="#fbeade" />
      {[[40, 70], [70, 100], [52, 120], [80, 60], [64, 140]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#fff6" />
      ))}
      <g transform="translate(60 92)" fill="#2e1911" textAnchor="middle" fontFamily="Roboto Slab, Georgia, serif">
        <path d="M-10 -26 L-8 -36 L-3 -31 L0 -38 L3 -31 L8 -36 L10 -26 Z" />
        <text y="-12" fontSize="9" fontWeight="700">BAR DO</text>
        <text y="8" fontSize="20" fontWeight="800">DINDO</text>
        <path d="M-22 14 Q0 20 22 14" stroke="#2e1911" strokeWidth="1.6" fill="none" />
      </g>
    </svg>
  );
}

export default function Home() {
  const me = useMe();
  const { cardapio, recompensas, config } = useStore();
  const proxima = upcoming(me.reservas)[0];
  const categorias = useMemo(() => sortCategories([...new Set(cardapio.map((i) => i.categoria).filter(Boolean))]), [cardapio]);
  const destaques = cardapio.filter((i) => i.destaque);
  const pontosPorReal = config?.pontosPorReal ?? 1;
  const horarios = config?.horarios ?? [];
  // próxima recompensa que ainda não dá para resgatar (ou a mais cara que já dá)
  const ordenadas = [...recompensas].sort((a, b) => a.custo - b.custo);
  const alvo = ordenadas.find((r) => r.custo > me.pontos);
  const podeJa = ordenadas.filter((r) => r.custo <= me.pontos);

  // carrossel: boas-vindas + destaques do cardápio
  const slides = destaques.slice(0, 4);
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);
  const [mostrarNumero, setMostrarNumero] = useState(false);
  const convite = useQuestionario();
  const [responder, setResponder] = useState(false);
  const total = 1 + slides.length;
  const aoRolar = () => {
    const el = trilho.current;
    if (el) setAtual(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="page home">
      {/* painel do afilhado: foto, nome, número e atalhos */}
      <section className="painel">
        <Link to="/perfil" className="painel__eu">
          <Avatar size="md" />
          <span className="painel__info">
            <small>Olá,</small>
            <strong>{me.cliente.nome.split(' ')[0]}</strong>
            <em>Afilhado #{memberNumber(me.cliente.numero)}</em>
          </span>
          <ChevronRight size={20} className="muted" />
        </Link>
      </section>
      <nav className="actions" aria-label="Atalhos">
        {ATALHOS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="action"><Icon size={24} /> {label}</Link>
        ))}
      </nav>

      {me.comanda && (
        <section className="minha-comanda" aria-label="Minha comanda">
          <header>
            <span><ReceiptText size={18} /> Comanda #{String(me.comanda.numero).padStart(3, '0')}{me.comanda.mesa ? ` · Mesa ${me.comanda.mesa}` : ''}</span>
            <b>{brl(me.comanda.total)}</b>
          </header>
          {me.comanda.itens.length ? (
            <ul>{me.comanda.itens.map((i, k) => <li key={k}><span>{i.quantidade}× {i.nome}</span><span>{brl(i.total)}</span></li>)}</ul>
          ) : <p className="muted small">Comanda aberta. Os pedidos aparecem aqui assim que forem lançados.</p>}
          <small>Ao fechar, você ganha +{Math.floor(me.comanda.total * pontosPorReal).toLocaleString('pt-BR')} pts</small>
        </section>
      )}

      {convite.mostrar && (
        <div className="convite">
          <MessageCircleQuestion size={22} />
          <button type="button" className="convite__texto" onClick={() => setResponder(true)}>
            <strong>{convite.questionario?.titulo}</strong>
            <span>Responda algumas perguntas rápidas (opcional).</span>
          </button>
          <button type="button" className="icon-btn" onClick={convite.adiar} aria-label="Agora não"><X size={18} /></button>
        </div>
      )}
      {responder && <Questionario onClose={() => setResponder(false)} />}

      {/* cartão do bar: próxima reserva ou convite para reservar (como o "Retirar em") */}
      <Link to="/reservas" className="local">
        <span className="local__pin"><MapPin size={18} /></span>
        <span className="local__info">
          <strong>{config?.nomeEstabelecimento || 'Bar do Dindo'}</strong>
          {proxima ? (
            <>
              <span className="local__linha"><CalendarDays size={15} /> Sua mesa: {dataCurta(proxima.data)} às {proxima.hora} · {proxima.pessoas} {proxima.pessoas === 1 ? 'pessoa' : 'pessoas'}</span>
              <span className="local__linha"><Clock size={15} /> <b className={proxima.status === 'Confirmada' ? 'ok' : 'wait'}>{proxima.status === 'Confirmada' ? 'Confirmada' : 'Aguardando confirmação'}</b></span>
            </>
          ) : (
            <>
              <span className="local__linha"><CalendarDays size={15} /> Reserve sua mesa pelo app</span>
              {horarios.length > 0 && <span className="local__linha"><Clock size={15} /> Reservas das {horarios[0]} às {horarios[horarios.length - 1]}</span>}
            </>
          )}
        </span>
        <ChevronRight size={20} className="local__seta" />
      </Link>

      {/* saldo de pontos */}
      <section className="saldo">
        <div className="saldo__topo">
          <div>
            <span className="saldo__rotulo">Você tem disponível</span>
            <strong className="saldo__valor">{me.pontos.toLocaleString('pt-BR')} pts</strong>
          </div>
          <button type="button" className="numero-btn" onClick={() => setMostrarNumero(true)} aria-label="Mostrar meu número de afilhado">
            <span>Afilhado</span>
            <b>#{memberNumber(me.cliente.numero)}</b>
            <small>Mostrar</small>
          </button>
        </div>
        <Link to="/recompensas" className="aviso">
          <Info size={18} />
          <span>
            {podeJa.length && !alvo
              ? <>Você já pode resgatar <b>{podeJa[podeJa.length - 1].nome}</b>.</>
              : alvo
                ? <>Faltam <b>{(alvo.custo - me.pontos).toLocaleString('pt-BR')} pts</b> para <b>{alvo.nome}</b>.{podeJa.length ? ' E já dá para resgatar outras.' : ''}</>
                : <>Informe o número <b>#{memberNumber(me.cliente.numero)}</b> ao fechar a conta e ganhe pontos.</>}
          </span>
          <ChevronRight size={18} />
        </Link>
      </section>

      {/* categorias em bolinhas, rolando para o lado */}
      {categorias.length > 0 && <nav className="bolinhas" aria-label="Categorias do cardápio">
        {[...(destaques.length ? ['Destaques'] : []), ...categorias].map((c) => (
            <Link key={c} to={`/cardapio?cat=${encodeURIComponent(c)}`} className="bolinha">
              <span className="bolinha__img">{c === 'Destaques' ? <Star size={28} strokeWidth={1.5} /> : <ItemIcon categoria={c} size="xl" />}</span>
              <span className="bolinha__nome">{c}</span>
            </Link>
          ))}
      </nav>}

      {/* banners */}
      <section className="carrossel" aria-label="Destaques">
        <div className="carrossel__trilho" ref={trilho} onScroll={aoRolar}>
          <div className="carrossel__slide">
            <div className="banner">
              <div className="banner__text">
                <h2>Bem-vindo,<br /><span>Afilhado!</span></h2>
                <p>Boa cerveja, boas companhias<br />e sempre um assunto melhor.</p>
              </div>
              <BeerGlass />
            </div>
          </div>
          {slides.map((p) => (
            <Link key={p.id} to={`/cardapio?cat=${encodeURIComponent('Destaques')}`} className="carrossel__slide">
              <div className="banner banner--produto">
                <div className="banner__text">
                  <small>Destaque da casa</small>
                  <h3>{p.nome}</h3>
                  {(p.resumo || p.descricao) && <p>{p.resumo || p.descricao}</p>}
                  <span className="banner__preco">{brl(p.preco)} <em>+{Math.floor(p.preco * pontosPorReal)} pts</em></span>
                </div>
                <ItemFoto foto={p.foto} categoria={p.categoria} size="xl" alt={p.nome} />
              </div>
            </Link>
          ))}
        </div>
        {total > 1 && (
          <div className="carrossel__pontos" aria-hidden="true">
            {Array.from({ length: total }, (_, k) => <i key={k} className={k === atual ? 'is-on' : ''} />)}
          </div>
        )}
      </section>

      {/* recompensas rolando para o lado */}
      {recompensas.length > 0 && (
        <section className="vitrine">
          <Link to="/recompensas" className="vitrine__titulo">
            <h2>Recompensas</h2>
            <ArrowRight size={24} />
          </Link>
          <div className="vitrine__trilho">
            {ordenadas.map((r) => (
              <Link key={r.id} to="/recompensas" className={`premio ${r.custo <= me.pontos ? 'is-livre' : ''}`}>
                <span className="premio__img"><Gift size={34} strokeWidth={1.4} /></span>
                <span className="premio__info">
                  <span className="premio__pts"><Star size={12} fill="currentColor" /> {r.custo.toLocaleString('pt-BR')} pts</span>
                  <span className="premio__nome">{r.nome}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* produto em destaque */}
      {destaques[0] && (
        <Link to={`/cardapio?cat=${encodeURIComponent('Destaques')}`} className="vitrine-produto">
          <span className="vitrine-produto__tag"><Star size={13} fill="currentColor" /> Destaque</span>
          <ItemFoto foto={destaques[0].foto} categoria={destaques[0].categoria} size="xl" alt={destaques[0].nome} />
          <span className="vitrine-produto__info">
            <strong>{destaques[0].nome}</strong>
            {(destaques[0].resumo || destaques[0].descricao) && <span>{destaques[0].resumo || destaques[0].descricao}</span>}
            <b>{brl(destaques[0].preco)}</b>
          </span>
        </Link>
      )}

      {/* número grande para mostrar ao garçom na hora de fechar a conta */}
      {mostrarNumero && (
        <div className="overlay" onClick={() => setMostrarNumero(false)}>
          <div className="sheet sheet--center numero-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Meu número de afilhado">
            <div className="sheet__handle" />
            <span className="numero-sheet__rotulo">Meu número de afilhado</span>
            <strong className="numero-sheet__num">#{memberNumber(me.cliente.numero)}</strong>
            <span className="numero-sheet__nome">{me.cliente.nome}</span>
            <p className="muted small">Mostre ao garçom ao fechar a conta para ganhar seus pontos.</p>
            <button type="button" className="btn btn--primary" onClick={() => setMostrarNumero(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
