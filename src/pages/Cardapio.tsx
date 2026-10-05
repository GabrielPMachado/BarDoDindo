import { useMemo, useState } from 'react';
import { Search, Star, Utensils } from 'lucide-react';
import { brl, sortCategories } from '../data';
import { Empty, PageHeader } from '../components/ui';
import { ItemIcon } from '../components/ItemIcon';
import { useStore } from '../store';

export default function Cardapio() {
  const { cardapio, config } = useStore();
  const hasHighlights = cardapio.some((i) => i.destaque);
  const categories = useMemo(() => sortCategories([...new Set(cardapio.map((i) => i.categoria).filter(Boolean))]), [cardapio]);
  const tabs = hasHighlights ? ['Destaques', ...categories] : categories;
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const active = cat && tabs.includes(cat) ? cat : tabs[0];
  const pontosPorReal = config?.pontosPorReal ?? 1;

  const term = q.trim().toLowerCase();
  const items = cardapio.filter((i) =>
    term
      ? (i.nome + ' ' + i.descricao).toLowerCase().includes(term)
      : active === 'Destaques' ? i.destaque : i.categoria === active,
  );

  const regra =
    pontosPorReal === 1 ? 'Cada R$ 1 consumido vale 1 ponto' : `Cada R$ 1 consumido vale ${pontosPorReal.toLocaleString('pt-BR')} pontos`;

  if (!cardapio.length) {
    return (
      <div className="page">
        <PageHeader title="Cardápio" />
        <Empty icon={<Utensils />}>O cardápio será publicado em breve.</Empty>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Cardápio" subtitle={regra} />

      <label className="search">
        <Search size={18} />
        <input placeholder="Buscar no cardápio" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {!term && tabs.length > 1 && (
        <div className="chips chips--scroll">
          {tabs.map((c) => (
            <button key={c} className={`chip ${active === c ? 'is-active' : ''}`} onClick={() => setCat(c)}>
              {c === 'Destaques' && <Star size={14} fill="currentColor" />} {c}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <Empty icon={<Search />}>Nenhum item encontrado para “{q}”.</Empty>
      ) : (
        <div className="card list">
          {items.map((i) => (
            <div key={i.id} className="menu-row">
              <ItemIcon categoria={i.categoria} size="lg" />
              <div className="menu-row__main">
                <strong>{i.nome}</strong>
                {i.descricao && <span className="muted small">{i.descricao}</span>}
              </div>
              <div className="hist-row__value">
                <strong>{brl(i.preco)}</strong>
                <span className="gold small">+{Math.floor(i.preco * pontosPorReal)} pts</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
