import { useState } from 'react';
import { ChefHat, Undo2 } from 'lucide-react';
import type { Row } from '../lib/data';
import { api } from '../lib/api';
import { brl, dateBR, isoFromToday } from '../lib/format';
import { calcularFicha, fichaDe } from '../lib/ficha';
import { LOCAIS, localPrincipal, locaisDe } from '../lib/locais';
import { confirmar } from './pickers';
import { Modal, NumberInput, notify } from './ui';

const qtdTxt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const MEDIDA: Record<string, { grupo: string; fator: number }> = {
  ml: { grupo: 'volume', fator: 1 }, L: { grupo: 'volume', fator: 1000 }, g: { grupo: 'massa', fator: 1 }, kg: { grupo: 'massa', fator: 1000 },
};
/** Quanto do item do Estoque sai por 1 unidade da receita (igual à baixa no servidor); null: não se converte. */
function fatorEstoque(unidade: string, e: Row): number | null {
  const un = String(e.unidade || 'un'), a = MEDIDA[unidade];
  if (a && MEDIDA[un]?.grupo === a.grupo) return a.fator / MEDIDA[un].fator;
  const conteudo = Number(e.conteudo) || 0, m = MEDIDA[String(e.conteudoUnidade ?? '')];
  if (a && conteudo > 0 && m?.grupo === a.grupo) return a.fator / m.fator / conteudo;
  return unidade === un ? 1 : null;
}

interface Producao { id: string; em: string; por: string; receitas: number; quantidade: number; local: string; validade: string; faltou?: { nome: string; unidade: string; qtd: number }[] }
const producoesDe = (r: Row) => (Array.isArray(r.producoes) ? (r.producoes as Producao[]) : []);

/**
 * "Produzir" um item de produção própria do Estoque: quantas receitas foram feitas, onde o preparo fica guardado,
 * o que sai de cada insumo (com o saldo de hoje) e as últimas produções, que dá para desfazer.
 */
