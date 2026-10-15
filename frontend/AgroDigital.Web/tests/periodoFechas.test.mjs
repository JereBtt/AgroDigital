import assert from 'node:assert/strict';
import test from 'node:test';
import { limitesPeriodoCampania, periodoOperativo, periodoOperativoDeFecha } from '../src/periodoFechas.js';

test('el periodo operativo cambia en junio y cubre ambos años calendario', () => {
  assert.equal(periodoOperativo(new Date(2026, 4, 31)), '2025-2026');
  assert.equal(periodoOperativo(new Date(2026, 5, 1)), '2026-2027');
  assert.deepEqual(limitesPeriodoCampania('2026-2027 ElChañarSa'), {
    periodo: '2026-2027', min: '2026-01-01', max: '2027-12-31'
  });
  assert.equal(periodoOperativoDeFecha('2026-10-14'), '2026-2027');
  assert.deepEqual(limitesPeriodoCampania('CAMP - 0001', '2024-11-02'), {
    periodo: '2024-2025', min: '2024-01-01', max: '2025-12-31'
  });
});
