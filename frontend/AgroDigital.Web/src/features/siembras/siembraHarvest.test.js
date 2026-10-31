import assert from "node:assert/strict";
import test from "node:test";
import { getRelevantHarvest } from "./siembraHarvest.js";

const lote = { historialCultivos: [
  { campania: "2024-2025 ElChañarSa", cicloEstacional: "Verano", fechaFin: "2025-04-14T00:00:00" },
  { campania: "2025-2026 ElChañarSa", cicloEstacional: "Verano", fechaFin: "2026-04-21T00:00:00" },
  { campania: "2025-2026 ElChañarSa", cicloEstacional: "Invierno", fechaFin: "2026-10-30T00:00:00" },
] };

test("invierno usa la cosecha de verano de la misma campaña", () => {
  assert.equal(getRelevantHarvest(lote, "2025-2026 ElChañarSa", "Invierno")?.fechaFin, "2026-04-21T00:00:00");
});

test("verano solo usa la cosecha de una campaña previa", () => {
  assert.equal(getRelevantHarvest(lote, "2025-2026 ElChañarSa", "Verano")?.fechaFin, "2025-04-14T00:00:00");
});

test("un lote nuevo no impone fecha de cosecha", () => {
  assert.equal(getRelevantHarvest({ historialCultivos: [] }, "2025-2026 ElChañarSa", "Invierno"), undefined);
});
