import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { CollectionDef } from '../collections';
import { api } from '../lib/api';
import type { Row } from '../lib/data';
import { dadosParaMover, obrigatoriosQueFaltam, registroParaMover } from '../lib/mover';
import { FieldInput, Modal, notify } from './ui';

/** Mover os itens selecionados na lista para outra tela do mesmo fluxo, de uma vez. */
export function MoverVarios({ def, rows, destinos, onClose, onFim }: {
  def: CollectionDef; rows: Row[]; destinos: CollectionDef[];
  onClose: () => void; onFim: (movidos: string[]) => Promise<void>;
}) {
  const [destino, setDestino] = useState(destinos[0]);
  const [extras, setExtras] = useState<Record<string, unknown>>({});
  const [feitos, setFeitos] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const titulo = (r: Row) => String(r[def.fields[0].key] ?? '').trim() || '—';
  const faltam = useMemo(() => obrigatoriosQueFaltam(def, destino, rows), [def, destino, rows]);
  const ficam = useMemo(() => [...new Set(rows.flatMap((r) => dadosParaMover(def, destino, r).ficam))], [def, destino, rows]);

  const mover = async () => {
    const vazio = faltam.find((f) => extras[f.key] === undefined || extras[f.key] === '');
    if (vazio) return setErro(`Escolha "${vazio.label}" para os itens que não têm.`);
    setErro(null);
    setFeitos(0);
    const movidos: string[] = [];
    let falha = '';
    for (const r of rows) {
      try {
        const { dados } = dadosParaMover(def, destino, r);
        const { corpo, falta } = registroParaMover(destino, dados, extras);
        if (falta) throw new Error(`"${titulo(r)}" ficou sem ${falta}.`);
        if (destino.anexos) {
          // os PDFs vão como arquivos novos (os da origem são apagados junto com ela)
          const ids = Array.isArray(dados.anexos) ? (dados.anexos as { id: string }[]).map((a) => a.id) : [];
          corpo.anexos = [];
          corpo.anexosNovos = await Promise.all(ids.map(async (id) => {
            const a = await api<{ nome: string; dados: string }>(`/crm/anexos/${encodeURIComponent(id)}`);
            return { nome: a.nome, dados: a.dados };
          }));
        }
        await api(`/crm/c/${destino.id}`, { method: 'POST', body: corpo });
        movidos.push(r.id);
        try {
          await api(`/crm/c/${def.id}/${r.id}`, { method: 'DELETE' });
        } catch {
          falha ||= `"${titulo(r)}" foi copiado, mas não deu para excluir daqui. Exclua manualmente.`;
        }
      } catch (e) {
        falha ||= e instanceof Error ? e.message : 'Não foi possível mover.';
      }
      setFeitos((n) => (n ?? 0) + 1);
    }
    await onFim(movidos);
    if (falha) notify(`${movidos.length} de ${rows.length} movidos para ${destino.title}. ${falha}`, 'error');
    else notify(`${movidos.length} ${movidos.length === 1 ? 'item movido' : 'itens movidos'} para ${destino.title}`);
    onClose();
  };

  const ocupado = feitos !== null;
  return (
    <Modal
      title={`Mover ${rows.length} ${rows.length === 1 ? 'item' : 'itens'}`}
      onClose={() => !ocupado && onClose()}
      width={560}
      footer={
        <>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={onClose} disabled={ocupado}>Cancelar</button>
          <button className="btn btn--primary" type="button" onClick={() => void mover()} disabled={ocupado}>
            <ArrowLeftRight size={16} /> {ocupado ? `Movendo… ${feitos}/${rows.length}` : `Mover para ${destino.title}`}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {destinos.length > 1 && (
          <div className="form-field form-field--wide">
            <label>Para onde</label>
            <div className="segmented mover-destinos" role="radiogroup">
              {destinos.map((d) => (
                <button key={d.id} type="button" role="radio" aria-checked={d === destino} className={d === destino ? 'is-active' : ''} disabled={ocupado}
                  onClick={() => { setDestino(d); setExtras({}); }}>{d.title}</button>
              ))}
            </div>
          </div>
        )}
        <p className="mover-aviso form-field--wide">
          <ArrowLeftRight size={15} />
          <span>
            Saem de {def.title} e passam para {destino.title}: {rows.slice(0, 6).map(titulo).join(', ')}{rows.length > 6 && ` e mais ${rows.length - 6}`}.
            {' '}Os registros antigos são excluídos.
            {ficam.length > 0 && <> Não vão junto: {ficam.join(', ')}.</>}
            {def.id === 'estoque' && <> Fichas técnicas que usam estes itens deixam de dar baixa neles.</>}
          </span>
        </p>
        {faltam.map((f) => (
          <div key={f.key} className="form-field">
            <label htmlFor={`f-${f.key}`}>{f.label} <span className="muted small">(para os que não têm)</span><span className="req"> *</span></label>
            <FieldInput field={f} value={extras[f.key]} disabled={ocupado} onChange={(v) => setExtras((x) => ({ ...x, [f.key]: v }))} />
          </div>
        ))}
        {erro && <p className="error form-field--wide">{erro}</p>}
      </div>
    </Modal>
  );
}
