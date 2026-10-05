import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Send, Users } from 'lucide-react';
import { COLLECTIONS } from '../collections';
import { CollectionPage } from '../components/CollectionPage';
import { BarChart, HBarList } from '../components/Charts';
import { AsyncButton, EmptyState, ErrorBox, KpiRow, Loading, PageHead, notify } from '../components/ui';
import { api } from '../lib/api';
import { reload, useCollection, useResource } from '../lib/data';
import { brl, monthLabel, num, pct } from '../lib/format';
import { currentMonth, despesaValida, lastMonths, monthName, monthOf, sumBy } from '../lib/finance';
import { useSession } from '../lib/session';

function MonthPicker({ value, onChange, months = 12 }: { value: string; onChange: (v: string) => void; months?: number }) {
  return (
    <select className="input input--sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Competência">
      {lastMonths(months).reverse().map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
    </select>
  );
}

interface Folha {
  mes: string;
  aliquotaFgts: number;
  colaboradores: number;
  totais: { salario: number; inss: number; liquido: number; fgts: number; provisoes: number; custo: number };
  linhas: { id: string; nome: string; cargo: string; contrato: string; salario: number; inss: number; liquido: number; fgts: number; provisoes: number; custo: number; comEncargos: boolean }[];
  lancada: boolean;
  lancamentos: { id: string; descricao: string; valor: number; status: string }[];
}

/* ---------------- Folha de pagamento (Pessoal · RH/DP) ---------------- */
export function Folha() {
  const { access } = useSession();
  const [mes, setMes] = useState(currentMonth());
  const { data: folha, loading, error } = useResource<Folha>(`/crm/folha?mes=${mes}`);
  const podeLancar = access('fin') === 'edit';

  return (
    <div className="page">
      <PageHead
        title="Folha de pagamento"
        description="Calculada a partir dos salários cadastrados em Colaboradores. Valores estimados; confirme com a contabilidade antes do pagamento."
        actions={<MonthPicker value={mes} onChange={setMes} />}
      />
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading || !folha ? <Loading /> : !folha.colaboradores ? (
        <div className="panel">
          <EmptyState title="Nenhum colaborador com salário cadastrado">
            Cadastre a equipe e os salários em <Link className="link" to="/rh/colaboradores">Colaboradores</Link>.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className={`notice ${folha.lancada ? 'notice--ok' : ''}`}>
            {folha.lancada ? <CheckCircle2 size={18} /> : <Send size={18} />}
            <span>
              {folha.lancada
                ? `A folha de ${monthName(mes)} já foi lançada pelo Financeiro como contas a pagar.`
                : `O lançamento da folha como despesa é feito pelo Financeiro, em Financeiro → Despesas.`}
            </span>
            {!folha.lancada && podeLancar && <Link className="link" to="/financeiro/despesas">Ir para Despesas</Link>}
          </div>
          <KpiRow items={[
            { label: 'Salários brutos', value: brl(folha.totais.salario) },
            { label: 'Líquido a pagar', value: brl(folha.totais.liquido) },
            { label: `FGTS (${num(folha.aliquotaFgts)}%)`, value: brl(folha.totais.fgts) },
            { label: 'Custo total estimado', value: brl(folha.totais.custo), hint: 'inclui provisões de 13º e férias' },
          ]} />
          <div className="panel">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Colaborador</th><th>Cargo</th><th>Vínculo</th>
                    <th className="num">Salário base</th><th className="num">INSS</th><th className="num">Líquido</th>
                    <th className="num">FGTS</th><th className="num">Provisões</th><th className="num">Custo empresa</th>
                  </tr>
                </thead>
                <tbody>
                  {folha.linhas.map((l) => (
                    <tr key={l.id}>
                      <td className="text">{l.nome}</td>
                      <td className="text">{l.cargo}</td>
                      <td className="nowrap">{l.contrato}</td>
                      <td className="num">{brl(l.salario)}</td>
                      <td className="num">{l.comEncargos ? brl(l.inss) : '—'}</td>
                      <td className="num">{brl(l.liquido)}</td>
                      <td className="num">{l.comEncargos ? brl(l.fgts) : '—'}</td>
                      <td className="num">{l.comEncargos ? brl(l.provisoes) : '—'}</td>
                      <td className="num"><strong>{brl(l.custo)}</strong></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total ({folha.colaboradores})</td>
                    <td className="num">{brl(folha.totais.salario)}</td>
                    <td className="num">{brl(folha.totais.inss)}</td>
                    <td className="num">{brl(folha.totais.liquido)}</td>
                    <td className="num">{brl(folha.totais.fgts)}</td>
                    <td className="num">{brl(folha.totais.provisoes)}</td>
                    <td className="num">{brl(folha.totais.custo)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="muted small pad">
              INSS calculado pela tabela progressiva definida em Configurações · Parâmetros. IRRF, adicionais, horas extras, vale-transporte e
              demais descontos não estão incluídos. Vínculos PJ e freelancer aparecem apenas pelo valor bruto.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Painel do Financeiro para lançar a folha calculada pelo RH como contas a pagar. */
function LancarFolha() {
  const { access } = useSession();
  const [mes, setMes] = useState(currentMonth());
  const path = `/crm/folha?mes=${mes}`;
  const { data: folha, loading, error } = useResource<Folha>(path);
  const podeLancar = access('fin') === 'edit';

  return (
    <section className="panel pad-lg folha-box">
      <div className="folha-box__head">
        <h2 className="panel-title"><Users size={18} /> Folha de pagamento</h2>
        <MonthPicker value={mes} onChange={setMes} />
      </div>
      {error ? <ErrorBox>{error}</ErrorBox> : loading || !folha ? <Loading /> : !folha.colaboradores ? (
        <p className="muted">O RH ainda não cadastrou colaboradores com salário. A folha aparece aqui quando estiver pronta.</p>
      ) : (
        <div className="folha-box__body">
          <div className="mini-stats mini-stats--4">
            <div><span className="muted small">Colaboradores</span><strong>{folha.colaboradores}</strong></div>
            <div><span className="muted small">Líquido a pagar</span><strong>{brl(folha.totais.liquido)}</strong></div>
            <div><span className="muted small">FGTS</span><strong>{brl(folha.totais.fgts)}</strong></div>
            <div><span className="muted small">INSS retido</span><strong>{brl(folha.totais.inss)}</strong></div>
          </div>
          {folha.lancada ? (
            <p className="text-good small"><CheckCircle2 size={14} className="inline-icon" /> Folha de {monthName(mes)} já lançada como contas a pagar.</p>
          ) : podeLancar ? (
            <AsyncButton
              className="btn btn--primary"
              confirm={{ title: `Lançar a folha de ${monthName(mes)}?`, message: 'Serão criadas contas a pagar para os salários líquidos, o FGTS e o INSS retido.', confirmLabel: 'Lançar folha', danger: false }}
              onClick={async () => {
                const r = await api<{ despesas: number }>('/crm/folha/lancar', { method: 'POST', body: { mes } });
                await Promise.all([reload(path), reload('/crm/c/despesas')]);
                notify(`Folha lançada: ${r.despesas} contas a pagar criadas`);
              }}
            >
              <Send size={16} /> Lançar folha de {monthName(mes)}
            </AsyncButton>
          ) : (
            <p className="muted small">Somente usuários com permissão de edição no Financeiro podem lançar a folha.</p>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------- Receitas ---------------- */
export function Receitas() {
  return (
    <CollectionPage
      def={COLLECTIONS.receitas}
      before={(rows) => {
        if (!rows.length) return null;
        const mes = currentMonth();
        const doMes = rows.filter((r) => monthOf(r.data) === mes);
        const ant = sumBy(rows.filter((r) => monthOf(r.data) === currentMonth(-1)));
        const atual = sumBy(doMes);
        const porCat = Object.entries(doMes.reduce<Record<string, number>>((a, r) => {
          a[String(r.categoria)] = (a[String(r.categoria)] ?? 0) + (Number(r.valor) || 0);
          return a;
        }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
        return (
          <>
            <KpiRow items={[
              { label: `Receita · ${monthName(mes)}`, value: brl(atual) },
              { label: 'Mês anterior', value: brl(ant) },
              { label: 'Variação', value: ant ? `${atual >= ant ? '+' : ''}${pct((atual - ant) / ant)}` : '—', tone: ant && atual < ant ? 'warn' : undefined },
              { label: 'Lançamentos no mês', value: num(doMes.length) },
            ]} />
            <div className="grid-2">
              <section className="panel">
                <div className="panel__head"><h2>Receita mensal</h2><span className="muted small">Últimos 12 meses</span></div>
                <BarChart
                  data={lastMonths(12).map((m) => ({ label: monthLabel(m), value: sumBy(rows.filter((r) => monthOf(r.data) === m)) }))}
                  format={(v) => brl(v).replace(',00', '')}
                  ariaLabel="Receita mensal dos últimos doze meses"
                />
              </section>
              <section className="panel">
                <div className="panel__head"><h2>Receita por categoria</h2><span className="muted small">{monthName(mes)}</span></div>
                {porCat.length ? <HBarList data={porCat} format={brl} /> : <p className="muted pad">Sem receitas neste mês.</p>}
              </section>
            </div>
          </>
        );
      }}
    />
  );
}

/* ---------------- Despesas ---------------- */
export function Despesas() {
  return (
    <CollectionPage
      def={COLLECTIONS.despesas}
      before={(rows) => {
        const validas = rows.filter(despesaValida);
        const aPagar = validas.filter((r) => r.status === 'A pagar');
        const mes = currentMonth();
        return (
          <>
            {rows.length > 0 && (
              <KpiRow items={[
                { label: `Despesas · ${monthName(mes)}`, value: brl(sumBy(validas.filter((r) => monthOf(r.data) === mes))) },
                { label: 'Contas a pagar', value: brl(sumBy(aPagar)), hint: `${aPagar.length} em aberto` },
                {
                  label: 'Vencidas',
                  value: brl(sumBy(aPagar.filter((r) => String(r.vencimento ?? '') < new Date().toISOString().slice(0, 10)))),
                  tone: aPagar.some((r) => String(r.vencimento ?? '') < new Date().toISOString().slice(0, 10)) ? 'bad' : 'good',
                },
              ]} />
            )}
            <LancarFolha />
          </>
        );
      }}
    />
  );
}

/* ---------------- Resultado (DRE) ---------------- */
export function Resultado() {
  const receitas = useCollection('receitas').rows;
  const despesas = useCollection('despesas').rows.filter(despesaValida);
  const [mes, setMes] = useState(currentMonth());

  const rec = receitas.filter((r) => monthOf(r.data) === mes);
  const des = despesas.filter((r) => monthOf(r.data) === mes);
  const receitaBruta = sumBy(rec);
  const grupos = Object.entries(des.reduce<Record<string, number>>((a, r) => {
    a[String(r.categoria)] = (a[String(r.categoria)] ?? 0) + (Number(r.valor) || 0);
    return a;
  }, {})).sort((a, b) => b[1] - a[1]);
  const totalDespesas = sumBy(des);
  const resultado = receitaBruta - totalDespesas;
  const serie = lastMonths(12).map((m) => ({
    label: monthLabel(m),
    value: sumBy(receitas.filter((r) => monthOf(r.data) === m)) - sumBy(despesas.filter((r) => monthOf(r.data) === m)),
  }));

  return (
    <div className="page">
      <PageHead
        title="Resultado (DRE)"
        description="Demonstrativo de resultado por competência: receitas menos despesas."
        actions={<MonthPicker value={mes} onChange={setMes} />}
      />
      <KpiRow items={[
        { label: 'Receita bruta', value: brl(receitaBruta) },
        { label: 'Despesas', value: brl(totalDespesas) },
        { label: 'Resultado', value: brl(resultado), tone: resultado < 0 ? 'bad' : resultado > 0 ? 'good' : undefined, hint: receitaBruta ? `margem ${pct(resultado / receitaBruta)}` : undefined },
      ]} />
      <div className="grid-2">
        <section className="panel">
          <div className="panel__head"><h2>Demonstrativo · {monthName(mes)}</h2></div>
          <table className="table dre">
            <tbody>
              <tr className="dre__strong"><td>Receita bruta</td><td className="num">{brl(receitaBruta)}</td><td className="num muted">100%</td></tr>
              {grupos.map(([cat, v]) => (
                <tr key={cat}>
                  <td className="dre__indent">(−) {cat}</td>
                  <td className="num">{brl(-v)}</td>
                  <td className="num muted">{receitaBruta ? pct(v / receitaBruta) : '—'}</td>
                </tr>
              ))}
              {!grupos.length && <tr><td className="dre__indent muted" colSpan={3}>Nenhuma despesa nesta competência.</td></tr>}
              <tr className="dre__strong dre__total">
                <td>Resultado do período</td>
                <td className={`num ${resultado < 0 ? 'text-bad' : 'text-good'}`}>{brl(resultado)}</td>
                <td className="num muted">{receitaBruta ? pct(resultado / receitaBruta) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="panel">
          <div className="panel__head"><h2>Resultado mensal</h2><span className="muted small">Últimos 12 meses</span></div>
          {receitas.length || despesas.length ? (
            <BarChart data={serie} format={(v) => brl(v).replace(',00', '')} ariaLabel="Resultado mensal dos últimos doze meses" />
          ) : (
            <p className="muted pad">Sem lançamentos financeiros.</p>
          )}
        </section>
      </div>
    </div>
  );
}
