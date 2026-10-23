import { useRef, useState } from 'react';
import { Check, ExternalLink, ImageOff, Loader2, RefreshCw, Sparkles, Square, Upload } from 'lucide-react';
import type { Row } from '../lib/data';
import { ErroDaChave, GEMINI_URL, MODELOS, gerarFotoEstoque, promptDaFotoEstoque } from '../lib/iaFoto';
import { fotoNoTamanho } from './Avatar';
import { baixar, copiar, nomeArquivo } from './GerarFotoIA';
import { Modal, notify } from './ui';

type Estado = { st: 'fila' | 'gerando' | 'aberto' | 'pronta' | 'erro' | 'salva'; nova?: string; erro?: string; usar?: boolean };
/** grátis: a pessoa gera cada uma no app do Gemini; automático: o Cérebro chama a API (chave com faturamento). */
type Modo = 'gratis' | 'automatico';

const temFoto = (r: Row) => typeof r.foto === 'string' && !!r.foto;
const pedidoDe = (r: Row) => promptDaFotoEstoque({
  item: String(r.item ?? ''), categoria: String(r.categoria ?? ''), unidade: String(r.unidade ?? ''), conteudo: r.conteudo, conteudoUnidade: String(r.conteudoUnidade ?? ''),
}, temFoto(r));

/**
 * Refaz de uma vez as fotos dos itens do Estoque no padrão do depósito. A pessoa marca os itens; no modo grátis cada clique
 * copia o pedido do próximo, baixa as fotos e abre o Gemini, e a foto pronta volta no cartão do item; no automático o Cérebro
 * gera uma por vez pela API. Nos dois, a atual fica ao lado da nova e só as marcadas são trocadas.
 */
