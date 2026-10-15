import { useEffect, useRef } from 'react';
import { ClipboardList, Plus, Printer, Trash2 } from 'lucide-react';
import type { Field } from '../collections';
import { useResource } from '../lib/data';
import { brl, num, pct } from '../lib/format';
import { atualizarCustos, calcularFicha, custoDoItem, unidadesCompativeis, type Ficha, type Insumo, type ItemFicha } from '../lib/ficha';
import { imprimirFicha } from '../lib/fichaPdf';
import { RefPicker } from './pickers';
import { NumberInput, notify } from './ui';

const CAMPO_INSUMO: Field = {
  key: 'insumo', label: 'Insumo', type: 'ref', ref: 'insumos', refKey: 'insumoId', livre: true,
  fill: { unidadeBase: 'unidade', custoBase: 'custo' },
};
const QTD = { decimals: 3, min: 0, max: 100_000 };
const DINHEIRO = { money: true, decimals: 2, min: 0, max: 100_000 };
const ITEM_NOVO: ItemFicha = { insumo: '', insumoId: null, quantidade: 0, unidade: 'ml', unidadeBase: 'ml', custoBase: 0 };

/** CMV dentro do alvo fica verde; até 5 pontos acima, amarelo; mais que isso, vermelho. */
function tomCmv(cmv: number | null, alvo: number) {
  if (cmv === null) return 'neutral';
  return cmv * 100 <= alvo ? 'good' : cmv * 100 <= alvo + 5 ? 'warn' : 'bad';
}

/**
 * Ficha técnica do produto: insumos com quantidade e custo, rendimento e perdas.
 * Calcula custo por porção, CMV, margem e o preço sugerido para o CMV desejado.
 */
