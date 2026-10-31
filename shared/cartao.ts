/* Imagem do cartão de afilhado (frente e verso), igual à que o afilhado salva no pré-cadastro:
 * 'post' (1440×1800, para salvar) ou 'stories' (1080×1920, para o Instagram). O Cérebro usa a mesma para cada afilhado. */
import { nomeBonito } from './questionario';

export interface AfilhadoCartao { numero: number; nome: string; desde: string }

/** #001; a equipe tem números negativos (#-001). */
export const numeroCartao = (n: number) => (n < 0 ? '-' : '') + String(Math.abs(n)).padStart(3, '0');
const pad = numeroCartao;
export const nomeCurto = (nome: string) => { const p = nomeBonito(nome).split(' '); return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0]; };
export const desdeTexto = (d: string) => 'Afilhado desde o dia ' + new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

const desenhaCartao = (g: CanvasRenderingContext2D, logo: CanvasImageSource, verso: boolean, a: AfilhadoCartao) => {
  // desenha o cartão no tamanho da página (340×212,5); quem chama ajusta a escala
  const L = 340, A = 212.5, R = 18;
  const forma = () => { g.beginPath(); g.roundRect(0, 0, L, A, R); };
  g.save();
  g.shadowColor = '#000000d9'; g.shadowBlur = 34; g.shadowOffsetY = 16;
  const bg = g.createLinearGradient(0, 0, L, A);
  bg.addColorStop(0, '#2a1c17'); bg.addColorStop(.55, '#140f0e'); bg.addColorStop(1, '#251814');
  forma(); g.fillStyle = bg; g.fill();
  g.restore();
  g.save(); forma(); g.clip();
  if (verso) {
    g.fillStyle = (() => { const s = g.createLinearGradient(0, 0, L, 0); s.addColorStop(0, '#0b0807'); s.addColorStop(.5, '#1d1412'); s.addColorStop(1, '#0b0807'); return s; })();
    g.fillRect(0, 18, L, 30);
    g.fillStyle = '#3a2720'; g.fillRect(0, 18, L, .7); g.fillRect(0, 47.3, L, .7);
    // frase estampada em prata na tarja (mesmo efeito da página)
    const tarja = 'Coração de Dindo sempre cabe mais um!';
    g.save(); g.font = '600 11.5px "Roboto Slab"'; g.letterSpacing = '.7px'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#000d'; g.fillText(tarja, L / 2, 32);
    const prata = g.createLinearGradient(L * .2, 20, L * .8, 46);
    (<[number, string][]>[[0, '#7d828a'], [.3, '#b9bec5'], [.45, '#f4f6f8'], [.5, '#ffffff'], [.56, '#c9cdd3'], [.75, '#858a92'], [1, '#b0b5bc']]).forEach(([o, c]) => prata.addColorStop(o, c));
    g.fillStyle = prata; g.fillText(tarja, L / 2, 33);
    g.restore();
    g.globalAlpha = .1; g.drawImage(logo, L - 124, A - 124, 150, 150); g.globalAlpha = 1;
    // saudação com o nome em destaque (a fonte diminui se o nome for longo)
    const nome = nomeCurto(a.nome), ola = 'Bem-vindo, afilhado(a) ';
    let tam = 13.5;
    const mede = () => { g.font = `700 ${tam}px "Roboto Slab"`; return g.measureText(ola + nome + '.').width; };
    while (mede() > L - 40 && tam > 9) tam -= .5;
    g.fillStyle = '#f3ece6'; g.fillText(ola, 20, 72);
    let x = 20 + g.measureText(ola).width;
    g.fillStyle = '#e07a4c'; g.fillText(nome, x, 72); x += g.measureText(nome).width;
    g.fillStyle = '#f3ece6'; g.fillText('.', x, 72);
    // texto justificado, com o número em destaque
    const palavras: { w: string; cor: string; peso: number; l: number }[] = [];
    for (const [txt, cor, peso] of <[string, string, number][]>[['Apresente este cartão ou informe o nº', '#a59990', 400], ['#' + pad(a.numero), '#e07a4c', 700], ['no Bar do Dindo para registrarmos nossos momentos no seu histórico.', '#a59990', 400]])
      for (const w of txt.split(' ')) { g.font = `${peso} 11.5px Inter`; palavras.push({ w, cor, peso, l: g.measureText(w).width }); }
    g.font = '400 11.5px Inter';
    const esp = g.measureText(' ').width, largura = L - 40, linhas: (typeof palavras)[] = [[]];
    let usado = 0;
    for (const p of palavras) {
      const cur = linhas[linhas.length - 1];
      if (cur.length && usado + esp + p.l > largura) { linhas.push([p]); usado = p.l; }
      else { usado += (cur.length ? esp : 0) + p.l; cur.push(p); }
    }
    linhas.forEach((ln, i) => {
      const soma = ln.reduce((t, p) => t + p.l, 0);
      const gap = i < linhas.length - 1 && ln.length > 1 ? (largura - soma) / (ln.length - 1) : esp;
      let px = 20;
      for (const p of ln) { g.font = `${p.peso} 11.5px Inter`; g.fillStyle = p.cor; g.fillText(p.w, px, 93 + i * 16.7); px += p.l + gap; }
    });
    g.fillStyle = '#a59990'; g.font = '400 10px Inter';
    ['Cidade Baixa - Porto Alegre / RS', 'Nova Olaria Mall', 'Rua Lima e Silva, 776 - Loja 7B'].forEach((t, i) => g.fillText(t, 20, A - 43.5 + i * 13.5));
  } else {
    g.save(); g.shadowColor = '#e07a4c77'; g.shadowBlur = 14; g.drawImage(logo, L - 96, 12, 84, 84); g.restore();
    const t = g.createLinearGradient(0, 22, 0, 60);
    t.addColorStop(0, '#ffe1d1'); t.addColorStop(.6, '#e07a4c'); t.addColorStop(1, '#c4572a');
    g.fillStyle = t; g.font = '800 17px "Roboto Slab"'; g.fillText('AFILHADO DO', 20, 37); g.fillText('BAR DO DINDO', 20, 56.5);
    g.fillStyle = '#e07a4c'; g.font = '800 32px "Roboto Slab"'; g.fillText('#' + pad(a.numero), 20, 135);
    const nome = nomeCurto(a.nome);
    g.fillStyle = '#f3ece6'; g.font = '600 15px Inter'; g.fillText(nome.length > 26 ? nome.slice(0, 25) + '…' : nome, 20, A - 32);
    g.fillStyle = '#a59990'; g.font = '400 10px Inter'; g.fillText(desdeTexto(a.desde), 20, A - 17);
  }
  g.fillStyle = '#e07a4c'; g.font = '400 10.5px Inter'; g.textAlign = 'right'; g.fillText('@bardodindo', L - 20, A - 17); g.textAlign = 'left';
  // reflexo diagonal
  const brilho = g.createLinearGradient(0, 0, L, A);
  brilho.addColorStop(.25, '#ffffff00'); brilho.addColorStop(.42, '#ffffff14'); brilho.addColorStop(.6, '#ffffff00');
  g.fillStyle = brilho; g.fillRect(0, 0, L, A);
  g.restore();
  forma(); g.strokeStyle = verso ? '#5a3828' : '#7a4b36'; g.lineWidth = 1; g.stroke();
};

