import assert from 'node:assert/strict';
import test from 'node:test';
import { createLotesReportPdf } from './lotePdf.js';

test('el reporte conserva el formato PDF y escapa caracteres especiales', async () => {
  const pdf = createLotesReportPdf([{
    nombre: 'Lote (Norte) \\ 1',
    pais: 'Argentina',
    provincia: 'Cordoba',
    ciudad: 'Los Condores',
    condicion: 'Propio',
    hectareas: 12.5
  }]);
  const content = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
  assert.equal(pdf.type, 'application/pdf');
  assert.ok(content.startsWith('%PDF-1.4\n'));
  assert.match(content, /Lote \\\(Norte\\\) \\\\ 1/);
  assert.match(content, /%%EOF$/);
});
