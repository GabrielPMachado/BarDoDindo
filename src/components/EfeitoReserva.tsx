import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

/** Itens com efeito especial ao serem escolhidos na reserva. */
export type Efeito = 'ps5' | 'karaoke';

export function efeitoDe(nome: string): Efeito | null {
  if (/\bps\s?5\b|playstation/i.test(nome)) return 'ps5';
  if (/karaok/i.test(nome)) return 'karaoke';
  return null;
}

const DURACAO: Record<Efeito, number> = { ps5: 5200, karaoke: 4400 };

/** Números fixos (sem Math.random no render) para espalhar partículas e notas. */
const espalhar = (n: number, semente: number) =>
  Array.from({ length: n }, (_, i) => {
    const x = Math.sin((i + 1) * 12.9898 * semente) * 43758.5453;
    return x - Math.floor(x);
  });

/**
 * Animação de tela cheia ao escolher o PS5 ou o karaokê na reserva. Some sozinha em poucos segundos; um toque encerra antes.
 */
export function EfeitoReserva({ efeito, nome, foto, onFim }: { efeito: Efeito; nome: string; foto?: string; onFim: () => void }) {
  useEffect(() => {
    const t = setTimeout(onFim, DURACAO[efeito]);
    // no celular, um tremido curto acompanha a animação
    try { navigator.vibrate?.(efeito === 'ps5' ? [40, 60, 40, 60, 120] : [30, 50, 30, 50, 30, 50, 90]); } catch { /* sem vibração */ }
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFim();
    window.addEventListener('keydown', tecla);
    return () => { clearTimeout(t); window.removeEventListener('keydown', tecla); };
  }, [efeito, onFim]);

  // direto no body: a tela tem animação com transform, que prenderia o position: fixed à coluna do app
  return createPortal(
    <div className={`efeito efeito--${efeito}`} role="dialog" aria-modal="true" aria-label={`${nome} reservado`} onClick={onFim}>
      {efeito === 'ps5' ? <CenaPS5 nome={nome} /> : <CenaKaraoke nome={nome} foto={foto} />}
      <span className="efeito__pular">Toque para fechar</span>
    </div>,
    document.body,
  );
}

function Foto({ nome, foto }: { nome: string; foto?: string }) {
  return foto ? <img className="efeito__foto" src={foto} alt={nome} /> : null;
}

/** Os quatro símbolos dos botões do controle, desenhados em traço. */
const SIMBOLOS = [
  { id: 'tri', cor: '#3ddc97', d: 'M50 14 L88 80 L12 80 Z' },
  { id: 'cir', cor: '#ff4d6d', d: 'M50 12 A38 38 0 1 1 49.9 12 Z' },
  { id: 'xis', cor: '#5ab0ff', d: 'M18 18 L82 82 M82 18 L18 82' },
  { id: 'qua', cor: '#ff7ad9', d: 'M16 16 H84 V84 H16 Z' },
];

function CenaPS5({ nome }: { nome: string }) {
  const px = espalhar(28, 1.7), py = espalhar(28, 3.1), pd = espalhar(28, 5.3);
  return (
    <div className="ps5">
      {/* camada de fundo: luz, anéis e partículas ficam sempre atrás dos textos */}
      <div className="efeito__fundo" aria-hidden>
        <div className="ps5__luz" />
        <div className="ps5__anel" />
        <div className="ps5__anel ps5__anel--2" />
        {px.map((x, i) => (
          <i key={i} className="ps5__particula" style={{ left: `${x * 100}%`, top: `${30 + py[i] * 70}%`, animationDelay: `${pd[i] * 1.6}s`, '--tam': `${2 + pd[i] * 4}px` } as CSSProperties} />
        ))}
      </div>
      <div className="efeito__miolo ps5__miolo">
        <div className="ps5__simbolos" aria-hidden>
          {SIMBOLOS.map((s, i) => (
            <svg key={s.id} viewBox="0 0 100 100" className="ps5__simbolo" style={{ '--cor': s.cor, '--i': i } as CSSProperties}>
              <path d={s.d} pathLength={1} />
            </svg>
          ))}
        </div>
        <Ps5Realista />
        <strong className="ps5__titulo">PLAYER 1 READY</strong>
        <span className="ps5__sub">{nome} reservado na sua mesa. Prepare o controle!</span>
      </div>
    </div>
  );
}

