import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

/** Itens com efeito especial ao serem escolhidos na reserva. */
export type Efeito = 'ps5' | 'karaoke';

export function efeitoDe(nome: string): Efeito | null {
  if (/\bps\s?5\b|playstation/i.test(nome)) return 'ps5';
  if (/karaok/i.test(nome)) return 'karaoke';
  return null;
}

const DURACAO: Record<Efeito, number> = { ps5: 3600, karaoke: 3800 };

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
      {efeito === 'ps5' ? <CenaPS5 nome={nome} foto={foto} /> : <CenaKaraoke nome={nome} foto={foto} />}
      <span className="efeito__pular">Toque para continuar</span>
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

function CenaPS5({ nome, foto }: { nome: string; foto?: string }) {
  const px = espalhar(28, 1.7), py = espalhar(28, 3.1), pd = espalhar(28, 5.3);
  return (
    <div className="ps5">
      <div className="ps5__luz" />
      <div className="ps5__anel" />
      <div className="ps5__anel ps5__anel--2" />
      <div className="ps5__particulas" aria-hidden>
        {px.map((x, i) => (
          <i key={i} style={{ left: `${x * 100}%`, top: `${40 + py[i] * 60}%`, animationDelay: `${pd[i] * 1.6}s`, '--tam': `${2 + pd[i] * 4}px` } as CSSProperties} />
        ))}
      </div>
      <div className="ps5__simbolos" aria-hidden>
        {SIMBOLOS.map((s, i) => (
          <svg key={s.id} viewBox="0 0 100 100" className={`ps5__simbolo ps5__simbolo--${s.id}`} style={{ '--cor': s.cor, '--i': i } as CSSProperties}>
            <path d={s.d} pathLength={1} />
          </svg>
        ))}
      </div>
      <div className="ps5__miolo">
        <Foto nome={nome} foto={foto} />
        <strong className="ps5__titulo">PLAYER 1 READY</strong>
        <span className="ps5__sub">{nome} reservado na sua mesa. Prepare o controle!</span>
      </div>
    </div>
  );
}

function CenaKaraoke({ nome, foto }: { nome: string; foto?: string }) {
  const nx = espalhar(16, 2.3), nd = espalhar(16, 4.7), barras = espalhar(18, 6.1);
  return (
    <div className="kara">
      <div className="kara__holofote kara__holofote--esq" />
      <div className="kara__holofote kara__holofote--dir" />
      <div className="kara__notas" aria-hidden>
        {nx.map((x, i) => (
          <i key={i} style={{ left: `${6 + x * 88}%`, animationDelay: `${0.4 + nd[i] * 2}s`, '--giro': `${(nd[i] - 0.5) * 60}deg` } as CSSProperties}>
            {i % 3 === 0 ? '♫' : i % 3 === 1 ? '♪' : '♬'}
          </i>
        ))}
      </div>
      <div className="kara__miolo">
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
      <div className="kara__eq" aria-hidden>
        {barras.map((b, i) => <i key={i} style={{ animationDelay: `${b * -0.9}s`, animationDuration: `${0.45 + b * 0.5}s` }} />)}
      </div>
    </div>
  );
}