export function ProduzirModal({ row, rows, onClose, onFeito }: {
  row: Row; rows: Row[]; onClose: () => void; onFeito: () => Promise<void> | void;
}) {
  const nome = String(row.item ?? '');
  const un = String(row.unidade || 'un');
  const receita = fichaDe(row.receita);
  const linhas = receita.itens.filter((i) => Number(i.quantidade) > 0);
  const [receitas, setReceitas] = useState<number | ''>(1);
  const [local, setLocal] = useState(localPrincipal(locaisDe(row)) || 'Cozinha');
  const [validade, setValidade] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const vezes = Number(receitas) || 0;
  const rende = vezes * receita.rendimento;
  const dias = Math.floor(Number(row.diasValidade) || 0);
  const validadeAuto = dias > 0 ? isoFromToday(dias) : '';
  const custo = calcularFicha(receita, 0);
  const historico = producoesDe(row);

  // o que cada linha precisa e quanto há no Estoque (principal e alternativas, na unidade da receita)
  const saidas = linhas.map((i) => {
    const precisa = (Number(i.quantidade) || 0) * vezes;
    const ids = [i.insumoId, ...(i.alternativas ?? []).map((a) => a.insumoId)].filter((id): id is string => !!id && id !== row.id);
    let tem = 0, ligado = false;
    for (const id of ids) {
      const e = rows.find((x) => x.id === id), f = e ? fatorEstoque(i.unidade, e) : null;
      if (!e || !f) continue;
      ligado = true;
      tem += (Number(e.quantidade) || 0) / f;
    }
    return { nome: i.insumo, unidade: i.unidade, precisa, tem, ligado, falta: ligado ? Math.max(0, precisa - tem) : 0 };
  });
  const faltas = saidas.filter((s) => s.falta > 1e-4);

  const produzir = async () => {
    if (!(vezes > 0)) return setErro('Informe quantas receitas foram feitas.');
    if (faltas.length && !(await confirmar({
      title: 'Falta insumo no Estoque',
      message: `${faltas.map((f) => `${qtdTxt(f.falta)} ${f.unidade} de ${f.nome}`).join(', ')}. Produzir assim mesmo? Sai o que houver, sem deixar saldo negativo.`,
      confirmLabel: 'Produzir',
    }))) return;
    setSalvando(true);
    setErro(null);
    try {
      await api(`/crm/c/estoque/${row.id}/produzir`, { method: 'POST', body: { receitas: vezes, local, ...(validade ? { validade } : {}) } });
      notify(`${qtdTxt(rende)} ${un} de ${nome} entraram em ${local}.`);
      await onFeito();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível produzir.');
    } finally {
      setSalvando(false);
    }
  };

  const desfazer = async (p: Producao) => {
    if (!(await confirmar({
      title: 'Desfazer esta produção?',
      message: `Os insumos voltam para o Estoque e ${qtdTxt(p.quantidade)} ${un} saem de ${p.local}.`,
      confirmLabel: 'Desfazer', danger: true,
    }))) return;
    try {
      await api(`/crm/c/estoque/${row.id}/desfazer-producao`, { method: 'POST', body: { producaoId: p.id } });
      notify('Produção desfeita');
      await onFeito();
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível desfazer.', 'error');
    }
  };

  return (
    <Modal
      title={`Produzir · ${nome}`} onClose={onClose} width={620}
      footer={<>
        <span className="spacer" />
        <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        {linhas.length > 0 && <button className="btn btn--primary" disabled={salvando} onClick={() => void produzir()}><ChefHat size={15} /> {salvando ? 'Produzindo…' : 'Produzir'}</button>}
      </>}
    >
      {!linhas.length ? (
        <p className="muted">Cadastre a receita do preparo neste item (insumos e quanto rende) para poder produzir.</p>
      ) : (
        <div className="form-grid producao">
          <div className="form-field">
            <label>Receitas feitas</label>
            <NumberInput spec={{ decimals: 2, min: 0.01, max: 1000 }} value={receitas} onChange={setReceitas} />
            <span className="muted small">Cada receita rende {qtdTxt(receita.rendimento)} {un}.</span>
          </div>
          <div className="form-field">
            <label>Guardar em</label>
            <select className="input" value={local} onChange={(e) => setLocal(e.target.value)}>
              {[...new Set([...Object.keys(locaisDe(row)), ...LOCAIS])].map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>

          <div className="producao__resumo form-field--wide">
            <div><span>Entra no Estoque</span><strong>{qtdTxt(rende)} {un}</strong></div>
            <div><span>Custo da produção</span><strong>{brl(custo.porcao * rende)}</strong></div>
            <div><span>Validade</span><strong>{validadeAuto ? dateBR(validadeAuto) : validade ? dateBR(validade) : '—'}</strong></div>
          </div>
          {!validadeAuto && (
            <div className="form-field">
              <label>Validade do que ficou pronto</label>
              <input type="date" className="input" value={validade} onChange={(e) => setValidade(e.target.value)} />
              <span className="muted small">Informe em "Dura quantos dias depois de pronto" no item para a data vir sozinha.</span>
            </div>
          )}

          <div className="form-field form-field--wide">
            <label>Sai do Estoque</label>
            <ul className="producao__saidas">
              {saidas.map((s, k) => (
                <li key={k} className={s.falta > 1e-4 ? 'is-falta' : ''}>
                  <span className="producao__insumo">{s.nome}</span>
                  <b>{qtdTxt(s.precisa)} {s.unidade}</b>
                  <span className="muted small">
                    {!s.ligado ? 'digitado à mão: não sai do Estoque' : s.falta > 1e-4 ? `tem ${qtdTxt(s.tem)} ${s.unidade} · falta ${qtdTxt(s.falta)} ${s.unidade}` : `tem ${qtdTxt(s.tem)} ${s.unidade}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {erro && <p className="error form-field--wide">{erro}</p>}
        </div>
      )}

      {historico.length > 0 && (
        <div className="producao__historico">
          <strong className="small">Últimas produções</strong>
          <ul>
            {historico.slice(0, 8).map((p) => (
              <li key={p.id}>
                <span>
                  {new Date(p.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · <b>{qtdTxt(p.quantidade)} {un}</b> em {p.local}
                  <span className="muted small"> · {p.por}{p.faltou?.length ? ' · faltou insumo' : ''}</span>
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void desfazer(p)}><Undo2 size={13} /> Desfazer</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
