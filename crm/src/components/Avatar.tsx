import { initials } from '../lib/format';

/** Foto do usuário ou, sem foto, as iniciais do nome. */
export function Avatar({ nome, foto, className }: { nome: string; foto?: string | null; className: string }) {
  return <span className={className}>{foto ? <img src={foto} alt="" /> : initials(nome)}</span>;
}

/**
 * Reduz a imagem (JPEG) antes de salvar. `quadrado`: recorta no centro (foto de perfil);
 * sem recorte, o lado maior fica com `lado` px e a proporção é mantida (fotos de produtos, materiais…).
 */
export function reduzirFoto(arquivo: File, lado = 512, quadrado = true): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith('image/')) return reject(new Error('Escolha um arquivo de imagem.'));
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const min = Math.min(img.width, img.height);
      const [sx, sy, sw, sh] = quadrado ? [(img.width - min) / 2, (img.height - min) / 2, min, min] : [0, 0, img.width, img.height];
      const escala = Math.min(1, lado / Math.max(sw, sh));
      const c = encolher(img, sx, sy, sw, sh, Math.round(sw * escala), Math.round(sh * escala));
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}

/**
 * Reduz em etapas de no máximo metade do tamanho: num passo só, o navegador pula pixels
 * e a foto fica serrilhada (é o que deixava a imagem ampliada com cara de borrada).
 */
function encolher(img: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, w: number, h: number) {
  let origem: CanvasImageSource = img;
  let [x, y, ow, oh] = [sx, sy, sw, sh];
  for (;;) {
    const nw = Math.max(w, Math.round(ow / 2));
    const nh = Math.max(h, Math.round(oh / 2));
    const c = document.createElement('canvas');
    c.width = nw; c.height = nh;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#fff'; // PNG transparente vira fundo branco no JPEG
    g.fillRect(0, 0, nw, nh);
    g.drawImage(origem, x, y, ow, oh, 0, 0, nw, nh);
    if (nw === w && nh === h) return c;
    origem = c; [x, y, ow, oh] = [0, 0, nw, nh];
  }
}
