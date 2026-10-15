// El período operativo cambia en junio; las fechas de sus operaciones abarcan
// ambos años calendario completos, independientemente de la fecha de hoy.
export function periodoOperativo(fecha = new Date()) {
  const inicio = fecha.getMonth() >= 5 ? fecha.getFullYear() : fecha.getFullYear() - 1;
  return `${inicio}-${inicio + 1}`;
}

export function limitesPeriodoCampania(campania, fechaReferencia = null) {
  const texto = String(campania ?? '');
  const match = texto.match(/(?:^|\D)(\d{4})-(\d{4})(?!\d)/);
  const periodo = match && Number(match[2]) === Number(match[1]) + 1
    ? `${match[1]}-${match[2]}`
    : fechaReferencia ? periodoOperativoDeFecha(fechaReferencia) : periodoOperativo();
  const [inicio, fin] = periodo.split('-');
  return { periodo, min: `${inicio}-01-01`, max: `${fin}-12-31` };
}

export function periodoOperativoDeFecha(fechaIso) {
  return periodoOperativo(new Date(`${String(fechaIso).slice(0, 10)}T12:00:00`));
}
