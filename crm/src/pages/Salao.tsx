import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownCircle, ArrowUpCircle, Ban, Check, LayoutGrid, List, LockOpen, Lock, Map as MapIcon, Minus, Move, Pencil, Plus, Receipt, LocateFixed, Search, Sparkles, Store, Trash2, ZoomIn, ZoomOut, Users, Wallet,
} from 'lucide-react';
import { AsyncButton, Badge, EmptyState, ErrorBox, KpiRow, Loading, Modal, NumberInput, PageHead, notify } from '../components/ui';
import { SelectPicker, confirmar } from '../components/pickers';
import { EscolherProdutos, type ProdutoVenda } from '../components/EscolherProdutos';
import { api } from '../lib/api';
import { reload, useCollection, useResource, type Row } from '../lib/data';
import { brl, isoFromToday, isoToday, num } from '../lib/format';
import { useSession, type Config } from '../lib/session';

/* ---------------- tipos e dados comuns ---------------- */
interface Caixa {
  id: string; nome: string; status: 'Aberto' | 'Fechado'; abertoEm: string; abertoPorNome: string; valorInicial: number; observacao?: string;
  vendas: Record<string, number>; totalVendas: number; qtdVendas: number;
  movimentos: { id: string; tipo: 'Sangria' | 'Suprimento'; valor: number; motivo: string; em: string; por: string }[];
  fechadoEm?: string; fechadoPorNome?: string;
  fechamento?: { esperado: Record<string, number>; contado: Record<string, number>; totalEsperado: number; totalContado: number; diferenca: number; observacao: string; comandasAbertas: number };
}
interface Item { produtoId: string; nome: string; quantidade: number; preco: number; total: number; pontos?: number }
interface Comanda {
  id: string; numero: number; nome: string; mesa: number | null; clienteId: number | null; clienteUid: string | null; clienteNome: string | null;
  pessoas: number; observacao: string; itens: Item[]; total: number; status: 'Aberta' | 'Fechada' | 'Cancelada';
  abertaEm: string; abertaPorNome: string; fechadaEm?: string; formaPagamento?: string;
}
interface Mesa { id: string; numero: number; nome: string; ambiente: string; lugares: number; formato: string; status: string; x?: number; y?: number }
type Produto = ProdutoVenda;
interface ClienteLite { id: string; numero: number; nome: string; email: string; telefone: string; pontos: number }

const FORMAS = ['Pix', 'Crédito', 'Débito', 'Dinheiro', 'Vale-refeição'];
export const numComanda = (n: number) => `#${String(n).padStart(3, '0')}`;
const hora = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const quando = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const desde = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

/** Caixa aberto agora (todas as telas de venda dependem dele). */
export function useCaixa() {
  const r = useResource<{ aberto: Caixa | null; formas: string[] }>('/crm/caixa');
  return { caixa: r.data?.aberto ?? null, carregado: r.data !== null && r.data !== undefined, erro: r.error };
}
const recarregarVendas = () => Promise.all([reload('/crm/caixa'), reload('/crm/clientes')]);

/** Aviso de caixa no topo das telas de venda. */
export function AvisoCaixa() {
  const { caixa, carregado } = useCaixa();
  const navigate = useNavigate();
  const { pode } = useSession();
  if (!carregado) return null;
  return caixa ? (
    <div className="caixa-aviso caixa-aviso--aberto">
      <LockOpen size={16} /> <span>Caixa aberto desde {quando(caixa.abertoEm)} por {caixa.abertoPorNome} · {num(caixa.qtdVendas)} vendas · {brl(caixa.totalVendas)}</span>
    </div>
  ) : (
    <div className="caixa-aviso caixa-aviso--fechado">
      <Lock size={16} /> <span>O caixa está fechado: as vendas só podem ser lançadas com o caixa aberto.</span>
      {pode('caixas', 'ver') && <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate('/atendimento/caixa')}>Ir para o caixa</button>}
    </div>
  );
}

