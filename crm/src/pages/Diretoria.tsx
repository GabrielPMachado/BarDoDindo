import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Check, ChevronsDown, ChevronsUp, Eye, EyeOff, GripVertical, LayoutDashboard, Pin, PinOff, Plus, RotateCcw, Scaling, SlidersHorizontal, X } from 'lucide-react';
import { BarChart, HBarList } from '../components/Charts';
import { ContextMenu, type MenuPos } from '../components/ContextMenu';
import { Modal, notify, PageHead } from '../components/ui';
import { useAtividades } from '../components/Atividades';
import { useCollection, useResource, type Row } from '../lib/data';
import { brl, dateBR, daysUntil, isoToday, monthLabel, num, pct } from '../lib/format';
import { currentMonth, despesaValida, lastMonths, monthName, monthOf, sumBy } from '../lib/finance';
import { alternarAtalho, atalhoId, TAMANHOS, usePainelPrefs, type PainelChave, type PainelPrefs, type Posicao, type Tamanho } from '../lib/preferencias';
import { AREAS, findModule } from '../modules';
import { useSession } from '../lib/session';
import { useToqueLongo } from '../lib/toque';
import type { Kpi } from '../collections';
import RGL, { type Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

/** Grade livre do painel: mede a largura disponível sozinha. */
const Grade = RGL.WidthProvider(RGL);

interface ClienteResumo { id: number; nome: string; totalGasto: number; visitas: number; criadoEm?: string; desde: string }

/** Um bloco do painel: um indicador (cartão pequeno) ou um painel (gráfico, lista). */
interface Bloco {
  id: string;
  titulo: string;
  tipo: 'kpi' | 'painel';
  render: () => ReactNode;
  /** Página do CRM adicionada ao painel pelo menu (botão direito → Adicionar ao painel). */
  atalho?: string;
  /** Bloco do catálogo: só aparece depois que o usuário o adiciona ("Adicionar bloco"). */
  extra?: { area: string; descricao: string };
}

/** Linha de uma lista curta dentro de um bloco (reservas de hoje, contas a pagar…). */
interface ItemLista { key: string; principal: ReactNode; detalhe?: ReactNode; valor?: ReactNode; tom?: 'bad' | 'warn' }

function MiniLista({ itens, vazio }: { itens: ItemLista[]; vazio: string }) {
  if (!itens.length) return <p className="muted pad">{vazio}</p>;
  return (
    <ul className="mini-list">
      {itens.map((i) => (
        <li key={i.key} className={i.tom ? `is-${i.tom}` : ''}>
          <div><strong>{i.principal}</strong>{i.detalhe && <span className="muted small">{i.detalhe}</span>}</div>
          {i.valor !== undefined && <span className="mini-list__value">{i.valor}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Data local (AAAA-MM-DD) de um registro gravado com data e hora. */
function diaDe(v: unknown) {
  const d = new Date(String(v ?? ''));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Diretoria() {
  return (
    <PainelDeBlocos
      chave="painel" titulo="Painel executivo"
      descricao="Visão consolidada de todas as áreas, atualizada com os dados lançados no sistema e no aplicativo."
    />
  );
}

/** Meu perfil → Meu painel: o painel próprio de cada usuário, com os blocos das áreas que ele acessa. */
export function MeuPainel() {
  return (
    <PainelDeBlocos
      chave="meuPainel" titulo="Meu painel"
      descricao="O seu painel: monte com os blocos e atalhos que você mais usa. Só você vê esta arrumação."
    />
  );
}

interface PainelInfo { chave: PainelChave; titulo: string; descricao: string }

/** Monta os blocos (indicadores, gráficos, listas) com os dados das áreas que o usuário acessa. */
function PainelDeBlocos(info: PainelInfo) {
  const { access } = useSession();
  const can = (a: Parameters<typeof access>[0]) => access(a) !== 'none';

  // só os meses que os gráficos mostram (os 6 últimos); contas em aberto vêm sempre
  const inicioSerie = `${lastMonths(6)[0]}-01`;
  const receitas = useCollection('receitas', can('fin'), inicioSerie).rows;
  const despesas = useCollection('despesas', can('fin'), inicioSerie).rows.filter(despesaValida);
  const colaboradores = useCollection('colaboradores', can('rh')).rows;
  const estoque = useCollection('estoque', can('dp')).rows;
  const contratos = useCollection('contratos', can('adm')).rows;
  const ncs = useCollection('naoconformidades', can('fis')).rows;
  const qualidade = useCollection('qualidade', can('fis')).rows;
  const processos = useCollection('trabalhista', can('jur')).rows;
  // reservas de hoje em diante (pendentes, de hoje e próximas)
  const reservas = useCollection('reservas', can('atd'), isoToday()).rows;
  const metas = useCollection('metas', can('dir')).rows;
  const clientes = useResource<ClienteResumo[]>(can('vnd') || can('mkt') || can('atd') ? '/crm/clientes' : null).data ?? [];

  const mes = currentMonth();
  const recMes = sumBy(receitas.filter((r) => monthOf(r.data) === mes));
  const recAnt = sumBy(receitas.filter((r) => monthOf(r.data) === currentMonth(-1)));
  const despMes = sumBy(despesas.filter((r) => monthOf(r.data) === mes));
  const variacao = recAnt ? (recMes - recAnt) / recAnt : null;

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
  const novosClientes = clientes.filter((c) => monthOf(c.desde) === mes).length;
  const pendentes = reservas.filter((r) => r.status === 'Pendente').length;

  const kpi = (k: Kpi) => () => (
    <div className={`kpi ${k.tone ? `kpi--${k.tone}` : ''}`}>
      <span className="kpi__label">{k.label}</span>
      <strong className="kpi__value">{k.value}</strong>
      {k.hint && <span className="kpi__hint">{k.hint}</span>}
    </div>
  );

  /* todos os blocos, na ordem padrão; cada um só aparece para quem tem acesso à área dele */
  const blocos: Bloco[] = [];
  const add = (cond: boolean, b: Bloco) => cond && blocos.push(b);
  add(can('fin'), {
    id: 'k-receita', titulo: 'Receita do mês', tipo: 'kpi',
    render: kpi({ label: `Receita · ${monthName(mes)}`, value: brl(recMes), hint: variacao === null ? 'sem mês anterior para comparar' : `${variacao >= 0 ? '+' : ''}${pct(variacao)} vs. mês anterior`, tone: variacao !== null && variacao < 0 ? 'warn' : undefined }),
  });
  add(can('fin'), { id: 'k-despesas', titulo: 'Despesas do mês', tipo: 'kpi', render: kpi({ label: 'Despesas do mês', value: brl(despMes) }) });
  add(can('fin'), { id: 'k-resultado', titulo: 'Resultado do mês', tipo: 'kpi', render: kpi({ label: 'Resultado do mês', value: brl(recMes - despMes), tone: recMes - despMes < 0 ? 'bad' : 'good' }) });
  add(can('vnd'), { id: 'k-afilhados', titulo: 'Afilhados cadastrados', tipo: 'kpi', render: kpi({ label: 'Afilhados cadastrados', value: num(clientes.length), hint: `${num(novosClientes)} novos este mês` }) });
  add(can('atd'), { id: 'k-reservas', titulo: 'Reservas pendentes', tipo: 'kpi', render: kpi({ label: 'Reservas pendentes', value: num(pendentes), tone: pendentes ? 'warn' : undefined }) });
  add(can('rh'), { id: 'k-equipe', titulo: 'Equipe ativa', tipo: 'kpi', render: kpi({ label: 'Equipe ativa', value: num(colaboradores.filter((c) => c.status !== 'Desligado').length) }) });

  add(can('fin'), {
    id: 'p-receita', titulo: 'Receita mensal', tipo: 'painel',
    render: () => (
      <section className="panel">
        <div className="panel__head"><h2>Receita mensal</h2><span className="muted small">Últimos 6 meses</span></div>
        {receitas.length ? (
          <BarChart data={serie} format={(v) => brl(v).replace(',00', '')} ariaLabel="Receita mensal dos últimos seis meses" />
        ) : (
          <p className="muted pad">Nenhuma receita lançada ainda.</p>
        )}
      </section>
    ),
  });
  add(true, {
    id: 'p-alertas', titulo: 'Alertas', tipo: 'painel',
    render: () => (
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
    ),
  });
  add(can('fin'), {
    id: 'p-resultado', titulo: 'Resultado mensal', tipo: 'painel',
    render: () => (
      <section className="panel">
        <div className="panel__head"><h2>Resultado mensal</h2><span className="muted small">Receitas menos despesas</span></div>
        {receitas.length || despesas.length ? (
          <BarChart data={resultado} format={(v) => brl(v).replace(',00', '')} ariaLabel="Resultado mensal dos últimos seis meses" />
        ) : (
          <p className="muted pad">Sem lançamentos financeiros.</p>
        )}
      </section>
    ),
  });
  add(can('fin'), {
    id: 'p-categorias', titulo: 'Despesas por categoria', tipo: 'painel',
    render: () => (
      <section className="panel">
        <div className="panel__head"><h2>Despesas por categoria</h2><span className="muted small">{monthName(mes)}</span></div>
        {porCategoria.length ? <HBarList data={porCategoria} format={brl} /> : <p className="muted pad">Nenhuma despesa neste mês.</p>}
      </section>
    ),
  });
  add(can('dir'), {
    id: 'p-metas', titulo: 'Metas em andamento', tipo: 'painel',
    render: () => (
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
    ),
  });
  add(can('vnd') || can('fis'), {
    id: 'p-clientes', titulo: 'Clientes e qualidade', tipo: 'painel',
    render: () => (
      <section className="panel">
        <div className="panel__head"><h2>Clientes e qualidade</h2></div>
        <div className="mini-stats">
          {can('fis') && (
            <div><span className="muted small">Nota média de qualidade (30 dias)</span><strong>{notaMedia === null ? '—' : num(notaMedia, 1)}</strong></div>
          )}
          {can('vnd') && (
            <div><span className="muted small">Ticket médio por visita</span><strong>{(() => {
              const visitas = clientes.reduce((t, c) => t + c.visitas, 0);
              return visitas ? brl(clientes.reduce((t, c) => t + c.totalGasto, 0) / visitas) : '—';
            })()}</strong></div>
          )}
        </div>
        {can('vnd') && topClientes.length > 0 && (
          <>
            <h3 className="subhead">Afilhados que mais consomem</h3>
            <HBarList data={topClientes.map((c) => ({ label: c.nome, value: c.totalGasto }))} format={brl} />
          </>
        )}
      </section>
    ),
  });

  /* ---------- blocos extras (catálogo "Adicionar bloco"): só carregam dados quando o usuário os adiciona ---------- */
  const { prefs } = usePainelPrefs(info.chave);
  const tem = (...ids: string[]) => ids.some((id) => prefs.extras.includes(id));
  const vendas = can('atd') || can('vnd') || can('mkt');
  const consumos = useCollection('consumos', vendas && tem('x-vendas-hoje', 'x-ticket-mes', 'x-mais-vendidos'), `${currentMonth()}-01`).rows;
  const resgates = useCollection('resgates', vendas && tem('x-vouchers')).rows;
  const ferias = useCollection('ferias', can('rh') && tem('x-ausentes', 'x-proximas-ferias')).rows;
  const resgatesTop = useCollection('resgates', vendas && tem('x-recompensas-top')).rows;
  const midias = useCollection('midias', can('mkt') && tem('x-midias')).rows;
  const criacao = useCollection('criacao', can('mkt') && tem('x-criacao')).rows;
  const projetos = useCollection('projetos', can('dp') && tem('x-projetos')).rows;
  const materiais = useCollection('materiais', can('dp') && tem('x-materiais')).rows;
  const terceirizados = useCollection('terceirizados', can('adm') && tem('x-terceirizados', 'x-custo-terceirizados')).rows;
  const consultorias = useCollection('consultoria', can('jur') && tem('x-consultorias')).rows;
  const usuarios = useResource<{ id: string; status: string; ultimoAcesso?: string | null }[]>(can('cfg') && tem('x-usuarios') ? '/crm/usuarios' : null).data ?? [];
  const { items: atividades } = useAtividades();

  const consumosHoje = consumos.filter((c) => diaDe(c.data) === hoje);
  const consumosMes = consumos.filter((c) => diaDe(c.data).slice(0, 7) === mes);
  const aPagar = despesas.filter((d) => d.status === 'A pagar').sort((a, b) => String(a.vencimento ?? '').localeCompare(String(b.vencimento ?? '')));
  const semana = aPagar.filter((d) => daysUntil(d.vencimento) >= 0 && daysUntil(d.vencimento) <= 7);
  const vencidas = aPagar.filter((d) => daysUntil(d.vencimento) < 0);
  const ausentes = ferias.filter((f) => f.status !== 'Cancelado' && String(f.inicio ?? '') <= hoje && String(f.fim ?? '9999') >= hoje);
  const maisVendidos = Object.entries(
    consumosMes.reduce<Record<string, number>>((acc, c) => {
      for (const i of (Array.isArray(c.itens) ? c.itens : []) as { nome?: string; quantidade?: number }[]) {
        acc[String(i.nome ?? 'Item')] = (acc[String(i.nome ?? 'Item')] ?? 0) + (Number(i.quantidade) || 0);
      }
      return acc;
    }, {}),
  ).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  const reservasHoje = reservas
    .filter((r) => r.data === hoje && !['Cancelada', 'Cancelada pelo cliente', 'Recusada'].includes(String(r.status)))
    .sort((a, b) => String(a.hora ?? '').localeCompare(String(b.hora ?? '')));
  const contratosAVencer = contratos
    .filter((c) => c.status !== 'Encerrado' && c.vencimento && daysUntil(c.vencimento) <= 60)
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  const vence = (v: unknown) => {
    const d = daysUntil(v);
    return d < 0 ? `venceu há ${-d} ${d === -1 ? 'dia' : 'dias'}` : d === 0 ? 'vence hoje' : `vence em ${d} ${d === 1 ? 'dia' : 'dias'}`;
  };
  const painel = (titulo: string, lado: ReactNode, conteudo: ReactNode) => () => (
    <section className="panel">
      <div className="panel__head"><h2>{titulo}</h2>{lado}</div>
      {conteudo}
    </section>
  );
  const verTodos = (to: string) => <Link to={to} className="link">Ver todos</Link>;

  add(vendas, {
    id: 'x-vendas-hoje', titulo: 'Vendas de hoje', tipo: 'kpi', extra: { area: 'Atendimento', descricao: 'Total lançado em comandas hoje e quantas foram.' },
    render: kpi({ label: 'Vendas de hoje', value: brl(sumBy(consumosHoje)), hint: `${num(consumosHoje.length)} ${consumosHoje.length === 1 ? 'comanda' : 'comandas'}` }),
  });
  add(vendas, {
    id: 'x-ticket-mes', titulo: 'Ticket médio do mês', tipo: 'kpi', extra: { area: 'Atendimento', descricao: 'Valor médio por comanda lançada no mês.' },
    render: kpi({ label: `Ticket médio · ${monthName(mes)}`, value: consumosMes.length ? brl(sumBy(consumosMes) / consumosMes.length) : '—', hint: `${num(consumosMes.length)} comandas no mês` }),
  });
  add(vendas, {
    id: 'x-vouchers', titulo: 'Vouchers a entregar', tipo: 'kpi', extra: { area: 'Atendimento', descricao: 'Recompensas resgatadas no aplicativo que ainda não foram entregues.' },
    render: (() => {
      const n = resgates.filter((r) => r.status === 'Disponível').length;
      return kpi({ label: 'Vouchers a entregar', value: num(n), hint: 'resgatados e ainda não entregues', tone: n ? 'warn' : undefined });
    })(),
  });
  add(can('fin'), {
    id: 'x-contas-semana', titulo: 'A pagar em 7 dias', tipo: 'kpi', extra: { area: 'Financeiro', descricao: 'Soma das contas que vencem nos próximos 7 dias (e quantas já venceram).' },
    render: kpi({
      label: 'A pagar em 7 dias', value: brl(sumBy(semana)),
      hint: vencidas.length ? `${num(vencidas.length)} ${vencidas.length === 1 ? 'conta vencida' : 'contas vencidas'}` : `${num(semana.length)} ${semana.length === 1 ? 'conta' : 'contas'}`,
      tone: vencidas.length ? 'bad' : semana.length ? 'warn' : undefined,
    }),
  });
  add(can('rh'), {
    id: 'x-ausentes', titulo: 'Equipe ausente hoje', tipo: 'kpi', extra: { area: 'Pessoal', descricao: 'Colaboradores de férias, atestado ou afastados hoje.' },
    render: kpi({ label: 'Equipe ausente hoje', value: num(ausentes.length), hint: ausentes.length ? ausentes.slice(0, 2).map((f) => String(f.colaborador)).join(', ') + (ausentes.length > 2 ? '…' : '') : 'todos presentes' }),
  });
  add(can('atd'), {
    id: 'x-reservas-hoje', titulo: 'Reservas de hoje', tipo: 'painel', extra: { area: 'Atendimento', descricao: 'Lista das reservas do dia, por horário, com o número de pessoas.' },
    render: painel('Reservas de hoje', verTodos('/atendimento/reservas'), (
      <MiniLista vazio="Nenhuma reserva para hoje." itens={reservasHoje.slice(0, 8).map((r) => ({
        key: r.id, principal: `${r.hora ?? '--:--'} · ${r.clienteNome ?? 'Sem nome'}`,
        detalhe: [r.ambiente, r.status].filter(Boolean).join(' · '), valor: `${num(Number(r.pessoas) || 0)} pess.`,
        tom: r.status === 'Pendente' ? 'warn' as const : undefined,
      }))} />
    )),
  });
  add(vendas, {
    id: 'x-mais-vendidos', titulo: 'Mais vendidos do mês', tipo: 'painel', extra: { area: 'Atendimento', descricao: 'Os produtos com mais unidades lançadas nas comandas do mês.' },
    render: painel('Mais vendidos do mês', <span className="muted small">{monthName(mes)}</span>,
      maisVendidos.length ? <HBarList data={maisVendidos} format={(v) => `${num(v)} un.`} /> : <p className="muted pad">Nenhum consumo lançado neste mês.</p>),
  });
  add(can('fin'), {
    id: 'x-contas-pagar', titulo: 'Próximas contas a pagar', tipo: 'painel', extra: { area: 'Financeiro', descricao: 'As próximas despesas em aberto, por vencimento; as vencidas em vermelho.' },
    render: painel('Próximas contas a pagar', verTodos('/financeiro/despesas'), (
      <MiniLista vazio="Nenhuma conta em aberto." itens={aPagar.slice(0, 8).map((d) => ({
        key: d.id, principal: String(d.descricao ?? 'Despesa'), detalhe: `${dateBR(d.vencimento)} · ${vence(d.vencimento)}`,
        valor: brl(Number(d.valor) || 0), tom: daysUntil(d.vencimento) < 0 ? 'bad' as const : undefined,
      }))} />
    )),
  });
  add(can('dp'), {
    id: 'x-estoque-baixo', titulo: 'Estoque baixo', tipo: 'painel', extra: { area: 'Estrutura', descricao: 'Itens com quantidade igual ou abaixo do mínimo cadastrado.' },
    render: painel('Estoque baixo', verTodos('/estrutura/estoque'), (
      <MiniLista vazio="Nenhum item abaixo do mínimo." itens={repor.slice(0, 8).map((r) => ({
        key: r.id, principal: String(r.item ?? 'Item'), detalhe: String(r.categoria ?? ''),
        valor: `${num(Number(r.quantidade) || 0)} / mín. ${num(Number(r.minimo) || 0)} ${r.unidade ?? ''}`, tom: 'bad' as const,
      }))} />
    )),
  });
  add(can('adm'), {
    id: 'x-contratos', titulo: 'Contratos a vencer', tipo: 'painel', extra: { area: 'Administrativo', descricao: 'Contratos que vencem nos próximos 60 dias (ou já venceram).' },
    render: painel('Contratos a vencer', verTodos('/adm/contratos'), (
      <MiniLista vazio="Nenhum contrato vencendo nos próximos 60 dias." itens={contratosAVencer.slice(0, 8).map((c) => ({
        key: c.id, principal: String(c.titulo ?? 'Contrato'), detalhe: `${c.parte ?? ''}${c.parte ? ' · ' : ''}${vence(c.vencimento)}`,
        valor: c.valor ? brl(Number(c.valor)) : undefined, tom: daysUntil(c.vencimento) < 0 ? 'bad' as const : daysUntil(c.vencimento) <= 15 ? 'warn' as const : undefined,
      }))} />
    )),
  });
  add(true, {
    id: 'x-atividades', titulo: 'Últimas atualizações', tipo: 'painel', extra: { area: 'Geral', descricao: 'O que a equipe fez por último no sistema, com quem fez e quando.' },
    render: painel('Últimas atualizações', null, (
      <MiniLista vazio="Nenhuma atualização registrada ainda." itens={atividades.slice(0, 8).map((a) => ({
        key: a.id, principal: <>{a.usuarioNome} <span className="muted">{a.acao}</span> {a.alvo}</>,
        detalhe: new Date(a.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      }))} />
    )),
  });

  /* ---------- mais blocos do catálogo, por área ---------- */
  const fechadas = ['Concluída', 'Cancelada'];
  const metasAtrasadas = metas.filter((m) => !fechadas.includes(String(m.status)) && (m.status === 'Atrasada' || (m.prazo && daysUntil(m.prazo) < 0)));
  const reservasAtivas = (r: Row) => !['Cancelada', 'Cancelada pelo cliente', 'Recusada', 'Não compareceu'].includes(String(r.status));
  const proximasReservas = reservas
    .filter((r) => reservasAtivas(r) && daysUntil(r.data) >= 1 && daysUntil(r.data) <= 7)
    .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
  const pessoasHoje = reservasHoje.reduce((t, r) => t + (Number(r.pessoas) || 0), 0);
  const novosDoMes = clientes.filter((c) => monthOf(c.desde) === mes).sort((a, b) => String(b.desde).localeCompare(String(a.desde)));
  const contagem = (rows: Row[], campo: string) => Object.entries(rows.reduce<Record<string, number>>((acc, r) => {
    const k = String(r[campo] ?? 'Outros') || 'Outros';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const ativosRH = colaboradores.filter((c) => c.status !== 'Desligado');
  const proximasFerias = ferias.filter((f) => f.status === 'Agendado' && String(f.inicio ?? '') >= hoje).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  const projetosAndamento = projetos.filter((p) => p.status === 'Em andamento' || p.status === 'Planejado').sort((a, b) => String(a.prazo ?? '9999').localeCompare(String(b.prazo ?? '9999')));
  const estoqueVencendo = estoque.filter((r) => r.validade && daysUntil(r.validade) <= 15).sort((a, b) => String(a.validade).localeCompare(String(b.validade)));
  const materiaisAtencao = materiais.filter((m) => m.estado === 'Manutenção' || m.estado === 'Descartar');
  const terceirosAtivos = terceirizados.filter((t) => t.status === 'Ativo');
  const receitasMes = receitas.filter((r) => monthOf(r.data) === mes);
  const pagoMes = despesas.filter((d) => d.status === 'Pago' && monthOf(d.data) === mes);
  const proximasAudiencias = processos.filter((p) => p.audiencia && daysUntil(p.audiencia) >= 0).sort((a, b) => String(a.audiencia).localeCompare(String(b.audiencia)));
  const consultoriasAbertas = consultorias.filter((c) => c.status !== 'Concluída');
  const gravidade: Record<string, number> = { 'Crítica': 0, 'Alta': 1, 'Média': 2, 'Baixa': 3 };
  const ncsAbertas = ncs.filter((n) => n.status !== 'Resolvida').sort((a, b) => (gravidade[String(a.gravidade)] ?? 9) - (gravidade[String(b.gravidade)] ?? 9));
  const ultimaInspecao = [...qualidade].sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')))[0];
  const ativosSistema = usuarios.filter((u) => u.status === 'Ativo');
  const acessaramHoje = ativosSistema.filter((u) => u.ultimoAcesso && diaDe(u.ultimoAcesso) === hoje).length;

  add(can('dir'), {
    id: 'x-metas-atrasadas', titulo: 'Metas atrasadas', tipo: 'painel', extra: { area: 'Diretoria', descricao: 'Metas e decisões com prazo vencido ou marcadas como atrasadas.' },
    render: painel('Metas atrasadas', verTodos('/diretoria/metas'), (
      <MiniLista vazio="Nenhuma meta atrasada." itens={metasAtrasadas.slice(0, 8).map((m) => ({
        key: m.id, principal: String(m.titulo ?? 'Meta'), detalhe: [m.responsavel, m.prazo ? `prazo ${dateBR(m.prazo)}` : null].filter(Boolean).join(' · '),
        valor: `${num(Number(m.progresso) || 0)}%`, tom: 'bad' as const,
      }))} />
    )),
  });
  add(can('dir'), {
    id: 'x-metas-concluidas', titulo: 'Metas concluídas', tipo: 'kpi', extra: { area: 'Diretoria', descricao: 'Quantas metas já foram concluídas, do total cadastrado.' },
    render: kpi({ label: 'Metas concluídas', value: `${num(metas.filter((m) => m.status === 'Concluída').length)} de ${num(metas.filter((m) => m.status !== 'Cancelada').length)}`, hint: `${num(metasAtrasadas.length)} atrasadas`, tone: metasAtrasadas.length ? 'warn' : undefined }),
  });
  add(can('atd'), {
    id: 'x-pessoas-hoje', titulo: 'Pessoas esperadas hoje', tipo: 'kpi', extra: { area: 'Atendimento', descricao: 'Soma de pessoas das reservas de hoje (confirmadas e pendentes).' },
    render: kpi({ label: 'Pessoas esperadas hoje', value: num(pessoasHoje), hint: `${num(reservasHoje.length)} ${reservasHoje.length === 1 ? 'reserva' : 'reservas'}` }),
  });
  add(can('atd'), {
    id: 'x-proximas-reservas', titulo: 'Próximas reservas', tipo: 'painel', extra: { area: 'Atendimento', descricao: 'Reservas dos próximos 7 dias, sem contar hoje.' },
    render: painel('Próximas reservas', verTodos('/atendimento/reservas'), (
      <MiniLista vazio="Nenhuma reserva nos próximos 7 dias." itens={proximasReservas.slice(0, 8).map((r) => ({
        key: r.id, principal: `${dateBR(r.data).slice(0, 5)} ${r.hora ?? ''} · ${r.clienteNome ?? 'Sem nome'}`,
        detalhe: [r.ambiente, r.status].filter(Boolean).join(' · '), valor: `${num(Number(r.pessoas) || 0)} pess.`,
        tom: r.status === 'Pendente' ? 'warn' as const : undefined,
      }))} />
    )),
  });
  add(can('vnd'), {
    id: 'x-novos-afilhados', titulo: 'Novos afilhados do mês', tipo: 'painel', extra: { area: 'Vendas', descricao: 'Quem se cadastrou no aplicativo neste mês.' },
    render: painel('Novos afilhados do mês', verTodos('/vendas/clientes'), (
      <MiniLista vazio="Nenhum afilhado novo neste mês." itens={novosDoMes.slice(0, 8).map((c) => ({
        key: String(c.id), principal: c.nome, detalhe: `#${String(c.id).padStart(3, '0')} · desde ${dateBR(c.desde)}`,
      }))} />
    )),
  });
  add(vendas, {
    id: 'x-recompensas-top', titulo: 'Recompensas mais resgatadas', tipo: 'painel', extra: { area: 'Marketing', descricao: 'As recompensas que os afilhados mais resgatam no aplicativo.' },
    render: painel('Recompensas mais resgatadas', null, (() => {
      const top = contagem(resgatesTop.filter((r) => r.status !== 'Cancelado'), 'recompensa').slice(0, 6);
      return top.length ? <HBarList data={top} format={(v) => `${num(v)}×`} /> : <p className="muted pad">Nenhum resgate ainda.</p>;
    })()),
  });
  add(can('mkt'), {
    id: 'x-midias', titulo: 'Publicações agendadas', tipo: 'painel', extra: { area: 'Marketing', descricao: 'Próximas publicações agendadas nas redes e canais.' },
    render: painel('Publicações agendadas', verTodos('/marketing/midias'), (
      <MiniLista vazio="Nenhuma publicação agendada." itens={midias.filter((m) => m.status === 'Agendado').sort((a, b) => String(a.data ?? '').localeCompare(String(b.data ?? ''))).slice(0, 8).map((m) => ({
        key: m.id, principal: String(m.conteudo ?? 'Publicação'), detalhe: [m.canal, m.data ? dateBR(m.data) : null].filter(Boolean).join(' · '),
        valor: m.tipo === 'Patrocinado' ? brl(Number(m.investimento) || 0) : undefined,
      }))} />
    )),
  });
  add(can('mkt'), {
    id: 'x-criacao', titulo: 'Peças em produção', tipo: 'kpi', extra: { area: 'Marketing', descricao: 'Peças de criação em briefing, produção ou aprovação.' },
    render: (() => {
      const abertas = criacao.filter((c) => ['Briefing', 'Em produção', 'Em aprovação'].includes(String(c.status)));
      return kpi({ label: 'Peças em produção', value: num(abertas.length), hint: `${num(abertas.filter((c) => c.status === 'Em aprovação').length)} aguardando aprovação` });
    })(),
  });
  add(can('rh'), {
    id: 'x-proximas-ferias', titulo: 'Próximas férias', tipo: 'painel', extra: { area: 'Pessoal', descricao: 'Férias e afastamentos agendados, do mais próximo ao mais distante.' },
    render: painel('Próximas férias', verTodos('/rh/ferias'), (
      <MiniLista vazio="Nenhuma férias agendada." itens={proximasFerias.slice(0, 8).map((f) => ({
        key: f.id, principal: String(f.colaborador ?? 'Colaborador'), detalhe: `${f.tipo ?? ''} · ${dateBR(f.inicio)} a ${dateBR(f.fim)}`,
      }))} />
    )),
  });
  add(can('rh'), {
    id: 'x-equipe-setor', titulo: 'Equipe por setor', tipo: 'painel', extra: { area: 'Pessoal', descricao: 'Quantas pessoas ativas em cada setor (salão, bar, cozinha…).' },
    render: painel('Equipe por setor', <span className="muted small">{num(ativosRH.length)} ativos</span>,
      ativosRH.length ? <HBarList data={contagem(ativosRH, 'setor')} format={(v) => `${num(v)}`} /> : <p className="muted pad">Nenhum colaborador cadastrado.</p>),
  });
  add(can('dp'), {
    id: 'x-projetos', titulo: 'Projetos em andamento', tipo: 'painel', extra: { area: 'Estrutura', descricao: 'Projetos planejados ou em andamento, com prazo e quanto do orçamento já foi gasto.' },
    render: painel('Projetos em andamento', verTodos('/estrutura/projetos'), (
      <MiniLista vazio="Nenhum projeto em andamento." itens={projetosAndamento.slice(0, 8).map((p) => {
        const orc = Number(p.orcamento) || 0, gasto = Number(p.gasto) || 0;
        return {
          key: p.id, principal: String(p.nome ?? 'Projeto'), detalhe: [p.status, p.prazo ? `prazo ${dateBR(p.prazo)}` : null].filter(Boolean).join(' · '),
          valor: orc ? `${pct(gasto / orc)} do orçamento` : undefined, tom: orc && gasto > orc ? 'bad' as const : p.prazo && daysUntil(p.prazo) < 0 ? 'warn' as const : undefined,
        };
      })} />
    )),
  });
  add(can('dp'), {
    id: 'x-estoque-vencendo', titulo: 'Validade próxima', tipo: 'painel', extra: { area: 'Estrutura', descricao: 'Itens de estoque vencidos ou que vencem nos próximos 15 dias.' },
    render: painel('Validade próxima', verTodos('/estrutura/estoque'), (
      <MiniLista vazio="Nenhum item vencendo." itens={estoqueVencendo.slice(0, 8).map((r) => ({
        key: r.id, principal: String(r.item ?? 'Item'), detalhe: `${dateBR(r.validade)} · ${vence(r.validade)}`,
        valor: `${num(Number(r.quantidade) || 0)} ${r.unidade ?? ''}`, tom: daysUntil(r.validade) < 0 ? 'bad' as const : 'warn' as const,
      }))} />
    )),
  });
  add(can('dp'), {
    id: 'x-materiais', titulo: 'Materiais em manutenção', tipo: 'kpi', extra: { area: 'Estrutura', descricao: 'Equipamentos e materiais em manutenção ou para descartar.' },
    render: kpi({ label: 'Materiais em manutenção', value: num(materiaisAtencao.length), hint: `${num(materiaisAtencao.filter((m) => m.estado === 'Descartar').length)} para descartar`, tone: materiaisAtencao.length ? 'warn' : undefined }),
  });
  add(can('adm'), {
    id: 'x-terceirizados', titulo: 'Próximos serviços terceirizados', tipo: 'painel', extra: { area: 'Administrativo', descricao: 'Serviços terceirizados ativos, pela data do próximo atendimento ou pagamento.' },
    render: painel('Próximos serviços terceirizados', verTodos('/adm/terceirizados'), (
      <MiniLista vazio="Nenhum serviço terceirizado ativo." itens={[...terceirosAtivos].sort((a, b) => String(a.proximo ?? '9999').localeCompare(String(b.proximo ?? '9999'))).slice(0, 8).map((t) => ({
        key: t.id, principal: String(t.servico ?? 'Serviço'), detalhe: [t.empresa, t.proximo ? `próximo ${dateBR(t.proximo)}` : t.periodicidade].filter(Boolean).join(' · '),
        valor: t.valor ? brl(Number(t.valor)) : undefined,
      }))} />
    )),
  });
  add(can('adm'), {
    id: 'x-custo-terceirizados', titulo: 'Terceirizados por mês', tipo: 'kpi', extra: { area: 'Administrativo', descricao: 'Custo mensal dos serviços terceirizados ativos cobrados por mês.' },
    render: kpi({ label: 'Terceirizados por mês', value: brl(sumBy(terceirosAtivos.filter((t) => t.periodicidade === 'Mensal'))), hint: `${num(terceirosAtivos.length)} serviços ativos` }),
  });
  add(can('fin'), {
    id: 'x-receitas-categoria', titulo: 'Receitas por categoria', tipo: 'painel', extra: { area: 'Financeiro', descricao: 'De onde veio a receita do mês, por categoria.' },
    render: painel('Receitas por categoria', <span className="muted small">{monthName(mes)}</span>, (() => {
      const cat = Object.entries(receitasMes.reduce<Record<string, number>>((acc, r) => {
        acc[String(r.categoria ?? 'Outros')] = (acc[String(r.categoria ?? 'Outros')] ?? 0) + (Number(r.valor) || 0);
        return acc;
      }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
      return cat.length ? <HBarList data={cat} format={brl} /> : <p className="muted pad">Nenhuma receita neste mês.</p>;
    })()),
  });
  add(can('fin'), {
    id: 'x-pago-mes', titulo: 'Pago no mês', tipo: 'kpi', extra: { area: 'Financeiro', descricao: 'Total de despesas do mês já marcadas como pagas.' },
    render: kpi({ label: `Pago · ${monthName(mes)}`, value: brl(sumBy(pagoMes)), hint: `${num(pagoMes.length)} ${pagoMes.length === 1 ? 'conta paga' : 'contas pagas'}` }),
  });
  add(can('jur'), {
    id: 'x-audiencias', titulo: 'Próximas audiências', tipo: 'painel', extra: { area: 'Jurídico', descricao: 'Audiências trabalhistas marcadas, da mais próxima à mais distante.' },
    render: painel('Próximas audiências', verTodos('/juridico/trabalhista'), (
      <MiniLista vazio="Nenhuma audiência marcada." itens={proximasAudiencias.slice(0, 8).map((p) => ({
        key: p.id, principal: String(p.reclamante ?? p.numero ?? 'Processo'), detalhe: [p.assunto, `${dateBR(p.audiencia)} · ${vence(p.audiencia).replace('vence', 'é')}`].filter(Boolean).join(' · '),
        tom: daysUntil(p.audiencia) <= 7 ? 'warn' as const : undefined,
      }))} />
    )),
  });
  add(can('jur'), {
    id: 'x-consultorias', titulo: 'Consultorias em aberto', tipo: 'kpi', extra: { area: 'Jurídico', descricao: 'Demandas de consultoria empresarial ainda não concluídas.' },
    render: kpi({ label: 'Consultorias em aberto', value: num(consultoriasAbertas.length), hint: `${num(consultoriasAbertas.filter((c) => c.prazo && daysUntil(c.prazo) < 0).length)} com prazo vencido` }),
  });
  add(can('fis'), {
    id: 'x-ncs-abertas', titulo: 'Não conformidades abertas', tipo: 'painel', extra: { area: 'Fiscalização', descricao: 'Não conformidades ainda não resolvidas, das mais graves para as mais leves.' },
    render: painel('Não conformidades abertas', verTodos('/fiscalizacao/nao-conformidades'), (
      <MiniLista vazio="Nenhuma não conformidade aberta." itens={ncsAbertas.slice(0, 8).map((n) => ({
        key: n.id, principal: String(n.descricao ?? 'Não conformidade'), detalhe: [n.area, n.status, n.prazo ? `prazo ${dateBR(n.prazo)}` : null].filter(Boolean).join(' · '),
        valor: String(n.gravidade ?? ''), tom: ['Alta', 'Crítica'].includes(String(n.gravidade)) ? 'bad' as const : 'warn' as const,
      }))} />
    )),
  });
  add(can('fis'), {
    id: 'x-ultima-inspecao', titulo: 'Última inspeção', tipo: 'kpi', extra: { area: 'Fiscalização', descricao: 'Nota e resultado da inspeção de qualidade mais recente.' },
    render: kpi({
      label: 'Última inspeção', value: ultimaInspecao ? `${num(Number(ultimaInspecao.nota) || 0, 1)}` : '—',
      hint: ultimaInspecao ? `${ultimaInspecao.area ?? ''} · ${dateBR(ultimaInspecao.data)} · ${ultimaInspecao.resultado ?? ''}` : 'nenhuma inspeção registrada',
      tone: ultimaInspecao?.resultado === 'Não conforme' ? 'bad' : ultimaInspecao?.resultado === 'Conforme com ressalvas' ? 'warn' : ultimaInspecao ? 'good' : undefined,
    }),
  });
  add(can('cfg'), {
    id: 'x-usuarios', titulo: 'Usuários do sistema', tipo: 'kpi', extra: { area: 'Configurações', descricao: 'Usuários ativos do CRM e quantos entraram hoje.' },
    render: kpi({ label: 'Usuários ativos', value: num(ativosSistema.length), hint: `${num(acessaramHoje)} entraram hoje` }),
  });

  return <PainelPersonalizavel blocos={blocos} {...info} />;
}

/* ---------- personalização: cada usuário escolhe a ordem, o tamanho, o que fica fixado no topo e o que fica oculto ---------- */

/** Tamanho padrão: indicadores ocupam ¼ da linha; painéis (gráficos, listas), metade. */
const tamanhoPadrao = (b: Bloco): Tamanho => (b.tipo === 'kpi' ? 'p' : 'm');

/* grade livre: 12 colunas; cada linha tem 20 px e o espaço entre blocos é 16 px (altura = 36·h − 16 px) */
const COLUNAS = 12;
const LARGURA: Record<Tamanho, number> = { p: 3, m: 6, g: 9, c: 12 };
const alturaPadrao = (b: Bloco) => (b.tipo === 'kpi' ? 4 : 10);
const tamanhoDaLargura = (w: number): Tamanho => (w <= 3 ? 'p' : w <= 6 ? 'm' : w <= 9 ? 'g' : 'c');
const colide = (a: Posicao, b: Posicao) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const leitura = (a: Posicao, b: Posicao) => a.y - b.y || a.x - b.x;
/** Tira sobreposições empurrando para baixo; `primeiro` fica onde está e os outros abrem espaço para ele. */
function resolver(pos: Record<string, Posicao>, primeiro?: string): Record<string, Posicao> {
  const ids = Object.keys(pos).sort((a, b) => (a === primeiro ? -1 : b === primeiro ? 1 : leitura(pos[a], pos[b])));
  const feitos: Posicao[] = [];
  const out: Record<string, Posicao> = {};
  for (const id of ids) {
    const p = { ...pos[id] };
    while (feitos.some((q) => colide(p, q))) p.y++;
    feitos.push(p);
    out[id] = p;
  }
  return out;
}
/** No celular a grade livre vira uma coluna, na ordem de leitura (de cima para baixo, da esquerda para a direita). */
function useTelaLarga() {
  const [larga, setLarga] = useState(() => window.innerWidth >= 760);
  useEffect(() => {
    const ver = () => setLarga(window.innerWidth >= 760);
    window.addEventListener('resize', ver);
    return () => window.removeEventListener('resize', ver);
  }, []);
  return larga;
}

/** Cartão de atalho para uma página do CRM. */
function blocoAtalho(path: string): Bloco | null {
  const m = findModule(path);
  if (!m) return null;
  const Icon = m.area.icon;
  return {
    id: atalhoId(path), titulo: m.item.label, tipo: 'kpi', atalho: path,
    render: () => (
      <Link to={path} className="kpi atalho">
        <span className="kpi__label"><Icon size={14} className="atalho__icon" /> {m.area.label}</span>
        <strong className="atalho__title">{m.item.label}</strong>
        <span className="kpi__hint atalho__go">Abrir página <ArrowRight size={13} /></span>
      </Link>
    ),
  };
}

function PainelPersonalizavel({ blocos: proprios, chave, titulo, descricao }: { blocos: Bloco[] } & PainelInfo) {
  const { prefs, salvar } = usePainelPrefs(chave);
  const { access } = useSession();
  // atalhos de páginas adicionadas pelo menu, só das áreas que a pessoa ainda acessa
  // blocos extras só entram depois de adicionados pelo catálogo
  const catalogo = proprios.filter((b) => b.extra);
  const blocos = [
    ...prefs.atalhos.map(blocoAtalho).filter((b): b is Bloco => !!b && access(findModule(b.atalho!)!.area.key) !== 'none'),
    ...proprios.filter((b) => !b.extra || prefs.extras.includes(b.id)),
  ];
  const [editando, setEditando] = useState(false);
  const [vendoCatalogo, setVendoCatalogo] = useState(false);
  const [areaCatalogo, setAreaCatalogo] = useState('');
  // áreas do catálogo na mesma ordem do menu ("Geral" primeiro)
  const ordemAreas = ['Geral', ...AREAS.map((a) => a.label)];
  const areasCatalogo = [...new Set(catalogo.map((b) => b.extra!.area))].sort((x, y) => ordemAreas.indexOf(x) - ordemAreas.indexOf(y));
  const [menu, setMenu] = useState<(MenuPos & { id: string; soLayout?: boolean }) | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  const existe = new Set(blocos.map((b) => b.id));
  const porId = new Map(blocos.map((b) => [b.id, b]));
  const padrao = blocos.map((b) => b.id);
  // ordem salva primeiro; blocos novos (ou de áreas liberadas depois) entram no fim, na ordem padrão
  const ordem = [...prefs.ordem.filter((id) => existe.has(id)), ...padrao.filter((id) => !prefs.ordem.includes(id))];
  const ocultos = new Set(prefs.ocultos.filter((id) => existe.has(id)));
  const fixados = prefs.fixados.filter((id) => existe.has(id) && !ocultos.has(id));
  const normais = ordem.filter((id) => !fixados.includes(id) && !ocultos.has(id));
  const telaLarga = useTelaLarga();

  // posição de cada bloco da área livre: a salva ou, para blocos sem posição, o primeiro espaço livre na ordem de leitura
  const posicoes: Record<string, Posicao> = {};
  for (const id of normais) if (prefs.layout[id]) posicoes[id] = prefs.layout[id];
  for (const id of normais) {
    if (posicoes[id]) continue;
    const b = porId.get(id)!;
    const w = LARGURA[prefs.tamanhos[id] ?? tamanhoPadrao(b)], h = alturaPadrao(b);
    const p = { x: 0, y: 0, w, h };
    while (Object.values(posicoes).some((q) => colide(p, q))) { p.x++; if (p.x + w > COLUNAS) { p.x = 0; p.y++; } }
    posicoes[id] = p;
  }
  const emLeitura = [...normais].sort((a, b) => leitura(posicoes[a], posicoes[b]));

  const gravar = (next: Partial<PainelPrefs>) =>
    salvar({ ...prefs, ordem, fixados, ocultos: [...ocultos], ...next }).catch((e: Error) => notify(e.message || 'Não foi possível salvar o painel.', 'error'));
  const alternarFixado = (id: string) =>
    gravar({ fixados: fixados.includes(id) ? fixados.filter((x) => x !== id) : [...fixados, id] });
  const ocultar = (id: string) => gravar({ ocultos: [...ocultos, id], fixados: fixados.filter((x) => x !== id) });
  const removerAtalho = (path: string) =>
    salvar(alternarAtalho({ ...prefs, ordem, fixados, ocultos: [...ocultos] }, path)).catch((e: Error) => notify(e.message || 'Não foi possível salvar o painel.', 'error'));
  const mostrar = (id: string) => gravar({ ocultos: [...ocultos].filter((x) => x !== id) });
  const alternarExtra = (id: string) => prefs.extras.includes(id)
    ? gravar({ extras: prefs.extras.filter((x) => x !== id), fixados: fixados.filter((x) => x !== id) })
    : gravar({ extras: [...prefs.extras, id] });
  /** Atalhos e blocos do catálogo saem do painel; os padrões só podem ser ocultados. */
  const remover = (b: Bloco) => (b.atalho ? removerAtalho(b.atalho) : alternarExtra(b.id));

  /** Grava as posições da área livre (as de blocos fora dela continuam guardadas). */
  const gravarPosicoes = (novas: Record<string, Posicao>) => gravar({ layout: { ...prefs.layout, ...novas } });
  // durante o arraste os blocos podem se sobrepor; ao soltar, o bloco fica exatamente ali e só os que ele cobriria descem
  const aoMexer = (l: Layout[], _antes: Layout, item: Layout) =>
    gravarPosicoes(resolver(Object.fromEntries(l.map((x) => [x.i, { x: x.x, y: x.y, w: x.w, h: x.h }])), item.i));

  /** Setas do modo Personalizar (no toque não dá para arrastar): troca de lugar com o bloco vizinho. */
  const mover = (id: string, passo: -1 | 1) => {
    if (!fixados.includes(id)) {
      const vizinho = emLeitura[emLeitura.indexOf(id) + passo];
      if (!vizinho) return;
      const a = posicoes[id], b = posicoes[vizinho];
      gravarPosicoes(resolver({ ...posicoes, [id]: { ...a, x: Math.min(b.x, COLUNAS - a.w), y: b.y }, [vizinho]: { ...b, x: Math.min(a.x, COLUNAS - b.w), y: a.y } }, id));
      return;
    }
    const zona = fixados;
    const vizinho = zona[zona.indexOf(id) + passo];
    if (!vizinho) return;
    const trocar = (lista: string[]) => lista.map((x) => (x === id ? vizinho : x === vizinho ? id : x));
    if (fixados.includes(id)) gravar({ fixados: trocar(fixados) });
    else gravar({ ordem: trocar(ordem) });
  };
  /** Leva o bloco para o começo ou para o fim da área em que ele está. */
  const moverParaPonta = (id: string, ponta: 'inicio' | 'fim') => {
    const pos = (lista: string[]) => { const sem = lista.filter((x) => x !== id); return ponta === 'inicio' ? [id, ...sem] : [...sem, id]; };
    if (fixados.includes(id)) gravar({ fixados: pos(fixados) });
    else {
      // na área livre: no topo à esquerda (os outros descem) ou embaixo de todos
      const p = posicoes[id];
      const fundo = Math.max(0, ...normais.filter((x) => x !== id).map((x) => posicoes[x].y + posicoes[x].h));
      gravarPosicoes(resolver({ ...posicoes, [id]: ponta === 'inicio' ? { ...p, x: 0, y: 0 } : { ...p, x: 0, y: fundo } }, id));
    }
  };
  const tamanhoDe = (id: string): Tamanho => (posicoes[id] ? tamanhoDaLargura(posicoes[id].w) : prefs.tamanhos[id] ?? tamanhoPadrao(porId.get(id)!));
  const redimensionar = (id: string, t: Tamanho) => {
    if (posicoes[id]) {
      const p = posicoes[id], w = LARGURA[t];
      gravarPosicoes(resolver({ ...posicoes, [id]: { ...p, w, x: Math.min(p.x, COLUNAS - w) } }, id));
      return;
    }
    const { [id]: _antigo, ...resto } = prefs.tamanhos;
    gravar({ tamanhos: t === tamanhoPadrao(porId.get(id)!) ? resto : { ...resto, [id]: t } });
  };
  /** Opções de tamanho e lugar (botão do modo Personalizar e botão direito sobre o bloco). */
  const opcoesLayout = (id: string) => {
    const zona = fixados.includes(id) ? fixados : emLeitura;
    const i = zona.indexOf(id);
    return (
      <>
        <div className="ctx__label">Tamanho</div>
        <div className="ctx__sizes" role="group" aria-label="Tamanho do bloco">
          {TAMANHOS.map((t) => (
            <button key={t.valor} role="menuitemradio" aria-checked={tamanhoDe(id) === t.valor} className={tamanhoDe(id) === t.valor ? 'is-active' : ''}
              title={`${t.nome} (${t.fracao === '1' ? 'linha inteira' : `${t.fracao} da linha`})`} onClick={() => redimensionar(id, t.valor)}>
              <span className="ctx__size-bar"><i style={{ width: { p: '25%', m: '50%', g: '75%', c: '100%' }[t.valor] }} /></span>
              {t.nome}
            </button>
          ))}
        </div>
        <div className="ctx__sep" />
        <div className="ctx__label">Lugar</div>
        <button role="menuitem" disabled={i <= 0} onClick={() => moverParaPonta(id, 'inicio')}><ChevronsUp size={15} /> Mover para o início</button>
        <button role="menuitem" disabled={i <= 0} onClick={() => mover(id, -1)}><ArrowUp size={15} /> Uma posição antes</button>
        <button role="menuitem" disabled={i < 0 || i >= zona.length - 1} onClick={() => mover(id, 1)}><ArrowDown size={15} /> Uma posição depois</button>
        <button role="menuitem" disabled={i < 0 || i >= zona.length - 1} onClick={() => moverParaPonta(id, 'fim')}><ChevronsDown size={15} /> Mover para o fim</button>
      </>
    );
  };
  const toqueLongo = useToqueLongo();

  const soltar = (id: string, zona: 'fixados' | 'normais', alvo?: string) => {
    if (id === alvo) return;
    const fix = fixados.filter((x) => x !== id);
    let ord = ordem;
    if (zona === 'fixados') fix.splice(alvo && fix.includes(alvo) ? fix.indexOf(alvo) : fix.length, 0, id);
    else {
      ord = ordem.filter((x) => x !== id);
      ord.splice(alvo && ord.includes(alvo) ? ord.indexOf(alvo) : ord.length, 0, id);
    }
    gravar({ fixados: fix, ordem: ord });
  };

  const fimArraste = () => {
    setArrastando(null);
    setSobre(null);
  };
  const zonaProps = (zona: 'fixados' | 'normais') => ({
    onDragOver: (e: React.DragEvent) => editando && arrastando && e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (arrastando) soltar(arrastando, zona);
      fimArraste();
    },
  });

  const renderBloco = (id: string, zona: 'fixados' | 'normais', livre = false) => {
    const b = porId.get(id)!;
    const fixado = fixados.includes(id);
    return (
      <div
        key={id}
        className={`bloco bloco--${tamanhoDe(id)} bloco--${b.tipo} ${livre ? 'bloco--livre' : ''} ${editando ? 'is-editing' : ''} ${arrastando === id ? 'is-dragging' : ''} ${sobre === id ? 'is-over' : ''}`}
        draggable={editando && !livre}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setArrastando(id); }}
        onDragEnd={fimArraste}
        onDragOver={(e) => {
          if (!editando || !arrastando) return;
          e.preventDefault();
          e.stopPropagation();
          setSobre(id);
        }}
        onDragLeave={() => setSobre((s) => (s === id ? null : s))}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (arrastando) soltar(arrastando, zona, id);
          fimArraste();
        }}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id }); }}
        {...(editando ? {} : toqueLongo((x, y) => setMenu({ x, y, id })))}
      >
        {editando ? (
          <div className="bloco__tools">
            <span className="bloco__grip" title={livre ? 'Arraste para qualquer lugar' : 'Arraste para mudar de lugar'}><GripVertical size={15} /></span>
            <button onClick={() => mover(id, -1)} title="Mover para antes" aria-label={`Mover ${b.titulo} para antes`}><ArrowUp size={14} /></button>
            <button onClick={() => mover(id, 1)} title="Mover para depois" aria-label={`Mover ${b.titulo} para depois`}><ArrowDown size={14} /></button>
            <button
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 6, id, soLayout: true }); }}
              title="Tamanho e lugar" aria-label={`Tamanho e lugar de ${b.titulo}`}
            ><Scaling size={14} /></button>
            <button onClick={() => alternarFixado(id)} title={fixado ? 'Desafixar' : 'Fixar no topo'} aria-label={fixado ? `Desafixar ${b.titulo}` : `Fixar ${b.titulo} no topo`}>
              {fixado ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            {b.atalho || b.extra ? (
              <button onClick={() => remover(b)} title="Remover do painel" aria-label={`Remover ${b.titulo} do painel`}><X size={14} /></button>
            ) : (
              <button onClick={() => ocultar(id)} title="Ocultar" aria-label={`Ocultar ${b.titulo}`}><EyeOff size={14} /></button>
            )}
          </div>
        ) : fixado && <Pin size={13} className="bloco__pin" aria-label="Fixado" />}
        {b.render()}
      </div>
    );
  };

  // uma grade só, de 12 colunas: cada bloco ocupa a largura escolhida, na ordem escolhida (indicadores e painéis misturados)
  const area = (ids: string[], zona: 'fixados' | 'normais') => <div className="blocos">{ids.map((id) => renderBloco(id, zona))}</div>;

  const personalizado = prefs.ordem.length > 0 || prefs.fixados.length > 0 || prefs.ocultos.length > 0 || prefs.atalhos.length > 0 || prefs.extras.length > 0 || Object.keys(prefs.tamanhos).length > 0 || Object.keys(prefs.layout).length > 0;
  const menuBloco = menu && porId.get(menu.id);

  return (
    <div className="page">
      <PageHead
        title={titulo}
        description={descricao}
        actions={<>
          {catalogo.length > 0 && <button className="btn btn--ghost" onClick={() => setVendoCatalogo(true)}><Plus size={16} /> Adicionar bloco</button>}
          {!editando && <button className="btn btn--ghost" onClick={() => setEditando(true)}><SlidersHorizontal size={16} /> Personalizar</button>}
        </>}
      />

      {editando && (
        <div className="customize-bar">
          <div className="customize-bar__text">
            <strong>Personalizando o seu painel</strong>
            <span className="muted small">Arraste cada bloco pela alça ⠿ para qualquer lugar do painel (pode deixar espaço vazio) e puxe o canto inferior direito para mudar a largura e a altura. O botão de tamanho tem atalhos (¼, ½, ¾ ou a linha inteira) e o alfinete leva o bloco para a área “Fixados” no topo. Use “Adicionar bloco” para novos indicadores e listas; para uma página do sistema, use o botão direito (ou segure o dedo) sobre ela no menu → “Adicionar ao meu painel”. As escolhas ficam salvas na sua conta.</span>
          </div>
          {ocultos.size > 0 && (
            <div className="customize-bar__hidden">
              <span className="muted small">Ocultos:</span>
              {[...ocultos].map((id) => (
                <button key={id} className="chip" onClick={() => mostrar(id)} title="Mostrar de novo"><Eye size={13} /> {porId.get(id)!.titulo}</button>
              ))}
            </div>
          )}
          <div className="customize-bar__actions">
            {personalizado && (
              <button className="btn btn--ghost btn--sm" onClick={() => gravar({ ordem: [], fixados: [], ocultos: [], atalhos: [], extras: [], tamanhos: {}, layout: {} })}><RotateCcw size={14} /> Restaurar padrão</button>
            )}
            <button className="btn btn--primary btn--sm" onClick={() => setEditando(false)}><Check size={14} /> Concluir</button>
          </div>
        </div>
      )}

      {(fixados.length > 0 || editando) && (
        <section className={`pinned-zone ${editando ? 'is-editing' : ''} ${editando && arrastando ? 'is-target' : ''}`} {...zonaProps('fixados')}>
          <h2 className="pinned-zone__title"><Pin size={14} /> Fixados</h2>
          {fixados.length ? area(fixados, 'fixados') : (
            <p className="pinned-zone__empty">Arraste um bloco para cá, ou use o botão direito (ou segure o dedo) sobre ele e escolha “Fixar no topo”.</p>
          )}
        </section>
      )}

      <div className={`free-zone ${editando && arrastando ? 'is-target' : ''}`} {...zonaProps('normais')}>
        {normais.length ? (telaLarga ? (
          // grade livre: cada bloco fica exatamente onde foi solto (pode sobrar espaço vazio) e muda de largura e altura pelo canto
          <Grade
            className={`grade-livre ${editando ? 'is-editing' : ''}`}
            layout={normais.map((id) => ({ i: id, ...posicoes[id], minW: 2, minH: 2 }))}
            cols={COLUNAS} rowHeight={20} margin={[16, 16]} containerPadding={[0, 0]}
            compactType={null} allowOverlap isDraggable={editando} isResizable={editando} draggableHandle=".bloco__grip" resizeHandles={['se']}
            onDragStop={aoMexer} onResizeStop={aoMexer}
          >
            {normais.map((id) => renderBloco(id, 'normais', true))}
          </Grade>
        ) : area(emLeitura, 'normais')) : (
          <p className="muted pad center">Todos os blocos estão fixados ou ocultos.{!editando && <> <button className="link" onClick={() => setEditando(true)}>Personalizar</button></>}</p>
        )}
      </div>

      {menu && menuBloco && menu.soLayout && (
        <ContextMenu at={menu} onClose={() => setMenu(null)}>{opcoesLayout(menu.id)}</ContextMenu>
      )}
      {menu && menuBloco && !menu.soLayout && (
        <ContextMenu at={menu} onClose={() => setMenu(null)}>
          {opcoesLayout(menu.id)}
          <div className="ctx__sep" />
          <button role="menuitem" onClick={() => alternarFixado(menu.id)}>
            {fixados.includes(menu.id) ? <><PinOff size={15} /> Desafixar</> : <><Pin size={15} /> Fixar no topo</>}
          </button>
          {menuBloco.atalho || menuBloco.extra ? (
            <button role="menuitem" onClick={() => remover(menuBloco)}><LayoutDashboard size={15} /> Remover do painel</button>
          ) : (
            <button role="menuitem" onClick={() => ocultar(menu.id)}><EyeOff size={15} /> Ocultar “{menuBloco.titulo}”</button>
          )}
          <div className="ctx__sep" />
          <button role="menuitem" onClick={() => setVendoCatalogo(true)}><Plus size={15} /> Adicionar bloco</button>
          <button role="menuitem" onClick={() => setEditando(true)}><SlidersHorizontal size={15} /> Personalizar painel</button>
        </ContextMenu>
      )}

      {vendoCatalogo && (
        <Modal title="Adicionar bloco ao painel" onClose={() => setVendoCatalogo(false)} width={860}>
          <p className="muted catalog__intro">
            Blocos além dos padrões. Os adicionados entram no fim do painel; depois é só arrastar, fixar ou remover.
            Para colocar uma página do sistema, use o botão direito (ou segure o dedo) sobre ela no menu → “Adicionar ao meu painel”.
          </p>
          <div className="catalog__tabs" role="tablist" aria-label="Filtrar por área">
            {['', ...areasCatalogo].map((a) => (
              <button key={a || 'todas'} role="tab" aria-selected={areaCatalogo === a} className={areaCatalogo === a ? 'is-active' : ''} onClick={() => setAreaCatalogo(a)}>
                {a || 'Todas'}
                <span>{a ? catalogo.filter((b) => b.extra!.area === a).length : catalogo.length}</span>
              </button>
            ))}
          </div>
          <div className="catalog__scroll">
            {areasCatalogo.filter((a) => !areaCatalogo || a === areaCatalogo).map((a) => {
              const lista = catalogo.filter((b) => b.extra!.area === a).sort((x, y) => (x.tipo === y.tipo ? 0 : x.tipo === 'kpi' ? -1 : 1));
              return (
                <section key={a} className="catalog__group">
                  <h3 className="catalog__title">{a} <span>{lista.filter((b) => prefs.extras.includes(b.id)).length} de {lista.length} no painel</span></h3>
                  <div className="catalog">
                    {lista.map((b) => {
                      const ativo = prefs.extras.includes(b.id);
                      return (
                        <div key={b.id} className={`catalog__item ${ativo ? 'is-active' : ''}`}>
                          <span className="catalog__type">{b.tipo === 'kpi' ? 'Indicador' : 'Painel'}</span>
                          <strong>{b.titulo}</strong>
                          <span className="muted small">{b.extra!.descricao}</span>
                          <button className={`btn btn--sm ${ativo ? 'btn--ghost' : 'btn--primary'}`} onClick={() => alternarExtra(b.id)}>
                            {ativo ? <><Check size={14} /> Adicionado · remover</> : <><Plus size={14} /> Adicionar</>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
