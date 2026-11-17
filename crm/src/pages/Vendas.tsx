import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Check, IdCard, Minus, Pencil, Plus, QrCode, Receipt, Search, Star, Target, Trash2, UserX, Users, X } from 'lucide-react';
import { COLLECTIONS } from '../collections';
import { CollectionPage } from '../components/CollectionPage';
import { AsyncButton, Badge, EmptyState, ErrorBox, KpiRow, Loading, Modal, NumberInput, PageHead, notify } from '../components/ui';
import { api } from '../lib/api';
import { SelectPicker } from '../components/pickers';
import { reload, useCollection, useLastSync, useResource, type Row } from '../lib/data';
import { brl, dateBR, isoFromToday, num } from '../lib/format';
import { maskPhone } from '../lib/masks';
import { currentMonth, monthOf } from '../lib/finance';
import { useSession, type Config } from '../lib/session';
import { useNavigate } from 'react-router-dom';
import { AvisoCaixa, Segmentos, useCaixa } from './Salao';
import { EscolherProdutos, type ProdutoVenda } from '../components/EscolherProdutos';
import { FichaAfilhado } from '../components/FichaAfilhado';
import { BotaoRevelar, DATA_OCULTA, ocultarCpf, ocultarEmail, ocultarTelefone } from '../components/DadosOcultos';

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
  cpf?: string;
  nascimento?: string;
  via?: string;
  cadastroCompleto?: boolean;
  respostas?: Record<string, string> | null;
}
/** Idade completa hoje a partir de AAAA-MM-DD. */
const idade = (n?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n ?? '');
  if (!m) return null;
  const h = new Date();
  return h.getFullYear() - Number(m[1]) - (h.getMonth() + 1 < Number(m[2]) || (h.getMonth() + 1 === Number(m[2]) && h.getDate() < Number(m[3])) ? 1 : 0);
};

// a equipe (usuários do CRM) tem numeração própria, negativa (#-001), e fica fora da contagem dos afilhados
export const numero = (n: number) => `#${n < 0 ? '-' : ''}${String(Math.abs(n)).padStart(3, '0')}`;

/* ---------------- Contador oficial ---------------- */
/** Total de afilhados em destaque. A lista de clientes já chega ao vivo do Firestore e o CRM confere mudanças a cada
 *  segundo (sem leituras extras), então o número sobe sozinho; a hora embaixo mostra cada conferência.
 *  Ao rolar a lista, uma faixa compacta com o total e a meta fica presa no topo da tela. */
