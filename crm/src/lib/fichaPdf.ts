/** PDF da ficha técnica de um produto, para imprimir e deixar no bar ou na cozinha. */
import { brl, num, pct } from './format';
import { calcularFicha, custoBaseTxt, custoDoItem, type Ficha } from './ficha';
import { logoEmPng } from './exportar';

const qtd = (v: number) => (Number.isInteger(v) ? num(v) : num(v, 3).replace(/0+$/, '').replace(/,$/, ''));

export async function imprimirFicha(nome: string, ficha: Ficha, preco: number) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const c = calcularFicha(ficha, preco);
  const logo = await logoEmPng().catch(() => null);

  if (logo) doc.addImage(logo, 'PNG', 12, 9, 16, 16);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(26, 26, 26);
  doc.text(`Ficha técnica · ${nome}`, 32, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
  doc.text(`Bar do Dindo · Cérebro — ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · rende ${qtd(ficha.rendimento)} ${ficha.rendimento === 1 ? 'porção' : 'porções'}`, 32, 22);
  doc.setDrawColor(196, 87, 42); doc.setLineWidth(0.6); doc.line(12, 28, W - 12, 28);

  autoTable(doc, {
    startY: 32,
    margin: { left: 12, right: 12 },
    head: [['Insumo', 'Quantidade', 'Preço usado', 'Custo']],
    body: ficha.itens.map((i) => [
      `${i.insumo || '—'}${i.alternativas?.length ? ` (ou ${i.alternativas.map((a) => a.insumo).join(', ou ')})` : ''}`, `${qtd(Number(i.quantidade) || 0)} ${i.unidade}`,
      i.custoBase ? `${i.precoId && i.fornecedor ? `${i.fornecedor} · ` : ''}${custoBaseTxt(i)}` : '—', brl(custoDoItem(i)),
    ]).concat(ficha.fixos.map((x) => [
      x.nome, ficha.rendimento === 1 ? '1 por porção' : `${qtd(ficha.rendimento)} (1 por porção)`, `valor fixo · ${brl(x.custo)}`, brl(x.custo * ficha.rendimento),
    ])).concat(ficha.copoCusto > 0 ? [[
      `${ficha.copo} (descartável)`, ficha.rendimento === 1 ? '1 por porção' : `${qtd(ficha.rendimento)} (1 por porção)`, `Estoque · ${brl(ficha.copoCusto)}`, brl(ficha.copoCusto * ficha.rendimento),
    ]] : []),
    foot: [
      ['Custo da receita', '', ficha.perdas ? `+ ${num(ficha.perdas, 1)}% de perdas nos insumos` : '', brl(c.total)],
      ['Custo por porção', '', '', brl(c.porcao)],
    ],
    showFoot: 'lastPage',
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, lineColor: [230, 230, 230], lineWidth: 0.2, textColor: [40, 40, 40] },
    headStyles: { fillColor: [196, 87, 42], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [250, 240, 234], textColor: [26, 26, 26], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    didParseCell: (d) => { if (d.section !== 'body' && d.column.index > 0) d.cell.styles.halign = 'right'; },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  const linha = (rotulo: string, valor: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 90, 90);
    doc.text(rotulo, 12, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26);
    doc.text(valor, 80, y);
    y += 6;
  };
  linha('Preço de venda', preco ? brl(preco) : '—');
  linha('CMV', c.cmv === null ? '—' : pct(c.cmv));
  linha('Margem por porção', c.margem === null ? '—' : brl(c.margem));
  linha(`Preço sugerido (CMV ${num(ficha.cmvAlvo, 1)}%)`, c.sugerido ? brl(c.sugerido) : '—');

  const titulo = (t: string) => {
    if (y > 270) { doc.addPage(); y = 16; }
    y += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(196, 87, 42);
    doc.text(t, 12, y);
    y += 6;
  };
  /** Texto com quebra de linha; `recuo` alinha as linhas seguintes depois do número do passo. */
  const paragrafo = (texto: string, prefixo = '', recuo = 0) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    (doc.splitTextToSize(texto.trim(), W - 24 - recuo) as string[]).forEach((l, i) => {
      if (y > 285) { doc.addPage(); y = 16; }
      if (i === 0 && prefixo) {
        // número do passo em negrito; rótulo (ex.: "Utensílios") no mesmo estilo das linhas "Técnica" e "Copo"
        if (recuo > 20) { doc.setTextColor(90, 90, 90); doc.text(prefixo, 12, y); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 26); }
        else { doc.setFont('helvetica', 'bold'); doc.text(prefixo, 12, y); doc.setFont('helvetica', 'normal'); }
      }
      doc.text(l, 12 + recuo, y);
      y += 5;
    });
  };
  const temPreparo = ficha.tecnica || ficha.copo || ficha.utensilios.length || ficha.passos.some((p) => p.trim()) || ficha.preparo.trim();
  if (temPreparo) {
    titulo('Preparo');
    if (ficha.tecnica) linha('Técnica', ficha.tecnica);
    if (ficha.copo) linha('Copo', ficha.copo);
    if (ficha.utensilios.length) paragrafo(ficha.utensilios.map((u) => u.nome).join(', '), 'Utensílios', 68);
    const passos = ficha.passos.filter((p) => p.trim());
    if (passos.length) {
      y += 2;
      passos.forEach((p, i) => paragrafo(p, `${i + 1}.`, 7));
    }
    if (ficha.preparo.trim()) paragrafo(ficha.preparo);
  }
  if (ficha.montagem.trim()) {
    titulo('Finalização e decoração');
    paragrafo(ficha.montagem);
  }

  doc.save(`ficha-tecnica-${nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`);
}
