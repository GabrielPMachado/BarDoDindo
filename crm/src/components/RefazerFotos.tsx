import { useRef, useState } from 'react';
import { Check, ImageOff, Loader2, RefreshCw, Sparkles, Square } from 'lucide-react';
import type { Row } from '../lib/data';
import { ErroDaChave, gerarFotoEstoque } from '../lib/iaFoto';
import { Modal, notify } from './ui';

type Estado = { st: 'fila' | 'gerando' | 'pronta' | 'erro' | 'salva'; nova?: string; erro?: string; usar?: boolean };

/**
 * Refaz de uma vez as fotos dos itens do Estoque no padrão do depósito, pela API do Gemini (chave de Configurações):
 * gera uma por vez, mostra a atual ao lado da nova e só troca as que a pessoa deixar marcadas.
 */
export function RefazerFotos({ rows, onSalvar, onFim, onClose }: {
  rows: Row[];
  onSalvar: (id: string, foto: string) => Promise<unknown>;
  /** depois de salvar: recarrega a lista */
  onFim: () => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [soComFoto, setSoComFoto] = useState(true);
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [rodando, setRodando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const parar = useRef<AbortController | null>(null);

  const itens = rows.filter((r) => !soComFoto || (typeof r.foto === 'string' && r.foto))
    .sort((a, b) => String(a.item ?? '').localeCompare(String(b.item ?? ''), 'pt-BR'));
  const mudar = (id: string, e: Estado) => setEstados((s) => ({ ...s, [id]: e }));
  const prontas = itens.filter((r) => estados[r.id]?.st === 'pronta' && estados[r.id]?.usar);
  const pendentes = itens.filter((r) => !['pronta', 'salva'].includes(estados[r.id]?.st ?? 'fila'));

  /** Gera uma por vez (a cota da IA não aguenta muitas juntas); erro de chave para a fila inteira. */
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

  return (
    <Modal
      title="Refazer fotos em alta qualidade"
      onClose={fechar}
      width={1100}
      footer={
        <>
          <button className="btn btn--ghost" onClick={fechar}>Fechar</button>
          {rodando
            ? <button className="btn btn--ghost" onClick={() => parar.current?.abort()}><Square size={14} /> Parar</button>
            : <button className="btn btn--ghost" disabled={!pendentes.length || salvando} onClick={() => void gerar(pendentes)}><Sparkles size={16} /> Gerar {pendentes.length} {pendentes.length === 1 ? 'foto' : 'fotos'}</button>}
          <button className="btn btn--primary" disabled={!prontas.length || rodando || salvando} onClick={() => void salvar()}>
            <Check size={16} /> {salvando ? 'Salvando…' : `Trocar ${prontas.length} ${prontas.length === 1 ? 'foto' : 'fotos'}`}
          </button>
        </>
      }
    >
      <div className="refazer-fotos">
        <p className="muted small">
          Cada item vai para o Gemini com a foto modelo do depósito e a foto atual como referência do produto. A nova foto sai em alta resolução;
          confira lado a lado e desmarque as que não ficaram boas antes de trocar. Usa a chave da IA de Configurações → Parâmetros, que precisa do
          faturamento ativo no Google AI Studio (o plano gratuito não gera imagens).
        </p>
        <label className="refazer-fotos__filtro">
          <input type="checkbox" checked={soComFoto} disabled={rodando} onChange={(e) => setSoComFoto(e.target.checked)} /> Só os itens que já têm foto ({itens.length})
        </label>
        {erroGeral && <p className="error">{erroGeral}</p>}
        <ul className="refazer-fotos__lista">
          {itens.map((r) => {
            const e = estados[r.id] ?? { st: 'fila' };
            return (
              <li key={r.id} className={`refazer-fotos__item is-${e.st}`}>
                <strong>{String(r.item ?? '—')}</strong>
                <div className="gerar-foto__comparar">
                  <figure>
                    <figcaption>Atual</figcaption>
                    {typeof r.foto === 'string' && r.foto ? <img src={r.foto} alt="" loading="lazy" /> : <span className="gerar-foto__vazio"><ImageOff size={20} /> Sem foto</span>}
                  </figure>
                  <figure className={e.nova ? 'is-nova' : ''}>
                    <figcaption>Nova</figcaption>
                    {e.nova ? <img src={e.nova} alt="" />
                      : <span className="gerar-foto__vazio">{e.st === 'gerando' ? <><Loader2 size={20} className="spin" /> Gerando…</> : e.st === 'erro' ? 'Falhou' : 'Na fila'}</span>}
                  </figure>
                </div>
                {e.st === 'erro' && <p className="error small">{e.erro}</p>}
                <div className="refazer-fotos__acoes">
                  {e.st === 'salva' ? <span className="refazer-fotos__ok"><Check size={14} /> Trocada</span> : e.st === 'pronta' && (
                    <label><input type="checkbox" checked={!!e.usar} onChange={(ev) => mudar(r.id, { ...e, usar: ev.target.checked })} /> Trocar por esta</label>
                  )}
                  {['pronta', 'erro'].includes(e.st) && (
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
