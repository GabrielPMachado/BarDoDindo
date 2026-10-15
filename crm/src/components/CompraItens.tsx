import { useRef, useState } from 'react';
import { Package, Plus, ScanLine, Sparkles, Trash2, Wrench } from 'lucide-react';
import type { Field } from '../collections';
import { api } from '../lib/api';
import { brl } from '../lib/format';
import { lerNotaComIA, maisParecido, nomeBonito, type NotaLida } from '../lib/iaNota';
import { LOCAIS } from '../lib/locais';
import { reduzirFoto } from './Avatar';
import { RefPicker } from './pickers';
import { NumberInput, notify } from './ui';

/** Um item da nota: soma no Estoque (insumos) ou nos Materiais (patrimônio), no local escolhido. */
export interface ItemCompra {
  chave: string;
  destino: 'estoque' | 'materiais';
  itemId: string | null;
  nome: string;
  quantidade: number;
  local: string;
  valorUnitario: number;
  /** Unidade do item no Estoque (garrafa = "un", caixa = "cx"…). */
  unidade: string;
  /** Unidade do item no Estoque quando a nota foi ligada a ele (para avisar se mudar). */
  unidadeCadastro?: string;
  /** Para item novo: categoria (Estoque) ou tipo (Materiais). */
  categoria: string;
  tipo: string;
  /** Como o item veio escrito na nota (quando lido pela IA). */
  lido?: string;
}

interface Insumo { id: string; nome: string; unidadeEstoque?: string; custoEstoque?: number; categoria?: string }
interface Material { id: string; nome: string; tipo?: string; valor?: number }
interface Fornecedor { id: string; nome: string }

const CAMPO_ESTOQUE: Field = {
  key: 'nome', label: 'Item', type: 'ref', ref: 'insumos', refKey: 'itemId', livre: true,
  fill: { unidade: 'unidadeEstoque', unidadeCadastro: 'unidadeEstoque', custoSugerido: 'custoEstoque', categoria: 'categoria' },
};
const CAMPO_MATERIAL: Field = { key: 'nome', label: 'Item', type: 'ref', ref: 'materiais', refKey: 'itemId', livre: true, fill: { tipo: 'tipo', custoSugerido: 'valor' } };
const QTD = { decimals: 3, min: 0, max: 1_000_000 };
const DINHEIRO = { money: true, decimals: 2, min: 0, max: 1_000_000 };
const CATEGORIAS = ['Bebidas', 'Alimentos', 'Descartáveis', 'Limpeza', 'Outros'];
const TIPOS = ['Utensílio', 'Equipamento', 'Mobiliário', 'Uniforme', 'Eletrônico', 'Outro'];
const UNIDADES = ['un', 'cx', 'fardo', 'kg', 'g', 'L', 'ml', 'pct'];

let seq = 0;
export const itemVazio = (): ItemCompra => ({
  chave: `i${Date.now()}-${seq++}`, destino: 'estoque', itemId: null, nome: '', quantidade: 1, local: 'Depósito', valorUnitario: 0, unidade: 'un', categoria: 'Bebidas', tipo: 'Utensílio',
});
export const totalItens = (itens: ItemCompra[]) => Math.round(itens.reduce((t, i) => t + (Number(i.quantidade) || 0) * (Number(i.valorUnitario) || 0), 0) * 100) / 100;

/** Unidade escrita na nota → unidade do Estoque. */
function unidadeDaNota(u: string) {
  const x = u.trim().toUpperCase();
  if (/^(KG|QUILO)/.test(x)) return 'kg';
  if (/^(L|LT|LITRO)/.test(x)) return 'L';
  if (/^ML/.test(x)) return 'ml';
  if (/^G$|^GR/.test(x)) return 'g';
  if (/^CX|^CAIXA/.test(x)) return 'cx';
  if (/^FD|^FARDO/.test(x)) return 'fardo';
  if (/^PC|^PCT|^PACOTE/.test(x)) return 'pct';
  return 'un';
}
const PARECE_BEBIDA = /cerv|chop|vodka|gin\b|whisk|aperol|campari|vinho|espumante|prosecco|refri|coca|guarana|agua|suco|cacha|licor|rum\b|tequila|energ|tonica|xarope|martini|vermute|conhaque|saque/i;
const PARECE_MATERIAL = /\b(taca|taça|copo|caneca|jarra|bandeja|coqueteleira|bailarina|dosador|socador|peneira|faca|tabua|tábua|abridor|balde|mesa|cadeira|uniforme|avental)\b/i;

/**
 * Itens da nota de compra, com o botão "Ler nota com IA". Numa nota já lançada os itens só aparecem
 * (as quantidades já entraram no estoque; para corrigir, exclui-se a nota e lança de novo).
 */
