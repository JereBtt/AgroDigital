export function finPeriodoCampania(nombre) {
  const periodo = String(nombre ?? '').match(/(?:^|\D)\d{4}-(\d{4})(?!\d)/);
  return periodo ? `${periodo[1]}-12-31` : '';
}

export function calcularAvanceApto(siembrasDisponibles, cosechas, lotes, empresa, campania, cicloEstacional = "") {
  const normalizar = (valor) => String(valor ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const coincide = (item) =>
    (!empresa || normalizar(item.empresa) === normalizar(empresa))
    && (!campania || normalizar(item.campaniaNombre) === normalizar(campania));
  const coincideCiclo = (item) => !cicloEstacional || item.cicloEstacional === cicloEstacional;
  const lotesActivos = new Set(lotes.filter((lote) => lote.activo).map((lote) => String(lote.loteId)));
  const superficies = new Map();
  for (const siembra of siembrasDisponibles) {
    if (coincide(siembra) && coincideCiclo(siembra) && lotesActivos.has(String(siembra.loteId))) {
      superficies.set(String(siembra.siembraId), { sembradas: Number(siembra.hectareasSembradas ?? 0), cosechadas: 0 });
    }
  }
  for (const cosecha of cosechas) {
    if (!coincide(cosecha) || !coincideCiclo(cosecha) || !lotesActivos.has(String(cosecha.loteId))) continue;
    const id = String(cosecha.siembraId);
    const sembradas = Number(cosecha.hectareasSembradas ?? 0);
    const cosechadas = cosecha.estado === 'Finalizado'
      ? Number(cosecha.cantidadHectareasTrabajadas ?? cosecha.hectareasCosechadas ?? 0)
      : Number(cosecha.hectareasCosechadas ?? 0);
    superficies.set(id, { sembradas, cosechadas });
  }
  const { sembradas, cosechadas } = [...superficies.values()].reduce((total, item) => ({
    sembradas: total.sembradas + item.sembradas,
    cosechadas: total.cosechadas + item.cosechadas
  }), { sembradas: 0, cosechadas: 0 });
  return { sembradas, cosechadas, porcentaje: sembradas > 0 ? Math.min(100, (cosechadas / sembradas) * 100) : 0 };
}
