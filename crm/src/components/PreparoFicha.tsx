import { useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered, Plus, Wand2, X } from 'lucide-react';
import type { Field } from '../collections';
import { brl } from '../lib/format';
import { gerarPassos, TECNICAS, UTENSILIOS_DA_TECNICA, type Ficha, type Recipiente } from '../lib/ficha';
import { RefPicker } from './pickers';

const CAMPO_COPO: Field = { key: 'copo', label: 'Copo', type: 'ref', ref: 'copos', refKey: 'copoId', livre: true };
const CAMPO_UTENSILIO: Field = { key: 'novo', label: 'Utensílio', type: 'ref', ref: 'utensilios', refKey: 'novoId', livre: true };
/** Sugestões ("s:") não estão em nenhum cadastro: ficam como texto, sem vínculo. */
const vinculo = (id: unknown) => (typeof id === 'string' && id && !id.startsWith('s:') ? id : null);

/**
 * Preparo da ficha técnica: técnica, copo e utensílios (ligados ao Estoque e aos Materiais),
 * passo a passo numerado e finalização. "Gerar passo a passo" monta um rascunho com os insumos da receita.
 */
export function PreparoFicha({ ficha, copos, utensilios, disabled, producao, onChange }: {
  ficha: Ficha; copos: Recipiente[]; utensilios: Recipiente[]; disabled: boolean;
  /** Receita de produção própria (Estoque): sem técnica de drink, copo nem rascunho; o fim vira "como guardar". */
  producao?: boolean;
  onChange: (f: Ficha) => void;
}) {
  const [novoUtensilio, setNovoUtensilio] = useState('');
  const mudar = (patch: Partial<Ficha>) => onChange({ ...ficha, ...patch });
  const mudarPasso = (i: number, texto: string) => mudar({ passos: ficha.passos.map((p, j) => (j === i ? texto : p)) });
  const focar = (i: number) => setTimeout(() => document.querySelector<HTMLInputElement>(`[data-passo="${i}"]`)?.focus(), 0);
  const inserirPasso = (depois: number) => {
    const passos = [...ficha.passos];
    passos.splice(depois + 1, 0, '');
    mudar({ passos });
    focar(depois + 1);
  };
  const mover = (i: number, d: -1 | 1) => {
    const passos = [...ficha.passos];
    [passos[i], passos[i + d]] = [passos[i + d], passos[i]];
    mudar({ passos });
  };

  const escolherCopo = (patch: Record<string, unknown>) => {
    // escolher na lista traz o vínculo; digitar desfaz (o seletor já manda copoId nulo nesse caso)
    const copoId = 'copoId' in patch ? vinculo(patch.copoId) : ficha.copoId;
    const r = copoId ? copos.find((c) => c.id === copoId) : undefined;
    // copo descartável do Estoque entra no custo da porção
    mudar({ copo: String(patch.copo ?? ''), copoId, copoCusto: r?.descartavel ? r.custo : 0 });
  };
  const adicionarUtensilio = (nome: string, id: string | null) => {
    if (!nome.trim() || ficha.utensilios.some((u) => u.nome.toLowerCase() === nome.trim().toLowerCase())) return setNovoUtensilio('');
    mudar({ utensilios: [...ficha.utensilios, { id, nome: nome.trim() }] });
    setNovoUtensilio('');
  };

  const gerar = () => {
    const sugeridos = (UTENSILIOS_DA_TECNICA[ficha.tecnica || 'Montado'] ?? []).filter((n) => !ficha.utensilios.some((u) => u.nome.toLowerCase() === n.toLowerCase()));
    // cada utensílio sugerido usa o item do cadastro com esse nome, quando houver (ex.: "Bailarina" em Materiais)
    const ligar = (nome: string) => {
      const chave = nome.split(' ')[0].toLowerCase();
      const r = utensilios.find((u) => vinculo(u.id) && u.nome.toLowerCase().includes(chave));
      return r ? { id: r.id, nome: r.nome } : { id: null, nome };
    };
    const novos = sugeridos.map(ligar).filter((u, i, l) => !ficha.utensilios.some((x) => x.nome === u.nome) && l.findIndex((y) => y.nome === u.nome) === i);
    onChange({ ...ficha, passos: gerarPassos(ficha), utensilios: [...ficha.utensilios, ...novos] });
  };
  const copoDescartavel = ficha.copoCusto > 0;

  return (
    <div className="preparo">
      <div className="preparo__cab"><ListOrdered size={15} /> Preparo</div>

      {!producao && <div className="preparo__grade">
        <div className="form-field">
          <label>Técnica</label>
          <div className="preparo__tecnicas" role="radiogroup" aria-label="Técnica">
            {TECNICAS.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={ficha.tecnica === t} disabled={disabled}
                className={`ficha__fixo ${ficha.tecnica === t ? 'is-on' : ''}`} onClick={() => mudar({ tecnica: ficha.tecnica === t ? '' : t })}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="ficha-copo">Copo</label>
          <RefPicker id="ficha-copo" field={CAMPO_COPO} value={ficha.copo} linkedId={ficha.copoId} disabled={disabled} onChange={escolherCopo} />
          {copoDescartavel && <span className="muted small">Descartável do Estoque: {brl(ficha.copoCusto)} por drink, somado ao custo da porção.</span>}
        </div>
      </div>}

      <div className="form-field">
        <label>Utensílios</label>
        <div className="preparo__utensilios">
          {ficha.utensilios.map((u) => (
            <span key={u.nome} className={`preparo__tag ${u.id ? 'is-ligado' : ''}`} title={u.id ? 'Ligado ao cadastro' : 'Digitado'}>
              {u.nome}
              {!disabled && <button type="button" aria-label={`Tirar ${u.nome}`} onClick={() => mudar({ utensilios: ficha.utensilios.filter((x) => x.nome !== u.nome) })}><X size={12} /></button>}
            </span>
          ))}
          {!disabled && (
            <div className="preparo__novo-utensilio">
              <RefPicker
                field={CAMPO_UTENSILIO} value={novoUtensilio} linkedId={null}
                onChange={(p) => ('novoId' in p ? adicionarUtensilio(String(p.novo ?? ''), vinculo(p.novoId)) : setNovoUtensilio(String(p.novo ?? '')))}
              />
            </div>
          )}
          {disabled && !ficha.utensilios.length && <span className="muted small">—</span>}
        </div>
      </div>

      <div className="form-field">
        <div className="preparo__passos-cab">
          <label>Passo a passo</label>
          {!disabled && !producao && (ficha.itens.length > 0 || ficha.fixos.length > 0) && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={gerar} title="Monta um rascunho com a técnica, os insumos, o copo e as guarnições">
              <Wand2 size={13} /> {ficha.passos.length ? 'Gerar de novo' : 'Gerar passo a passo'}
            </button>
          )}
        </div>
        <ol className="preparo__passos">
          {ficha.passos.map((p, i) => (
            <li key={i} className="preparo__passo">
              <span className="preparo__num">{i + 1}</span>
              <input
                className="input" data-passo={i} maxLength={300} disabled={disabled} value={p} placeholder="Descreva o passo"
                onChange={(e) => mudarPasso(i, e.target.value)}
                // Enter cria o próximo passo (sem enviar o formulário); Backspace num passo vazio apaga o passo
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); inserirPasso(i); }
                  if (e.key === 'Backspace' && !p && ficha.passos.length > 1) { e.preventDefault(); mudar({ passos: ficha.passos.filter((_, j) => j !== i) }); focar(Math.max(0, i - 1)); }
                }}
              />
              {!disabled && (
                <span className="preparo__acoes">
                  <button type="button" className="icon-btn" aria-label="Subir passo" disabled={i === 0} onClick={() => mover(i, -1)}><ArrowUp size={14} /></button>
                  <button type="button" className="icon-btn" aria-label="Descer passo" disabled={i === ficha.passos.length - 1} onClick={() => mover(i, 1)}><ArrowDown size={14} /></button>
                  <button type="button" className="icon-btn" aria-label="Apagar passo" onClick={() => mudar({ passos: ficha.passos.filter((_, j) => j !== i) })}><X size={14} /></button>
                </span>
              )}
            </li>
          ))}
        </ol>
        {!disabled && (
          <button type="button" className="btn btn--ghost btn--sm preparo__add" onClick={() => inserirPasso(ficha.passos.length - 1)}>
            <Plus size={13} /> Adicionar passo
          </button>
        )}
        {disabled && !ficha.passos.length && <span className="muted small">Sem passo a passo.</span>}
      </div>

      <div className="form-field">
        <label htmlFor="ficha-montagem">{producao ? 'Como guardar' : 'Finalização e decoração'}</label>
        <textarea id="ficha-montagem" className="input" rows={2} maxLength={1000} disabled={disabled} value={ficha.montagem} onChange={(e) => mudar({ montagem: e.target.value })}
          placeholder={producao ? 'Ex.: garrafa de vidro fechada, na geladeira, com etiqueta da data' : 'Ex.: rodela de laranja na borda, servir com canudo'} />
      </div>
    </div>
  );
}