export function CompraItens({ itens, somenteLeitura, onChange, onNotaLida }: {
  itens: ItemCompra[]; somenteLeitura: boolean;
  onChange: (itens: ItemCompra[]) => void;
  /** Cabeçalho lido pela IA (fornecedor, número, data e a foto da nota). */
  onNotaLida: (dados: Record<string, unknown>) => void;
}) {
  const arquivo = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);

  const mudar = (chave: string, patch: Partial<ItemCompra> & { custoSugerido?: unknown }) => onChange(itens.map((i) => {
    if (i.chave !== chave) return i;
    const { custoSugerido, ...resto } = patch;
    const novo = { ...i, ...resto };
    // ao escolher o item, sugere o último custo — sem apagar o valor que já veio da nota
    if (custoSugerido !== undefined && !(Number(i.valorUnitario) > 0)) novo.valorUnitario = Number(custoSugerido) || 0;
    return novo;
  }));

  /** Transforma o que a IA leu em itens, ligando cada um ao cadastro mais parecido. */
  const aplicarLeitura = async (lida: NotaLida) => {
    // listas buscadas na hora da leitura: sempre atualizadas (inclui o que foi cadastrado agora há pouco)
    const [ins, mats, forns] = await Promise.all([
      api<Insumo[]>('/crm/referencias/insumos').catch(() => [] as Insumo[]),
      api<Material[]>('/crm/referencias/materiais').catch(() => [] as Material[]),
      api<Fornecedor[]>('/crm/referencias/fornecedores').catch(() => [] as Fornecedor[]),
    ]);
    const novos: ItemCompra[] = lida.itens.map((l) => {
      const base = { ...itemVazio(), quantidade: l.quantidade || 1, valorUnitario: Math.round((l.valorUnitario || 0) * 100) / 100, lido: l.descricao };
      const ehMaterial = PARECE_MATERIAL.test(l.descricao.normalize('NFD').replace(/[̀-ͯ]/g, ''));
      const insumo = !ehMaterial ? maisParecido(l.descricao, ins) : null;
      const material = !insumo ? maisParecido(l.descricao, mats) : null;
      if (insumo) return { ...base, destino: 'estoque' as const, itemId: insumo.id, nome: insumo.nome, unidade: insumo.unidadeEstoque || unidadeDaNota(l.unidade), unidadeCadastro: insumo.unidadeEstoque, categoria: insumo.categoria || 'Outros' };
      if (material) return { ...base, destino: 'materiais' as const, itemId: material.id, nome: material.nome, tipo: material.tipo || 'Utensílio', local: 'Bar' };
      if (ehMaterial) return { ...base, destino: 'materiais' as const, nome: nomeBonito(l.descricao), tipo: 'Utensílio', local: 'Bar' };
      return { ...base, destino: 'estoque' as const, nome: nomeBonito(l.descricao), unidade: unidadeDaNota(l.unidade), categoria: PARECE_BEBIDA.test(l.descricao) ? 'Bebidas' : 'Outros' };
    });
    onChange([...itens.filter((i) => i.nome.trim()), ...novos]);
    const f = maisParecido(lida.fornecedor, forns, 0.5);
    return { novos, f };
  };

  const lerComIA = async (file?: File) => {
    if (!file) return;
    setLendo(true);
    try {
      const lida = await lerNotaComIA(file);
      const { novos, f } = await aplicarLeitura(lida);
      const cabecalho: Record<string, unknown> = {
        fornecedor: f?.nome ?? lida.fornecedor, fornecedorId: f?.id ?? null,
        ...(lida.numero ? { numero: lida.numero } : {}), ...(lida.data ? { data: lida.data } : {}),
      };
      // a foto da nota fica guardada no registro (reduzida)
      if (file.type.startsWith('image/')) cabecalho.foto = await reduzirFoto(file, 1000, false).catch(() => undefined);
      onNotaLida(cabecalho);
      const ligados = novos.filter((i) => i.itemId).length;
      notify(`Nota lida: ${novos.length} ${novos.length === 1 ? 'item' : 'itens'} (${ligados} já cadastrados, ${novos.length - ligados} novos). Confira antes de salvar.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível ler a nota.', 'error');
    } finally {
      setLendo(false);
    }
  };

  const total = totalItens(itens);

  if (somenteLeitura) {
    return (
      <div className="form-field form-field--wide compra">
        <label><Package size={14} /> Itens da nota</label>
        <div className="compra__lista">
          {itens.map((i) => (
            <div key={i.chave} className="compra__lido">
              <span className="badge badge--neutral">{i.destino === 'materiais' ? 'Materiais' : 'Estoque'}</span>
              <span className="compra__lido-nome">{i.nome}</span>
              <span className="muted small nowrap">{Number(i.quantidade).toLocaleString('pt-BR')} {i.destino === 'estoque' ? i.unidade : 'un'} · {i.local}</span>
              <b className="nowrap">{brl(i.quantidade * i.valorUnitario)}</b>
            </div>
          ))}
        </div>
        <p className="compra__total">Total da nota: <b>{brl(total)}</b></p>
        <p className="muted small">As quantidades já entraram no estoque. Para corrigir, exclua a nota (as quantidades voltam) e lance de novo.</p>
      </div>
    );
  }

  return (
    <div className="form-field form-field--wide compra">
      <div className="compra__ia">
        <div>
          <strong><Sparkles size={15} /> Ler nota com IA</strong>
          <p className="muted small">Tire uma foto (ou envie o PDF) da nota: a IA preenche fornecedor, número, data e itens. Você confere antes de salvar.</p>
        </div>
        <label className={`btn btn--primary ${lendo ? 'is-disabled' : ''}`}>
          <ScanLine size={16} /> {lendo ? 'Lendo a nota…' : 'Fotografar nota'}
          <input ref={arquivo} type="file" accept="image/*,application/pdf" hidden disabled={lendo}
            onChange={(e) => { void lerComIA(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>

      <label><Package size={14} /> Itens da nota</label>
      <div className="compra__lista">
        {itens.map((i, k) => {
          const novo = !i.itemId && !!i.nome.trim();
          return (
            <div key={i.chave} className="compra__item">
              <div className="compra__topo">
                <span className="compra__num">{k + 1}</span>
                <div className="tabs compra__destino" role="radiogroup" aria-label="Onde entra">
                  {(['estoque', 'materiais'] as const).map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={i.destino === d} className={i.destino === d ? 'is-active' : ''}
                      onClick={() => mudar(i.chave, { destino: d, itemId: null })}>
                      {d === 'estoque' ? <><Package size={13} /> Estoque</> : <><Wrench size={13} /> Materiais</>}
                    </button>
                  ))}
                </div>
                <button type="button" className="icon-btn" aria-label="Tirar item" onClick={() => onChange(itens.filter((x) => x.chave !== i.chave))}><Trash2 size={15} /></button>
              </div>
              <div className="compra__nome">
                <RefPicker field={i.destino === 'estoque' ? CAMPO_ESTOQUE : CAMPO_MATERIAL} value={i.nome} linkedId={i.itemId}
                  onChange={(p) => mudar(i.chave, p as Partial<ItemCompra>)} />
                {i.lido && <span className="muted small">Na nota: “{i.lido}”</span>}
              </div>
              {novo && (
                <div className="compra__novo">
                  <span className="badge badge--info">Novo {i.destino === 'estoque' ? 'no Estoque' : 'nos Materiais'}</span>
                  {i.destino === 'estoque' ? (
                    <>
                      <select className="input input--sm" aria-label="Categoria" value={i.categoria} onChange={(e) => mudar(i.chave, { categoria: e.target.value })}>
                        {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </>
                  ) : (
                    <select className="input input--sm" aria-label="Tipo" value={i.tipo} onChange={(e) => mudar(i.chave, { tipo: e.target.value })}>
                      {TIPOS.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div className="compra__valores">
                <div className="form-field">
                  <label>Quantidade</label>
                  {i.destino === 'estoque' ? (
                    <div className="compra__qtd">
                      <NumberInput spec={QTD} ariaLabel="Quantidade" value={i.quantidade || ''} onChange={(v) => mudar(i.chave, { quantidade: v === '' ? 0 : v })} />
                      <select className="input" aria-label="Unidade" value={i.unidade} onChange={(e) => mudar(i.chave, { unidade: e.target.value })}>
                        {[...new Set([i.unidade, ...UNIDADES])].map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                  ) : (
                    <NumberInput spec={QTD} suffix="un" value={i.quantidade || ''} onChange={(v) => mudar(i.chave, { quantidade: v === '' ? 0 : v })} />
                  )}
                </div>
                <div className="form-field">
                  <label>Local</label>
                  <select className="input" aria-label="Local" value={i.local} onChange={(e) => mudar(i.chave, { local: e.target.value })}>
                    {LOCAIS.map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Valor unitário</label>
                  <NumberInput spec={DINHEIRO} prefix="R$" value={i.valorUnitario || ''} onChange={(v) => mudar(i.chave, { valorUnitario: v === '' ? 0 : v })} />
                </div>
                <div className="compra__sub"><span className="muted small">Subtotal</span><b>{brl((i.quantidade || 0) * (i.valorUnitario || 0))}</b></div>
              </div>
              {i.destino === 'estoque' && i.itemId && i.unidadeCadastro && i.unidade !== i.unidadeCadastro && (
                <p className="compra__aviso small">A unidade de “{i.nome}” no Estoque passa de <b>{i.unidadeCadastro}</b> para <b>{i.unidade}</b> ao salvar a nota.</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="compra__rodape">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange([...itens, itemVazio()])}><Plus size={13} /> Adicionar item</button>
        <span className="compra__total">Total da nota: <b>{brl(total)}</b></span>
      </div>
    </div>
  );
}
