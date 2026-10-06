export function roundToTwoDecimals(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateSowingQuantities({ densidadSiembra, pmg, hectareas, ureaKgHa }) {
  const densidad = Number(densidadSiembra);
  const pesoMilGranos = Number(pmg);
  const superficie = Number(hectareas);
  const hasDensidad = densidadSiembra !== "" && densidadSiembra != null && Number.isFinite(densidad) && densidad > 0;
  const hasPmg = pmg !== "" && pmg != null && Number.isFinite(pesoMilGranos) && pesoMilGranos > 0;
  const hasHectareas = hectareas !== "" && hectareas != null && Number.isFinite(superficie) && superficie > 0;
  const hasUrea = ureaKgHa !== "" && ureaKgHa != null && Number.isFinite(Number(ureaKgHa)) && Number(ureaKgHa) >= 0;

  return {
    semillasTotales: hasDensidad && hasHectareas ? roundToTwoDecimals(densidad * superficie) : null,
    semillaKgHa: hasDensidad && hasPmg ? roundToTwoDecimals(densidad * pesoMilGranos / 1_000_000) : null,
    semillaTotalKg: hasDensidad && hasPmg && hasHectareas ? roundToTwoDecimals(densidad * pesoMilGranos * superficie / 1_000_000) : null,
    ureaTotalKg: hasUrea && hasHectareas ? roundToTwoDecimals(Number(ureaKgHa) * superficie) : null
  };
}
