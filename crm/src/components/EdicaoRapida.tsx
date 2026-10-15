import { useEffect, useRef, useState, type ReactNode } from 'react';
import { numberSpec, type CollectionDef, type Field } from '../collections';
import type { Row } from '../lib/data';
import { camposDosLocais, locaisDe, locaisNoFormulario, type Locais } from '../lib/locais';
import { LocaisCampo } from './Locais';
import { Modal, NumberInput, notify } from './ui';

const TIPOS = ['number', 'money', 'percent', 'select', 'date'];
/** Coleções em que a tabela não altera nada direto (o servidor recalcula ou não permite editar). */
const SEM_RAPIDA = ['consumos', 'funcoes'];

/** Campos que dá para alterar direto na tabela, sem abrir o cadastro. */
export function editavelNaTabela(def: CollectionDef, f: Field) {
  if (!TIPOS.includes(f.type) || SEM_RAPIDA.includes(def.id)) return false;
  if (def.compra && f.key === 'valor') return false; // o total da nota vem dos itens
  return true;
}

/**
 * Célula da tabela que vira campo ao tocar: Enter (ou sair do campo) salva, Esc cancela.
 * Nos itens com quantidade por local, a quantidade abre um quadro com cada local.
 */
export function CelulaRapida({ def, field, row, children, onSalvar }: {
  def: CollectionDef; field: Field; row: Row; children: ReactNode;
  onSalvar: (dados: Record<string, unknown>) => Promise<unknown>;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<unknown>(row[field.key] ?? '');
  const [salvando, setSalvando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const porLocal = def.porLocal && field.key === 'quantidade';

  useEffect(() => {
    if (!editando || porLocal) return;
    const el = caixa.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
    el?.focus();
    if (el instanceof HTMLInputElement && el.type !== 'date') el.select();
  }, [editando, porLocal]);

  const abrir = () => { setValor(row[field.key] ?? ''); setEditando(true); };

  const salvar = async (v: unknown = valor) => {
    if (salvando) return;
    const antes = row[field.key] ?? '';
    if (String(v ?? '') === String(antes)) { setEditando(false); return; }
    if (field.required && (v === '' || v === null || v === undefined)) { notify(`${field.label} é obrigatório.`, 'error'); return; }
    setSalvando(true);
    try {
      await onSalvar({ [field.key]: v === '' ? null : v });
      notify(`${field.label} atualizado.`);
      setEditando(false);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível salvar.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void salvar(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditando(false); }
  };

  if (porLocal) {
    return (
      <>
        <button type="button" className="celula-rapida" onClick={abrir} title="Alterar a quantidade por local">{children}</button>
        {editando && (
          <LocaisRapido row={row} nome={String(row[def.fields[0].key] ?? '')} comLocal={def.fields.some((f) => f.key === 'local')}
            onClose={() => setEditando(false)} onSalvar={onSalvar} />
        )}
      </>
    );
  }

  if (!editando) {
    return <button type="button" className="celula-rapida" onClick={abrir} title={`Alterar ${field.label.toLowerCase()}`}>{children}</button>;
  }

  return (
    <div ref={caixa} className={`celula-rapida__campo${salvando ? ' is-salvando' : ''}`} onKeyDown={teclas}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) void salvar(); }}>
      {field.type === 'select' ? (
        <select className="input input--sm" aria-label={field.label} value={String(valor ?? '')}
          onChange={(e) => { setValor(e.target.value); void salvar(e.target.value); }}>
          {!field.required && <option value="">—</option>}
          {[...new Set([...(valor && !field.options?.includes(String(valor)) ? [String(valor)] : []), ...(field.options ?? [])])].map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : field.type === 'date' ? (
        <input type="date" className="input input--sm" aria-label={field.label} value={String(valor ?? '')} onChange={(e) => setValor(e.target.value)} />
      ) : (
        <NumberInput ariaLabel={field.label} spec={numberSpec(field)} value={valor} onChange={setValor}
          prefix={field.type === 'money' ? 'R$' : undefined} suffix={field.type === 'percent' ? '%' : undefined} />
      )}
    </div>
  );
}

function LocaisRapido({ row, nome, comLocal, onClose, onSalvar }: {
  row: Row; nome: string; comLocal: boolean;
  onClose: () => void; onSalvar: (dados: Record<string, unknown>) => Promise<unknown>;
}) {
  const [locais, setLocais] = useState<Locais>(() => locaisNoFormulario(row));
  const [salvando, setSalvando] = useState(false);
  const unidade = typeof row.unidade === 'string' ? row.unidade : undefined;
  const salvar = async () => {
    setSalvando(true);
    try {
      await onSalvar(camposDosLocais(Object.fromEntries(Object.entries(locais).filter(([, q]) => Number(q) > 0)), comLocal));
      notify('Quantidade atualizada.');
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível salvar.', 'error');
      setSalvando(false);
    }
  };
  return (
    <Modal title={`Quantidade · ${nome}`} onClose={onClose} width={460}
      footer={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <LocaisCampo locais={locais} unidade={unidade} disabled={salvando} onChange={setLocais} />
      {Object.keys(locaisDe(row)).length === 0 && <p className="small muted">Ainda sem quantidade: adicione um local.</p>}
    </Modal>
  );
}
