/**
 * Acabamento das fotos dos chopes, feito no navegador depois que a foto volta do Gemini:
 * 1. realce: tira o véu (níveis e pretos mais fundos), dá clareza e nitidez — a foto modelo já vem suave e a IA copia isso;
 *    depois troca a placa redonda da parede pelo logo de verdade, nítido (a IA a deixa desfocada), e realça o logo do copo;
 * 2. plaquinha: cobre a plaquinha da foto com a madeira limpa e escreve o texto do chopp em Zilla Slab, sempre dentro da
 *    madeira (uma linha; se não couber, copo em cima e estilo embaixo).
 * As fotos do cardápio têm sempre o mesmo enquadramento (1024 × 764), então a plaquinha fica num lugar fixo.
 */
import logoUrl from '../../../shared/assets/logo.webp';
import plaquinhaUrl from '../assets/plaquinha-chopp.jpg';
import zillaUrl from '../assets/zilla-slab-700.woff2';
import type { Copo } from './iaFoto';
import { plaquinhaDoChopp } from './iaFoto';

const W = 1024, H = 764;
/** Onde fica a plaquinha (a imagem limpa) e a área útil de texto dentro dela. */
const PLACA = { x: 40, y: 596, w: 332, h: 80 };
const TEXTO = { x: 64, y: 606, w: 284, h: 60, margem: 14 };
const FONTE = 'ZillaSlabDindo';
type Area = { x: number; y: number; w: number; h: number };
/** A placa redonda da parede (igual nos três copos: centro e tamanho na foto modelo) e o logo gravado em cada copo. */
const PLACA_PAREDE = { cx: 826, cy: 236, w: 216, h: 252 };
const LOGO: Record<Copo, Area> = {
  'Half-pint': { x: 410, y: 350, w: 200, h: 140 },
  Pint: { x: 390, y: 250, w: 250, h: 170 },
  Jarra: { x: 430, y: 280, w: 250, h: 140 },
};
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

/** Máscara unsharp nos dados: original + força × (original − desfocada), ignorando diferenças até o limiar. */
function nitidez(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, raio: number, forca: number, limiar: number, brilho = 1) {
  const base = ctx.getImageData(0, 0, c.width, c.height);
  const b = base.data;
  const d = desfocada(c, raio);
  for (let i = 0; i < b.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const dif = b[i + k] - d[i + k];
      const v = Math.abs(dif) > limiar ? b[i + k] + forca * dif : b[i + k];
      b[i + k] = v * brilho;
    }
  }
  ctx.putImageData(base, 0, 0);
}

/** Destaque local: mais clareza e nitidez numa área, misturada à foto por uma elipse de borda suave (sem emenda visível). */
function destacar(foto: HTMLCanvasElement, a: Area, clareza: number, nit: number, brilho: number) {
  const { c, ctx } = tela(a.w, a.h);
  ctx.drawImage(foto, a.x, a.y, a.w, a.h, 0, 0, a.w, a.h);
  nitidez(c, ctx, 12, clareza, 0);
  nitidez(c, ctx, 1.2, nit, 1, brilho);
  const m = tela(a.w, a.h);
  const pena = Math.min(a.w, a.h) / 8;
  m.ctx.filter = `blur(${pena}px)`;
  m.ctx.beginPath();
  m.ctx.ellipse(a.w / 2, a.h / 2, a.w / 2 - pena, a.h / 2 - pena, 0, 0, Math.PI * 2);
  m.ctx.fill();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(m.c, 0, 0);
  foto.getContext('2d')!.drawImage(c, a.x, a.y);
}

/**
 * Realce: níveis (corta 0,5% dos escuros e 0,3% dos claros), pretos um pouco mais fundos, clareza e nitidez;
 * com o copo, também põe em evidência a placa da parede e o logo do copo.
 */
export async function realcarFoto(fonte: Blob | string, copo?: Copo): Promise<HTMLCanvasElement> {
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
  nitidez(c, ctx, 25, 0.22, 0);
  nitidez(c, ctx, 1.4, 0.7, 2);
  await trocarPlaca(c);
  if (copo) destacar(c, LOGO[copo], 0.7, 1.1, 1);
  return c;
}

let logo: Promise<CanvasImageSource> | null = null;
const luminancia = (d: Uint8ClampedArray, i: number) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;

/** Pixels do logo em w × h: luminância e se está dentro do disco. */
function logoEm(img: CanvasImageSource, w: number, h: number) {
  const { ctx } = tela(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const idx: number[] = [], lum: number[] = [];
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 128) { idx.push(i); lum.push(luminancia(d, i * 4)); }
  const media = lum.reduce((a, b) => a + b, 0) / lum.length;
  const desvio = Math.sqrt(lum.reduce((a, b) => a + (b - media) ** 2, 0) / lum.length) || 1;
  return { idx: Int32Array.from(idx), t: Float32Array.from(lum, (v) => (v - media) / desvio), w, h };
}

/** Correlação (−1 a 1) entre o logo e a foto (luminância `f`, largura `fw`) com o canto em (x, y). */
function correlacao(f: Float32Array, fw: number, m: ReturnType<typeof logoEm>, x: number, y: number) {
  let s = 0, s2 = 0, st = 0;
  const n = m.idx.length;
  for (let k = 0; k < n; k++) {
    const j = m.idx[k];
    const v = f[(y + ((j / m.w) | 0)) * fw + x + (j % m.w)];
    s += v; s2 += v * v; st += v * m.t[k];
  }
  const media = s / n, desvio = Math.sqrt(Math.max(1e-6, s2 / n - media * media));
  return st / n / desvio;
}

