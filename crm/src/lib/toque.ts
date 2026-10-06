import { useRef } from 'react';

/**
 * Toque longo (≈0,5 s) no celular e no tablet: abre o mesmo menu do botão direito.
 * No iPhone o navegador não dispara o "contextmenu"; no Android ele dispara e este atalho só evita o clique que viria depois.
 */
export function useToqueLongo() {
  const timer = useRef<number | null>(null);
  const disparou = useRef(false);
  const limpar = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return (abrir: (x: number, y: number) => void) => ({
    onTouchStart: (e: React.TouchEvent) => {
      disparou.current = false;
      const t = e.touches[0];
      limpar();
      timer.current = window.setTimeout(() => {
        disparou.current = true;
        navigator.vibrate?.(10);
        abrir(t.clientX, t.clientY);
      }, 520);
    },
    onTouchMove: limpar,
    onTouchEnd: (e: React.TouchEvent) => {
      limpar();
      // depois do toque longo, cancela o clique e os eventos de mouse que o navegador gera em seguida
      if (disparou.current && e.cancelable) e.preventDefault();
    },
    onTouchCancel: limpar,
    // depois de um toque longo, o "clique" que o navegador gera não deve navegar
    onClickCapture: (e: React.MouseEvent) => {
      if (disparou.current) {
        e.preventDefault();
        e.stopPropagation();
        disparou.current = false;
      }
    },
  });
}
