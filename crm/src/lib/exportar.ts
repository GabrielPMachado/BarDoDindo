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

type TipoColuna = 'texto' | 'dinheiro' | 'numero' | 'percentual' | 'data' | 'status' | 'imagem';
interface Coluna {
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
    // percentuais calculados vêm como fração (0,743 = 74,3%); nas exportações, como nos campos, vão de 0 a 100
    const valor = c.format === 'percent' ? (r: Row) => { const v = c.get(r); return v === null || v === undefined || v === '' ? v : Number(v) * 100; } : c.get;
    cols.push({ titulo: c.label, tipo, valor });
  }
  return cols;
}

/* ---------- utilitários ---------- */
const vazio = (v: unknown) => v === undefined || v === null || v === '';
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

/* ---------- CSV ---------- */
/** Valor de uma célula no CSV: números com vírgula decimal (como o Excel em português espera), datas dd/mm/aaaa. */
function celulaCsv(c: Coluna, r: Row): string {
  const v = c.valor(r);
  if (vazio(v)) return '';
  const decimal = (n: number, casas: number) => n.toFixed(casas).replace('.', ',');
  let t: string;
  switch (c.tipo) {
    case 'dinheiro': t = decimal(Number(v), 2); break;
    case 'numero': t = Number.isInteger(Number(v)) ? String(Number(v)) : decimal(Number(v), 2); break;
    case 'percentual': t = Number.isInteger(Number(v)) ? String(Number(v)) : decimal(Number(v), 1); break;
    case 'data': t = dateBR(v); break;
    default: t = String(v);
  }
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
/** CSV com ";" (padrão do Excel em português), as mesmas colunas do Excel, sem as fotos. */
export function exportarCsv(colunas: Coluna[], rows: Row[], arquivo: string) {
  const cols = colunas.filter((c) => c.tipo !== 'imagem');
  const linhas = [cols.map((c) => c.titulo).join(';'), ...rows.map((r) => cols.map((c) => celulaCsv(c, r)).join(';'))];
  baixar(new Blob(['\uFEFF' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${arquivo}.csv`);
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
const CINZA_BORDA = 'FFE6E0DB';
/**
 * Posição exata de uma imagem: célula + deslocamento em pixels (convertido para EMU, a unidade do Excel).
 * O ExcelJS converte posições fracionárias com uma conta errada, então passamos os valores nativos.
 */
const ancora = (col: number, px: number, row: number, py: number) =>
  ({ nativeCol: col, nativeColOff: Math.round(px * 9525), nativeRow: row, nativeRowOff: Math.round(py * 9525) }) as unknown as { col: number; row: number };
const ESCURO = 'FF1A1614';
/** Largura (em caracteres) de cada coluna: pelo tipo e pelo conteúdo, com limites. */
function larguraDe(c: Coluna, rows: Row[]) {
  const titulo = c.titulo.length + 4; // espaço para a setinha do filtro
  switch (c.tipo) {
    case 'imagem': return 12;
    case 'dinheiro': return Math.max(15, titulo);
    case 'data': return Math.max(12, titulo);
    case 'numero': case 'percentual': return Math.max(10, titulo);
    case 'status': return Math.max(14, titulo, ...rows.slice(0, 300).map((r) => texto(c, r).length + 4));
    default: {
      const maior = Math.max(0, ...rows.slice(0, 300).map((r) => texto(c, r).length));
      return Math.min(45, Math.max(14, titulo, Math.ceil(maior * 1.05) + 2));
    }
  }
}

export async function exportarExcel(titulo: string, colunas: Coluna[], rows: Row[], arquivo: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bar do Dindo · Cérebro';
  wb.title = titulo;
  wb.created = new Date();
  const temFoto = colunas.some((c) => c.tipo === 'imagem');
  const ultima = colunas.length;
  const ws = wb.addWorksheet(titulo.slice(0, 31), {
    // sem as linhas de grade (a tabela tem bordas próprias); cabeçalho e primeira(s) coluna(s) fixos ao rolar
    views: [{ state: 'frozen', ySplit: 4, xSplit: temFoto ? 2 : 1, showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: colunas.length > 5 ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, printTitlesRow: '4:4',
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: '&L&8Bar do Dindo · Cérebro — ' + titulo + '&R&8Página &P de &N' },
  });

  colunas.forEach((c, i) => { ws.getColumn(i + 1).width = larguraDe(c, rows); });
  if (!temFoto && (ws.getColumn(1).width ?? 0) < 11) ws.getColumn(1).width = 11; // cabe a logo

  /* faixa do título: fundo escuro, logo, título e dados da exportação */
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 5;
  for (let col = 1; col <= ultima; col++) {
    for (const r of [1, 2]) ws.getCell(r, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ESCURO } };
    ws.getCell(3, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LARANJA } };
  }
  if (ultima > 1) {
    ws.mergeCells(1, 2, 1, ultima);
    ws.mergeCells(2, 2, 2, ultima);
  }
  const t = ws.getCell(1, Math.min(2, ultima));
  t.value = titulo;
  t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  t.alignment = { vertical: 'bottom', indent: 1 };
  const sub = ws.getCell(2, Math.min(2, ultima));
  sub.value = `Bar do Dindo · Cérebro   |   Exportado em ${agora()}   |   ${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`;
  sub.font = { name: 'Calibri', size: 10, color: { argb: 'FFE07A4C' } };
  sub.alignment = { vertical: 'top', indent: 1 };
  try {
    const logo = wb.addImage({ base64: await logoEmPng(), extension: 'png' });
    ws.addImage(logo, { tl: ancora(0, 9, 0, 4), ext: { width: 62, height: 62 } });
  } catch { /* sem logo, segue */ }

  /* cabeçalho da tabela */
  const cab = ws.getRow(4);
  cab.height = 30;
  colunas.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + LARANJA } };
    cel.alignment = {
      vertical: 'middle', wrapText: true, indent: ['imagem', 'status', 'data'].includes(c.tipo) ? 0 : 1,
      horizontal: ['dinheiro', 'numero', 'percentual'].includes(c.tipo) ? 'right' : ['imagem', 'status', 'data'].includes(c.tipo) ? 'center' : 'left',
    };
    cel.border = { left: { style: 'thin', color: { argb: 'FFD9774E' } }, right: { style: 'thin', color: { argb: 'FFD9774E' } }, bottom: { style: 'medium', color: { argb: 'FF8E3B1A' } } };
  });

  /* linhas */
  const borda = { style: 'thin' as const, color: { argb: CINZA_BORDA } };
  const alturaLinha = temFoto ? 64 : 21;
  for (let k = 0; k < rows.length; k++) {
    const r = rows[k];
    const linha = ws.getRow(5 + k);
    linha.height = alturaLinha;
    colunas.forEach((c, i) => {
      const cel = linha.getCell(i + 1);
      const v = c.valor(r);
      const fundo = k % 2 === 1 ? 'FFFBF7F4' : 'FFFFFFFF';
      cel.font = { name: 'Calibri', size: 10.5, color: { argb: 'FF26221F' } };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } };
      cel.border = { top: borda, bottom: borda, left: borda, right: borda };
      let horizontal: 'left' | 'right' | 'center' = 'left';
      if (c.tipo === 'imagem') { cel.value = null; horizontal = 'center'; }
      else if (vazio(v)) {
        // vazio fica com um traço discreto, mais fácil de ler que a célula em branco
        cel.value = '—';
        cel.font = { name: 'Calibri', size: 10.5, color: { argb: 'FFB5ACA5' } };
        horizontal = 'center';
      } else if (c.tipo === 'dinheiro') { cel.value = Number(v); cel.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00'; horizontal = 'right'; }
      else if (c.tipo === 'numero') { cel.value = Number(v); cel.numFmt = Number.isInteger(Number(v)) ? '#,##0' : '#,##0.00'; horizontal = 'right'; }
      else if (c.tipo === 'percentual') { cel.value = Number(v) / 100; cel.numFmt = '0.0%'; horizontal = 'right'; }
      else if (c.tipo === 'data') {
        const iso = String(v).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { cel.value = new Date(`${iso}T12:00:00`); cel.numFmt = 'dd/mm/yyyy'; } else cel.value = String(v);
        horizontal = 'center';
      } else if (c.tipo === 'status') {
        const cor = COR_TOM[toneOf(v)];
        cel.value = String(v);
        cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + cor.fundo } };
        cel.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF' + cor.texto } };
        horizontal = 'center';
      } else cel.value = String(v);
      // recuo dos dois lados: o texto não encosta na coluna vizinha
      cel.alignment = { vertical: 'middle', horizontal, wrapText: c.tipo === 'texto', indent: horizontal === 'center' ? 0 : 1 };
    });
    // fotos centralizadas dentro da célula, mantendo a proporção
    for (let i = 0; i < colunas.length; i++) {
      const v = colunas[i].valor(r);
      if (colunas[i].tipo !== 'imagem' || !ehFoto(v)) continue;
      const { w, h } = await medidas(v);
      const larguraPx = (ws.getColumn(i + 1).width ?? 12) * 7 + 5;
      const alturaPx = (alturaLinha * 96) / 72;
      const esc = Math.min((larguraPx - 10) / w, (alturaPx - 10) / h);
      const iw = w * esc, ih = h * esc;
      const img = wb.addImage({ base64: v, extension: v.startsWith('data:image/png') ? 'png' : 'jpeg' });
      ws.addImage(img, { tl: ancora(i, (larguraPx - iw) / 2, 4 + k, (alturaPx - ih) / 2), ext: { width: iw, height: ih } });
    }
  }

  /* linha de total */
  if (rows.length) {
    const fim = 5 + rows.length;
    const tot = ws.getRow(fim);
    tot.height = 24;
    const primeira = colunas.findIndex((c) => c.tipo !== 'imagem');
    colunas.forEach((c, i) => {
      const cel = tot.getCell(i + 1);
      if (c.tipo === 'dinheiro') {
        const letra = ws.getColumn(i + 1).letter;
        cel.value = { formula: `SUM(${letra}5:${letra}${fim - 1})` };
        cel.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        cel.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
      } else if (i === primeira) {
        cel.value = `Total · ${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`;
        cel.alignment = { vertical: 'middle', indent: 1 };
      }
      cel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1A1614' } };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6E7DE' } };
      cel.border = { top: { style: 'medium', color: { argb: 'FF' + LARANJA } }, bottom: { style: 'thin', color: { argb: CINZA_BORDA } } };
    });
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: ultima } };

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