/** PS5 em 3D de verdade (three.js, medidas oficiais da Sony); sem WebGL, cai no console desenhado em CSS. */
function Ps5Realista() {
  const tela = useRef<HTMLCanvasElement>(null);
  const [semWebGL, setSemWebGL] = useState(false);
  useEffect(() => {
    let cena: { parar: () => void } | null = null, ativo = true;
    import('./ps5Cena')
      .then(({ montarPS5 }) => { if (ativo && tela.current) cena = montarPS5(tela.current); })
      .catch(() => ativo && setSemWebGL(true));
    return () => { ativo = false; cena?.parar(); };
  }, []);
  if (semWebGL) return <Console3D />;
  return <canvas ref={tela} className="ps5-real" aria-hidden />;
}

/** Faces de uma caixa 3D (largura × altura × profundidade, em px), centrada no ponto de origem. */
function Caixa({ l, a, p, x = 0, y = 0, classe }: { l: number; a: number; p: number; x?: number; y?: number; classe: string }) {
  const faces: [string, number, number, string][] = [
    ['frente', l, a, `translateZ(${p / 2}px)`],
    ['tras', l, a, `rotateY(180deg) translateZ(${p / 2}px)`],
    ['lado', p, a, `rotateY(90deg) translateZ(${l / 2}px)`],
    ['lado', p, a, `rotateY(-90deg) translateZ(${l / 2}px)`],
    ['topo', l, p, `rotateX(90deg) translateZ(${a / 2}px)`],
    ['topo', l, p, `rotateX(-90deg) translateZ(${a / 2}px)`],
  ];
  return (
    <div className={`c3d__caixa ${classe}`} style={{ transform: `translate3d(${x}px, ${y}px, 0)` }}>
      {faces.map(([f, w, h, t], i) => (
        <div key={i} className={`c3d__face c3d__face--${f}`} style={{ width: w, height: h, margin: `${-h / 2}px 0 0 ${-w / 2}px`, transform: t }} />
      ))}
    </div>
  );
}

/** Console branco e preto girando em 3D (só CSS): o miolo preto com a luz azul e as duas tampas brancas curvas. */
function Console3D() {
  return (
    <div className="c3d" aria-hidden>
      <div className="c3d__chao" />
      <div className="c3d__giro">
        <Caixa l={22} a={168} p={104} classe="c3d__miolo" />
        {/* tampas brancas: duas placas paralelas com o recorte em asa de cada lado */}
        {[-15, -12, 12, 15].map((x) => (
          // as tampas abrem um pouco para fora no alto, como no console de verdade
          <div key={x} className="c3d__tampa" style={{ transform: `translateX(${x}px) rotateZ(${x < 0 ? -3 : 3}deg) rotateY(90deg)` }} />
        ))}
        <div className="c3d__led" />
        <div className="c3d__base" />
      </div>
    </div>
  );
}

function CenaKaraoke({ nome, foto }: { nome: string; foto?: string }) {
  const nx = espalhar(16, 2.3), nd = espalhar(16, 4.7), barras = espalhar(18, 6.1);
  return (
    <div className="kara">
      <div className="efeito__fundo" aria-hidden>
        <div className="kara__holofote kara__holofote--esq" />
        <div className="kara__holofote kara__holofote--dir" />
        {/* as notas sobem pelas laterais, longe do título */}
        {nx.map((x, i) => (
          <i key={i} className="kara__nota" style={{ left: `${i % 2 ? 76 + x * 20 : 4 + x * 20}%`, animationDelay: `${0.4 + nd[i] * 2}s`, '--giro': `${(nd[i] - 0.5) * 60}deg` } as CSSProperties}>
            {i % 3 === 0 ? '♫' : i % 3 === 1 ? '♪' : '♬'}
          </i>
        ))}
        <div className="kara__eq">
          {barras.map((b, i) => <i key={i} style={{ animationDelay: `${b * -0.9}s`, animationDuration: `${0.45 + b * 0.5}s` }} />)}
        </div>
      </div>
      <div className="efeito__miolo kara__miolo">
        <svg viewBox="0 0 120 200" className="kara__mic" aria-hidden>
          <defs>
            <linearGradient id="kara-grade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff5fd2" />
              <stop offset="1" stopColor="#46e6ff" />
            </linearGradient>
          </defs>
          <rect x="30" y="8" width="60" height="86" rx="30" />
          <path d="M38 34 H82 M36 52 H84 M38 70 H82" className="kara__grade" />
          <path d="M18 70 Q18 122 60 122 Q102 122 102 70 M60 122 V170 M34 176 H86" />
        </svg>
        <Foto nome={nome} foto={foto} />
        <strong className="kara__titulo">Solta a voz!</strong>
        <span className="kara__sub">{nome} reservado. O palco é seu.</span>
      </div>
    </div>
  );
}
