import { useEffect, useRef, useState, type ReactNode } from 'react';
import { numberSpec, type CollectionDef, type Field } from '../collections';
import type { Row } from '../lib/data';
import { camposDosLocais, locaisDe, type Locais } from '../lib/locais';
import { NumberInput, notify } from './ui';
import { listaDe, SelectComOutro } from './OpcaoOutro';

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
 * Nos itens com quantidade por local, aparece um campo para cada local, ali mesmo na linha.
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
    if (!editando) return;
    const el = caixa.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
    el?.focus();
    if (el instanceof HTMLInputElement && el.type !== 'date') el.select();
  }, [editando]);

  /** Locais do item; sem nenhum, a quantidade vai para o local cadastrado (ou o Depósito). */
  const locaisAtuais = (): Locais => {
    const l = locaisDe(row);
    return Object.keys(l).length ? l : { [String(row.local || 'Depósito')]: 0 };
  };
  const abrir = () => { setValor(porLocal ? locaisAtuais() : row[field.key] ?? ''); setEditando(true); };

  const salvar = async (v: unknown = valor) => {
    if (salvando) return;
    if (porLocal) return salvarLocais(v as Locais);
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

  const salvarLocais = async (l: Locais) => {
    const limpos = Object.fromEntries(Object.entries(l).map(([k, q]) => [k, Number(q) || 0]).filter(([, q]) => (q as number) > 0)) as Locais;
    if (JSON.stringify(limpos) === JSON.stringify(locaisDe(row))) { setEditando(false); return; }
    setSalvando(true);
    try {
      await onSalvar(camposDosLocais(limpos, def.fields.some((f) => f.key === 'local')));
      notify('Quantidade atualizada.');
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

  if (!editando) {
    return <button type="button" className="celula-rapida" onClick={abrir} title={`Alterar ${field.label.toLowerCase()}`}>{children}</button>;
  }

  return (
    <div ref={caixa} className={`celula-rapida__campo${salvando ? ' is-salvando' : ''}`} onKeyDown={teclas}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) void salvar(); }}>
      {porLocal ? (
        <div className="celula-rapida__locais">
          {Object.entries(valor as Locais).map(([local, q]) => (
            <NumberInput key={local} ariaLabel={`Quantidade em ${local}`} spec={{ decimals: 3, min: 0, max: 1_000_000 }} value={q}
              prefix={Object.keys(valor as Locais).length > 1 ? local : undefined}
              onChange={(v) => setValor({ ...(valor as Locais), [local]: v === '' ? 0 : v })} />
          ))}
        </div>
      ) : field.type === 'select' ? (
        <SelectComOutro className="input input--sm" aria-label={field.label} value={String(valor ?? '')} options={field.options ?? []}
          lista={listaDe(def.id, field.key)} rotulo={field.label} vazio={field.required ? undefined : '—'}
          onChange={setValor} onEscolha={(v) => void salvar(v)} />
      ) : field.type === 'date' ? (
        <input type="date" className="input input--sm" aria-label={field.label} value={String(valor ?? '')} onChange={(e) => setValor(e.target.value)} />
      ) : (
        <NumberInput ariaLabel={field.label} spec={numberSpec(field)} value={valor} onChange={setValor}
          prefix={field.type === 'money' ? 'R$' : undefined} suffix={field.type === 'percent' ? '%' : undefined} />
      )}
    </div>
  );
}
