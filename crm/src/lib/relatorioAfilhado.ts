/**
 * Relatório individual de um afilhado em PDF: cadastro, programa de pontos, respostas do questionário,
 * consumos e vouchers. Mesmo cabeçalho e cores das exportações das listas (lib/exportar.ts).
 */
import type { Pergunta } from '../../../shared/backend';
import { logoEmPng } from './exportar';
import { brl, dateBR, num } from './format';
import { maskPhone } from './masks';
import { DATA_OCULTA, ocultarCpf, ocultarEmail, ocultarTelefone } from '../components/DadosOcultos';

export interface AfilhadoRelatorio {
  numero: number; nome: string; email: string; telefone: string; desde: string; origem?: string; via?: string;
  cpf?: string; nascimento?: string; pontos: number; acumulados: number; totalGasto: number; visitas: number;
  ultimaVisita: string | null; nivel: string; respostas?: Record<string, string> | null;
}
export interface HistoricoAfilhado {
  consumos: { id: string; data: string; valor: number; pontos: number; formaPagamento: string; itens: { nome: string; quantidade: number }[] }[];
  resgates: { id: string; data: string; recompensa: string; custo: number; status: string; codigo: string }[];
}

const numero = (n: number) => `#${n < 0 ? '-' : ''}${String(Math.abs(n)).padStart(3, '0')}`;
const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? dateBR(iso) : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