function ContadorAfilhados({ total, hoje, meta, podeMeta }: { total: number; hoje: number; meta: number; podeMeta: boolean }) {
  const lastSync = useLastSync();
  const anterior = useRef<number | null>(null);
  const [novos, setNovos] = useState(0);
  const [editando, setEditando] = useState(false);
  const caixa = useRef<HTMLElement>(null);
  const [fixo, setFixo] = useState(false);
  useEffect(() => {
    const antes = anterior.current;
    anterior.current = total;
    if (antes === null || total <= antes) return;
    setNovos(total - antes);
    const t = setTimeout(() => setNovos(0), 6000);
    return () => clearTimeout(t);
  }, [total]);
  useEffect(() => {
    // a faixa fixa aparece quando o número grande sai da tela (passa por baixo da barra do topo)
    const el = caixa.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setFixo(!e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '-60px 0px 0px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const texto = total < 1000 ? String(total).padStart(3, '0') : total.toLocaleString('pt-BR');
  const casas = [...texto];
  const aoVivo = !!lastSync && Date.now() - lastSync.getTime() < 10000;
  const pct = meta > 0 ? Math.min(100, (total / meta) * 100) : 0;
  const batida = meta > 0 && total >= meta;
  const falta = Math.max(0, meta - total);
  const vivo = <span className={`contador__vivo ${aoVivo ? 'is-on' : ''}`}><i />{aoVivo ? 'Ao vivo' : 'Conectando…'}</span>;
  const barra = (
    <div className="contador__barra" role="progressbar" aria-valuemin={0} aria-valuemax={meta} aria-valuenow={Math.min(total, meta)} aria-label="Progresso da meta">
      <span style={{ width: `${pct}%` }} />
    </div>
  );
  return (
    <>
      <div className={`contador-fixo ${fixo ? 'is-on' : ''} ${batida ? 'is-batida' : ''}`} aria-hidden={!fixo}>
        <div className="contador-fixo__barra">
          {vivo}
          <strong className="contador-fixo__n">{num(total)}</strong>
          <span className="contador-fixo__txt">{total === 1 ? 'afilhado' : 'afilhados'}</span>
          {meta > 0 && <>
            <span className="contador-fixo__meta">{batida ? 'Meta batida!' : `Meta ${num(meta)} · ${Math.floor(pct)}%`}</span>
            {barra}
          </>}
          {novos > 0 && <span className="contador__novo">+{num(novos)}</span>}
        </div>
      </div>
      <section ref={caixa} className={`contador ${novos ? 'is-novo' : ''} ${batida ? 'is-batida' : ''}`} aria-label="Contador oficial de afilhados">
        <div className="contador__topo">
          {vivo}
          <span className="contador__titulo">Contador oficial</span>
        </div>
        <div className="contador__n" role="status" aria-live="polite" aria-atomic="true" aria-label={`${total} ${total === 1 ? 'afilhado' : 'afilhados'}`}>
          {/* a chave muda junto com o algarismo: só a casa que mudou entra animada */}
          {casas.map((c, i) => (
            <span key={`${casas.length - i}-${c}`} className={/\d/.test(c) ? 'contador__digito' : 'contador__sep'} aria-hidden="true">{c}</span>
          ))}
        </div>
        <p className="contador__txt">{total === 1 ? 'afilhado já garantiu o seu número' : 'afilhados já garantiram o seu número'}</p>
        {meta > 0 ? (
          <div className="contador__meta">
            <div className="contador__meta-topo">
              <span><Target size={15} /> Meta: <strong>{num(meta)}</strong> afilhados</span>
              <strong className="contador__pct">{batida ? 'Meta batida! 🎉' : `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</strong>
            </div>
            {barra}
            <div className="contador__meta-rodape">
              <span>{batida ? `${num(total - meta)} acima da meta` : `Faltam ${num(falta)} ${falta === 1 ? 'afilhado' : 'afilhados'}`}</span>
              {podeMeta && <button type="button" className="link" onClick={() => setEditando(true)}><Pencil size={13} /> {batida ? 'Definir nova meta' : 'Alterar meta'}</button>}
            </div>
          </div>
        ) : podeMeta && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditando(true)}><Target size={15} /> Definir uma meta</button>
        )}
        <div className="contador__rodape">
          {novos > 0 && <span className="contador__novo">+{num(novos)} {novos === 1 ? 'novo afilhado agora!' : 'novos afilhados agora!'}</span>}
          <span>{num(hoje)} {hoje === 1 ? 'novo hoje' : 'novos hoje'}</span>
          <span className="contador__hora">Atualizado às {lastSync ? lastSync.toLocaleTimeString('pt-BR') : '--:--:--'}</span>
        </div>
      </section>
      {editando && <MetaAfilhados atual={meta} total={total} onClose={() => setEditando(false)} />}
    </>
  );
}

/** Define ou troca a meta do contador (fica em Parâmetros, junto da configuração do aplicativo). */
function MetaAfilhados({ atual, total, onClose }: { atual: number; total: number; onClose: () => void }) {
  const [meta, setMeta] = useState<number | ''>(atual || '');
  const salvar = async (valor: number) => {
    await api('/crm/config', { method: 'PUT', body: { metaAfilhados: valor } });
    await reload('/crm/config');
    notify(valor ? `Meta de ${num(valor)} afilhados definida.` : 'Meta removida.');
    onClose();
  };
  const sugestoes = [50, 100, 250, 500, 1000].filter((n) => n > total).slice(0, 3);
  return (
    <Modal title="Meta de afilhados" onClose={onClose} width={440}
      footer={<>
        {atual > 0 && <AsyncButton className="btn btn--ghost" onClick={() => salvar(0)}>Remover meta</AsyncButton>}
        <AsyncButton className="btn btn--primary" disabled={!meta} onClick={() => salvar(Number(meta))}><Check size={15} /> Salvar meta</AsyncButton>
      </>}>
      <label className="field-label" htmlFor="meta-afilhados">Quantos afilhados queremos alcançar?</label>
      <NumberInput id="meta-afilhados" spec={{ decimals: 0, min: 1, max: 1_000_000 }} value={meta} onChange={setMeta} placeholder="Ex.: 100" />
      {sugestoes.length > 0 && (
        <div className="contador__sugestoes">
          {sugestoes.map((n) => <button key={n} type="button" className="chip" onClick={() => setMeta(n)}>{num(n)}</button>)}
        </div>
      )}
      <p className="muted small">Hoje são {num(total)} afilhados. A meta aparece no contador oficial e pode ser trocada sempre que for batida.</p>
    </Modal>
  );
}

/* ---------------- Clientes ---------------- */
export function Clientes() {
  const { data, loading, error } = useResource<Cliente[]>('/crm/clientes');
  const { pode } = useSession();
  const perguntas = useResource<Config>('/public/config').data?.questionario?.perguntas ?? [];
  const config = useResource<Config>('/crm/config').data;
  const navigate = useNavigate();
  // a ficha abre pelo número (a lista chega ao vivo: depois de salvar, a ficha mostra os dados novos)
  const [fichaDe, setFichaDe] = useState<number | null>(null);
  // excluir apaga também consumos, vouchers e reservas do afilhado, por isso exige as duas permissões
  const podeExcluir = pode('clientes', 'excluir') && pode('consumos', 'excluir');
  const podeEditar = pode('clientes', 'editar');
  // dados pessoais ficam ocultos; quem edita Clientes revela um afilhado (olho na linha) ou todos (botão na barra)
  const [revelados, setRevelados] = useState<Set<number>>(new Set());
  const [todosVisiveis, setTodosVisiveis] = useState(false);
  const visivel = (c: Cliente) => podeEditar && (todosVisiveis || revelados.has(c.numero));
  const alternarRevelado = (c: Cliente) => setRevelados((r) => { const n = new Set(r); if (n.has(c.numero)) n.delete(c.numero); else n.add(c.numero); return n; });
  const excluir = async (c: Cliente) => {
    await api(`/crm/clientes/${c.numero}`, { method: 'DELETE' });
    await reload('/crm/clientes');
    notify(`${c.nome} foi excluído(a).`);
  };
  const [q, setQ] = useState('');
  const clientes = data ?? [];
  const ficha = fichaDe === null ? null : clientes.find((c) => c.numero === fichaDe) ?? null;
  const term = q.trim().toLowerCase();
  // afilhados com estrela ficam em destaque, no topo da lista; quem edita Parâmetros escolhe quais (padrão: #001 e #002)
  const estrelas = config?.estrelas ?? [1, 2];
  const comEstrela = (c: Cliente) => estrelas.includes(c.numero);
  const daEquipe = (c: Cliente) => c.origem === 'Equipe' || c.numero <= 0;
  const podeEstrela = pode('parametros', 'editar');
  const alternarEstrela = async (c: Cliente) => {
    const liga = !comEstrela(c);
    await api('/crm/config', { method: 'PUT', body: { estrelas: liga ? [...estrelas, c.numero] : estrelas.filter((n) => n !== c.numero) } });
    await reload('/crm/config');
    notify(liga ? `${c.nome} ganhou estrela.` : `Estrela de ${c.nome} removida.`);
  };
  // buscar por e-mail, celular ou CPF só para quem pode ver esses dados (senão a busca os revelaria)
  const list = clientes.filter((c) => !term || (podeEditar ? `${c.nome} ${c.email} ${c.telefone} ${c.cpf ?? ''} ${numero(c.numero)}` : `${c.nome} ${numero(c.numero)}`).toLowerCase().includes(term))
    // depois os afilhados em ordem crescente de número; a equipe vem junta, por último (#000, #-001, #-002...)
    .sort((a, b) => Number(comEstrela(b)) - Number(comEstrela(a)) || Number(daEquipe(a)) - Number(daEquipe(b))
      || (daEquipe(a) ? b.numero - a.numero : a.numero - b.numero));
  const mes = currentMonth();
  const hoje = isoFromToday(0);
  const afilhados = clientes.filter((c) => c.origem !== 'Equipe'), equipe = clientes.length - afilhados.length;

  return (
    <div className="page">
      <PageHead title="Clientes (afilhados)" description="Clientes cadastrados pelo aplicativo, com pontos, consumo e frequência."
        actions={<>
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/vendas/questionario')}><BarChart3 size={16} /> Resultado do questionário</button>
          {pode('qrcode', 'ver') && <button type="button" className="btn btn--ghost" onClick={() => navigate('/vendas/qrcode')}><QrCode size={16} /> QR Code Afilhie-se</button>}
        </>} />
      {!loading && <ContadorAfilhados total={afilhados.length} hoje={afilhados.filter((c) => String(c.desde).slice(0, 10) === hoje).length} meta={Number(config?.metaAfilhados) || 0} podeMeta={pode('parametros', 'editar')} />}
      {clientes.length > 0 && (
        <KpiRow items={[
          { label: 'Afilhados', value: num(afilhados.length) },
          ...(equipe ? [{ label: 'Equipe (numeração própria)', value: num(equipe), hint: 'Usuários do CRM: não entram na contagem' }] : []),
          { label: 'Novos este mês', value: num(afilhados.filter((c) => monthOf(c.desde) === mes).length) },
          { label: 'Vindos do pré-cadastro', value: num(clientes.filter((c) => c.origem === 'Pré-cadastro').length), tone: 'info' },
          { label: 'Pelo QR Code', value: num(clientes.filter((c) => c.via === 'QR Code').length), tone: 'info' },
          { label: 'Cadastro incompleto (sem CPF)', value: num(clientes.filter((c) => !c.cadastroCompleto).length), tone: clientes.some((c) => !c.cadastroCompleto) ? 'warn' : undefined },
          { label: 'Pontos em circulação', value: num(clientes.reduce((t, c) => t + c.pontos, 0)) },
          { label: 'Consumo total registrado', value: brl(clientes.reduce((t, c) => t + c.totalGasto, 0)) },
        ]} />
      )}
      <div className="panel">
        <div className="toolbar">
          <label className="search"><Search size={16} /><input placeholder={podeEditar ? 'Buscar por nome, e-mail, telefone, CPF ou número' : 'Buscar por nome ou número'} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {podeEditar && <BotaoRevelar visivel={todosVisiveis} onClick={() => { setTodosVisiveis((v) => !v); setRevelados(new Set()); }} rotulo="os dados de todos" />}
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
                  <th>Afilhado</th><th>Contato</th><th>Documento</th>
                  <th className="num">Pontos</th><th className="num">Visitas</th><th className="num">Consumo total</th><th>Última visita</th><th>Cliente desde</th><th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className={comEstrela(c) ? 'row--destaque' : undefined}>
                    <td data-label="Afilhado" className="text"><div>{podeEstrela ? (
                      <button type="button" className="icon-btn estrela-btn" onClick={() => alternarEstrela(c)} aria-pressed={comEstrela(c)}
                        title={comEstrela(c) ? 'Tirar a estrela' : 'Dar estrela (fica em destaque, no topo)'} aria-label={comEstrela(c) ? 'Tirar a estrela' : 'Dar estrela'}>
                        <Star size={14} className={comEstrela(c) ? 'gold' : 'muted'} fill={comEstrela(c) ? 'currentColor' : 'none'} />
                      </button>
                    ) : comEstrela(c) && <Star size={14} className="gold" fill="currentColor" aria-label="Com estrela" style={{ verticalAlign: '-2px', marginRight: 4 }} />}<button type="button" className="link cliente-nome" onClick={() => setFichaDe(c.numero)} title="Abrir a ficha (editar, relatório e cartão)"><strong>{c.nome}</strong></button><div className="muted small">{numero(c.numero)}{c.origem === 'Pré-cadastro' && <> · <span className="gold">Pré-cadastro</span></>}{c.origem === 'Equipe' && <> · Equipe</>}{c.via === 'QR Code' && <> · <span className="gold">QR Code</span></>}</div></div></td>
                    <td data-label="Contato" className="text"><div className="dados-pessoais">
                      <div className={visivel(c) ? undefined : 'oculto'}>
                        <div className="small">{visivel(c) ? c.email : ocultarEmail(c.email)}</div>
                        <div className="muted small nowrap">{c.telefone ? (visivel(c) ? maskPhone(c.telefone) : ocultarTelefone(c.telefone)) : '—'}</div>
                      </div>
                      {podeEditar && !todosVisiveis && <BotaoRevelar compacto visivel={visivel(c)} onClick={() => alternarRevelado(c)} rotulo={`os dados de ${c.nome}`} />}
                    </div></td>
                    <td data-label="Documento" className="text">
                      {c.cpf ? (
                        <div className={visivel(c) ? undefined : 'oculto'}>
                          <div className="small nowrap">{visivel(c) ? c.cpf : ocultarCpf(c.cpf)}</div>
                          <div className="muted small nowrap">{visivel(c) ? (c.nascimento ? `${dateBR(c.nascimento)} · ${idade(c.nascimento)} anos` : '') : DATA_OCULTA}</div>
                        </div>
                      ) : <Badge tone="warn">Sem CPF</Badge>}
                      {c.respostas && <button type="button" className="link small" onClick={() => setFichaDe(c.numero)}>Ver respostas</button>}
                    </td>
                    <td data-label="Pontos" className="num">{num(c.pontos)}</td>
                    <td data-label="Visitas" className="num">{num(c.visitas)}</td>
                    <td data-label="Consumo total" className="num">{brl(c.totalGasto)}</td>
                    <td data-label="Última visita" className="nowrap">{c.ultimaVisita ? dateBR(c.ultimaVisita) : <span className="muted">—</span>}</td>
                    <td data-label="Cliente desde" className="nowrap">{dateBR(c.desde)}</td>
                    <td className="actions">
                      <button type="button" className="icon-btn" onClick={() => setFichaDe(c.numero)} title={podeEditar ? 'Ficha: editar, relatório e cartão' : 'Ficha: relatório e cartão'}>
                        <IdCard size={15} aria-label={`Ficha de ${c.nome}`} />
                      </button>
                      {podeExcluir && (
                        <AsyncButton
                          className="icon-btn"
                          confirm={{ title: `Excluir ${c.nome} (${numero(c.numero)})?`, message: 'Apaga o cadastro, os pontos, os consumos (e as receitas deles), os vouchers e as reservas deste afilhado. Não dá para desfazer.', confirmLabel: 'Excluir afilhado', danger: true }}
                          onClick={() => excluir(c)}
                        ><Trash2 size={15} aria-label={`Excluir ${c.nome}`} /></AsyncButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {ficha && <FichaAfilhado key={ficha.numero} cliente={ficha} perguntas={perguntas} podeEditar={podeEditar} onClose={() => setFichaDe(null)} />}
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
  const canEdit = pode('consumos', 'criar');
  const canDelete = pode('consumos', 'excluir');
  // corrigir ou estornar uma venda só vale enquanto o caixa em que ela entrou estiver aberto
  const canCorrigir = pode('consumos', 'editar');
  const [editando, setEditando] = useState<Row | null>(null);
  const clientes = useResource<Cliente[]>('/crm/clientes');
  const produtos = useResource<ProdutoVenda[]>('/crm/produtos-venda').data ?? [];
  // a lista mostra os lançamentos recentes: basta o último mês
  const consumos = useCollection('consumos', true, isoFromToday(-30));
  const { caixa } = useCaixa();

  // o afilhado é opcional: "Sem cadastro" lança a venda sem pontos (para quem não é afilhado)
  const [tipo, setTipo] = useState<'afilhado' | 'avulso'>('afilhado');
  const [nomeAvulso, setNomeAvulso] = useState('');
  const [clienteQ, setClienteQ] = useState('');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [itens, setItens] = useState<{ produtoId: string; quantidade: number }[]>([]);
  const [forma, setForma] = useState('Pix');
  const [error, setError] = useState<string | null>(null);

  const cliente = clientes.data?.find((c) => c.id === clienteId) ?? null;
  const cq = clienteQ.trim().toLowerCase().replace('#', '');
  const sugestoes = cq
    ? (clientes.data ?? []).filter((c) => `${c.nome} ${c.email} ${c.telefone} ${numero(c.numero)}`.toLowerCase().includes(cq)).slice(0, 6)
    : [];
  const linhas = itens.map((i) => {
    const p = produtos.find((x) => x.id === i.produtoId);
    return { ...i, nome: String(p?.nome ?? ''), preco: Number(p?.preco) || 0, pontos: Number(p?.pontos) || 0 };
  });
  const total = linhas.reduce((t, l) => t + l.preco * l.quantidade, 0);
  const avulso = tipo === 'avulso';
  const pontos = avulso ? 0 : linhas.reduce((t, l) => t + l.pontos * l.quantidade, 0);

  const addItem = (id: string) =>
    setItens((list) => (list.some((i) => i.produtoId === id) ? list.map((i) => (i.produtoId === id ? { ...i, quantidade: Math.min(999, i.quantidade + 1) } : i)) : [...list, { produtoId: id, quantidade: 1 }]));
  const setQtd = (id: string, q: number) =>
    setItens((list) => (q <= 0 ? list.filter((i) => i.produtoId !== id) : list.map((i) => (i.produtoId === id ? { ...i, quantidade: Math.min(999, q) } : i))));

  const lancar = async () => {
    setError(null);
    try {
      await api('/crm/consumos', { method: 'POST', body: avulso ? { nome: nomeAvulso, itens, formaPagamento: forma } : { clienteId, itens, formaPagamento: forma } });
      await Promise.all([consumos.reload(), reload('/crm/clientes'), reload('/crm/caixa')]);
      notify(avulso ? `Consumo lançado: ${brl(total)} no ${forma}` : `Consumo lançado: ${pontos} pontos creditados para ${cliente?.nome}`);
      setItens([]);
      setClienteId(null);
      setClienteQ('');
      setNomeAvulso('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível lançar.');
    }
  };

  const recentes = [...consumos.rows].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 15);

  return (
    <div className="page">
      <PageHead
        title="Lançar consumo"
        description="Venda rápida (para acompanhar a noite toda, use Comandas): o valor entra no caixa aberto e em Financeiro · Receita. Se o cliente for afilhado, os pontos são creditados no aplicativo."
      />
      <AvisoCaixa />

      {canEdit && (
        <div className="grid-2 grid-2--wide-left">
          <section className="panel pad-lg">
            <h2 className="panel-title">1. Cliente</h2>
            <div className="consumo-tipo">
              <Segmentos rotulo="Cliente" valor={tipo} onChange={setTipo} opcoes={[{ v: 'afilhado', label: 'Afilhado', icon: Users }, { v: 'avulso', label: 'Sem cadastro', icon: UserX }]} />
            </div>
            {avulso ? (
              <div>
                <label className="field-label" htmlFor="consumo-nome">Nome (opcional)</label>
                <input id="consumo-nome" className="input" maxLength={80} placeholder="Ex.: João (camisa azul)" value={nomeAvulso} onChange={(e) => setNomeAvulso(e.target.value)} />
                <p className="muted small">Sem cadastro de afilhado: a venda entra no caixa e na receita, mas não gera pontos.</p>
              </div>
            ) : cliente ? (
              <div className="selected-client">
                <div>
                  <strong>{cliente.nome}</strong> <span className="muted">{numero(cliente.numero)}</span>
                  <div className="muted small">{cliente.email} · {num(cliente.pontos)} pontos</div>
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
                        <strong>{numero(c.numero)}</strong> {c.nome} <span className="muted small">{pode('clientes', 'editar') ? c.email : ocultarEmail(c.email)}</span>
                      </button></li>
                    ))}
                  </ul>
                )}
                {cq && !sugestoes.length && !clientes.loading && <p className="muted small">Nenhum afilhado encontrado. Use "Sem cadastro" para lançar mesmo assim.</p>}
              </div>
            )}

            <h2 className="panel-title">2. Itens</h2>
            {!produtos.length ? (
              <p className="muted">Nenhum produto ativo. Os produtos são cadastrados em Vendas → Produtos e cardápio.</p>
            ) : (
              <EscolherProdutos produtos={produtos} onEscolher={(p) => addItem(p.id)} />
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
            <div className="comanda__points">{avulso ? 'Sem cadastro: não gera pontos' : `${num(pontos)} pontos para o cliente`}</div>
            <label className="field-label" htmlFor="forma">Forma de pagamento</label>
            <SelectPicker id="forma" options={['Pix', 'Crédito', 'Débito', 'Dinheiro', 'Vale-refeição']} value={forma} onChange={setForma} />
            {error && <ErrorBox>{error}</ErrorBox>}
            <AsyncButton className="btn btn--primary btn--lg" onClick={lancar} disabled={(!avulso && !cliente) || !linhas.length || !caixa}>
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
                    <td data-label="Cliente">{String(c.clienteNome ?? 'Cliente sem cadastro')} <span className="muted">{c.clienteId ? numero(Number(c.clienteId)) : 'sem cadastro'}</span></td>
                    <td data-label="Itens" className="small">{(c.itens as { nome: string; quantidade: number }[]).map((i) => `${i.quantidade}× ${i.nome}`).join(', ')}</td>
                    <td data-label="Pagamento">{String(c.formaPagamento ?? '')}</td>
                    <td data-label="Valor" className="num">{brl(Number(c.valor))}</td>
                    <td data-label="Pontos" className="num">{num(Number(c.pontos))}</td>
                    <td className="actions-col">
                      {canCorrigir && caixa && c.caixaId === caixa.id && (
                        <button type="button" className="icon-btn" onClick={() => setEditando(c)} aria-label="Editar venda"><Pencil size={16} /></button>
                      )}
                      {canDelete && (!c.caixaId || c.caixaId === caixa?.id) && (
                        <AsyncButton className="icon-btn" confirm={{ title: 'Estornar este consumo?', message: 'Os pontos do cliente e a receita correspondente serão removidos.', confirmLabel: 'Estornar', danger: true }}
                          onClick={async () => {
                            await consumos.remove(c.id);
                            await Promise.all([reload('/crm/clientes'), reload('/crm/c/receitas'), reload('/crm/caixa')]);
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
      {editando && (
        <EditarVenda venda={editando} produtos={produtos} onClose={() => setEditando(null)}
          onSalvo={async () => {
            await Promise.all([consumos.reload(), reload('/crm/clientes'), reload('/crm/c/receitas'), reload('/crm/caixa')]);
            setEditando(null);
            notify('Venda atualizada.');
          }} />
      )}
    </div>
  );
}

/** Corrige itens e forma de pagamento de uma venda do caixa aberto (receita, pontos e caixa acompanham). */
function EditarVenda({ venda, produtos, onClose, onSalvo }: {
  venda: Row; produtos: { id: string; nome: string; preco: number; pontos: number }[]; onClose: () => void; onSalvo: () => Promise<void>;
}) {
  const originais = (venda.itens ?? []) as { produtoId: string; nome: string; quantidade: number; preco: number; pontos?: number }[];
  // os itens que já estavam na venda mantêm os pontos da hora; vendas antigas (sem pontos por item) usam o cadastro atual
  const pontosDe = (id: string, salvo?: number) => (salvo !== undefined ? Number(salvo) || 0 : Number(produtos.find((p) => p.id === id)?.pontos) || 0);
  const [itens, setItens] = useState(originais.map((i) => ({ produtoId: i.produtoId, nome: i.nome, quantidade: i.quantidade, preco: i.preco, pontos: i.pontos })));
  const [forma, setForma] = useState(String(venda.formaPagamento ?? 'Pix'));
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const t = q.trim().toLowerCase();
  const achados = t ? produtos.filter((p) => String(p.nome).toLowerCase().includes(t)).slice(0, 8) : [];
  const total = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const pontos = itens.reduce((s, i) => s + pontosDe(i.produtoId, i.pontos) * i.quantidade, 0);
  const comAfilhado = !!venda.clienteUid;
  const setQtd = (id: string, n: number) => setItens((l) => (n <= 0 ? l.filter((i) => i.produtoId !== id) : l.map((i) => (i.produtoId === id ? { ...i, quantidade: Math.min(999, n) } : i))));
  const add = (p: { id: string; nome: string; preco: number; pontos: number }) => {
    setItens((l) => (l.some((i) => i.produtoId === p.id) ? l.map((i) => (i.produtoId === p.id ? { ...i, quantidade: Math.min(999, i.quantidade + 1) } : i))
      : [...l, { produtoId: p.id, nome: String(p.nome), quantidade: 1, preco: Number(p.preco) || 0, pontos: Number(p.pontos) || 0 }]));
    setQ('');
  };
  const salvar = async () => {
    setError(null);
    try {
      await api(`/crm/consumos/${venda.id}`, { method: 'PATCH', body: { itens: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })), formaPagamento: forma } });
      await onSalvo();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  };
  return (
    <Modal title={`Editar venda · ${String(venda.clienteNome ?? 'Cliente sem cadastro')}`} width={560} onClose={onClose}
      footer={<>
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <AsyncButton className="btn btn--primary" onClick={salvar} disabled={!itens.length}>Salvar</AsyncButton>
      </>}>
      <div className="comanda venda-edit">
        <ul className="comanda__list">
          {itens.map((l) => (
            <li key={l.produtoId}>
              <span className="comanda__name">{l.nome}</span>
              <div className="qty">
                <button type="button" className="icon-btn" onClick={() => setQtd(l.produtoId, l.quantidade - 1)} aria-label={`Diminuir ${l.nome}`}><Minus size={14} /></button>
                <span>{l.quantidade}</span>
                <button type="button" className="icon-btn" onClick={() => setQtd(l.produtoId, l.quantidade + 1)} aria-label={`Aumentar ${l.nome}`}><Plus size={14} /></button>
              </div>
              <strong>{brl(l.preco * l.quantidade)}</strong>
            </li>
          ))}
        </ul>
        {!itens.length && <p className="muted small">A venda precisa de ao menos um item. Para cancelar a venda inteira, use o estorno.</p>}
        <div className="autocomplete">
          <label className="search"><Search size={16} />
            <input placeholder="Adicionar produto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Adicionar produto" />
          </label>
          {achados.length > 0 && (
            <ul className="autocomplete__list">
              {achados.map((p) => <li key={p.id}><button type="button" onClick={() => add(p)}>{String(p.nome)} <span className="muted small">{brl(Number(p.preco) || 0)}</span></button></li>)}
            </ul>
          )}
        </div>
        <div className="comanda__total"><span>Total</span><strong>{brl(total)}</strong></div>
        <div className="comanda__points">{comAfilhado ? `${num(pontos)} pontos para o cliente (antes ${num(Number(venda.pontos) || 0)})` : 'Sem cadastro: não gera pontos'}</div>
        <label className="field-label" htmlFor="venda-forma">Forma de pagamento</label>
        <SelectPicker id="venda-forma" options={['Pix', 'Crédito', 'Débito', 'Dinheiro', 'Vale-refeição']} value={forma} onChange={setForma} />
        <p className="muted small">Só dá para mudar enquanto o caixa desta venda estiver aberto. A receita, os pontos e o caixa são ajustados juntos.</p>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Modal>
  );
}

/* ---------------- Resgates ---------------- */
export function Resgates() {
  const { pode } = useSession();
  // dar baixa num voucher altera o resgate
  const canEdit = pode('resgates', 'editar');
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
