import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularAvanceApto, finPeriodoCampania } from '../src/cosechaIndicators.js';

test('el avance incluye superficie apta pendiente y lotes ya cosechados, pero no deshabilitados', () => {
  const disponibles = [
    { siembraId: 2, loteId: 2, empresa: 'El Sauce', campaniaNombre: '2026-2027 El Sauce', hectareasSembradas: 40 },
    { siembraId: 3, loteId: 3, empresa: 'El Sauce', campaniaNombre: '2026-2027 El Sauce', hectareasSembradas: 30 }
  ];
  const cosechas = [
    { siembraId: 1, loteId: 1, empresa: 'El Sauce', campaniaNombre: '2026-2027 El Sauce', estado: 'Finalizado', hectareasSembradas: 50, cantidadHectareasTrabajadas: 50 },
    { siembraId: 4, loteId: 4, empresa: 'El Sauce', campaniaNombre: '2026-2027 El Sauce', estado: 'Finalizado', hectareasSembradas: 20, cantidadHectareasTrabajadas: 20 }
  ];
  const lotes = [
    { loteId: 1, activo: true }, { loteId: 2, activo: true },
    { loteId: 3, activo: false }, { loteId: 4, activo: false }
  ];
  assert.deepEqual(calcularAvanceApto(disponibles, cosechas, lotes, 'El Sauce', '2026-2027 El Sauce'), {
    sembradas: 90, cosechadas: 50, porcentaje: 50 / 90 * 100
  });
});

test('el inicio de cosecha puede llegar al último día del año final de campaña', () => {
  assert.equal(finPeriodoCampania('2026-2027 El Sauce'), '2027-12-31');
  assert.equal(finPeriodoCampania('Sin período'), '');
});

test('el avance respeta el ciclo estacional y conserva las cosechas finalizadas', () => {
  const disponibles = [
    { siembraId: 1, loteId: 1, empresa: 'El Sauce', campaniaNombre: '2026-2027 El Sauce', cicloEstacional: 'Verano', hectareasSembradas: 40 },
    { siembraId: 2, loteId: 2, empresa: 'El Sauce', campaniaNombre: '2026-2027 El Sauce', cicloEstacional: 'Invierno', hectareasSembradas: 20 }
  ];
  const cosechas = [
    { siembraId: 3, loteId: 3, empresa: 'El Sauce', campaniaNombre: '2026-2027 El Sauce', cicloEstacional: 'Verano', estado: 'Finalizado', hectareasSembradas: 60, cantidadHectareasTrabajadas: 60 }
  ];
  const lotes = [1, 2, 3].map((loteId) => ({ loteId, activo: true }));
  assert.deepEqual(calcularAvanceApto(disponibles, cosechas, lotes, 'El Sauce', '2026-2027 El Sauce', 'Verano'), {
    sembradas: 100, cosechadas: 60, porcentaje: 60
  });
});
