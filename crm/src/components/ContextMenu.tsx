import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuPos { x: number; y: number }

/** Menu do botão direito: abre onde o mouse está, sem sair da tela, e fecha ao escolher uma opção, clicar fora, Esc ou trocar de janela. */
export function ContextMenu({ at, onClose, children }: { at: MenuPos; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: at.x, top: at.y });

  useEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.min(at.x, innerWidth - r.width - 8), top: Math.min(at.y, innerHeight - r.height - 8) });
    // logo depois de abrir (toque longo), o navegador pode gerar um clique fora: esse não fecha o menu
    const abertoEm = Date.now();
    const fora = (e: MouseEvent) => Date.now() - abertoEm > 350 && ref.current && !ref.current.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [at, onClose]);

  return (
    <div
      className="ctx" ref={ref} style={pos} role="menu"
      onClick={(e) => (e.target as HTMLElement).closest('button') && onClose()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}
