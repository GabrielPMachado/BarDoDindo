import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, ChevronDown, Gauge, Leaf, Search, Star, Utensils, X, type LucideIcon } from 'lucide-react';
import { brl, sortCategories } from '../data';
import { Empty, PageHeader } from '../components/ui';
import { ItemFoto } from '../components/ItemIcon';
import { useStore, type Produto } from '../store';

export default function Cardapio() {
  const { cardapio, config } = useStore();
  const hasHighlights = cardapio.some((i) => i.destaque);
  const categories = useMemo(() => sortCategories([...new Set(cardapio.map((i) => i.categoria).filter(Boolean))]), [cardapio]);
  const tabs = hasHighlights ? ['Destaques', ...categories] : categories;
  const [params] = useSearchParams();
  // ?cat=Drinks vem das bolinhas de categoria do início
  const [cat, setCat] = useState<string | null>(params.get('cat'));
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState<Produto | null>(null);
  const active = cat && tabs.includes(cat) ? cat : tabs[0];
  const pontosPorReal = config?.pontosPorReal ?? 1;

  const term = q.trim().toLowerCase();
  const items = cardapio.filter((i) =>
    term
      ? [i.nome, i.resumo, i.descricao, ...(i.ingredientes ?? [])].join(' ').toLowerCase().includes(term)
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
            <button key={i.id} type="button" className="menu-row" onClick={() => setAberto(i)}>
              <ItemFoto foto={i.foto} categoria={i.categoria} size="lg" />
              <div className="menu-row__main">
                <strong>{i.nome}</strong>
                {(i.resumo || i.descricao) && <span className="muted small menu-row__desc">{i.resumo || i.descricao}</span>}
                {(i.teor ?? 0) > 0 && <span className="menu-row__teor">{i.teor!.toLocaleString('pt-BR')}% álc.</span>}
              </div>
              <div className="hist-row__value">
                <strong>{brl(i.preco)}</strong>
                <span className="gold small">+{Math.floor(i.preco * pontosPorReal)} pts</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {aberto && <ProdutoSheet p={aberto} pontos={Math.floor(aberto.preco * pontosPorReal)} onClose={() => setAberto(null)} />}
    </div>
  );
}

const PERFIL: { key: 'docura' | 'amargor' | 'acidez' | 'intensidade'; label: string }[] = [
  { key: 'docura', label: 'Doçura' }, { key: 'amargor', label: 'Amargor' }, { key: 'acidez', label: 'Acidez' }, { key: 'intensidade', label: 'Intensidade' },
];

/** Botão que abre (ou fecha) uma parte dos detalhes, para quem quiser saber mais. */
function Secao({ id, titulo, icon: Icon, aberta, onToggle, children }: {
  id: string; titulo: string; icon: LucideIcon; aberta: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <section className={`secao-prod ${aberta ? 'is-aberta' : ''}`}>
      <button type="button" className="secao-prod__botao" aria-expanded={aberta} aria-controls={`sec-${id}`} onClick={onToggle}>
        <Icon size={18} /> <span>{titulo}</span> <ChevronDown size={18} className="secao-prod__seta" />
      </button>
      {aberta && <div className="secao-prod__corpo" id={`sec-${id}`}>{children}</div>}
    </section>
  );
}

/** Detalhes do produto: foto grande, o básico em uma linha e botões para ingredientes, perfil e história. */
function ProdutoSheet({ p, pontos, onClose }: { p: Produto; pontos: number; onClose: () => void }) {
  const perfil = PERFIL.filter((x) => (p.perfil?.[x.key] ?? 0) > 0);
  const notas = p.notas ?? [];
  const ingredientes = p.ingredientes ?? [];
  const temPerfil = (p.teor ?? 0) > 0 || perfil.length > 0 || notas.length > 0;
  // sem descrição curta, a história fica visível direto (é a única descrição que existe)
  const resumo = p.resumo || '';
  const historia = p.resumo ? p.descricao : '';
  const [aberta, setAberta] = useState<string | null>(null);
  const alternar = (id: string) => setAberta((a) => (a === id ? null : id));
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet produto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p.nome}>
        <button type="button" className="icon-btn produto__fechar" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        <div className="produto__capa">
          {p.foto ? <img src={p.foto} alt={p.nome} /> : <ItemFoto categoria={p.categoria} size="xl" />}
        </div>
        <div className="produto__topo">
          <span className="produto__cat">{p.categoria}{(p.teor ?? 0) > 0 ? ` · ${p.teor!.toLocaleString('pt-BR')}% álc.` : ''}</span>
          <h2>{p.nome}</h2>
          {(resumo || (!historia && p.descricao)) && <p className="produto__resumo">{resumo || p.descricao}</p>}
          <div className="produto__preco"><b>{brl(p.preco)}</b><span className="gold">+{pontos} pts</span></div>
        </div>

        {(ingredientes.length > 0 || temPerfil || historia) && (
          <div className="produto__secoes">
            {ingredientes.length > 0 && (
              <Secao id="ing" titulo="Ingredientes" icon={Leaf} aberta={aberta === 'ing'} onToggle={() => alternar('ing')}>
                <ul className="produto__ingredientes">{ingredientes.map((x) => <li key={x}>{x}</li>)}</ul>
              </Secao>
            )}
            {temPerfil && (
              <Secao id="perfil" titulo={(p.teor ?? 0) > 0 || perfil.length ? 'Perfil da bebida' : 'Sabor'} icon={Gauge} aberta={aberta === 'perfil'} onToggle={() => alternar('perfil')}>
                {(p.teor ?? 0) > 0 && (
                  <div className="produto__teor"><span>Teor alcoólico</span><b>{p.teor!.toLocaleString('pt-BR')}%</b></div>
                )}
                {perfil.map((x) => (
                  <div key={x.key} className="medidor" aria-label={`${x.label}: ${p.perfil![x.key]} de 5`}>
                    <span>{x.label}</span>
                    <span className="medidor__pontos" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= (p.perfil![x.key] ?? 0) ? 'is-on' : ''} />)}
                    </span>
                  </div>
                ))}
                {notas.length > 0 && <div className="produto__notas">{notas.map((n) => <span key={n}>{n}</span>)}</div>}
              </Secao>
            )}
            {historia && (
              <Secao id="hist" titulo="História" icon={BookOpen} aberta={aberta === 'hist'} onToggle={() => alternar('hist')}>
                <p className="produto__historia">{historia}</p>
              </Secao>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
