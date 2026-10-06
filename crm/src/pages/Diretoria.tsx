import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Eye, EyeOff, GripVertical, LayoutDashboard, Pin, PinOff, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { BarChart, HBarList } from '../components/Charts';
import { ContextMenu, type MenuPos } from '../components/ContextMenu';
import { notify, PageHead } from '../components/ui';
import { useCollection, useResource, type Row } from '../lib/data';
import { brl, daysUntil, isoToday, monthLabel, num, pct } from '../lib/format';
import { currentMonth, despesaValida, lastMonths, monthName, monthOf, sumBy } from '../lib/finance';
import { alternarAtalho, atalhoId, usePainelPrefs, type PainelPrefs } from '../lib/preferencias';
import { findModule } from '../modules';
import { useSession } from '../lib/session';
import type { Kpi } from '../collections';

interface ClienteResumo { id: number; nome: string; totalGasto: number; visitas: number; criadoEm?: string; desde: string }

/** Um bloco do painel: um indicador (cartão pequeno) ou um painel (gráfico, lista). */
interface Bloco {
  id: string;
  titulo: string;
  tipo: 'kpi' | 'painel';
  render: () => ReactNode;
  /** Página do CRM adicionada ao painel pelo menu (botão direito → Adicionar ao painel). */
  atalho?: string;
}

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
  add(can('mkt'), { id: 'k-afilhados', titulo: 'Afilhados cadastrados', tipo: 'kpi', render: kpi({ label: 'Afilhados cadastrados', value: num(clientes.length), hint: `${num(novosClientes)} novos este mês` }) });
  add(can('mkt'), { id: 'k-reservas', titulo: 'Reservas pendentes', tipo: 'kpi', render: kpi({ label: 'Reservas pendentes', value: num(pendentes), tone: pendentes ? 'warn' : undefined }) });
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
  add(can('mkt') || can('fis'), {
    id: 'p-clientes', titulo: 'Clientes e qualidade', tipo: 'painel',
    render: () => (
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
    ),
  });

  return <PainelPersonalizavel blocos={blocos} />;
}

/* ---------- personalização: cada usuário escolhe a ordem, o que fica fixado no topo e o que fica oculto ---------- */

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

