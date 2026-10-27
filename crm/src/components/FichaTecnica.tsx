import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ClipboardList, PackagePlus, Plus, Printer, Trash2, X } from 'lucide-react';
import type { Field } from '../collections';
import { api } from '../lib/api';
import { reload, useResource, type Row } from '../lib/data';
import { brl, num, pct } from '../lib/format';
import {
  atualizarCustos, calcularFicha, custoBaseTxt, custoDaAlternativa, custoDoItem, opcoesDoItem, tornarPrincipal, UNIDADES, unidadesCompativeis, usarOpcao,
  type AlternativaFicha, type Cotacao, type Ficha, type FixoFicha, type Insumo, type ItemFicha, type Opcao, type Recipiente,
} from '../lib/ficha';
import { imprimirFicha } from '../lib/fichaPdf';
import { useSession } from '../lib/session';
import { listaDe, SelectComOutro } from './OpcaoOutro';
import { PreparoFicha } from './PreparoFicha';
import { RefPicker } from './pickers';
import { NumberInput, notify } from './ui';

const CAMPO_INSUMO: Field = {
  key: 'insumo', label: 'Insumo', type: 'ref', ref: 'insumos', refKey: 'insumoId', livre: true,
  fill: { unidadeBase: 'unidade', custoBase: 'custo' },
};
/** Alternativa de um insumo: só itens do Estoque (é de lá que a baixa sai). */
const CAMPO_ALTERNATIVA: Field = { ...CAMPO_INSUMO, livre: false };
const QTD = { decimals: 3, min: 0, max: 100_000 };
const DINHEIRO = { money: true, decimals: 2, min: 0, max: 100_000 };
const ITEM_NOVO: ItemFicha = { insumo: '', insumoId: null, quantidade: 0, unidade: 'ml', unidadeBase: 'ml', custoBase: 0 };
const UNIDADES_LIVRES = ['ml', 'L', 'g', 'kg', 'un', 'dose', 'pct'];
const INSUMOS = '/crm/referencias/insumos';
const PRECOS = '/crm/referencias/precos';

/** CMV dentro do alvo fica verde; até 5 pontos acima, amarelo; mais que isso, vermelho. */
function tomCmv(cmv: number | null, alvo: number) {
  if (cmv === null) return 'neutral';
  return cmv * 100 <= alvo ? 'good' : cmv * 100 <= alvo + 5 ? 'warn' : 'bad';
}
/** Na receita, um insumo comprado em L ou kg é medido em ml ou g. */
const unidadeDaReceita = (base: string, atual: string) => {
  const opcoes = unidadesCompativeis(base);
  return opcoes.includes(atual) ? atual : (opcoes.find((u) => u === 'ml' || u === 'g') ?? base);
};

/**
 * Ficha técnica do produto: insumos com quantidade e custo (do Estoque ou do fornecedor escolhido),
 * rendimento e perdas. Calcula custo por porção, CMV, margem e o preço sugerido para o CMV desejado.
 */
