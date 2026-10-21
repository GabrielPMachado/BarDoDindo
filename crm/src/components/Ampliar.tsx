import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';

const nomeArquivo = (t: string) => (t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'foto') + '.jpg';

/** Foto em tela cheia: fecha com Esc, com o X ou tocando fora da imagem; dá para baixar. */
export function Ampliar({ src, titulo, onClose }: { src: string; titulo?: string; onClose: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [onClose]);
  return createPortal(
    <div className="ampliar" role="dialog" aria-modal="true" aria-label={titulo ? `Foto: ${titulo}` : 'Foto ampliada'} onClick={onClose}>
      <div className="ampliar__barra" onClick={(e) => e.stopPropagation()}>
        <span className="ampliar__titulo">{titulo}</span>
        <a className="icon-btn" href={src} download={nomeArquivo(titulo ?? '')} aria-label="Baixar a foto" title="Baixar"><Download size={18} /></a>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)"><X size={20} /></button>
      </div>
      <img src={src} alt={titulo ?? ''} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}
