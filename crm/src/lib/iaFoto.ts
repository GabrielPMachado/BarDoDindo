/**
 * Foto do produto no padrão do Bar do Dindo, feita de graça no app do Gemini:
 * o Cérebro monta o pedido (prompt) com o drink e entrega a foto modelo (o Aperol na mesa do bar,
 * com a placa do Dindo); a pessoa gera no Gemini e envia a foto pronta de volta.
 */
import modeloUrl from '../assets/foto-modelo-dindo.jpg';

export const FOTO_MODELO_URL = modeloUrl;
export const GEMINI_URL = 'https://gemini.google.com/app';

export function promptDaFoto(p: { nome: string; resumo?: string; ingredientes?: string }) {
  const drink = [p.nome.trim(), p.resumo?.trim(), p.ingredientes?.trim() ? `ingredientes: ${p.ingredientes.trim()}` : ''].filter(Boolean).join('. ');
  return `Edite a imagem anexada mantendo EXATAMENTE o mesmo cenário, enquadramento, ângulo de câmera, iluminação, cores e desfoque: a luminária pendente acesa no canto superior esquerdo, as plantas, as prateleiras com garrafas à esquerda, a parede de tijolos com a placa redonda do Bar do Dindo à direita (idêntica, sem alterar o logo nem as letras) e a mesa de madeira envernizada em primeiro plano.

Substitua SOMENTE o drink do centro por este drink do cardápio: ${drink}. Use o copo e a apresentação típicos desse drink.

O novo drink deve ficar no mesmo lugar e no mesmo tamanho: centralizado na mesa, ocupando a mesma altura da taça atual, com a mesma sombra suave e o mesmo reflexo na madeira, iluminado pela mesma luz quente da luminária. Gotículas de condensação e reflexos realistas no vidro. Fotografia realista de gastronomia.

Não adicione textos, pessoas, mãos nem outros objetos. Mantenha o formato horizontal 4:3.`;
}
