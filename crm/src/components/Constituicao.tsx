import { CheckCircle2, CircleDashed, Landmark } from 'lucide-react';
import { ehConstituicao } from '../collections';
import type { Row } from '../lib/data';
import { dateBR } from '../lib/format';

/** Documentos que toda empresa precisa ter guardados desde a abertura. */
const ESSENCIAIS = ['Contrato social', 'Cartão CNPJ', 'Inscrição estadual', 'Inscrição municipal', 'Registro na Junta Comercial'];

const pdfs = (r: Row) => (Array.isArray(r.anexos) ? r.anexos.length : 0);
const resumo = (r: Row) => [dateBR(r.data), pdfs(r) ? `${pdfs(r)} PDF${pdfs(r) > 1 ? 's' : ''}` : 'sem PDF'].filter(Boolean).join(' · ');

/** Destaque do Arquivo: os documentos que constituíram a empresa, com o que ainda falta guardar. */
export function Constituicao({ rows }: { rows: Row[] }) {
  const docs = rows.filter(ehConstituicao).sort((a, b) => String(a.data ?? '').localeCompare(String(b.data ?? '')));
  const doTipo = (t: string) => docs.filter((r) => r.tipo === t && r.status !== 'Substituído');
  const outros = docs.filter((r) => !ESSENCIAIS.includes(String(r.tipo)));
  const faltam = ESSENCIAIS.filter((t) => !doTipo(t).length).length;
  return (
    <section className="panel pad constituicao">
      <h2 className="panel-title"><Landmark size={16} /> Constituição da empresa
        <span className="muted constituicao__conta">{faltam ? `faltam ${faltam} de ${ESSENCIAIS.length} essenciais` : 'essenciais guardados'}</span>
      </h2>
      <div className="constituicao__grade">
        {ESSENCIAIS.map((t) => {
          const achados = doTipo(t);
          const r = achados[achados.length - 1];
          return (
            <div key={t} className={`constituicao__item ${r ? 'is-ok' : ''}`}>
              {r ? <CheckCircle2 size={16} className="text-good" /> : <CircleDashed size={16} className="muted" />}
              <div>
                <strong>{t}</strong>
                <span className="muted">{r ? `${String(r.titulo ?? '')} · ${resumo(r)}` : 'Ainda não cadastrado'}</span>
              </div>
            </div>
          );
        })}
      </div>
      {outros.length > 0 && (
        <ul className="constituicao__outros">
          {outros.map((r) => <li key={r.id}><strong>{String(r.titulo ?? '')}</strong> <span className="muted">{String(r.tipo ?? '')} · {resumo(r)}</span></li>)}
        </ul>
      )}
    </section>
  );
}
