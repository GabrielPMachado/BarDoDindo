import { useEffect, useRef, useState, type RefObject } from 'react';

/** Quem pediu menos movimento no sistema não vê as animações. */
export const semMovimento = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Troca de página: os blocos da página entram um depois do outro, saindo do desfoque e subindo um pouco.
 * Usa a Web Animations API para não precisar remontar a página (o estado dela fica como está).
 */
export function useEntradaDePagina(alvo: RefObject<HTMLElement | null>, chave: string) {
  useEffect(() => {
    const raiz = alvo.current;
    if (!raiz || semMovimento() || typeof raiz.animate !== 'function') return;
    // espera a página desenhar o primeiro quadro (ela pode trocar de conteúdo logo após a rota)
    const id = requestAnimationFrame(() => {
      const pagina = raiz.firstElementChild;
      if (!pagina) return;
      const blocos = (pagina.classList.contains('page') ? [...pagina.children] : [pagina]).slice(0, 10) as HTMLElement[];
      blocos.forEach((el, i) => {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(14px) scale(.985)', filter: 'blur(8px)' },
            { opacity: 1, transform: 'none', filter: 'blur(0)' },
          ],
          { duration: 520, delay: Math.min(i, 8) * 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
        );
      });
    });
    return () => cancelAnimationFrame(id);
  }, [alvo, chave]);
}

/** Primeiro número de um texto em pt-BR ("R$ 1.234,56", "87%", "12 reservas"). */
const NUMERO = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/;

function lerNumero(texto: string) {
  // datas e horas ("04/11", "18:30") ficam como estão
  if (/[/:]/.test(texto)) return null;
  const m = NUMERO.exec(texto);
  if (!m) return null;
  const bruto = m[0];
  const casas = bruto.includes(',') ? bruto.split(',')[1].length : 0;
  const valor = Number(bruto.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(valor)) return null;
  return { valor, casas, milhar: bruto.includes('.'), antes: texto.slice(0, m.index), depois: texto.slice(m.index + bruto.length) };
}

/** Valor que "conta" do anterior (ou de zero) até o novo, como nos cartões de números do vídeo. */
export function useNumeroAnimado(texto: string, duracao = 900) {
  const [mostrado, setMostrado] = useState(texto);
  const anterior = useRef<number>(0);

  useEffect(() => {
    const n = lerNumero(texto);
    if (!n || semMovimento()) { setMostrado(texto); if (n) anterior.current = n.valor; return; }
    const de = anterior.current;
    const para = n.valor;
    anterior.current = para;
    if (de === para) { setMostrado(texto); return; }
    const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: n.casas, maximumFractionDigits: n.casas, useGrouping: n.milhar });
    const inicio = performance.now();
    let id = 0;
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracao);
      const e = 1 - (1 - t) ** 3;
      if (t >= 1) { setMostrado(texto); return; }
      setMostrado(`${n.antes}${fmt.format(de + (para - de) * e)}${n.depois}`);
      id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [texto, duracao]);

  return mostrado;
}
