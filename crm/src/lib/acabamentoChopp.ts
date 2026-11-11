/**
 * Acabamento das fotos dos chopes, feito no navegador depois que a foto volta do Gemini:
 * 1. realce: tira o véu (níveis e pretos mais fundos), dá clareza e nitidez — a foto modelo já vem suave e a IA copia isso;
 * 2. plaquinha: cobre a plaquinha da foto com a madeira limpa e escreve o texto do chopp em Zilla Slab, sempre dentro da
 *    madeira (uma linha; se não couber, copo em cima e estilo embaixo).
 * As fotos do cardápio têm sempre o mesmo enquadramento (1024 × 764), então a plaquinha fica num lugar fixo.
 */
import plaquinhaUrl from '../assets/plaquinha-chopp.jpg';
import zillaUrl from '../assets/zilla-slab-700.woff2';
import type { Copo } from './iaFoto';
import { plaquinhaDoChopp } from './iaFoto';

const W = 1024, H = 764;
/** Onde fica a plaquinha (a imagem limpa) e a área útil de texto dentro dela. */
const PLACA = { x: 40, y: 596, w: 332, h: 80 };
const TEXTO = { x: 64, y: 606, w: 284, h: 60, margem: 14 };
const FONTE = 'ZillaSlabDindo';
/** Mesmo limite de `fotoNoTamanho` para as fotos de cadastro. */
const LIMITE = 200_000;

function tela(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('O navegador não deixou preparar a foto.');
  return { c, ctx };
}

async function imagem(fonte: Blob | string): Promise<CanvasImageSource> {
  const blob = typeof fonte === 'string' ? await (await fetch(fonte)).blob() : fonte;
  return createImageBitmap(blob);
}

/** O navegador aplica `ctx.filter` (Chrome, Edge, Firefox e Safari 18+); sem ele, o realce fica só nos níveis. */
function temFiltro(ctx: CanvasRenderingContext2D) {
  if (typeof ctx.filter !== 'string') return false;
  ctx.filter = 'blur(2px)';
  const ok = ctx.filter === 'blur(2px)';
  ctx.filter = 'none';
  return ok;
}

/** Cópia desfocada da tela, para clareza (raio grande) e nitidez (raio pequeno). */
function desfocada(origem: HTMLCanvasElement, raio: number) {
  const { c, ctx } = tela(origem.width, origem.height);
  ctx.filter = `blur(${raio}px)`;
  ctx.drawImage(origem, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

/** Realce: níveis (corta 0,5% dos escuros e 0,3% dos claros), pretos um pouco mais fundos, clareza e nitidez. */
export async function realcarFoto(fonte: Blob | string): Promise<HTMLCanvasElement> {
  const { c, ctx } = tela();
  ctx.drawImage(await imagem(fonte), 0, 0, W, H);
  const dados = ctx.getImageData(0, 0, W, H);
  const p = dados.data;
  // níveis pelo histograma da luminância
  const hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) hist[(p[i] * 77 + p[i + 1] * 150 + p[i + 2] * 29) >> 8]++;
  const total = W * H;
  let lo = 0, hi = 255, soma = 0;
  for (let v = 0; v < 256; v++) { soma += hist[v]; if (soma >= total * 0.005) { lo = v; break; } }
  soma = 0;
  for (let v = 255; v >= 0; v--) { soma += hist[v]; if (soma >= total * 0.003) { hi = v; break; } }
  if (hi - lo < 64) { lo = 0; hi = 255; }
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), 1.08);
  for (let i = 0; i < p.length; i += 4) { p[i] = lut[p[i]]; p[i + 1] = lut[p[i + 1]]; p[i + 2] = lut[p[i + 2]]; }
  ctx.putImageData(dados, 0, 0);
  if (!temFiltro(ctx)) return c;
  // clareza (contraste local) e nitidez: original + força × (original − desfocada)
  for (const [raio, forca, limiar] of [[25, 0.22, 0], [1.4, 0.7, 2]] as const) {
    const base = ctx.getImageData(0, 0, W, H);
    const b = base.data;
    const d = desfocada(c, raio);
    for (let i = 0; i < b.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const dif = b[i + k] - d[i + k];
        if (Math.abs(dif) > limiar) b[i + k] = b[i + k] + forca * dif;
      }
    }
    ctx.putImageData(base, 0, 0);
  }
  return c;
}

let fonteCarregada: Promise<void> | null = null;
function carregarFonte() {
  fonteCarregada ??= new FontFace(FONTE, `url(${zillaUrl})`, { weight: '700' }).load().then((f) => { document.fonts.add(f); });
  return fonteCarregada;
}
let madeira: Promise<CanvasImageSource> | null = null;

/** Escreve um texto gravado na madeira (marrom-escuro, com um fio claro embaixo, como as letras das fotos aprovadas). */
function gravar(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number) {
  ctx.fillStyle = 'rgba(214, 176, 128, .9)';
  ctx.fillText(texto, x, y + 1);
  ctx.fillStyle = 'rgb(48, 30, 18)';
  ctx.fillText(texto, x, y);
}

/**
 * Copia a foto realçada, troca a plaquinha pela madeira limpa e escreve o texto do chopp. Devolve a data URL JPEG em 1024 px,
 * baixando a qualidade aos poucos até caber no limite das fotos de cadastro (200 mil caracteres): a nitidez do realce deixa
 * o arquivo mais pesado, e cair para 800 px desfaria o ganho.
 */
export async function fotoComPlaquinha(base: HTMLCanvasElement, copo: Copo, estilo: string): Promise<string> {
  await carregarFonte();
  madeira ??= imagem(plaquinhaUrl);
  const { c, ctx } = tela();
  ctx.drawImage(base, 0, 0, W, H);
  ctx.drawImage(await madeira, PLACA.x, PLACA.y, PLACA.w, PLACA.h);
  const largura = TEXTO.w - 2 * TEXTO.margem;
  const cx = TEXTO.x + TEXTO.w / 2, cy = TEXTO.y + TEXTO.h / 2 + 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const medir = (t: string, px: number) => { ctx.font = `700 ${px}px ${FONTE}`; return ctx.measureText(t).width; };
  const linha = plaquinhaDoChopp(copo, estilo);
  // uma linha, do tamanho das fotos aprovadas (20 px) até 17 px
  let px = 20;
  while (px > 17 && medir(linha, px) > largura) px--;
  if (medir(linha, px) <= largura) {
    gravar(ctx, linha, cx, cy);
  } else {
    // duas linhas: o copo em cima e o estilo embaixo, diminuindo até caber
    const [l1, l2] = [copo.toUpperCase(), estilo.toUpperCase()];
    px = 19;
    while (px > 10 && Math.max(medir(l1, px), medir(l2, px)) > largura) px--;
    ctx.font = `700 ${px}px ${FONTE}`;
    const passo = Math.round(px * 0.6) + 1;
    gravar(ctx, l1, cx, cy - passo);
    gravar(ctx, l2, cx, cy + passo);
  }
  let foto = '';
  for (const q of [0.86, 0.82, 0.78, 0.74, 0.7]) {
    foto = c.toDataURL('image/jpeg', q);
    if (foto.length <= LIMITE) return foto;
  }
  return foto;
}