// monta a imagem do cartão: 'post' (1440×1800, para salvar) ou 'stories' (1080×1920, para o Instagram)
export const imagemCartao = async (formato: 'post' | 'stories', a: AfilhadoCartao, logo: HTMLImageElement): Promise<Blob> => {
  // as fontes só baixam quando algo as usa: no Cérebro, o canvas pode ser o primeiro a pedir estes pesos
  await Promise.all(['600 12px "Roboto Slab"', '700 12px "Roboto Slab"', '800 12px "Roboto Slab"', '400 12px Inter', '500 12px Inter', '600 12px Inter', '700 12px Inter']
    .map((f) => document.fonts.load(f).catch(() => undefined)));
  await document.fonts.ready;
  if (!logo.complete) await logo.decode().catch(() => undefined);
  const st = formato === 'stories';
  const W = st ? 1080 : 1440, H = st ? 1920 : 1800, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  // fundo: luz quente no centro e raios bem suaves, como na tela da revelação
  const fundo = g.createRadialGradient(W / 2, H * .42, 0, W / 2, H * .42, H * .75);
  fundo.addColorStop(0, '#3e2820'); fundo.addColorStop(.5, '#16100e'); fundo.addColorStop(1, '#070605');
  g.fillStyle = fundo; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H * .42);
  const raios = g.createRadialGradient(0, 0, 0, 0, 0, W * .8);
  raios.addColorStop(0, '#e07a4c17'); raios.addColorStop(1, '#e07a4c00');
  g.fillStyle = raios;
  for (let i = 0; i < 24; i++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, H, (i * 15) * Math.PI / 180, (i * 15 + 5) * Math.PI / 180); g.closePath(); g.fill(); }
  g.restore();
  // posições de cada formato (nos Stories, longe das faixas que o Instagram cobre em cima e embaixo)
  const L = st
    ? { logo: [180, 170], rotulo: 410, largura: 880, frente: 800, verso: 1300, frase: 1660, linha: 1724 }
    : { logo: [70, 160], rotulo: 300, largura: 960, frente: 715, verso: 1255, frase: 1650, linha: 1712 };
  g.save(); g.shadowColor = '#e07a4c99'; g.shadowBlur = 50; g.drawImage(logo, W / 2 - L.logo[1] / 2, L.logo[0], L.logo[1], L.logo[1]); g.restore();
  g.textAlign = 'center';
  g.fillStyle = '#e07a4c'; g.font = '600 30px Inter'; g.letterSpacing = '9px';
  g.fillText('CARTÃO DE AFILHADO', W / 2 + 4, L.rotulo);
  g.letterSpacing = '0px'; g.textAlign = 'left';
  // verso atrás, frente na frente, levemente inclinados
  const k = L.largura / 340;
  const poe = (cx: number, cy: number, ang: number, verso: boolean) => {
    g.save(); g.translate(cx, cy); g.rotate(ang * Math.PI / 180); g.scale(k, k); g.translate(-170, -106.25);
    desenhaCartao(g, logo, verso, a); g.restore();
  };
  poe(W / 2 + 30, L.verso, 4, true);
  poe(W / 2 - 24, L.frente, -4, false);
  // rodapé: nos Stories o @ vem em destaque para marcarem o bar
  g.textAlign = 'center';
  if (st) {
    g.fillStyle = '#e07a4c'; g.font = '800 64px "Roboto Slab"'; g.fillText('@bardodindo', W / 2, L.frase);
    g.fillStyle = '#a59990'; g.font = '500 30px Inter'; g.fillText('Nova Olaria Mall  ·  Cidade Baixa  ·  Porto Alegre', W / 2, L.linha);
  } else {
    g.fillStyle = '#f3ece6'; g.font = '700 40px "Roboto Slab"'; g.fillText('Nos vemos no Bar do Dindo!', W / 2, L.frase);
    g.fillStyle = '#a59990'; g.font = '500 28px Inter'; g.fillText('@bardodindo  ·  Nova Olaria Mall  ·  Cidade Baixa  ·  Porto Alegre', W / 2, L.linha);
  }
  return new Promise((ok) => c.toBlob((b) => ok(b!), 'image/png'));
};