/* ================================================================ CAIXA */
export function CaixaPage() {
  const { pode } = useSession();
  const { caixa, carregado, erro } = useCaixa();
  const historico = useCollection('caixas', pode('caixas', 'ver'), isoFromToday(-90));
  const comandas = useCollection('comandas', pode('comandas', 'ver'), isoFromToday(-30));
  const [valorInicial, setValorInicial] = useState<number | ''>('');
  const [obs, setObs] = useState('');
  const [vendo, setVendo] = useState<Caixa | null>(null);

  const abrir = async () => {
    await api('/crm/caixa/abrir', { method: 'POST', body: { valorInicial: Number(valorInicial || 0), observacao: obs } });
    await Promise.all([reload('/crm/caixa'), historico.reload()]);
    setValorInicial(''); setObs('');
    notify('Caixa aberto. Bom serviço!');
  };
  const fechados = (historico.rows as unknown as Caixa[]).filter((c) => c.status === 'Fechado').sort((a, b) => String(b.abertoEm).localeCompare(String(a.abertoEm)));
  const abertas = (comandas.rows as unknown as Comanda[]).filter((c) => c.status === 'Aberta');

  return (
    <div className="page">
      <PageHead title="Caixa" description="Abertura e fechamento do caixa. Toda venda (Lançar consumo e Comandas) entra no caixa aberto, separada por forma de pagamento." />
      {erro && <ErrorBox>{erro}</ErrorBox>}
      {!carregado ? <Loading /> : caixa ? (
        <CaixaAberto caixa={caixa} comandasAbertas={abertas.length} onFechado={() => historico.reload()} />
      ) : (
        <section className="panel caixa-abrir">
          <header className="caixa-abrir__head">
            <span className="caixa-abrir__icone"><Lock size={22} /></span>
            <div>
              <span className="caixa-abrir__kicker">Caixa fechado</span>
              <h2 className="caixa-abrir__titulo">Abrir o caixa</h2>
              <p className="muted small">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
          </header>
          {pode('caixas', 'criar') ? (
            <div className="caixa-abrir__corpo caixa-abrir__grade">
              <div className="caixa-abrir__form">
                <label className="caixa-abrir__label" htmlFor="cx-ini">Troco inicial na gaveta</label>
                <div className="caixa-abrir__valor">
                  <NumberInput id="cx-ini" spec={{ money: true, decimals: 2, min: 0, max: 100000 }} prefix="R$" value={valorInicial} onChange={setValorInicial} />
                </div>
                <div className="caixa-abrir__atalhos" role="group" aria-label="Valores rápidos">
                  {[0, 50, 100, 200].map((v) => (
                    <button key={v} type="button" className={`chip${valorInicial === v ? ' is-on' : ''}`} onClick={() => setValorInicial(v)}>{v ? brl(v) : 'Sem troco'}</button>
                  ))}
                </div>
                <p className="muted small">Conte as notas e moedas antes de abrir. Esse valor entra no esperado em dinheiro do fechamento.</p>

                <label className="field-label" htmlFor="cx-obs">Observação (opcional)</label>
                <input id="cx-obs" className="input" maxLength={300} placeholder="Ex.: troco conferido com o gerente" value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>

              <aside className="caixa-abrir__lado">
                <div className="caixa-abrir__resumo">
                  <span className="muted small">Você vai abrir com</span>
                  <strong>{brl(Number(valorInicial || 0))}</strong>
                  <span className="muted small">em dinheiro na gaveta</span>
                </div>
                {fechados[0] && (
                  <div className="caixa-abrir__ultimo">
                    <span className="muted small">Último caixa</span>
                    <span>Fechado {quando(fechados[0].fechadoEm)} por {fechados[0].fechadoPorNome} · {brl(fechados[0].totalVendas || 0)}</span>
                    <Diferenca v={fechados[0].fechamento?.diferenca ?? 0} />
                  </div>
                )}
                <AsyncButton className="btn btn--primary btn--lg" onClick={abrir}><LockOpen size={18} /> Abrir caixa</AsyncButton>
              </aside>
            </div>
          ) : <p className="muted caixa-abrir__corpo">Peça a quem cuida do caixa para abri-lo.</p>}
        </section>
      )}

      {pode('caixas', 'ver') && (
        <section className="panel">
          <div className="panel__head"><h2>Caixas anteriores (90 dias)</h2></div>
          {historico.loading ? <Loading /> : !fechados.length ? <p className="muted pad">Nenhum caixa fechado ainda.</p> : (
            <div className="table-wrap">
              <table className="table table--cards">
                <thead><tr><th>Abertura</th><th>Fechamento</th><th className="num">Vendas</th><th className="num">Qtd.</th><th className="num">Diferença</th><th /></tr></thead>
                <tbody>
                  {fechados.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Abertura">{quando(c.abertoEm)}<div className="muted small">{c.abertoPorNome}</div></td>
                      <td data-label="Fechamento">{quando(c.fechadoEm)}<div className="muted small">{c.fechadoPorNome}</div></td>
                      <td data-label="Vendas" className="num">{brl(c.totalVendas || 0)}</td>
                      <td data-label="Qtd." className="num">{num(c.qtdVendas || 0)}</td>
                      <td data-label="Diferença" className="num"><Diferenca v={c.fechamento?.diferenca ?? 0} /></td>
                      <td className="actions-col"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setVendo(c)}>Detalhes</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {vendo && <DetalheCaixa caixa={vendo} onClose={() => setVendo(null)} />}
    </div>
  );
}

function Diferenca({ v }: { v: number }) {
  if (Math.abs(v) < 0.005) return <Badge tone="good">Sem diferença</Badge>;
  return <Badge tone={v > 0 ? 'info' : 'bad'}>{v > 0 ? 'Sobra ' : 'Falta '}{brl(Math.abs(v))}</Badge>;
}

function esperadoDe(c: Caixa) {
  const e: Record<string, number> = Object.fromEntries(FORMAS.map((f) => [f, Number(c.vendas?.[f]) || 0]));
  for (const [f, v] of Object.entries(c.vendas ?? {})) if (!(f in e)) e[f] = Number(v) || 0;
  const movs = c.movimentos ?? [];
  e.Dinheiro += (Number(c.valorInicial) || 0) + movs.reduce((s, m) => s + (m.tipo === 'Suprimento' ? m.valor : -m.valor), 0);
  return e;
}

function CaixaAberto({ caixa, comandasAbertas, onFechado }: { caixa: Caixa; comandasAbertas: number; onFechado: () => void }) {
  const { pode } = useSession();
  const podeMexer = pode('caixas', 'editar');
  const esperado = esperadoDe(caixa);
  const [contado, setContado] = useState<Record<string, number | ''>>({});
  const [mov, setMov] = useState<{ tipo: 'Sangria' | 'Suprimento'; valor: number | ''; motivo: string }>({ tipo: 'Sangria', valor: '', motivo: '' });
  const [editMov, setEditMov] = useState<{ id: string; tipo: 'Sangria' | 'Suprimento'; valor: number | ''; motivo: string } | null>(null);
  const [obs, setObs] = useState('');
  const totalEsperado = Object.values(esperado).reduce((s, v) => s + v, 0);
  const totalContado = Object.keys(esperado).reduce((s, f) => s + (Number(contado[f]) || 0), 0);
  const preenchido = Object.keys(esperado).every((f) => contado[f] !== undefined && contado[f] !== '');
  const sangrias = (caixa.movimentos ?? []).filter((m) => m.tipo === 'Sangria').reduce((s, m) => s + m.valor, 0);
  const suprimentos = (caixa.movimentos ?? []).filter((m) => m.tipo === 'Suprimento').reduce((s, m) => s + m.valor, 0);

  const movimentar = async () => {
    await api(`/crm/caixa/${caixa.id}/movimento`, { method: 'POST', body: { ...mov, valor: Number(mov.valor || 0) } });
    await reload('/crm/caixa');
    setMov({ tipo: mov.tipo, valor: '', motivo: '' });
    notify(`${mov.tipo} registrada.`);
  };
  const salvarMov = async () => {
    if (!editMov) return;
    await api(`/crm/caixa/${caixa.id}/movimento/${editMov.id}`, { method: 'PATCH', body: { tipo: editMov.tipo, valor: Number(editMov.valor || 0), motivo: editMov.motivo } });
    await reload('/crm/caixa');
    setEditMov(null);
    notify('Movimentação atualizada.');
  };
  const excluirMov = async (m: Caixa['movimentos'][number]) => {
    await api(`/crm/caixa/${caixa.id}/movimento/${m.id}`, { method: 'DELETE' });
    await reload('/crm/caixa');
    notify(`${m.tipo === 'Sangria' ? 'Sangria excluída' : 'Suprimento excluído'}.`);
  };
  const fechar = async () => {
    const r = await api<{ fechamento: Caixa['fechamento'] }>(`/crm/caixa/${caixa.id}/fechar`, { method: 'POST', body: { contado, observacao: obs } });
    await reload('/crm/caixa');
    onFechado();
    const d = r.fechamento?.diferenca ?? 0;
    notify(Math.abs(d) < 0.005 ? 'Caixa fechado sem diferença.' : `Caixa fechado com ${d > 0 ? 'sobra' : 'falta'} de ${brl(Math.abs(d))}.`, Math.abs(d) < 0.005 ? 'ok' : 'error');
  };

  return (
    <>
      <KpiRow items={[
        { label: 'Aberto desde', value: quando(caixa.abertoEm), hint: caixa.abertoPorNome },
        { label: 'Troco inicial', value: brl(caixa.valorInicial || 0) },
        { label: 'Vendas', value: brl(caixa.totalVendas || 0), hint: `${num(caixa.qtdVendas || 0)} lançamentos`, tone: 'good' },
        { label: 'Sangrias / suprimentos', value: `${brl(sangrias)} / ${brl(suprimentos)}` },
        { label: 'Comandas abertas', value: num(comandasAbertas), tone: comandasAbertas ? 'warn' : undefined },
      ]} />
      <div className="grid-2">
        <section className="panel pad-lg">
          <h2 className="panel-title"><Wallet size={18} /> Vendas por forma de pagamento</h2>
          <table className="table caixa-formas">
            <thead><tr><th>Forma</th><th className="num">Vendas</th><th className="num">Esperado no fechamento</th></tr></thead>
            <tbody>
              {Object.keys(esperado).map((f) => (
                <tr key={f}><td>{f}</td><td className="num">{brl(Number(caixa.vendas?.[f]) || 0)}</td><td className="num">{brl(esperado[f])}</td></tr>
              ))}
              <tr className="caixa-formas__total"><td>Total</td><td className="num">{brl(caixa.totalVendas || 0)}</td><td className="num">{brl(totalEsperado)}</td></tr>
            </tbody>
          </table>
          <p className="muted small">No dinheiro, o esperado soma o troco inicial e os suprimentos e desconta as sangrias.</p>

          <h2 className="panel-title" style={{ marginTop: 18 }}>Sangrias e suprimentos</h2>
          {!(caixa.movimentos ?? []).length ? <p className="muted small">Nenhuma movimentação.</p> : (
            <ul className="caixa-movs">
              {caixa.movimentos.map((m) => (
                <li key={m.id}>
                  {m.tipo === 'Sangria' ? <ArrowUpCircle size={16} className="text-bad" /> : <ArrowDownCircle size={16} className="text-good" />}
                  <span><b>{m.tipo}</b> · {hora(m.em)} · {m.por}{m.motivo ? ` · ${m.motivo}` : ''}</span>
                  <strong>{m.tipo === 'Sangria' ? '−' : '+'}{brl(m.valor)}</strong>
                  {podeMexer && (
                    <span className="caixa-movs__acoes">
                      <button type="button" className="icon-btn" onClick={() => setEditMov({ id: m.id, tipo: m.tipo, valor: m.valor, motivo: m.motivo })} aria-label={`Editar ${m.tipo.toLowerCase()} de ${brl(m.valor)}`}><Pencil size={14} /></button>
                      <AsyncButton className="icon-btn" onClick={() => excluirMov(m)} confirm={{ title: `Excluir ${m.tipo === 'Sangria' ? 'a sangria' : 'o suprimento'}?`, message: `${brl(m.valor)}${m.motivo ? ` · ${m.motivo}` : ''}. O esperado no dinheiro é recalculado.`, confirmLabel: 'Excluir', danger: true }}><Trash2 size={14} /></AsyncButton>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {podeMexer && (
            <div className="caixa-mov-form">
              <div className="segmented" role="radiogroup" aria-label="Tipo de movimentação">
                {(['Sangria', 'Suprimento'] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={mov.tipo === t} className={mov.tipo === t ? 'is-active' : ''} onClick={() => setMov({ ...mov, tipo: t })}>{t}</button>
                ))}
              </div>
              <NumberInput spec={{ money: true, decimals: 2, min: 0.01, max: 100000 }} prefix="R$" ariaLabel="Valor da movimentação" value={mov.valor} onChange={(v) => setMov({ ...mov, valor: v })} />
              <input className="input" placeholder={mov.tipo === 'Sangria' ? 'Motivo (ex.: pagamento de gelo)' : 'Motivo (opcional)'} maxLength={200} value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} aria-label="Motivo" />
              <AsyncButton className="btn btn--ghost" onClick={movimentar} disabled={!mov.valor}>Registrar</AsyncButton>
            </div>
          )}
        </section>

        {editMov && (
          <Modal title={`Editar ${editMov.tipo === 'Sangria' ? 'sangria' : 'suprimento'}`} width={460} onClose={() => setEditMov(null)}
            footer={<>
              <button type="button" className="btn btn--ghost" onClick={() => setEditMov(null)}>Cancelar</button>
              <AsyncButton className="btn btn--primary" onClick={salvarMov} disabled={!editMov.valor || (editMov.tipo === 'Sangria' && !editMov.motivo.trim())}>Salvar</AsyncButton>
            </>}>
            <div className="caixa-mov-edit">
              <div className="segmented" role="radiogroup" aria-label="Tipo de movimentação">
                {(['Sangria', 'Suprimento'] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={editMov.tipo === t} className={editMov.tipo === t ? 'is-active' : ''} onClick={() => setEditMov({ ...editMov, tipo: t })}>{t}</button>
                ))}
              </div>
              <label className="field-label" htmlFor="mov-valor">Valor</label>
              <NumberInput id="mov-valor" spec={{ money: true, decimals: 2, min: 0.01, max: 100000 }} prefix="R$" value={editMov.valor} onChange={(v) => setEditMov({ ...editMov, valor: v })} />
              <label className="field-label" htmlFor="mov-motivo">Motivo{editMov.tipo === 'Suprimento' ? ' (opcional)' : ''}</label>
              <input id="mov-motivo" className="input" maxLength={200} value={editMov.motivo} onChange={(e) => setEditMov({ ...editMov, motivo: e.target.value })} />
              <p className="muted small">Só dá para mudar enquanto o caixa estiver aberto.</p>
            </div>
          </Modal>
        )}

        {podeMexer && (
          <section className="panel caixa-abrir caixa-fechar">
            <header className="caixa-abrir__head">
              <span className="caixa-abrir__icone caixa-fechar__icone"><Lock size={22} /></span>
              <div>
                <span className="caixa-abrir__kicker caixa-fechar__kicker">Fechamento</span>
                <h2 className="caixa-abrir__titulo">Fechar o caixa</h2>
                <p className="muted small">Aberto há {desde(caixa.abertoEm)} por {caixa.abertoPorNome}</p>
              </div>
            </header>
            <div className="caixa-abrir__corpo">
              <p className="muted small">Conte o que há em cada forma (gaveta, extrato do Pix e relatório da maquininha) e informe abaixo.</p>
              {comandasAbertas > 0 && <p className="caixa-alerta">Há {comandasAbertas} {comandasAbertas === 1 ? 'comanda aberta' : 'comandas abertas'}. Elas continuam abertas e entram no próximo caixa quando forem fechadas.</p>}
              <div className="caixa-contagem">
                {Object.keys(esperado).map((f) => {
                  const dif = contado[f] === '' || contado[f] === undefined ? null : (Number(contado[f]) || 0) - esperado[f];
                  return (
                    <div key={f} className={`caixa-contagem__linha${dif === null ? '' : ' is-contado'}`}>
                      <label htmlFor={`cnt-${f}`}>{f}<small>esperado {brl(esperado[f])}</small></label>
                      <NumberInput id={`cnt-${f}`} spec={{ money: true, decimals: 2, min: 0, max: 1000000 }} prefix="R$" value={contado[f] ?? ''} onChange={(v) => setContado({ ...contado, [f]: v })} />
                      <span className="caixa-contagem__dif">{dif === null ? <span className="muted small">a contar</span> : <Diferenca v={dif} />}</span>
                    </div>
                  );
                })}
              </div>
              <div className="caixa-resumo">
                <div><span>Esperado</span><strong>{brl(totalEsperado)}</strong></div>
                <div><span>Contado</span><strong>{brl(totalContado)}</strong></div>
                <div className={!preenchido ? '' : Math.abs(totalContado - totalEsperado) < 0.005 ? 'is-good' : totalContado > totalEsperado ? 'is-info' : 'is-bad'}>
                  <span>Diferença</span>
                  <strong>{preenchido ? brl(totalContado - totalEsperado) : '—'}</strong>
                </div>
              </div>
              {!preenchido && <p className="muted small">{Object.keys(esperado).filter((f) => contado[f] !== undefined && contado[f] !== '').length} de {Object.keys(esperado).length} formas contadas. Preencha todas (use 0 se não houver) para fechar.</p>}
              <label className="field-label" htmlFor="cx-fobs">Observação do fechamento (opcional)</label>
              <input id="cx-fobs" className="input" maxLength={300} placeholder="Ex.: falta explicada por troco errado" value={obs} onChange={(e) => setObs(e.target.value)} />
              <AsyncButton className="btn btn--primary btn--lg" onClick={fechar} disabled={!preenchido}
                confirm={{ title: 'Fechar o caixa?', message: `Diferença: ${brl(totalContado - totalEsperado)}. Depois de fechado, as vendas só voltam a ser lançadas com um novo caixa.`, confirmLabel: 'Fechar caixa' }}>
                <Lock size={18} /> Fechar caixa
              </AsyncButton>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function DetalheCaixa({ caixa, onClose }: { caixa: Caixa; onClose: () => void }) {
  const f = caixa.fechamento;
  return (
    <Modal title={`${caixa.nome}`} onClose={onClose}>
      <p className="muted small">Aberto em {quando(caixa.abertoEm)} por {caixa.abertoPorNome} · fechado em {quando(caixa.fechadoEm)} por {caixa.fechadoPorNome}. Troco inicial {brl(caixa.valorInicial || 0)}.</p>
      {f && (
        <table className="table caixa-formas">
          <thead><tr><th>Forma</th><th className="num">Esperado</th><th className="num">Contado</th><th className="num">Diferença</th></tr></thead>
          <tbody>
            {Object.keys(f.esperado).map((k) => (
              <tr key={k}><td>{k}</td><td className="num">{brl(f.esperado[k])}</td><td className="num">{brl(f.contado[k] ?? 0)}</td><td className="num"><Diferenca v={(f.contado[k] ?? 0) - f.esperado[k]} /></td></tr>
            ))}
            <tr className="caixa-formas__total"><td>Total</td><td className="num">{brl(f.totalEsperado)}</td><td className="num">{brl(f.totalContado)}</td><td className="num"><Diferenca v={f.diferenca} /></td></tr>
          </tbody>
        </table>
      )}
      {(caixa.movimentos ?? []).length > 0 && (
        <ul className="caixa-movs">
          {caixa.movimentos.map((m) => <li key={m.id}><span><b>{m.tipo}</b> · {quando(m.em)} · {m.por}{m.motivo ? ` · ${m.motivo}` : ''}</span><strong>{brl(m.valor)}</strong></li>)}
        </ul>
      )}
      {f?.observacao && <p className="small">Observação: {f.observacao}</p>}
    </Modal>
  );
}

/* ================================================================ COMANDAS */
type VisaoComanda = 'cartoes' | 'lista' | 'mesas';
function useLembrada<T extends string>(chave: string, inicial: T, validas: T[]) {
  const k = `dindo-crm:visao:${chave}`;
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(k) as T | null; return s && validas.includes(s) ? s : inicial; } catch { return inicial; } });
  return [v, (n: T) => { setV(n); try { localStorage.setItem(k, n); } catch { /* sem armazenamento */ } }] as const;
}
export function Segmentos<T extends string>({ opcoes, valor, onChange, rotulo }: { opcoes: { v: T; label: string; icon: typeof List }[]; valor: T; onChange: (v: T) => void; rotulo: string }) {
  return (
    <div className="segmented visao-seletor" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(({ v, label, icon: Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={valor === v} className={valor === v ? 'is-active' : ''} onClick={() => onChange(v)} title={label}><Icon size={15} /> <span>{label}</span></button>
      ))}
    </div>
  );
}

export function ComandasPage() {
  const { pode } = useSession();
  const col = useCollection('comandas', true, isoFromToday(-30));
  const mesas = useCollection('mesas', pode('mesas', 'ver'));
  const [params, setParams] = useSearchParams();
  const [visao, setVisao] = useLembrada<VisaoComanda>('comandas', 'cartoes', ['cartoes', 'lista', 'mesas']);
  const [status, setStatus] = useState('Aberta');
  const [q, setQ] = useState('');
  const [nova, setNova] = useState<{ mesa?: number } | null>(null);
  const abertaId = params.get('c');
  // várias pessoas lançam ao mesmo tempo: a lista se atualiza sozinha
  useEffect(() => { const t = setInterval(() => document.visibilityState === 'visible' && col.reload(), 15000); return () => clearInterval(t); }, [col.reload]);
  useEffect(() => { if (params.get('nova') !== null) { setNova({ mesa: Number(params.get('mesa')) || undefined }); setParams({}, { replace: true }); } }, [params, setParams]);

  const todas = col.rows as unknown as Comanda[];
  const hoje = isoToday();
  const abertas = todas.filter((c) => c.status === 'Aberta');
  const fechadasHoje = todas.filter((c) => c.status === 'Fechada' && String(c.fechadaEm).slice(0, 10) === hoje);
  const t = q.trim().toLowerCase().replace('#', '');
  const lista = todas
    .filter((c) => (!status || c.status === status) && (!t || `${c.numero} ${String(c.numero).padStart(3, '0')} ${c.nome} ${c.mesa ?? ''} ${c.clienteId ?? ''}`.toLowerCase().includes(t)))
    .sort((a, b) => (a.status === 'Aberta' && b.status === 'Aberta' ? a.numero - b.numero : String(b.abertaEm).localeCompare(String(a.abertaEm))));
  const abrir = (c: Comanda) => setParams({ c: c.id });
  const aberta = todas.find((c) => c.id === abertaId) ?? null;

  return (
    <div className="page">
      <PageHead title="Comandas" description="Uma comanda por afilhado (ou avulsa, por nome e mesa). Lance os pedidos ao longo da noite e feche no caixa; o afilhado acompanha a dele pelo aplicativo."
        actions={pode('comandas', 'criar') && <button type="button" className="btn btn--primary" onClick={() => setNova({})}><Plus size={16} /> Abrir comanda</button>} />
      <AvisoCaixa />
      <KpiRow items={[
        { label: 'Comandas abertas', value: num(abertas.length) },
        { label: 'Em aberto (a receber)', value: brl(abertas.reduce((s, c) => s + (c.total || 0), 0)), tone: 'warn' },
        { label: 'Fechadas hoje', value: num(fechadasHoje.length) },
        { label: 'Vendido hoje em comandas', value: brl(fechadasHoje.reduce((s, c) => s + (c.total || 0), 0)), tone: 'good' },
        { label: 'Ticket médio hoje', value: brl(fechadasHoje.length ? fechadasHoje.reduce((s, c) => s + (c.total || 0), 0) / fechadasHoje.length : 0) },
      ]} />
      <div className="panel">
        <div className="toolbar">
          <label className="search"><Search size={16} /><input placeholder="Número, nome, mesa ou afilhado" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select className="input input--sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
            <option value="Aberta">Abertas</option><option value="Fechada">Fechadas</option><option value="Cancelada">Canceladas</option><option value="">Todas (30 dias)</option>
          </select>
          <Segmentos rotulo="Forma de visualizar" valor={visao} onChange={setVisao} opcoes={[
            { v: 'cartoes', label: 'Cartões', icon: LayoutGrid }, { v: 'lista', label: 'Lista', icon: List }, { v: 'mesas', label: 'Por mesa', icon: MapIcon },
          ]} />
          <span className="muted toolbar__count">{num(lista.length)} {lista.length === 1 ? 'comanda' : 'comandas'}</span>
        </div>
        {col.loading && !todas.length ? <Loading /> : !lista.length ? (
          <EmptyState title={status === 'Aberta' ? 'Nenhuma comanda aberta' : 'Nenhuma comanda encontrada'}>
            {status === 'Aberta' ? 'Abra uma comanda para o afilhado (ou avulsa) e vá lançando os pedidos.' : 'Ajuste a busca ou o filtro.'}
          </EmptyState>
        ) : visao === 'lista' ? (
          <div className="table-wrap">
            <table className="table table--cards">
              <thead><tr><th>Comanda</th><th>Cliente</th><th>Mesa</th><th>Aberta</th><th className="num">Itens</th><th className="num">Total</th><th>Situação</th></tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="linha-clicavel" onClick={() => abrir(c)}>
                    <td data-label="Comanda"><strong>{numComanda(c.numero)}</strong></td>
                    <td data-label="Cliente">{c.nome}{c.clienteId ? <span className="muted small"> · afilhado {numComanda(c.clienteId)}</span> : null}</td>
                    <td data-label="Mesa">{c.mesa ?? '—'}</td>
                    <td data-label="Aberta">{quando(c.abertaEm)}</td>
                    <td data-label="Itens" className="num">{num(c.itens.reduce((s, i) => s + i.quantidade, 0))}</td>
                    <td data-label="Total" className="num">{brl(c.total || 0)}</td>
                    <td data-label="Situação"><StatusComanda c={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : visao === 'mesas' ? (
          <div className="comandas-por-mesa">
            {[...new Set(lista.map((c) => c.mesa ?? 0))].sort((a, b) => (a || 9999) - (b || 9999)).map((m) => {
              const daMesa = lista.filter((c) => (c.mesa ?? 0) === m);
              const info = (mesas.rows as unknown as Mesa[]).find((x) => x.numero === m);
              return (
                <section key={m} className="comandas-mesa">
                  <header><strong>{m ? `Mesa ${m}` : 'Sem mesa (balcão)'}</strong>{info && <span className="muted small">{info.ambiente} · {info.lugares} lugares</span>}<b>{brl(daMesa.reduce((s, c) => s + (c.total || 0), 0))}</b></header>
                  <div className="comandas-grid">{daMesa.map((c) => <CartaoComanda key={c.id} c={c} onClick={() => abrir(c)} />)}</div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="comandas-grid pad">{lista.map((c) => <CartaoComanda key={c.id} c={c} onClick={() => abrir(c)} />)}</div>
        )}
      </div>
      {nova && <NovaComanda mesaInicial={nova.mesa} mesas={mesas.rows as unknown as Mesa[]} onClose={() => setNova(null)} onCriada={async (c) => { setNova(null); await col.reload(); abrir(c); }} />}
      {aberta && <DetalheComanda c={aberta} mesas={mesas.rows as unknown as Mesa[]} onClose={() => setParams({})} onMudou={() => col.reload()} />}
    </div>
  );
}

function StatusComanda({ c }: { c: Comanda }) {
  return <Badge tone={c.status === 'Aberta' ? 'warn' : c.status === 'Fechada' ? 'good' : 'neutral'}>{c.status}{c.status === 'Fechada' && c.formaPagamento ? ` · ${c.formaPagamento}` : ''}</Badge>;
}

function CartaoComanda({ c, onClick }: { c: Comanda; onClick: () => void }) {
  const itens = c.itens.reduce((s, i) => s + i.quantidade, 0);
  return (
    <button type="button" className={`comanda-card comanda-card--${c.status.toLowerCase()}`} onClick={onClick}>
      <span className="comanda-card__topo"><b>{numComanda(c.numero)}</b>{c.mesa ? <span className="comanda-card__mesa">Mesa {c.mesa}</span> : <span className="muted small">Balcão</span>}</span>
      <strong className="comanda-card__nome">{c.nome}</strong>
      <span className="muted small">{c.clienteId ? `Afilhado ${numComanda(c.clienteId)} · ` : ''}{c.status === 'Aberta' ? `aberta há ${desde(c.abertaEm)}` : quando(c.fechadaEm ?? c.abertaEm)}</span>
      <span className="comanda-card__rodape"><span>{num(itens)} {itens === 1 ? 'item' : 'itens'}</span><b>{brl(c.total || 0)}</b></span>
      {c.status !== 'Aberta' && <StatusComanda c={c} />}
    </button>
  );
}

function NovaComanda({ mesaInicial, mesas, onClose, onCriada }: { mesaInicial?: number; mesas: Mesa[]; onClose: () => void; onCriada: (c: Comanda) => void }) {
  const clientes = useResource<ClienteLite[]>('/crm/clientes').data ?? [];
  const [tipo, setTipo] = useState<'afilhado' | 'avulsa'>('afilhado');
  const [busca, setBusca] = useState('');
  const [cliente, setCliente] = useState<ClienteLite | null>(null);
  const [nome, setNome] = useState('');
  const [mesa, setMesa] = useState(mesaInicial ? String(mesaInicial) : '');
  const [pessoas, setPessoas] = useState<number | ''>(1);
  const t = busca.trim().toLowerCase().replace('#', '');
  const sugestoes = t ? clientes.filter((c) => `${String(c.numero).padStart(3, '0')} ${c.nome} ${c.email} ${c.telefone}`.toLowerCase().includes(t)).slice(0, 6) : [];
  const ativas = mesas.filter((m) => m.status !== 'Inativa').sort((a, b) => a.numero - b.numero);
  const criar = async () => {
    const c = await api<Comanda>('/crm/comandas', { method: 'POST', body: { clienteId: tipo === 'afilhado' ? cliente?.numero : undefined, nome: tipo === 'avulsa' ? nome : undefined, mesa: mesa ? Number(mesa) : null, pessoas: Number(pessoas || 1) } });
    notify(`Comanda ${numComanda(c.numero)} aberta.`);
    onCriada(c);
  };
  return (
    <Modal title="Abrir comanda" onClose={onClose} width={560}
      footer={<><button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button><AsyncButton className="btn btn--primary" onClick={criar} disabled={tipo === 'afilhado' ? !cliente : !nome.trim() && !mesa}><Receipt size={16} /> Abrir comanda</AsyncButton></>}>
      <div className="form-grid">
        <div className="form-field--wide">
          <Segmentos rotulo="Tipo de comanda" valor={tipo} onChange={setTipo} opcoes={[{ v: 'afilhado', label: 'Afilhado', icon: Users }, { v: 'avulsa', label: 'Avulsa', icon: Receipt }]} />
        </div>
        {tipo === 'afilhado' ? (
          <div className="form-field--wide">
            <label className="field-label" htmlFor="nc-busca">Afilhado</label>
            {cliente ? (
              <div className="selected-client"><div><strong>{cliente.nome}</strong> <span className="muted">{numComanda(cliente.numero)}</span><div className="muted small">{num(cliente.pontos)} pontos</div></div>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCliente(null)}>Trocar</button></div>
            ) : (
              <div className="autocomplete">
                <label className="search"><Search size={16} /><input id="nc-busca" autoFocus placeholder="Número do afilhado, nome, e-mail ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
                {sugestoes.length > 0 && (
                  <ul className="autocomplete__list">{sugestoes.map((c) => <li key={c.id}><button type="button" onClick={() => { setCliente(c); setBusca(''); }}><strong>{numComanda(c.numero)}</strong> {c.nome} <span className="muted small">{c.email}</span></button></li>)}</ul>
                )}
                {t && !sugestoes.length && <p className="muted small">Nenhum afilhado encontrado. Use uma comanda avulsa.</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="form-field--wide">
            <label className="field-label" htmlFor="nc-nome">Nome na comanda</label>
            <input id="nc-nome" className="input" autoFocus maxLength={80} placeholder="Ex.: João (camisa azul)" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="nc-mesa">Mesa</label>
          {ativas.length ? (
            <SelectPicker id="nc-mesa" placeholder="Sem mesa (balcão)" options={[{ value: '', label: 'Sem mesa (balcão)' }, ...ativas.map((m) => ({ value: String(m.numero), label: `Mesa ${m.numero}${m.ambiente ? ` · ${m.ambiente}` : ''}` }))]} value={mesa} onChange={setMesa} />
          ) : <input id="nc-mesa" className="input" inputMode="numeric" placeholder="Número da mesa" value={mesa} onChange={(e) => setMesa(e.target.value.replace(/\D/g, '').slice(0, 3))} />}
        </div>
        <div>
          <label className="field-label" htmlFor="nc-pes">Pessoas</label>
          <NumberInput id="nc-pes" spec={{ decimals: 0, min: 1, max: 50 }} value={pessoas} onChange={setPessoas} />
        </div>
      </div>
    </Modal>
  );
}

function DetalheComanda({ c, mesas, onClose, onMudou }: { c: Comanda; mesas: Mesa[]; onClose: () => void; onMudou: () => void }) {
  const { pode } = useSession();
  const { caixa } = useCaixa();
  const editavel = c.status === 'Aberta' && pode('comandas', 'editar');
  const produtos = useResource<Produto[]>(editavel ? '/crm/produtos-venda' : null).data ?? [];
  const [itens, setItens] = useState<Item[]>(c.itens);
  const [forma, setForma] = useState('Pix');
  const [salvando, setSalvando] = useState(false);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => setItens(c.itens), [c.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  // ao fechar, os pontos saem do cadastro atual de cada produto
  const pontos = itens.reduce((s, i) => s + (produtos.find((p) => p.id === i.produtoId)?.pontos ?? (Number(i.pontos) || 0)) * i.quantidade, 0);

  // cada alteração é gravada na hora (em fila, para não atropelar a anterior)
  const gravar = (novos: Item[]) => {
    setItens(novos);
    setSalvando(true);
    fila.current = fila.current.then(() => api(`/crm/comandas/${c.id}`, { method: 'PUT', body: { itens: novos.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })) } }))
      .then(() => { onMudou(); }, (e: Error) => notify(e.message, 'error'))
      .finally(() => setSalvando(false));
  };
  const somar = (p: Produto) => {
    const ja = itens.find((i) => i.produtoId === p.id);
    gravar(ja ? itens.map((i) => (i.produtoId === p.id ? { ...i, quantidade: Math.min(999, i.quantidade + 1), total: i.preco * Math.min(999, i.quantidade + 1) } : i))
      : [...itens, { produtoId: p.id, nome: p.nome, quantidade: 1, preco: p.preco, total: p.preco }]);
  };
  const qtd = (id: string, q: number) => gravar(q <= 0 ? itens.filter((i) => i.produtoId !== id) : itens.map((i) => (i.produtoId === id ? { ...i, quantidade: Math.min(999, q), total: i.preco * Math.min(999, q) } : i)));
  const mudarMesa = async (m: string) => {
    await api(`/crm/comandas/${c.id}`, { method: 'PUT', body: { mesa: m ? Number(m) : null } });
    onMudou();
    notify(m ? `Comanda na mesa ${m}.` : 'Comanda sem mesa (balcão).');
  };
  const fechar = async () => {
    await fila.current;
    await api(`/crm/comandas/${c.id}/fechar`, { method: 'POST', body: { formaPagamento: forma } });
    await recarregarVendas();
    onMudou();
    notify(`Comanda ${numComanda(c.numero)} fechada: ${brl(total)} no ${forma}${c.clienteId ? ` e ${num(pontos)} pontos para o afilhado` : ''}.`);
    onClose();
  };
  const cancelar = async () => {
    await api(`/crm/comandas/${c.id}/cancelar`, { method: 'POST', body: { motivo: itens.length ? 'Cancelada com itens' : 'Aberta por engano' } });
    onMudou();
    notify(`Comanda ${numComanda(c.numero)} cancelada.`);
    onClose();
  };
  const ativas = mesas.filter((m) => m.status !== 'Inativa').sort((a, b) => a.numero - b.numero);

  return (
    <Modal title={`Comanda ${numComanda(c.numero)} · ${c.nome}`} onClose={onClose} width={980}
      footer={editavel ? (
        <div className="comanda-rodape">
          <button type="button" className="btn btn--ghost" onClick={async () => (await confirmar({ title: `Cancelar a comanda ${numComanda(c.numero)}?`, message: 'Nada é cobrado nem lançado no caixa.', confirmLabel: 'Cancelar comanda', danger: true })) && cancelar()}>
            <Ban size={16} /> Cancelar comanda
          </button>
          <span className="comanda-rodape__forma"><SelectPicker id="cmd-forma" options={FORMAS} value={forma} onChange={setForma} /></span>
          <AsyncButton className="btn btn--primary" onClick={fechar} disabled={!itens.length || !caixa || salvando}><Check size={16} /> Fechar {brl(total)}</AsyncButton>
        </div>
      ) : undefined}>
      <div className="comanda-detalhe">
        <div className="comanda-detalhe__info">
          <span>{c.clienteId ? <>Afilhado <b>{numComanda(c.clienteId)}</b></> : 'Comanda avulsa'}</span>
          <span>Aberta {quando(c.abertaEm)} por {c.abertaPorNome}</span>
          <span>{c.pessoas} {c.pessoas === 1 ? 'pessoa' : 'pessoas'}</span>
          {editavel ? (
            <span className="comanda-detalhe__mesa">Mesa
              <select className="input input--sm" value={c.mesa ? String(c.mesa) : ''} onChange={(e) => void mudarMesa(e.target.value)} aria-label="Mesa">
                <option value="">Balcão</option>
                {(ativas.length ? ativas.map((m) => m.numero) : Array.from({ length: 30 }, (_, i) => i + 1)).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </span>
          ) : <span>{c.mesa ? `Mesa ${c.mesa}` : 'Balcão'}</span>}
          <StatusComanda c={c} />
        </div>
        {editavel && !caixa && <AvisoCaixa />}
        <div className={editavel ? 'grid-2 grid-2--wide-left' : ''}>
          {editavel && (
            <section>
              {produtos.length ? <EscolherProdutos produtos={produtos} onEscolher={somar} autoFocus />
                : <p className="muted small">Nenhum produto ativo em Vendas › Produtos e cardápio.</p>}
            </section>
          )}
          <section className="comanda">
            <h3 className="panel-title"><Receipt size={18} /> Pedidos {salvando && <span className="muted small">salvando…</span>}</h3>
            {!itens.length ? <p className="muted">Nenhum pedido lançado ainda.</p> : (
              <ul className="comanda__list">
                {itens.map((i) => (
                  <li key={i.produtoId}>
                    <span className="comanda__name">{i.nome}</span>
                    {editavel ? (
                      <div className="qty">
                        <button type="button" className="icon-btn" onClick={() => qtd(i.produtoId, i.quantidade - 1)} aria-label={`Diminuir ${i.nome}`}><Minus size={14} /></button>
                        <span>{i.quantidade}</span>
                        <button type="button" className="icon-btn" onClick={() => qtd(i.produtoId, i.quantidade + 1)} aria-label={`Aumentar ${i.nome}`}><Plus size={14} /></button>
                      </div>
                    ) : <span>{i.quantidade}×</span>}
                    <strong>{brl(i.preco * i.quantidade)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="comanda__total"><span>Total</span><strong>{brl(total)}</strong></div>
            {c.clienteId && <div className="comanda__points">{num(pontos)} pontos para o afilhado ao fechar</div>}
          </section>
        </div>
      </div>
    </Modal>
  );
}

/* ================================================================ MAPA DE MESAS */
type VisaoMesa = 'mapa' | 'cartoes' | 'lista';
const FORMATOS = ['Quadrada', 'Redonda', 'Retangular', 'Bistrô', 'Balcão'];

export function MesasPage() {
  const { pode } = useSession();
  const navigate = useNavigate();
  const col = useCollection('mesas');
  const comandas = useCollection('comandas', pode('comandas', 'ver'), isoFromToday(-30));
  const reservas = useCollection('reservas', pode('reservas', 'ver'), isoToday());
  const cfg = useResource<Config>('/crm/config').data;
  const [visao, setVisao] = useLembrada<VisaoMesa>('mesas', 'mapa', ['mapa', 'cartoes', 'lista']);
  const [ambiente, setAmbiente] = useState('');
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Partial<Mesa> | null>(null);
  const [vendo, setVendo] = useState<Mesa | null>(null);
  const [gerar, setGerar] = useState(false);
  const podeEditar = pode('mesas', 'editar');
  useEffect(() => { const t = setInterval(() => document.visibilityState === 'visible' && comandas.reload(), 20000); return () => clearInterval(t); }, [comandas.reload]);

  const mesas = (col.rows as unknown as Mesa[]).slice().sort((a, b) => a.numero - b.numero);
  const ambientes = [...new Set([...(cfg?.ambientes ?? []), ...mesas.map((m) => m.ambiente).filter(Boolean)])];
  const visiveis = mesas.filter((m) => !ambiente || m.ambiente === ambiente);
  const abertas = (comandas.rows as unknown as Comanda[]).filter((c) => c.status === 'Aberta');
  const hoje = isoToday();
  const reservasHoje = reservas.rows.filter((r) => r.data === hoje && ['Confirmada', 'Pendente'].includes(String(r.status)) && r.mesa);
  const situacao = (m: Mesa) => {
    const cmds = abertas.filter((c) => c.mesa === m.numero);
    const res = reservasHoje.filter((r) => Number(r.mesa) === m.numero);
    const estado = m.status === 'Inativa' ? 'inativa' : cmds.length ? 'ocupada' : res.length ? 'reservada' : 'livre';
    return { cmds, res, estado, total: cmds.reduce((s, c) => s + (c.total || 0), 0), pessoas: cmds.reduce((s, c) => s + (c.pessoas || 0), 0) };
  };
  const contagem = visiveis.reduce((acc, m) => { const e = situacao(m).estado; acc[e] = (acc[e] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  const salvarPosicao = async (m: Mesa, x: number, y: number) => {
    await col.update(m.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } as Partial<Row>);
  };
  const montar = async () => {
    let criadas = 0;
    for (const d of MESAS_BOULEVARD) {
      const existente = mesas.find((m) => m.numero === d.numero);
      if (existente) await col.update(existente.id, { x: d.x, y: d.y } as Partial<Row>);
      else { await col.add({ ...d, nome: `Mesa ${d.numero}`, ambiente: ambiente || ambientes[0] || 'Boulevard', status: 'Ativa' } as Partial<Row>); criadas++; }
    }
    notify(`${MESAS_BOULEVARD.length} mesas no lugar (${criadas} criadas), a partir da porta do bar.`);
  };
  const botaoMontar = (
    <AsyncButton className={`btn ${mesas.length ? 'btn--ghost' : 'btn--primary'}`} onClick={montar}
      confirm={{ title: 'Montar as mesas do boulevard?', message: `Cria as mesas 1 a ${MESAS_BOULEVARD.length} que faltarem e põe todas no lugar da planta: a 1 em frente à porta do bar e as seguintes pelo corredor até a entrada; as últimas ficam na praça do chafariz. As posições atuais dessas mesas são substituídas.`, confirmLabel: 'Montar' }}>
      <Sparkles size={16} /> Montar mesas do boulevard
    </AsyncButton>
  );

  return (
    <div className="page">
      <PageHead title="Mapa de mesas" description="As mesas do salão numeradas, com a ocupação ao vivo: comandas abertas, reservas do dia e quanto cada mesa já consumiu."
        actions={podeEditar && (
          <div className="row-gap">
            {editando && visao === 'mapa' && pode('mesas', 'criar') && botaoMontar}
            <button type="button" className={`btn ${editando ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setEditando(!editando)}><Move size={16} /> {editando ? 'Concluir edição' : 'Editar mapa'}</button>
            {pode('mesas', 'criar') && <button type="button" className="btn btn--ghost" onClick={() => setForm({ numero: (mesas.at(-1)?.numero ?? 0) + 1, lugares: 4, formato: 'Quadrada', ambiente: ambiente || ambientes[0] || '', status: 'Ativa' })}><Plus size={16} /> Nova mesa</button>}
          </div>
        )} />
      <KpiRow items={[
        { label: 'Mesas', value: num(visiveis.filter((m) => m.status !== 'Inativa').length) },
        { label: 'Livres', value: num(contagem.livre ?? 0), tone: 'good' },
        { label: 'Ocupadas', value: num(contagem.ocupada ?? 0), tone: 'warn' },
        { label: 'Reservadas hoje', value: num(contagem.reservada ?? 0), tone: 'info' },
        { label: 'Consumo em aberto nas mesas', value: brl(visiveis.reduce((s, m) => s + situacao(m).total, 0)) },
      ]} />
      <div className="panel">
        <div className="toolbar">
          <div className="segmented" role="radiogroup" aria-label="Ambiente">
            {['', ...ambientes].map((a) => <button key={a || 'todos'} type="button" role="radio" aria-checked={ambiente === a} className={ambiente === a ? 'is-active' : ''} onClick={() => setAmbiente(a)}>{a || 'Todos'}</button>)}
          </div>
          <Segmentos rotulo="Forma de visualizar" valor={visao} onChange={setVisao} opcoes={[
            { v: 'mapa', label: 'Mapa', icon: MapIcon }, { v: 'cartoes', label: 'Cartões', icon: LayoutGrid }, { v: 'lista', label: 'Lista', icon: List },
          ]} />
          <span className="mapa-legenda">
            <i className="is-livre" /> Livre <i className="is-ocupada" /> Ocupada <i className="is-reservada" /> Reservada <i className="is-inativa" /> Inativa <i className="is-bar" /> Bar do Dindo
          </span>
        </div>
        {col.loading && !mesas.length ? <Loading /> : !mesas.length ? (<>
          <EmptyState title="Nenhuma mesa cadastrada"
            action={pode('mesas', 'criar') && <div className="row-gap">{botaoMontar}<button type="button" className="btn btn--ghost" onClick={() => setGerar(true)}><Plus size={16} /> Criar mesas</button></div>}>
            Crie as mesas do salão (você pode gerar várias de uma vez e depois arrastar cada uma para o lugar certo no mapa).
          </EmptyState>
          {visao === 'mapa' && <MapaSalao mesas={[]} editando={false} situacao={situacao} onMover={salvarPosicao} onClicar={() => undefined} />}
        </>) : visao === 'mapa' ? (
          <MapaSalao mesas={visiveis} editando={editando} situacao={situacao} onMover={salvarPosicao} onClicar={(m) => (editando ? setForm(m) : setVendo(m))} />
        ) : visao === 'cartoes' ? (
          <div className="mesas-grid pad">
            {visiveis.map((m) => {
              const s = situacao(m);
              return (
                <button key={m.id} type="button" className={`mesa-card is-${s.estado}`} onClick={() => (editando ? setForm(m) : setVendo(m))}>
                  <span className="mesa-card__num">{m.numero}</span>
                  <span className="mesa-card__info"><strong>Mesa {m.numero}</strong><small>{m.ambiente || 'Salão'} · {m.lugares} lugares · {m.formato}</small></span>
                  <span className="mesa-card__estado">
                    {s.estado === 'ocupada' ? <>{s.cmds.length} {s.cmds.length === 1 ? 'comanda' : 'comandas'} · <b>{brl(s.total)}</b></> : s.estado === 'reservada' ? `Reservada ${s.res.map((r) => r.hora).join(', ')}` : s.estado === 'inativa' ? 'Inativa' : 'Livre'}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table--cards">
              <thead><tr><th>Mesa</th><th>Ambiente</th><th>Formato</th><th className="num">Lugares</th><th>Situação</th><th>Comandas</th><th className="num">Em aberto</th></tr></thead>
              <tbody>
                {visiveis.map((m) => {
                  const s = situacao(m);
                  return (
                    <tr key={m.id} className="linha-clicavel" onClick={() => (editando ? setForm(m) : setVendo(m))}>
                      <td data-label="Mesa"><strong>{m.numero}</strong></td>
                      <td data-label="Ambiente">{m.ambiente || '—'}</td>
                      <td data-label="Formato">{m.formato}</td>
                      <td data-label="Lugares" className="num">{m.lugares}</td>
                      <td data-label="Situação"><Badge tone={s.estado === 'livre' ? 'good' : s.estado === 'ocupada' ? 'warn' : s.estado === 'reservada' ? 'info' : 'neutral'}>{s.estado[0].toUpperCase() + s.estado.slice(1)}</Badge></td>
                      <td data-label="Comandas">{s.cmds.map((c) => numComanda(c.numero)).join(', ') || '—'}</td>
                      <td data-label="Em aberto" className="num">{s.total ? brl(s.total) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {editando && visao === 'mapa' && <p className="muted small pad">Arraste as mesas para a posição real do salão; arrastando o fundo você anda pelo mapa. Clique numa mesa para mudar número, lugares, formato ou ambiente.</p>}
      </div>
      {gerar && <GerarMesas ambientes={ambientes} inicio={(mesas.at(-1)?.numero ?? 0) + 1} onClose={() => setGerar(false)} onPronto={() => { setGerar(false); col.reload(); setEditando(true); }} />}
      {form && <FormMesa mesa={form} ambientes={ambientes} usados={mesas.filter((m) => m.id !== form.id).map((m) => m.numero)} onClose={() => setForm(null)}
        onSalvar={async (d) => {
          const dados = { ...d, nome: `Mesa ${d.numero}` } as Partial<Row>;
          if (form.id) await col.update(form.id, dados); else await col.add({ ...dados, x: 5 + Math.random() * 80, y: 8 + Math.random() * 75 } as Partial<Row>);
          setForm(null);
          notify(`Mesa ${d.numero} salva.`);
        }}
        onExcluir={form.id ? async () => { await col.remove(form.id!); setForm(null); notify('Mesa excluída.'); } : undefined} />}
      {vendo && (() => {
        const s = situacao(vendo);
        return (
          <Modal title={`Mesa ${vendo.numero}`} onClose={() => setVendo(null)} width={560}
            footer={<>{podeEditar && <button type="button" className="btn btn--ghost" onClick={() => { setForm(vendo); setVendo(null); }}><Pencil size={16} /> Editar mesa</button>}
              {pode('comandas', 'criar') && <button type="button" className="btn btn--primary" onClick={() => navigate(`/atendimento/comandas?nova=1&mesa=${vendo.numero}`)}><Plus size={16} /> Abrir comanda nesta mesa</button>}</>}>
            <p className="muted small">{vendo.ambiente || 'Salão'} · {vendo.lugares} lugares · {vendo.formato}</p>
            {s.res.length > 0 && <p><Badge tone="info">Reservada hoje</Badge> {s.res.map((r) => `${r.hora} · ${r.clienteNome} (${r.pessoas} pessoas)`).join(' | ')}</p>}
            {!s.cmds.length ? <p className="muted">Nenhuma comanda aberta nesta mesa.</p> : (
              <div className="comandas-grid">{s.cmds.map((c) => <CartaoComanda key={c.id} c={c} onClick={() => navigate(`/atendimento/comandas?c=${c.id}`)} />)}</div>
            )}
            {s.cmds.length > 0 && <p className="mesa-total">Total da mesa: <b>{brl(s.total)}</b> · {s.pessoas} {s.pessoas === 1 ? 'pessoa' : 'pessoas'}</p>}
          </Modal>
        );
      })()}
    </div>
  );
}

/** Planta do salão: cada mesa fica na posição (x, y em % da área); no modo edição dá para arrastar. */
function MapaSalao({ mesas, editando, situacao, onMover, onClicar }: {
  mesas: Mesa[]; editando: boolean; situacao: (m: Mesa) => { estado: string; total: number; cmds: Comanda[] };
  onMover: (m: Mesa, x: number, y: number) => Promise<void>; onClicar: (m: Mesa) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<{ id: string; x: number; y: number; moveu: boolean } | null>(null);
  // mesas sem posição (cadastradas antes do mapa) ficam em grade
  const posicao = useMemo(() => {
    const semPos = mesas.filter((m) => typeof m.x !== 'number' || typeof m.y !== 'number');
    return (m: Mesa) => {
      if (arrasto?.id === m.id) return { x: arrasto.x, y: arrasto.y };
      if (typeof m.x === 'number' && typeof m.y === 'number') return { x: m.x, y: m.y };
      const i = semPos.indexOf(m);
      return { x: 6 + (i % 8) * 11.5, y: 10 + Math.floor(i / 8) * 18 };
    };
  }, [mesas, arrasto]);

  const pct = (e: ReactPointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    return { x: Math.min(96, Math.max(2, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(94, Math.max(3, ((e.clientY - r.top) / r.height) * 100)) };
  };

  // andar pelo mapa: arrastar o fundo (ou rolar com o dedo) e aproximar com + / − ou Ctrl + roda do mouse
  const rolagem = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [andando, setAndando] = useState<{ x: number; y: number; l: number; t: number } | null>(null);
  const centro = useRef<{ cx: number; cy: number } | null>(null);
  const mudarZoom = (f: (z: number) => number) => {
    const el = rolagem.current;
    if (el) centro.current = { cx: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth, cy: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight };
    setZoom((z) => Math.min(3, Math.max(1, Math.round(f(z) * 4) / 4)));
  };
  const irParaBar = (suave: boolean) => {
    const el = rolagem.current;
    if (el) el.scrollTo({ left: el.scrollWidth * 0.6 - el.clientWidth / 2, top: 0, behavior: suave ? 'smooth' : 'auto' });
  };
  useLayoutEffect(() => {
    const el = rolagem.current, c = centro.current;
    if (!el || !c) return;
    el.scrollLeft = c.cx * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = c.cy * el.scrollHeight - el.clientHeight / 2;
    centro.current = null;
  }, [zoom]);
  useEffect(() => {
    irParaBar(false); // no celular o mapa é mais largo que a tela: abre na porta do bar
    const el = rolagem.current;
    if (!el) return;
    const roda = (e: WheelEvent) => { if (!e.ctrlKey) return; e.preventDefault(); mudarZoom((z) => z + (e.deltaY < 0 ? 0.25 : -0.25)); };
    el.addEventListener('wheel', roda, { passive: false });
    return () => el.removeEventListener('wheel', roda);
  }, []);

  return (
    <div className="mapa-vista">
    <div className={`mapa-rolagem ${andando ? 'is-andando' : ''}`} ref={rolagem}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse' || (e.target as HTMLElement).closest('.mesa')) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setAndando({ x: e.clientX, y: e.clientY, l: e.currentTarget.scrollLeft, t: e.currentTarget.scrollTop });
      }}
      onPointerMove={(e) => { if (andando) { e.currentTarget.scrollLeft = andando.l - (e.clientX - andando.x); e.currentTarget.scrollTop = andando.t - (e.clientY - andando.y); } }}
      onPointerUp={() => setAndando(null)} onPointerCancel={() => setAndando(null)}>
    <div className={`mapa-salao ${editando ? 'is-editando' : ''}`} ref={area} style={{ '--zoom': zoom } as CSSProperties}>
      <PlantaBoulevard />
      {mesas.map((m) => {
        const p = posicao(m);
        const s = situacao(m);
        const tam = m.formato === 'Balcão' ? 'g' : m.lugares >= 7 ? 'g' : m.lugares >= 5 ? 'm' : 'p';
        return (
          <button key={m.id} type="button" aria-label={`Mesa ${m.numero}, ${s.estado}`}
            className={`mesa mesa--${m.formato.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')} mesa--${tam} is-${s.estado}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onPointerDown={(e) => { if (!editando) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); setArrasto({ id: m.id, ...p, moveu: false }); }}
            onPointerMove={(e) => { if (arrasto?.id === m.id) setArrasto({ id: m.id, ...pct(e), moveu: true }); }}
            onPointerUp={() => {
              if (arrasto?.id !== m.id) return;
              const a = arrasto;
              setArrasto(null);
              if (a.moveu) void onMover(m, a.x, a.y).catch((err: Error) => notify(err.message, 'error'));
              else onClicar(m);
            }}
            onClick={() => { if (!editando) onClicar(m); }}>
            <b>{m.numero}</b>
            <small>{s.estado === 'ocupada' ? brl(s.total) : `${m.lugares} lug.`}</small>
          </button>
        );
      })}
    </div>
    </div>
    <div className="mapa-zoom">
      <button type="button" className="mapa-zoom__btn" onClick={() => mudarZoom((z) => z - 0.5)} disabled={zoom <= 1} aria-label="Afastar" title="Afastar"><ZoomOut size={18} /></button>
      <span className="mapa-zoom__valor">{Math.round(zoom * 100)}%</span>
      <button type="button" className="mapa-zoom__btn" onClick={() => mudarZoom((z) => z + 0.5)} disabled={zoom >= 3} aria-label="Aproximar" title="Aproximar"><ZoomIn size={18} /></button>
      <button type="button" className="mapa-zoom__btn" onClick={() => irParaBar(true)} aria-label="Ir para o bar" title="Ir para o bar"><LocateFixed size={18} /></button>
    </div>
    </div>
  );
}

/**
 * Mesas do boulevard, conforme a planta (estudo de locação L07B) e os vídeos: no mapa a entrada fica à esquerda e a praça do
 * chafariz à direita; o lado de cima é o do bar. Pelo corredor há três faixas: mesas quadradas junto às lojas do lado do bar,
 * quadradas no meio e as compridas com bancos do lado do caminho de pedra. A numeração começa na porta do bar e segue até a
 * entrada; as da praça vêm por último.
 */
const MESAS_BOULEVARD: { numero: number; x: number; y: number; formato: string; lugares: number }[] = (() => {
  const lista: { x: number; y: number; formato: string; lugares: number }[] = [];
  const passos = [60, 51.3, 42.6, 33.9, 25.2, 16.5, 7.8];
  const compridas = [57, 44, 31, 18, 6];
  passos.forEach((x, i) => {
    lista.push({ x, y: 28, formato: 'Quadrada', lugares: 4 }, { x, y: 46, formato: 'Quadrada', lugares: 4 });
    if (compridas[i] !== undefined) lista.push({ x: compridas[i], y: 66, formato: 'Retangular', lugares: 6 });
  });
  lista.push(...[[84, 24], [95, 24], [84, 78], [95, 78]].map(([x, y]) => ({ x, y, formato: 'Quadrada', lugares: 4 })));
  return lista.map((m, i) => ({ numero: i + 1, ...m }));
})();

/** Fundo do mapa: o corredor do boulevard da Nova Olaria (planta L07B), com as lojas dos dois lados, a porta do bar, o banco curvo e a praça do chafariz no fundo. */
function PlantaBoulevard() {
  const lojasCima = [[0, 6.4], [6.4, 21.4], [21.4, 29.9], [29.9, 37.4], [37.4, 53.4], [66.2, 79]];
  const lojasBaixo = [[0, 3.2], [3.2, 28.8], [28.8, 36.8], [36.8, 44.8], [44.8, 52.8], [52.8, 60.9], [60.9, 68.9], [68.9, 79]];
  return (
    <div className="planta" aria-hidden="true">
      {lojasCima.map(([a, b]) => <span key={`c${a}`} className="planta__loja planta__loja--cima" style={{ left: `${a}%`, width: `${b - a}%` }} />)}
      <span className="planta__loja planta__loja--cima planta__bar" style={{ left: '53.4%', width: '12.8%' }}>
        <Store size={18} /><b>Bar do Dindo</b><i className="planta__porta">porta</i>
      </span>
      {lojasBaixo.map(([a, b]) => <span key={`b${a}`} className="planta__loja planta__loja--baixo" style={{ left: `${a}%`, width: `${b - a}%` }} />)}
      <span className="planta__corredor">Corredor do boulevard</span>
      <span className="planta__entrada">Entrada</span>
      <span className="planta__banco" />
      <span className="planta__praca"><span className="planta__chafariz" /><small>Praça · chafariz</small></span>
    </div>
  );
}

function FormMesa({ mesa, ambientes, usados, onClose, onSalvar, onExcluir }: {
  mesa: Partial<Mesa>; ambientes: string[]; usados: number[]; onClose: () => void; onSalvar: (d: Partial<Mesa>) => Promise<void>; onExcluir?: () => Promise<void>;
}) {
  const [d, setD] = useState<Partial<Mesa>>(mesa);
  const repetido = usados.includes(Number(d.numero));
  return (
    <Modal title={mesa.id ? `Mesa ${mesa.numero}` : 'Nova mesa'} onClose={onClose} width={520}
      footer={<>
        {onExcluir && <AsyncButton className="btn btn--ghost" onClick={onExcluir} confirm={{ title: `Excluir a mesa ${mesa.numero}?`, message: 'As comandas antigas continuam com o número da mesa.', confirmLabel: 'Excluir', danger: true }}><Trash2 size={16} /> Excluir</AsyncButton>}
        <AsyncButton className="btn btn--primary" onClick={() => onSalvar(d)} disabled={!d.numero || repetido}><Check size={16} /> Salvar</AsyncButton>
      </>}>
      <div className="form-grid">
        <div>
          <label className="field-label" htmlFor="m-num">Número</label>
          <NumberInput id="m-num" spec={{ decimals: 0, min: 1, max: 999 }} value={d.numero ?? ''} onChange={(v) => setD({ ...d, numero: Number(v) || undefined })} />
          {repetido && <p className="error small">Já existe uma mesa com este número.</p>}
        </div>
        <div>
          <label className="field-label" htmlFor="m-lug">Lugares</label>
          <NumberInput id="m-lug" spec={{ decimals: 0, min: 1, max: 40 }} value={d.lugares ?? ''} onChange={(v) => setD({ ...d, lugares: Number(v) || 1 })} />
        </div>
        <div>
          <label className="field-label" htmlFor="m-for">Formato</label>
          <SelectPicker id="m-for" options={FORMATOS} value={d.formato} onChange={(v) => setD({ ...d, formato: v })} />
        </div>
        <div>
          <label className="field-label" htmlFor="m-amb">Ambiente</label>
          {ambientes.length ? <SelectPicker id="m-amb" options={ambientes} value={d.ambiente} onChange={(v) => setD({ ...d, ambiente: v })} />
            : <input id="m-amb" className="input" maxLength={60} value={d.ambiente ?? ''} onChange={(e) => setD({ ...d, ambiente: e.target.value })} />}
        </div>
        <div>
          <label className="field-label" htmlFor="m-st">Situação</label>
          <SelectPicker id="m-st" options={['Ativa', 'Inativa']} value={d.status ?? 'Ativa'} onChange={(v) => setD({ ...d, status: v })} />
        </div>
      </div>
    </Modal>
  );
}

function GerarMesas({ ambientes, inicio, onClose, onPronto }: { ambientes: string[]; inicio: number; onClose: () => void; onPronto: () => void }) {
  const [qtd, setQtd] = useState<number | ''>(12);
  const [lugares, setLugares] = useState<number | ''>(4);
  const [ambiente, setAmbiente] = useState(ambientes[0] ?? '');
  const criar = async () => {
    const n = Math.min(80, Number(qtd) || 0);
    for (let i = 0; i < n; i++) {
      const numero = inicio + i;
      await api('/crm/c/mesas', { method: 'POST', body: { numero, nome: `Mesa ${numero}`, lugares: Number(lugares) || 4, formato: 'Quadrada', ambiente, status: 'Ativa', x: 6 + (i % 8) * 11.5, y: 10 + Math.floor(i / 8) * 18 } });
    }
    await reload('/crm/c/mesas');
    notify(`${n} mesas criadas (${inicio} a ${inicio + n - 1}). Arraste cada uma para o lugar certo.`);
    onPronto();
  };
  return (
    <Modal title="Criar mesas" onClose={onClose} width={480}
      footer={<AsyncButton className="btn btn--primary" onClick={criar} disabled={!qtd}><Plus size={16} /> Criar {qtd || 0} mesas</AsyncButton>}>
      <p className="muted small">As mesas são numeradas a partir da {inicio}. Depois é só ajustar a posição de cada uma no mapa e os detalhes (formato, lugares).</p>
      <div className="form-grid">
        <div><label className="field-label" htmlFor="g-q">Quantidade</label><NumberInput id="g-q" spec={{ decimals: 0, min: 1, max: 80 }} value={qtd} onChange={setQtd} /></div>
        <div><label className="field-label" htmlFor="g-l">Lugares por mesa</label><NumberInput id="g-l" spec={{ decimals: 0, min: 1, max: 40 }} value={lugares} onChange={setLugares} /></div>
        <div className="form-field--wide"><label className="field-label" htmlFor="g-a">Ambiente</label>
          {ambientes.length ? <SelectPicker id="g-a" options={ambientes} value={ambiente} onChange={setAmbiente} /> : <input id="g-a" className="input" value={ambiente} onChange={(e) => setAmbiente(e.target.value)} />}
        </div>
      </div>
    </Modal>
  );
}
