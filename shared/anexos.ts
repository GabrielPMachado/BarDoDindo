/**
 * Documentos em PDF anexados aos cadastros do CRM (currículo do colaborador, contrato assinado, nota fiscal…).
 * O arquivo fica no próprio Firestore, dividido em partes de até 900 KB (cada documento guarda no máximo 1 MB):
 * `anexos/{cadastro}/itens/{id}` descreve o arquivo e `…/partes/{n}` guarda os pedaços, na ordem.
 *
 * Gravação em três passos, conferidos em `firestore.rules`:
 *  1. o registro do arquivo nasce com `pronto: false` (ainda não aparece nas listas);
 *  2. as partes só entram enquanto ele não está pronto, e só pelo autor;
 *  3. o autor marca `pronto: true`. Daí em diante nada muda: remover apaga o registro e as partes no mesmo lote.
 * Assim não sobram pedaços soltos sem dono, e o conteúdo de um PDF já anexado não pode ser trocado.
 */
import {
  Bytes, collection, doc, getDoc, getDocs, query, where, writeBatch,
  type Firestore, type Query, type WriteBatch,
} from 'firebase/firestore';

/** Cadastros que aceitam documentos (o mesmo conjunto vale em `firestore.rules`). */
export const COLECOES_COM_ANEXO = ['colaboradores', 'ferias', 'contratos', 'terceirizados', 'fornecedores', 'trabalhista', 'consultoria', 'despesas'];
export const ANEXO_TAMANHO_MAXIMO = 5 * 1024 * 1024;
const TAMANHO_DA_PARTE = 900_000;
const ASSINATURA_PDF = '%PDF-';
/** Envios interrompidos (aba fechada, queda de rede) mais antigos que isto são limpos no próximo envio do mesmo autor. */
const ENVIO_ABANDONADO_MS = 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dados = Record<string, any>;

export interface Anexo {
  id: string;
  nome: string;
  tamanho: number;
  criadoEm: string;
  criadoPorNome: string;
}

interface Req { p: Record<string, string> }
/** O que o módulo precisa do backend: sessão, permissões, histórico e as consultas ao vivo. `C` é a sessão do usuário. */
interface Deps<C> {
  db: Firestore;
  fail: (status: number, mensagem: string) => never;
  rota: (metodo: string, caminho: string, handler: (r: Req) => unknown) => void;
  lista: (chave: string, q: Query) => Promise<Dados[]>;
  requireUsuario: () => Promise<C>;
  requireAccess: (ctx: C, area: string, acao: 'ver' | 'editar') => void;
  autor: (ctx: C) => { id: string; nome: string };
  areaDe: (colecao: string) => string;
  registro: (colecao: string, id: string) => Promise<Dados | null>;
  registrar: (lote: WriteBatch, ctx: C, area: string, acao: string, extra?: { colecao?: string; alvo?: string; detalhe?: string }) => void;
  nomeDe: (registro: Dados | null) => string;
  agora: () => string;
}

const publico = (a: Dados): Anexo => ({ id: a.id, nome: a.nome, tamanho: a.tamanho, criadoEm: a.criadoEm, criadoPorNome: a.criadoPorNome ?? '' });
const ehPdf = (bytes: Uint8Array) => String.fromCharCode(...bytes.subarray(0, ASSINATURA_PDF.length)) === ASSINATURA_PDF;
/** Nome de arquivo seguro para guardar e para baixar: sem caracteres de caminho e sempre terminado em .pdf. */
export function nomeDePdf(nome: string) {
  const limpo = nome.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().replace(/\.pdf$/i, '').slice(0, 150) || 'documento';
  return `${limpo}.pdf`;
}

