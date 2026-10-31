import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularSiniestros, calcularSuperficie, construirFlujoPlanificacion, desvioDias, filtrar, productividad, resumirParticipacionGranos, resumirRindes } from './estadisticasAgricolas.js';

test('rinde ponderado por superficie; no promedia promedios ni incluye cosechas abiertas', () => {
  const rows = [{ estado: 'Finalizado', ha: 10, kg: 10000, loteId: 1 }, { estado: 'Finalizado', ha: 90, kg: 270000, loteId: 2 }, { estado: 'En curso', ha: 100, kg: 900000 }, { estado: 'Finalizado', ha: 0, kg: 100 }];
  const [r] = resumirRindes(rows, () => 'Soja');
  assert.equal(r.rinde, 2800); assert.equal(r.ha, 100); assert.equal(r.lotes, 2); assert.equal(r.registros, 2);
});
test('rinde seco omite faltantes y admite un resultado cero válido', () => {
  const [r] = resumirRindes([{ estado: 'Finalizado', ha: 10, rindeSeco: 0 }, { estado: 'Finalizado', ha: 30, rindeSeco: 2000 }, { estado: 'Finalizado', ha: 10 }], () => 'A', 'seco');
  assert.equal(r.rinde, 1500); assert.equal(r.registros, 2);
});
test('participación usa hectáreas, y la tabla conserva kg registrados y rinde ponderado', () => {
  const rows = [
    { grano: 'Soja', estado: 'Finalizado', ha: 10, kg: 10000, rindeSeco: 900 },
    { grano: 'Soja', estado: 'Finalizado', ha: 50, kg: 150000, rindeSeco: 2700 },
    { grano: 'Maíz', estado: 'Finalizado', ha: 40, kg: 400000, rindeSeco: 8000 },
    { grano: 'Maíz', estado: 'En curso', ha: 100, kg: 1000000 }
  ];
  const humedo = resumirParticipacionGranos(rows);
  assert.deepEqual(humedo.map(r => r.ha), [60, 40]);
  assert.deepEqual(humedo.map(r => r.kg), [160000, 400000]);
  assert.equal(humedo[0].rinde, 160000 / 60);
  assert.equal(resumirParticipacionGranos(rows, 'seco')[0].rinde, 2400);
});
test('participación conserva superficie aunque falte el peso de una cosecha', () => {
  const [r] = resumirParticipacionGranos([
    { grano: 'Trigo', estado: 'Finalizado', ha: 20, kg: 60000 },
    { grano: 'Trigo', estado: 'Finalizado', ha: 5, kg: null }
  ]);
  assert.equal(r.ha, 25);
  assert.equal(r.kg, 60000);
  assert.equal(r.rinde, 3000);
});
test('filtros separan campaña y ciclo, normalizan grano/variedad y conservan bajas', () => {
  const row = { campania: '2024-2025', ciclo: 'Verano', grano: 'Maíz', variedad: 'ACA', epoca: 'Tardío', deshabilitada: true };
  assert.deepEqual(filtrar([row, { ...row, ciclo: 'Invierno' }, { ...row, campania: '2025-2026' }], { campanias: ['2024-2025'], ciclo: 'Verano', grano: 'maiz', variedad: 'aca' }), [row]);
});
test('superficie usa la última resiembra; separa ciclos y cuenta planes sin sembrar', () => {
  const data = { lotes: [{ id: 1, superficie: 100 }, { id: 2, superficie: 50 }], planes: [{ loteId: 1, campania: 'A', ciclo: 'Verano' }, { loteId: 2, campania: 'A', ciclo: 'Verano' }], siembras: [{ id: 1, loteId: 1, campania: 'A', ciclo: 'Verano', ha: 80, deshabilitada: true }, { id: 2, loteId: 1, campania: 'A', ciclo: 'Verano', ha: 30, tipo: 'Resiembra' }, { id: 3, loteId: 1, campania: 'A', ciclo: 'Invierno', ha: 100 }] };
  const result = calcularSuperficie(data, { ciclo: 'Verano' });
  assert.equal(result[0].trabajadas, 30); assert.equal(result[0].sinTrabajar, 70); assert.equal(result[1].sinTrabajar, 50);
  const sanIgnacio = calcularSuperficie({ lotes: [{ id: 1047, nombre: 'San Ignacio', superficie: 204.6048 }], planes: [], siembras: [
    { id: 1031, loteId: 1047, campania: '2024-2025', ciclo: 'Verano', ha: 204.6048 },
    { id: 1032, loteId: 1047, campania: '2024-2025', ciclo: 'Verano', ha: 195, tipo: 'Resiembra' }
  ] }, { campanias: ['2024-2025'], ciclo: 'Verano' });
  assert.ok(Math.abs(sanIgnacio[0].sinTrabajar - 9.6048) < 0.000001);
});
test('incidencia cuenta cada lote una vez por tipo, no cada evento automático', () => {
  const data = { siembras: [{ id: 1, loteId: 1, campania: 'A', ciclo: 'Verano' }, { id: 2, loteId: 1, campania: 'A', ciclo: 'Verano', tipo: 'Resiembra' }, { id: 3, loteId: 2, campania: 'A', ciclo: 'Verano' }, { id: 4, loteId: 3, campania: 'A', ciclo: 'Verano' }], siniestros: [{ siembraId: 1, siniestro: 'Granizo', alcance: 'Total' }, { siembraId: 2, siniestro: 'Granizo', alcance: 'Total', automatico: true }, { siembraId: 3, siniestro: 'Helada', alcance: 'Parcial' }] };
  const r = calcularSiniestros(data, {});
  assert.equal(r.total, 3); assert.equal(r.afectados, 2); assert.equal(r.ranking[0].cantidad, 1);
  assert.equal(r.categorias.resiembra.length, 1); assert.equal(r.categorias.sinResiembra.length, 1);
});
test('pérdida total exige baja por siniestro y conserva cultivo y causa de cada lote', () => {
  const data = { siembras: [
    { id: 1, loteId: 1, campania: 'A', ciclo: 'Verano', grano: 'Soja', deshabilitada: true, motivoBaja: 'Siniestro', siniestroBaja: 'Granizo' },
    { id: 2, loteId: 2, campania: 'A', ciclo: 'Verano', grano: 'Maíz' },
    { id: 3, loteId: 3, campania: 'A', ciclo: 'Verano', grano: 'Soja', deshabilitada: true, motivoBaja: 'Fin de alquiler' }
  ], siniestros: [
    { siembraId: 1, siniestro: 'Granizo', alcance: 'Total', cultivo: 'Soja', automatico: true },
    { siembraId: 2, siniestro: 'Helada', alcance: 'Total', cultivo: 'Maíz' },
    { siembraId: 3, siniestro: 'Sequía', alcance: 'Parcial', cultivo: 'Soja' }
  ] };
  const r = calcularSiniestros(data, {});
  assert.deepEqual(r.categorias.total.map(x => x.loteId), [1]);
  assert.deepEqual(r.categorias.total[0].cultivos, ['Soja']);
  assert.deepEqual(r.categorias.total[0].siniestros, ['Granizo']);
  assert.deepEqual(r.categorias.sinResiembra.map(x => x.loteId), [2, 3]);
  assert.equal(r.ranking.find(x => x.nombre === 'Granizo').cantidad, 1);
});
test('una baja final por siniestro prevalece sobre una resiembra previa', () => {
  const data = { siembras: [
    { id: 1, loteId: 1, campania: 'A', ciclo: 'Verano', grano: 'Maíz' },
    { id: 2, loteId: 2, campania: 'A', ciclo: 'Verano', grano: 'Soja' },
    { id: 3, loteId: 2, campania: 'A', ciclo: 'Verano', grano: 'Soja', tipo: 'Resiembra', deshabilitada: true, motivoBaja: 'Siniestro', siniestroBaja: 'Inundación' }
  ], siniestros: [
    { siembraId: 1, siniestro: 'Helada', alcance: 'Total' },
    { siembraId: 3, siniestro: 'Inundación', alcance: 'Total', fecha: '2026-12-10' },
    { siembraId: 2, siniestro: 'Granizo', alcance: 'Parcial', fecha: '2026-11-18' }
  ] };
  const r = calcularSiniestros(data, {});
  assert.deepEqual(r.categorias.sinResiembra.map(x => x.loteId), [1]);
  assert.equal(r.categorias.resiembra.length, 0);
  assert.deepEqual(r.categorias.total.map(x => x.loteId), [2]);
  assert.deepEqual(r.categorias.total[0].cultivos, ['Soja']);
  assert.deepEqual(r.categorias.total[0].siniestros, ['Granizo', 'Inundación']);
  assert.equal(r.categorias.sinResiembra.length + r.categorias.resiembra.length + r.categorias.total.length, r.afectados);
});
test('una etapa activa posterior evita clasificar una baja histórica como pérdida total', () => {
  const data = { siembras: [
    { id: 1, loteId: 1, campania: 'A', ciclo: 'Verano', grano: 'Maíz', deshabilitada: true, motivoBaja: 'Siniestro', siniestroBaja: 'Inundación' },
    { id: 2, loteId: 1, campania: 'A', ciclo: 'Verano', grano: 'Soja' }
  ], siniestros: [{ siembraId: 1, siniestro: 'Inundación', cultivo: 'Maíz' }] };
  const r = calcularSiniestros(data, {});
  assert.equal(r.categorias.total.length, 0);
  assert.deepEqual(r.categorias.sinResiembra.map(x => x.loteId), [1]);
});
test('el filtro de cultivo no oculta una resiembra posterior de otro grano', () => {
  const data = { siembras: [
    { id: 1, loteId: 4, campania: 'A', ciclo: 'Verano', grano: 'Maíz' },
    { id: 2, loteId: 4, campania: 'A', ciclo: 'Verano', grano: 'Soja', tipo: 'Resiembra' }
  ], siniestros: [
    { siembraId: 1, siniestro: 'Inundación', alcance: 'Total', cultivo: 'Maíz', fecha: '2026-11-01' },
    { siembraId: 2, siniestro: 'Granizo', alcance: 'Parcial', cultivo: 'Soja', fecha: '2026-12-01' }
  ] };
  const r = calcularSiniestros(data, { grano: 'maiz' });
  assert.deepEqual(r.categorias.resiembra.map(x => x.loteId), [4]);
  assert.deepEqual(r.categorias.resiembra[0].cultivos, ['Maíz', 'Soja']);
  assert.deepEqual(r.categorias.resiembra[0].siniestros, ['Inundación', 'Granizo']);
});
test('productividad se pondera por horas y omite datos incompletos', () => {
  const r = productividad([{ estado: 'Finalizado', ha: 100, haHora: 10 }, { estado: 'Finalizado', ha: 100, haHora: 5 }, { estado: 'En curso', ha: 100, haHora: 50 }]);
  assert.equal(r.horas, 30); assert.equal(r.valor, 200 / 30);
  assert.equal(productividad([]).valor, null);
});
test('cumplimiento compara días calendario sin depender de la zona horaria', () => {
  assert.equal(desvioDias({ finTentativo: '2025-03-01T00:00:00', finReal: '2025-03-03T00:00:00' }), 2);
  assert.equal(desvioDias({ finTentativo: '2024-03-01', finReal: '2024-02-28' }), -2);
  assert.equal(desvioDias({ finTentativo: '2025-03-01' }), null);
});

test('flujo esperado y real acumula operaciones por fecha sin contar las pendientes como terminadas', () => {
  const flujo = construirFlujoPlanificacion([
    { finTentativo: '2025-04-03', finReal: '2025-04-01', estado: 'Finalizado' },
    { finTentativo: '2025-04-02', finReal: '2025-04-05', estado: 'Finalizado' },
    { finTentativo: '2025-04-03', estado: 'En curso' },
    { finTentativo: null, finReal: '2025-04-02', estado: 'Finalizado' }
  ]);
  assert.deepEqual(flujo.puntos, [
    { fecha: '2025-04-01', esperado: 0, real: 1 },
    { fecha: '2025-04-02', esperado: 1, real: 1 },
    { fecha: '2025-04-03', esperado: 3, real: 1 },
    { fecha: '2025-04-05', esperado: 3, real: 2 }
  ]);
  assert.equal(flujo.totalPrevisto, 3);
  assert.equal(flujo.totalReal, 2);
  assert.equal(flujo.excluidos, 1);
});
