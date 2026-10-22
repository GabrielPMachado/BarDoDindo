import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Maximize2, MapPin, Minimize2, Paintbrush, Phone, RotateCcw } from 'lucide-react';
import { PageHead } from '../../components/ui';
import { criarCena, PAREDES, type Cena, type Parede } from './cena';
import { TINTAS, lojasDa, linkMapa, type Marca, type Tinta } from './tintas';

const MARCAS: Marca[] = ['Suvinil', 'Coral', 'Sherwin-Williams'];
type Alvo = Parede | 'todas';

/** Joystick na tela (celular): devolve -1..1 em cada eixo enquanto o dedo está pressionado. */
function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [ponto, setPonto] = useState<{ x: number; y: number } | null>(null);
  const calc = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const raio = r.width / 2;
    let dx = (e.clientX - (r.left + raio)) / raio;
    let dy = (e.clientY - (r.top + raio)) / raio;
    const d = Math.hypot(dx, dy);
    if (d > 1) { dx /= d; dy /= d; }
    setPonto({ x: dx, y: dy });
    onMove(dx, -dy);
  };
  const soltar = () => { setPonto(null); onMove(0, 0); };
  return (
    <div
      ref={base}
      className="pintura__joy"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); calc(e); }}
      onPointerMove={(e) => ponto && calc(e)}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      aria-label="Andar"
    >
      <span style={{ transform: `translate(${(ponto?.x ?? 0) * 34}px, ${(ponto?.y ?? 0) * 34}px)` }} />
    </div>
  );
}

/**
 * Meu perfil → Simular pintura (recurso temporário): a loja vazia em 3D para andar por dentro
 * e testar cores reais de tinta nas paredes, com as lojas de Porto Alegre que vendem cada marca.
 */
export default function SimuladorPintura() {
  const palco = useRef<HTMLDivElement>(null);
  const cena = useRef<Cena | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Alvo>('todas');
  const [cores, setCores] = useState<Record<Parede, Tinta | null>>({ esquerda: null, direita: null, fundo: null, frente: null });
  const [escolhida, setEscolhida] = useState<Tinta | null>(null);
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    if (!palco.current) return;
    try {
      cena.current = criarCena(palco.current);
    } catch {
      setErro('Seu navegador não conseguiu abrir a visualização 3D (WebGL desativado).');
    }
    return () => { cena.current?.destruir(); cena.current = null; };
  }, []);

  useEffect(() => {
    if (!cheia) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setCheia(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [cheia]);

  const aplicar = (t: Tinta | null) => {
    setEscolhida(t);
    cena.current?.pintar(alvo, t?.hex ?? null);
    setCores((c) => {
      const n = { ...c };
      for (const p of PAREDES) if (alvo === 'todas' || alvo === p.id) n[p.id] = t;
      return n;
    });
  };

  const usadas = [...new Set(Object.values(cores).filter(Boolean) as Tinta[])];

  return (
    <div className="page">
      <PageHead
        title="Simular pintura"
        description="A loja em 3D (cerca de 4,1 m × 10 m ≈ 41 m², medidas estimadas pelas fotos). Escolha uma cor e as paredes mudam na hora. Recurso temporário."
      />

      <div className="pintura">
        <section className={`panel pintura__palco${cheia ? ' is-cheia' : ''}`}>
          <div ref={palco} className="pintura__canvas" />
          {erro && <div className="pintura__erro">{erro}</div>}
          <div className="pintura__acoes">
            <button className="chip" onClick={() => cena.current?.olharPara('fundo')}><RotateCcw size={13} /> Entrada</button>
            <button className="chip" onClick={() => cena.current?.olharPara('frente')}>Ver a frente</button>
            <button className="chip" onClick={() => setCheia((v) => !v)} aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'}>
              {cheia ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>
          <p className="pintura__dica small">
            <span className="so-pc">Arraste para olhar · W A S D ou setas para andar</span>
            <span className="so-toque">Arraste para olhar · joystick para andar</span>
          </p>
          <Joystick onMove={(x, y) => cena.current?.mover(x, y)} />
        </section>

        <aside className="panel pad-lg pintura__lado">
          <h2 className="panel-title"><Paintbrush size={16} className="gold" /> Pintar</h2>
          <div className="pintura__alvos" role="radiogroup" aria-label="Qual parede">
            {([{ id: 'todas', nome: 'Todas' }, ...PAREDES] as { id: Alvo; nome: string }[]).map((p) => (
              <button key={p.id} role="radio" aria-checked={alvo === p.id} className={`chip${alvo === p.id ? ' is-on' : ''}`} onClick={() => setAlvo(p.id)}>
                {p.id !== 'todas' && <i className="pintura__bolinha" style={{ background: cores[p.id as Parede]?.hex ?? '#76736f' }} />}
                {p.nome}
              </button>
            ))}
          </div>

          {MARCAS.map((m) => (
            <div key={m} className="pintura__marca">
              <h3 className="small muted">{m}</h3>
              <div className="pintura__cores">
                {TINTAS.filter((t) => t.marca === m).map((t) => (
                  <button
                    key={t.id}
                    className={`pintura__cor${escolhida?.id === t.id ? ' is-on' : ''}`}
                    style={{ background: t.hex }}
                    title={`${t.nome}${t.codigo ? ` (${t.codigo})` : ''}`}
                    aria-label={`${m} ${t.nome}`}
                    onClick={() => aplicar(t)}
                  />
                ))}
              </div>
            </div>
          ))}
          <button className="link small" onClick={() => aplicar(null)}>Voltar ao concreto original</button>

          {escolhida && (
            <div className="pintura__ficha">
              <div className="pintura__amostra" style={{ background: escolhida.hex }} />
              <div>
                <strong>{escolhida.nome}</strong>
                <div className="small muted">
                  {escolhida.marca}{escolhida.codigo ? ` · ${escolhida.codigo}` : ''} · {escolhida.hex}{' '}
                  <a className="link" href={escolhida.fonte} target="_blank" rel="noreferrer">fonte <ExternalLink size={11} /></a>
                </div>
              </div>
            </div>
          )}

          {(escolhida ? [escolhida.marca] : [...new Set(usadas.map((t) => t.marca))]).map((m) => (
            <div key={m} className="pintura__lojas">
              <h3 className="small"><MapPin size={13} className="gold" /> Onde comprar {m} em Porto Alegre</h3>
              <ul>
                {lojasDa(m).map((l) => (
                  <li key={l.nome}>
                    <a className="link" href={linkMapa(l)} target="_blank" rel="noreferrer">{l.nome}</a>
                    <div className="small muted">{l.endereco}</div>
                    {l.telefone && <div className="small muted"><Phone size={11} /> {l.telefone}</div>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="small muted">
            Cores na tela são aproximadas e mudam com a luz do ambiente: confira no leque da loja. A tinta é preparada
            na máquina pelo nome ou código; ligue antes para confirmar a marca e o estoque.
          </p>
        </aside>
      </div>
    </div>
  );
}
