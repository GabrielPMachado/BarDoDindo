import { useCallback, useMemo, useState, type DragEvent, type ReactNode, Fragment } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Camera, ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText, Globe, ImageOff, Maximize2, Paperclip, Pencil, Plus, Receipt, Search, Sheet, ShoppingCart, Sparkles, Trash2, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { findModule } from '../modules';
import { linksDe, numberSpec, STATUS_KEYS, temTamanhos, termos, toneOf, vinculosDe, type CollectionDef, type Computed, type Field } from '../collections';
import { maskCnpj, maskPhone } from '../lib/masks';
import { useCollection, type Row } from '../lib/data';
import { brl, dateBR, num, pct } from '../lib/format';
import { useSession } from '../lib/session';
import { desdeDe, PERIODO_PADRAO, PERIODOS, type PeriodoKey } from '../lib/periodo';
import { AsyncButton, Badge, checkRange, EmptyState, ErrorBox, FieldInput, KpiRow, Loading, Modal, PageHead, notify } from './ui';
import { confirmar, RefPicker, VariosRefPicker } from './pickers';
import { api } from '../lib/api';
import { fotoNoTamanho } from './Avatar';
import { ContextMenu, type MenuPos } from './ContextMenu';
import { colunasDe, exportarCsv, exportarExcel, exportarPdf } from '../lib/exportar';
import { LancarDespesa } from './LancarDespesa';
import { AnexosCampo, anexosDe, arrastandoArquivo, lerArquivo, type AnexoNovo } from './Anexos';
import { ANEXOS_POR_REGISTRO } from '../../../shared/backend';
import { FichaTecnica } from './FichaTecnica';
import { LocaisCampo, TransferirModal } from './Locais';
import { CelulaRapida, editavelNaTabela } from './EdicaoRapida';
import { comExtras, listaDe, useOpcoesExtras } from './OpcaoOutro';
import { ItensDoFornecedor } from './ItensDoFornecedor';
import { linkSeguro } from '../lib/links';
import { BarraNivel, LinksDeCompra, VariosLinks } from './Nivel';
import { PreencherProdutoIA } from './PreencherProdutoIA';
import { GerarFotoIA } from './GerarFotoIA';
import { RefazerFotos } from './RefazerFotos';
import { MoverVarios } from './MoverVarios';
import { Ampliar } from './Ampliar';
import { SeletorVisao, VisaoCalendario, VisaoCartoes, VisaoQuadro, campoDoQuadro, useVisao } from './Visoes';
import { CompraItens, itemVazio, totalItens, type ItemCompra } from './CompraItens';
import { camposDosLocais, locaisDe, locaisNoFormulario } from '../lib/locais';
import { calcularFicha, fichaDe, type Ficha } from '../lib/ficha';
import { dadosParaMover, destinosDe } from '../lib/mover';
import { conferirTamanhos, fotoDosTamanhos, novoTamanho, rascunhoDe, salvarTamanhos, tirarTamanho, TAMANHOS_SUGERIDOS, TamanhosCampo, tamanhosDoItem, type TamanhoRascunho } from './Tamanhos';

const PAGE = 50;
/** Lista agrupada (tabela): linhas mostradas por grupo antes do "Ver mais". */
const LINHAS_POR_GRUPO = 5;

/** Valores de um campo para busca e filtros: nos vínculos com vários (ex.: fornecedores), todos eles. */
function valoresDoCampo(r: Row, f: Pick<Field, 'key'> & Partial<Field>): string[] {
  return f.outros ? vinculosDe(r, f as Field).map((v) => v.nome) : [String(r[f.key] ?? '')];
}
const plural = (rotulo: string) => (/[rzs]$/i.test(rotulo) ? `${rotulo}es` : `${rotulo}s`);

function formatField(f: Field, v: unknown): ReactNode {
  if (v === undefined || v === null || v === '') return <span className="muted">—</span>;
  switch (f.type) {
    case 'money': return brl(Number(v));
    case 'date': return dateBR(v);
    case 'percent': return `${num(Number(v), Number.isInteger(Number(v)) ? 0 : 1)}%`;
    case 'number': return num(Number(v), Number.isInteger(Number(v)) ? 0 : Math.min(f.decimals ?? 2, 3));
    case 'phone': return maskPhone(v);
    case 'cnpj': return maskCnpj(v);
    case 'time': return String(v).slice(0, 5);
    case 'select': return STATUS_KEYS.includes(f.key) ? <Badge tone={toneOf(v)}>{String(v)}</Badge> : String(v);
    default: return String(v);
  }
}

/** Item com tamanhos: de quanto a quanto vai o valor nos tamanhos (ex.: "R$ 9,00 a R$ 25,00"). */
function faixaDosTamanhos(f: Field, r: Row): ReactNode {
  const valores = (Array.isArray(r._tamanhos) ? (r._tamanhos as Row[]) : []).map((t) => Number(t[f.key])).filter((v) => v > 0);
  if (f.type !== 'money' || !valores.length) return <span className="muted">—</span>;
  const [min, max] = [Math.min(...valores), Math.max(...valores)];
  return min === max ? brl(min) : `${brl(min)} a ${brl(max)}`;
}

/** Números à direita; datas, códigos e status sem quebra; textos longos quebram e ficam limitados. */
function cellClass(f: Field) {
  if (['money', 'number', 'percent'].includes(f.type)) return 'num';
  if (['date', 'time', 'phone', 'cnpj', 'select'].includes(f.type)) return 'nowrap';
  return f.wide ? 'text-wide' : 'text';
}

function formatComputed(c: Computed, r: Row): ReactNode {
  const v = c.get(r);
  if (v === null || v === undefined || v === '') return <span className="muted">—</span>;
  const tone = c.tone?.(r);
  if (c.format === 'nivel') return <BarraNivel fracao={Number(v)} tone={tone ?? 'neutral'} detalhe={c.detalhe?.(r) ?? ''} />;
  const text =
    c.format === 'money' ? brl(Number(v)) : c.format === 'percent' ? pct(Number(v)) : c.format === 'number' ? num(Number(v)) : String(v);
  if (c.format === 'badge') return <Badge tone={tone ?? toneOf(v)}>{text}</Badge>;
  return tone && tone !== 'neutral' ? <span className={`text-${tone}`}>{text}</span> : text;
}

