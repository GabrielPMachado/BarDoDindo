/**
 * Mover um registro para outra tela do mesmo fluxo (ex.: uma publicação da Gestão de mídias que volta para a Criação,
 * ou um item lançado no Estoque que na verdade é um Material). O registro novo nasce com o que dá para aproveitar
 * (nome, datas, foto, anexos, fornecedor…) e o antigo é excluído ao salvar.
 */
import { COLLECTIONS, type CollectionDef, type Field } from '../collections';
import type { Row } from './data';
import { camposDosLocais, locaisDe } from './locais';

/** Telas que seguem o mesmo fluxo: um registro de uma pode ir para outra. */
const FAMILIAS = [
  ['criacao', 'midias'],
  ['estoque', 'materiais', 'patrimonio', 'equipamentos'],
];

/** Campos com nomes diferentes que guardam a mesma coisa. */
const EQUIVALENTES = [
  ['peca', 'conteudo'],
  ['entrega', 'data'],
  ['item', 'material', 'nome'],
  ['custo', 'valor'],
  ['tipo', 'categoria'],
  ['estado', 'status'],
];

/** Valores que mudam de nome na outra tela (tela de destino → campo → valor de origem → valor no destino). */
const TRADUCOES: Record<string, Record<string, Record<string, string>>> = {
  midias: { status: { Briefing: 'Rascunho', 'Em produção': 'Rascunho', 'Em aprovação': 'Rascunho', Aprovado: 'Agendado', Cancelado: 'Rascunho' } },
  criacao: { status: { Rascunho: 'Em produção', Agendado: 'Aprovado' } },
  materiais: { estado: { Baixado: 'Descartar', Ativo: 'Bom', Inativo: 'Descartar' } },
  patrimonio: { estado: { Descartar: 'Baixado', Ativo: 'Bom', Inativo: 'Baixado' } },
  equipamentos: { status: { Novo: 'Ativo', Bom: 'Ativo', Regular: 'Ativo', Descartar: 'Inativo', Baixado: 'Inativo' } },
};

/** Para onde um registro desta tela pode ir. */
export function destinosDe(id: string): CollectionDef[] {
  const familia = FAMILIAS.find((f) => f.includes(id));
  return familia ? familia.filter((d) => d !== id).map((d) => COLLECTIONS[d]).filter(Boolean) : [];
}

const vazio = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/** Campo da origem que alimenta este campo do destino (o de mesmo nome ou um equivalente). */
function origemDo(f: Field, origem: CollectionDef): Field | undefined {
  const mesmo = origem.fields.find((o) => o.key === f.key);
  if (mesmo) return mesmo;
  const grupo = EQUIVALENTES.find((g) => g.includes(f.key));
  return grupo ? origem.fields.find((o) => grupo.includes(o.key)) : undefined;
}

/**
 * Dados do registro novo, já no formato da tela de destino, e o que fica para trás
 * (campos preenchidos que a outra tela não tem).
 */
export function dadosParaMover(origem: CollectionDef, destino: CollectionDef, row: Row) {
  const dados: Record<string, unknown> = {};
  const usados = new Set<string>();
  for (const f of destino.fields) {
    // o título (Peça, Conteúdo, Item, Bem…) sempre vai, mesmo com nomes diferentes
    const o = f === destino.fields[0] ? origem.fields[0] : origemDo(f, origem);
    if (!o || vazio(row[o.key])) continue;
    let v = row[o.key];
    if (typeof v === 'string') v = TRADUCOES[destino.id]?.[f.key]?.[v] ?? v;
    // opção que não existe na outra tela (ex.: categoria "Bebidas" num material): a pessoa escolhe
    if (f.type === 'select' && f.options && !f.options.includes(String(v))) continue;
    // tipos diferentes só passam para texto (ex.: o local escolhido numa lista vira texto livre)
    if (f.type !== o.type && !(['text', 'textarea'].includes(f.type) && ['text', 'textarea', 'select'].includes(o.type))) continue;
    dados[f.key] = v;
    usados.add(o.key);
    if (f.refKey && o.refKey) dados[f.refKey] = row[o.refKey] ?? null;
    if (f.outros && o.outros) dados[f.outros] = row[o.outros];
    if (f.outrosLinks && o.outrosLinks) dados[f.outrosLinks] = row[o.outrosLinks];
  }
  // quantidade por local (Estoque e Materiais) ou só o total (Patrimônio)
  if (destino.porLocal && (origem.porLocal || !vazio(row.quantidade))) {
    dados.locais = locaisDe(row);
    usados.add('quantidade').add('local');
  }
  if (destino.comFoto && row.foto) dados.foto = row.foto;
  if (destino.anexos && Array.isArray(row.anexos)) dados.anexos = row.anexos;

  const ficam = origem.fields
    .filter((f) => !usados.has(f.key) && f !== origem.fields[0] && !vazio(row[f.key]))
    .map((f) => f.label);
  if (row.foto && !destino.comFoto) ficam.push('Foto');
  if (Array.isArray(row.anexos) && row.anexos.length && !destino.anexos) ficam.push('Anexos');
  return { dados, ficam };
}

/**
 * Mover vários de uma vez (sem abrir o formulário de cada um): o corpo do registro novo, no formato que o
 * formulário grava. `extras` preenche os obrigatórios que o item não tem (ex.: o Canal, na Gestão de mídias).
 */
export function registroParaMover(destino: CollectionDef, dados: Record<string, unknown>, extras: Record<string, unknown> = {}) {
  const corpo: Record<string, unknown> = {};
  for (const f of destino.fields) {
    corpo[f.key] = vazio(dados[f.key]) ? (extras[f.key] ?? f.default ?? '') : dados[f.key];
    if (f.refKey) corpo[f.refKey] = dados[f.refKey] ?? null;
    if (f.outros) corpo[f.outros] = Array.isArray(dados[f.outros]) ? dados[f.outros] : [];
    if (f.outrosLinks) corpo[f.outrosLinks] = Array.isArray(dados[f.outrosLinks]) ? dados[f.outrosLinks] : [];
  }
  if (destino.comFoto) corpo.foto = dados.foto ?? '';
  if (destino.porLocal) Object.assign(corpo, camposDosLocais(locaisDe(dados), destino.fields.some((f) => f.key === 'local')));
  const falta = destino.fields.find((f) => f.required && vazio(corpo[f.key]));
  return { corpo, falta: falta?.label };
}

/** Campos obrigatórios do destino que algum dos itens não tem como preencher. */
export function obrigatoriosQueFaltam(origem: CollectionDef, destino: CollectionDef, rows: Row[]): Field[] {
  const todos = rows.map((r) => dadosParaMover(origem, destino, r).dados);
  return destino.fields.filter((f) => f.required && f.default === undefined && todos.some((d) => vazio(d[f.key])));
}
