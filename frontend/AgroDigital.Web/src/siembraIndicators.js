/** Avance físico por lote planificado: una resiembra no vuelve a sumar la misma superficie. */
export function calcularAvanceSiembra(combinaciones, siembras, lotes, campania, cicloEstacional) {
  const areasLote = new Map((lotes || []).map((lote) => [String(lote.loteId), Number(lote.hectareas || 0)]));
  const planes = new Map();
  for (const plan of combinaciones || []) {
    if ((plan.cicloEstacional || 'Verano') !== cicloEstacional) continue;
    const loteId = String(plan.loteId);
    const hectareas = Number(plan.loteHectareas ?? areasLote.get(loteId) ?? 0);
    if (Number.isFinite(hectareas) && hectareas > 0) planes.set(loteId, hectareas);
  }

  const sembradasPorLote = new Map();
  for (const siembra of siembras || []) {
    const loteId = String(siembra.loteId);
    if (!planes.has(loteId) || siembra.campaniaNombre !== campania || (siembra.cicloEstacional || 'Verano') !== cicloEstacional) continue;
    const hectareas = Number(siembra.cantidadHectareasTrabajadas || 0);
    if (Number.isFinite(hectareas) && hectareas > 0) {
      sembradasPorLote.set(loteId, Math.max(sembradasPorLote.get(loteId) || 0, hectareas));
    }
  }

  const planificadas = [...planes.values()].reduce((suma, hectareas) => suma + hectareas, 0);
  const sembradas = [...planes].reduce((suma, [loteId, hectareas]) => suma + Math.min(hectareas, sembradasPorLote.get(loteId) || 0), 0);
  return { planificadas, sembradas, porcentaje: planificadas > 0 ? Math.min(100, sembradas / planificadas * 100) : 0 };
}
