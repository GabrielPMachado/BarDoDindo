import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, RotateCcw, Scale, TrendingUp } from 'lucide-react';
import { useCollection, type Row } from '../lib/data';
import { lastMonths, monthName } from '../lib/finance';
import { brl, num, pct } from '../lib/format';
import { calcularEmpresa, mediaDre, participacoes, preverInvestidores, PREMISSAS_PADRAO, REGIMES, type Premissas, type Regime } from '../lib/retorno';
import { useSession } from '../lib/session';
import { NumberInput } from './ui';

const CHAVE = 'bdd.previsaoRetorno';

function lerPremissas(): Premissas {
  try { return { ...PREMISSAS_PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) ?? '{}') }; } catch { return PREMISSAS_PADRAO; }
}

const anos = (v: number) => (v < 1 ? `${num(v * 12)} meses` : `${num(v, 1)} ${v < 2 ? 'ano' : 'anos'}`);
const pc2 = { decimals: 2, min: 0, max: 100 };

/** As regras das leis da biblioteca que entram na conta. */
const BASES = [
  ['Código Civil, arts. 1.007 e 1.008', 'o lucro é dividido na proporção das cotas de cada sócio, salvo outra regra no contrato social; nenhum sócio pode ser excluído dos lucros.'],
  ['Código Civil, arts. 1.009 e 1.059', 'só se distribui lucro real: com prejuízo, a previsão é zero, porque lucro fictício ou que reduz o capital tem de ser devolvido.'],
  ['Código Civil, arts. 1.065 e 1.078', 'a distribuição depende do balanço anual e da aprovação das contas pelos sócios.'],
  ['Constituição, arts. 145, 150 e 153, III; CTN, arts. 43 e 44', 'o IR incide sobre a renda, com base no lucro real, presumido ou arbitrado; por isso o regime tributário muda o resultado.'],
  ['Lei 15.270/2025 (IR sobre dividendos)', 'desde 2026, lucros pagos por uma empresa a uma pessoa física acima de R$ 50 mil no mês têm 10% de IR retido. O IR mínimo de altas rendas (acima de R$ 600 mil no ano) depende das outras rendas de cada um e não entra na conta.'],
  ['Lei 8.934/1994 (Registro de Empresas)', 'vale a participação do contrato social arquivado na Junta Comercial; mantenha a desta tela igual a ele.'],
  ['CLT', 'salários, encargos e o pró-labore do sócio administrador são despesas antes do lucro (pró-labore não é distribuição de lucros).'],
  ['CDC e CLT', 'riscos de indenização a clientes e de ações trabalhistas podem ser reservados no campo de contingências.'],
  ['Reserva de lucros', 'o Código Civil não obriga reserva legal na Ltda. (a Lei 6.404 exige 5% nas S.A.); use o percentual que o contrato social prevê.'],
] as const;