/** `ocultar`: e-mail, celular, CPF e nascimento saem ocultos, como na tela (quem não revelou ou não pode ver). */
export async function relatorioAfilhado(c: AfilhadoRelatorio, h: HistoricoAfilhado, perguntas: Pergunta[], ocultar = true) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const logo = await logoEmPng().catch(() => null);
  const titulo = `${c.nome} · ${numero(c.numero)}`;
  // cada tabela chama o cabeçalho ao desenhar uma página: só a primeira vez de cada página desenha
  const comCabecalho = new Set<number>();
  const cabecalho = () => {
    const pagina = doc.getCurrentPageInfo().pageNumber;
    if (comCabecalho.has(pagina)) return;
    comCabecalho.add(pagina);
    if (logo) doc.addImage(logo, 'PNG', 12, 9, 16, 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(26, 26, 26);
    doc.text(titulo, 32, 16, { maxWidth: W - 44 });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
    doc.text(`Relatório do afilhado · Bar do Dindo · Cérebro — gerado em ${new Date().toLocaleString('pt-BR')}`, 32, 22);
    doc.setDrawColor(196, 87, 42); doc.setLineWidth(0.6); doc.line(12, 28, W - 12, 28);
  };
  const base = {
    margin: { top: 32, left: 12, right: 12, bottom: 16 },
    theme: 'grid' as const,
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, valign: 'middle' as const, lineColor: [230, 230, 230] as [number, number, number], lineWidth: 0.2, textColor: [40, 40, 40] as [number, number, number], overflow: 'linebreak' as const },
    headStyles: { fillColor: [196, 87, 42] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
    alternateRowStyles: { fillColor: [250, 246, 243] as [number, number, number] },
    didDrawPage: () => cabecalho(),
  };
  let y = 32;
  const secao = (nome: string) => {
    if (y > H - 40) { doc.addPage(); cabecalho(); y = 32; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(196, 87, 42);
    doc.text(nome, 12, y + 5);
    y += 8;
  };
  const fim = () => { y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 8; };
  // pares (rótulo, valor) em duas colunas de pares
  const pares = (linhas: [string, string][]) => {
    const body: string[][] = [];
    for (let i = 0; i < linhas.length; i += 2) body.push([...linhas[i], ...(linhas[i + 1] ?? ['', ''])]);
    autoTable(doc, {
      ...base, startY: y, body, theme: 'plain',
      styles: { ...base.styles, cellPadding: 1.6 },
      columnStyles: { 0: { textColor: [120, 120, 120], cellWidth: 34 }, 1: { fontStyle: 'bold' }, 2: { textColor: [120, 120, 120], cellWidth: 34 }, 3: { fontStyle: 'bold' } },
    });
    fim();
  };

  cabecalho();
  secao('Cadastro');
  pares([
    ['Nome', c.nome], ['Número', numero(c.numero)],
    ['E-mail', !c.email ? '—' : ocultar ? ocultarEmail(c.email) : c.email], ['Celular', !c.telefone ? '—' : ocultar ? ocultarTelefone(c.telefone) : maskPhone(c.telefone)],
    ['CPF', !c.cpf ? '—' : ocultar ? ocultarCpf(c.cpf) : c.cpf], ['Nascimento', ocultar ? (c.cpf || c.nascimento ? DATA_OCULTA : '—') : c.nascimento ? dateBR(c.nascimento) : '—'],
    ['Afilhado desde', dateBR(c.desde)], ['Origem', [c.origem, c.via].filter(Boolean).join(' · ') || '—'],
  ]);

  secao('Programa de afilhados');
  pares([
    ['Pontos disponíveis', num(c.pontos)], ['Pontos acumulados', num(c.acumulados)],
    ['Nível', c.nivel || '—'], ['Visitas', num(c.visitas)],
    ['Consumo total', brl(c.totalGasto)], ['Última visita', c.ultimaVisita ? dateBR(c.ultimaVisita) : '—'],
  ]);

  secao('Questionário');
  const r = c.respostas ?? {};
  const respondidas = Object.entries(r).filter(([k, v]) => k !== 'respondidoEm' && v);
  if (!respondidas.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text('Ainda não respondeu o questionário.', 12, y + 3); y += 10;
  } else {
    // na ordem das perguntas atuais; as que saíram do questionário vêm no fim
    const ordem = (k: string) => { const i = perguntas.findIndex((p) => p.id === k); return i < 0 ? 999 : i; };
    autoTable(doc, {
      ...base, startY: y,
      head: [['Pergunta', 'Resposta']],
      body: respondidas.sort(([a], [b]) => ordem(a) - ordem(b)).map(([k, v]) => [perguntas.find((p) => p.id === k)?.texto ?? 'Pergunta removida', String(v)]),
      columnStyles: { 0: { cellWidth: 80, textColor: [90, 90, 90] } },
    });
    fim();
    if (r.respondidoEm) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
      doc.text(`Respondido em ${dateBR(r.respondidoEm)}.`, 12, y - 3); y += 3;
    }
  }

  secao(`Consumos (${num(h.consumos.length)})`);
  autoTable(doc, {
    ...base, startY: y,
    head: [['Data', 'Itens', 'Pagamento', 'Pontos', 'Valor']],
    body: h.consumos.length
      ? h.consumos.map((x) => [dataHora(x.data), x.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(', ') || '—', x.formaPagamento || '—', num(x.pontos), brl(x.valor)])
      : [[{ content: 'Nenhum consumo registrado.', colSpan: 5, styles: { textColor: [120, 120, 120], halign: 'center' } }]],
    foot: h.consumos.length ? [['Total', '', '', num(h.consumos.reduce((t, x) => t + x.pontos, 0)), brl(h.consumos.reduce((t, x) => t + x.valor, 0))]] : undefined,
    footStyles: { fillColor: [250, 240, 234], textColor: [26, 26, 26], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 28 }, 3: { halign: 'right', cellWidth: 16 }, 4: { halign: 'right', cellWidth: 24 } },
    didParseCell: (d) => { if (d.section !== 'body' && d.column.index >= 3) d.cell.styles.halign = 'right'; },
  });
  fim();

  secao(`Vouchers (${num(h.resgates.length)})`);
  autoTable(doc, {
    ...base, startY: y,
    head: [['Data', 'Recompensa', 'Código', 'Status', 'Pontos']],
    body: h.resgates.length
      ? h.resgates.map((x) => [dataHora(x.data), x.recompensa, x.codigo, x.status, num(x.custo)])
      : [[{ content: 'Nenhum voucher resgatado.', colSpan: 5, styles: { textColor: [120, 120, 120], halign: 'center' } }]],
    columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 30 }, 3: { cellWidth: 24 }, 4: { halign: 'right', cellWidth: 18 } },
    didParseCell: (d) => { if (d.section === 'head' && d.column.index === 4) d.cell.styles.halign = 'right'; },
  });

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text('Bar do Dindo · Cérebro · uso interno (contém dados pessoais)', 12, H - 8);
    doc.text(`Página ${p} de ${total}`, W - 12, H - 8, { align: 'right' });
  }
  doc.save(`afilhado-${numero(c.numero).slice(1)}-relatorio.pdf`);
}
