import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { BarChart, HBarList } from '../components/Charts';
import { KpiRow, PageHead } from '../components/ui';
import { useCollection, useResource, type Row } from '../lib/data';
import { brl, daysUntil, isoToday, monthLabel, num, pct } from '../lib/format';
import { currentMonth, despesaValida, lastMonths, monthName, monthOf, sumBy } from '../lib/finance';
import { useSession } from '../lib/session';
import type { Kpi } from '../collections';

interface ClienteResumo { id: number; nome: string; totalGasto: number; visitas: number; criadoEm?: string; desde: string }

export default function Diretoria() {
  const { access } = useSession();
  const can = (a: Parameters<typeof access>[0]) => access(a) !== 'none';

  const receitas = useCollection('receitas', can('fin')).rows;
  const despesas = useCollection('despesas', can('fin')).rows.filter(despesaValida);
  const colaboradores = useCollection('colaboradores', can('rh')).rows;
  const estoque = useCollection('estoque', can('dp')).rows;
  const contratos = useCollection('contratos', can('adm')).rows;
  const ncs = useCollection('naoconformidades', can('fis')).rows;
  const qualidade = useCollection('qualidade', can('fis')).rows;
  const processos = useCollection('trabalhista', can('jur')).rows;
  const reservas = useCollection('reservas', can('atd')).rows;
  const metas = useCollection('metas', can('dir')).rows;
  const clientes = useResource<ClienteResumo[]>(can('mkt') || can('atd') ? '/crm/clientes' : null).data ?? [];

  const mes = currentMonth();
  const recMes = sumBy(receitas.filter((r) => monthOf(r.data) === mes));
  const recAnt = sumBy(receitas.filter((r) => monthOf(r.data) === currentMonth(-1)));
  const despMes = sumBy(despesas.filter((r) => monthOf(r.data) === mes));
  const variacao = recAnt ? (recMes - recAnt) / recAnt : null;

  const kpis: Kpi[] = [];
  if (can('fin')) {
    kpis.push(
      { label: `Receita · ${monthName(mes)}`, value: brl(recMes), hint: variacao === null ? 'sem mês anterior para comparar' : `${variacao >= 0 ? '+' : ''}${pct(variacao)} vs. mês anterior`, tone: variacao !== null && variacao < 0 ? 'warn' : undefined },
      { label: 'Despesas do mês', value: brl(despMes) },
      { label: 'Resultado do mês', value: brl(recMes - despMes), tone: recMes - despMes < 0 ? 'bad' : 'good' },
    );
  }
  if (can('mkt')) {
    const novos = clientes.filter((c) => monthOf(c.desde) === mes).length;
    kpis.push(
      { label: 'Afilhados cadastrados', value: num(clientes.length), hint: `${num(novos)} novos este mês` },
      { label: 'Reservas pendentes', value: num(reservas.filter((r) => r.status === 'Pendente').length), tone: reservas.some((r) => r.status === 'Pendente') ? 'warn' : undefined },
    );
  }
  if (can('rh')) kpis.push({ label: 'Equipe ativa', value: num(colaboradores.filter((c) => c.status !== 'Desligado').length) });

  /* alertas operacionais */
  const alerts: { text: string; to: string; tone: 'warn' | 'bad' }[] = [];
  const repor = estoque.filter((r) => Number(r.minimo) && Number(r.quantidade) <= Number(r.minimo));
  if (repor.length) alerts.push({ text: `${repor.length} ${repor.length === 1 ? 'item' : 'itens'} de estoque abaixo do mínimo`, to: '/estrutura/estoque', tone: 'bad' });
  const vencidosEstoque = estoque.filter((r) => daysUntil(r.validade) <= 7);
  if (vencidosEstoque.length) alerts.push({ text: `${vencidosEstoque.length} ${vencidosEstoque.length === 1 ? 'item vencido ou vencendo' : 'itens vencidos ou vencendo'} em 7 dias`, to: '/estrutura/estoque', tone: 'warn' });
  const contratosVenc = contratos.filter((r) => r.status !== 'Encerrado' && daysUntil(r.vencimento) <= 30);
  if (contratosVenc.length) alerts.push({ text: `${contratosVenc.length} ${contratosVenc.length === 1 ? 'contrato vence' : 'contratos vencem'} em até 30 dias`, to: '/adm/contratos', tone: 'warn' });
  const contasVencidas = despesas.filter((r) => r.status === 'A pagar' && daysUntil(r.vencimento) < 0);
  if (contasVencidas.length) alerts.push({ text: `${contasVencidas.length} ${contasVencidas.length === 1 ? 'conta vencida' : 'contas vencidas'} (${brl(sumBy(contasVencidas))})`, to: '/financeiro/despesas', tone: 'bad' });
  const ncAbertas = ncs.filter((r) => r.status !== 'Resolvida' && ['Alta', 'Crítica'].includes(String(r.gravidade)));
  if (ncAbertas.length) alerts.push({ text: `${ncAbertas.length} ${ncAbertas.length === 1 ? 'não conformidade grave' : 'não conformidades graves'} em aberto`, to: '/fiscalizacao/nao-conformidades', tone: 'bad' });
  const audiencias = processos.filter((r) => ['Em andamento', 'Acordo'].includes(String(r.status)) && daysUntil(r.audiencia) >= 0 && daysUntil(r.audiencia) <= 15);
  if (audiencias.length) alerts.push({ text: `${audiencias.length} ${audiencias.length === 1 ? 'audiência' : 'audiências'} nos próximos 15 dias`, to: '/juridico/trabalhista', tone: 'warn' });
  const hoje = isoToday();
  const pendHoje = reservas.filter((r) => r.status === 'Pendente' && String(r.data) >= hoje);
  if (pendHoje.length) alerts.push({ text: `${pendHoje.length} ${pendHoje.length === 1 ? 'reserva aguardando' : 'reservas aguardando'} confirmação`, to: '/atendimento/reservas', tone: 'warn' });

  const meses = lastMonths(6);
  const serie = meses.map((m) => ({ label: monthLabel(m), value: sumBy(receitas.filter((r) => monthOf(r.data) === m)) }));
  const resultado = meses.map((m) => ({
    label: monthLabel(m),
    value: sumBy(receitas.filter((r) => monthOf(r.data) === m)) - sumBy(despesas.filter((r) => monthOf(r.data) === m)),
  }));
  const porCategoria = Object.entries(
    despesas.filter((r) => monthOf(r.data) === mes).reduce<Record<string, number>>((acc, r) => {
      acc[String(r.categoria)] = (acc[String(r.categoria)] ?? 0) + (Number(r.valor) || 0);
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  const ult30 = qualidade.filter((r) => daysUntil(r.data) >= -30);
  const notaMedia = ult30.length ? sumBy(ult30, 'nota') / ult30.length : null;
  const metasAtivas = metas.filter((m) => !['Concluída', 'Cancelada'].includes(String(m.status))).slice(0, 6);
  const topClientes = [...clientes].sort((a, b) => b.totalGasto - a.totalGasto).slice(0, 5).filter((c) => c.totalGasto > 0);

  return (
    <div className="page">
      <PageHead title="Painel executivo" description="Visão consolidada de todas as áreas, atualizada com os dados lançados no sistema e no aplicativo." />

      <KpiRow items={kpis} />

      <div className="grid-2">
        {can('fin') && (
          <section className="panel">
            <div className="panel__head"><h2>Receita mensal</h2><span className="muted small">Últimos 6 meses</span></div>
            {receitas.length ? (
              <BarChart data={serie} format={(v) => brl(v).replace(',00', '')} ariaLabel="Receita mensal dos últimos seis meses" />
            ) : (
              <p className="muted pad">Nenhuma receita lançada ainda.</p>
            )}
          </section>
        )}

        <section className="panel">
          <div className="panel__head"><h2>Alertas</h2><span className="muted small">{alerts.length ? `${alerts.length} ${alerts.length === 1 ? 'ponto' : 'pontos'} de atenção` : 'Tudo em dia'}</span></div>
          {alerts.length ? (
            <ul className="alerts">
              {alerts.map((a) => (
                <li key={a.text} className={`alert alert--${a.tone}`}>
                  <AlertTriangle size={16} />
                  <span>{a.text}</span>
                  <Link to={a.to} aria-label="Abrir módulo"><ArrowRight size={16} /></Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted pad">Nenhum alerta no momento.</p>
          )}
        </section>

        {can('fin') && (
          <section className="panel">
            <div className="panel__head"><h2>Resultado mensal</h2><span className="muted small">Receitas menos despesas</span></div>
            {receitas.length || despesas.length ? (
              <BarChart data={resultado} format={(v) => brl(v).replace(',00', '')} ariaLabel="Resultado mensal dos últimos seis meses" />
            ) : (
              <p className="muted pad">Sem lançamentos financeiros.</p>
            )}
          </section>
        )}

        {can('fin') && (
          <section className="panel">
            <div className="panel__head"><h2>Despesas por categoria</h2><span className="muted small">{monthName(mes)}</span></div>
            {porCategoria.length ? <HBarList data={porCategoria} format={brl} /> : <p className="muted pad">Nenhuma despesa neste mês.</p>}
          </section>
        )}

        {can('dir') && (
          <section className="panel">
            <div className="panel__head"><h2>Metas em andamento</h2><Link to="/diretoria/metas" className="link">Ver todas</Link></div>
            {metasAtivas.length ? (
              <ul className="progress-list">
                {metasAtivas.map((m: Row) => (
                  <li key={m.id}>
                    <div><strong>{String(m.titulo)}</strong><span className="muted small">{String(m.area ?? '')}</span></div>
                    <div className="progress"><div style={{ width: `${Math.min(100, Number(m.progresso) || 0)}%` }} /></div>
                    <span className="small">{num(Number(m.progresso) || 0)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted pad">Nenhuma meta cadastrada.</p>
            )}
          </section>
        )}

        {(can('mkt') || can('fis')) && (
          <section className="panel">
            <div className="panel__head"><h2>Clientes e qualidade</h2></div>
            <div className="mini-stats">
              {can('fis') && (
                <div><span className="muted small">Nota média de qualidade (30 dias)</span><strong>{notaMedia === null ? '—' : num(notaMedia, 1)}</strong></div>
              )}
              {can('mkt') && (
                <div><span className="muted small">Ticket médio por visita</span><strong>{(() => {
                  const visitas = clientes.reduce((t, c) => t + c.visitas, 0);
                  return visitas ? brl(clientes.reduce((t, c) => t + c.totalGasto, 0) / visitas) : '—';
                })()}</strong></div>
              )}
            </div>
            {can('mkt') && topClientes.length > 0 && (
              <>
                <h3 className="subhead">Afilhados que mais consomem</h3>
                <HBarList data={topClientes.map((c) => ({ label: c.nome, value: c.totalGasto }))} format={brl} />
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
