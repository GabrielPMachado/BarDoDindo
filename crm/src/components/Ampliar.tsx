import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';

const nomeArquivo = (t: string) => (t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'foto') + '.jpg';

/**
 * Foto em tela cheia (do navegador, quando ele deixa), no tamanho original: sem esticar nem encolher;
 * se for maior que a tela, rola. Fecha com Esc, com o X ou tocando fora da imagem; dá para baixar.
 */
export function Ampliar({ src, titulo, onClose }: { src: string; titulo?: string; onClose: () => void }) {
  const tela = useRef<HTMLDivElement>(null);
  const fechar = useRef(onClose);
  fechar.current = onClose;
  // Uma vez só: se refizesse a cada render da página, sairia e voltaria da tela cheia.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); fechar.current(); } };
    // Esc na tela cheia só sai dela (o navegador não repassa a tecla): sair da tela cheia fecha a foto.
    const saiu = () => { if (!document.fullscreenElement) fechar.current(); };
    window.addEventListener('keydown', tecla, true);
    document.addEventListener('fullscreenchange', saiu);
    tela.current?.requestFullscreen?.().catch(() => undefined); // celular sem suporte: fica a sobreposição
    return () => {
      window.removeEventListener('keydown', tecla, true);
      document.removeEventListener('fullscreenchange', saiu);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  return createPortal(
    <div ref={tela} className="ampliar" role="dialog" aria-modal="true" aria-label={titulo ? `Foto: ${titulo}` : 'Foto ampliada'} onClick={onClose}>
      <div className="ampliar__barra" onClick={(e) => e.stopPropagation()}>
        <span className="ampliar__titulo">{titulo}</span>
        <a className="icon-btn" href={src} download={nomeArquivo(titulo ?? '')} aria-label="Baixar a foto" title="Baixar"><Download size={18} /></a>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar" title="Fechar (Esc)"><X size={20} /></button>
      </div>
      <div className="ampliar__area">
        <img src={src} alt={titulo ?? ''} onClick={(e) => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  );
}