export function FichaTecnica({ ficha, preco, nome, disabled, onChange, onUsarPreco }: {
  ficha: Ficha; preco: number; nome: string; disabled: boolean;
  onChange: (f: Ficha) => void;
  onUsarPreco: (preco: number) => void;
}) {
  const insumos = useResource<Insumo[]>('/crm/referencias/insumos');
  const c = calcularFicha(ficha, preco);

  // ao abrir, os itens ligados ao Estoque pegam o custo de hoje (uma vez só, quando a lista chega)
  const atualizado = useRef(false);
  useEffect(() => {
    if (atualizado.current || !insumos.data || disabled) return;
    atualizado.current = true;
    const { ficha: nova, mudou } = atualizarCustos(ficha, insumos.data);
    if (mudou) {
      onChange(nova);
      notify(`Custo de ${mudou} ${mudou === 1 ? 'insumo atualizado' : 'insumos atualizados'} com o Estoque. Salve para gravar.`);
    }
  }, [insumos.data, disabled, ficha, onChange]);

  const mudarItem = (idx: number, patch: Partial<ItemFicha>) => {
    onChange({ ...ficha, itens: ficha.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  };
  const escolherInsumo = (idx: number, patch: Record<string, unknown>) => {
    const atual = ficha.itens[idx];
    const vinculou = 'insumoId' in patch && patch.insumoId;
    if (vinculou) {
      // unidade de compra do Estoque; a receita usa a menor unidade do grupo (L → ml, kg → g)
      const base = String(patch.unidadeBase ?? 'un');
      const opcoes = unidadesCompativeis(base);
      const unidade = opcoes.includes(atual.unidade) ? atual.unidade : (opcoes.find((u) => u === 'ml' || u === 'g') ?? base);
      mudarItem(idx, { insumo: String(patch.insumo ?? ''), insumoId: String(patch.insumoId), unidadeBase: base, custoBase: Number(patch.custoBase) || 0, unidade });
    } else {
      // digitado à mão: o custo é informado na própria linha, na unidade da receita
      mudarItem(idx, atual.insumoId
        ? { insumo: String(patch.insumo ?? atual.insumo), insumoId: null, unidadeBase: atual.unidade, custoBase: 0 }
        : { insumo: String(patch.insumo ?? atual.insumo) });
    }
  };

  const imprimir = async () => {
    try {
      await imprimirFicha(nome || 'Produto', ficha, preco);
    } catch (e) {
      console.error(e);
      notify('Não foi possível gerar o PDF.', 'error');
    }
  };

  return (
    <div className="form-field form-field--wide ficha">
      <div className="ficha__titulo">
        <label><ClipboardList size={15} /> Ficha técnica</label>
        {ficha.itens.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void imprimir()}><Printer size={14} /> Imprimir ficha</button>
        )}
      </div>

      {ficha.itens.length > 0 && (
        <div className="ficha__itens">
          <div className="ficha__cab" aria-hidden>
            <span>Insumo</span><span>Quantidade</span><span>Unidade</span><span>Custo de compra</span><span className="num">Custo</span><span />
          </div>
          {ficha.itens.map((it, idx) => {
            const vinculado = !!it.insumoId;
            const unidades = vinculado ? unidadesCompativeis(it.unidadeBase) : ['ml', 'L', 'g', 'kg', 'un', 'dose', 'pct'];
            return (
              <div key={idx} className="ficha__item">
                <div className="ficha__insumo">
                  <RefPicker field={CAMPO_INSUMO} value={it.insumo} linkedId={it.insumoId} disabled={disabled} onChange={(p) => escolherInsumo(idx, p)} />
                </div>
                <NumberInput ariaLabel="Quantidade" spec={QTD} value={it.quantidade || ''} disabled={disabled} onChange={(v) => mudarItem(idx, { quantidade: v === '' ? 0 : v })} />
                <select
                  className="input" aria-label="Unidade" disabled={disabled} value={it.unidade}
                  onChange={(e) => mudarItem(idx, vinculado ? { unidade: e.target.value } : { unidade: e.target.value, unidadeBase: e.target.value })}
                >
                  {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                {vinculado ? (
                  <span className="ficha__base muted small" title="Custo cadastrado no Estoque">
                    {it.custoBase ? `${brl(it.custoBase)}/${it.unidadeBase}` : 'sem custo no Estoque'}
                  </span>
                ) : (
                  <NumberInput ariaLabel={`Custo por ${it.unidade}`} spec={DINHEIRO} prefix="R$" suffix={`/${it.unidade}`} value={it.custoBase || ''} disabled={disabled} onChange={(v) => mudarItem(idx, { custoBase: v === '' ? 0 : v })} />
                )}
                <strong className="ficha__custo num">{brl(custoDoItem(it))}</strong>
                {!disabled && (
                  <button type="button" className="icon-btn" aria-label="Remover insumo" title="Remover" onClick={() => onChange({ ...ficha, itens: ficha.itens.filter((_, i) => i !== idx) })}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!disabled && (
        <div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange({ ...ficha, itens: [...ficha.itens, { ...ITEM_NOVO }] })}>
            <Plus size={14} /> Adicionar insumo
          </button>
          {ficha.itens.length === 0 && <span className="muted small"> Monte a receita com os insumos do Estoque para calcular o custo da porção.</span>}
        </div>
      )}
      {insumos.error && <p className="error small">Não foi possível carregar o Estoque: {insumos.error}</p>}

      {ficha.itens.length > 0 && (
        <>
          <div className="ficha__params">
            <div className="form-field">
              <label>Rendimento (porções)</label>
              <NumberInput spec={{ decimals: 1, min: 0.1, max: 10_000 }} value={ficha.rendimento} disabled={disabled} onChange={(v) => onChange({ ...ficha, rendimento: v === '' ? 1 : Math.max(0.1, v) })} />
            </div>
            <div className="form-field">
              <label>Perdas e guarnições</label>
              <NumberInput spec={{ decimals: 1, min: 0, max: 100 }} suffix="%" value={ficha.perdas} disabled={disabled} onChange={(v) => onChange({ ...ficha, perdas: v === '' ? 0 : v })} />
            </div>
            <div className="form-field">
              <label>CMV desejado</label>
              <NumberInput spec={{ decimals: 1, min: 1, max: 100 }} suffix="%" value={ficha.cmvAlvo} disabled={disabled} onChange={(v) => onChange({ ...ficha, cmvAlvo: v === '' ? 30 : Math.max(1, v) })} />
            </div>
          </div>

          <div className="ficha__resumo">
            <div><span>Custo da receita</span><strong>{brl(c.total)}</strong></div>
            <div><span>Custo por porção</span><strong>{brl(c.porcao)}</strong></div>
            <div className={`ficha__kpi--${tomCmv(c.cmv, ficha.cmvAlvo)}`}>
              <span>CMV atual</span><strong>{c.cmv === null ? '—' : pct(c.cmv)}</strong>
            </div>
            <div><span>Margem por porção</span><strong>{c.margem === null ? '—' : brl(c.margem)}</strong></div>
            <div><span>Markup</span><strong>{c.markup === null ? '—' : `${num(c.markup, 2)}×`}</strong></div>
            <div className="ficha__sugerido">
              <span>Preço sugerido (CMV {num(ficha.cmvAlvo, ficha.cmvAlvo % 1 ? 1 : 0)}%)</span>
              <strong>{c.sugerido ? brl(c.sugerido) : '—'}</strong>
              {!disabled && c.sugerido > 0 && Math.abs(c.sugerido - preco) >= 0.01 && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => onUsarPreco(c.sugerido)}>Usar este preço</button>
              )}
            </div>
          </div>
          <p className="muted small">O campo "Custo" do produto passa a ser o custo por porção calculado aqui.</p>

          <div className="form-field">
            <label htmlFor="ficha-preparo">Modo de preparo</label>
            <textarea id="ficha-preparo" className="input" rows={4} maxLength={3000} disabled={disabled} value={ficha.preparo} onChange={(e) => onChange({ ...ficha, preparo: e.target.value })} placeholder="Passo a passo da receita" />
          </div>
          <div className="form-field">
            <label htmlFor="ficha-montagem">Montagem e apresentação</label>
            <textarea id="ficha-montagem" className="input" rows={2} maxLength={1000} disabled={disabled} value={ficha.montagem} onChange={(e) => onChange({ ...ficha, montagem: e.target.value })} placeholder="Copo ou prato, guarnição, decoração" />
          </div>
        </>
      )}
    </div>
  );
}
