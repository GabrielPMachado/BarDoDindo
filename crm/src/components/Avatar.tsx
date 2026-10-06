import { initials } from '../lib/format';

/** Foto do usuário ou, sem foto, as iniciais do nome. */
export function Avatar({ nome, foto, className }: { nome: string; foto?: string | null; className: string }) {
  return <span className={className}>{foto ? <img src={foto} alt="" /> : initials(nome)}</span>;
}

/**
 * Reduz a imagem (JPEG) antes de salvar. `quadrado`: recorta no centro (foto de perfil);
 * sem recorte, o lado maior fica com `lado` px e a proporção é mantida (fotos de produtos, materiais…).
 */
export function reduzirFoto(arquivo: File, lado = 256, quadrado = true): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith('image/')) return reject(new Error('Escolha um arquivo de imagem.'));
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const g = c.getContext('2d')!;
      if (quadrado) {
        c.width = c.height = lado;
        const min = Math.min(img.width, img.height);
        g.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, lado, lado);
      } else {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        g.fillStyle = '#fff'; // PNG transparente vira fundo branco no JPEG
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
      }
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}
