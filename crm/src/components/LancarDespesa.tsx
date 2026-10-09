import { useState } from 'react';
import { AlertTriangle, Receipt } from 'lucide-react';
import { COLLECTIONS, numberSpec, type CollectionDef, type DespesaSugerida } from '../collections';
import { api } from '../lib/api';
import type { Row } from '../lib/data';
import { monthOf } from '../lib/finance';
import { brl, isoToday, monthLabel } from '../lib/format';
import { checkRange, FieldInput, Modal, notify } from './ui';

/** Campos da despesa pedidos na tela (os mesmos do cadastro em Financeiro → Despesas, sem o status: nasce "A pagar"). */
const CAMPOS = ['descricao', 'categoria', 'data', 'vencimento', 'valor', 'observacoes'];
const FORM_ID = 'lancar-despesa-form';

interface Lancamento {
  valor: number;
  vezes: number;
}

/** O que já foi lançado por esta tela para o registro na competência (AAAA-MM), se houver. */
function lancadoEm(row: Row, competencia: string): Lancamento | null {
  const l = (row.lancamentos as Record<string, Partial<Lancamento>> | undefined)?.[competencia];
  return l && typeof l.valor === 'number' ? { valor: l.valor, vezes: Number(l.vezes) || 1 } : null;
}

interface LancarDespesaProps {
  def: CollectionDef;
  row: Row;
  sugestao: DespesaSugerida;
  onClose: () => void;
  onDone: () => Promise<void>;
}

/** Tela que transforma um registro (serviço terceirizado, contrato, mídia, projeto) em despesa no DRE. */
export function LancarDespesa({ def, row, sugestao, onClose, onDone }: LancarDespesaProps) {
  const campos = COLLECTIONS.despesas.fields.filter((f) => CAMPOS.includes(f.key));
  const [dados, setDados] = useState<Record<string, unknown>>(() => ({
    descricao: sugestao.descricao, categoria: sugestao.categoria, valor: sugestao.valor || '', data: isoToday(), vencimento: '', observacoes: '',
  }));
  const [erro, setErro] = useState<string | null>(null);
  const [isSalvando, setIsSalvando] = useState(false);

  const competencia = monthOf(dados.data);
  const jaLancado = lancadoEm(row, competencia);
  // fechar no meio do envio esconderia o resultado e convidaria a lançar de novo
  const handleClose = () => { if (!isSalvando) onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const faltando = campos.find((f) => f.required && (dados[f.key] === undefined || dados[f.key] === ''));
    if (faltando) return setErro(`Preencha o campo "${faltando.label}".`);
    const valor = campos.find((f) => f.key === 'valor')!;
    const foraDaFaixa = checkRange(valor.label, dados.valor, numberSpec(valor));
    if (foraDaFaixa) return setErro(foraDaFaixa);
    setIsSalvando(true);
    setErro(null);
    try {
      await api(`/crm/c/${def.id}/${row.id}/lancar-despesa`, { method: 'POST', body: dados });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível lançar a despesa.');
      setIsSalvando(false);
      return;
    }
    // a despesa já existe: daqui em diante nada pode reabrir o formulário como se tivesse falhado
    notify(`Despesa de ${brl(Number(dados.valor))} lançada no DRE de ${monthLabel(competencia)}`);
    onClose();
    void onDone().catch(() => undefined);
  };

  return (
    <Modal
      title="Lançar despesa no DRE"
      onClose={handleClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn btn--ghost" type="button" onClick={handleClose} disabled={isSalvando}>Cancelar</button>
          <button className="btn btn--primary" form={FORM_ID} disabled={isSalvando}>
            <Receipt size={16} /> {isSalvando ? 'Lançando…' : 'Lançar despesa'}
          </button>
        </>
      }
    >
      <form id={FORM_ID} className="form-grid" onSubmit={handleSubmit}>
        <p className="muted form-field--wide">
          Confira os dados. Ao lançar, é criada uma despesa “A pagar” em Financeiro → Despesas, que entra no Resultado (DRE) do mês da competência.
        </p>
        {jaLancado && (
          <p className="alert form-field--wide" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              Este registro já teve {jaLancado.vezes === 1 ? 'uma despesa lançada' : `${jaLancado.vezes} despesas lançadas`} por aqui em {monthLabel(competencia)}
              {' '}(a última, de {brl(jaLancado.valor)}). Lance de novo só se for outro pagamento do mesmo mês.
            </span>
          </p>
        )}
        {campos.map((f) => (
          <div key={f.key} className={`form-field ${f.wide || f.type === 'textarea' ? 'form-field--wide' : ''}`}>
            <label htmlFor={`f-${f.key}`}>{f.label}{f.required && <span className="req"> *</span>}</label>
            <FieldInput field={f} value={dados[f.key]} onChange={(v) => setDados((d) => ({ ...d, [f.key]: v }))} />
          </div>
        ))}
        {erro && <p className="error form-field--wide" role="alert">{erro}</p>}
      </form>
    </Modal>
  );
}