export function FichaTecnica({ ficha, preco, nome, disabled, preMarcar, onChange, onUsarPreco }: {
  ficha: Ficha; preco: number; nome: string; disabled: boolean;
  /** Ficha nova (tela "Fichas técnicas"): já marca os itens fixos "padrão", como o gelo. */
  preMarcar?: boolean;
  onChange: (f: Ficha) => void;
  onUsarPreco: (preco: number) => void;
}) {
  const insumos = useResource<Insumo[]>(INSUMOS);
  const cotacoes = useResource<Cotacao[]>(PRECOS);
  const listaInsumos = insumos.data ?? [];
  const listaCotacoes = cotacoes.data ?? [];
  const guarnicoes = useResource<Row[]>('/crm/c/guarnicoes');
  const copos = useResource<Recipiente[]>('/crm/referencias/copos');
  const utensilios = useResource<Recipiente[]>('/crm/referencias/utensilios');
  const fixosAtivos: (FixoFicha & { padrao: boolean })[] = (guarnicoes.data ?? [])
    .filter((g) => g.status !== 'Inativo')
    .map((g) => ({ id: g.id, nome: String(g.nome ?? ''), custo: Number(g.custo) || 0, padrao: g.padrao === 'Sim' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  // os marcados que saíram do cadastro (inativos ou apagados) continuam visíveis para poder desmarcar
  const fixosNaTela = [...fixosAtivos, ...ficha.fixos.filter((x) => !fixosAtivos.some((g) => g.id === x.id)).map((x) => ({ ...x, padrao: false }))];
  const temReceita = ficha.itens.length > 0 || ficha.fixos.length > 0;
  const c = calcularFicha(ficha, preco);

  // ao abrir, cada item pega o custo de hoje (do fornecedor escolhido ou do Estoque), uma vez só, quando as listas chegam
  const atualizado = useRef(false);
  useEffect(() => {
    const pronta = (r: { data?: unknown; error: string | null }) => !!r.data || !!r.error;
    if (atualizado.current || disabled || !insumos.data || ![cotacoes, guarnicoes, copos, utensilios].every(pronta)) return;
    atualizado.current = true;
    const lista = (guarnicoes.data ?? []).map((g) => ({ id: g.id, nome: String(g.nome ?? ''), custo: Number(g.custo) || 0 }));
    const { ficha: atual, mudou } = atualizarCustos(ficha, insumos.data, cotacoes.data ?? [], lista, copos.data ?? [], utensilios.data ?? []);
    // ficha ainda vazia: já vêm marcados os itens fixos "padrão" (ex.: gelo)
    const padroes = preMarcar && !atual.itens.length && !atual.fixos.length ? fixosAtivos.filter((g) => g.padrao).map(({ id, nome, custo }) => ({ id, nome, custo })) : [];
    if (mudou || padroes.length) onChange(padroes.length ? { ...atual, fixos: padroes } : atual);
    if (mudou) notify(`Custo de ${mudou} ${mudou === 1 ? 'item atualizado' : 'itens atualizados'} com os preços de hoje. Salve para gravar.`);
  }, [insumos.data, cotacoes, guarnicoes, copos, utensilios, disabled, preMarcar, ficha, onChange, fixosAtivos]);

  const alternarFixo = (g: FixoFicha) => {
    const marcado = ficha.fixos.some((x) => x.id === g.id);
    onChange({ ...ficha, fixos: marcado ? ficha.fixos.filter((x) => x.id !== g.id) : [...ficha.fixos, { id: g.id, nome: g.nome, custo: g.custo }] });
  };

  const trocarItem = (idx: number, item: ItemFicha) => onChange({ ...ficha, itens: ficha.itens.map((it, i) => (i === idx ? item : it)) });
  const mudarItem = (idx: number, patch: Partial<ItemFicha>) => trocarItem(idx, { ...ficha.itens[idx], ...patch });

  /** Troca a unidade da receita; se a origem de custo atual não se converte nela, usa a mais barata que se converte. */
  const mudarUnidade = (idx: number, unidade: string) => {
    const atual = ficha.itens[idx];
    if (!atual.insumoId) return mudarItem(idx, { unidade, unidadeBase: unidade });
    const item = { ...atual, unidade };
    if (unidadesCompativeis(atual.unidadeBase).includes(unidade)) return trocarItem(idx, item);
    const melhor = opcoesDoItem(item, listaInsumos, listaCotacoes).find((o) => o.compativel);
    trocarItem(idx, melhor ? usarOpcao(item, melhor) : item);
  };

  /** Vincula o item a um insumo do Estoque e já escolhe a origem de custo mais barata (fornecedor ou Estoque). */
  const vincular = (idx: number, insumo: Insumo) => {
    const atual = ficha.itens[idx];
    let item: ItemFicha = {
      ...atual, insumo: insumo.nome, insumoId: insumo.id, unidadeBase: insumo.unidade, custoBase: insumo.custo,
      precoId: null, fornecedor: '', unidade: unidadeDaReceita(insumo.unidade, atual.unidade),
    };
    let ops = opcoesDoItem(item, listaInsumos.some((x) => x.id === insumo.id) ? listaInsumos : [...listaInsumos, insumo], listaCotacoes);
    // insumo sem custo no Estoque e com preço só em outra unidade (ex.: Estoque em "un", fornecedor em ml)
    if (!ops.some((o) => o.compativel) && ops.length) {
      item = { ...item, unidade: unidadeDaReceita(ops[0].unidadeBase, item.unidade) };
      ops = opcoesDoItem(item, listaInsumos, listaCotacoes);
    }
    const melhor = ops.find((o) => o.compativel);
    trocarItem(idx, melhor ? usarOpcao(item, melhor) : item);
  };

  const escolherInsumo = (idx: number, patch: Record<string, unknown>) => {
    const atual = ficha.itens[idx];
    if ('insumoId' in patch && patch.insumoId) {
      vincular(idx, { id: String(patch.insumoId), nome: String(patch.insumo ?? ''), unidade: String(patch.unidadeBase ?? 'un'), custo: Number(patch.custoBase) || 0 });
    } else {
      // digitado à mão: o custo é informado na própria linha, na unidade da receita
      mudarItem(idx, atual.insumoId
        ? { insumo: String(patch.insumo ?? atual.insumo), insumoId: null, unidadeBase: atual.unidade, custoBase: 0, precoId: null, fornecedor: '' }
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
        {temReceita && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void imprimir()}><Printer size={14} /> Imprimir ficha</button>
        )}
      </div>

      {ficha.itens.length > 0 && (
        <div className="ficha__itens">
          <div className="ficha__cab" aria-hidden>
            <span>Insumo</span><span>Quantidade</span><span>Unidade</span><span>Preço usado</span><span className="num">Custo</span><span />
          </div>
          {ficha.itens.map((it, idx) => (
            <LinhaFicha
              key={idx} item={it} disabled={disabled}
              opcoes={opcoesDoItem(it, listaInsumos, listaCotacoes)}
              onChange={(item) => trocarItem(idx, item)}
              onUnidade={(u) => mudarUnidade(idx, u)}
              onInsumo={(p) => escolherInsumo(idx, p)}
              onCriado={(insumo) => vincular(idx, insumo)}
              onRemover={() => onChange({ ...ficha, itens: ficha.itens.filter((_, i) => i !== idx) })}
            />
          ))}
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

      <div className="ficha__fixos">
        <div className="ficha__fixos-cab">
          <span>Guarnições e itens fixos <span className="muted small">· valor fixo por porção, sem pesar</span></span>
          {c.fixos > 0 && <strong className="small">{brl(c.fixos)} por porção</strong>}
        </div>
        {fixosNaTela.length > 0 ? (
          <div className="ficha__fixos-lista">
            {fixosNaTela.map((g) => {
              const marcado = ficha.fixos.some((x) => x.id === g.id);
              return (
                <button key={g.id} type="button" className={`ficha__fixo ${marcado ? 'is-on' : ''}`} aria-pressed={marcado} disabled={disabled} onClick={() => alternarFixo(g)}>
                  <span className="ficha__fixo-check">{marcado && <Check size={12} />}</span>
                  {g.nome} <span className="muted">{brl(g.custo)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <span className="muted small">{guarnicoes.error ? 'Não foi possível carregar os itens fixos.' : 'Cadastre gelo, rodelas de fruta, canudos etc. em Vendas → Guarnições e itens fixos, com o valor de cada um por drink.'}</span>
        )}
      </div>

      {temReceita && (
        <>
          <div className="ficha__params">
            <div className="form-field">
              <label>Rendimento (porções)</label>
              <NumberInput spec={{ decimals: 1, min: 0.1, max: 10_000 }} value={ficha.rendimento} disabled={disabled} onChange={(v) => onChange({ ...ficha, rendimento: v === '' ? 1 : Math.max(0.1, v) })} />
            </div>
            <div className="form-field">
              <label>Perdas e quebras</label>
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
          <EconomiaPossivel ficha={ficha} insumos={listaInsumos} cotacoes={listaCotacoes} />
          <p className="muted small">O campo "Custo" do produto passa a ser o custo por porção calculado aqui.</p>

          <PreparoFicha ficha={ficha} copos={copos.data ?? []} utensilios={utensilios.data ?? []} disabled={disabled} onChange={onChange} />
        </>
      )}
    </div>
  );
}

/** Uma linha da receita, com a comparação entre fornecedores logo abaixo. */
function LinhaFicha({ item: it, opcoes, disabled, onChange, onUnidade, onInsumo, onCriado, onRemover }: {
  item: ItemFicha; opcoes: Opcao[]; disabled: boolean;
  onChange: (i: ItemFicha) => void;
  onUnidade: (u: string) => void;
  onInsumo: (patch: Record<string, unknown>) => void;
  onCriado: (insumo: Insumo) => void;
  onRemover: () => void;
}) {
  const { pode } = useSession();
  const [cadastrando, setCadastrando] = useState(false);
  const [alternando, setAlternando] = useState(false);
  const alts = it.alternativas ?? [];
  const comAlternativas = (alternativas: AlternativaFicha[]) => {
    const { alternativas: _, ...resto } = it;
    onChange(alternativas.length ? { ...resto, alternativas } : resto);
  };
  const adicionarAlternativa = (p: Record<string, unknown>) => {
    const id = String(p.insumoId ?? '');
    if (!id) return;
    setAlternando(false);
    if (id === it.insumoId || alts.some((a) => a.insumoId === id)) return notify(`"${String(p.insumo)}" já está nesta linha.`, 'error');
    comAlternativas([...alts, { insumo: String(p.insumo ?? ''), insumoId: id, unidadeBase: String(p.unidadeBase ?? 'un'), custoBase: Number(p.custoBase) || 0 }]);
  };
  const vinculado = !!it.insumoId;
  // unidades em que o Estoque ou algum fornecedor permite medir o insumo (ex.: Estoque em "un", fornecedor em ml)
  const unidades = vinculado
    ? UNIDADES.filter((u) => [it.unidadeBase, ...opcoes.map((o) => o.unidadeBase)].some((b) => unidadesCompativeis(b).includes(u)))
    : UNIDADES_LIVRES;
  const escolhida = opcoes.find((o) => o.precoId === (it.precoId ?? null) && o.compativel);
  const custo = custoDoItem(it);
  const maisBarata = opcoes.find((o) => o.compativel);

  return (
    <div className="ficha__item">
      <div className="fi-insumo">
        <RefPicker field={CAMPO_INSUMO} value={it.insumo} linkedId={it.insumoId} disabled={disabled} onChange={onInsumo} />
      </div>
      <div className="fi-qtd">
        <NumberInput ariaLabel="Quantidade" spec={QTD} value={it.quantidade || ''} disabled={disabled} onChange={(v) => onChange({ ...it, quantidade: v === '' ? 0 : v })} />
      </div>
      <select
        className="input fi-un" aria-label="Unidade" disabled={disabled} value={it.unidade}
        onChange={(e) => onUnidade(e.target.value)}
      >
        {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <div className="fi-base">
        {vinculado ? (
          <span className="muted small" title={it.precoId ? 'Preço do fornecedor (Tabela de preços)' : 'Custo cadastrado no Estoque'}>
            {it.custoBase ? <><b>{it.precoId ? it.fornecedor : 'Estoque'}</b> · {escolhida?.detalhe ?? custoBaseTxt(it)}</> : 'sem custo no Estoque'}
          </span>
        ) : (
          <NumberInput ariaLabel={`Custo por ${it.unidade}`} spec={DINHEIRO} prefix="R$" suffix={`/${it.unidade}`} value={it.custoBase || ''} disabled={disabled} onChange={(v) => onChange({ ...it, custoBase: v === '' ? 0 : v })} />
        )}
      </div>
      <strong className="fi-custo num">{brl(custo)}</strong>
      {!disabled && (
        <button type="button" className="icon-btn fi-del" aria-label="Remover insumo" title="Remover" onClick={onRemover}>
          <Trash2 size={15} />
        </button>
      )}

      {vinculado && opcoes.length > 1 && (
        <div className="ficha__comparar" role="group" aria-label={`Comparar preços de ${it.insumo}`}>
          {opcoes.map((o) => {
            const atual = o.precoId === (it.precoId ?? null);
            const dif = o.custo - custo;
            return (
              <button
                key={o.precoId ?? 'estoque'} type="button" disabled={disabled || !o.compativel || atual}
                className={`ficha__opcao ${atual ? 'is-atual' : ''}`}
                onClick={() => onChange(usarOpcao(it, o))}
                title={o.compativel ? `Usar o preço de ${o.fornecedor}` : `O preço está em ${o.unidadeBase}: não dá para comparar com ${it.unidade}`}
              >
                <span className="ficha__opcao-nome">{o.fornecedor}{o === maisBarata && opcoes.filter((x) => x.compativel).length > 1 && <em> mais barato</em>}</span>
                <span className="muted small">{o.detalhe}</span>
                <span className="ficha__opcao-valor">
                  {o.compativel ? <>{brl(o.custo)} {!atual && it.quantidade > 0 && Math.abs(dif) >= 0.005 && <small className={dif < 0 ? 'text-good' : 'text-bad'}>{dif < 0 ? '−' : '+'}{brl(Math.abs(dif))}</small>}{atual && <small> em uso</small>}</> : <small>outra unidade</small>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {vinculado && (alts.length > 0 || !disabled) && (
        <div className="ficha__alts" role="group" aria-label={`Alternativas para ${it.insumo}`}>
          {alts.length > 0 && <span className="muted small">Se faltar, tira de:</span>}
          {alts.map((a, k) => {
            const ca = custoDaAlternativa(it, a);
            return (
              <span key={a.insumoId} className="ficha__alt" title={ca === null ? `"${a.insumo}" está em ${a.unidadeBase}: não se converte em ${it.unidade}` : undefined}>
                <b className="ficha__alt-ordem">{k + 2}º</b>
                <span className="ficha__alt-nome">{a.insumo}</span>
                <span className="muted small">{ca === null ? 'outra unidade' : brl(ca)}</span>
                {!disabled && (
                  <>
                    <button type="button" className="icon-btn" aria-label={`Usar ${a.insumo} como principal`} title="Usar como principal (custo da ficha)" onClick={() => onChange(tornarPrincipal(it, k))}><ArrowUp size={13} /></button>
                    <button type="button" className="icon-btn" aria-label={`Tirar ${a.insumo}`} title="Tirar alternativa" onClick={() => comAlternativas(alts.filter((_, j) => j !== k))}><X size={13} /></button>
                  </>
                )}
              </span>
            );
          })}
          {!disabled && (alternando ? (
            <div className="ficha__alt-novo">
              <RefPicker field={CAMPO_ALTERNATIVA} value="" linkedId={null} onChange={adicionarAlternativa} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAlternando(false)}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm ficha__alt-add" onClick={() => setAlternando(true)} title="Outro item do Estoque que serve no lugar deste (ex.: barril de 30 L no lugar do de 50 L)">
              <Plus size={13} /> {alts.length ? 'Outra alternativa' : 'Alternativa (ex.: outro barril)'}
            </button>
          ))}
        </div>
      )}

      {vinculado && !disabled && !unidades.some((u) => ['ml', 'L', 'g', 'kg'].includes(u)) && (
        <p className="ficha__dica muted small">
          "{it.insumo}" está no Estoque em {it.unidadeBase}. Para medir em ml ou g, informe em Estrutura → Estoque o conteúdo de cada {it.unidadeBase} (ex.: 1 garrafa = 750 ml) ou cadastre o preço do fornecedor em ml na Tabela de preços.
        </p>
      )}
      {!vinculado && it.insumo.trim() && !disabled && pode('estoque', 'criar') && !cadastrando && (
        <div className="ficha__comparar">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCadastrando(true)}>
            <PackagePlus size={14} /> Cadastrar "{it.insumo.trim()}" no Estoque
          </button>
        </div>
      )}
      {cadastrando && (
        <NovoInsumo
          nome={it.insumo.trim()} unidade={it.unidade} custo={it.custoBase}
          onCancelar={() => setCadastrando(false)}
          onCriado={(insumo) => { setCadastrando(false); onCriado(insumo); }}
        />
      )}
    </div>
  );
}

/** Quanto a receita ficaria mais barata usando, em cada insumo, o fornecedor mais barato. */
function EconomiaPossivel({ ficha, insumos, cotacoes }: { ficha: Ficha; insumos: Insumo[]; cotacoes: Cotacao[] }) {
  let economia = 0;
  for (const it of ficha.itens) {
    const melhor = opcoesDoItem(it, insumos, cotacoes).find((o) => o.compativel);
    if (melhor && melhor.custo < custoDoItem(it)) economia += custoDoItem(it) - melhor.custo;
  }
  const porPorcao = (economia * (1 + (ficha.perdas || 0) / 100)) / (ficha.rendimento || 1);
  if (porPorcao < 0.005) return null;
  return <p className="ficha__economia">Com o fornecedor mais barato em cada insumo, a porção sairia <b>{brl(porPorcao)}</b> mais barata.</p>;
}

/** Cadastra no Estoque um insumo digitado na receita, sem sair da tela. */
function NovoInsumo({ nome, unidade, custo, onCancelar, onCriado }: {
  nome: string; unidade: string; custo: number;
  onCancelar: () => void; onCriado: (i: Insumo) => void;
}) {
  const unidadesEstoque = ['un', 'cx', 'fardo', 'kg', 'g', 'L', 'ml', 'pct'];
  const [item, setItem] = useState(nome);
  const [categoria, setCategoria] = useState('Bebidas');
  const [un, setUn] = useState(unidadesEstoque.includes(unidade) ? unidade : 'un');
  const [valor, setValor] = useState<number | ''>(custo || '');
  const [conteudo, setConteudo] = useState<number | ''>('');
  const [medida, setMedida] = useState(['ml', 'L', 'g', 'kg'].includes(unidade) ? unidade : 'ml');
  const contado = !['ml', 'L', 'g', 'kg'].includes(un);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    if (item.trim().length < 2) return setErro('Informe o nome do insumo.');
    setSalvando(true);
    setErro(null);
    try {
      const c = valor === '' ? 0 : valor;
      const comConteudo = contado && conteudo !== '' && conteudo > 0;
      const novo = await api<{ id: string }>('/crm/c/estoque', {
        method: 'POST',
        body: { item: item.trim(), categoria, unidade: un, quantidade: 0, custo: c, ...(comConteudo ? { conteudo, conteudoUnidade: medida } : {}) },
      });
      void reload(INSUMOS);
      notify(`"${item.trim()}" cadastrado no Estoque`);
      // garrafa com conteúdo informado: a receita já mede em ml/g
      onCriado(comConteudo ? { id: novo.id, nome: item.trim(), unidade: medida, custo: c / conteudo } : { id: novo.id, nome: item.trim(), unidade: un, custo: c });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível cadastrar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="ficha__novo" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void salvar(); } }}>
      <strong className="small">Novo item no Estoque</strong>
      <div className="ficha__novo-campos">
        <input className="input" aria-label="Nome do insumo" maxLength={120} value={item} onChange={(e) => setItem(e.target.value)} />
        <SelectComOutro aria-label="Categoria" lista={listaDe('estoque', 'categoria')} rotulo="Categoria" value={categoria} onChange={setCategoria}
          options={['Bebidas', 'Alimentos', 'Descartáveis', 'Limpeza', 'Outros']} />
        <select className="input" aria-label="Unidade de compra" value={un} onChange={(e) => setUn(e.target.value)}>
          {unidadesEstoque.map((u) => <option key={u}>{u}</option>)}
        </select>
        <NumberInput ariaLabel="Custo por unidade" spec={DINHEIRO} prefix="R$" suffix={`/${un}`} value={valor} onChange={setValor} />
        {contado && (
          <>
            <NumberInput ariaLabel={`Conteúdo de cada ${un}`} spec={{ decimals: 3, min: 0, max: 1_000_000 }} prefix={`1 ${un} =`} placeholder="750" value={conteudo} onChange={setConteudo} />
            <select className="input" aria-label="Medida do conteúdo" value={medida} onChange={(e) => setMedida(e.target.value)}>
              {['ml', 'L', 'g', 'kg'].map((u) => <option key={u}>{u}</option>)}
            </select>
          </>
        )}
      </div>
      <span className="muted small">Entra com quantidade 0; ajuste o estoque depois em Estrutura → Estoque.</span>
      {erro && <p className="error small">{erro}</p>}
      <div className="ficha__novo-acoes">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn btn--primary btn--sm" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Cadastrando…' : 'Cadastrar e usar'}</button>
      </div>
    </div>
  );
}
