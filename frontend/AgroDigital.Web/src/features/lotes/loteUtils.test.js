import assert from 'node:assert/strict';
import test from 'node:test';
import {
  distanceMeters,
  emptyForm,
  formFromLote,
  getPreviousCampaignOptions,
  hasLoteFormChanges,
  lotePayloadFromForm,
  moveArrayItem,
  polygonAreaSquareMeters
} from './loteUtils.js';

const points = [
  { lat: -32, lng: -64 },
  { lat: -32, lng: -63.999 },
  { lat: -31.999, lng: -63.999 },
  { lat: -31.999, lng: -64 }
];

test('el área del lote no depende del sentido de los vértices', () => {
  const area = polygonAreaSquareMeters(points);
  assert.ok(area > 10_000 && area < 11_000);
  assert.ok(Math.abs(area - polygonAreaSquareMeters([...points].reverse())) < 0.01);
  assert.equal(polygonAreaSquareMeters(points.slice(0, 2)), 0);
  assert.ok(distanceMeters(points[0], points[1]) > 90);
});

test('la ficha ordena y convierte coordenadas válidas sin modificar el lote original', () => {
  const lote = {
    nombre: 'Norte',
    coordenadas: [
      { orden: 2, latitud: '-32.1', longitud: '-64.1' },
      { orden: 1, latitud: '-32', longitud: '-64' },
      { orden: 3, latitud: 'inválida', longitud: '-64.2' }
    ]
  };
  const form = formFromLote(lote);
  assert.equal(form.provincia, emptyForm.provincia);
  assert.deepEqual(form.coordenadas, [
    { lat: -32, lng: -64 },
    { lat: -32.1, lng: -64.1 }
  ]);
  assert.equal(form.cerrado, true);
  assert.equal(lote.coordenadas[0].orden, 2);
});

test('el payload conserva la empresa, el orden y la precisión usada por la API', () => {
  const payload = lotePayloadFromForm({
    ...emptyForm,
    nombre: 'Norte',
    coordenadas: [{ lat: -32.1234567, lng: -64.7654321 }]
  }, 1.234567, 12_345.67891, '7');
  assert.equal(payload.empresaId, 7);
  assert.equal(payload.hectareas, 1.2346);
  assert.equal(payload.superficieTotal, 12_345.6789);
  assert.deepEqual(payload.coordenadas, [{ orden: 1, latitud: -32.123457, longitud: -64.765432 }]);
});

test('editar sin cambiar datos mantiene deshabilitado Guardar cambios', () => {
  const lote = {
    ...emptyForm,
    coordenadas: points.map((point, index) => ({ orden: index + 1, latitud: point.lat, longitud: point.lng }))
  };
  const form = formFromLote(lote);
  const areaM2 = polygonAreaSquareMeters(form.coordenadas);
  assert.equal(hasLoteFormChanges(lote, form, areaM2 / 10_000, areaM2), false);
  assert.equal(hasLoteFormChanges(lote, { ...form, nombre: 'Otro' }, areaM2 / 10_000, areaM2), true);
  assert.equal(hasLoteFormChanges(lote, form, areaM2 / 10_000 + 0.001, areaM2), true);
});

test('las campañas previas cambian en junio y el reordenamiento no muta la lista', () => {
  assert.deepEqual(getPreviousCampaignOptions(new Date(2026, 4, 31)), ['2024-2025', '2023-2024', '2022-2023']);
  assert.deepEqual(getPreviousCampaignOptions(new Date(2026, 5, 1)), ['2025-2026', '2024-2025', '2023-2024']);
  const original = ['a', 'b', 'c'];
  assert.deepEqual(moveArrayItem(original, 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(original, ['a', 'b', 'c']);
});