export function criarAnexos<C>(d: Deps<C>) {
  const itens = (col: string) => collection(d.db, 'anexos', col, 'itens');
  const parte = (col: string, id: string, n: number) => doc(d.db, 'anexos', col, 'itens', id, 'partes', String(n));
  const doRegistro = (col: string, registroId: string) => query(itens(col), where('registroId', '==', registroId));
  /** Área (permissão) do cadastro; recusa cadastros que não aceitam documentos. */
  function areaDoAnexo(col: string) {
    if (!COLECOES_COM_ANEXO.includes(col)) return d.fail(404, 'Este cadastro não aceita documentos.');
    return d.areaDe(col);
  }
  /** Apaga o registro do arquivo e todas as partes de uma vez (as regras só deixam as partes saírem junto com ele). */
  function apagarNoLote(lote: WriteBatch, col: string, id: string, partes: number) {
    lote.delete(doc(itens(col), id));
    for (let n = 0; n < partes; n++) lote.delete(parte(col, id, n));
  }
  async function apagarAnexo(col: string, id: string, partes: number) {
    const lote = writeBatch(d.db);
    apagarNoLote(lote, col, id, partes);
    await lote.commit();
  }

  d.rota('GET', '/crm/anexos/:col/:id', async ({ p }) => {
    d.requireAccess(await d.requireUsuario(), areaDoAnexo(p.col), 'ver');
    // envios ainda em andamento (ou interrompidos) não aparecem
    return (await d.lista(`anexos/${p.col}@${p.id}`, doRegistro(p.col, p.id))).filter((a) => a.pronto === true).map(publico);
  });

  d.rota('DELETE', '/crm/anexos/:col/:anexoId', async ({ p }) => {
    const ctx = await d.requireUsuario();
    const area = areaDoAnexo(p.col);
    d.requireAccess(ctx, area, 'editar');
    const meta = (await getDoc(doc(itens(p.col), p.anexoId))).data();
    if (!meta) return d.fail(404, 'Documento não encontrado.');
    const lote = writeBatch(d.db);
    apagarNoLote(lote, p.col, p.anexoId, Number(meta.partes) || 0);
    // o histórico guarda de qual registro era o documento, sem o nome do arquivo (que pode dizer mais do que deve)
    d.registrar(lote, ctx, area, 'removeu um documento em PDF de', { colecao: p.col, alvo: d.nomeDe(await d.registro(p.col, String(meta.registroId))) });
    await lote.commit();
    return { ok: true };
  });

  /** Anexa um PDF a um registro. O documento só aparece na lista quando todas as partes subiram. */
  async function enviar(col: string, registroId: string, arquivo: File): Promise<Anexo> {
    const ctx = await d.requireUsuario();
    const area = areaDoAnexo(col);
    d.requireAccess(ctx, area, 'editar');
    const dono = await d.registro(col, registroId);
    if (!dono) return d.fail(404, 'Registro não encontrado.');
    if (!arquivo.size) d.fail(400, 'O arquivo está vazio.');
    if (arquivo.size > ANEXO_TAMANHO_MAXIMO) d.fail(413, `"${arquivo.name}" passa do limite de 5 MB. Reduza o arquivo e tente de novo.`);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await arquivo.arrayBuffer());
    } catch {
      return d.fail(400, `Não foi possível ler "${arquivo.name}". Selecione o arquivo de novo.`);
    }
    if (!ehPdf(bytes)) d.fail(400, `"${arquivo.name}" não é um PDF.`);

    const autor = d.autor(ctx);
    // restos de envios do próprio autor que pararam no meio (aba fechada, queda de rede) saem antes de um novo envio
    const limite = Date.now() - ENVIO_ABANDONADO_MS;
    const abandonados = (await getDocs(doRegistro(col, registroId))).docs
      .filter((s) => s.data().pronto !== true && s.data().criadoPor === autor.id && Date.parse(String(s.data().criadoEm)) < limite);
    for (const s of abandonados) await apagarAnexo(col, s.id, Number(s.data().partes) || 0).catch(() => undefined);

    const ref = doc(itens(col));
    const total = Math.ceil(bytes.length / TAMANHO_DA_PARTE);
    const meta = {
      registroId, nome: nomeDePdf(arquivo.name), tipo: 'application/pdf', tamanho: bytes.length, partes: total,
      criadoPor: autor.id, criadoPorNome: autor.nome, criadoEm: d.agora(),
    };
    const inicio = writeBatch(d.db);
    inicio.set(ref, { ...meta, pronto: false });
    await inicio.commit();
    try {
      for (let n = 0; n < total; n++) {
        const lote = writeBatch(d.db);
        lote.set(parte(col, ref.id, n), { n, dados: Bytes.fromUint8Array(bytes.subarray(n * TAMANHO_DA_PARTE, (n + 1) * TAMANHO_DA_PARTE)) });
        await lote.commit();
      }
      const fim = writeBatch(d.db);
      fim.update(ref, { pronto: true });
      d.registrar(fim, ctx, area, 'anexou um documento em PDF a', { colecao: col, alvo: d.nomeDe(dono) });
      await fim.commit();
    } catch (e) {
      // o que subiu sai junto com o registro do arquivo; se nem isso der certo, o próximo envio limpa
      await apagarAnexo(col, ref.id, total).catch(() => undefined);
      throw e;
    }
    return publico({ ...meta, id: ref.id });
  }

  /** Junta as partes e devolve o PDF. */
  async function baixar(col: string, anexoId: string): Promise<Blob> {
    d.requireAccess(await d.requireUsuario(), areaDoAnexo(col), 'ver');
    const meta = (await getDoc(doc(itens(col), anexoId))).data();
    if (!meta || meta.pronto !== true) return d.fail(404, 'Documento não encontrado.');
    const total = Number(meta.partes) || 0;
    const pedacos: Uint8Array[] = [];
    for (let n = 0; n < total; n++) {
      const dados = (await getDoc(parte(col, anexoId, n))).data()?.dados as Bytes | undefined;
      if (!dados) return d.fail(500, 'O documento está incompleto. Remova e anexe de novo.');
      pedacos.push(dados.toUint8Array());
    }
    // quem grava direto no banco consegue pular a checagem do envio: o arquivo só é entregue se for mesmo um PDF
    if (!pedacos.length || !ehPdf(pedacos[0])) return d.fail(415, 'Este arquivo não é um PDF válido e não pode ser aberto.');
    return new Blob(pedacos as BlobPart[], { type: 'application/pdf' });
  }

  /** Apaga os documentos de um registro que está sendo excluído (inclusive envios que pararam no meio). */
  async function apagarDoRegistro(col: string, registroId: string) {
    if (!COLECOES_COM_ANEXO.includes(col)) return;
    for (const s of (await getDocs(doRegistro(col, registroId))).docs) await apagarAnexo(col, s.id, Number(s.data().partes) || 0);
  }
  /** Apaga os documentos de todos os cadastros (para zerar o sistema). */
  async function apagarTudo() {
    for (const col of COLECOES_COM_ANEXO) {
      for (const s of (await getDocs(itens(col))).docs) await apagarAnexo(col, s.id, Number(s.data().partes) || 0);
    }
  }

  return { enviar, baixar, apagarDoRegistro, apagarTudo };
}
