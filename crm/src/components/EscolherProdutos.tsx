import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { brl } from '../lib/format';

export interface ProdutoVenda { id: string; nome: string; categoria: string; tamanho?: string; preco: number; pontos: number; foto?: string }

/** Mesma ordem de categorias do cardápio do aplicativo; categorias novas vão para o fim. */
const ORDEM_CATEGORIAS = ['Cervejas', 'Chopes', 'Drinks', 'Destilados', 'Vinhos', 'Petiscos', 'Porções', 'Pratos', 'Sobremesas', 'Sem álcool'];
const posCategoria = (c: string) => {
  const i = ORDEM_CATEGORIAS.findIndex((o) => o.toLowerCase() === c.toLowerCase());
  return i === -1 ? 999 : i;
};
const TODOS = 'Todos';

/** Ordem dos tamanhos pelo volume (300 ml, 500 ml, 1 litro…), como no aplicativo. */
function volumeEmMl(t: string) {
  const m = /(\d+(?:[.,]\d+)?)\s*(ml|l\b|litros?)/i.exec(t);
  if (!m) return Infinity;
  const n = Number(m[1].replace(',', '.'));
  return m[2].toLowerCase() === 'ml' ? n : n * 1000;
}
const porVolume = (a: string, b: string) => volumeEmMl(a) - volumeEmMl(b) || a.localeCompare(b, 'pt-BR', { numeric: true });
const semTamanho = (p: ProdutoVenda) => (p.tamanho && p.nome.endsWith(p.tamanho) ? p.nome.slice(0, -p.tamanho.length).trim() : p.nome);

/** Produtos à venda com busca, abas de categoria e filtro de tamanho (Lançar consumo e Comandas). */
export function EscolherProdutos({ produtos, onEscolher, autoFocus }: { produtos: ProdutoVenda[]; onEscolher: (p: ProdutoVenda) => void; autoFocus?: boolean }) {
  const [busca, setBusca] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [tamanho, setTamanho] = useState<string | null>(null);

  const categorias = useMemo(
    () => [...new Set(produtos.map((p) => String(p.categoria ?? '').trim() || 'Outros'))].sort((a, b) => posCategoria(a) - posCategoria(b) || a.localeCompare(b, 'pt-BR')),
    [produtos],
  );
  const abas = categorias.length > 1 ? [TODOS, ...categorias] : [];
  const ativa = cat && abas.includes(cat) ? cat : TODOS;

  const t = busca.trim().toLowerCase();
  // com busca, procura no cardápio inteiro; sem busca, mostra a categoria escolhida
  const daVez = produtos.filter((p) =>
    t ? `${p.nome} ${p.categoria} ${p.tamanho ?? ''}`.toLowerCase().includes(t) : ativa === TODOS || (String(p.categoria ?? '').trim() || 'Outros') === ativa,
  );
  const tamanhos = [...new Set(daVez.map((p) => p.tamanho?.trim() ?? '').filter(Boolean))].sort(porVolume);
  const tamanhoAtivo = tamanho && tamanhos.includes(tamanho) ? tamanho : null;
  const lista = (tamanhoAtivo ? daVez.filter((p) => p.tamanho?.trim() === tamanhoAtivo) : daVez)
    .slice().sort((a, b) => semTamanho(a).localeCompare(semTamanho(b), 'pt-BR') || porVolume(a.tamanho ?? '', b.tamanho ?? ''));

  return (
    <div className="escolher-produtos">
      <label className="search"><Search size={16} />
        <input placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus={autoFocus} />
      </label>
      {!t && abas.length > 0 && (
        <div className="escolher-produtos__chips" role="group" aria-label="Categorias do cardápio">
          {abas.map((c) => (
            <button key={c} type="button" className={`chip ${ativa === c ? 'is-active' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      )}
      {tamanhos.length > 1 && (
        <div className="escolher-produtos__chips" role="group" aria-label="Filtrar por tamanho">
          <button type="button" className={`chip chip--sm ${!tamanhoAtivo ? 'is-active' : ''}`} onClick={() => setTamanho(null)}>Todos os tamanhos</button>
          {tamanhos.map((x) => (
            <button key={x} type="button" className={`chip chip--sm ${tamanhoAtivo === x ? 'is-active' : ''}`} onClick={() => setTamanho(tamanhoAtivo === x ? null : x)}>{x}</button>
          ))}
        </div>
      )}
      <div className="product-grid escolher-produtos__grid">
        {lista.map((p) => (
          <button key={p.id} type="button" className="product" onClick={() => onEscolher(p)}>
            {p.foto && <img className="product__foto" src={p.foto} alt="" loading="lazy" />}
            <span>{p.nome}</span>
            <strong>{brl(Number(p.preco) || 0)}</strong>
          </button>
        ))}
      </div>
      {!lista.length && <p className="muted small">Nenhum produto encontrado{t ? ` para "${busca.trim()}"` : ''}.</p>}
      <p className="muted small">{lista.length} de {produtos.length} {produtos.length === 1 ? 'produto' : 'produtos'}</p>
    </div>
  );
}
