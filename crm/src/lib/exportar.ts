/**
 * Exportação das listas do CRM em Excel (.xlsx) e PDF, já formatadas: cabeçalho com a logo, título,
 * data, colunas no formato certo (dinheiro, datas, status coloridos), totais e as fotos dos registros.
 * As bibliotecas (ExcelJS e jsPDF) só são baixadas quando alguém exporta.
 */
import { STATUS_KEYS, toneOf, type CollectionDef, type Tone } from '../collections';
import type { Row } from './data';
import { brl, dateBR, num } from './format';
import { maskCnpj, maskPhone } from './masks';
import logoUrl from '../../../shared/assets/logo.webp';

export type TipoColuna = 'texto' | 'dinheiro' | 'numero' | 'percentual' | 'data' | 'status' | 'imagem';
export interface Coluna {
  titulo: string;
  tipo: TipoColuna;
  valor: (r: Row) => unknown;
}

/** Colunas de um cadastro: foto (se houver), todos os campos e os valores calculados. */
export function colunasDe(def: CollectionDef): Coluna[] {
  const cols: Coluna[] = [];
  if (def.comFoto) cols.push({ titulo: 'Foto', tipo: 'imagem', valor: (r) => r.foto });
  for (const f of def.fields) {
    const tipo: TipoColuna =
      f.type === 'money' ? 'dinheiro' : f.type === 'number' ? 'numero' : f.type === 'percent' ? 'percentual'
        : f.type === 'date' ? 'data' : f.type === 'select' && STATUS_KEYS.includes(f.key) ? 'status' : 'texto';
    const valor = f.type === 'phone' ? (r: Row) => (r[f.key] ? maskPhone(r[f.key]) : '')
      : f.type === 'cnpj' ? (r: Row) => (r[f.key] ? maskCnpj(r[f.key]) : '')
        : f.type === 'time' ? (r: Row) => String(r[f.key] ?? '').slice(0, 5)
          : (r: Row) => r[f.key];
    cols.push({ titulo: f.label, tipo, valor });
  }
  for (const c of def.computed ?? []) {
    const tipo: TipoColuna = c.format === 'money' ? 'dinheiro' : c.format === 'number' ? 'numero' : c.format === 'percent' ? 'percentual' : c.format === 'badge' ? 'status' : 'texto';
    cols.push({ titulo: c.label, tipo, valor: c.get });
  }
  return cols;
}

/* ---------- utilitários ---------- */
const vazio = (v: unknown) => v === undefined || v === null || v === '';
const numero = (v: unknown) => (vazio(v) ? null : Number(v));
/** Texto de uma célula, para o PDF. */
function texto(c: Coluna, r: Row): string {
  const v = c.valor(r);
  if (vazio(v)) return '';
  switch (c.tipo) {
    case 'dinheiro': return brl(Number(v));
    case 'numero': return num(Number(v), Number.isInteger(Number(v)) ? 0 : 2);
    case 'percentual': return `${num(Number(v), Number.isInteger(Number(v)) ? 0 : 1)}%`;
    case 'data': return dateBR(v);
    case 'imagem': return '';
    default: return String(v);
  }
}
const COR_TOM: Record<Tone, { fundo: string; texto: string }> = {
  good: { fundo: 'E3F4EA', texto: '1E7A44' },
  warn: { fundo: 'FDF3D7', texto: '8A6200' },
  bad: { fundo: 'FBE3E4', texto: 'A8232B' },
  info: { fundo: 'E3EEFA', texto: '2659A6' },
  neutral: { fundo: 'EEEEEE', texto: '555555' },
};
const LARANJA = 'C4572A';
const agora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function baixar(blob: Blob, nome: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Tamanho original de uma imagem (para manter a proporção ao encaixar na célula). */
function medidas(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = src;
  });
}

/** A logo é WebP; Excel e PDF precisam de PNG. */
let logoPng: Promise<string> | null = null;
function logoEmPng() {
  logoPng ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 200;
      c.getContext('2d')!.drawImage(img, 0, 0, 200, 200);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = logoUrl;
  });
  return logoPng;
}

const ehFoto = (v: unknown): v is string => typeof v === 'string' && /^data:image\/(jpeg|png);base64,/.test(v);

