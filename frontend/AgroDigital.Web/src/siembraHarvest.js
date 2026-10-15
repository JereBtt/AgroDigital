export function getRelevantHarvest(lote, campaignName, cicloEstacional) {
  const period = String(campaignName || '').slice(0, 9);
  return lote?.historialCultivos?.filter((item) => item.fechaFin
    && (item.campania?.slice(0, 9) < period
      || (cicloEstacional === "Invierno" && item.cicloEstacional === "Verano" && item.campania?.slice(0, 9) === period)))
    .sort((a, b) => String(b.fechaFin).localeCompare(String(a.fechaFin)))[0];
}
