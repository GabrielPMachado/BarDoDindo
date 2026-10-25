/**
 * Foto do produto no padrão do Bar do Dindo, feita de graça no app do Gemini:
 * o Cérebro monta o pedido (prompt) com o drink e entrega a foto modelo (o Aperol na mesa do bar,
 * com a placa do Dindo); a pessoa gera no Gemini e envia a foto pronta de volta.
 */
import modeloUrl from '../assets/foto-modelo-dindo.jpg';
import modeloEstoqueUrl from '../assets/foto-modelo-estoque.jpg';
import { fotoNoTamanho } from '../components/Avatar';
import { chaveDaIA } from './iaNota';

export const FOTO_MODELO_URL = modeloUrl;
export const GEMINI_URL = 'https://gemini.google.com/app';

/**
 * Padrões de foto: drinks na mesa do bar; itens do Estoque na bancada do depósito, com a lousa do Dindo ao fundo;
 * bens do Patrimônio no salão (a mesma foto do bar como referência do ambiente, num plano mais aberto).
 */
export type PadraoFoto = 'produto' | 'estoque' | 'patrimonio';
export const MODELOS: Record<PadraoFoto, { url: string; arquivo: string; oQue: string; cenario?: string }> = {
  produto: { url: modeloUrl, arquivo: 'foto-modelo-bar-do-dindo.jpg', oQue: 'drink' },
  estoque: { url: modeloEstoqueUrl, arquivo: 'foto-modelo-estoque-bar-do-dindo.jpg', oQue: 'item', cenario: 'o depósito com a lousa do Dindo' },
  patrimonio: { url: modeloUrl, arquivo: 'foto-modelo-salao-bar-do-dindo.jpg', oQue: 'bem', cenario: 'o salão com a placa do Dindo' },
};

/** Pedido para a foto de um bem do Patrimônio, no salão do bar: o bem no centro, com a parede de tijolos e a placa do Dindo ao fundo. */
export function promptDaFotoPatrimonio(p: { nome: string; categoria?: string; descricao?: string }) {
  const bem = [p.nome.trim(), p.categoria && p.categoria !== 'Outro' ? `categoria: ${p.categoria}` : '', p.descricao?.trim()].filter(Boolean).join('. ');
  const diversao = p.categoria === 'Reserva' || /ps ?\d|playstation|xbox|nintendo|videogame|karaok|sinuca|pebolim|dardo|jogo/i.test(p.nome);
  return `Use a imagem anexada como referência do ambiente do Bar do Dindo e crie uma nova foto no MESMO salão, com o mesmo estilo, iluminação quente e cores: a parede de tijolos aparentes com a placa redonda de madeira do Bar do Dindo à direita (idêntica, sem alterar o logo nem as letras "BAR DO DINDO · DRINKS E CHOPP · NOVA OLARIA"), a luminária pendente acesa, as plantas e as prateleiras com garrafas desfocadas à esquerda.

Abra o enquadramento para mostrar um canto do salão, com piso de madeira escura, e tire o drink e a mesa do primeiro plano. No centro da cena, em destaque, coloque este bem do bar: ${bem}. Mostre o produto real e reconhecível (marca, formato e cores), inteiro, de frente ou levemente de lado, no tamanho real em relação ao ambiente: o que é pequeno fica sobre um aparador ou mesa de madeira; o que é grande fica apoiado no piso.${diversao ? `

É um item que os clientes reservam para se divertir: mostre-o montado e pronto para usar (por exemplo, o videogame com os controles à frente e a TV ligada numa tela de jogo; o karaokê com o microfone, a caixa de som e a tela com uma letra de música), com um leve brilho colorido de luz de festa no ambiente, sem perder a luz quente do bar.` : ''}

Fotografia realista, foco nítido no bem e fundo levemente desfocado. Não adicione textos, pessoas nem mãos. Mantenha o formato horizontal 4:3.`;
}

