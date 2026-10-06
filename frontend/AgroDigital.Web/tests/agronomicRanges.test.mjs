import test from "node:test";
import assert from "node:assert/strict";
import { RANGOS_DENSIDAD_SIEMBRA, RANGOS_PMG, RANGOS_PROFUNDIDAD, RANGOS_UREA, fueraDeRangoOrientativo } from "../src/agronomicRanges.js";

test("los rangos por cultivo coinciden con las referencias indicadas", () => {
  const esperados = {
    soja: [[250000, 500000], [130, 220], [3, 5], [0, 100]],
    maiz: [[50000, 100000], [220, 400], [4, 8], [0, 400]],
    sorgo: [[180000, 320000], [20, 40], [4, 5], [0, 300]],
    trigo: [[2000000, 4500000], [30, 50], [2, 4], [0, 300]],
    girasol: [[35000, 70000], [40, 80], [3, 6], [0, 250]]
  };
  for (const [cultivo, rangos] of Object.entries(esperados)) {
    assert.deepEqual([RANGOS_DENSIDAD_SIEMBRA[cultivo], RANGOS_PMG[cultivo], RANGOS_PROFUNDIDAD[cultivo], RANGOS_UREA[cultivo]], rangos);
  }
});

test("los extremos se aceptan y salir del rango solo genera advertencia", () => {
  assert.equal(fueraDeRangoOrientativo(130, RANGOS_PMG.soja), false);
  assert.equal(fueraDeRangoOrientativo(220, RANGOS_PMG.soja), false);
  assert.equal(fueraDeRangoOrientativo(129, RANGOS_PMG.soja), true);
  assert.equal(fueraDeRangoOrientativo(6, RANGOS_PROFUNDIDAD.soja), true);
  assert.equal(fueraDeRangoOrientativo(401, RANGOS_UREA.maiz), true);
  assert.equal(fueraDeRangoOrientativo("", RANGOS_UREA.maiz), false);
  assert.equal(fueraDeRangoOrientativo(0, RANGOS_UREA.maiz), false);
  assert.equal(fueraDeRangoOrientativo(300, undefined), false);
});
