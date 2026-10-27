import { useEffect, useRef, useState, type RefObject } from 'react';
import QRCode from 'qrcode';
import { Camera, Copy, Download, Printer, QrCode as QrIcon } from 'lucide-react';
import logoUrl from '../../../shared/assets/logo.webp';
import { PageHead, notify } from '../components/ui';
import { enderecoPublico } from '../../../shared/firebase-config';

const DESTINOS = {
  app: { label: 'Aplicativo (cadastro completo)', caminho: '/?via=qr' },
  pre: { label: 'Página de pré-cadastro', caminho: '/afilhado?via=qr' },
} as const;
type Destino = keyof typeof DESTINOS;
type Papel = 'A4' | 'A5';
type Fundo = 'escuro' | 'claro';

/** Endereço para digitar à mão: sem https:// e sem o ?via=qr. */
const enderecoEscrito = (url: string) => url.replace(/^https?:\/\//, '').replace(/\?.*$/, '').replace(/\/$/, '');

/** O cartaz em si: usado na prévia da tela e na folha impressa (mede tudo pela largura, então serve para A4 e A5). */
function Cartaz({ qr, url, fundo, folha }: { qr: RefObject<HTMLCanvasElement | null>; url: string; fundo: Fundo; folha: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={folha} className={`cartaz cartaz--${fundo}`}>
      <div className="cartaz__moldura">
        <img src={logoUrl} alt="" className="cartaz__logo" />
        <span className="cartaz__eyebrow">Programa de afilhados</span>
        <h1 className="cartaz__titulo">&ldquo;AFILHIE-SE&rdquo;</h1>
        <p className="cartaz__sub">Vire afilhado do Dindo e transforme cada visita em pontos.</p>
        <div className="cartaz__qr"><canvas ref={qr} /></div>
        <p className="cartaz__mira"><Camera aria-hidden="true" /> Aponte a câmera do celular</p>
        <ol className="cartaz__passos">
          <li><b>1</b><strong>Cadastre-se</strong><span>Leva um minuto</span></li>
          <li><b>2</b><strong>Some pontos</strong><span>A cada comanda</span></li>
          <li><b>3</b><strong>Resgate prêmios</strong><span>Com seus pontos</span></li>
        </ol>
        <div className="cartaz__rodape">
          <span>ou acesse <strong>{enderecoEscrito(url)}</strong></span>
          <span className="cartaz__18"><b>18+</b> Exclusivo para maiores de 18 anos</span>
        </div>
      </div>
    </div>
  );
}

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
  const [papel, setPapel] = useState<Papel>('A4');
  const [fundo, setFundo] = useState<Fundo>('escuro');
  const url = `${enderecoPublico()}${DESTINOS[destino].caminho}`;
  const qr = useRef<HTMLCanvasElement>(null);
  const cartaz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (qr.current) void desenhar(qr.current, url, 1200);
  }, [url]);

  const baixar = async () => {
    const c = document.createElement('canvas');
    await desenhar(c, url, 1200);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = 'qrcode-afilie-se-bar-do-dindo.png';
    a.click();
  };
  /** Imprime só o cartaz, numa folha à parte (iframe do tamanho do papel, margem zero): sem o Cérebro atrás, sem cabeçalho e rodapé do navegador. */
  const imprimir = () => {
    if (!cartaz.current || !qr.current) return;
    const copia = cartaz.current.cloneNode(true) as HTMLElement;
    const img = document.createElement('img');
    img.src = qr.current.toDataURL('image/png');
    copia.querySelector('canvas')?.replaceWith(img);
    const [w, h] = papel === 'A4' ? ['210mm', '297mm'] : ['148mm', '210mm'];
    const estilos = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((e) => e.outerHTML).join('');
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${w};height:${h};border:0;`;
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cartaz Afilhie-se</title>${estilos}<style>@page { size: ${papel} portrait; margin: 0; } html, body { margin: 0; background: #fff; } .cartaz { width: ${w}; height: ${h}; aspect-ratio: auto; }</style></head><body>${copia.outerHTML}</body></html>`);
    doc.close();
    const fim = () => setTimeout(() => frame.remove(), 500);
    frame.contentWindow!.addEventListener('afterprint', fim);
    void Promise.all([doc.fonts.ready, ...[...doc.images].map((i) => i.decode().catch(() => undefined))]).then(() => {
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
    });
  };
  const copiar = async () => {
    await navigator.clipboard.writeText(url).then(() => notify('Link copiado.'), () => notify('Não foi possível copiar o link.', 'error'));
  };

  return (
    <div className="page">
      <PageHead title="QR Code Afilhie-se" description="Coloque nas mesas, no balcão e na entrada: quem aponta a câmera cai direto no cadastro de afilhados (só maiores de 18 anos)." />
      <div className="qr-grid">
        <section className="panel pad-lg qr-painel">
          <div className="cartaz-previa"><Cartaz qr={qr} folha={cartaz} url={url} fundo={fundo} /></div>
          <div className="qr-acoes">
            <button type="button" className="btn btn--primary" onClick={imprimir}><Printer size={16} /> Imprimir cartaz {papel}</button>
            <button type="button" className="btn btn--ghost" onClick={() => void baixar()}><Download size={16} /> Baixar QR</button>
            <button type="button" className="btn btn--ghost" onClick={() => void copiar()}><Copy size={16} /> Copiar link</button>
          </div>
        </section>
        <section className="panel pad-lg qr-config">
          <h2 className="panel-title"><QrIcon size={16} className="gold" /> Para onde o QR Code leva</h2>
          <div className="qr-destinos" role="radiogroup">
            {(Object.keys(DESTINOS) as Destino[]).map((k) => (
              <label key={k} className={`qr-destino ${destino === k ? 'is-on' : ''}`}>
                <input type="radio" name="destino" checked={destino === k} onChange={() => setDestino(k)} />
                <span><strong>{DESTINOS[k].label}</strong><small>{DESTINOS[k].caminho}</small></span>
              </label>
            ))}
          </div>
          <code className="qr-url">{url}</code>
          <h2 className="panel-title"><Printer size={16} className="gold" /> Cartaz</h2>
          <div className="cartaz-opcao">
            <span className="small">Papel</span>
            <div className="segmented" role="radiogroup" aria-label="Papel">
              {(['A4', 'A5'] as Papel[]).map((p) => <button key={p} type="button" role="radio" aria-checked={papel === p} className={papel === p ? 'is-active' : ''} onClick={() => setPapel(p)}>{p}</button>)}
            </div>
          </div>
          <div className="cartaz-opcao">
            <span className="small">Fundo</span>
            <div className="segmented" role="radiogroup" aria-label="Fundo">
              {([['escuro', 'Escuro'], ['claro', 'Claro (gasta menos tinta)']] as [Fundo, string][]).map(([f, l]) => <button key={f} type="button" role="radio" aria-checked={fundo === f} className={fundo === f ? 'is-active' : ''} onClick={() => setFundo(f)}>{l}</button>)}
            </div>
          </div>
          <ul className="muted small qr-dicas">
            <li>O cartaz sai sozinho na folha, de ponta a ponta. Na janela de impressão, deixe a escala em 100% e, se o fundo escuro sair branco, ative <b>Gráficos de fundo</b>.</li>
            <li>O cadastro pede nome, CPF, data de nascimento, e-mail e celular, e recusa menores de 18 anos.</li>
            <li>Quem se cadastra pelo QR Code aparece com a origem <b>QR Code</b> em Clientes (afilhados).</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
