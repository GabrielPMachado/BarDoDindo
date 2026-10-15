import { useEffect, useRef, useState } from 'react';
import { Check, ImageOff, RefreshCw, Sparkles, X } from 'lucide-react';
import { gerarFotoNoPadrao } from '../lib/iaFoto';
import { notify } from './ui';

type Estado = { fase: 'parado' } | { fase: 'gerando'; inicio: number } | { fase: 'pronto'; foto: string } | { fase: 'erro'; msg: string };

const ETAPAS: [number, string][] = [
  [0, 'Preparando o cenário do Dindo…'],
  [3, 'Enviando o pedido para a IA…'],
  [8, 'A IA está criando a foto…'],
  [35, 'Quase pronto, dando os últimos retoques…'],
];

/**
 * "Gerar foto no padrão do Dindo": a IA recria a foto do produto no cenário modelo (mesa do bar com a placa do Dindo).
 * Mostra o progresso, depois a foto atual ao lado da nova para escolher: usar, gerar outra ou descartar.
 */
export function GerarFotoIA({ data, onUsar }: { data: Record<string, unknown>; onUsar: (foto: string) => void }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'parado' });
  const [agora, setAgora] = useState(Date.now());
  const cancelar = useRef<AbortController | null>(null);

  useEffect(() => {
    if (estado.fase !== 'gerando') return;
    const t = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [estado.fase]);
  useEffect(() => () => cancelar.current?.abort(), []);

  const fotoAtual = typeof data.foto === 'string' ? data.foto : '';

  const gerar = async () => {
    cancelar.current?.abort();
    const ctl = new AbortController(); cancelar.current = ctl;
    setEstado({ fase: 'gerando', inicio: Date.now() }); setAgora(Date.now());
    try {
      const foto = await gerarFotoNoPadrao({
        nome: String(data.nome ?? ''), resumo: String(data.resumo ?? ''), ingredientes: String(data.ingredientes ?? ''), fotoAtual,
      }, ctl.signal);
      if (!ctl.signal.aborted) setEstado({ fase: 'pronto', foto });
    } catch (e) {
      if (ctl.signal.aborted) return;
      setEstado({ fase: 'erro', msg: e instanceof Error ? e.message : 'Não foi possível gerar a foto.' });
    }
  };

  const parar = () => { cancelar.current?.abort(); setEstado({ fase: 'parado' }); };

  const segundos = estado.fase === 'gerando' ? (agora - estado.inicio) / 1000 : 0;
  // a IA não informa o andamento: a barra avança rápido no começo e desacelera até a resposta chegar
  const progresso = estado.fase === 'gerando' ? Math.min(95, 95 * (1 - Math.exp(-segundos / 22))) : 0;
  const etapa = [...ETAPAS].reverse().find(([s]) => segundos >= s)?.[1] ?? ETAPAS[0][1];

  return (
    <div className="form-field form-field--wide gerar-foto">
      {estado.fase === 'parado' && (
        <div className="gerar-foto__chamada">
          <div>
            <strong><Sparkles size={15} /> Foto no padrão do Dindo</strong>
            <p className="muted small">A IA cria a foto deste drink na mesa do bar, com a placa do Dindo ao fundo, igual às outras fotos do cardápio.</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => void gerar()}><Sparkles size={16} /> Gerar foto</button>
        </div>
      )}

      {estado.fase === 'gerando' && (
        <div className="gerar-foto__progresso" role="status" aria-live="polite">
          <div className="gerar-foto__topo">
            <strong><Sparkles size={15} className="gerar-foto__brilho" /> {etapa}</strong>
            <span className="muted small">{Math.round(progresso)}%</span>
          </div>
          <div className="gerar-foto__barra" aria-hidden="true"><i style={{ width: `${progresso}%` }} /></div>
          <div className="gerar-foto__rodape">
            <span className="muted small">Leva de 15 a 60 segundos.</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={parar}><X size={14} /> Cancelar</button>
          </div>
        </div>
      )}

      {estado.fase === 'pronto' && (
        <div className="gerar-foto__resultado">
          <div className="gerar-foto__comparar">
            <figure>
              <figcaption>Atual</figcaption>
              {fotoAtual ? <img src={fotoAtual} alt="Foto atual" /> : <span className="gerar-foto__vazio"><ImageOff size={22} /> Sem foto</span>}
            </figure>
            <figure className="is-nova">
              <figcaption>Nova</figcaption>
              <img src={estado.foto} alt="Foto gerada pela IA" />
            </figure>
          </div>
          <div className="gerar-foto__botoes">
            <button type="button" className="btn btn--primary" onClick={() => {
              onUsar(estado.foto); setEstado({ fase: 'parado' });
              notify('Foto trocada. Clique em Salvar para publicar no app.');
            }}><Check size={16} /> Usar esta foto</button>
            <button type="button" className="btn btn--ghost" onClick={() => void gerar()}><RefreshCw size={15} /> Gerar outra</button>
            <button type="button" className="btn btn--ghost" onClick={parar}>Descartar</button>
          </div>
        </div>
      )}

      {estado.fase === 'erro' && (
        <div className="gerar-foto__erro">
          <p className="error">{estado.msg}</p>
          <div className="gerar-foto__botoes">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void gerar()}><RefreshCw size={14} /> Tentar de novo</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={parar}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
