/* Questionário do afilhado: regras usadas igual no app e no pré-cadastro. */
import type { Pergunta } from './backend';

/** "Outro", "Outros", "Outra"... abre um campo para a pessoa escrever. */
export const ehOutro = (o: string) => /^outr[oa]s?$/i.test(o.trim());

/** Texto livre do afilhado (perguntas sem opções). */
export const LIMITE_TEXTO = 2000;

/**
 * Resposta gravada (sempre um texto, como as de antes): as opções marcadas separadas por "; ",
 * com o que a pessoa escreveu no "Outro" ("Outro: …"). Pergunta sem opções grava o texto livre.
 */
export function montarResposta(p: Pergunta, marcadas: string[], outro: string): string {
  if (!p.opcoes.length) return (marcadas[0] ?? '').trim();
  return p.opcoes
    .filter((o) => marcadas.includes(o))
    .map((o) => (ehOutro(o) && outro.trim() ? `${o}: ${outro.trim()}` : o))
    .join('; ');
}

/** Marca ou desmarca uma opção: na múltipla escolha soma às outras; senão troca a marcada. */
export function alternar(p: Pergunta, marcadas: string[], o: string): string[] {
  if (marcadas.includes(o)) return marcadas.filter((x) => x !== o);
  return p.multipla ? [...marcadas, o] : [o];
}

const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
/** "YURI gotuzzo da silva" → "Yuri Gotuzzo da Silva". */
export const nomeBonito = (nome: string) => nome.trim().toLocaleLowerCase('pt-BR').split(/\s+/)
  .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toLocaleUpperCase('pt-BR'))))
  .join(' ');

/** Número da pergunta com dois dígitos: "Pergunta 01/10". */
export const contador = (i: number, total: number) => `Pergunta ${String(i + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`;

export const INSTAGRAM = { arroba: '@bardodindo', url: 'https://instagram.com/bardodindo' };
