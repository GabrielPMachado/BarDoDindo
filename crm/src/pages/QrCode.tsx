import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Printer, QrCode as QrIcon } from 'lucide-react';
import logoUrl from '../../../shared/assets/logo.webp';
import { PageHead, notify } from '../components/ui';

const DESTINOS = {
  app: { label: 'Aplicativo (cadastro completo)', caminho: '/?via=qr' },
  pre: { label: 'Página de pré-cadastro', caminho: '/afilhado?via=qr' },
} as const;
type Destino = keyof typeof DESTINOS;

/** Desenha o QR Code (correção alta, para aguentar o logo no meio) com o logo do bar no centro. */
async function desenhar(canvas: HTMLCanvasElement, url: string, tamanho: number) {
  await QRCode.toCanvas(canvas, url, { errorCorrectionLevel: 'H', margin: 2, width: tamanho, color: { dark: '#1b1210', light: '#ffffff' } });
  const logo = new Image();
  logo.src = logoUrl;
  await logo.decode().catch(() => undefined);
  if (!logo.naturalWidth) return;
  const ctx = canvas.getContext('2d')!;
  const l = canvas.width * 0.22;
  const c = canvas.width / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(c, c, l / 2 + canvas.width * 0.015, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(c, c, l / 2, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(logo, c - l / 2, c - l / 2, l, l);
  ctx.restore();
}

/** QR Code "Afilhie-se": leva ao cadastro de afilhados e marca a origem (QR Code) no cadastro. Baixa em PNG ou imprime um cartaz. */
export default function QrCodeAfilhados() {
  const [destino, setDestino] = useState<Destino>('app');
  const url = `${location.origin}${DESTINOS[destino].caminho}`;
  const tela = useRef<HTMLCanvasElement>(null);
  const cartaz = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (tela.current) void desenhar(tela.current, url, 320);
    if (cartaz.current) void desenhar(cartaz.current, url, 900);
  }, [url]);

  const baixar = async () => {
    const c = document.createElement('canvas');
    await desenhar(c, url, 1200);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'qrcode-afilie-se-bar-do-dindo.png';
    a.click();
  };
  const imprimir = () => {
    document.body.classList.add('imprimir-cartaz');
    const fim = () => { document.body.classList.remove('imprimir-cartaz'); removeEventListener('afterprint', fim); };
    addEventListener('afterprint', fim);
    print();
  };
  const copiar = async () => {
    await navigator.clipboard.writeText(url).then(() => notify('Link copiado.'), () => notify('Não foi possível copiar o link.', 'error'));
  };

  return (
    <div className="page">
      <PageHead title="QR Code Afilhie-se" description="Coloque nas mesas, no balcão e na entrada: quem aponta a câmera cai direto no cadastro de afilhados (só maiores de 18 anos)." />
      <div className="qr-grid">
        <section className="panel pad-lg qr-painel">
          <canvas ref={tela} className="qr-canvas" aria-label={`QR Code para ${url}`} />
          <code className="qr-url">{url}</code>
          <div className="qr-acoes">
            <button type="button" className="btn btn--primary" onClick={() => void baixar()}><Download size={16} /> Baixar PNG</button>
            <button type="button" className="btn btn--ghost" onClick={imprimir}><Printer size={16} /> Imprimir cartaz</button>
            <button type="button" className="btn btn--ghost" onClick={() => void copiar()}><Copy size={16} /> Copiar link</button>
          </div>
        </section>
        <section className="panel pad-lg">
          <h2 className="panel-title"><QrIcon size={16} className="gold" /> Para onde o QR Code leva</h2>
          <div className="qr-destinos" role="radiogroup">
            {(Object.keys(DESTINOS) as Destino[]).map((k) => (
              <label key={k} className={`qr-destino ${destino === k ? 'is-on' : ''}`}>
                <input type="radio" name="destino" checked={destino === k} onChange={() => setDestino(k)} />
                <span><strong>{DESTINOS[k].label}</strong><small>{DESTINOS[k].caminho}</small></span>
              </label>
            ))}
          </div>
          <ul className="muted small qr-dicas">
            <li>O cadastro pede nome, CPF, data de nascimento, e-mail e celular, e recusa menores de 18 anos.</li>
            <li>Quem se cadastra pelo QR Code aparece com a origem <b>QR Code</b> em Clientes (afilhados).</li>
            <li>Imprima com pelo menos 6 cm de lado para a câmera ler de longe.</li>
          </ul>
        </section>
      </div>

      {/* cartaz que sai na impressão (fica escondido na tela) */}
      <div className="cartaz" aria-hidden="true">
        <img src={logoUrl} alt="" className="cartaz__logo" />
        <h1>Seja afilhado do Dindo</h1>
        <p>Aponte a câmera, cadastre-se e ganhe pontos a cada visita.</p>
        <canvas ref={cartaz} className="cartaz__qr" />
        <strong className="cartaz__18">Programa exclusivo para maiores de 18 anos</strong>
        <small>{url}</small>
      </div>
    </div>
  );
}
