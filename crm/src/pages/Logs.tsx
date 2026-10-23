import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Eye, History, RotateCcw, Search, Trash2, Undo2 } from 'lucide-react';
import { ApiError } from '../../../shared/backend';
import { areaLabel, pageOf, useAtividades, type Atividade } from '../components/Atividades';
import { confirmar } from '../components/pickers';
import { Badge, EmptyState, Loading, Modal, PageHead, notify } from '../components/ui';
import { COLLECTIONS, type Field } from '../collections';
import { api } from '../lib/api';
import { brl, dateBR, num } from '../lib/format';
import { maskPhone } from '../lib/masks';
import { exportarCsv } from '../lib/exportar';
import { reload, type Row } from '../lib/data';
import { useSession } from '../lib/session';

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
/** Cadastros com efeitos próprios (estoque, pontos, receitas): corrigidos pelo próprio módulo. Igual a SEM_DESFAZER no backend. */
const SEM_DESFAZER = ['consumos', 'resgates', 'compras'];
const NOMES: Record<string, string> = {
  criadoEm: 'Criado em', locais: 'Quantidade por local', ficha: 'Ficha técnica', itens: 'Itens', lancamentos: 'Lançamentos no DRE',
  foto: 'Foto', anexos: 'PDFs anexados', permissoes: 'Permissões', descricaoNota: 'Descrição na nota',
};
const campoDe = (colecao: string, k: string): Field | undefined => COLLECTIONS[colecao]?.fields.find((f) => f.key === k);
const rotulo = (colecao: string, k: string) => campoDe(colecao, k)?.label ?? NOMES[k] ?? k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
/** Identificadores internos de vínculos (ex.: clienteId) não interessam a quem lê. */
const oculto = (k: string) => /Id$/.test(k) || k === 'sistema';

function valor(colecao: string, k: string, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  const f = campoDe(colecao, k);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.length ? `${v.length} ${v.length === 1 ? 'item' : 'itens'}` : '—';
  if (typeof v === 'object') {
    if (k === 'ficha') { const it = (v as { itens?: unknown[] }).itens; const n = Array.isArray(it) ? it.length : 0; return `${n} ${n === 1 ? 'insumo' : 'insumos'}`; }
    return Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== '' && !(Array.isArray(x) && !x.length))
      .map(([a, x]) => `${a}: ${typeof x === 'object' ? (Array.isArray(x) ? x.join(', ') : '…') : String(x)}`).join(' · ') || '—';
  }
  if (f?.type === 'money') return brl(Number(v));
  if (f?.type === 'date' || /Em$/.test(k)) return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? (String(v).length > 10 ? quando(String(v)) : dateBR(v)) : String(v);
  if (f?.type === 'percent') return `${num(Number(v), 1)}%`;
  if (f?.type === 'number') return num(Number(v), 3);
  if (f?.type === 'phone') return maskPhone(v);
  if (f?.type === 'time') return String(v).slice(0, 5);
  return String(v);
}

type Tipo = 'cadastro' | 'alteracao' | 'exclusao' | 'outro';
const tipoDe = (a: Atividade): Tipo =>
  a.acao.startsWith('cadastrou') || a.acao.startsWith('restaurou') ? 'cadastro'
    : a.acao.startsWith('excluiu') || a.acao.startsWith('desfez o cadastro') ? 'exclusao'
      : a.acao.startsWith('alterou') || a.acao.startsWith('desfez a alteração') ? 'alteracao' : 'outro';

