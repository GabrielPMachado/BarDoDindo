import { useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp, Plus, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { reload, useResource, type Row } from '../lib/data';
import { brl } from '../lib/format';
import { conversao, custoBaseTxt, unidadesCompativeis, type Insumo } from '../lib/ficha';
import { useSession } from '../lib/session';
import { NumberInput, notify } from './ui';

/**
 * Consumo médio por drink dos itens que não se pesam no dia a dia. São estimativas de bar
 * (a pessoa ajusta na tela); o valor sai do preço que já está cadastrado no Estoque.
 */
const SUGESTOES: { nome: string; busca: RegExp; consumo: number; unidade: string; dica: string; padrao?: boolean }[] = [
  { nome: 'Gelo', busca: /gelo/i, consumo: 180, unidade: 'g', dica: 'um copo com gelo leva cerca de 180 g', padrao: true },
  { nome: 'Rodela de laranja', busca: /laranja/i, consumo: 25, unidade: 'g', dica: 'uma laranja média (≈ 200 g) rende 8 rodelas' },
  { nome: 'Rodela de limão', busca: /lim[aã]o/i, consumo: 12, unidade: 'g', dica: 'um limão taiti (≈ 100 g) rende 8 rodelas' },
  { nome: 'Folhas de hortelã', busca: /hortel/i, consumo: 2, unidade: 'g', dica: 'um raminho para decorar pesa cerca de 2 g' },
  { nome: 'Canudo', busca: /canudo/i, consumo: 1, unidade: 'un', dica: 'um por drink' },
];
const UNIDADES = ['g', 'kg', 'ml', 'L', 'un'];
const URL = '/crm/c/guarnicoes';

interface Linha { chave: string; nome: string; insumoId: string; consumo: number | ''; unidade: string; dica: string; padrao: boolean; existente?: Row }

/** Valor por drink: preço do item no Estoque (por kg, L ou unidade) × quanto vai em cada drink. */
function calcular(l: Linha, insumos: Insumo[]) {
  const e = insumos.find((x) => x.id === l.insumoId);
  if (!e) return { erro: 'Escolha o item do Estoque.' };
  if (!(e.custo > 0)) return { erro: `"${e.nome}" está sem custo no Estoque.` };
  if (!unidadesCompativeis(e.unidade).includes(l.unidade)) {
    return { erro: `"${e.nome}" está no Estoque em ${e.unidade}. Informe lá o conteúdo de cada ${e.unidade} (ex.: saco = 5 kg) ou mude a medida aqui.` };
  }
  if (!(Number(l.consumo) > 0)) return { erro: 'Informe quanto vai por drink.' };
  const valor = Math.max(0.01, Math.round(e.custo * conversao(l.unidade, e.unidade) * Number(l.consumo) * 100) / 100);
  return { valor, insumo: e, obs: `Calculado pelo Estoque: ${Number(l.consumo).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${l.unidade} de ${e.nome} (${custoBaseTxt({ custoBase: e.custo, unidadeBase: e.unidade })}) por drink.` };
}

/**
 * Calcula o valor por drink das guarnições a partir dos preços do Estoque (média de consumo por drink)
 * e cadastra ou atualiza os itens fixos com um toque.
 */
export function CalculadoraGuarnicoes({ rows }: { rows: Row[] }) {
  const { pode } = useSession();
  const insumos = useResource<Insumo[]>('/crm/referencias/insumos');
  const lista = insumos.data ?? [];
  const [aberta, setAberta] = useState(rows.length === 0);
  const [editadas, setEditadas] = useState<Record<string, Partial<Linha>>>({});
  const [extras, setExtras] = useState<Linha[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);

  // sugestões + itens já cadastrados que foram calculados pelo Estoque, com o que a pessoa mudou na tela
  const linhas = useMemo(() => {
    const porNome = (nome: string) => rows.find((r) => String(r.nome ?? '').trim().toLowerCase() === nome.toLowerCase());
    const base: Linha[] = SUGESTOES.map((s) => {
      const existente = porNome(s.nome);
      const achado = lista.find((i) => s.busca.test(i.nome) && !/suco/i.test(i.nome));
      return {
        chave: s.nome, nome: s.nome, dica: s.dica, padrao: !!s.padrao, existente,
        insumoId: String(existente?.insumoId ?? achado?.id ?? ''),
        consumo: Number(existente?.consumo) || s.consumo, unidade: String(existente?.consumoUnidade ?? s.unidade),
      };
    });
    for (const r of rows) {
      if (r.insumoId && !base.some((b) => b.existente?.id === r.id)) {
        base.push({ chave: r.id, nome: String(r.nome ?? ''), dica: '', padrao: r.padrao === 'Sim', existente: r, insumoId: String(r.insumoId), consumo: Number(r.consumo) || '', unidade: String(r.consumoUnidade ?? 'g') });
      }
    }
    return [...base, ...extras].map((l) => ({ ...l, ...editadas[l.chave] }));
  }, [rows, lista, editadas, extras]);

  const mudar = (chave: string, patch: Partial<Linha>) => setEditadas((e) => ({ ...e, [chave]: { ...e[chave], ...patch } }));

  const salvar = async (l: Linha) => {
    const c = calcular(l, lista);
    if (!('valor' in c) || !c.insumo || !c.valor) return;
    if (!l.nome.trim()) return notify('Dê um nome ao item.', 'error');
    setSalvando(l.chave);
    try {
      const dados = { custo: c.valor, insumo: c.insumo.nome, insumoId: c.insumo.id, consumo: Number(l.consumo), consumoUnidade: l.unidade, observacoes: c.obs };
      if (l.existente) await api(`${URL}/${l.existente.id}`, { method: 'PUT', body: { ...dados, nome: l.nome.trim() } });
      else await api(URL, { method: 'POST', body: { ...dados, nome: l.nome.trim(), padrao: l.padrao ? 'Sim' : 'Não', status: 'Ativo' } });
      await reload(URL);
      setEditadas((e) => { const { [l.chave]: _, ...resto } = e; return resto; });
      setExtras((x) => x.filter((y) => y.chave !== l.chave));
      notify(l.existente ? `"${l.nome}" atualizado para ${brl(c.valor)}` : `"${l.nome}" cadastrado a ${brl(c.valor)} por drink`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSalvando(null);
    }
  };

  const pendentes = linhas.filter((l) => { const c = calcular(l, lista); return 'valor' in c && (!l.existente || Math.abs(Number(l.existente.custo) - (c.valor ?? 0)) >= 0.005); });
  const podeSalvar = (l: Linha) => (l.existente ? pode('vnd', 'editar') : pode('vnd', 'criar'));

  return (
    <div className="panel calc-guar">
      <button type="button" className="calc-guar__cab" onClick={() => setAberta((a) => !a)} aria-expanded={aberta}>
        <Calculator size={16} />
        <span><strong>Calcular pelo Estoque</strong> <span className="muted small">· média de consumo por drink com os preços que você já cadastrou</span></span>
        {pendentes.length > 0 && <span className="badge badge--warn">{pendentes.length} para cadastrar ou atualizar</span>}
        {aberta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {aberta && (
        <div className="calc-guar__corpo">
          {insumos.error && <p className="error small">Não foi possível carregar o Estoque: {insumos.error}</p>}
          <div className="calc-guar__linhas">
            {linhas.map((l) => {
              const c = calcular(l, lista);
              const atual = l.existente ? Number(l.existente.custo) : null;
              const igual = 'valor' in c && atual !== null && Math.abs(atual - (c.valor ?? 0)) < 0.005;
              return (
                <div key={l.chave} className="calc-guar__linha">
                  <input className="input cg-nome" aria-label="Nome do item" maxLength={80} value={l.nome} onChange={(e) => mudar(l.chave, { nome: e.target.value })} />
                  <select className="input cg-insumo" aria-label="Item do Estoque" value={l.insumoId} onChange={(e) => mudar(l.chave, { insumoId: e.target.value })}>
                    <option value="">Item do Estoque…</option>
                    {lista.map((i) => <option key={i.id} value={i.id}>{i.nome}{i.custo ? ` · ${custoBaseTxt({ custoBase: i.custo, unidadeBase: i.unidade })}` : ''}</option>)}
                  </select>
                  <div className="cg-consumo">
                    <NumberInput ariaLabel="Quanto vai por drink" spec={{ decimals: 3, min: 0, max: 100_000 }} value={l.consumo} onChange={(v) => mudar(l.chave, { consumo: v })} />
                    <select className="input" aria-label="Medida" value={l.unidade} onChange={(e) => mudar(l.chave, { unidade: e.target.value })}>
                      {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="cg-valor">
                    {'valor' in c ? <strong>{brl(c.valor ?? 0)}<span className="muted small"> /drink</span></strong> : <span className="muted small">{c.erro}</span>}
                    {atual !== null && !igual && 'valor' in c && <span className="muted small">hoje: {brl(atual)}</span>}
                  </div>
                  <div className="cg-acao">
                    {'valor' in c && podeSalvar(l) && (igual ? <span className="badge badge--good">Em dia</span> : (
                      <button type="button" className="btn btn--ghost btn--sm" disabled={salvando === l.chave} onClick={() => void salvar(l)}>
                        {l.existente ? <><RefreshCw size={13} /> Atualizar</> : <><Plus size={13} /> Cadastrar</>}
                      </button>
                    ))}
                  </div>
                  {l.dica && <span className="cg-dica muted small">{l.dica}</span>}
                </div>
              );
            })}
          </div>
          <div className="calc-guar__rodape">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setExtras((x) => [...x, { chave: `novo-${Date.now()}`, nome: '', insumoId: '', consumo: '', unidade: 'g', dica: '', padrao: false }])}>
              <Plus size={13} /> Outro item
            </button>
            <span className="muted small">Os consumos são médias de bar: ajuste para a realidade da casa. Quando o preço no Estoque mudar, volte aqui e toque em "Atualizar".</span>
          </div>
        </div>
      )}
    </div>
  );
}
