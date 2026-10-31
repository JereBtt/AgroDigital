import { formatHectares } from './loteUtils.js';

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

function createLotesReportPdf(lotes) {
  const lines = lotes.map((lote) => {
    const hectareas = `${formatHectares(lote.hectareas)} ha`;
    return `${lote.nombre} | ${lote.pais} | ${lote.provincia} | ${lote.ciudad} | ${lote.condicion} | ${hectareas}`;
  });
  const pageLineGroups = [];

  for (let index = 0; index < lines.length; index += 29) {
    pageLineGroups.push(lines.slice(index, index + 29));
  }

  const pageContents = pageLineGroups.map((pageLines, index) => {
    const title = index === 0 ? 'AgroDigital - Reporte de Lotes' : 'AgroDigital - Reporte de Lotes (continuacion)';
    const contentLines = [
      'BT',
      '/F1 18 Tf',
      '50 792 Td',
      `(${escapePdfText(title)}) Tj`,
      '/F1 10 Tf',
      '0 -24 Td',
      `(Generado el ${escapePdfText(new Date().toLocaleDateString('es-AR'))} - ${lotes.length} lote${lotes.length === 1 ? '' : 's'} seleccionado${lotes.length === 1 ? '' : 's'}) Tj`,
      '0 -26 Td',
      '/F1 9 Tf',
      '(Nombre | Pais | Provincia | Zona | Condicion | Hectareas) Tj'
    ];

    pageLines.forEach((line) => {
      contentLines.push('0 -19 Td', `(${escapePdfText(line)}) Tj`);
    });

    contentLines.push('ET');
    return contentLines.join('\n');
  });

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageContents.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pageContents.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];

  pageContents.forEach((content, index) => {
    const pageObject = 4 + index * 2;
    const contentObject = pageObject + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([new Uint8Array([...pdf].map((character) => character.charCodeAt(0) & 0xff))], { type: 'application/pdf' });
}

function downloadLotesReport(lotes) {
  const fileUrl = URL.createObjectURL(createLotesReportPdf(lotes));
  const link = document.createElement('a');
  link.href = fileUrl;
  link.download = `reporte-lotes-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(fileUrl);
}

export { createLotesReportPdf, downloadLotesReport };
