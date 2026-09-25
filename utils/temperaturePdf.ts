import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TemperatureRecord, TemperatureConfig } from '../types';

const MONTH_NAMES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
];

interface GeneratePdfOptions {
  monthStr: string; // "YYYY-MM"
  records: TemperatureRecord[];
  config: TemperatureConfig;
}

export function buildMonthPage(
  doc: jsPDF,
  options: GeneratePdfOptions,
  isFirstPage: boolean = true
) {
  if (!isFirstPage) {
    doc.addPage();
  }

  const { monthStr, records, config } = options;
  const [yearStr, monthNumStr] = monthStr.split('-');
  const monthIndex = parseInt(monthNumStr, 10) - 1;
  const monthName = MONTH_NAMES[monthIndex] || monthNumStr;

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const marginX = 6;

  // --- CABEÇALHO DO DOCUMENTO (ANVISA RDC 44/2009) ---
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(marginX, 5, pageWidth - (marginX * 2), 16, 'F');

  // Título e Subtítulo
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('DROGARIA BELA FARMA', pageWidth / 2, 9.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(
    `MAPA DE CONTROLE DIÁRIO DE TEMPERATURA E UMIDADE — ${monthName} / ${yearStr}`,
    pageWidth / 2,
    14,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(203, 213, 225); // Slate-300
  doc.text(
    'Em conformidade com a RDC nº 44/2009 da ANVISA e Boas Práticas Farmacêuticas • Limite Máximo Estrito: 29,2°C',
    pageWidth / 2,
    18,
    { align: 'center' }
  );

  // --- FAIXA DE METADADOS DO ESTABELECIMENTO / RT ---
  doc.setFillColor(248, 250, 252); // Slate-50
  doc.rect(marginX, 23, pageWidth - (marginX * 2), 9, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, 23, pageWidth - (marginX * 2), 9, 'S');

  doc.setFontSize(6.2);
  doc.setTextColor(30, 41, 59);

  const rtName = config.farmaceutico_nome || 'Farmacêutico(a) Responsável Técnico';
  const rtCrf = config.farmaceutico_crf || 'CRF/MG 00000';
  const termoModel = config.termometro_modelo || 'Termo-Higrômetro Digital Calibrado TH-01';
  const termoCert = config.termometro_certificado || 'Certificado RBC Vigente';

  doc.setFont('helvetica', 'bold');
  doc.text('Responsável Técnico:', marginX + 2, 26.8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${rtName} (${rtCrf})`, marginX + 31, 26.8);

  doc.setFont('helvetica', 'bold');
  doc.text('Equipamento:', marginX + 110, 26.8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${termoModel}`, marginX + 128, 26.8);

  doc.setFont('helvetica', 'bold');
  doc.text('Faixa Aceitável:', marginX + 2, 30.2);
  doc.setFont('helvetica', 'normal');
  doc.text('Temperatura: 15,0°C a 29,2°C | Umidade: 40% a 70%', marginX + 23, 30.2);

  doc.setFont('helvetica', 'bold');
  doc.text('Calibração:', marginX + 110, 30.2);
  doc.setFont('helvetica', 'normal');
  doc.text(`${termoCert}`, marginX + 125, 30.2);

  // --- PREPARAÇÃO DA TABELA ---
  const head = [
    [
      { content: 'DATA', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      { content: 'TURNO', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      { content: 'HORA', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
      { content: 'ÁREA DE VENDAS (LOJA)', colSpan: 4, styles: { halign: 'center' } },
      { content: 'ALMOXARIFADO (ÁREA RESERVADA)', colSpan: 4, styles: { halign: 'center' } },
      { content: 'VISTO', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
    ],
    [
      { content: 'MÍN', styles: { halign: 'center' } },
      { content: 'ATUAL', styles: { halign: 'center' } },
      { content: 'MÁX', styles: { halign: 'center' } },
      { content: 'UMID', styles: { halign: 'center' } },
      { content: 'MÍN', styles: { halign: 'center' } },
      { content: 'ATUAL', styles: { halign: 'center' } },
      { content: 'MÁX', styles: { halign: 'center' } },
      { content: 'UMID', styles: { halign: 'center' } },
    ]
  ];

  const body: any[] = [];

  records.forEach((r) => {
    const isSunday = r.is_sunday === 1 || r.status === 'fechado';
    const [, m, d] = r.record_date.split('-');
    const formattedDate = `${d}/${m}`;
    const turnLetter = r.turn === 'manha' ? 'M' : 'T';

    if (isSunday) {
      body.push([
        { content: formattedDate, styles: { fontStyle: 'bold', halign: 'center', fillColor: [241, 245, 249] } },
        { content: 'DOMINGO - FARMÁCIA FECHADA', colSpan: 10, styles: { halign: 'center', fontStyle: 'bold', textColor: [100, 116, 139], fillColor: [241, 245, 249] } },
        { content: '—', styles: { halign: 'center', fillColor: [241, 245, 249] } }
      ]);
    } else {
      body.push([
        { content: formattedDate, styles: { fontStyle: 'bold', halign: 'center' } },
        { content: turnLetter, styles: { fontStyle: 'bold', halign: 'center' } },
        { content: r.record_time || '—', styles: { halign: 'center' } },
        { content: r.loja_temp_min !== null ? `${r.loja_temp_min.toFixed(1)}°` : '—', styles: { halign: 'center' } },
        { content: r.loja_temp_atual !== null ? `${r.loja_temp_atual.toFixed(1)}°` : '—', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: r.loja_temp_max !== null ? `${r.loja_temp_max.toFixed(1)}°` : '—', styles: { halign: 'center' } },
        { content: r.loja_umid_atual !== null ? `${r.loja_umid_atual}%` : '—', styles: { halign: 'center' } },
        { content: r.almo_temp_min !== null ? `${r.almo_temp_min.toFixed(1)}°` : '—', styles: { halign: 'center' } },
        { content: r.almo_temp_atual !== null ? `${r.almo_temp_atual.toFixed(1)}°` : '—', styles: { halign: 'center', fontStyle: 'bold' } },
        { content: r.almo_temp_max !== null ? `${r.almo_temp_max.toFixed(1)}°` : '—', styles: { halign: 'center' } },
        { content: r.almo_umid_atual !== null ? `${r.almo_umid_atual}%` : '—', styles: { halign: 'center' } },
        { content: 'RT', styles: { halign: 'center', fontStyle: 'italic', textColor: [100, 116, 139] } }
      ]);
    }
  });

  autoTable(doc, {
    head: head as any,
    body: body,
    startY: 34,
    margin: { left: marginX, right: marginX, bottom: 16 },
    theme: 'grid',
    styles: {
      fontSize: 5.3,
      cellPadding: 0.65,
      lineColor: [203, 213, 225],
      lineWidth: 0.12,
      textColor: [30, 41, 59],
      font: 'helvetica'
    },
    headStyles: {
      fillColor: [51, 65, 85], // Slate-700
      textColor: [255, 255, 255],
      fontSize: 5.4,
      fontStyle: 'bold',
      cellPadding: 0.8
    },
    columnStyles: {
      0: { cellWidth: 12 }, // Data
      1: { cellWidth: 8 },  // Turno
      2: { cellWidth: 11 }, // Hora
      3: { cellWidth: 16.5 }, // Loja Min
      4: { cellWidth: 17.5 }, // Loja Atual
      5: { cellWidth: 16.5 }, // Loja Max
      6: { cellWidth: 16.5 }, // Loja Umid
      7: { cellWidth: 16.5 }, // Almo Min
      8: { cellWidth: 17.5 }, // Almo Atual
      9: { cellWidth: 16.5 }, // Almo Max
      10: { cellWidth: 16.5 },// Almo Umid
      11: { cellWidth: 'auto' } // Visto
    },
    didDrawPage: () => {
      // Rodapé oficial ANVISA
      const pageHeight = doc.internal.pageSize.getHeight();
      
      doc.setDrawColor(203, 213, 225);
      doc.line(marginX, pageHeight - 15, pageWidth - marginX, pageHeight - 15);

      doc.setFontSize(5.2);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text(
        'Documento obrigatório para fins de fiscalização sanitária (ANVISA / Vigilância Sanitária Municipal).',
        marginX,
        pageHeight - 11.5
      );
      doc.text(
        'Registros realizados via medição calibrada direta com sensor duplo de área de dispensação e depósito.',
        marginX,
        pageHeight - 8.5
      );

      // Linha de Assinatura do RT
      doc.line(pageWidth - 85, pageHeight - 9, pageWidth - marginX, pageHeight - 9);
      doc.setFontSize(5.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(`${rtName} — ${rtCrf}`, pageWidth - 48, pageHeight - 6, { align: 'center' });
      doc.setFontSize(4.8);
      doc.setFont('helvetica', 'normal');
      doc.text('Farmacêutico(a) Responsável Técnico', pageWidth - 48, pageHeight - 3.5, { align: 'center' });
    }
  });
}

/**
 * Gera PDF de um mês individual e abre no visualizador ou faz download
 */
export function generateSingleMonthPdf(
  monthStr: string,
  records: TemperatureRecord[],
  config: TemperatureConfig,
  action: 'open' | 'download' = 'open'
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  buildMonthPage(doc, { monthStr, records, config }, true);

  const fileName = `mapa-temperatura-${monthStr}.pdf`;
  if (action === 'download') {
    doc.save(fileName);
  } else {
    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  }
}

/**
 * Gera PDF de múltiplos meses (em lote), com 1 página por mês
 */
export function generateBatchMonthsPdf(
  monthsData: { monthStr: string; records: TemperatureRecord[] }[],
  config: TemperatureConfig,
  action: 'open' | 'download' = 'open'
) {
  if (!monthsData || monthsData.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  monthsData.forEach((m, idx) => {
    buildMonthPage(doc, { monthStr: m.monthStr, records: m.records, config }, idx === 0);
  });

  const fileName = `mapa-temperatura-lote-${monthsData[0].monthStr}-a-${monthsData[monthsData.length - 1].monthStr}.pdf`;
  if (action === 'download') {
    doc.save(fileName);
  } else {
    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  }
}
