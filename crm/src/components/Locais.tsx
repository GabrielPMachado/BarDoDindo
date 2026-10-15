import { useState } from 'react';
import { ArrowLeftRight, MapPin, Plus, Trash2 } from 'lucide-react';
import type { Row } from '../lib/data';
import { camposDosLocais, LOCAIS, locaisDe, totalLocais, type Locais } from '../lib/locais';
import { Modal, NumberInput, notify } from './ui';

const QTD = { decimals: 3, min: 0, max: 1_000_000 };
const qtdTxt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Campo do formulário: quanto tem em cada local, com o total somado. */
export function LocaisCampo({ locais, unidade, disabled, onChange }: {
  locais: Locais; unidade?: string; disabled: boolean; onChange: (l: Locais) => void;
}) {
  const linhas = Object.entries(locais);
  const livres = LOCAIS.filter((l) => !(l in locais));
  const trocar = (antigo: string, novo: string) => {
    const l: Locais = {};
    for (const [k, v] of Object.entries(locais)) l[k === antigo ? novo : k] = v;
    onChange(l);
  };
  return (
    <div className="form-field form-field--wide locais">
      <label><MapPin size={13} /> Quantidade por local</label>
      {linhas.length > 0 && (
        <div className="locais__linhas">
          {linhas.map(([local, qtd]) => (
            <div key={local} className="locais__linha">
              <select className="input" aria-label="Local" disabled={disabled} value={local} onChange={(e) => trocar(local, e.target.value)}>
                {[local, ...livres].map((l) => <option key={l}>{l}</option>)}
              </select>
              <NumberInput ariaLabel={`Quantidade em ${local}`} spec={QTD} suffix={unidade} value={qtd} disabled={disabled}
                onChange={(v) => onChange({ ...locais, [local]: v === '' ? 0 : v })} />
              {!disabled && (
                <button type="button" className="icon-btn" aria-label={`Tirar ${local}`} onClick={() => { const { [local]: _, ...resto } = locais; onChange(resto); }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="locais__rodape">
        {!disabled && livres.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange({ ...locais, [livres[0]]: 0 })}>
            <Plus size={13} /> Adicionar local
          </button>
        )}
        <span className="locais__total">Total: <b>{qtdTxt(totalLocais(locais))}{unidade ? ` ${unidade}` : ''}</b></span>
      </div>
    </div>
  );
}

/** Move uma quantidade de um local para outro. */
export function TransferirModal({ row, nome, unidade, comLocal, onClose, onSalvar }: {
  row: Row; nome: string; unidade?: string; comLocal: boolean;
  onClose: () => void; onSalvar: (dados: Record<string, unknown>) => Promise<void>;
}) {
  const atuais = locaisDe(row);
  const origens = Object.keys(atuais);
  const [de, setDe] = useState(origens[0] ?? '');
  const [para, setPara] = useState(LOCAIS.find((l) => l !== origens[0]) ?? '');
  const [qtd, setQtd] = useState<number | ''>('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const q = Number(qtd) || 0;
    if (!de || !para || de === para) return setErro('Escolha locais diferentes.');
    if (!(q > 0)) return setErro('Informe a quantidade.');
    if (q > (atuais[de] ?? 0)) return setErro(`Em ${de} só tem ${qtdTxt(atuais[de] ?? 0)}.`);
    const l: Locais = { ...atuais, [de]: (atuais[de] ?? 0) - q, [para]: (atuais[para] ?? 0) + q };
    if (!l[de]) delete l[de];
    setSalvando(true);
    try {
      await onSalvar(camposDosLocais(l, comLocal));
      notify(`${qtdTxt(q)}${unidade ? ` ${unidade}` : ''} de ${nome} foram para ${para}.`);
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível transferir.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal title={`Transferir · ${nome}`} onClose={onClose} width={460}
      footer={<><span className="spacer" /><button className="btn btn--ghost" onClick={onClose}>Cancelar</button><button className="btn btn--primary" disabled={salvando} onClick={() => void salvar()}><ArrowLeftRight size={15} /> Transferir</button></>}>
      {origens.length === 0 ? <p className="muted">Este item está sem quantidade em nenhum local.</p> : (
        <div className="form-grid">
          <div className="form-field">
            <label>De</label>
            <select className="input" value={de} onChange={(e) => setDe(e.target.value)}>
              {origens.map((l) => <option key={l} value={l}>{l} ({qtdTxt(atuais[l])})</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Para</label>
            <select className="input" value={para} onChange={(e) => setPara(e.target.value)}>
              {LOCAIS.filter((l) => l !== de).map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-field form-field--wide">
            <label>Quantidade</label>
            <NumberInput spec={QTD} suffix={unidade} value={qtd} onChange={setQtd} />
          </div>
          {erro && <p className="error form-field--wide">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}
