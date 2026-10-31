export function getCadenaSiembras(siembra, siembras) {
  if (!siembra) return [];
  const porId = new Map((siembras ?? []).map((registro) => [String(registro.siembraId), registro]));
  const cadena = [];
  const visitados = new Set();
  let actual = siembra;
  while (actual && !visitados.has(String(actual.siembraId))) {
    cadena.push(actual);
    visitados.add(String(actual.siembraId));
    actual = actual.siembraOriginalId ? porId.get(String(actual.siembraOriginalId)) : null;
  }
  return cadena.reverse();
}

export function buildApplicationTraceability(cadena, seguimientos, prePorSiembra, postPorSeguimiento) {
  const etapas = new Map(cadena.map((siembra, indice) => [String(siembra.siembraId), {
    numero: indice + 1,
    nombre: siembra.nombre || (indice ? "Resiembra" : "Siembra inicial"),
    cultivo: siembra.producto || "-"
  }]));
  const agrupadas = new Map();
  for (const [siembraId, insumos] of Object.entries(prePorSiembra ?? {})) {
    const etapa = etapas.get(String(siembraId));
    if (!etapa) continue;
    for (const insumo of insumos ?? []) {
      const fecha = String(insumo.fechaAplicacion || "").slice(0, 10);
      const motivo = insumo.motivoAplicacion || "Aplicación previa";
      const key = JSON.stringify([siembraId, fecha, motivo]);
      if (!agrupadas.has(key)) {
        agrupadas.set(key, { id: key, fase: "Preemergente", fecha, motivo, etapa, insumos: [] });
      }
      agrupadas.get(key).insumos.push(insumo);
    }
  }
  const eventos = [...agrupadas.values()];
  for (const seguimiento of seguimientos ?? []) {
    if (seguimiento.tipoRegistro !== "Posemergente") continue;
    const etapa = etapas.get(String(seguimiento.siembraId));
    if (!etapa) continue;
    eventos.push({
      id: "seguimiento-" + seguimiento.siembraSeguimientoId,
      fase: "Posemergente",
      fecha: String(seguimiento.fecha || "").slice(0, 10),
      motivo: seguimiento.incidencia || "Aplicación posemergente",
      alcance: seguimiento.alcance || "",
      observaciones: seguimiento.observaciones || "",
      etapa,
      insumos: postPorSeguimiento?.[seguimiento.siembraSeguimientoId] ?? []
    });
  }
  return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.etapa.numero - b.etapa.numero || (a.fase === "Preemergente" ? -1 : 1));
}
