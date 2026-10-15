/** Preenche o cardápio de um produto com IA (mesma chave gratuita do Gemini usada na leitura de notas). */
import { chaveDaIA, gerarComGemini } from './iaNota';

export interface ProdutoIA {
  resumo: string;
  historia: string;
  ingredientes: string[];
  teor: number;
  docura: number;
  amargor: number;
  acidez: number;
  intensidade: number;
  notas: string[];
}

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    resumo: { type: 'STRING' }, historia: { type: 'STRING' },
    ingredientes: { type: 'ARRAY', items: { type: 'STRING' } },
    teor: { type: 'NUMBER' }, docura: { type: 'INTEGER' }, amargor: { type: 'INTEGER' }, acidez: { type: 'INTEGER' }, intensidade: { type: 'INTEGER' },
    notas: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['resumo', 'historia', 'ingredientes', 'teor', 'docura', 'amargor', 'acidez', 'intensidade', 'notas'],
};

const PROMPT = `Você escreve o cardápio do Bar do Dindo, um bar brasileiro de drinks e chopp. Escreva em português do Brasil,
num tom simpático e direto, sem exageros nem emojis. Para o produto informado, devolva:
- resumo: 1 frase de até 110 caracteres dizendo o que é e como é o sabor (vai na lista do cardápio);
- historia: 2 a 4 frases sobre a origem ou a história do drink/prato. Se não houver história conhecida, fale do preparo e do sabor.
  Não invente datas, nomes ou fatos de que não tenha certeza;
- ingredientes: nomes simples, com inicial maiúscula, sem marca de embalagem, volume ou quantidade (ex.: "Aperol", "Espumante brut",
  "Água com gás", "Rodela de laranja", "Gelo"). Quando houver insumos da ficha técnica, use-os como base;
- teor: teor alcoólico aproximado do produto pronto, em %, com no máximo 1 casa decimal (0 para comida ou bebida sem álcool);
- docura, amargor, acidez, intensidade: de 0 a 5 (use 0 quando não se aplicar, como em comidas);
- notas: até 4 notas de sabor curtas (ex.: "Cítrico", "Refrescante", "Herbal").`;

const nota = (v: unknown) => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
const lista = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, max);

export async function preencherProdutoComIA(p: { nome: string; categoria: string; descricao?: string; insumos: string[] }): Promise<ProdutoIA> {
  if (!p.nome.trim()) throw new Error('Informe o nome do produto antes de usar a IA.');
  const { chave, modelo } = await chaveDaIA();
  const dados = [
    `Produto: ${p.nome}`,
    p.categoria ? `Categoria: ${p.categoria}` : '',
    p.insumos.length ? `Insumos da ficha técnica: ${p.insumos.join(', ')}` : '',
    p.descricao?.trim() ? `Descrição atual (pode usar como base): ${p.descricao.trim()}` : '',
  ].filter(Boolean).join('\n');
  const texto = await gerarComGemini(chave, modelo, [{ text: `${PROMPT}\n\n${dados}` }], ESQUEMA, 'preencher o produto', 0.4);
  let r: Partial<ProdutoIA>;
  try { r = JSON.parse(texto); } catch { throw new Error('A IA não devolveu uma resposta legível. Tente de novo.'); }
  const teor = Math.max(0, Math.min(100, Math.round((Number(r.teor) || 0) * 10) / 10));
  return {
    resumo: String(r.resumo ?? '').trim().slice(0, 200), historia: String(r.historia ?? '').trim(),
    ingredientes: lista(r.ingredientes, 20), teor,
    docura: nota(r.docura), amargor: nota(r.amargor), acidez: nota(r.acidez), intensidade: nota(r.intensidade),
    notas: lista(r.notas, 4),
  };
}
