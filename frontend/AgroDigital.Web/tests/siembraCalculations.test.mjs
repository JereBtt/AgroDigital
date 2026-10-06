import test from "node:test";
import assert from "node:assert/strict";
import { calculateSowingQuantities } from "../src/siembraCalculations.js";

test("calcula semillas y urea desde los datos ingresados", () => {
  assert.deepEqual(calculateSowingQuantities({
    densidadSiembra: 300000,
    pmg: 180,
    hectareas: 197.7105,
    ureaKgHa: 80
  }), {
    semillasTotales: 59313150,
    semillaKgHa: 54,
    semillaTotalKg: 10676.37,
    ureaTotalKg: 15816.84
  });
});

test("deja vacíos los resultados sin entradas completas y admite urea cero", () => {
  assert.deepEqual(calculateSowingQuantities({ densidadSiembra: "", pmg: "", hectareas: "", ureaKgHa: "" }), {
    semillasTotales: null,
    semillaKgHa: null,
    semillaTotalKg: null,
    ureaTotalKg: null
  });
  assert.equal(calculateSowingQuantities({ densidadSiembra: 300000, pmg: 180, hectareas: 10, ureaKgHa: 0 }).ureaTotalKg, 0);
});
