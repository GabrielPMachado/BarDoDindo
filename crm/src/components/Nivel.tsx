import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import type { Field, Tone } from '../collections';
import { linkSeguro } from '../lib/links';
import { FieldInput } from './ui';

/** Barra de nível (ex.: quanto resta no barril): a fração cheia, a porcentagem e o detalhe embaixo. */
export function BarraNivel({ fracao, tone, detalhe }: { fracao: number; tone: Tone; detalhe?: string }) {
  const p = Math.round(Math.max(0, Math.min(1, fracao)) * 100);
  // "2,4 de 3 un · aberto: 20 L": o total ao lado da porcentagem e a unidade aberta embaixo da barra
  const [total, ...resto] = (detalhe ?? '').split(' · ');
  return (
    <div className={`nivel nivel--${tone}`} title={detalhe}>
      <div className="nivel__topo">
        <b className="nivel__pct">{p}%</b>
        {total && <span className="nivel__detalhe">{total}</span>}
      </div>
      <span className="nivel__barra" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={detalhe ? `${p}% · ${detalhe}` : `${p}%`}>
        <span className="nivel__cheio" style={{ width: `${p}%` }} />
      </span>
      {resto.length > 0 && <span className="nivel__detalhe">{resto.join(' · ')}</span>}
    </div>
  );
}

const nomeDoSite = (link: string) => {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return link; }
};

/** Botão de comprar quando o item tem mais de um link: abre a lista das lojas (a principal primeiro). */
export function LinksDeCompra({ links }: { links: string[] }) {
  const seguros = links.map(linkSeguro).filter((l): l is string => !!l);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const fechar = (e: Event) => { if (!caixa.current?.contains(e.target as Node) && !botao.current?.contains(e.target as Node)) setPos(null); };
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null); };
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', sair);
    window.addEventListener('scroll', fechar, true);
    return () => { document.removeEventListener('pointerdown', fechar); document.removeEventListener('keydown', sair); window.removeEventListener('scroll', fechar, true); };
  }, [pos]);
  if (!seguros.length) return null;
  const abrir = () => {
    const r = botao.current!.getBoundingClientRect();
    setPos(pos ? null : { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };
  return (
    <>
      <button ref={botao} type="button" className="icon-btn links-compra__btn" onClick={abrir} aria-haspopup="menu" aria-expanded={!!pos}
        aria-label={`Comprar: ${seguros.length} lojas`} title={`Comprar (${seguros.length} lojas)`}>
        <ShoppingCart size={16} /><span className="links-compra__qtd">{seguros.length}</span>
      </button>
      {pos && createPortal(
        <div ref={caixa} className="links-compra" role="menu" style={{ top: pos.top, right: pos.right }}>
          {seguros.map((l, i) => (
            <a key={l} role="menuitem" href={l} target="_blank" rel="noopener noreferrer" onClick={() => setPos(null)}>
              <ExternalLink size={14} /> <span>{nomeDoSite(l)}</span>
              <span className="muted small">{i === 0 ? 'principal' : 'alternativo'}</span>
            </a>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Até quantos links um campo de vários aceita (o principal e os alternativos). */
const MAX_LINKS = 5;

/** Link que aceita mais de um (ex.: loja alternativa): o primeiro é o principal; tirar o principal promove o seguinte. */
export function VariosLinks({ field, links, disabled, onChange }: {
  field: Field; links: string[]; disabled?: boolean;
  onChange: (links: string[]) => void;
}) {
  const lista = links.length ? links : [''];
  const ultimo = lista[lista.length - 1];
  return (
    <div className="varios">
      {lista.map((l, i) => (
        <div key={i} className="varios__linha">
          <div className="varios__campo">
            <FieldInput field={{ ...field, key: i === 0 ? field.key : `${field.key}-${i}`, placeholder: i === 0 ? field.placeholder : 'Link de outra loja' }} value={l} disabled={disabled}
              onChange={(v) => onChange(lista.map((x, k) => (k === i ? String(v ?? '') : x)))} />
          </div>
          {!disabled && lista.length > 1 && (
            <button type="button" className="icon-btn" aria-label="Tirar este link" title={i === 0 ? 'Tirar (o próximo vira o link principal)' : 'Tirar'}
              onClick={() => onChange(lista.filter((_, k) => k !== i))}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      {!disabled && ultimo.trim() && lista.length < MAX_LINKS && (
        <p className="varios__pergunta">
          <span className="muted small">{lista.length === 1 ? 'Tem outra loja que vende este item?' : 'Mais alguma loja?'}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange([...lista, ''])}>
            <Plus size={13} /> Acrescentar link alternativo
          </button>
        </p>
      )}
    </div>
  );
}
