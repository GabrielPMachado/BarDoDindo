import { useMemo } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, ErrorBox, KpiRow, Loading, PageHead } from '../components/ui';
import { useResource } from '../lib/data';
import { dateBR, num } from '../lib/format';
import { useSession, type Config, type Questionario } from '../lib/session';
import { ehOutro } from '../../../shared/questionario';
import { numero } from './Vendas';

type Pergunta = Questionario['perguntas'][number];
interface Respondente { numero: number; nome: string; origem?: string; respostas?: Record<string, string> | null }

interface Opcao { texto: string; n: number }
interface Resultado {
  pergunta: Pergunta;
  /** Quem respondeu esta pergunta: é a base do percentual (na múltipla escolha a soma passa de 100%). */
  base: number;
  /** Total de marcações (na múltipla escolha cada pessoa conta uma vez em cada opção marcada). */
  selecoes: number;
  opcoes: Opcao[];
  /** O que escreveram no "Outro" e as respostas de texto livre. */
  escritas: { quem: Respondente; texto: string }[];
}

const pct = (n: number, base: number) => (base ? `${((n / base) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '0%');

/**
 * Conta as respostas de uma pergunta. A resposta gravada é um texto com as opções marcadas separadas por "; "
 * e o "Outro" como "Outro: …" (ver montarResposta). O que não bate com nenhuma opção atual (resposta de uma
 * versão antiga do questionário) entra em "Outras respostas".
 */
function contar(p: Pergunta, quem: Respondente[]): Resultado {
  const cont = new Map(p.opcoes.map((o) => [o, 0]));
  let base = 0, selecoes = 0, foraDasOpcoes = 0;
  const escritas: Resultado['escritas'] = [];
  for (const c of quem) {
    const v = c.respostas?.[p.id]?.trim();
    if (!v) continue;
    base++;
    if (!p.opcoes.length) { escritas.push({ quem: c, texto: v }); continue; }
    const marcadas = new Set<string>();
    let fora = false;
    for (const parte of v.split('; ')) {
      const o = p.opcoes.find((x) => x === parte || (ehOutro(x) && parte.startsWith(`${x}:`)));
      if (o) {
        marcadas.add(o);
        const escrito = parte.slice(o.length + 1).trim();
        if (escrito) escritas.push({ quem: c, texto: escrito });
      } else fora = true;
    }
    for (const o of marcadas) cont.set(o, cont.get(o)! + 1);
    if (fora) foraDasOpcoes++;
    selecoes += marcadas.size + (fora ? 1 : 0);
  }
  // ordem decrescente de preferência; no empate, a ordem do questionário
  const opcoes = p.opcoes.map((texto) => ({ texto, n: cont.get(texto)! })).sort((a, b) => b.n - a.n);
  if (foraDasOpcoes) opcoes.push({ texto: 'Outras respostas (versão antiga)', n: foraDasOpcoes });
  return { pergunta: p, base, selecoes, opcoes, escritas };
}

function CartaoPergunta({ r, destaque }: { r: Resultado; destaque?: boolean }) {
  const { pergunta: p, base } = r;
  const lider = r.opcoes[0]?.n ?? 0;
  return (
    <section className={`panel resultado ${destaque ? 'resultado--destaque' : ''}`}>
      <div className="panel__head resultado__head">
        <div>
          {destaque && <span className="resultado__selo">Programação do bar</span>}
          <h2>{p.texto}</h2>
        </div>
        <span className="muted small nowrap">
          {p.opcoes.length ? (p.multipla ? 'Várias escolhas' : 'Uma escolha') : 'Texto livre'} · {num(base)} {base === 1 ? 'resposta' : 'respostas'}
        </span>
      </div>
      {p.opcoes.length > 0 && (base ? (
        <>
          <ol className="resultado__barras" aria-label={`Resultado: ${p.texto}`}>
            {r.opcoes.map((o, i) => (
              <li key={o.texto} className={`resultado__op ${o.n && o.n === lider ? 'is-lider' : ''} ${!o.n ? 'is-zero' : ''}`}>
                <span className="resultado__pos">{i + 1}º</span>
                <span className="resultado__nome">{o.texto}</span>
                <span className="resultado__barra"><span style={{ width: `${base ? (o.n / base) * 100 : 0}%` }} /></span>
                <span className="resultado__num"><strong>{pct(o.n, base)}</strong> <span className="muted">{num(o.n)} {o.n === 1 ? 'seleção' : 'seleções'}</span></span>
              </li>
            ))}
          </ol>
          <p className="muted small resultado__nota">
            Percentual sobre as {num(base)} pessoas que responderam a esta pergunta.
            {p.multipla && ` Como dava para marcar várias opções, foram ${num(r.selecoes)} seleções e a soma passa de 100%.`}
          </p>
        </>
      ) : <p className="muted pad">Ninguém respondeu ainda.</p>)}
      {r.escritas.length > 0 && (
        <details className="resultado__escritas" open={!p.opcoes.length && r.escritas.length <= 3}>
          <summary>{p.opcoes.length ? `O que escreveram no "Outro" (${num(r.escritas.length)})` : `Ver as respostas (${num(r.escritas.length)})`}</summary>
          <ul>
            {r.escritas.map((e, i) => (
              <li key={i}><p>{e.texto}</p><span className="muted small">{e.quem.nome} · {numero(e.quem.numero)}</span></li>
            ))}
          </ul>
        </details>
      )}
      {!p.opcoes.length && !base && <p className="muted pad">Ninguém respondeu ainda.</p>}
    </section>
  );
}

/** Resultado geral do questionário do afilhado. Usa a mesma lista de Clientes, já carregada ao vivo (sem leituras extras). */
export default function ResultadoQuestionario() {
  const { data, loading, error } = useResource<Respondente[]>('/crm/clientes');
  const questionario = useResource<Config>('/public/config').data?.questionario;
  const { pode } = useSession();
  const navigate = useNavigate();
  const perguntas = questionario?.perguntas ?? [];
  // a equipe testa o questionário, então fica fora do resultado (como no contador de afilhados)
  const afilhados = useMemo(() => (data ?? []).filter((c) => c.origem !== 'Equipe' && c.numero > 0), [data]);
  const participantes = useMemo(() => afilhados.filter((c) => c.respostas && Object.entries(c.respostas)
    .some(([k, v]) => k !== 'respondidoEm' && String(v ?? '').trim())), [afilhados]);
  const resultados = useMemo(() => perguntas.map((p) => contar(p, participantes)), [perguntas, participantes]);
  // os eventos vêm primeiro: é a pergunta que orienta a programação do bar
  const ordem = [...resultados].sort((a, b) => Number(b.pergunta.id === 'eventos') - Number(a.pergunta.id === 'eventos'));
  const ultima = participantes.map((c) => c.respostas?.respondidoEm ?? '').sort().pop();
  const topEvento = resultados.find((r) => r.pergunta.id === 'eventos')?.opcoes[0];

  return (
    <div className="page">
      <PageHead title="Resultado do questionário" description="Resultado geral das respostas dos afilhados, em ordem de preferência, para orientar a programação do Bar do Dindo."
        actions={pode('clientes', 'ver') && <button type="button" className="btn btn--ghost" onClick={() => navigate('/vendas/clientes')}><ArrowLeft size={16} /> Clientes</button>} />
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading ? <Loading /> : !participantes.length ? (
        <div className="panel"><EmptyState title="Nenhuma resposta ainda">O resultado aparece aqui quando os afilhados responderem ao questionário, no pré-cadastro ou no aplicativo.</EmptyState></div>
      ) : (
        <>
          <KpiRow items={[
            { label: 'Participantes', value: num(participantes.length), hint: 'Afilhados que responderam a pelo menos uma pergunta' },
            { label: 'Taxa de resposta', value: pct(participantes.length, afilhados.length), hint: `${num(participantes.length)} de ${num(afilhados.length)} afilhados` },
            ...(topEvento?.n ? [{ label: 'Evento mais pedido', value: topEvento.texto, tone: 'info' as const }] : []),
            ...(ultima ? [{ label: 'Última resposta', value: dateBR(ultima) }] : []),
          ]} />
          <p className="muted small resultado__aviso"><Users size={14} /> A equipe do bar fica fora da contagem. Cada percentual usa como base quem respondeu àquela pergunta.</p>
          <div className="resultados">
            {ordem.map((r) => <CartaoPergunta key={r.pergunta.id} r={r} destaque={r.pergunta.id === 'eventos'} />)}
          </div>
        </>
      )}
    </div>
  );
}
