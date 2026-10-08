import test from "node:test";
import assert from "node:assert/strict";
import { buildApplicationTraceability, getCadenaSiembras } from "../src/applicationTraceability.js";

test("reúne aplicaciones de siembra y resiembra sin perder productos y las ordena por fecha", () => {
  const original = { siembraId: 1, nombre: "SIEM - 0001", producto: "Maíz" };
  const resiembra = { siembraId: 2, siembraOriginalId: 1, nombre: "SIEM - 0002", producto: "Maíz" };
  const cadena = getCadenaSiembras(resiembra, [original, resiembra]);
  assert.deepEqual(cadena.map((etapa) => etapa.siembraId), [1, 2]);

  const eventos = buildApplicationTraceability(cadena, [
    { siembraId: 2, siembraSeguimientoId: 9, tipoRegistro: "Posemergente", fecha: "2026-12-10", incidencia: "Maleza" },
    { siembraId: 1, siembraSeguimientoId: 8, tipoRegistro: "Siniestro", fecha: "2026-11-20" }
  ], {
    1: [
      { siembraInsumoId: 10, fechaAplicacion: "2026-10-02", motivoAplicacion: "Maleza", variedad: "Glifosato" },
      { siembraInsumoId: 11, fechaAplicacion: "2026-10-02", motivoAplicacion: "Maleza", variedad: "Atrazina" }
    ],
    2: [{ siembraInsumoId: 12, fechaAplicacion: "2026-12-01", motivoAplicacion: "Plaga", variedad: "Otra droga" }]
  }, { 9: [{ seguimientoInsumoId: 20, variedad: "Cletodim" }] });

  assert.deepEqual(eventos.map((evento) => evento.fecha), ["2026-10-02", "2026-12-01", "2026-12-10"]);
  assert.equal(eventos[0].insumos.length, 2);
  assert.equal(eventos[1].etapa.nombre, "SIEM - 0002");
  assert.equal(eventos[2].fase, "Posemergente");
  assert.equal(eventos[2].insumos[0].variedad, "Cletodim");
});
