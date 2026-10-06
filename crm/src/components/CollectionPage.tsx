import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Camera, ChevronDown, Download, FileSpreadsheet, FileText, ImageOff, Pencil, Plus, Search, Sheet, Trash2 } from 'lucide-react';
import { numberSpec, STATUS_KEYS, termos, toneOf, type CollectionDef, type Computed, type Field } from '../collections';
import { maskCnpj, maskPhone } from '../lib/masks';
import { useCollection, type Row } from '../lib/data';
import { brl, dateBR, num, pct } from '../lib/format';
import { useSession } from '../lib/session';
import { desdeDe, PERIODO_PADRAO, PERIODOS, type PeriodoKey } from '../lib/periodo';
import { AsyncButton, Badge, checkRange, EmptyState, ErrorBox, FieldInput, KpiRow, Loading, Modal, PageHead, notify } from './ui';
import { RefPicker } from './pickers';
import { reduzirFoto } from './Avatar';
import { ContextMenu, type MenuPos } from './ContextMenu';
import { colunasDe, exportarCsv, exportarExcel, exportarPdf } from '../lib/exportar';

const PAGE = 50;

export function formatField(f: Field, v: unknown): ReactNode {
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
  const canCreate = pode(def.area, 'criar');
  const canEdit = pode(def.area, 'editar');
  const canDelete = pode(def.area, 'excluir');
  // receitas, despesas, consumos e reservas carregam só um período (escolhido na barra da tabela)
  const padraoPeriodo = PERIODO_PADRAO[def.id];
  const [periodo, setPeriodo] = useState<PeriodoKey>(padraoPeriodo ?? 'tudo');
  const col = useCollection(def.id, true, padraoPeriodo ? desdeDe(periodo) : undefined);
  const all = filterRows ? col.rows.filter(filterRows) : col.rows;

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: def.sortKey ?? def.fields[0].key, dir: def.sortDir ?? 'asc' });
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);

  const tableFields = def.fields.filter((f) => !f.formOnly);
  const filterField = def.fields.find((f) => f.key === def.filterKey);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = all.filter(
      (r) =>
        (!filter || r[def.filterKey!] === filter) &&
        (!term || def.fields.some((f) => String(r[f.key] ?? '').toLowerCase().includes(term))),
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
  }, [all, q, filter, sort, def]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const visible = rows.slice(page * PAGE, page * PAGE + PAGE);

  const [menuExportar, setMenuExportar] = useState<MenuPos | null>(null);
  const [exportando, setExportando] = useState(false);
  const exportar = async (formato: 'pdf' | 'xlsx') => {
    setExportando(true);
    try {
      const colunas = colunasDe(def);
      const arquivo = `${def.id}-${new Date().toISOString().slice(0, 10)}`;
      if (formato === 'pdf') await exportarPdf(def.title, colunas, rows, arquivo);
      else await exportarExcel(def.title, colunas, rows, arquivo);
    } catch (e) {
      console.error(e);
      notify('Não foi possível gerar o arquivo.', 'error');
    } finally {
      setExportando(false);
    }
  };
  const exportCsv = () => exportarCsv(colunasDe(def), rows, `${def.id}-${new Date().toISOString().slice(0, 10)}`);

  const toggleSort = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div className="page">
      <PageHead
        title={def.title}
        description={def.description}
        actions={
          <>
            <button
              className="btn btn--ghost" disabled={!rows.length || exportando}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuExportar({ x: r.left, y: r.bottom + 6 }); }}
            >
              <Download size={16} /> {exportando ? 'Gerando…' : 'Exportar'} <ChevronDown size={14} />
            </button>
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

      <div className="panel">
        <div className="toolbar">
          <label className="search">
            <Search size={16} />
            <input placeholder="Buscar" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </label>
          {filterField?.options && (
            <select className="input input--sm" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} aria-label={`Filtrar por ${filterField.label}`}>
              <option value="">{filterField.label}: todos</option>
              {filterField.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {padraoPeriodo && (
            <select className="input input--sm" value={periodo} onChange={(e) => { setPeriodo(e.target.value as PeriodoKey); setPage(0); }} aria-label="Período">
              {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
          <span className="muted toolbar__count">{num(rows.length)} {rows.length === 1 ? 'registro' : 'registros'}</span>
        </div>

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
        ) : (
          <div className="table-wrap">
            <table className="table table--cards">
              <thead>
                <tr>
                  {def.comFoto && <th className="foto-col">Foto</th>}
                  {tableFields.map((f) => (
                    <th key={f.key} className={['money', 'number', 'percent'].includes(f.type) ? 'num' : ''}>
                      <button onClick={() => toggleSort(f.key)}>
                        {f.label}
                        {sort.key === f.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  ))}
                  {def.computed?.map((c) => <th key={c.label} className={c.format === 'badge' || c.format === 'text' ? '' : 'num'}>{c.label}</th>)}
                  <th className="actions-col" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="is-clickable" onClick={() => setEditing(r)} title={canEdit ? 'Clique para editar' : 'Clique para ver os detalhes'}>
                    {def.comFoto && (
                      <td className="foto-col" data-label="Foto">
                        {typeof r.foto === 'string' && r.foto ? <img className="thumb" src={r.foto} alt="" loading="lazy" /> : <span className="thumb thumb--vazio"><ImageOff size={14} /></span>}
                      </td>
                    )}
                    {tableFields.map((f) => (
                      <td key={f.key} data-label={f.label} className={cellClass(f)}>{formatField(f, r[f.key])}</td>
                    ))}
                    {def.computed?.map((c) => (
                      <td key={c.label} data-label={c.label} className={c.format === 'badge' || c.format === 'text' ? 'nowrap' : 'num'}>{formatComputed(c, r)}</td>
                    ))}
                    <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                      <div className="row-actions">
                        {rowActions?.(r, canEdit)}
                        <button className="icon-btn" onClick={() => setEditing(r)} aria-label={canEdit ? 'Editar' : 'Visualizar'} title={canEdit ? 'Editar' : 'Visualizar'}>
                          <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="pager">
            <button className="btn btn--ghost btn--sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
            <span className="muted">Página {page + 1} de {pages}</span>
            <button className="btn btn--ghost btn--sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</button>
          </div>
        )}
      </div>

      {editing && (
        <RecordForm
          def={def}
          row={editing === 'new' ? null : editing}
          // registro novo depende de "Criar"; um existente, de "Editar"
          canEdit={editing === 'new' ? canCreate : canEdit}
          defaults={newDefaults}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing === 'new') await col.add(data);
            else await col.update(editing.id, data);
            notify(editing === 'new' ? 'Registro criado' : 'Alterações salvas');
            setEditing(null);
          }}
          onDelete={
            editing !== 'new' && canDelete
              ? async () => {
                  await col.remove(editing.id);
                  notify('Registro excluído');
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function RecordForm({ def, row, canEdit, defaults, onClose, onSave, onDelete }: {
  def: CollectionDef; row: Row | null; canEdit: boolean; defaults?: Record<string, unknown>;
  onClose: () => void; onSave: (d: Record<string, unknown>) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [data, setData] = useState<Record<string, unknown>>(() => {
    if (row) return { ...row };
    const init: Record<string, unknown> = {};
    for (const f of def.fields) if (f.default !== undefined) init[f.key] = f.default;
    return { ...init, ...defaults };
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return onClose();
    const missing = def.fields.find((f) => f.required && (data[f.key] === undefined || data[f.key] === ''));
    if (missing) return setError(`Preencha o campo "${missing.label}".`);
    const semVinculo = def.fields.find((f) => f.type === 'ref' && !f.livre && data[f.key] && (data[f.refKey!] === undefined || data[f.refKey!] === null || data[f.refKey!] === ''));
    if (semVinculo) return setError(`Selecione "${semVinculo.label}" na lista.`);
    for (const f of def.fields) {
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
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of def.fields) {
        payload[f.key] = data[f.key] ?? '';
        if (f.refKey) payload[f.refKey] = data[f.refKey] ?? null;
        for (const extra of Object.keys(f.fill ?? {})) if (!def.fields.some((x) => x.key === extra)) payload[extra] = data[extra] ?? '';
      }
      if (def.comFoto) payload.foto = data.foto ?? '';
      await onSave(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  const title = row ? (canEdit ? `Editar ${def.singular}` : termos(def).detalhes) : termos(def).novo;

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
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose}>{canEdit ? 'Cancelar' : 'Fechar'}</button>
          {canEdit && <button className="btn btn--primary" form="record-form" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>}
        </>
      }
    >
      <form id="record-form" className="form-grid" onSubmit={submit}>
        {def.comFoto && (
          <FotoCampo valor={typeof data.foto === 'string' ? data.foto : ''} disabled={!canEdit} onChange={(foto) => setData((d) => ({ ...d, foto }))} />
        )}
        {def.fields.map((f) => (
          <div key={f.key} className={`form-field ${f.wide || f.type === 'textarea' ? 'form-field--wide' : ''}`}>
            <label htmlFor={`f-${f.key}`}>{f.label}{f.required && canEdit && <span className="req"> *</span>}</label>
            {f.type === 'ref' ? (
              <RefPicker id={`f-${f.key}`} field={f} value={data[f.key]} linkedId={data[f.refKey!]} disabled={!canEdit} onChange={(patch) => setData((d) => ({ ...d, ...patch }))} />
            ) : (
              <FieldInput field={f} value={data[f.key]} disabled={!canEdit} onChange={(v) => setData((d) => ({ ...d, [f.key]: v }))} />
            )}
          </div>
        ))}
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
function FotoCampo({ valor, disabled, onChange }: { valor: string; disabled: boolean; onChange: (foto: string) => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const escolher = async (arquivo?: File) => {
    if (!arquivo) return;
    setErro(null);
    try {
      onChange(await reduzirFoto(arquivo, 640, false));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler a imagem.');
    }
  };
  return (
    <div className="form-field form-field--wide foto-campo">
      <label>Foto</label>
      <div className="foto-campo__linha">
        <div className="foto-campo__previa">{valor ? <img src={valor} alt="Foto do registro" /> : <ImageOff size={22} />}</div>
        {!disabled && (
          <div className="foto-campo__acoes">
            <label className="btn btn--ghost btn--sm">
              <Camera size={14} /> {valor ? 'Trocar foto' : 'Escolher foto'}
              <input type="file" accept="image/*" hidden onChange={(e) => { void escolher(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {valor && <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange('')}><Trash2 size={14} /> Remover</button>}
            <span className="muted small">JPG ou PNG. A imagem é reduzida automaticamente.</span>
          </div>
        )}
      </div>
      {erro && <p className="error">{erro}</p>}
    </div>
  );
}