/**
 * Troca a placa redonda da parede pelo logo de verdade, nítido: acha a placa perto de onde ela fica na foto modelo
 * (comparando com o logo em vários tamanhos), ajusta as cores do logo às da placa da foto e mantém a luz que bate nela.
 * Se não achar com segurança, a placa da foto fica como está.
 */
async function trocarPlaca(foto: HTMLCanvasElement) {
  logo ??= imagem(logoUrl);
  const img = await logo;
  const reduzida = (f: number) => {
    const w = Math.round(W / f), h = Math.round(H / f);
    const { ctx } = tela(w, h);
    ctx.drawImage(foto, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    return { f: Float32Array.from({ length: w * h }, (_, i) => luminancia(d, i * 4)), w, h };
  };
  /** Procura em 1/f do tamanho: larguras `ws`, alturas `hs`, com o centro a até `raio` px (no tamanho real) de (cx, cy). */
  const procurar = (f: number, ws: number[], hs: number[], cx: number, cy: number, raio: number) => {
    const r = reduzida(f);
    let melhor = { nota: -2, x: 0, y: 0, w: 0, h: 0 };
    for (const w of ws) for (const h of hs) {
      const m = logoEm(img, w, h);
      const x0 = Math.round(cx / f - w / 2), y0 = Math.round(cy / f - h / 2), d = Math.round(raio / f);
      for (let y = y0 - d; y <= y0 + d; y++) for (let x = x0 - d; x <= x0 + d; x++) {
        if (x < 0 || y < 0 || x + w > r.w || y + h > r.h) continue;
        const nota = correlacao(r.f, r.w, m, x, y);
        if (nota > melhor.nota) melhor = { nota, x: x * f, y: y * f, w: w * f, h: h * f };
      }
    }
    return melhor;
  };
  const faixa = (a: number, b: number, passo = 1) => Array.from({ length: Math.floor((b - a) / passo) + 1 }, (_, i) => a + i * passo);
  const P = PLACA_PAREDE;
  // grosso, em 1/4: tamanhos de 70% a 125% do modelo e até 48 px para os lados
  const g = procurar(4,
    faixa(Math.round(P.w * 0.7 / 4), Math.round(P.w * 1.25 / 4), 3), faixa(Math.round(P.h * 0.7 / 4), Math.round(P.h * 1.25 / 4), 3),
    P.cx, P.cy, 48);
  if (g.nota < 0.35) return;
  // fino, em 1/2, em volta do grosso
  const a = procurar(2, faixa(g.w / 2 - 6, g.w / 2 + 6, 2), faixa(g.h / 2 - 6, g.h / 2 + 6, 2), g.x + g.w / 2, g.y + g.h / 2, 8);
  if (a.nota < 0.35) return;
  // o logo no tamanho achado, com as cores (média e contraste por canal) da placa da foto e a luz dela
  const fctx = foto.getContext('2d')!;
  const regiao = fctx.getImageData(a.x, a.y, a.w, a.h);
  const rp = regiao.data;
  const novo = tela(a.w, a.h);
  novo.ctx.drawImage(img, 0, 0, a.w, a.h);
  const nd = novo.ctx.getImageData(0, 0, a.w, a.h);
  const lp = nd.data;
  const luz = tela(a.w, a.h);
  luz.ctx.putImageData(regiao, 0, 0);
  const borrada = tela(a.w, a.h);
  borrada.ctx.filter = 'blur(25px)';
  borrada.ctx.drawImage(luz.c, 0, 0);
  const bl = borrada.ctx.getImageData(0, 0, a.w, a.h).data;
  const est = (d: Uint8ClampedArray, c: number) => {
    let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (lp[i + 3] > 128) { s += d[i + c]; s2 += d[i + c] ** 2; n++; }
    const m = s / n;
    return { m, d: Math.sqrt(Math.max(1, s2 / n - m * m)) };
  };
  const ef = [0, 1, 2].map((c) => est(rp, c)), el = [0, 1, 2].map((c) => est(lp, c));
  let sl = 0, nl = 0;
  for (let i = 0; i < bl.length; i += 4) if (lp[i + 3] > 128) { sl += luminancia(bl, i); nl++; }
  const luzMedia = sl / nl || 1;
  for (let i = 0; i < lp.length; i += 4) {
    const al = lp[i + 3] / 255;
    if (!al) continue;
    const ganho = Math.pow(Math.max(0.2, luminancia(bl, i) / luzMedia), 0.8);
    for (let c = 0; c < 3; c++) {
      const v = ((lp[i + c] - el[c].m) / el[c].d * ef[c].d + ef[c].m) * ganho;
      rp[i + c] = rp[i + c] * (1 - al) + Math.min(255, Math.max(0, v)) * al;
    }
  }
  fctx.putImageData(regiao, a.x, a.y);
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
  ctx.fillStyle = 'rgb(36, 22, 12)';
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
  // uma linha, grande para ler de longe (24 px) até 19 px
  let px = 24;
  while (px > 19 && medir(linha, px) > largura) px--;
  if (medir(linha, px) <= largura) {
    gravar(ctx, linha, cx, cy);
  } else {
    // duas linhas: o copo em cima e o estilo embaixo, diminuindo até caber
    const [l1, l2] = [copo.toUpperCase(), estilo.toUpperCase()];
    px = 22;
    while (px > 11 && Math.max(medir(l1, px), medir(l2, px)) > largura) px--;
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
