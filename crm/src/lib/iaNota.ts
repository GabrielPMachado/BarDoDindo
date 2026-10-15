/**
 * Leitura da nota fiscal por IA (Google Gemini, cota gratuita): a foto (ou o PDF) vai para a IA, que devolve
 * fornecedor, número, data e itens. A chave fica no banco (segredos/ia), legível só pela equipe logada.
 */
import { api } from './api';

export interface NotaLida {
  fornecedor: string;
  cnpj: string;
  numero: string;
  data: string;
  itens: { descricao: string; quantidade: number; unidade: string; valorUnitario: number; valorTotal: number }[];
  total: number;
}

const MODELO_PADRAO = 'gemini-2.5-flash';

const PROMPT = `Você lê notas fiscais e cupons de compra brasileiros (NF-e, NFC-e, cupom, recibo) de um bar.
Extraia: nome do fornecedor (razão social ou nome fantasia), CNPJ (só números), número da nota, data de emissão
(formato AAAA-MM-DD), cada item comprado e o valor total. Para cada item: descrição como está na nota, quantidade,
unidade (UN, CX, KG, L, FD, PCT…), valor unitário e valor total do item, em reais (número com ponto decimal).
Se a quantidade vier em caixas ou fardos, mantenha como está na nota. Não invente: deixe em branco ("" ou 0) o que não der para ler.`;

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    fornecedor: { type: 'STRING' }, cnpj: { type: 'STRING' }, numero: { type: 'STRING' }, data: { type: 'STRING' }, total: { type: 'NUMBER' },
    itens: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { descricao: { type: 'STRING' }, quantidade: { type: 'NUMBER' }, unidade: { type: 'STRING' }, valorUnitario: { type: 'NUMBER' }, valorTotal: { type: 'NUMBER' } },
        required: ['descricao', 'quantidade', 'valorUnitario'],
      },
    },
  },
  required: ['fornecedor', 'itens'],
};

/** Foto grande demais pesa no envio: reduz para no máximo 1600 px (o suficiente para ler a nota). */
function imagemReduzida(arquivo: File): Promise<{ mime: string; dados: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const esc = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', dados: c.toDataURL('image/jpeg', 0.88).split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem.')); };
    img.src = url;
  });
}
function arquivoBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(arquivo);
  });
}

export async function lerNotaComIA(arquivo: File): Promise<NotaLida> {
  const { chave, modelo } = await api<{ chave: string; modelo: string }>('/crm/ia/chave');
  if (!chave) throw new Error('A IA ainda não foi configurada. Peça a quem administra o sistema para cadastrar a chave em Configurações → Parâmetros.');
  const pdf = arquivo.type === 'application/pdf';
  if (!pdf && !arquivo.type.startsWith('image/')) throw new Error('Envie uma foto ou um PDF da nota.');
  if (arquivo.size > 15 * 1024 * 1024) throw new Error('Arquivo grande demais (máximo 15 MB).');
  const conteudo = pdf ? { mime: 'application/pdf', dados: await arquivoBase64(arquivo) } : await imagemReduzida(arquivo);

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo || MODELO_PADRAO}:generateContent?key=${encodeURIComponent(chave)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: conteudo.mime, data: conteudo.dados } }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: ESQUEMA },
    }),
  }).catch(() => { throw new Error('Sem conexão com a IA. Verifique a internet e tente de novo.'); });
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = String(corpo?.error?.message ?? '');
    if (resp.status === 429) throw new Error('A cota gratuita da IA acabou por agora. Tente de novo em alguns minutos.');
    if (resp.status === 400 && /API key/i.test(msg)) throw new Error('A chave da IA é inválida. Confira em Configurações → Parâmetros.');
    if (resp.status === 403) throw new Error('A chave da IA não permite este endereço. Confira as restrições da chave no Google AI Studio.');
    throw new Error(`A IA não conseguiu ler a nota${msg ? `: ${msg}` : '.'}`);
  }
  const texto = corpo?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  let lida: Partial<NotaLida>;
  try { lida = JSON.parse(texto); } catch { throw new Error('A IA não devolveu a nota num formato legível. Tente uma foto mais nítida.'); }
  const itens = (Array.isArray(lida.itens) ? lida.itens : [])
    .map((i) => ({
      descricao: String(i?.descricao ?? '').trim(), quantidade: Number(i?.quantidade) || 0, unidade: String(i?.unidade ?? '').trim(),
      valorUnitario: Number(i?.valorUnitario) || (Number(i?.valorTotal) && Number(i?.quantidade) ? Number(i.valorTotal) / Number(i.quantidade) : 0),
      valorTotal: Number(i?.valorTotal) || 0,
    }))
    .filter((i) => i.descricao);
  if (!itens.length) throw new Error('A IA não encontrou itens na nota. Tente uma foto mais nítida e com a nota inteira.');
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(lida.data ?? '')) ? String(lida.data) : '';
  return { fornecedor: String(lida.fornecedor ?? '').trim(), cnpj: String(lida.cnpj ?? '').replace(/\D/g, ''), numero: String(lida.numero ?? '').trim(), data, itens, total: Number(lida.total) || 0 };
}

/* ---------- correspondência com os cadastros ---------- */
const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ');
const palavras = (s: string) => normalizar(s).split(/\s+/).filter((p) => p.length > 1 && !/^\d+$/.test(p) && !['de', 'da', 'do', 'com', 'un', 'ml', 'lt', 'cx', 'pct'].includes(p));

/** Nota de 0 a 1 para quão parecidos são dois nomes (palavras em comum). */
export function semelhanca(a: string, b: string) {
  const pa = palavras(a), pb = new Set(palavras(b));
  if (!pa.length || !pb.size) return 0;
  const comuns = pa.filter((p) => pb.has(p) || [...pb].some((q) => q.length > 3 && (q.startsWith(p) || p.startsWith(q)))).length;
  return comuns / Math.min(pa.length, pb.size);
}

/** O cadastro mais parecido com o nome lido (ou nada, se nenhum for parecido o bastante). */
export function maisParecido<T extends { nome: string }>(nome: string, lista: T[], minimo = 0.6): T | null {
  let melhor: T | null = null, nota = 0;
  for (const x of lista) {
    const s = semelhanca(nome, x.nome);
    if (s > nota) { melhor = x; nota = s; }
  }
  return nota >= minimo ? melhor : null;
}

/** "AP 750ML ORIG" → "Ap 750ml Orig": nome de item novo a partir da descrição da nota. */
export const nomeBonito = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/(^|\s)\S/g, (c) => c.toUpperCase()).slice(0, 120);
