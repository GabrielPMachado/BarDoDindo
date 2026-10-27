import { ChevronRight, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { numberSpec, type Field } from '../collections';
import { api } from '../lib/api';
import type { Row } from '../lib/data';
import { calcularFicha, fichaDe } from '../lib/ficha';
import { pct } from '../lib/format';
import { NumberInput } from './ui';

/** Um tamanho no formulário do item principal; `id` é o produto do tamanho já salvo. */
export interface TamanhoRascunho { chave: string; id?: string; tamanho: string; preco: number | '' }

/** Sugestão ao marcar "Vendido em tamanhos" (dá para trocar os nomes, tirar ou incluir outros). */
export const TAMANHOS_SUGERIDOS = ['300 ml', '500 ml', '1 litro'];

/** Do item principal, o que cada tamanho herda (o tamanho tem só nome, preço, pontos e ficha próprios). */
const HERDADOS = ['categoria', 'status', 'noCardapio', 'destaque', 'resumo', 'descricao', 'ingredientes', 'teor', 'docura', 'amargor', 'acidez', 'intensidade', 'notas', 'foto'];

const PRECO: Field = { key: 'preco', label: 'Preço', type: 'money', min: 0.01, max: 100_000 };
let seq = 0;
export const novoTamanho = (tamanho = ''): TamanhoRascunho => ({ chave: `t${++seq}`, tamanho, preco: '' });
export const tamanhosDoItem = (rows: Row[], paiId: string) =>
  rows.filter((r) => r.pai === paiId).sort((a, b) => (Number(a.preco) || 0) - (Number(b.preco) || 0));
export const nomeDoTamanho = (nome: unknown, tamanho: unknown) => `${String(nome ?? '').trim()} ${String(tamanho ?? '').trim()}`.trim();

/** Confere os tamanhos antes de salvar; devolve a mensagem de erro, se houver. */
export function conferirTamanhos(itens: TamanhoRascunho[]): string | null {
  if (!itens.length) return 'Inclua pelo menos um tamanho (ex.: 300 ml).';
  const vistos = new Set<string>();
  for (const [k, t] of itens.entries()) {
    const nome = t.tamanho.trim();
    if (!nome) return `Tamanhos: informe o nome do tamanho da linha ${k + 1}.`;
    if (vistos.has(nome.toLocaleLowerCase('pt-BR'))) return `Tamanhos: "${nome}" aparece duas vezes.`;
    vistos.add(nome.toLocaleLowerCase('pt-BR'));
    if (!(Number(t.preco) >= 0.01)) return `Tamanhos: informe o preço de "${nome}".`;
  }
  return null;
}

/**
 * Grava os tamanhos do item principal: cada um é um produto (aparece no cardápio e tem a sua ficha técnica).
 * Os novos herdam os dados do item; nos que já existem, o que veio do item acompanha a mudança, e o que foi
 * mudado só no tamanho (ex.: outra foto) fica como está.
 */
export async function salvarTamanhos(paiId: string, antes: Row | null, depois: Record<string, unknown>, itens: TamanhoRascunho[], salvos: Row[]) {
  const ficam = new Set(itens.map((t) => t.id).filter(Boolean));
  for (const r of salvos) if (!ficam.has(r.id)) await api(`/crm/c/produtos/${r.id}`, { method: 'DELETE' });
  for (const t of itens) {
    const tamanho = t.tamanho.trim(), preco = Number(t.preco);
    const atual = t.id ? salvos.find((r) => r.id === t.id) : undefined;
    if (!atual) {
      const herdado = Object.fromEntries(HERDADOS.map((k) => [k, depois[k] ?? '']));
      await api('/crm/c/produtos', { method: 'POST', body: { ...herdado, nome: nomeDoTamanho(depois.nome, tamanho), tamanho, preco, pai: paiId, ficha: fichaDe(null) } });
      continue;
    }
    const patch: Record<string, unknown> = {};
    for (const k of HERDADOS) {
      const v = depois[k] ?? '', era = antes?.[k] ?? '', dele = atual[k] ?? '';
      if (v !== era && (dele === era || dele === '')) patch[k] = v;
    }
    // o nome segue o do item enquanto continuar no padrão "Item + tamanho"
    if (String(atual.nome ?? '') === nomeDoTamanho(antes?.nome, atual.tamanho)) {
      const nome = nomeDoTamanho(depois.nome, tamanho);
      if (nome !== atual.nome) patch.nome = nome;
    }
    if (tamanho !== atual.tamanho) patch.tamanho = tamanho;
    if (preco !== Number(atual.preco)) patch.preco = preco;
    if (Object.keys(patch).length) await api(`/crm/c/produtos/${atual.id}`, { method: 'PUT', body: patch });
  }
}

/** No formulário do item principal: os tamanhos, com preço e o atalho para a ficha técnica de cada um. */
export function TamanhosCampo({ itens, salvos, disabled, onChange, onAbrir }: {
  itens: TamanhoRascunho[]; salvos: Row[]; disabled: boolean;
  onChange: (itens: TamanhoRascunho[]) => void; onAbrir?: (r: Row) => void;
}) {
  const mudar = (chave: string, patch: Partial<TamanhoRascunho>) => onChange(itens.map((t) => (t.chave === chave ? { ...t, ...patch } : t)));
  const resumoFicha = (r: Row | undefined) => {
    if (!r) return 'A ficha técnica fica disponível depois de salvar.';
    const f = fichaDe(r.ficha);
    if (!f.itens.length && !f.fixos.length) return 'Sem ficha técnica';
    const c = calcularFicha(f, Number(r.preco) || 0);
    return `Ficha: ${f.itens.length} ${f.itens.length === 1 ? 'insumo' : 'insumos'}${c.cmv != null ? ` · CMV ${pct(c.cmv)}` : ''}`;
  };
  return (
    <div className="form-field form-field--wide tamanhos">
      <label>Tamanhos</label>
      <span className="muted small">Cada tamanho aparece como um item no cardápio do app, conta como um produto e tem a sua própria ficha técnica.</span>
      <ul>
        {itens.map((t, k) => {
          const salvo = t.id ? salvos.find((r) => r.id === t.id) : undefined;
          return (
            <li key={t.chave}>
              <input
                className="input tamanhos__nome" value={t.tamanho} disabled={disabled} placeholder="Ex.: 300 ml" aria-label={`Tamanho ${k + 1}`}
                onChange={(e) => mudar(t.chave, { tamanho: e.target.value })}
              />
              <div className="tamanhos__preco">
                <NumberInput value={t.preco} spec={numberSpec(PRECO)} disabled={disabled} prefix="R$" ariaLabel={`Preço de ${t.tamanho || `tamanho ${k + 1}`}`} onChange={(preco) => mudar(t.chave, { preco })} />
              </div>
              <span className="muted small tamanhos__ficha">{resumoFicha(salvo)}</span>
              <span className="tamanhos__acoes">
                {salvo && onAbrir && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => onAbrir(salvo)} title="Abrir este tamanho (ficha técnica, pontos, foto…)">
                    <ClipboardList size={14} /> Ficha técnica <ChevronRight size={13} />
                  </button>
                )}
                {!disabled && (
                  <button type="button" className="icon-btn" aria-label={`Tirar ${t.tamanho || 'o tamanho'}`} title={salvo ? 'Tirar este tamanho (o produto dele é excluído ao salvar)' : 'Tirar este tamanho'} onClick={() => onChange(itens.filter((x) => x.chave !== t.chave))}>
                    <Trash2 size={15} />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {!disabled && (
        <button type="button" className="btn btn--ghost btn--sm tamanhos__mais" onClick={() => onChange([...itens, novoTamanho()])}>
          <Plus size={14} /> Adicionar tamanho
        </button>
      )}
    </div>
  );
}
