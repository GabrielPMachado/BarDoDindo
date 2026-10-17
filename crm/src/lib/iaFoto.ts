/**
 * Foto do produto no padrão do Bar do Dindo, feita de graça no app do Gemini:
 * o Cérebro monta o pedido (prompt) com o drink e entrega a foto modelo (o Aperol na mesa do bar,
 * com a placa do Dindo); a pessoa gera no Gemini e envia a foto pronta de volta.
 */
import modeloUrl from '../assets/foto-modelo-dindo.jpg';
import modeloEstoqueUrl from '../assets/foto-modelo-estoque.jpg';

export const FOTO_MODELO_URL = modeloUrl;
export const GEMINI_URL = 'https://gemini.google.com/app';

/** Padrões de foto: drinks na mesa do bar; itens do Estoque na bancada do depósito, com a lousa do Dindo ao fundo. */
export type PadraoFoto = 'produto' | 'estoque';
export const MODELOS: Record<PadraoFoto, { url: string; arquivo: string; oQue: string }> = {
  produto: { url: modeloUrl, arquivo: 'foto-modelo-bar-do-dindo.jpg', oQue: 'drink' },
  estoque: { url: modeloEstoqueUrl, arquivo: 'foto-modelo-estoque-bar-do-dindo.jpg', oQue: 'item' },
};

/** Pedido para a foto de um item do Estoque, no padrão do depósito (a garrafa sobre a bancada, com a lousa do Dindo). */
export function promptDaFotoEstoque(p: { item: string; categoria?: string; unidade?: string; conteudo?: unknown; conteudoUnidade?: string }) {
  const conteudo = Number(p.conteudo) > 0 ? `${String(p.conteudo).replace('.', ',')} ${p.conteudoUnidade || ''}`.trim() : '';
  const item = [p.item.trim(), p.categoria ? `categoria: ${p.categoria}` : '', conteudo ? `embalagem de ${conteudo}` : p.unidade ? `vendido por ${p.unidade}` : ''].filter(Boolean).join(', ');
  return `Edite a imagem anexada mantendo EXATAMENTE o mesmo cenário, enquadramento, ângulo de câmera, iluminação e cores: o depósito com as prateleiras laranja cheias de caixas, barris e engradados à esquerda, as luminárias no teto, a parede de blocos com a lousa do Bar do Dindo emoldurada em madeira à direita (idêntica, sem alterar o logo nem as letras "BAR DO DINDO · DRINKS E CHOPP · NOVA OLARIA") e a bancada de concreto/inox em primeiro plano.

Substitua SOMENTE a garrafa do centro por este item do estoque: ${item}. Mostre a embalagem real e reconhecível do produto (garrafa, lata, fardo, caixa, saco ou pacote, conforme o item), com o rótulo nítido e de frente.

O item deve ficar no mesmo lugar: em pé e centralizado sobre a bancada, do mesmo tamanho aproximado da garrafa atual, com a mesma sombra suave e o mesmo reflexo na bancada. Se for hortifrúti ou algo vendido a granel, coloque-o numa caixa ou bandeja limpa sobre a bancada. Fotografia realista de produto.

Não adicione textos, pessoas, mãos nem outros objetos na bancada. Mantenha o formato horizontal 4:3.`;
}

export function promptDaFoto(p: { nome: string; resumo?: string; ingredientes?: string }) {
  const drink = [p.nome.trim(), p.resumo?.trim(), p.ingredientes?.trim() ? `ingredientes: ${p.ingredientes.trim()}` : ''].filter(Boolean).join('. ');
  return `Edite a imagem anexada mantendo EXATAMENTE o mesmo cenário, enquadramento, ângulo de câmera, iluminação, cores e desfoque: a luminária pendente acesa no canto superior esquerdo, as plantas, as prateleiras com garrafas à esquerda, a parede de tijolos com a placa redonda do Bar do Dindo à direita (idêntica, sem alterar o logo nem as letras) e a mesa de madeira envernizada em primeiro plano.

Substitua SOMENTE o drink do centro por este drink do cardápio: ${drink}. Use o copo e a apresentação típicos desse drink.

O novo drink deve ficar no mesmo lugar e no mesmo tamanho: centralizado na mesa, ocupando a mesma altura da taça atual, com a mesma sombra suave e o mesmo reflexo na madeira, iluminado pela mesma luz quente da luminária. Gotículas de condensação e reflexos realistas no vidro. Fotografia realista de gastronomia.

Não adicione textos, pessoas, mãos nem outros objetos. Mantenha o formato horizontal 4:3.`;
}
