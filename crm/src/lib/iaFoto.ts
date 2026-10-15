/**
 * Foto do produto no padrão do Bar do Dindo, gerada por IA (Gemini, modelos de imagem):
 * parte da foto modelo (o Aperol na mesa do bar, com a placa do Dindo) e troca só o drink.
 * A geração de imagem não tem cota gratuita no Google: precisa do faturamento ativo na chave.
 */
import modeloUrl from '../assets/foto-modelo-dindo.jpg';
import { chamarGemini, chaveDaIA } from './iaNota';

const MODELOS_IMAGEM = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview'];

async function base64DaUrl(url: string): Promise<{ mime: string; dados: string }> {
  const blob = await (await fetch(url)).blob();
  const dataUrl = await new Promise<string>((ok, erro) => {
    const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => erro(new Error('Não foi possível ler a imagem.')); r.readAsDataURL(blob);
  });
  return { mime: dataUrl.slice(5, dataUrl.indexOf(';')), dados: dataUrl.split(',')[1] ?? '' };
}

/** Reduz a imagem gerada para o tamanho usado nas fotos do cadastro (640 px no lado maior). */
function reduzir(dataUrl: string, lado = 640): Promise<string> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => erro(new Error('A IA devolveu uma imagem que não pôde ser aberta.'));
    img.src = dataUrl;
  });
}

export interface PedidoFoto {
  nome: string;
  resumo?: string;
  ingredientes?: string;
  /** foto atual do produto (data URL), usada como referência do drink */
  fotoAtual?: string;
}

export async function gerarFotoNoPadrao(p: PedidoFoto, sinal?: AbortSignal): Promise<string> {
  if (!p.nome.trim()) throw new Error('Informe o nome do produto antes de gerar a foto.');
  const { chave } = await chaveDaIA();
  const modelo = await base64DaUrl(modeloUrl);
  const ref = p.fotoAtual?.startsWith('data:image/') ? { mime: p.fotoAtual.slice(5, p.fotoAtual.indexOf(';')), dados: p.fotoAtual.split(',')[1] ?? '' } : null;
  const drink = [p.nome, p.resumo, p.ingredientes ? `ingredientes: ${p.ingredientes}` : ''].filter(Boolean).join('. ');
  const prompt = `Edite a PRIMEIRA imagem anexada mantendo EXATAMENTE o mesmo cenário, enquadramento, ângulo de câmera, iluminação, cores e desfoque:
a luminária pendente acesa no canto superior esquerdo, as plantas, as prateleiras com garrafas à esquerda, a parede de tijolos com a placa
redonda do Bar do Dindo à direita (idêntica, sem alterar o logo nem as letras) e a mesa de madeira envernizada em primeiro plano.

Substitua SOMENTE o drink do centro por este produto do cardápio: ${drink}.
Use o copo e a apresentação típicos desse drink${ref ? ' e, como referência de aparência do drink, a SEGUNDA imagem anexada' : ''}.

O novo drink deve ficar no mesmo lugar e no mesmo tamanho: centralizado na mesa, ocupando a mesma altura da taça atual, com a mesma sombra
suave e o mesmo reflexo na madeira, iluminado pela mesma luz quente da luminária. Gotículas de condensação e reflexos realistas no vidro.
Fotografia realista de gastronomia. Não adicione textos, pessoas, mãos nem outros objetos. Formato horizontal 4:3.`;
  const parts: unknown[] = [{ text: prompt }, { inline_data: { mime_type: modelo.mime, data: modelo.dados } }];
  if (ref) parts.push({ inline_data: { mime_type: ref.mime, data: ref.dados } });

  let resp: { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string }; inline_data?: { mime_type: string; data: string } }[] } }[] };
  try {
    resp = await chamarGemini(chave, MODELOS_IMAGEM, { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }, 'gerar a foto', 120_000, sinal);
  } catch (e) {
    if (e instanceof Error && e.message === 'SEM_FATURAMENTO') {
      throw new Error('A geração de foto precisa do faturamento ativo na chave do Gemini (o plano gratuito do Google não inclui imagens). Ative em aistudio.google.com e tente de novo.');
    }
    throw e;
  }
  const parte = resp?.candidates?.[0]?.content?.parts?.find((x) => x.inlineData || x.inline_data);
  const img = parte?.inlineData ? { mime: parte.inlineData.mimeType, data: parte.inlineData.data } : parte?.inline_data ? { mime: parte.inline_data.mime_type, data: parte.inline_data.data } : null;
  if (!img?.data) throw new Error('A IA não devolveu uma imagem desta vez. Tente gerar de novo.');
  return reduzir(`data:${img.mime || 'image/png'};base64,${img.data}`);
}