/** Pedido para a foto de um item do Estoque, no padrão do depósito (a garrafa sobre a bancada, com a lousa do Dindo). */
export function promptDaFotoEstoque(p: { item: string; categoria?: string; unidade?: string; conteudo?: unknown; conteudoUnidade?: string }, comReferencia = false) {
  const conteudo = Number(p.conteudo) > 0 ? `${String(p.conteudo).replace('.', ',')} ${p.conteudoUnidade || ''}`.trim() : '';
  const item = [p.item.trim(), p.categoria ? `categoria: ${p.categoria}` : '', conteudo ? `embalagem de ${conteudo}` : p.unidade ? `vendido por ${p.unidade}` : ''].filter(Boolean).join(', ');
  return `Edite a ${comReferencia ? 'PRIMEIRA imagem anexada (a foto modelo)' : 'imagem anexada'} mantendo EXATAMENTE o mesmo cenário, enquadramento, ângulo de câmera, iluminação e cores: o depósito com as prateleiras laranja cheias de caixas, barris e engradados à esquerda, as luminárias no teto, a parede de blocos com a lousa do Bar do Dindo emoldurada em madeira à direita (idêntica, sem alterar o logo nem as letras "BAR DO DINDO · DRINKS E CHOPP · NOVA OLARIA") e a bancada de concreto/inox em primeiro plano.

Substitua SOMENTE a garrafa do centro por este item do estoque: ${item}. Mostre a embalagem real e reconhecível do produto (garrafa, lata, fardo, caixa, saco ou pacote, conforme o item), com o rótulo nítido e de frente.

O item deve ficar no mesmo lugar: em pé e centralizado sobre a bancada, do mesmo tamanho aproximado da garrafa atual, com a mesma sombra suave e o mesmo reflexo na bancada. Se for hortifrúti ou algo vendido a granel, coloque-o numa caixa ou bandeja limpa sobre a bancada. Fotografia realista de produto.

Não adicione textos, pessoas, mãos nem outros objetos na bancada. Mantenha o formato horizontal 4:3.${comReferencia ? `

A SEGUNDA imagem anexada é a foto antiga deste item, em baixa resolução: use-a só como referência de qual é o produto (embalagem, rótulo e cores). Recrie a cena inteira nítida e em alta resolução, com foco preciso no rótulo, sem borrões nem artefatos de compressão.` : ''}`;
}

export function promptDaFoto(p: { nome: string; resumo?: string; ingredientes?: string }) {
  const drink = [p.nome.trim(), p.resumo?.trim(), p.ingredientes?.trim() ? `ingredientes: ${p.ingredientes.trim()}` : ''].filter(Boolean).join('. ');
  return `Edite a imagem anexada mantendo EXATAMENTE o mesmo cenário, enquadramento, ângulo de câmera, iluminação, cores e desfoque: a luminária pendente acesa no canto superior esquerdo, as plantas, as prateleiras com garrafas à esquerda, a parede de tijolos com a placa redonda do Bar do Dindo à direita (idêntica, sem alterar o logo nem as letras) e a mesa de madeira envernizada em primeiro plano.

Substitua SOMENTE o drink do centro por este drink do cardápio: ${drink}. Use o copo e a apresentação típicos desse drink.

O novo drink deve ficar no mesmo lugar e no mesmo tamanho: centralizado na mesa, ocupando a mesma altura da taça atual, com a mesma sombra suave e o mesmo reflexo na madeira, iluminado pela mesma luz quente da luminária. Gotículas de condensação e reflexos realistas no vidro. Fotografia realista de gastronomia.

Não adicione textos, pessoas, mãos nem outros objetos. Mantenha o formato horizontal 4:3.`;
}

/* ---------- geração direta pela API do Gemini (precisa do faturamento ativo na chave de Configurações) ---------- */

/** Modelos de imagem tentados em ordem: um aposentado (404) ou sobrecarregado dá a vez ao próximo. */
const MODELOS_IMAGEM = ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
const ESPERA_IMAGEM_MS = 120_000;

/** Erro que vale para todos os itens (chave inválida, sem faturamento): a fila para em vez de tentar o próximo. */
export class ErroDaChave extends Error {}

async function base64DaUrl(url: string): Promise<{ mime: string; dados: string }> {
  const blob = await (await fetch(url)).blob();
  const dataUrl = await new Promise<string>((ok, erro) => {
    const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => erro(new Error('Não foi possível ler a imagem.')); r.readAsDataURL(blob);
  });
  return { mime: dataUrl.slice(5, dataUrl.indexOf(';')), dados: dataUrl.split(',')[1] ?? '' };
}

type RespostaImagem = { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }[] } }[] };

