import { initials } from '../lib/format';

/** Foto do usuário ou, sem foto, as iniciais do nome. */
export function Avatar({ nome, foto, className }: { nome: string; foto?: string | null; className: string }) {
  return <span className={className}>{foto ? <img src={foto} alt="" /> : initials(nome)}</span>;
}

/** Recorta a imagem no centro em quadrado e reduz para `lado` px (JPEG), pronta para salvar no perfil. */
export function reduzirFoto(arquivo: File, lado = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith('image/')) return reject(new Error('Escolha um arquivo de imagem.'));
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = lado;
      const min = Math.min(img.width, img.height);
      c.getContext('2d')!.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, lado, lado);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}