export function RefazerFotos({ rows, onSalvar, onFim, onClose }: {
  rows: Row[];
  onSalvar: (id: string, foto: string) => Promise<unknown>;
  /** depois de salvar: recarrega a lista */
  onFim: () => Promise<unknown> | void;
  onClose: () => void;
}) {
  const itens = [...rows].sort((a, b) => String(a.item ?? '').localeCompare(String(b.item ?? ''), 'pt-BR'));
  const [modo, setModo] = useState<Modo>('gratis');
  // começam marcados os itens que já têm foto (a leva antiga, em baixa qualidade)
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(itens.filter(temFoto).map((r) => r.id)));
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [rodando, setRodando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const parar = useRef<AbortController | null>(null);
  const modeloBaixado = useRef(false);

  const mudar = (id: string, e: Estado) => setEstados((s) => ({ ...s, [id]: e }));
  const est = (r: Row): Estado => estados[r.id] ?? { st: 'fila' };
  const marcar = (id: string, sim: boolean) => setMarcados((m) => { const n = new Set(m); if (sim) n.add(id); else n.delete(id); return n; });
  const prontas = itens.filter((r) => est(r).st === 'pronta' && est(r).usar);
  const aFazer = itens.filter((r) => marcados.has(r.id) && ['fila', 'erro'].includes(est(r).st));
  // no grátis, o próximo é o primeiro marcado que ainda não foi aberto no Gemini
  const proximo = itens.find((r) => marcados.has(r.id) && est(r).st === 'fila');

  /**
   * Grátis: copia o pedido do item, baixa a foto modelo (só na primeira vez) e a foto atual, e abre o Gemini numa aba.
   * A cópia começa antes de abrir a aba: depois que o Gemini abre, a página perde o foco e o navegador não deixa copiar.
   */
  const abrirNoGemini = (r: Row) => {
    const copiou = copiar(pedidoDe(r));
    const modelo = MODELOS.estoque;
    if (!modeloBaixado.current) { baixar(modelo.url, modelo.arquivo); modeloBaixado.current = true; }
    if (temFoto(r)) baixar(String(r.foto), `referencia-${nomeArquivo(String(r.item ?? ''))}.jpg`);
    window.open(GEMINI_URL, '_blank', 'noopener');
    mudar(r.id, { st: 'aberto' });
    void copiou.then((ok) => notify(ok
      ? `Pedido de "${String(r.item ?? '')}" copiado. No Gemini: cole o pedido, anexe a foto modelo${temFoto(r) ? ' e a foto de referência' : ''} e envie.`
      : 'Fotos baixadas, mas não deu para copiar o pedido: toque em "Abrir de novo" no cartão do item.', ok ? 'ok' : 'error'));
  };

  const receber = async (r: Row, arquivo?: File) => {
    if (!arquivo) return;
    try { mudar(r.id, { st: 'pronta', nova: await fotoNoTamanho(arquivo), usar: true }); } catch (e) { mudar(r.id, { st: 'erro', erro: e instanceof Error ? e.message : 'Não foi possível ler a imagem.' }); }
  };

  /** Automático: gera uma por vez (a cota da IA não aguenta muitas juntas); erro de chave para a fila inteira. */
  const gerar = async (lista: Row[]) => {
    setErroGeral(null);
    setRodando(true);
    const ctl = new AbortController();
    parar.current = ctl;
    try {
      for (const r of lista) {
        if (ctl.signal.aborted) break;
        mudar(r.id, { st: 'gerando' });
        try {
          mudar(r.id, { st: 'pronta', nova: await gerarFotoEstoque(r, ctl.signal), usar: true });
        } catch (e) {
          if (ctl.signal.aborted) { mudar(r.id, { st: 'fila' }); break; }
          const msg = e instanceof Error ? e.message : 'Não foi possível gerar.';
          mudar(r.id, { st: 'erro', erro: msg });
          if (e instanceof ErroDaChave) { setErroGeral(msg); break; }
        }
      }
    } finally {
      parar.current = null;
      setRodando(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    let feitas = 0;
    try {
      for (const r of prontas) {
        try {
          await onSalvar(r.id, estados[r.id].nova!);
          mudar(r.id, { ...estados[r.id], st: 'salva' });
          feitas++;
        } catch (e) {
          mudar(r.id, { ...estados[r.id], st: 'erro', erro: e instanceof Error ? e.message : 'Não foi possível salvar.' });
        }
      }
      await onFim();
      notify(feitas === 1 ? '1 foto trocada.' : `${feitas} fotos trocadas.`);
    } finally {
      setSalvando(false);
    }
  };

  const fechar = () => { parar.current?.abort(); onClose(); };
  const restantes = itens.filter((r) => marcados.has(r.id) && est(r).st === 'fila').length;

  return (
    <Modal
      title="Refazer fotos em alta qualidade"
      onClose={fechar}
      width={1100}
      footer={
        <>
          <button className="btn btn--ghost" onClick={fechar}>Fechar</button>
          {modo === 'gratis'
            ? <button className="btn btn--ghost" disabled={!proximo || salvando} onClick={() => proximo && abrirNoGemini(proximo)}>
                <ExternalLink size={16} /> {proximo ? `Abrir o próximo no Gemini (${restantes})` : 'Todos abertos'}
              </button>
            : rodando
              ? <button className="btn btn--ghost" onClick={() => parar.current?.abort()}><Square size={14} /> Parar</button>
              : <button className="btn btn--ghost" disabled={!aFazer.length || salvando} onClick={() => void gerar(aFazer)}><Sparkles size={16} /> Gerar {aFazer.length} {aFazer.length === 1 ? 'foto' : 'fotos'}</button>}
          <button className="btn btn--primary" disabled={!prontas.length || rodando || salvando} onClick={() => void salvar()}>
            <Check size={16} /> {salvando ? 'Salvando…' : `Trocar ${prontas.length} ${prontas.length === 1 ? 'foto' : 'fotos'}`}
          </button>
        </>
      }
    >
      <div className="refazer-fotos">
        <div className="refazer-fotos__modos" role="tablist">
          <button role="tab" aria-selected={modo === 'gratis'} className={modo === 'gratis' ? 'is-on' : ''} disabled={rodando} onClick={() => setModo('gratis')}>Grátis, pelo app do Gemini</button>
          <button role="tab" aria-selected={modo === 'automatico'} className={modo === 'automatico' ? 'is-on' : ''} disabled={rodando} onClick={() => setModo('automatico')}>Automático (chave com faturamento)</button>
        </div>
        <p className="muted small">
          {modo === 'gratis'
            ? 'Marque os itens e toque em "Abrir o próximo no Gemini": o pedido do item é copiado, a foto modelo (na primeira vez) e a foto atual são baixadas e o Gemini abre numa aba. Lá, cole o pedido, anexe as fotos e envie. Salve a imagem criada e envie no cartão do item; depois toque em "Trocar".'
            : 'Cada item marcado vai para o Gemini com a foto modelo do depósito e a foto atual como referência; a nova sai em alta resolução. Usa a chave da IA de Configurações → Parâmetros, que precisa do faturamento ativo no Google AI Studio (o plano gratuito não gera imagens).'}
        </p>
        <div className="refazer-fotos__filtro">
          <span>{marcados.size} de {itens.length} marcados</span>
          <button className="btn btn--ghost btn--sm" disabled={rodando} onClick={() => setMarcados(new Set(itens.filter(temFoto).map((r) => r.id)))}>Os que têm foto</button>
          <button className="btn btn--ghost btn--sm" disabled={rodando} onClick={() => setMarcados(new Set(itens.map((r) => r.id)))}>Todos</button>
          <button className="btn btn--ghost btn--sm" disabled={rodando} onClick={() => setMarcados(new Set())}>Nenhum</button>
        </div>
        {erroGeral && <p className="error">{erroGeral}</p>}
        <ul className="refazer-fotos__lista">
          {itens.map((r) => {
            const e = est(r);
            const marcado = marcados.has(r.id);
            return (
              <li key={r.id} className={`refazer-fotos__item is-${e.st}${marcado ? '' : ' is-fora'}`}>
                <label className="refazer-fotos__nome">
                  <input type="checkbox" checked={marcado} disabled={rodando || e.st === 'salva'} onChange={(ev) => marcar(r.id, ev.target.checked)} />
                  <strong>{String(r.item ?? '—')}</strong>
                </label>
                <div className="gerar-foto__comparar">
                  <figure>
                    <figcaption>Atual</figcaption>
                    {temFoto(r) ? <img src={String(r.foto)} alt="" loading="lazy" /> : <span className="gerar-foto__vazio"><ImageOff size={20} /> Sem foto</span>}
                  </figure>
                  <figure className={e.nova ? 'is-nova' : ''}>
                    <figcaption>Nova</figcaption>
                    {e.nova ? <img src={e.nova} alt="" />
                      : <span className="gerar-foto__vazio">{e.st === 'gerando' ? <><Loader2 size={20} className="spin" /> Gerando…</> : e.st === 'aberto' ? 'Aberto no Gemini' : e.st === 'erro' ? 'Falhou' : marcado ? 'Na fila' : '—'}</span>}
                  </figure>
                </div>
                {e.st === 'erro' && <p className="error small">{e.erro}</p>}
                <div className="refazer-fotos__acoes">
                  {e.st === 'salva' ? <span className="refazer-fotos__ok"><Check size={14} /> Trocada</span> : e.st === 'pronta' && (
                    <label><input type="checkbox" checked={!!e.usar} onChange={(ev) => mudar(r.id, { ...e, usar: ev.target.checked })} /> Trocar por esta</label>
                  )}
                  {modo === 'gratis' && marcado && e.st !== 'salva' && (
                    <span className="refazer-fotos__botoes">
                      <button className="btn btn--ghost btn--sm" disabled={salvando} onClick={() => abrirNoGemini(r)} title="Copia o pedido, baixa as fotos e abre o Gemini"><ExternalLink size={13} /> {e.st === 'fila' ? 'Abrir no Gemini' : 'Abrir de novo'}</button>
                      <label className="btn btn--ghost btn--sm">
                        <Upload size={13} /> {e.nova ? 'Outra foto' : 'Enviar foto pronta'}
                        <input type="file" accept="image/*" hidden onChange={(ev) => { void receber(r, ev.target.files?.[0]); ev.target.value = ''; }} />
                      </label>
                    </span>
                  )}
                  {modo === 'automatico' && ['pronta', 'erro'].includes(e.st) && (
                    <button className="btn btn--ghost btn--sm" disabled={rodando || salvando} onClick={() => void gerar([r])}><RefreshCw size={13} /> Gerar de novo</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