async function pedirImagem(chave: string, parts: unknown[], sinal?: AbortSignal): Promise<RespostaImagem> {
  let ultimoErro = 'A IA não conseguiu gerar a foto.';
  for (const m of MODELOS_IMAGEM) {
    // 2K deixa o rótulo nítido; modelos que não aceitam o tamanho recebem o pedido sem ele
    for (const imageConfig of [{ aspectRatio: '4:3', imageSize: '2K' }, { aspectRatio: '4:3' }]) {
      const parar = new AbortController();
      const relogio = setTimeout(() => parar.abort(), ESPERA_IMAGEM_MS);
      const cancelar = () => parar.abort();
      sinal?.addEventListener('abort', cancelar);
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(chave)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: parar.signal,
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig } }),
      }).catch(() => {
        if (sinal?.aborted) throw new DOMException('Cancelado', 'AbortError');
        if (parar.signal.aborted) return null;
        throw new Error('Sem conexão com a IA. Verifique a internet e tente de novo.');
      }).finally(() => { clearTimeout(relogio); sinal?.removeEventListener('abort', cancelar); });
      if (!resp) { ultimoErro = 'A IA do Google está demorando demais agora. Tente de novo em alguns minutos.'; break; }
      const json = await resp.json().catch(() => ({}));
      if (resp.ok) return json as RespostaImagem;
      const msg = String(json?.error?.message ?? '');
      if (resp.status === 400 && /API key/i.test(msg)) throw new ErroDaChave('A chave da IA é inválida. Confira em Configurações → Parâmetros.');
      if (resp.status === 403) throw new ErroDaChave('A chave da IA não permite este endereço. Confira as restrições da chave no Google AI Studio.');
      // o plano gratuito do Google não gera imagens: a cota de imagem vem zerada ou a conta pede faturamento
      if (/billing|free.?tier|limit: ?0|paid/i.test(msg)) {
        throw new ErroDaChave('A geração de fotos precisa do faturamento ativo na chave do Gemini (o plano gratuito do Google não inclui imagens). Ative em aistudio.google.com e tente de novo.');
      }
      if (resp.status === 400 && imageConfig.imageSize) continue;
      ultimoErro = resp.status === 429 ? 'O limite de pedidos da IA acabou por agora. Tente de novo em alguns minutos.'
        : resp.status >= 500 ? 'A IA do Google está sobrecarregada agora. Tente de novo em alguns minutos.'
        : `A IA não conseguiu gerar a foto${msg ? `: ${msg}` : '.'}`;
      break;
    }
  }
  throw new Error(ultimoErro);
}

/**
 * Refaz a foto de um item do Estoque no padrão do depósito, direto pela API do Gemini: manda a foto modelo e a foto atual
 * (como referência do produto) e devolve a nova já no tamanho guardado no cadastro.
 */
export async function gerarFotoEstoque(item: Record<string, unknown>, sinal?: AbortSignal): Promise<string> {
  const nome = String(item.item ?? '').trim();
  if (!nome) throw new Error('O item está sem nome.');
  const { chave } = await chaveDaIA().catch((e) => { throw new ErroDaChave(e instanceof Error ? e.message : String(e)); });
  const modelo = await base64DaUrl(modeloEstoqueUrl);
  const atual = typeof item.foto === 'string' && item.foto.startsWith('data:image/') ? item.foto : '';
  const prompt = promptDaFotoEstoque({
    item: nome, categoria: String(item.categoria ?? ''), unidade: String(item.unidade ?? ''), conteudo: item.conteudo, conteudoUnidade: String(item.conteudoUnidade ?? ''),
  }, !!atual);
  const parts: unknown[] = [{ text: prompt }, { inline_data: { mime_type: modelo.mime, data: modelo.dados } }];
  if (atual) parts.push({ inline_data: { mime_type: atual.slice(5, atual.indexOf(';')), data: atual.split(',')[1] ?? '' } });
  const resp = await pedirImagem(chave, parts, sinal);
  const parte = resp.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data || x.inline_data?.data);
  const dados = parte?.inlineData?.data ?? parte?.inline_data?.data;
  const mime = parte?.inlineData?.mimeType ?? parte?.inline_data?.mime_type ?? 'image/png';
  if (!dados) throw new Error('A IA não devolveu uma imagem desta vez. Tente gerar de novo.');
  const blob = await (await fetch(`data:${mime};base64,${dados}`)).blob();
  return fotoNoTamanho(blob);
}