/* ---------- Excel ---------- */
export async function exportarExcel(titulo: string, colunas: Coluna[], rows: Row[], arquivo: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bar do Dindo · Cérebro';
  wb.created = new Date();
  const ws = wb.addWorksheet(titulo.slice(0, 31), { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { orientation: colunas.length > 6 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const ultima = colunas.length;
  const temFoto = colunas.some((c) => c.tipo === 'imagem');

  // larguras por tipo de coluna
  colunas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.tipo === 'imagem' ? 13 : c.tipo === 'dinheiro' ? 15 : c.tipo === 'data' ? 12 : c.tipo === 'numero' || c.tipo === 'percentual' ? 11 : c.tipo === 'status' ? 16
      : Math.min(42, Math.max(12, c.titulo.length + 2, ...rows.slice(0, 200).map((r) => texto(c, r).length * 0.9)));
  });

  // título com a logo
  ws.mergeCells(1, 2, 1, Math.max(2, ultima));
  ws.mergeCells(2, 2, 2, Math.max(2, ultima));
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 18;
  const t = ws.getCell(1, 2);
  t.value = titulo;
  t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF1A1A1A' } };
  t.alignment = { vertical: 'middle' };
  const sub = ws.getCell(2, 2);
  sub.value = `Bar do Dindo · Cérebro — exportado em ${agora()} · ${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`;
  sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF777777' } };
  try {
    const logo = wb.addImage({ base64: await logoEmPng(), extension: 'png' });
    ws.addImage(logo, { tl: { col: 0.15, row: 0.1 }, ext: { width: 46, height: 46 } });
  } catch { /* sem logo, segue */ }

  // cabeçalho
  const cab = ws.getRow(4);
  colunas.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LARANJA } };
    cel.alignment = { vertical: 'middle', horizontal: ['dinheiro', 'numero', 'percentual'].includes(c.tipo) ? 'right' : c.tipo === 'imagem' ? 'center' : 'left', wrapText: true };
    cel.border = { bottom: { style: 'thin', color: { argb: 'FF8E3B1A' } } };
  });
  cab.height = 22;

  // linhas
  const borda = { style: 'thin' as const, color: { argb: 'FFE2E2E2' } };
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    const linha = ws.getRow(5 + k);
    colunas.forEach((c, i) => {
      const cel = linha.getCell(i + 1);
      const v = c.valor(r);
      if (c.tipo === 'dinheiro') { cel.value = numero(v); cel.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00'; }
      else if (c.tipo === 'numero') { cel.value = numero(v); cel.numFmt = Number.isInteger(Number(v)) ? '#,##0' : '#,##0.00'; }
      else if (c.tipo === 'percentual') { cel.value = vazio(v) ? null : Number(v) / 100; cel.numFmt = '0.0%'; }
      else if (c.tipo === 'data') {
        const iso = String(v ?? '').slice(0, 10);
        cel.value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : null;
        cel.numFmt = 'dd/mm/yyyy';
      } else if (c.tipo === 'imagem') cel.value = null;
      else cel.value = vazio(v) ? null : String(v);
      cel.alignment = { vertical: 'middle', horizontal: c.tipo === 'imagem' ? 'center' : undefined, wrapText: c.tipo === 'texto' };
      cel.border = { bottom: borda };
      if (k % 2 === 1) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6F3' } };
      if (c.tipo === 'status' && !vazio(v)) {
        const cor = COR_TOM[toneOf(v)];
        cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + cor.fundo } };
        cel.font = { bold: true, color: { argb: 'FF' + cor.texto } };
      }
    });
    if (temFoto) linha.height = 60;
    // fotos dentro da célula, mantendo a proporção
    for (let i = 0; i < colunas.length; i++) {
      const v = colunas[i].valor(r);
      if (colunas[i].tipo !== 'imagem' || !ehFoto(v)) continue;
      const { w, h } = await medidas(v);
      const lado = 72, esc = Math.min(lado / w, lado / h);
      const img = wb.addImage({ base64: v, extension: v.startsWith('data:image/png') ? 'png' : 'jpeg' });
      ws.addImage(img, { tl: { col: i + 0.08, row: 4 + k + 0.06 }, ext: { width: w * esc, height: h * esc } });
    }
  }

  // totais das colunas de dinheiro
  const somas = colunas.map((c) => c.tipo === 'dinheiro');
  if (rows.length && somas.some(Boolean)) {
    const tot = ws.getRow(5 + rows.length);
    const primeiraTexto = colunas.findIndex((c) => c.tipo !== 'imagem');
    tot.getCell(primeiraTexto + 1).value = 'Total';
    colunas.forEach((c, i) => {
      const cel = tot.getCell(i + 1);
      if (somas[i]) {
        const letra = ws.getColumn(i + 1).letter;
        cel.value = { formula: `SUM(${letra}5:${letra}${4 + rows.length})` };
        cel.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
      }
      cel.font = { bold: true };
      cel.border = { top: { style: 'medium', color: { argb: 'FF' + LARANJA } } };
    });
    tot.height = 20;
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: ultima } };

  const buf = await wb.xlsx.writeBuffer();
  baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${arquivo}.xlsx`);
}

/* ---------- PDF ---------- */
export async function exportarPdf(titulo: string, colunas: Coluna[], rows: Row[], arquivo: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const paisagem = colunas.length > 6;
  const doc = new jsPDF({ orientation: paisagem ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const logo = await logoEmPng().catch(() => null);
  const temFoto = colunas.some((c) => c.tipo === 'imagem');
  const fotos = await Promise.all(rows.map(async (r) => {
    const col = colunas.find((c) => c.tipo === 'imagem');
    const v = col?.valor(r);
    return ehFoto(v) ? { src: v, ...(await medidas(v)) } : null;
  }));

  const cabecalho = () => {
    if (logo) doc.addImage(logo, 'PNG', 12, 9, 16, 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(26, 26, 26);
    doc.text(titulo, 32, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
    doc.text(`Bar do Dindo · Cérebro — exportado em ${agora()} · ${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`, 32, 22);
    doc.setDrawColor(196, 87, 42); doc.setLineWidth(0.6); doc.line(12, 28, W - 12, 28);
  };

  const direita = (c: Coluna) => ['dinheiro', 'numero', 'percentual'].includes(c.tipo);
  const totais = colunas.map((c) => (c.tipo === 'dinheiro' ? brl(rows.reduce((t, r) => t + (Number(c.valor(r)) || 0), 0)) : ''));
  const temTotal = rows.length > 0 && colunas.some((c) => c.tipo === 'dinheiro');
  if (temTotal) totais[colunas.findIndex((c) => c.tipo !== 'imagem')] ||= 'Total';

  autoTable(doc, {
    startY: 32,
    margin: { top: 32, left: 12, right: 12, bottom: 16 },
    head: [colunas.map((c) => c.titulo)],
    body: rows.map((r) => colunas.map((c) => texto(c, r))),
    foot: temTotal ? [totais] : undefined,
    showFoot: 'lastPage',
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, valign: 'middle', lineColor: [230, 230, 230], lineWidth: 0.2, textColor: [40, 40, 40], overflow: 'linebreak' },
    headStyles: { fillColor: [196, 87, 42], textColor: 255, fontStyle: 'bold', lineColor: [142, 59, 26] },
    footStyles: { fillColor: [250, 240, 234], textColor: [26, 26, 26], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 246, 243] },
    bodyStyles: temFoto ? { minCellHeight: 18 } : {},
    columnStyles: Object.fromEntries(colunas.map((c, i) => [i, {
      halign: direita(c) ? 'right' : c.tipo === 'imagem' ? 'center' : 'left',
      ...(c.tipo === 'imagem' ? { cellWidth: 20 } : {}),
    }])),
    didParseCell: (d) => {
      const c = colunas[d.column.index];
      if (d.section === 'head' && c && direita(c)) d.cell.styles.halign = 'right';
      if (d.section === 'foot' && c && direita(c)) d.cell.styles.halign = 'right';
      if (d.section === 'body' && c?.tipo === 'status' && d.cell.raw) {
        const cor = COR_TOM[toneOf(d.cell.raw)];
        d.cell.styles.textColor = [parseInt(cor.texto.slice(0, 2), 16), parseInt(cor.texto.slice(2, 4), 16), parseInt(cor.texto.slice(4), 16)];
        d.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell: (d) => {
      const c = colunas[d.column.index];
      if (d.section !== 'body' || c?.tipo !== 'imagem') return;
      const f = fotos[d.row.index];
      if (!f) return;
      const lado = Math.min(d.cell.width, d.cell.height) - 2.4;
      const esc = Math.min(lado / f.w, lado / f.h);
      const w = f.w * esc, h = f.h * esc;
      doc.addImage(f.src, f.src.startsWith('data:image/png') ? 'PNG' : 'JPEG', d.cell.x + (d.cell.width - w) / 2, d.cell.y + (d.cell.height - h) / 2, w, h);
    },
    didDrawPage: () => cabecalho(),
  });

  // rodapé com a numeração das páginas
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text('Bar do Dindo · Cérebro', 12, H - 8);
    doc.text(`Página ${p} de ${total}`, W - 12, H - 8, { align: 'right' });
  }
  doc.save(`${arquivo}.pdf`);
}