/** Previsão do retorno anual de cada sócio/investidor, com as premissas à vista e editáveis. */
export function PrevisaoRetorno({ rows }: { rows: Row[] }) {
  const { access } = useSession();
  const podeDre = access('receitas') !== 'none' && access('despesas') !== 'none';
  const meses = lastMonths(13).slice(0, 12); // os 12 meses fechados, sem o mês corrente
  const desde = `${meses[0]}-01`;
  const receitas = useCollection('receitas', podeDre, desde);
  const despesas = useCollection('despesas', podeDre, desde);
  const [p, setP] = useState<Premissas>(lerPremissas);
  const [aberta, setAberta] = useState(true);
  // no PC as regras ficam à vista ao lado do resultado; no celular começam recolhidas
  const [bases, setBases] = useState(() => typeof matchMedia === 'function' && matchMedia('(min-width: 961px)').matches);

  const mudar = (patch: Partial<Premissas>) => setP((atual) => {
    const nova = { ...atual, ...patch };
    try { localStorage.setItem(CHAVE, JSON.stringify(nova)); } catch { /* sem armazenamento: vale só nesta visita */ }
    return nova;
  });

  const dre = mediaDre(receitas.rows, despesas.rows.filter((r) => r.status !== 'Cancelado'), meses);
  const semDre = !podeDre || !!receitas.error || !!despesas.error || (!receitas.loading && !dre.meses.length);
  const manual = p.origem === 'manual' || semDre;
  const base = manual
    ? { receitaMensal: Number(p.receitaMensal) || 0, despesasMensal: Number(p.despesasMensal) || 0, impostosMensal: 0 }
    : { receitaMensal: dre.receita, despesasMensal: dre.despesas, impostosMensal: dre.impostos };
  const e = calcularEmpresa({ ...p, usarLancados: p.usarLancados && !manual }, base);
  const lista = preverInvestidores(rows, e.distribuivel, p);
  const soma = participacoes(rows).reduce((t, x) => t + (x.participacao ?? 0), 0);
  const semParticipacao = lista.filter((x) => x.participacao === null);
  const pelasCotas = participacoes(rows).some((x) => x.pelasCotas);
  const total = lista.reduce((t, x) => ({ bruto: t.bruto + x.bruto, ir: t.ir + x.ir, liquido: t.liquido + x.liquido, aporte: t.aporte + x.aporte }), { bruto: 0, ir: 0, liquido: 0, aporte: 0 });
  const regime = REGIMES.find((r) => r.valor === p.regime) ?? REGIMES[0];
  const periodo = dre.meses.length ? `média de ${dre.meses.length} ${dre.meses.length === 1 ? 'mês' : 'meses'} (${monthName(dre.meses[0])} a ${monthName(dre.meses[dre.meses.length - 1])})` : '';

  return (
    <section className="panel retorno">
      <button type="button" className="retorno__cab" onClick={() => setAberta((a) => !a)} aria-expanded={aberta}>
        <TrendingUp size={16} />
        <span><strong>Previsão de retorno</strong> <span className="muted small">· quanto cada sócio deve receber em 12 meses, pelas regras de distribuição de lucros e tributação</span></span>
        <span className="badge badge--warn">Estimativa</span>
        {aberta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {aberta && (
        <div className="retorno__corpo">
          <p className="retorno__aviso small">
            <AlertTriangle size={15} />
            <span>Esta é uma estimativa feita com as premissas abaixo, não aconselhamento jurídico, contábil ou de investimento. O valor real depende do balanço, da aprovação das contas e do contrato social. Confirme com o contador antes de decidir.</span>
          </p>

          <div className="retorno__grade">
            <div className="retorno__premissas">
              <h3>Premissas</h3>

              <label className="field-label" htmlFor="ret-origem">Resultado usado</label>
              <select id="ret-origem" className="input" value={manual ? 'manual' : 'dre'} disabled={semDre} onChange={(ev) => mudar({ origem: ev.target.value as Premissas['origem'] })}>
                <option value="dre">Média mensal do DRE</option>
                <option value="manual">Valores digitados</option>
              </select>
              {!manual && periodo && <span className="muted small">{periodo.charAt(0).toUpperCase() + periodo.slice(1)}, sem o mês corrente.</span>}
              {semDre && <span className="muted small">{!podeDre ? 'Sua função não vê receitas e despesas; digite os valores.' : receitas.error || despesas.error ? 'Não foi possível ler o DRE; digite os valores.' : 'Sem lançamentos nos últimos 12 meses; digite os valores.'}</span>}
              <div className="retorno__par">
                <div>
                  <label className="field-label">Receita por mês</label>
                  {manual ? <NumberInput ariaLabel="Receita por mês" prefix="R$" spec={{ decimals: 2, min: 0, max: 99_999_999.99, money: true }} value={p.receitaMensal} onChange={(v) => mudar({ receitaMensal: v })} />
                    : <strong className="retorno__valor">{brl(base.receitaMensal)}</strong>}
                </div>
                <div>
                  <label className="field-label">Despesas por mês</label>
                  {manual ? <NumberInput ariaLabel="Despesas por mês" prefix="R$" spec={{ decimals: 2, min: 0, max: 99_999_999.99, money: true }} value={p.despesasMensal} onChange={(v) => mudar({ despesasMensal: v })} />
                    : <strong className="retorno__valor">{brl(base.despesasMensal)}</strong>}
                </div>
              </div>
              {manual && <span className="muted small">Despesas sem os tributos sobre a receita e o lucro (eles são calculados abaixo).</span>}

              <label className="field-label" htmlFor="ret-regime">Regime tributário</label>
              <select id="ret-regime" className="input" value={p.regime} onChange={(ev) => mudar({ regime: ev.target.value as Regime, tributosReceita: null, tributosLucro: null })}>
                {REGIMES.map((r) => <option key={r.valor} value={r.valor}>{r.nome}</option>)}
              </select>
              <span className="muted small">{regime.explica}</span>

              {!manual && (
                <label className="retorno__check small">
                  <input type="checkbox" checked={p.usarLancados} onChange={(ev) => mudar({ usarLancados: ev.target.checked })} />
                  Usar os impostos já lançados nas despesas ({brl(dre.impostos)}/mês) em vez de estimar
                </label>
              )}
              {!(p.usarLancados && !manual) && (
                <div className="retorno__par">
                  <div>
                    <label className="field-label">Tributos sobre a receita {p.tributosReceita !== null && <button type="button" className="link-btn" title="Voltar à sugestão do regime" onClick={() => mudar({ tributosReceita: null })}><RotateCcw size={11} /></button>}</label>
                    <NumberInput ariaLabel="Tributos sobre a receita" suffix="%" spec={pc2} value={Math.round(e.tr * 100) / 100} onChange={(v) => mudar({ tributosReceita: v === '' ? null : v })} />
                  </div>
                  <div>
                    <label className="field-label">Tributos sobre o lucro {p.tributosLucro !== null && <button type="button" className="link-btn" title="Voltar à sugestão do regime" onClick={() => mudar({ tributosLucro: null })}><RotateCcw size={11} /></button>}</label>
                    <NumberInput ariaLabel="Tributos sobre o lucro" suffix="%" spec={pc2} value={e.tl} onChange={(v) => mudar({ tributosLucro: v === '' ? null : v })} />
                  </div>
                </div>
              )}

              <div className="retorno__par">
                <div>
                  <label className="field-label">Contingências (CLT/CDC)</label>
                  <NumberInput ariaLabel="Provisão para contingências" suffix="%" spec={pc2} value={p.contingencias} onChange={(v) => mudar({ contingencias: Number(v) || 0 })} />
                </div>
                <div>
                  <label className="field-label">Reserva de lucros</label>
                  <NumberInput ariaLabel="Reserva de lucros" suffix="%" spec={pc2} value={p.reserva} onChange={(v) => mudar({ reserva: Number(v) || 0 })} />
                </div>
                <div>
                  <label className="field-label">IR sobre dividendos</label>
                  <NumberInput ariaLabel="IR retido sobre dividendos" suffix="%" spec={pc2} value={p.irDividendos} onChange={(v) => mudar({ irDividendos: Number(v) || 0 })} />
                </div>
                <div>
                  <label className="field-label">Isento até, por mês</label>
                  <NumberInput ariaLabel="Limite mensal sem IR" prefix="R$" spec={{ decimals: 2, min: 0, max: 99_999_999.99, money: true }} value={p.limiteMensal} onChange={(v) => mudar({ limiteMensal: Number(v) || 0 })} />
                </div>
              </div>
              <button type="button" className="btn btn--ghost btn--sm retorno__reset" onClick={() => { setP(PREMISSAS_PADRAO); try { localStorage.removeItem(CHAVE); } catch { /* ignora */ } }}>
                <RotateCcw size={13} /> Restaurar premissas
              </button>
            </div>

            <div className="retorno__resultado">
              <table className="table dre retorno__dre">
                <tbody>
                  <tr className="dre__strong"><td>Receita em 12 meses</td><td className="num">{brl(e.receita)}</td></tr>
                  <tr><td className="dre__indent">(−) Despesas{e.tributosLancados && !p.usarLancados ? ' sem os impostos lançados' : ''}</td><td className="num">{brl(-e.despesas)}</td></tr>
                  {!(p.usarLancados && !manual) && <tr><td className="dre__indent">(−) Tributos estimados · {regime.nome}</td><td className="num">{brl(-e.tributos)}</td></tr>}
                  <tr className="dre__strong"><td>Lucro líquido</td><td className={`num ${e.lucroLiquido < 0 ? 'text-bad' : ''}`}>{brl(e.lucroLiquido)}</td></tr>
                  <tr><td className="dre__indent">(−) Contingências ({num(p.contingencias, 2)}%)</td><td className="num">{brl(-e.contingencias)}</td></tr>
                  <tr><td className="dre__indent">(−) Reserva de lucros ({num(p.reserva, 2)}%)</td><td className="num">{brl(-e.reserva)}</td></tr>
                  <tr className="dre__strong dre__total"><td>Lucro a distribuir</td><td className="num text-good">{brl(e.distribuivel)}</td></tr>
                </tbody>
              </table>

              {p.regime === 'simples' && e.receita > 4_800_000 && <p className="retorno__alerta small"><AlertTriangle size={14} /> A receita de 12 meses passa de R$ 4,8 milhões, o teto do Simples Nacional (LC 123/2006). Escolha outro regime.</p>}
              {e.lucroLiquido <= 0 && <p className="retorno__alerta small"><AlertTriangle size={14} /> Sem lucro no período, não há o que distribuir (Código Civil, arts. 1.009 e 1.059).</p>}
              {lista.length > 0 && Math.abs(soma - 100) >= 0.01 && <p className="retorno__alerta small"><AlertTriangle size={14} /> As participações somam {num(soma, 2)}%; {soma < 100 ? 'a parte que falta não é distribuída a ninguém' : 'a soma passa de 100% e a previsão fica inflada'}. Confira com o contrato social.</p>}
              {semParticipacao.length > 0 && <p className="retorno__alerta small"><AlertTriangle size={14} /> Sem participação nem cotas: {semParticipacao.map((x) => x.nome).join(', ')}. Edite o cadastro para entrar na previsão.</p>}
              {pelasCotas && <p className="muted small">Quem não tem participação cadastrada foi calculado pela proporção das ações/cotas.</p>}
              <div className="retorno__bases">
                <button type="button" className="link-btn small" onClick={() => setBases((b) => !b)} aria-expanded={bases}>
                  <Scale size={13} /> {bases ? 'Esconder' : 'Ver'} as regras usadas na conta
                </button>
                {bases && (
                  <ul>
                    {BASES.map(([lei, regra]) => <li key={lei}><strong>{lei}:</strong> {regra}</li>)}
                    <li><strong>Premissas:</strong> o lucro é o dos próximos 12 meses igual à média usada acima, distribuído em parcelas mensais iguais; o retorno é o líquido do ano dividido pelo valor aportado.</li>
                  </ul>
                )}
              </div>
            </div>
          </div>

          {lista.length ? (
            <div className="table-wrap">
              <table className="table retorno__tabela">
                <thead>
                  <tr><th>Sócio / investidor</th><th className="num">Participação</th><th className="num">Lucro no ano</th><th className="num">IR retido</th><th className="num">Líquido no ano</th><th className="num" title="Líquido do ano dividido pelo valor aportado">Retorno ao ano</th><th className="num" title="Tempo para o líquido recebido igualar o valor aportado">Recupera o aporte</th></tr>
                </thead>
                <tbody>
                  {lista.map((x) => (
                    <tr key={x.id}>
                      <td><strong>{x.nome}</strong><span className="muted small retorno__tipo">{x.tipo}</span></td>
                      <td className="num">{x.participacao === null ? '—' : `${num(x.participacao, 2)}%`}</td>
                      <td className="num">{brl(x.bruto)}</td>
                      <td className="num">{x.ir ? brl(-x.ir) : '—'}</td>
                      <td className="num"><strong>{brl(x.liquido)}</strong><span className="muted small retorno__tipo">{brl(x.mensal)} por mês</span></td>
                      <td className="num">{x.retorno === null ? <span className="muted">sem aporte</span> : pct(x.retorno)}</td>
                      <td className="num">{x.payback === null ? '—' : anos(x.payback)}</td>
                    </tr>
                  ))}
                </tbody>
                {lista.length > 1 && (
                  <tfoot>
                    <tr><td><strong>Total</strong></td><td className="num">{num(soma, 2)}%</td><td className="num">{brl(total.bruto)}</td><td className="num">{total.ir ? brl(-total.ir) : '—'}</td><td className="num"><strong>{brl(total.liquido)}</strong><span className="muted small retorno__tipo">{brl(total.liquido / 12)} por mês</span></td><td className="num">{total.aporte ? pct(total.liquido / total.aporte) : '—'}</td><td /></tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : <p className="muted">Cadastre os sócios e investidores abaixo para ver a previsão de cada um.</p>}

        </div>
      )}
    </section>
  );
}