export function CollectionPage({ def, rowActions, before, newDefaults, filterRows }: {
  def: CollectionDef;
  /** Ações rápidas exibidas em cada linha (ex.: confirmar reserva). */
  rowActions?: (r: Row, canEdit: boolean) => ReactNode;
  /** Conteúdo exibido acima da tabela (ex.: gráfico). */
  before?: (rows: Row[]) => ReactNode;
  newDefaults?: Record<string, unknown>;
  filterRows?: (r: Row) => boolean;
}) {
  const { pode } = useSession();
  // cada tela tem a própria permissão (ex.: só as despesas fixas); fora do menu, vale a do cadastro
  const { pathname } = useLocation();
  const perm = findModule(pathname)?.item.perm ?? def.area;
  const canCreate = pode(perm, 'criar');
  const canEdit = pode(perm, 'editar');
  const canDelete = pode(perm, 'excluir');
  // tabela, cartões com foto, quadro por status ou calendário (lembrado por tela)
  const { visoes, visao, mudar: mudarVisao } = useVisao(def, perm);
  const tituloDe = (r: Row) => String(r[def.fields[0].key] ?? '').trim() || '—';
  // foto em tela cheia (miniatura da tabela, lupa dos cartões e quadro)
  const [ampliada, setAmpliada] = useState<{ src: string; titulo: string } | null>(null);
  const ampliar = (r: Row) => typeof r.foto === 'string' && r.foto && setAmpliada({ src: r.foto, titulo: tituloDe(r) });
  // receitas, despesas, consumos e reservas carregam só um período (escolhido na barra da tabela)
  const padraoPeriodo = PERIODO_PADRAO[def.id];
  const [periodo, setPeriodo] = useState<PeriodoKey>(padraoPeriodo ?? 'tudo');
  const col = useCollection(def.id, true, padraoPeriodo ? desdeDe(periodo) : undefined);
  const all = useMemo(() => {
    const lista = filterRows ? col.rows.filter(filterRows) : col.rows;
    // item com tamanhos: leva os tamanhos junto, para as colunas calculadas (ex.: "3 tamanhos: 300 ml, 500 ml, 1 litro")
    // e mostra a foto de um dos tamanhos (o item principal não tem foto própria)
    return def.tamanhos ? lista.map((r) => {
      if (!temTamanhos(r)) return r;
      const tamanhos = tamanhosDoItem(col.rows, r.id);
      return { ...r, _tamanhos: tamanhos, foto: fotoDosTamanhos(tamanhos) || r.foto };
    }) : lista;
  }, [col.rows, filterRows, def.tamanhos]);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: def.sortKey ?? def.fields[0].key, dir: def.sortDir ?? 'asc' });
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [refazendoFotos, setRefazendoFotos] = useState(false);
  const [lancando, setLancando] = useState<Row | null>(null);
  const [transferindo, setTransferindo] = useState<Row | null>(null);
  // mover para outra tela do mesmo fluxo (ex.: da Gestão de mídias para a Criação): o registro novo abre preenchido
  const destinos = useMemo(() => destinosDe(def.id).filter((d) => pode(d.area, 'criar')), [def.id, pode]);
  const [movendo, setMovendo] = useState<{ row: Row; dados: Record<string, unknown>; destino: CollectionDef } | null>(null);

  const tableFields = def.fields.filter((f) => !f.formOnly);

  /* arrastar um PDF (ou foto) para cima de uma linha anexa direto naquele registro, sem abrir o cadastro */
  const soltaAnexo = !!def.anexos && canEdit;
  const [soltandoEm, setSoltandoEm] = useState<Row | null>(null);
  const [anexandoEm, setAnexandoEm] = useState<string | null>(null);
  const nomeDe = (r: Row) => String(r[def.fields[0].key] ?? '').trim() || def.singular;
  const anexarSoltos = async (r: Row, lista: FileList) => {
    const arquivos = Array.from(lista);
    if (!arquivos.length) return;
    const livres = ANEXOS_POR_REGISTRO - anexosDe(r.anexos).length;
    if (arquivos.length > livres) { notify(`"${nomeDe(r)}" já tem ${anexosDe(r.anexos).length} de ${ANEXOS_POR_REGISTRO} PDFs.`, 'error'); return; }
    setAnexandoEm(r.id);
    try {
      const lidos = await Promise.all(arquivos.map(lerArquivo));
      // sem a lista `anexos`, o servidor mantém os PDFs que já estavam e soma os novos
      await col.update(r.id, { anexosNovos: lidos.map(({ nome, dados }) => ({ nome, dados })) } as Partial<Row>);
      notify(`${lidos.length === 1 ? `"${lidos[0].nome}" anexado` : `${lidos.length} arquivos anexados`} em ${nomeDe(r)}.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível anexar.', 'error');
    } finally {
      setAnexandoEm(null);
    }
  };
  const arrastoNaLinha = (r: Row) => soltaAnexo ? {
    onDragOver: (e: DragEvent) => { if (!arrastandoArquivo(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (soltandoEm?.id !== r.id) setSoltandoEm(r); },
    onDrop: (e: DragEvent) => { if (!arrastandoArquivo(e)) return; e.preventDefault(); setSoltandoEm(null); void anexarSoltos(r, e.dataTransfer.files); },
  } : {};
  const campoLink = def.fields.find((f) => f.type === 'url' && f.acao);
  const filterField = def.fields.find((f) => f.key === def.filterKey);
  const extrasDoFiltro = useOpcoesExtras(filterField?.options?.length ? listaDe(def.id, filterField.key) : undefined);
  // filtros extras: as opções são os valores que aparecem nos registros (sem diferenciar maiúsculas)
  const chaveFiltro = (v: unknown) => String(v ?? '').trim().toLocaleLowerCase('pt-BR');
  const filtrosExtras = useMemo(() => (def.filtros ?? []).flatMap((key) => {
    const f = def.fields.find((x) => x.key === key);
    if (!f) return [];
    const valores = new Map<string, string>();
    for (const r of all) for (const x of valoresDoCampo(r, f)) { const v = x.trim(); if (v && !valores.has(chaveFiltro(v))) valores.set(chaveFiltro(v), v); }
    const opcoes = [...valores].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }));
    return opcoes.length > 1 || filtros[key] ? [{ key, label: f.label.replace(/\s*\(.*\)$/, ''), opcoes }] : [];
  }), [def, all, filtros]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = all.filter(
      (r) =>
        !def.ocultarNaLista?.(r, filtros) &&
        (!filter || r[def.filterKey!] === filter) &&
        Object.entries(filtros).every(([k, v]) => !v || valoresDoCampo(r, def.fields.find((f) => f.key === k) ?? { key: k }).some((x) => chaveFiltro(x) === v)) &&
        (!term || def.fields.some((f) => valoresDoCampo(r, f).some((x) => x.toLowerCase().includes(term)))),
    );
    const field = def.fields.find((f) => f.key === sort.key);
    const numeric = field && ['number', 'money', 'percent'].includes(field.type);
    return list.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      const empty = (v: unknown) => v === undefined || v === null || v === '';
      if (empty(av) && empty(bv)) return 0;
      if (empty(av)) return 1;
      if (empty(bv)) return -1;
      const c = numeric ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), 'pt-BR', { numeric: true });
      return sort.dir === 'asc' ? c : -c;
    });
  }, [all, q, filter, filtros, sort, def]);

  /* agrupamento: sem escolha manual, com algum filtro ativo agrupa pela primeira dimensão que não está filtrada
     (ex.: filtrou por destaque, agrupa por categoria) e que ainda tem mais de um valor na lista */
  const [agrupar, setAgrupar] = useState<string>('auto');
  const dimensoes = useMemo(
    () => [def.filterKey, ...(def.filtros ?? [])].flatMap((k) => def.fields.filter((f) => f.key === k)),
    [def],
  );
  const filtrado = (k: string) => (k === def.filterKey ? !!filter : false) || !!filtros[k];
  const algumFiltro = !!filter || Object.values(filtros).some(Boolean);
  const variaNaLista = (k: string) => new Set(rows.map((r) => chaveFiltro(r[k]))).size > 1;
  const grupoAuto = algumFiltro ? dimensoes.find((f) => !filtrado(f.key) && variaNaLista(f.key)) : undefined;
  const campoGrupo = agrupar === 'auto' ? grupoAuto : agrupar === 'nenhum' ? undefined : dimensoes.find((f) => f.key === agrupar);
  const grupos = useMemo(() => {
    if (!campoGrupo) return null;
    const mapa = new Map<string, { chave: string; titulo: string; rows: Row[] }>();
    for (const r of rows) {
      const v = String(r[campoGrupo.key] ?? '').trim();
      const chave = chaveFiltro(v);
      if (!mapa.has(chave)) mapa.set(chave, { chave, titulo: v || `Sem ${campoGrupo.label.toLocaleLowerCase('pt-BR')}`, rows: [] });
      mapa.get(chave)!.rows.push(r);
    }
    // na ordem das opções do campo (ex.: categorias do cardápio); o resto em ordem alfabética e o vazio no fim
    const ordem = (campoGrupo.options ?? []).map(chaveFiltro);
    const pos = (g: { chave: string }) => (!g.chave ? Infinity : ordem.includes(g.chave) ? ordem.indexOf(g.chave) : ordem.length);
    return [...mapa.values()].sort((a, b) => pos(a) - pos(b) || a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true }));
  }, [rows, campoGrupo]);
  /* grupos abertos, mostrando só a primeira linha de itens; "Ver mais" mostra o grupo inteiro e o cabeçalho recolhe o grupo */
  const [fechados, setFechados] = useState<Set<string>>(() => new Set());
  const [completos, setCompletos] = useState<Set<string>>(() => new Set());
  const idGrupo = (chave: string) => `${campoGrupo?.key}:${chave}`;
  const aberto = (chave: string) => !fechados.has(idGrupo(chave));
  const completo = (chave: string) => completos.has(idGrupo(chave));
  const alternar = (set: typeof setFechados, chave: string) => set((x) => { const n = new Set(x); if (n.has(idGrupo(chave))) n.delete(idGrupo(chave)); else n.add(idGrupo(chave)); return n; });
  // quantos itens cabem na primeira linha: na tabela, algumas linhas; nos cartões, quantos cartões cabem na largura do painel
  const [larguraPainel, setLarguraPainel] = useState(0);
  const painelRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const medir = () => setLarguraPainel(el.clientWidth);
    medir();
    new ResizeObserver(medir).observe(el);
  }, []);
  const porLinha = visao === 'cartoes'
    ? (larguraPainel && larguraPainel <= 640 ? 2 : Math.max(1, Math.floor((larguraPainel - 32 + 10) / (150 + 10))))
    : larguraPainel && larguraPainel <= 640 ? 3 : LINHAS_POR_GRUPO;
  type Grupo = NonNullable<typeof grupos>[number];
  const itensDoGrupo = (g: Grupo) => (!aberto(g.chave) ? [] : completo(g.chave) ? g.rows : g.rows.slice(0, porLinha));
  const rotuloGrupo = campoGrupo?.label.replace(/\s*\(.*\)$/, '') ?? '';
  const tituloGrupo = (g: Grupo) => (
    <button type="button" className="grupo-toggle" onClick={() => alternar(setFechados, g.chave)} aria-expanded={aberto(g.chave)} title={aberto(g.chave) ? 'Recolher o grupo' : 'Abrir o grupo'}>
      <ChevronRight size={14} className="grupo-toggle__seta" />
      <span className="muted">{rotuloGrupo}:</span> {g.titulo}
      <span className="grupo-titulo__qtd">{num(g.rows.length)}</span>
    </button>
  );
  const temMais = (g: Grupo) => aberto(g.chave) && g.rows.length > porLinha;
  const botaoVerMais = (g: Grupo) => (
    <button type="button" className="btn btn--ghost btn--sm grupo-mais" onClick={() => alternar(setCompletos, g.chave)}>
      {completo(g.chave) ? 'Ver menos' : `Ver mais (${num(g.rows.length - porLinha)})`}
    </button>
  );
  /** Tabela agrupada: cabeçalho, as linhas visíveis do grupo e o "Ver mais", sem paginação. */
  type ItemTabela = { tipo: 'cab'; g: Grupo } | { tipo: 'mais'; g: Grupo } | { tipo: 'linha'; r: Row };
  const itensTabela: ItemTabela[] | null = grupos && grupos.flatMap((g): ItemTabela[] => [
    { tipo: 'cab', g },
    ...itensDoGrupo(g).map((r): ItemTabela => ({ tipo: 'linha', r })),
    ...(temMais(g) ? [{ tipo: 'mais' as const, g }] : []),
  ]);
  const colunas = 2 + (def.comFoto ? 1 : 0) + tableFields.length + (def.computed?.length ?? 0);

  const pages = grupos ? 1 : Math.max(1, Math.ceil(rows.length / PAGE));
  const visible = grupos ? grupos.flatMap(itensDoGrupo) : rows.slice(page * PAGE, page * PAGE + PAGE);

  /* seleção: marca linhas para exportar só elas ou excluir várias de uma vez */
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const selecionados = rows.filter((r) => sel.has(r.id));
  const marcar = (id: string, on: boolean) => setSel((x) => { const n = new Set(x); if (on) n.add(id); else n.delete(id); return n; });
  const todosNaPagina = visible.length > 0 && visible.every((r) => sel.has(r.id));
  const algunsNaPagina = visible.some((r) => sel.has(r.id));
  const marcarPagina = (on: boolean) => setSel((x) => { const n = new Set(x); for (const r of visible) { if (on) n.add(r.id); else n.delete(r.id); } return n; });
  const [excluindo, setExcluindo] = useState(false);
  const [movendoVarios, setMovendoVarios] = useState(false);
  /** Quadro: arrastar o cartão para outra coluna muda o status. */
  const moverNoQuadro = async (r: Row, valor: string) => {
    const campo = campoDoQuadro(def);
    if (!campo) return;
    try {
      await col.update(r.id, { [campo.key]: valor } as Partial<Row>);
      notify(`${tituloDe(r)}: ${campo.label.toLowerCase()} agora é "${valor}".`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível mudar.', 'error');
    }
  };
  const excluirSelecionados = async () => {
    const alvo = selecionados;
    if (!alvo.length) return;
    const ok = await confirmar({
      title: `Excluir ${alvo.length} ${alvo.length === 1 ? 'registro' : 'registros'}?`,
      message: alvo.length <= 5
        ? alvo.map((r) => String(r[def.fields[0].key] ?? '—')).join(', ') + '. Esta ação não pode ser desfeita.'
        : 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir', danger: true,
    });
    if (!ok) return;
    setExcluindo(true);
    let feitos = 0; let erro = '';
    for (const r of alvo) {
      try { await api(`/crm/c/${def.id}/${r.id}`, { method: 'DELETE' }); feitos++; marcar(r.id, false); }
      catch (e) { erro ||= e instanceof Error ? e.message : 'erro'; }
    }
    await col.reload();
    setExcluindo(false);
    if (erro) notify(`${feitos} de ${alvo.length} excluídos. ${erro}`, 'error');
    else notify(`${feitos} ${feitos === 1 ? 'registro excluído' : 'registros excluídos'}`);
  };

  const [menuExportar, setMenuExportar] = useState<MenuPos | null>(null);
  const [exportando, setExportando] = useState(false);
  // com linhas marcadas, exporta só elas; sem nenhuma, a lista toda (com busca e filtros)
  const paraExportar = () => (selecionados.length ? selecionados : rows);
  const exportar = async (formato: 'pdf' | 'xlsx') => {
    setExportando(true);
    try {
      const colunas = colunasDe(def);
      const arquivo = `${def.id}-${new Date().toISOString().slice(0, 10)}`;
      if (formato === 'pdf') await exportarPdf(def.title, colunas, paraExportar(), arquivo);
      else await exportarExcel(def.title, colunas, paraExportar(), arquivo);
    } catch (e) {
      console.error(e);
      notify('Não foi possível gerar o arquivo.', 'error');
    } finally {
      setExportando(false);
    }
  };
  const exportCsv = () => exportarCsv(colunasDe(def), paraExportar(), `${def.id}-${new Date().toISOString().slice(0, 10)}`);

  const toggleSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div
      className="page"
      onDragOver={soltaAnexo ? (e) => {
        // a linha (ou o campo de anexos) já aceitou o arquivo: não desfazer aqui, que recebe o evento depois dela
        if (!arrastandoArquivo(e) || e.isDefaultPrevented()) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'none'; setSoltandoEm(null);
      } : undefined}
      onDragLeave={soltaAnexo ? (e) => { if (!e.relatedTarget) setSoltandoEm(null); } : undefined}
      onDrop={soltaAnexo ? (e) => { if (arrastandoArquivo(e) && !e.isDefaultPrevented()) { e.preventDefault(); setSoltandoEm(null); } } : undefined}
    >
      <PageHead
        title={def.title}
        description={def.description}
        actions={
          <>
            <button
              className="btn btn--ghost" disabled={!rows.length || exportando}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuExportar({ x: r.left, y: r.bottom + 6 }); }}
            >
              <Download size={16} /> {exportando ? 'Gerando…' : selecionados.length ? `Exportar ${selecionados.length}` : 'Exportar'} <ChevronDown size={14} />
            </button>
            {def.fotoPadrao === 'estoque' && canEdit && (
              <button className="btn btn--ghost" disabled={!all.length} onClick={() => setRefazendoFotos(true)}><Sparkles size={16} /> Refazer fotos em alta</button>
            )}
            {canCreate && <button className="btn btn--primary" onClick={() => setEditing('new')}><Plus size={16} /> {termos(def).novo}</button>}
          </>
        }
      />

      {menuExportar && (
        <ContextMenu at={menuExportar} onClose={() => setMenuExportar(null)}>
          <button role="menuitem" onClick={() => exportar('pdf')}><FileText size={15} /> PDF (para imprimir)</button>
          <button role="menuitem" onClick={() => exportar('xlsx')}><FileSpreadsheet size={15} /> Excel (.xlsx){def.comFoto ? ', com fotos' : ''}</button>
          <button role="menuitem" onClick={exportCsv}><Sheet size={15} /> CSV (texto simples)</button>
        </ContextMenu>
      )}

      {def.kpis && all.length > 0 && <KpiRow items={def.kpis(all)} />}
      {before?.(all)}

      <div className="panel" ref={painelRef}>
        <div className="toolbar">
          <label className="search">
            <Search size={16} />
            <input placeholder="Buscar" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </label>
          {filterField?.options && (
            <select className="input input--sm" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} aria-label={`Filtrar por ${filterField.label}`}>
              <option value="">{filterField.label}: todos</option>
              {(comExtras(filterField.options, extrasDoFiltro) as string[]).map((o) => <option key={o} value={o}>{filterField.label}: {o}</option>)}
            </select>
          )}
          {filtrosExtras.map((fx) => (
            <select
              key={fx.key} className={`input input--sm ${filtros[fx.key] ? 'is-filtrando' : ''}`} value={filtros[fx.key] ?? ''}
              onChange={(e) => { setFiltros((x) => ({ ...x, [fx.key]: e.target.value })); setPage(0); }} aria-label={`Filtrar por ${fx.label}`}
            >
              <option value="">{fx.label}: todos</option>
              {fx.opcoes.map(([k, v]) => <option key={k} value={k}>{fx.label}: {v}</option>)}
            </select>
          ))}
          {Object.values(filtros).some(Boolean) && (
            <button className="btn btn--ghost btn--sm" onClick={() => { setFiltros({}); setPage(0); }}>Limpar filtros</button>
          )}
          {padraoPeriodo && (
            <select className="input input--sm" value={periodo} onChange={(e) => { setPeriodo(e.target.value as PeriodoKey); setPage(0); }} aria-label="Período">
              {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
          {soltaAnexo && all.length > 0 && <span className="muted small toolbar__dica"><Paperclip size={13} /> Arraste um PDF ou foto sobre a linha para anexar</span>}
          {dimensoes.length > 0 && (visao === 'tabela' || visao === 'cartoes') && (
            <select
              className={`input input--sm ${campoGrupo ? 'is-filtrando' : ''}`} value={agrupar}
              onChange={(e) => { setAgrupar(e.target.value); setPage(0); }} aria-label="Agrupar por"
              title="No automático, ao filtrar, agrupa pelo que não está filtrado."
            >
              <option value="auto">Agrupar: automático{grupoAuto ? ` (${grupoAuto.label.replace(/\s*\(.*\)$/, '')})` : ''}</option>
              <option value="nenhum">Agrupar: não agrupar</option>
              {dimensoes.map((f) => <option key={f.key} value={f.key}>Agrupar: {f.label.replace(/\s*\(.*\)$/, '')}</option>)}
            </select>
          )}
          <SeletorVisao visoes={visoes} valor={visao} onChange={mudarVisao} />
          <span className="muted toolbar__count">{num(rows.length)} {rows.length === 1 ? 'registro' : 'registros'}</span>
        </div>

        {selecionados.length > 0 && (
          <div className="selecao-barra" role="region" aria-label="Itens selecionados">
            <b>{selecionados.length} {selecionados.length === 1 ? 'selecionado' : 'selecionados'}</b>
            {selecionados.length < rows.length && (
              <button className="btn btn--ghost btn--sm" onClick={() => setSel(new Set(rows.map((r) => r.id)))}>Selecionar todos ({num(rows.length)})</button>
            )}
            <span className="selecao-barra__acoes">
              <button className="btn btn--ghost btn--sm" disabled={exportando} onClick={() => exportar('pdf')}><FileText size={14} /> PDF</button>
              <button className="btn btn--ghost btn--sm" disabled={exportando} onClick={() => exportar('xlsx')}><FileSpreadsheet size={14} /> Excel</button>
              <button className="btn btn--ghost btn--sm" onClick={exportCsv}><Sheet size={14} /> CSV</button>
              {canDelete && destinos.length > 0 && (
                <button className="btn btn--ghost btn--sm" onClick={() => setMovendoVarios(true)}>
                  <ArrowLeftRight size={14} /> {destinos.length === 1 ? `Mover para ${destinos[0].title}` : 'Mover para…'}
                </button>
              )}
              {canDelete && (
                <button className="btn btn--danger btn--sm" disabled={excluindo} onClick={() => void excluirSelecionados()}>
                  <Trash2 size={14} /> {excluindo ? 'Excluindo…' : 'Excluir'}
                </button>
              )}
              <button className="icon-btn" onClick={() => setSel(new Set())} aria-label="Limpar seleção" title="Limpar seleção"><X size={16} /></button>
            </span>
          </div>
        )}

        {col.error && <ErrorBox>{col.error}</ErrorBox>}
        {col.loading ? (
          <Loading />
        ) : all.length === 0 ? (
          <EmptyState
            title={termos(def).nenhum}
            action={canCreate ? <button className="btn btn--primary" onClick={() => setEditing('new')}><Plus size={16} /> Cadastrar</button> : undefined}
          >
            {canCreate ? 'Comece cadastrando o primeiro registro.' : 'Ainda não há registros nesta área.'}
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum resultado">Ajuste a busca ou o filtro.</EmptyState>
        ) : visao === 'cartoes' ? (
          grupos ? grupos.map((g) => (
            <section key={g.chave} className={`grupo-cartoes grupo-cartoes--compacto ${aberto(g.chave) ? 'is-aberto' : ''}`}>
              <h3 className="grupo-titulo">{tituloGrupo(g)}</h3>
              {aberto(g.chave) && <VisaoCartoes def={def} rows={itensDoGrupo(g)} onAbrir={setEditing} fmt={formatField} titulo={tituloDe} sel={sel} marcar={marcar} onAmpliar={ampliar} />}
              {temMais(g) && <div className="grupo-mais-cartoes">{botaoVerMais(g)}</div>}
            </section>
          )) : <VisaoCartoes def={def} rows={rows} onAbrir={setEditing} fmt={formatField} titulo={tituloDe} sel={sel} marcar={marcar} onAmpliar={ampliar} />
        ) : visao === 'quadro' ? (
          <VisaoQuadro def={def} rows={rows} onAbrir={setEditing} fmt={formatField} titulo={tituloDe} podeMover={canEdit} onMover={(r, valor) => void moverNoQuadro(r, valor)} onAmpliar={ampliar} />
        ) : visao === 'calendario' ? (
          <VisaoCalendario def={def} rows={rows} onAbrir={setEditing} fmt={formatField} titulo={tituloDe} />
        ) : (
          <div className="table-wrap">
            <table className={`table table--cards ${selecionados.length ? 'table--selecionando' : ''} ${grupos ? 'table--agrupada' : ''}`}>
              <thead>
                <tr>
                  <th className="sel-col">
                    <input
                      type="checkbox" className="sel-check" aria-label="Selecionar todos desta página"
                      checked={todosNaPagina} ref={(el) => { if (el) el.indeterminate = algunsNaPagina && !todosNaPagina; }}
                      onChange={(e) => marcarPagina(e.target.checked)}
                    />
                  </th>
                  {def.comFoto && <th className="foto-col">Foto</th>}
                  {tableFields.map((f) => (
                    <th key={f.key} className={['money', 'number', 'percent'].includes(f.type) ? 'num' : ''}>
                      <button onClick={() => toggleSort(f.key)}>
                        {f.label}
                        {sort.key === f.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  ))}
                  {def.computed?.map((c) => <th key={c.label} className={c.format === 'badge' || c.format === 'text' || c.format === 'nivel' ? '' : 'num'}>{c.label}</th>)}
                  <th className="actions-col" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {(itensTabela ?? visible.map((r): ItemTabela => ({ tipo: 'linha', r }))).map((it) => {
                  if (it.tipo === 'cab') return (
                    <tr key={`g:${it.g.chave}`} className={`grupo-linha ${aberto(it.g.chave) ? 'is-aberto' : ''}`}>
                      <th colSpan={colunas} scope="colgroup">{tituloGrupo(it.g)}</th>
                    </tr>
                  );
                  if (it.tipo === 'mais') return (
                    <tr key={`m:${it.g.chave}`} className="grupo-mais-linha"><td colSpan={colunas}>{botaoVerMais(it.g)}</td></tr>
                  );
                  const r = it.r;
                  return (
                  <Fragment key={r.id}>
                  <tr data-solta={soltaAnexo ? '' : undefined} {...arrastoNaLinha(r)}
                    className={`is-clickable ${sel.has(r.id) ? 'is-selecionado' : ''} ${soltandoEm?.id === r.id ? 'is-soltando' : ''} ${anexandoEm === r.id ? 'is-anexando' : ''}`}
                    onClick={() => setEditing(r)} title={canEdit ? 'Clique para editar' : 'Clique para ver os detalhes'}>
                    <td className="sel-col" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="sel-check" checked={sel.has(r.id)} onChange={(e) => marcar(r.id, e.target.checked)} aria-label={`Selecionar ${String(r[def.fields[0].key] ?? '')}`} />
                    </td>
                    {def.comFoto && (
                      <td className="foto-col" data-label="Foto">
                        {typeof r.foto === 'string' && r.foto
                          ? <button type="button" className="thumb-btn" onClick={(e) => { e.stopPropagation(); ampliar(r); }} aria-label={`Ver a foto de ${tituloDe(r)} maior`} title="Ver maior"><img className="thumb" src={r.foto} alt="" loading="lazy" /></button>
                          : <span className="thumb thumb--vazio"><ImageOff size={14} /></span>}
                      </td>
                    )}
                    {tableFields.map((f, fi) => f.mostrarSe && !f.mostrarSe(r) ? (
                      // campo que não se aplica ao registro (ex.: preço do item com tamanhos): mostra a faixa dos tamanhos
                      <td key={f.key} data-label={f.label} className={cellClass(f)}>{faixaDosTamanhos(f, r)}</td>
                    ) : canEdit && editavelNaTabela(def, f) ? (
                      <td key={f.key} data-label={f.label} className={`${cellClass(f)} ${fi === 0 ? 'col-titulo' : ''}`} onClick={(e) => e.stopPropagation()}>
                        <CelulaRapida def={def} field={f} row={r} onSalvar={(dados) => col.update(r.id, dados)}>{formatField(f, r[f.key])}</CelulaRapida>
                      </td>
                    ) : (
                      <td key={f.key} data-label={f.label} className={`${cellClass(f)} ${fi === 0 ? 'col-titulo' : ''}`}>{formatField(f, r[f.key])}</td>
                    ))}
                    {def.computed?.map((c) => (
                      <td key={c.label} data-label={c.label} className={c.format === 'nivel' ? 'nivel-col' : c.format === 'badge' || c.format === 'text' ? 'nowrap' : 'num'}>{formatComputed(c, r)}</td>
                    ))}
                    <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        {def.anexos && anexosDe(r.anexos).length > 0 && (
                          <button className="icon-btn anexos__contagem" onClick={() => setEditing(r)} aria-label={`${anexosDe(r.anexos).length} PDF(s) anexado(s)`} title="PDFs anexados">
                            <Paperclip size={15} /> {anexosDe(r.anexos).length}
                          </button>
                        )}
                        {rowActions?.(r, canEdit)}
                        {campoLink && campoLink.outrosLinks && linksDe(r, campoLink).length > 1 ? (
                          <LinksDeCompra links={linksDe(r, campoLink)} />
                        ) : campoLink && linkSeguro(r[campoLink.key]) && (
                          <a className="icon-btn" href={linkSeguro(r[campoLink.key])!} target="_blank" rel="noopener noreferrer"
                            aria-label={campoLink.acao === 'site' ? 'Abrir o site do fornecedor' : 'Comprar (abre o link da loja)'}
                            title={campoLink.acao === 'site' ? 'Abrir o site' : 'Comprar'}>
                            {campoLink.acao === 'site' ? <Globe size={16} /> : <ShoppingCart size={16} />}
                          </a>
                        )}
                        {def.porLocal && canEdit && (
                          <button className="icon-btn" onClick={() => setTransferindo(r)} aria-label="Transferir entre locais" title="Transferir entre locais">
                            <ArrowLeftRight size={16} />
                          </button>
                        )}
                        {def.despesa && canEdit && (
                          <button className="icon-btn" onClick={() => setLancando(r)} aria-label="Lançar despesa no DRE" title="Lançar despesa no DRE">
                            <Receipt size={16} />
                          </button>
                        )}
                        <button className="icon-btn" onClick={() => setEditing(r)} aria-label={canEdit ? 'Editar' : 'Visualizar'} title={canEdit ? 'Editar' : 'Visualizar'}>
                          <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {visao === 'tabela' && pages > 1 && (
          <div className="pager">
            <button className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
            <span className="muted">Página {page + 1} de {pages}</span>
            <button className="btn btn--ghost btn--sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</button>
          </div>
        )}
      </div>

      {soltandoEm && (
        <div className="solta-aviso" role="status"><Paperclip size={16} /> Solte para anexar em <b>{nomeDe(soltandoEm)}</b></div>
      )}

      {ampliada && <Ampliar src={ampliada.src} titulo={ampliada.titulo} onClose={() => setAmpliada(null)} />}

      {transferindo && (
        <TransferirModal
          row={transferindo} nome={String(transferindo[def.fields[0].key] ?? '')} unidade={typeof transferindo.unidade === 'string' ? transferindo.unidade : undefined}
          comLocal={def.fields.some((f) => f.key === 'local')}
          onClose={() => setTransferindo(null)}
          onSalvar={async (dados) => { await col.update(transferindo.id, dados); }}
        />
      )}
      {lancando && def.despesa && (
        <LancarDespesa def={def} row={lancando} sugestao={def.despesa(lancando)} onClose={() => setLancando(null)} onDone={col.reload} />
      )}

      {refazendoFotos && (
        <RefazerFotos
          rows={all}
          onSalvar={(id, foto) => api(`/crm/c/${def.id}/${id}`, { method: 'PUT', body: { foto } })}
          onFim={col.reload}
          onClose={() => setRefazendoFotos(false)}
        />
      )}

      {editing && (
        <RecordForm
          key={editing === 'new' ? 'novo' : editing.id}
          def={def}
          row={editing === 'new' ? null : editing}
          rows={col.rows}
          // dos tamanhos para o item principal e de volta (cada tamanho abre com a sua ficha técnica)
          onAbrir={(r) => setEditing(r)}
          // registro novo depende de "Criar"; um existente, de "Editar"
          canEdit={editing === 'new' ? canCreate : canEdit}
          defaults={newDefaults}
          onClose={() => setEditing(null)}
          onSave={async ({ _tamanhos, ...data }) => {
            if (Array.isArray(_tamanhos)) {
              // item com tamanhos: grava o item e cada tamanho (um produto cada) e recarrega a lista uma vez só
              const antes = editing === 'new' ? null : editing;
              const salvo = antes ? await api<Row>(`/crm/c/${def.id}/${antes.id}`, { method: 'PUT', body: data }) : await api<Row>(`/crm/c/${def.id}`, { method: 'POST', body: data });
              try {
                await salvarTamanhos(antes?.id ?? salvo.id, antes, data, _tamanhos as TamanhoRascunho[], antes ? tamanhosDoItem(col.rows, antes.id) : []);
              } finally {
                await col.reload();
              }
            } else if (editing === 'new') {
              const novo = await col.add(data);
              // nota de compra: já abre "Lançar despesa" preenchida (dá para fechar e lançar depois)
              if (def.lancarAoCriar && def.despesa && canEdit) setLancando(novo as Row);
            } else await col.update(editing.id, data);
            notify(editing === 'new' ? (def.compra ? 'Nota lançada: as quantidades já entraram no estoque' : 'Registro criado') : 'Alterações salvas');
            setEditing(null);
          }}
          destinos={editing !== 'new' && canDelete ? destinos : []}
          onMover={(destino, dados) => { if (editing !== 'new') { setMovendo({ row: editing, dados, destino }); setEditing(null); } }}
          onDelete={
            editing !== 'new' && canDelete
              ? async () => {
                  // excluir o item principal exclui também os seus tamanhos
                  // (os que eram produtos antes de virar tamanho voltam a ficar soltos, não são apagados)
                  if (def.tamanhos) for (const t of tamanhosDoItem(col.rows, editing.id)) await tirarTamanho(t);
                  await col.remove(editing.id);
                  notify('Registro excluído');
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
      {movendoVarios && (
        <MoverVarios
          def={def} rows={selecionados} destinos={destinos} onClose={() => setMovendoVarios(false)}
          onFim={async (movidos) => { for (const id of movidos) marcar(id, false); await col.reload(); }}
        />
      )}
      {movendo && (() => {
        const { dados, ficam } = dadosParaMover(def, movendo.destino, movendo.dados as Row);
        const nome = tituloDe(movendo.row);
        return (
          <RecordForm
            key={`mover-${movendo.row.id}`}
            def={movendo.destino} row={null} canEdit defaults={dados}
            titulo={`Mover para ${movendo.destino.title}`}
            aviso={
              <p className="mover-aviso form-field--wide">
                <ArrowLeftRight size={15} />
                <span>
                  <b>{nome}</b> sai de {def.title} e passa para {movendo.destino.title}. Confira os campos e salve: o registro antigo é excluído.
                  {ficam.length > 0 && <> Não vão junto: {ficam.join(', ')}.</>}
                  {def.id === 'estoque' && <> Fichas técnicas que usam este item deixam de dar baixa nele.</>}
                </span>
              </p>
            }
            onClose={() => setMovendo(null)}
            onSave={async (payload) => {
              // os anexos que ficaram na lista vão como arquivos novos (os da origem são apagados junto com ela)
              const manter = Array.isArray(payload.anexos) ? (payload.anexos as string[]) : [];
              const copiados = await Promise.all(manter.map(async (id) => {
                const a = await api<{ nome: string; dados: string }>(`/crm/anexos/${encodeURIComponent(id)}`);
                return { nome: a.nome, dados: a.dados };
              }));
              const novos = Array.isArray(payload.anexosNovos) ? payload.anexosNovos : [];
              await api(`/crm/c/${movendo.destino.id}`, { method: 'POST', body: { ...payload, ...(movendo.destino.anexos ? { anexos: [], anexosNovos: [...copiados, ...novos] } : {}) } });
              setMovendo(null);
              try {
                await col.remove(movendo.row.id);
                notify(`“${nome}” foi para ${movendo.destino.title}`);
              } catch {
                // o novo já foi gravado: avisa em vez de deixar salvar de novo (o que duplicaria)
                notify(`“${nome}” foi copiado para ${movendo.destino.title}, mas não deu para excluir daqui. Exclua manualmente.`, 'error');
                await col.reload();
              }
            }}
          />
        );
      })()}
    </div>
  );
}

function RecordForm({ def, row, rows = [], canEdit, defaults, titulo, aviso, destinos = [], onClose, onSave, onDelete, onAbrir, onMover }: {
  def: CollectionDef; row: Row | null; rows?: Row[]; canEdit: boolean; defaults?: Record<string, unknown>;
  titulo?: string; aviso?: ReactNode; destinos?: CollectionDef[];
  onClose: () => void; onSave: (d: Record<string, unknown>) => Promise<void>; onDelete?: () => Promise<void>;
  onAbrir?: (r: Row) => void; onMover?: (destino: CollectionDef, dados: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(() => {
    if (row) return { ...row };
    const init: Record<string, unknown> = {};
    for (const f of def.fields) if (f.default !== undefined) init[f.key] = f.default;
    return { ...init, ...defaults };
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [anexosNovos, setAnexosNovos] = useState<AnexoNovo[]>([]);
  const visivel = (f: Field) => !f.mostrarSe || f.mostrarSe(data);
  // tamanhos do item principal (ex.: chopp de 300 ml, 500 ml e 1 litro): cada um é um produto, com preço e ficha próprios
  const comTamanhos = !!def.tamanhos && temTamanhos(data);
  const salvosTamanhos = useMemo(() => (def.tamanhos && row ? tamanhosDoItem(rows, row.id) : []), [def.tamanhos, row, rows]);
  const [tamanhos, setTamanhos] = useState<TamanhoRascunho[]>(() => salvosTamanhos.map(rascunhoDe));
  const marcarTamanhos = (v: unknown) => {
    // um produto que já tinha foto e passa a ter tamanhos: a foto vai para os tamanhos
    if (v === 'Sim' && !tamanhos.length) setTamanhos(TAMANHOS_SUGERIDOS.map((t) => novoTamanho(t, typeof data.foto === 'string' ? data.foto : '')));
  };
  // produtos soltos (nem tamanho de outro item, nem item com tamanhos) que podem virar tamanho deste
  const avulsos = useMemo(() => (def.tamanhos ? rows.filter((r) => !r.pai && !temTamanhos(r) && r.id !== row?.id) : []), [def.tamanhos, rows, row]);
  const pai = def.tamanhos && typeof data.pai === 'string' ? rows.find((r) => r.id === data.pai) : undefined;
  // itens da nota de compra (só se editam numa nota nova; numa lançada, só aparecem)
  const [itensCompra, setItensCompra] = useState<ItemCompra[]>(() =>
    !def.compra ? [] : row && Array.isArray(row.itens)
      ? (row.itens as ItemCompra[]).map((i, k) => ({ ...itemVazio(), ...i, chave: `r${k}` }))
      : [itemVazio()]);
  // com a ficha técnica preenchida, o custo do produto é o custo por porção calculado nela
  const mudarFicha = useCallback((ficha: Ficha) => setData((d) => ({
    ...d, ficha, ...(ficha.itens.length || ficha.fixos.length ? { custo: calcularFicha(ficha, Number(d.preco) || 0).custoPorcao } : {}),
  })), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return onClose();
    const itensValidos = itensCompra.filter((i) => i.nome.trim());
    if (def.compra && !row) {
      if (!itensValidos.length) return setError('Inclua pelo menos um item na nota.');
      const semQtd = itensValidos.find((i) => !(Number(i.quantidade) > 0));
      if (semQtd) return setError(`Informe a quantidade de "${semQtd.nome}".`);
    }
    const missing = def.fields.find((f) => f.required && visivel(f) && (data[f.key] === undefined || data[f.key] === ''));
    if (missing) return setError(`Preencha o campo "${missing.label}".`);
    const semVinculo = def.fields.find((f) => f.type === 'ref' && !f.livre && data[f.key] && (data[f.refKey!] === undefined || data[f.refKey!] === null || data[f.refKey!] === ''));
    if (semVinculo) return setError(`Selecione "${semVinculo.label}" na lista.`);
    if (comTamanhos) {
      const msg = conferirTamanhos(tamanhos);
      if (msg) return setError(msg);
    }
    for (const f of def.fields) {
      if (!visivel(f)) continue;
      if (['number', 'money', 'percent'].includes(f.type)) {
        const msg = checkRange(f.label, data[f.key], numberSpec(f));
        if (msg) return setError(msg);
      }
      if (f.type === 'phone' && data[f.key] && String(data[f.key]).replace(/\D/g, '').length < 10) {
        return setError(`O telefone em "${f.label}" está incompleto.`);
      }
      if (f.type === 'cnpj' && data[f.key] && String(data[f.key]).replace(/\D/g, '').length !== 14) {
        return setError('O CNPJ deve ter 14 dígitos.');
      }
    }
    if (def.fichaTecnica && !comTamanhos) {
      const itens = fichaDe(data.ficha).itens;
      const vazio = itens.findIndex((i) => !String(i.insumo ?? '').trim());
      if (vazio >= 0) return setError(`Ficha técnica: informe o insumo da linha ${vazio + 1}.`);
      const semQtd = itens.find((i) => !(Number(i.quantidade) > 0));
      if (semQtd) return setError(`Ficha técnica: informe a quantidade de "${semQtd.insumo}".`);
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of def.fields) {
        // campo que não se aplica a este registro (ex.: preço do item com tamanhos) fica vazio
        payload[f.key] = visivel(f) ? data[f.key] ?? '' : '';
        if (f.refKey) payload[f.refKey] = data[f.refKey] ?? null;
        if (f.outros) {
          // vários vínculos: sem os vazios e sem repetir; se o principal ficou vazio, o seguinte assume
          const vistos = new Set<string>();
          const lista = vinculosDe(data, f).filter((v) => {
            const chave = v.id ? `#${v.id}` : v.nome.trim().toLowerCase();
            if (!v.nome.trim() || vistos.has(chave)) return false;
            vistos.add(chave);
            return true;
          });
          payload[f.key] = lista[0]?.nome.trim() ?? '';
          payload[f.refKey!] = lista[0]?.id ?? null;
          payload[f.outros] = lista.slice(1).map((v) => ({ nome: v.nome.trim(), id: v.id ?? null }));
        }
        if (f.outrosLinks) {
          // vários links: sem os vazios e sem repetir; se o principal ficou vazio, o seguinte assume
          const lista = [...new Set(linksDe(data, f).map((l) => linkSeguro(l) ?? l))];
          payload[f.key] = lista[0] ?? '';
          payload[f.outrosLinks] = lista.slice(1);
        }
        for (const extra of Object.keys(f.fill ?? {})) if (!def.fields.some((x) => x.key === extra)) payload[extra] = data[extra] ?? '';
      }
      if (def.comFoto) payload.foto = comTamanhos ? '' : data.foto ?? '';
      if (def.fotoJunto) payload.fotoJunto = data.fotoJunto ?? '';
      if (def.compra && !row) {
        payload.itens = itensValidos.map(({ chave: _c, lido, ...i }) => ({ ...i, ...(lido ? { descricaoNota: lido } : {}) }));
        payload.valor = totalItens(itensValidos);
      }
      if (def.compra && row) delete payload.valor;
      if (def.porLocal) Object.assign(payload, camposDosLocais(locaisDe(data), def.fields.some((f) => f.key === 'local')));
      if (def.fichaTecnica) payload.ficha = fichaDe(comTamanhos ? null : data.ficha);
      if (comTamanhos) payload._tamanhos = tamanhos;
      if (def.anexos) {
        // a lista dos que ficam (os removidos são apagados ao salvar) e os PDFs novos
        payload.anexos = anexosDe(data.anexos).map((a) => a.id);
        payload.anexosNovos = anexosNovos.map(({ nome, dados }) => ({ nome, dados }));
      }
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  // na tela "Fichas técnicas" a receita vem antes dos dados do produto; em "Produtos", depois
  const fichaCampo = def.fichaTecnica && !comTamanhos && (
    <FichaTecnica
      ficha={fichaDe(data.ficha)} preco={Number(data.preco) || 0} nome={String(data.nome ?? '')} disabled={!canEdit}
      preMarcar={!row && def.fichaPrimeiro}
      recolhivel={!def.fichaPrimeiro}
      onChange={mudarFicha}
      onUsarPreco={(preco) => setData((d) => ({ ...d, preco }))}
    />
  );

  const title = titulo ?? (row ? (canEdit ? `Editar ${def.singular}` : termos(def).detalhes) : termos(def).novo);
  const [menuMover, setMenuMover] = useState<MenuPos | null>(null);
  // leva o que está no formulário (mesmo o que ainda não foi salvo)
  const mover = (d: CollectionDef) => onMover?.(d, { ...row, ...data });

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <AsyncButton className="btn btn--danger" onClick={onDelete} confirm={{ title: `Excluir ${def.feminino ? 'esta' : 'este'} ${def.singular}?`, message: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true }}>
              <Trash2 size={16} /> Excluir
            </AsyncButton>
          )}
          {onMover && destinos.length > 0 && (
            <button
              type="button" className="btn btn--ghost" title={`Passar ${def.feminino ? 'esta' : 'este'} ${def.singular} para outra tela`}
              onClick={(e) => {
                if (destinos.length === 1) return mover(destinos[0]);
                const r = e.currentTarget.getBoundingClientRect();
                setMenuMover({ x: r.left, y: Math.max(8, r.top - 8 - 44 * destinos.length) });
              }}
            >
              <ArrowLeftRight size={16} /> {destinos.length === 1 ? `Mover para ${destinos[0].title}` : 'Mover para…'}
            </button>
          )}
          {menuMover && (
            <ContextMenu at={menuMover} onClose={() => setMenuMover(null)}>
              {destinos.map((d) => <button key={d.id} role="menuitem" onClick={() => { setMenuMover(null); mover(d); }}>{d.title}</button>)}
            </ContextMenu>
          )}
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>{canEdit ? 'Cancelar' : 'Fechar'}</button>
          {canEdit && <button className="btn btn--primary" form="record-form" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>}
        </>
      }
    >
      <form id="record-form" className="form-grid" onSubmit={submit}>
        {aviso}
        {def.comFoto && !comTamanhos && (
          <FotoCampo valor={typeof data.foto === 'string' ? data.foto : ''} disabled={!canEdit} grande={def.fotoGrande} titulo={String(data[def.fields[0].key] ?? '')} onChange={(foto) => setData((d) => ({ ...d, foto }))} />
        )}
        {def.fotoJunto && (
          <FotoCampo
            rotulo={def.fotoJunto} dica="Categoria Reserva: no app, troca a foto quando o afilhado escolhe outro item junto (ex.: o PS5 com o karaokê ao lado)."
            valor={typeof data.fotoJunto === 'string' ? data.fotoJunto : ''} disabled={!canEdit} titulo={String(data[def.fields[0].key] ?? '')} onChange={(fotoJunto) => setData((d) => ({ ...d, fotoJunto }))}
          />
        )}
        {(def.iaProduto || def.fotoPadrao) && canEdit && !comTamanhos && <GerarFotoIA data={data} padrao={def.fotoPadrao ?? 'produto'} onUsar={(foto) => setData((d) => ({ ...d, foto }))} />}
        {pai && (
          <p className="tamanho-de form-field--wide">
            <span>Tamanho de <b>{String(pai.nome ?? '')}</b>: o nome, a categoria e os textos do cardápio acompanham o item principal.</span>
            {onAbrir && <button type="button" className="btn btn--ghost btn--sm" onClick={() => onAbrir(pai)}>Ver todos os tamanhos <ChevronRight size={13} /></button>}
          </p>
        )}
        {def.fichaPrimeiro && fichaCampo}
        {def.fields.map((f) => (def.porLocal && f.key === 'local') || (def.compra && f.key === 'valor') || !visivel(f) ? null : def.porLocal && f.key === 'quantidade' ? (
          <LocaisCampo
            key="locais" locais={locaisNoFormulario(data)} unidade={typeof data.unidade === 'string' ? data.unidade : undefined} disabled={!canEdit}
            onChange={(l) => setData((d) => ({ ...d, ...camposDosLocais(l, def.fields.some((x) => x.key === 'local')) }))}
          />
        ) : (
          <Fragment key={f.key}>
            {/* no produto, o botão da IA fica logo antes dos textos do cardápio */}
            {def.iaProduto && canEdit && f.key === 'resumo' && (
              <PreencherProdutoIA data={data} onPreencher={(patch) => setData((d) => ({ ...d, ...patch }))} />
            )}
            <div className={`form-field ${f.wide || f.type === 'textarea' || f.outros ? 'form-field--wide' : ''}`}>
              <label htmlFor={`f-${f.key}`}>{f.outros && vinculosDe(data, f).length > 1 ? plural(f.label) : f.label}{f.required && canEdit && <span className="req"> *</span>}</label>
              {f.outrosLinks ? (
                <VariosLinks field={f} links={[String(data[f.key] ?? ''), ...(Array.isArray(data[f.outrosLinks]) ? (data[f.outrosLinks] as unknown[]).map(String) : [])]} disabled={!canEdit}
                  onChange={(l) => setData((d) => ({ ...d, [f.key]: l[0] ?? '', [f.outrosLinks!]: l.slice(1) }))} />
              ) : f.outros ? (
                <VariosRefPicker
                  id={`f-${f.key}`} field={f} lista={vinculosDe(data, f)} disabled={!canEdit}
                  onChange={(lista) => setData((d) => ({ ...d, [f.key]: lista[0]?.nome ?? '', [f.refKey!]: lista[0]?.id ?? null, [f.outros!]: lista.slice(1) }))}
                />
              ) : f.type === 'ref' ? (
                <RefPicker id={`f-${f.key}`} field={f} value={data[f.key]} linkedId={data[f.refKey!]} disabled={!canEdit} onChange={(patch) => setData((d) => ({ ...d, ...patch }))} />
              ) : (
                // campo travado pela caixinha: fica vazio (o valor guardado não vale enquanto ela estiver desmarcada)
                f.ativadoPor && data[f.ativadoPor] !== 'Sim'
                  ? <FieldInput field={f} value="" disabled onChange={() => undefined} />
                  : <FieldInput field={f} value={data[f.key]} disabled={!canEdit} lista={listaDe(def.id, f.key)} onChange={(v) => { setData((d) => ({ ...d, [f.key]: v })); if (f.key === 'comTamanhos') marcarTamanhos(v); }} />
              )}
            </div>
          </Fragment>
        ))}
        {comTamanhos && <TamanhosCampo itens={tamanhos} salvos={salvosTamanhos} avulsos={avulsos} nome={String(data.nome ?? '')} disabled={!canEdit} onChange={setTamanhos} onAbrir={onAbrir} />}
        {def.fichaTecnica && !def.fichaPrimeiro && fichaCampo}
        {def.compra && (
          <CompraItens
            itens={itensCompra} somenteLeitura={!!row || !canEdit} onChange={setItensCompra}
            onNotaLida={(cab) => setData((d) => ({ ...d, ...Object.fromEntries(Object.entries(cab).filter(([, v]) => v !== undefined)) }))}
          />
        )}
        {def.anexos && (
          <AnexosCampo
            rotulo={def.anexos} salvos={anexosDe(data.anexos)} novos={anexosNovos} disabled={!canEdit}
            onChange={(salvos, novos) => { setData((d) => ({ ...d, anexos: salvos })); setAnexosNovos(novos); }}
          />
        )}
        {def.itensDoFornecedor && row && <ItensDoFornecedor fornecedorId={row.id} nome={String(row.nome ?? '')} />}
        {row?.criadoEm && (
          <p className="muted small form-field--wide">
            Criado em {new Date(String(row.criadoEm)).toLocaleString('pt-BR')}
            {row.atualizadoEm && row.atualizadoEm !== row.criadoEm && ` · atualizado em ${new Date(String(row.atualizadoEm)).toLocaleString('pt-BR')}`}
          </p>
        )}
        {error && <p className="error form-field--wide">{error}</p>}
      </form>
    </Modal>
  );
}

