import { useState } from 'react';
import { Check, Copy, Download, ExternalLink, ImageOff, Sparkles, Upload } from 'lucide-react';
import { GEMINI_URL, MODELOS, promptDaFoto, promptDaFotoEstoque, type PadraoFoto } from '../lib/iaFoto';
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

function baixar(url: string, nome: string) {
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
}
const nomeArquivo = (nome: string) => nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'foto';

/**
 * "Foto no padrão do Dindo", de graça pelo app do Gemini: o Cérebro copia o pedido pronto do drink (ou do item do Estoque) e
 * entrega a foto modelo; depois de gerar, a pessoa envia a foto e compara a atual com a nova antes de usar.
 */
export function GerarFotoIA({ data, onUsar, padrao = 'produto' }: { data: Record<string, unknown>; onUsar: (foto: string) => void; padrao?: PadraoFoto }) {
  const [aberto, setAberto] = useState(false);
  const [nova, setNova] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fotoAtual = typeof data.foto === 'string' ? data.foto : '';
  const modelo = MODELOS[padrao];
  const oQue = modelo.oQue;
  const baixarModelo = () => baixar(modelo.url, modelo.arquivo);
  const nome = String((padrao === 'estoque' ? data.item : data.nome) ?? '').trim();
  const prompt = () => padrao === 'estoque'
    ? promptDaFotoEstoque({ item: nome, categoria: String(data.categoria ?? ''), unidade: String(data.unidade ?? ''), conteudo: data.conteudo, conteudoUnidade: String(data.conteudoUnidade ?? '') })
    : promptDaFoto({ nome, resumo: String(data.resumo ?? ''), ingredientes: String(data.ingredientes ?? '') });

  /**
   * Um toque faz tudo: copia o pedido, baixa a foto modelo (e a foto atual, como referência) e abre o Gemini.
   * A cópia começa antes de abrir a aba: depois que o Gemini abre, a página perde o foco e o navegador não deixa copiar.
   */
  const criarNoGemini = () => {
    if (!nome) { notify(padrao === 'estoque' ? 'Informe o nome do item antes.' : 'Informe o nome do produto antes.', 'error'); return; }
    const copiou = copiar(prompt());
    baixarModelo();
    if (fotoAtual) baixar(fotoAtual, `referencia-${nomeArquivo(nome)}.jpg`);
    window.open(GEMINI_URL, '_blank', 'noopener');
    setAberto(true);
    void copiou.then((ok) => notify(ok
      ? 'Pedido copiado e fotos baixadas! No Gemini: anexe a foto modelo, cole o pedido e envie.'
      : 'Fotos baixadas. Não deu para copiar o pedido sozinho: toque em "Copiar pedido".', ok ? 'ok' : 'error'));
  };

  const receber = async (arquivo?: File) => {
    if (!arquivo) return;
    setErro(null);
    try { setNova(await reduzirFoto(arquivo, 1024, false)); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível ler a imagem.'); }
  };

  if (!aberto && !nova) {
    return (
      <div className="form-field form-field--wide gerar-foto">
        <div className="gerar-foto__chamada">
          <div>
            <strong><Sparkles size={15} /> Foto no padrão do Dindo</strong>
            <p className="muted small">Um toque copia o pedido deste {oQue}, baixa a foto modelo{padrao === 'estoque' ? ' (o depósito com a lousa do Dindo)' : ''} e abre o Gemini (grátis). Depois é só enviar a foto pronta aqui.</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={criarNoGemini}><Sparkles size={16} /> Criar no Gemini</button>
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
              <span>No Gemini, <b>anexe a foto modelo</b> que foi baixada{fotoAtual ? ` (e, se quiser, a foto atual do ${oQue} como referência)` : ''}, <b>cole o pedido</b> e envie.</span>
            </li>
            <li>
              <span>Salve a imagem que o Gemini criar e <b>envie aqui</b> para comparar com a atual.</span>
              <label className="btn btn--primary btn--sm">
                <Upload size={14} /> Enviar foto
                <input type="file" accept="image/*" hidden onChange={(e) => { void receber(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </li>
          </ol>
          <div className="gerar-foto__extras">
            <span className="muted small">Algo não funcionou?</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={async () => notify(await copiar(prompt()) ? 'Pedido copiado.' : 'Não foi possível copiar.')}><Copy size={14} /> Copiar pedido</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={baixarModelo}><Download size={14} /> Baixar foto modelo</button>
            <a className="btn btn--ghost btn--sm" href={GEMINI_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir o Gemini</a>
          </div>
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
