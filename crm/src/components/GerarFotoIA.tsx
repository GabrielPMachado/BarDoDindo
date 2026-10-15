import { useState } from 'react';
import { Check, Copy, Download, ExternalLink, ImageOff, Sparkles, Upload } from 'lucide-react';
import { FOTO_MODELO_URL, GEMINI_URL, promptDaFoto } from '../lib/iaFoto';
import { reduzirFoto } from './Avatar';
import { notify } from './ui';

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // navegadores antigos: copia por uma caixa de texto escondida
    const t = document.createElement('textarea'); t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove();
    return ok;
  }
}

function baixarModelo() {
  const a = document.createElement('a');
  a.href = FOTO_MODELO_URL; a.download = 'foto-modelo-bar-do-dindo.jpg';
  document.body.appendChild(a); a.click(); a.remove();
}

/**
 * "Foto no padrão do Dindo", de graça pelo app do Gemini: o Cérebro copia o pedido pronto do drink e
 * entrega a foto modelo; depois de gerar, a pessoa envia a foto e compara a atual com a nova antes de usar.
 */
export function GerarFotoIA({ data, onUsar }: { data: Record<string, unknown>; onUsar: (foto: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fotoAtual = typeof data.foto === 'string' ? data.foto : '';
  const nome = String(data.nome ?? '').trim();
  const prompt = () => promptDaFoto({ nome, resumo: String(data.resumo ?? ''), ingredientes: String(data.ingredientes ?? '') });

  const abrirGemini = async () => {
    if (!nome) { notify('Informe o nome do produto antes.', 'error'); return; }
    // abre a aba já no clique (senão o navegador bloqueia) e copia o pedido
    window.open(GEMINI_URL, '_blank', 'noopener');
    const ok = await copiar(prompt());
    notify(ok ? 'Pedido copiado! No Gemini: anexe a foto modelo, cole o pedido e envie.' : 'Não deu para copiar sozinho: use "Copiar pedido".', ok ? 'ok' : 'error');
  };

  const receber = async (arquivo?: File) => {
    if (!arquivo) return;
    setErro(null);
    try { setNova(await reduzirFoto(arquivo, 640, false)); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível ler a imagem.'); }
  };

  if (!aberto && !nova) {
    return (
      <div className="form-field form-field--wide gerar-foto">
        <div className="gerar-foto__chamada">
          <div>
            <strong><Sparkles size={15} /> Foto no padrão do Dindo</strong>
            <p className="muted small">Crie de graça no Gemini a foto deste drink na mesa do bar, com a placa do Dindo ao fundo, igual às outras fotos do cardápio.</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => setAberto(true)}><Sparkles size={16} /> Criar foto</button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-field form-field--wide gerar-foto">
      {!nova ? (
        <>
          <strong className="gerar-foto__titulo"><Sparkles size={15} /> Foto no padrão do Dindo · grátis pelo Gemini</strong>
          <ol className="gerar-foto__passos">
            <li>
              <span><b>Baixe a foto modelo</b> (só precisa na primeira vez).</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={baixarModelo}><Download size={14} /> Foto modelo</button>
            </li>
            <li>
              <span><b>Abra o Gemini</b>: o pedido deste drink já vai copiado.</span>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void abrirGemini()}><ExternalLink size={14} /> Abrir o Gemini</button>
            </li>
            <li>
              <span>No Gemini, <b>anexe a foto modelo</b>, <b>cole o pedido</b> e envie. Salve a imagem que ele criar.</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={async () => notify(await copiar(prompt()) ? 'Pedido copiado.' : 'Não foi possível copiar.')}><Copy size={14} /> Copiar pedido</button>
            </li>
            <li>
              <span><b>Envie a foto pronta</b> aqui para comparar com a atual.</span>
              <label className="btn btn--primary btn--sm">
                <Upload size={14} /> Enviar foto
                <input type="file" accept="image/*" hidden onChange={(e) => { void receber(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </li>
          </ol>
          {erro && <p className="error">{erro}</p>}
          <div className="gerar-foto__botoes"><button type="button" className="btn btn--ghost btn--sm" onClick={() => setAberto(false)}>Fechar</button></div>
        </>
      ) : (
        <div className="gerar-foto__resultado">
          <div className="gerar-foto__comparar">
            <figure>
              <figcaption>Atual</figcaption>
              {fotoAtual ? <img src={fotoAtual} alt="Foto atual" /> : <span className="gerar-foto__vazio"><ImageOff size={22} /> Sem foto</span>}
            </figure>
            <figure className="is-nova">
              <figcaption>Nova</figcaption>
              <img src={nova} alt="Foto nova" />
            </figure>
          </div>
          <div className="gerar-foto__botoes">
            <button type="button" className="btn btn--primary" onClick={() => {
              onUsar(nova); setNova(null); setAberto(false);
              notify('Foto trocada. Clique em Salvar para publicar no app.');
            }}><Check size={16} /> Usar esta foto</button>
            <label className="btn btn--ghost">
              <Upload size={15} /> Escolher outra
              <input type="file" accept="image/*" hidden onChange={(e) => { void receber(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button type="button" className="btn btn--ghost" onClick={() => setNova(null)}>Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
}
