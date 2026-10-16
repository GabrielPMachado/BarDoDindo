import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { areaLabel, pageOf, useAtividades } from '../components/Atividades';
import { EmptyState, Loading, PageHead } from '../components/ui';
import { num } from '../lib/format';
import { exportarCsv } from '../lib/exportar';
import type { Row } from '../lib/data';

/** Logs de alterações: tudo o que a equipe cadastrou, alterou ou excluiu, nas áreas que a pessoa pode ver. */
export default function Logs() {
  const { items, loading } = useAtividades();
  const navigate = useNavigate();
  const [area, setArea] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [q, setQ] = useState('');
  const areas = [...new Set(items.map((a) => a.area))];
  const pessoas = [...new Map(items.map((a) => [a.usuarioId, a.usuarioNome])).entries()].sort((x, y) => x[1].localeCompare(y[1], 'pt-BR'));
  const termo = q.trim().toLowerCase();
  const lista = items.filter((a) => (!area || a.area === area) && (!pessoa || a.usuarioId === pessoa)
    && (!termo || [a.acao, a.alvo, a.detalhe, a.usuarioNome].some((x) => String(x ?? '').toLowerCase().includes(termo))));
  const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="page">
      <PageHead
        title="Logs de alterações"
        description="Quem cadastrou, alterou ou excluiu o quê, e quando (as 200 alterações mais recentes das áreas que você acessa)."
        actions={
          <button className="btn btn--ghost" disabled={!lista.length} onClick={() => exportarCsv(
            [
              { titulo: 'Data e hora', tipo: 'texto', valor: (r) => quando(String(r.criadoEm)) }, { titulo: 'Usuário', tipo: 'texto', valor: (r) => r.usuarioNome },
              { titulo: 'Área', tipo: 'texto', valor: (r) => areaLabel(String(r.area)) }, { titulo: 'Ação', tipo: 'texto', valor: (r) => r.acao },
              { titulo: 'Registro', tipo: 'texto', valor: (r) => r.alvo }, { titulo: 'Detalhe', tipo: 'texto', valor: (r) => r.detalhe },
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
            <option value="">Área: todas</option>
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
              <thead><tr><th>Data e hora</th><th>Usuário</th><th>Área</th><th>Alteração</th><th>Detalhe</th><th className="actions-col" /></tr></thead>
              <tbody>
                {lista.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Data e hora" className="nowrap">{quando(a.criadoEm)}</td>
                    <td data-label="Usuário" className="nowrap">{a.usuarioNome}</td>
                    <td data-label="Área" className="nowrap">{areaLabel(a.area)}</td>
                    <td data-label="Alteração" className="text-wide">{a.acao}{a.alvo ? <> <b>{a.alvo}</b></> : null}</td>
                    <td data-label="Detalhe" className="text muted">{a.detalhe || '—'}</td>
                    <td className="actions-col">
                      {pageOf(a) && <button className="icon-btn" onClick={() => navigate(pageOf(a)!)} aria-label="Abrir a página" title="Abrir a página"><ArrowUpRight size={16} /></button>}
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
