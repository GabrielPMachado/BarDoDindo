import { ChevronDown, Clock } from 'lucide-react';
import { toneOf } from '../collections';

/** Prazos combinados para os chamados de suporte, da prioridade mais alta para a mais baixa. */
export const TEMPOS_DE_RESPOSTA = [
  { prioridade: 'Crítica', quando: 'O bar parou: caixa, maquininhas, Cérebro ou internet fora durante o funcionamento.', resposta: 'até 30 min', solucao: 'até 4 h' },
  { prioridade: 'Alta', quando: 'Atrapalha muito, mas dá para seguir com um jeitinho (ex.: uma das maquininhas ou a impressora da cozinha).', resposta: 'até 2 h', solucao: 'no mesmo dia' },
  { prioridade: 'Média', quando: 'Incomoda, mas tem como contornar sem prejudicar o atendimento.', resposta: 'até 1 dia útil', solucao: 'até 3 dias úteis' },
  { prioridade: 'Baixa', quando: 'Dúvidas, melhorias e ajustes que podem esperar.', resposta: 'até 3 dias úteis', solucao: 'até 2 semanas' },
];

/** Explica, acima da lista de chamados, em quanto tempo cada prioridade é atendida. */
export function TemposResposta() {
  // no celular começa fechado, para não empurrar a lista para baixo
  return (
    <details className="panel tempos" open={typeof window === 'undefined' || window.matchMedia('(min-width: 760px)').matches}>
      <summary className="panel__head">
        <h2><Clock size={16} className="inline-icon gold" /> Tempos de resposta por prioridade <ChevronDown size={15} className="tempos__seta" /></h2>
        <span className="muted small">Resposta = primeiro retorno ao solicitante · Solução = problema resolvido</span>
      </summary>
      <div className="tempos__grade">
        {TEMPOS_DE_RESPOSTA.map((t) => (
          <div key={t.prioridade} className="tempos__item">
            <span className={`badge badge--${toneOf(t.prioridade)}`}>{t.prioridade}</span>
            <p className="small">{t.quando}</p>
            <dl>
              <div><dt className="muted small">Resposta</dt><dd>{t.resposta}</dd></div>
              <div><dt className="muted small">Solução</dt><dd>{t.solucao}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}