/** Foto do registro: escolher (a imagem é reduzida antes de salvar), trocar ou remover. */
function FotoCampo({ valor, disabled, grande, titulo, rotulo = 'Foto', dica, onChange }: { valor: string; disabled: boolean; grande?: boolean; titulo?: string; rotulo?: string; dica?: string; onChange: (foto: string) => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const escolher = async (arquivo?: File) => {
    if (!arquivo) return;
    setErro(null);
    try {
      onChange(await fotoNoTamanho(arquivo, grande));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler a imagem.');
    }
  };
  return (
    <div className="form-field form-field--wide foto-campo">
      <label>{rotulo}</label>
      {dica && <span className="muted small">{dica}</span>}
      <div className="foto-campo__linha">
        <div className="foto-campo__previa">
          {valor ? <button type="button" className="thumb-btn" onClick={() => setAberta(true)} title="Ver maior"><img src={valor} alt="Foto do registro" /></button> : <ImageOff size={22} />}
        </div>
        {!disabled && (
          <div className="foto-campo__acoes">
            <label className="btn btn--ghost btn--sm">
              <Camera size={14} /> {valor ? 'Trocar foto' : 'Escolher foto'}
              <input type="file" accept="image/*" hidden onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {valor && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAberta(true)}><Maximize2 size={14} /> Ver maior</button>}
            {valor && <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange('')}><Trash2 size={14} /> Remover</button>}
            <span className="muted small">JPG ou PNG. A imagem é reduzida automaticamente.</span>
          </div>
        )}
      </div>
      {disabled && valor && <button type="button" className="btn btn--ghost btn--sm foto-campo__ver" onClick={() => setAberta(true)}><Maximize2 size={14} /> Ver maior</button>}
      {erro && <p className="error">{erro}</p>}
      {aberta && valor && <Ampliar src={valor} titulo={titulo} onClose={() => setAberta(false)} />}
    </div>
  );
}
