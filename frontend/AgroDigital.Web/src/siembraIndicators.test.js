import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularAvanceSiembra } from './siembraIndicators.js';
import { calcularAvanceApto } from './cosechaIndicators.js';

test('el avance de siembra separa ciclos, cuenta bajas y no duplica resiembras', () => {
  const planes = [
    { loteId: 1, cicloEstacional: 'Verano', loteHectareas: 100 },
    { loteId: 1, cicloEstacional: 'Invierno', loteHectareas: 100 },
    { loteId: 2, cicloEstacional: 'Verano', loteHectareas: 50 }
  ];
  const siembras = [
    { loteId: 1, campaniaNombre: '2026-2027', cicloEstacional: 'Verano', cantidadHectareasTrabajadas: 80, deshabilitada: true },
    { loteId: 1, campaniaNombre: '2026-2027', cicloEstacional: 'Verano', cantidadHectareasTrabajadas: 80, tipoRegistro: 'Resiembra' },
    { loteId: 1, campaniaNombre: '2026-2027', cicloEstacional: 'Invierno', cantidadHectareasTrabajadas: 40 }
  ];
  const lotes = [{ loteId: 1, hectareas: 100, activo: false }, { loteId: 2, hectareas: 50, activo: true }];
  assert.deepEqual(calcularAvanceSiembra(planes, siembras, lotes, '2026-2027', 'Verano'), {
    planificadas: 150, sembradas: 80, porcentaje: 80 / 150 * 100
  });
  assert.deepEqual(calcularAvanceSiembra(planes, siembras, lotes, '2026-2027', 'Invierno'), {
    planificadas: 100, sembradas: 40, porcentaje: 40
  });
});

test('el avance de cosecha no mezcla superficies de verano e invierno', () => {
  const lotes = [{ loteId: 1, activo: true }];
  const disponibles = [{ siembraId: 2, loteId: 1, empresa: 'A', campaniaNombre: '2026-2027', cicloEstacional: 'Invierno', hectareasSembradas: 40 }];
  const cosechas = [{ siembraId: 1, loteId: 1, empresa: 'A', campaniaNombre: '2026-2027', cicloEstacional: 'Verano', estado: 'Finalizado', hectareasSembradas: 100, cantidadHectareasTrabajadas: 100 }];
  assert.deepEqual(calcularAvanceApto(disponibles, cosechas, lotes, 'A', '2026-2027', 'Verano'), { sembradas: 100, cosechadas: 100, porcentaje: 100 });
  assert.deepEqual(calcularAvanceApto(disponibles, cosechas, lotes, 'A', '2026-2027', 'Invierno'), { sembradas: 40, cosechadas: 0, porcentaje: 0 });
});
