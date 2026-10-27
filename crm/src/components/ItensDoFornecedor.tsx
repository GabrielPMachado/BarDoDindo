import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Package, ShoppingCart, Tag, Wrench } from 'lucide-react';
import { api } from '../lib/api';
import type { Row } from '../lib/data';
import { brl, dateBR } from '../lib/format';
import { linkSeguro } from '../lib/links';

interface Linha { id: string; nome: string; detalhe: string; valor?: string; link: string | null }
interface Grupo { titulo: string; caminho: string; icon: typeof Package; linhas: Linha[] }

const qtd = (v: unknown) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Busca uma coleção; sem permissão para ela, o grupo simplesmente não aparece. */
const buscar = (col: string) => api<Row[]>(`/crm/c/${col}`).catch(() => null);

/**
 * Dentro do cadastro do fornecedor: o que compramos dele, com o botão de compra de cada item.
 * Liga pelo cadastro do fornecedor (fornecedorId) ou, nos registros antigos, pelo nome; vale também para os outros fornecedores do item.
 */
export function ItensDoFornecedor({ fornecedorId, nome }: { fornecedorId: string; nome: string }) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);

  useEffect(() => {
    let vivo = true;
    // o item pode ter vários fornecedores: o principal e os outros (outrosFornecedores)
    const mesmo = (id: unknown, n: unknown) => id === fornecedorId || (!id && !!nome && String(n ?? '').trim().toLowerCase() === nome.trim().toLowerCase());
    const deste = (r: Row) => mesmo(r.fornecedorId, r.fornecedor)
      || (Array.isArray(r.outrosFornecedores) && (r.outrosFornecedores as { nome?: string; id?: string | null }[]).some((o) => mesmo(o?.id, o?.nome)));
    void Promise.all([buscar('precos'), buscar('estoque'), buscar('materiais')]).then(([precos, estoque, materiais]) => {
      if (!vivo) return;
      const g: Grupo[] = [];
      if (precos) g.push({
        titulo: 'Tabela de preços', caminho: '/adm/precos', icon: Tag,
        linhas: precos.filter(deste).map((r) => ({
          id: r.id, nome: String(r.insumo ?? ''), link: linkSeguro(r.link),
          detalhe: [r.embalagem, r.data ? `cotado em ${dateBR(r.data)}` : '', r.status === 'Inativo' ? 'inativo' : ''].filter(Boolean).join(' · '),
          valor: Number(r.preco) ? brl(Number(r.preco)) : undefined,
        })),
      });
      if (estoque) g.push({
        titulo: 'Estoque', caminho: '/estrutura/estoque', icon: Package,
        linhas: estoque.filter(deste).map((r) => ({
          id: r.id, nome: String(r.item ?? ''), link: linkSeguro(r.link),
          detalhe: `${qtd(r.quantidade)} ${r.unidade ?? 'un'} em estoque`, valor: Number(r.custo) ? brl(Number(r.custo)) : undefined,
        })),
      });
      if (materiais) g.push({
        titulo: 'Materiais', caminho: '/estrutura/materiais', icon: Wrench,
        linhas: materiais.filter(deste).map((r) => ({
          id: r.id, nome: String(r.material ?? ''), link: linkSeguro(r.link),
          detalhe: `${qtd(r.quantidade)} un · ${r.tipo ?? ''}`, valor: Number(r.valor) ? brl(Number(r.valor)) : undefined,
        })),
      });
      setGrupos(g.filter((x) => x.linhas.length));
    });
    return () => { vivo = false; };
  }, [fornecedorId, nome]);

  return (
    <div className="form-field form-field--wide itens-forn">
      <label>Itens deste fornecedor</label>
      {grupos === null ? (
        <p className="muted small">Carregando…</p>
      ) : grupos.length === 0 ? (
        <p className="muted small">Nenhum item ligado a este fornecedor ainda. Ao lançar uma nota de compra ou escolher o fornecedor num item do Estoque, dos Materiais ou da Tabela de preços, ele aparece aqui.</p>
      ) : (
        grupos.map((g) => (
          <section key={g.titulo} className="itens-forn__grupo">
            <div className="itens-forn__topo">
              <strong><g.icon size={14} /> {g.titulo} <span className="muted">({g.linhas.length})</span></strong>
              <Link to={g.caminho} className="small">Abrir {g.titulo.toLowerCase()} <ChevronRight size={13} /></Link>
            </div>
            <ul>
              {g.linhas.map((l) => (
                <li key={l.id}>
                  <span className="itens-forn__nome">
                    <b>{l.nome}</b>
                    {l.detalhe && <span className="muted small">{l.detalhe}</span>}
                  </span>
                  {l.valor && <span className="itens-forn__valor">{l.valor}</span>}
                  {l.link ? (
                    <a className="btn btn--primary btn--sm" href={l.link} target="_blank" rel="noopener noreferrer"><ShoppingCart size={14} /> Comprar</a>
                  ) : (
                    <span className="muted small itens-forn__semlink">sem link</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
