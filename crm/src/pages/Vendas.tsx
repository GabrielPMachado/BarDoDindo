import { useMemo, useState } from 'react';
import { Check, Minus, Plus, Receipt, Search, Trash2, X } from 'lucide-react';
import { COLLECTIONS } from '../collections';
import { CollectionPage } from '../components/CollectionPage';
import { AsyncButton, Badge, EmptyState, ErrorBox, KpiRow, Loading, PageHead, notify } from '../components/ui';
import { api } from '../lib/api';
import { SelectPicker } from '../components/pickers';
import { reload, useCollection, useResource, type Row } from '../lib/data';
import { brl, dateBR, isoFromToday, num } from '../lib/format';
import { maskPhone } from '../lib/masks';
import { currentMonth, monthOf } from '../lib/finance';
import { useSession, type Config } from '../lib/session';

interface Cliente {
  id: number;
  numero: number;
  nome: string;
  email: string;
  telefone: string;
  desde: string;
  pontos: number;
  acumulados: number;
  totalGasto: number;
  visitas: number;
  ultimaVisita: string | null;
  nivel: string;
  origem?: string;
}

const numero = (n: number) => `#${String(n).padStart(3, '0')}`;

/* ---------------- Clientes ---------------- */
export function Clientes() {
  const { data, loading, error } = useResource<Cliente[]>('/crm/clientes');
  const { pode } = useSession();
  // excluir apaga também consumos, vouchers e reservas do afilhado, por isso exige as duas permissões
  const podeExcluir = pode('vnd', 'excluir') && pode('atd', 'excluir');
  const excluir = async (c: Cliente) => {
    await api(`/crm/clientes/${c.numero}`, { method: 'DELETE' });
    await reload('/crm/clientes');
    notify(`${c.nome} foi excluído(a).`);
  };
  const [q, setQ] = useState('');
  const clientes = data ?? [];
  const term = q.trim().toLowerCase();
  const list = clientes.filter((c) => !term || `${c.nome} ${c.email} ${c.telefone} ${numero(c.numero)}`.toLowerCase().includes(term));
  const mes = currentMonth();

  return (
    <div className="page">
      <PageHead title="Clientes (afilhados)" description="Clientes cadastrados pelo aplicativo, com pontos, consumo e frequência." />
      {clientes.length > 0 && (
        <KpiRow items={[
          { label: 'Afilhados', value: num(clientes.length) },
          { label: 'Novos este mês', value: num(clientes.filter((c) => monthOf(c.desde) === mes).length) },
          { label: 'Vindos do pré-cadastro', value: num(clientes.filter((c) => c.origem === 'Pré-cadastro').length), tone: 'info' },
          { label: 'Pontos em circulação', value: num(clientes.reduce((t, c) => t + c.pontos, 0)) },
          { label: 'Consumo total registrado', value: brl(clientes.reduce((t, c) => t + c.totalGasto, 0)) },
        ]} />
      )}
      <div className="panel">
        <div className="toolbar">
          <label className="search"><Search size={16} /><input placeholder="Buscar por nome, e-mail, telefone ou número" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <span className="muted toolbar__count">{num(list.length)} {list.length === 1 ? 'cliente' : 'clientes'}</span>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
        {loading ? <Loading /> : !clientes.length ? (
          <EmptyState title="Nenhum cliente cadastrado">Os clientes aparecem aqui quando criam a conta no aplicativo.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>Afilhado</th><th>Contato</th><th>Nível</th>
                  <th className="num">Pontos</th><th className="num">Visitas</th><th className="num">Consumo total</th><th>Última visita</th><th>Cliente desde</th>{podeExcluir && <th aria-label="Ações" />}
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Afilhado" className="text"><strong>{c.nome}</strong><div className="muted small">{numero(c.numero)}{c.origem === 'Pré-cadastro' && <> · <span className="gold">Pré-cadastro</span></>}</div></td>
                    <td data-label="Contato" className="text"><div className="small">{c.email}</div><div className="muted small nowrap">{c.telefone ? maskPhone(c.telefone) : '—'}</div></td>
                    <td data-label="Nível" className="nowrap"><Badge tone="info">{c.nivel}</Badge></td>
                    <td data-label="Pontos" className="num">{num(c.pontos)}</td>
                    <td data-label="Visitas" className="num">{num(c.visitas)}</td>
                    <td data-label="Consumo total" className="num">{brl(c.totalGasto)}</td>
                    <td data-label="Última visita" className="nowrap">{c.ultimaVisita ? dateBR(c.ultimaVisita) : <span className="muted">—</span>}</td>
                    <td data-label="Cliente desde" className="nowrap">{dateBR(c.desde)}</td>
                    {podeExcluir && (
                      <td className="actions">
                        <AsyncButton
                          className="icon-btn"
                          confirm={{ title: `Excluir ${c.nome} (${numero(c.numero)})?`, message: 'Apaga o cadastro, os pontos, os consumos (e as receitas deles), os vouchers e as reservas deste afilhado. Não dá para desfazer.', confirmLabel: 'Excluir afilhado', danger: true }}
                          onClick={() => excluir(c)}
                        ><Trash2 size={15} aria-label={`Excluir ${c.nome}`} /></AsyncButton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Reservas ---------------- */
export function Reservas() {
  const col = useCollection('reservas');
  const setStatus = async (r: Row, status: string) => {
    await col.update(r.id, { status });
    notify(status === 'Confirmada' ? 'Reserva confirmada. O cliente já vê a confirmação no app.' : `Reserva marcada como ${status.toLowerCase()}`);
  };
  return (
    <CollectionPage
      def={COLLECTIONS.reservas}
      rowActions={(r, canEdit) =>
        canEdit && r.status === 'Pendente' ? (
          <>
            <AsyncButton className="btn btn--sm btn--ok" onClick={() => setStatus(r, 'Confirmada')}><Check size={14} /> Confirmar</AsyncButton>
            <AsyncButton className="btn btn--sm btn--ghost" onClick={() => setStatus(r, 'Recusada')} confirm={{ title: 'Recusar esta reserva?', message: 'O cliente verá no aplicativo que a reserva não foi confirmada.', confirmLabel: 'Recusar', danger: true }}><X size={14} /> Recusar</AsyncButton>
          </>
        ) : null
      }
    />
  );
}

/* ---------------- Lançar consumo ---------------- */
export function Consumo() {
  const { pode } = useSession();
  // lançar consumo é "Criar"; apagar um lançamento (estorna pontos e receita) é "Excluir"
  const canEdit = pode('atd', 'criar');
  const canDelete = pode('atd', 'excluir');
  const clientes = useResource<Cliente[]>('/crm/clientes');
  const produtos = useResource<{ id: string; nome: string; categoria: string; preco: number; foto?: string }[]>('/crm/produtos-venda').data ?? [];
  // a lista mostra os lançamentos recentes: basta o último mês
  const consumos = useCollection('consumos', true, isoFromToday(-30));
  const cfg = useResource<Config>('/crm/config').data;

  const [clienteQ, setClienteQ] = useState('');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [produtoQ, setProdutoQ] = useState('');
  const [itens, setItens] = useState<{ produtoId: string; quantidade: number }[]>([]);
  const [forma, setForma] = useState('Pix');
  const [error, setError] = useState<string | null>(null);

  const cliente = clientes.data?.find((c) => c.id === clienteId) ?? null;
  const cq = clienteQ.trim().toLowerCase().replace('#', '');
  const sugestoes = cq
    ? (clientes.data ?? []).filter((c) => `${c.nome} ${c.email} ${c.telefone} ${String(c.numero).padStart(3, '0')}`.toLowerCase().includes(cq)).slice(0, 6)
    : [];
  const pq = produtoQ.trim().toLowerCase();
  const produtosFiltrados = produtos.filter((p) => !pq || String(p.nome).toLowerCase().includes(pq)).slice(0, 12);
  const linhas = itens.map((i) => {
    const p = produtos.find((x) => x.id === i.produtoId);
    return { ...i, nome: String(p?.nome ?? ''), preco: Number(p?.preco) || 0 };
  });
  const total = linhas.reduce((t, l) => t + l.preco * l.quantidade, 0);
  const pontos = Math.floor(total * (cfg?.pontosPorReal ?? 1));

  const addItem = (id: string) =>
    setItens((list) => (list.some((i) => i.produtoId === id) ? list.map((i) => (i.produtoId === id ? { ...i, quantidade: Math.min(999, i.quantidade + 1) } : i)) : [...list, { produtoId: id, quantidade: 1 }]));
  const setQtd = (id: string, q: number) =>
    setItens((list) => (q <= 0 ? list.filter((i) => i.produtoId !== id) : list.map((i) => (i.produtoId === id ? { ...i, quantidade: Math.min(999, q) } : i))));

  const lancar = async () => {
    setError(null);
    try {
      await api('/crm/consumos', { method: 'POST', body: { clienteId, itens, formaPagamento: forma } });
      await Promise.all([consumos.reload(), reload('/crm/clientes')]);
      notify(`Consumo lançado: ${pontos} pontos creditados para ${cliente?.nome}`);
      setItens([]);
      setClienteId(null);
      setClienteQ('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível lançar.');
    }
  };

  const recentes = [...consumos.rows].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 15);

  return (
    <div className="page">
      <PageHead
        title="Lançar consumo"
        description="Registre a comanda do afilhado: os pontos são creditados no aplicativo e o valor entra automaticamente em Financeiro · Receita."
      />

      {canEdit && (
        <div className="grid-2 grid-2--wide-left">
          <section className="panel pad-lg">
            <h2 className="panel-title">1. Cliente</h2>
            {cliente ? (
              <div className="selected-client">
                <div>
                  <strong>{cliente.nome}</strong> <span className="muted">{numero(cliente.numero)}</span>
                  <div className="muted small">{cliente.email} · {num(cliente.pontos)} pontos · nível {cliente.nivel}</div>
                </div>
                <button className="btn btn--ghost btn--sm" onClick={() => setClienteId(null)}>Trocar</button>
              </div>
            ) : (
              <div className="autocomplete">
                <label className="search"><Search size={16} />
                  <input placeholder="Número do afilhado, nome, e-mail ou telefone" value={clienteQ} onChange={(e) => setClienteQ(e.target.value)} />
                </label>
                {sugestoes.length > 0 && (
                  <ul className="autocomplete__list">
                    {sugestoes.map((c) => (
                      <li key={c.id}><button onClick={() => { setClienteId(c.id); setClienteQ(''); }}>
                        <strong>{numero(c.numero)}</strong> {c.nome} <span className="muted small">{c.email}</span>
                      </button></li>
                    ))}
                  </ul>
                )}
                {cq && !sugestoes.length && !clientes.loading && <p className="muted small">Nenhum cliente encontrado.</p>}
              </div>
            )}

            <h2 className="panel-title">2. Itens</h2>
            {!produtos.length ? (
              <p className="muted">Nenhum produto ativo. Os produtos são cadastrados em Vendas → Produtos e cardápio.</p>
            ) : (
              <>
                <label className="search"><Search size={16} />
                  <input placeholder="Buscar produto" value={produtoQ} onChange={(e) => setProdutoQ(e.target.value)} />
                </label>
                <div className="product-grid">
                  {produtosFiltrados.map((p) => (
                    <button key={p.id} className="product" onClick={() => addItem(p.id)}>
                      {p.foto && <img className="product__foto" src={p.foto} alt="" loading="lazy" />}
                      <span>{String(p.nome)}</span>
                      <strong>{brl(Number(p.preco) || 0)}</strong>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="panel pad-lg comanda">
            <h2 className="panel-title"><Receipt size={18} /> Comanda</h2>
            {!linhas.length ? (
              <p className="muted">Selecione os produtos consumidos.</p>
            ) : (
              <ul className="comanda__list">
                {linhas.map((l) => (
                  <li key={l.produtoId}>
                    <span className="comanda__name">{l.nome}</span>
                    <div className="qty">
                      <button className="icon-btn" onClick={() => setQtd(l.produtoId, l.quantidade - 1)} aria-label="Diminuir"><Minus size={14} /></button>
                      <span>{l.quantidade}</span>
                      <button className="icon-btn" onClick={() => setQtd(l.produtoId, l.quantidade + 1)} aria-label="Aumentar"><Plus size={14} /></button>
                    </div>
                    <strong>{brl(l.preco * l.quantidade)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="comanda__total"><span>Total</span><strong>{brl(total)}</strong></div>
            <div className="comanda__points">{num(pontos)} pontos para o cliente</div>
            <label className="field-label" htmlFor="forma">Forma de pagamento</label>
            <SelectPicker id="forma" options={['Pix', 'Crédito', 'Débito', 'Dinheiro', 'Vale-refeição']} value={forma} onChange={setForma} />
            {error && <ErrorBox>{error}</ErrorBox>}
            <AsyncButton className="btn btn--primary btn--lg" onClick={lancar} disabled={!cliente || !linhas.length}>
              <Check size={18} /> Lançar consumo
            </AsyncButton>
          </section>
        </div>
      )}

      <section className="panel">
        <div className="panel__head"><h2>Últimos lançamentos</h2></div>
        {consumos.loading ? <Loading /> : !recentes.length ? (
          <p className="muted pad">Nenhum consumo lançado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table className="table table--cards">
              <thead><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th className="num">Valor</th><th className="num">Pontos</th><th className="actions-col" /></tr></thead>
              <tbody>
                {recentes.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Data">{new Date(String(c.data)).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td data-label="Cliente">{String(c.clienteNome)} <span className="muted">{numero(Number(c.clienteId))}</span></td>
                    <td data-label="Itens" className="small">{(c.itens as { nome: string; quantidade: number }[]).map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}</td>
                    <td data-label="Pagamento">{String(c.formaPagamento ?? '')}</td>
                    <td data-label="Valor" className="num">{brl(Number(c.valor))}</td>
                    <td data-label="Pontos" className="num">{num(Number(c.pontos))}</td>
                    <td className="actions-col">
                      {canDelete && (
                        <AsyncButton className="icon-btn" confirm={{ title: 'Estornar este consumo?', message: 'Os pontos do cliente e a receita correspondente serão removidos.', confirmLabel: 'Estornar', danger: true }}
                          onClick={async () => {
                            await consumos.remove(c.id);
                            await Promise.all([reload('/crm/clientes'), reload('/crm/c/receitas')]);
                            notify('Consumo estornado');
                          }}>
                          <Trash2 size={16} />
                        </AsyncButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Resgates ---------------- */
export function Resgates() {
  const { pode } = useSession();
  // dar baixa num voucher altera o resgate
  const canEdit = pode('atd', 'editar');
  const col = useCollection('resgates');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('Disponível');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return col.rows
      .filter((r) => (!status || r.status === status) && (!t || `${r.codigo} ${r.clienteNome} ${r.recompensa}`.toLowerCase().includes(t)))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  }, [col.rows, q, status]);

  const mudar = async (r: Row, novo: string) => {
    await col.update(r.id, { status: novo });
    await reload('/crm/clientes');
    notify(novo === 'Utilizado' ? 'Voucher baixado' : 'Resgate cancelado e pontos devolvidos ao cliente');
  };

  return (
    <div className="page">
      <PageHead title="Validar vouchers" description="Vouchers gerados pelos clientes no aplicativo. Confira o código apresentado e dê baixa ao entregar a recompensa." />
      <div className="panel">
        <div className="toolbar">
          <label className="search"><Search size={16} /><input placeholder="Código, cliente ou recompensa" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select className="input input--sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">Todos</option><option>Disponível</option><option>Utilizado</option><option>Cancelado</option>
          </select>
          <span className="muted toolbar__count">{num(list.length)} {list.length === 1 ? 'resgate' : 'resgates'}</span>
        </div>
        {col.loading ? <Loading /> : !list.length ? (
          <EmptyState title="Nenhum resgate encontrado">{col.rows.length ? 'Ajuste a busca ou o filtro.' : 'Os resgates feitos pelos clientes aparecem aqui.'}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table--cards">
              <thead><tr><th>Código</th><th>Cliente</th><th>Recompensa</th><th className="num">Pontos</th><th>Data</th><th>Status</th><th className="actions-col" /></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Código"><span className="code">{String(r.codigo)}</span></td>
                    <td data-label="Cliente">{String(r.clienteNome)} <span className="muted">{numero(Number(r.clienteId))}</span></td>
                    <td data-label="Recompensa">{String(r.recompensa)}</td>
                    <td data-label="Pontos" className="num">{num(Number(r.custo))}</td>
                    <td data-label="Data">{dateBR(r.data)}</td>
                    <td data-label="Status"><Badge tone={r.status === 'Disponível' ? 'info' : r.status === 'Utilizado' ? 'good' : 'neutral'}>{String(r.status)}</Badge></td>
                    <td className="actions-col">
                      {canEdit && r.status === 'Disponível' && (
                        <div className="row-actions">
                          <AsyncButton className="btn btn--sm btn--ok" onClick={() => mudar(r, 'Utilizado')}><Check size={14} /> Dar baixa</AsyncButton>
                          <AsyncButton className="btn btn--sm btn--ghost" confirm={{ title: 'Cancelar este voucher?', message: 'Os pontos voltam para o saldo do cliente.', confirmLabel: 'Cancelar voucher', danger: true }} onClick={() => mudar(r, 'Cancelado')}>Cancelar</AsyncButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