/** O que exatamente mudou, e o botão de desfazer. */
function Detalhe({ a, desfeitaPor, onClose }: { a: Atividade; desfeitaPor?: Atividade; onClose: () => void }) {
  const { pode } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const tipo = tipoDe(a);
  const col = a.colecao ?? '';
  const detalhado = !!a.registroId;
  const omitidos = a.omitidos ?? [];
  const chaves = [...new Set([...Object.keys(a.antes ?? {}), ...Object.keys(a.depois ?? {})])].filter((k) => !oculto(k))
    .sort((x, y) => {
      const ordem = COLLECTIONS[col]?.fields.map((f) => f.key) ?? [];
      const ix = ordem.indexOf(x), iy = ordem.indexOf(y);
      return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy);
    });

  // o que dá para desfazer, e com que permissão
  const acao = !detalhado || SEM_DESFAZER.includes(col) || tipo === 'outro' ? null
    : a.acao.startsWith('cadastrou') ? { label: 'Excluir o que foi cadastrado', icon: Trash2, perm: 'excluir' as const, aviso: 'O registro criado nesta atividade será excluído.' }
      : a.acao.startsWith('excluiu') ? { label: 'Restaurar o registro', icon: RotateCcw, perm: 'criar' as const, aviso: 'O registro volta como estava ao ser excluído (a foto e os PDFs não voltam).' }
        : tipo === 'alteracao' ? { label: 'Desfazer esta alteração', icon: Undo2, perm: 'editar' as const, aviso: 'Os campos voltam aos valores de antes desta alteração.' }
          : null;

  const desfazer = async () => {
    if (!acao || !(await confirmar({ title: `${acao.label}?`, message: acao.aviso, confirmLabel: acao.label, danger: acao.perm === 'excluir' }))) return;
    setBusy(true);
    const enviar = (forcar = false) => api(`/crm/atividades/${a.area}/${a.id}/desfazer`, { method: 'POST', body: { forcar } });
    try {
      try {
        await enviar();
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409)) throw e;
        if (!(await confirmar({ title: 'Sobrescrever mudanças mais novas?', message: e.message, confirmLabel: 'Desfazer mesmo assim', danger: true }))) return;
        await enviar(true);
      }
      await Promise.all([reload('/crm/atividades'), reload(`/crm/c/${col}`)]);
      notify('Pronto: alteração desfeita.');
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível desfazer.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pagina = pageOf(a);
  return (
    <Modal
      title="Detalhe da alteração" onClose={onClose} width={720}
      footer={
        <>
          {pagina && <button className="btn btn--ghost" onClick={() => { onClose(); navigate(pagina); }}><ArrowUpRight size={15} /> Abrir a página</button>}
          <span className="spacer" />
          {acao && !desfeitaPor && pode(col, acao.perm) && (
            <button className={`btn ${acao.perm === 'excluir' ? 'btn--danger' : 'btn--primary'}`} disabled={busy} onClick={() => void desfazer()}>
              <acao.icon size={16} /> {busy ? 'Desfazendo…' : acao.label}
            </button>
          )}
        </>
      }
    >
      <div className="log-detalhe">
        <p className="log-detalhe__quem">
          <b>{a.usuarioNome}</b> {a.acao}{a.alvo ? <> <em>{a.alvo}</em></> : null}
          <span className="muted small">{quando(a.criadoEm)} · {areaLabel(a.area)}</span>
        </p>
        {desfeitaPor && <p className="log-detalhe__aviso"><History size={15} /> Já desfeita por <b>{desfeitaPor.usuarioNome}</b> em {quando(desfeitaPor.criadoEm)}.</p>}
        {!detalhado ? (
          <p className="muted">Esta atividade foi registrada antes do histórico detalhado: dá para ver o resumo{a.detalhe ? ` (${a.detalhe})` : ''}, mas não os valores nem desfazer.</p>
        ) : chaves.length ? (
          <table className="table log-detalhe__tabela">
            <thead>
              <tr>
                <th>Campo</th>
                {tipo === 'alteracao' ? <><th>Antes</th><th aria-label="para" /><th>Depois</th></> : <th>{tipo === 'exclusao' ? 'Como estava' : 'Valor'}</th>}
              </tr>
            </thead>
            <tbody>
              {chaves.map((k) => (
                <tr key={k}>
                  <td className="muted nowrap">{rotulo(col, k)}</td>
                  {tipo === 'alteracao' ? (
                    <>
                      <td className="log-detalhe__antes">{valor(col, k, a.antes?.[k])}</td>
                      <td className="muted"><ArrowRight size={14} /></td>
                      <td className="log-detalhe__depois">{valor(col, k, a.depois?.[k])}</td>
                    </>
                  ) : <td>{valor(col, k, (tipo === 'exclusao' ? a.antes : a.depois)?.[k])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">{a.detalhe || 'Sem campos alterados.'}</p>}
        {omitidos.filter((k) => !oculto(k)).length > 0 && (
          <p className="muted small">Também mudou: {omitidos.filter((k) => !oculto(k)).map((k) => rotulo(col, k).toLowerCase()).join(', ')} (não fica no histórico e não volta ao desfazer).</p>
        )}
        {detalhado && SEM_DESFAZER.includes(col) && <p className="muted small">Este cadastro mexe em estoque, pontos ou receitas: para corrigir, use o próprio módulo (excluir estorna).</p>}
        {acao && !desfeitaPor && !pode(col, acao.perm) && <p className="muted small">Sua função não tem permissão para desfazer neste cadastro.</p>}
      </div>
    </Modal>
  );
}

/** Logs de alterações: tudo o que a equipe cadastrou, alterou ou excluiu, com o antes e depois de cada campo e o botão de desfazer. */
export default function Logs() {
  const { items, loading } = useAtividades();
  const [area, setArea] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [q, setQ] = useState('');
  const [aberta, setAberta] = useState<Atividade | null>(null);
  const areas = [...new Set(items.map((a) => a.area))];
  const pessoas = [...new Map(items.map((a) => [a.usuarioId, a.usuarioNome])).entries()].sort((x, y) => x[1].localeCompare(y[1], 'pt-BR'));
  const termo = q.trim().toLowerCase();
  const lista = items.filter((a) => (!area || a.area === area) && (!pessoa || a.usuarioId === pessoa)
    && (!termo || [a.acao, a.alvo, a.detalhe, a.usuarioNome].some((x) => String(x ?? '').toLowerCase().includes(termo))));
  const desfeitaPor = (a: Atividade) => items.find((x) => x.desfaz === a.id);
  const resumo = (a: Atividade) => {
    if (!a.registroId) return a.detalhe || '—';
    if (tipoDe(a) === 'alteracao') {
      const ks = Object.keys(a.depois ?? {}).filter((k) => !oculto(k));
      return ks.length ? ks.slice(0, 3).map((k) => `${rotulo(a.colecao ?? '', k)}: ${valor(a.colecao ?? '', k, a.antes?.[k])} → ${valor(a.colecao ?? '', k, a.depois?.[k])}`).join(' · ') + (ks.length > 3 ? ` · +${ks.length - 3}` : '') : (a.detalhe || '—');
    }
    return a.detalhe || '—';
  };

  return (
    <div className="page">
      <PageHead
        title="Logs de alterações"
        description="Quem cadastrou, alterou ou excluiu o quê, e quando. Toque numa linha para ver o antes e depois de cada campo e desfazer."
        actions={
          <button className="btn btn--ghost" disabled={!lista.length} onClick={() => exportarCsv(
            [
              { titulo: 'Data e hora', tipo: 'texto', valor: (r) => quando(String(r.criadoEm)) }, { titulo: 'Usuário', tipo: 'texto', valor: (r) => r.usuarioNome },
              { titulo: 'Área', tipo: 'texto', valor: (r) => areaLabel(String(r.area)) }, { titulo: 'Ação', tipo: 'texto', valor: (r) => r.acao },
              { titulo: 'Registro', tipo: 'texto', valor: (r) => r.alvo }, { titulo: 'Detalhe', tipo: 'texto', valor: (r) => resumo(r as unknown as Atividade) },
            ],
            lista as unknown as Row[], `logs-${new Date().toISOString().slice(0, 10)}`)}>
            Exportar CSV
          </button>
        }
      />
      <div className="panel">
        <div className="toolbar">
          <label className="search"><Search size={16} /><input placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <select className="input input--sm" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Filtrar por área">
            <option value="">Tela: todas</option>
            {areas.map((k) => <option key={k} value={k}>{areaLabel(k)}</option>)}
          </select>
          <select className="input input--sm" value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Filtrar por usuário">
            <option value="">Usuário: todos</option>
            {pessoas.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <span className="muted toolbar__count">{num(lista.length)} {lista.length === 1 ? 'alteração' : 'alterações'}</span>
        </div>
        {loading ? <Loading /> : !lista.length ? <EmptyState title="Nenhuma alteração">Nada registrado com esses filtros.</EmptyState> : (
          <div className="table-wrap">
            <table className="table table--cards">
              <thead><tr><th>Data e hora</th><th>Usuário</th><th>Tela</th><th>Alteração</th><th>O que mudou</th><th className="actions-col" /></tr></thead>
              <tbody>
                {lista.map((a) => {
                  const desfeita = desfeitaPor(a);
                  return (
                    <tr key={a.id} className="is-clickable" onClick={() => setAberta(a)} title="Ver o detalhe e desfazer">
                      <td data-label="Data e hora" className="nowrap">{quando(a.criadoEm)}</td>
                      <td data-label="Usuário" className="nowrap">{a.usuarioNome}</td>
                      <td data-label="Tela" className="nowrap">{areaLabel(a.area)}</td>
                      <td data-label="Alteração" className="text-wide">
                        {a.acao}{a.alvo ? <> <b>{a.alvo}</b></> : null}
                        {desfeita && <> <Badge tone="neutral">desfeita</Badge></>}
                        {a.desfaz && <> <Badge tone="info">desfazer</Badge></>}
                      </td>
                      <td data-label="O que mudou" className="text muted">{resumo(a)}</td>
                      <td className="actions-col">
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setAberta(a); }} aria-label="Ver o detalhe" title="Ver o detalhe e desfazer"><Eye size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {aberta && <Detalhe a={aberta} desfeitaPor={desfeitaPor(aberta)} onClose={() => setAberta(null)} />}
    </div>
  );
}