function PainelPersonalizavel({ blocos: proprios }: { blocos: Bloco[] }) {
  const { prefs, salvar } = usePainelPrefs();
  const { access } = useSession();
  // atalhos de páginas adicionadas pelo menu, só das áreas que a pessoa ainda acessa
  const blocos = [
    ...prefs.atalhos.map(blocoAtalho).filter((b): b is Bloco => !!b && access(findModule(b.atalho!)!.area.key) !== 'none'),
    ...proprios,
  ];
  const [editando, setEditando] = useState(false);
  const [menu, setMenu] = useState<(MenuPos & { id: string }) | null>(null);
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

  const gravar = (next: Partial<PainelPrefs>) =>
    salvar({ ...prefs, ordem, fixados, ocultos: [...ocultos], ...next }).catch((e: Error) => notify(e.message || 'Não foi possível salvar o painel.', 'error'));
  const alternarFixado = (id: string) =>
    gravar({ fixados: fixados.includes(id) ? fixados.filter((x) => x !== id) : [...fixados, id] });
  const ocultar = (id: string) => gravar({ ocultos: [...ocultos, id], fixados: fixados.filter((x) => x !== id) });
  const removerAtalho = (path: string) =>
    salvar(alternarAtalho({ ...prefs, ordem, fixados, ocultos: [...ocultos] }, path)).catch((e: Error) => notify(e.message || 'Não foi possível salvar o painel.', 'error'));
  const mostrar = (id: string) => gravar({ ocultos: [...ocultos].filter((x) => x !== id) });

  /** Solta `id` antes de `alvo` (ou no fim da área). Soltar entre os fixados fixa; entre os demais, desafixa. */
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

  const renderBloco = (id: string, zona: 'fixados' | 'normais') => {
    const b = porId.get(id)!;
    const fixado = fixados.includes(id);
    return (
      <div
        key={id}
        className={`bloco ${editando ? 'is-editing' : ''} ${arrastando === id ? 'is-dragging' : ''} ${sobre === id ? 'is-over' : ''}`}
        draggable={editando}
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
      >
        {editando ? (
          <div className="bloco__tools">
            <span className="bloco__grip" title="Arraste para mudar de lugar"><GripVertical size={15} /></span>
            <button onClick={() => alternarFixado(id)} title={fixado ? 'Desafixar' : 'Fixar no topo'} aria-label={fixado ? `Desafixar ${b.titulo}` : `Fixar ${b.titulo} no topo`}>
              {fixado ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
            {b.atalho ? (
              <button onClick={() => removerAtalho(b.atalho!)} title="Remover do painel" aria-label={`Remover ${b.titulo} do painel`}><X size={14} /></button>
            ) : (
              <button onClick={() => ocultar(id)} title="Ocultar" aria-label={`Ocultar ${b.titulo}`}><EyeOff size={14} /></button>
            )}
          </div>
        ) : fixado && <Pin size={13} className="bloco__pin" aria-label="Fixado" />}
        {b.render()}
      </div>
    );
  };

  const area = (ids: string[], zona: 'fixados' | 'normais') => {
    const kpis = ids.filter((id) => porId.get(id)!.tipo === 'kpi');
    const paineis = ids.filter((id) => porId.get(id)!.tipo === 'painel');
    return (
      <>
        {kpis.length > 0 && <div className="kpis">{kpis.map((id) => renderBloco(id, zona))}</div>}
        {paineis.length > 0 && <div className="grid-2">{paineis.map((id) => renderBloco(id, zona))}</div>}
      </>
    );
  };

  const personalizado = prefs.ordem.length > 0 || prefs.fixados.length > 0 || prefs.ocultos.length > 0 || prefs.atalhos.length > 0;
  const menuBloco = menu && porId.get(menu.id);

  return (
    <div className="page">
      <PageHead
        title="Painel executivo"
        description="Visão consolidada de todas as áreas, atualizada com os dados lançados no sistema e no aplicativo."
        actions={!editando && (
          <button className="btn btn--ghost" onClick={() => setEditando(true)}><SlidersHorizontal size={16} /> Personalizar</button>
        )}
      />

      {editando && (
        <div className="customize-bar">
          <div className="customize-bar__text">
            <strong>Personalizando o seu painel</strong>
            <span className="muted small">Arraste os blocos para mudar a ordem ou para a área “Fixados” no topo. Para adicionar uma página, clique com o botão direito nela no menu e escolha “Adicionar ao painel”. As escolhas ficam salvas na sua conta.</span>
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
              <button className="btn btn--ghost btn--sm" onClick={() => gravar({ ordem: [], fixados: [], ocultos: [], atalhos: [] })}><RotateCcw size={14} /> Restaurar padrão</button>
            )}
            <button className="btn btn--primary btn--sm" onClick={() => setEditando(false)}><Check size={14} /> Concluir</button>
          </div>
        </div>
      )}

      {(fixados.length > 0 || editando) && (
        <section className={`pinned-zone ${editando ? 'is-editing' : ''} ${editando && arrastando ? 'is-target' : ''}`} {...zonaProps('fixados')}>
          <h2 className="pinned-zone__title"><Pin size={14} /> Fixados</h2>
          {fixados.length ? area(fixados, 'fixados') : (
            <p className="pinned-zone__empty">Arraste um bloco para cá, ou clique com o botão direito sobre ele e escolha “Fixar no topo”.</p>
          )}
        </section>
      )}

      <div className={`free-zone ${editando && arrastando ? 'is-target' : ''}`} {...zonaProps('normais')}>
        {normais.length ? area(normais, 'normais') : (
          <p className="muted pad center">Todos os blocos estão fixados ou ocultos.{!editando && <> <button className="link" onClick={() => setEditando(true)}>Personalizar</button></>}</p>
        )}
      </div>

      {menu && menuBloco && (
        <ContextMenu at={menu} onClose={() => setMenu(null)}>
          <button role="menuitem" onClick={() => alternarFixado(menu.id)}>
            {fixados.includes(menu.id) ? <><PinOff size={15} /> Desafixar</> : <><Pin size={15} /> Fixar no topo</>}
          </button>
          {menuBloco.atalho ? (
            <button role="menuitem" onClick={() => removerAtalho(menuBloco.atalho!)}><LayoutDashboard size={15} /> Remover do painel</button>
          ) : (
            <button role="menuitem" onClick={() => ocultar(menu.id)}><EyeOff size={15} /> Ocultar “{menuBloco.titulo}”</button>
          )}
          <div className="ctx__sep" />
          <button role="menuitem" onClick={() => setEditando(true)}><SlidersHorizontal size={15} /> Personalizar painel</button>
        </ContextMenu>
      )}
    </div>
  );
}
