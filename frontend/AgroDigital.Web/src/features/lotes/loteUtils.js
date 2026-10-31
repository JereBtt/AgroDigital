const emptyForm = {
  nombre: '',
  pais: 'Argentina',
  provincia: 'Cordoba',
  ciudad: 'Los Condores',
  condicion: 'Propio',
  cultivoAnterior: '',
  cultivoAnteriorCampania: '',
  coordenadas: [],
  cerrado: false
};

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function polygonAreaSquareMeters(points) {
  if (points.length < 3) return 0;

  const earthRadius = 6378137;
  const originLat = (points.reduce((sum, point) => sum + point.lat, 0) / points.length * Math.PI) / 180;
  const projected = points.map((point) => ({
    x: earthRadius * (point.lng * Math.PI / 180) * Math.cos(originLat),
    y: earthRadius * (point.lat * Math.PI / 180)
  }));

  const doubleArea = projected.reduce((sum, point, index) => {
    const next = projected[(index + 1) % projected.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(doubleArea / 2);
}

function formatHectares(value) {
  return Number(value).toLocaleString('es-AR', {
    maximumFractionDigits: 2
  });
}

function getPreviousCampaignOptions(date = new Date()) {
  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth() + 1;
  const firstEnabledYear = currentMonth >= 6 ? currentYear : currentYear - 1;

  return Array.from({ length: 3 }, (_, index) => {
    const year = firstEnabledYear - index;
    return `${year - 1}-${year}`;
  });
}

function formFromLote(lote) {
  return {
    nombre: lote?.nombre ?? '',
    pais: lote?.pais ?? 'Argentina',
    provincia: lote?.provincia ?? emptyForm.provincia,
    ciudad: lote?.ciudad ?? '',
    condicion: lote?.condicion ?? 'Propio',
    cultivoAnterior: lote?.cultivoAnterior ?? '',
    cultivoAnteriorCampania: lote?.cultivoAnteriorCampania ?? '',
    coordenadas: (lote?.coordenadas ?? [])
      .slice()
      .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
      .map((point) => ({
        lat: Number(point.latitud),
        lng: Number(point.longitud)
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    cerrado: (lote?.coordenadas ?? []).length >= 3
  };
}

function lotePayloadFromForm(form, areaHa, areaM2, empresaId = null) {
  return {
    ...(empresaId ? { empresaId: Number(empresaId) } : {}),
    nombre: form.nombre,
    pais: form.pais,
    provincia: form.provincia,
    ciudad: form.ciudad,
    condicion: form.condicion,
    cultivoAnterior: form.cultivoAnterior,
    cultivoAnteriorCampania: form.cultivoAnteriorCampania,
    hectareas: Number(areaHa.toFixed(4)),
    superficieTotal: Number(areaM2.toFixed(4)),
    coordenadas: form.coordenadas.map((point, index) => ({
      orden: index + 1,
      latitud: Number(point.lat.toFixed(6)),
      longitud: Number(point.lng.toFixed(6))
    }))
  };
}

function normalizeLoteFormForComparison(form, areaHa, areaM2) {
  return {
    nombre: form.nombre.trim(),
    pais: form.pais.trim(),
    provincia: form.provincia.trim(),
    ciudad: form.ciudad.trim(),
    condicion: form.condicion.trim(),
    cultivoAnterior: form.cultivoAnterior.trim(),
    cultivoAnteriorCampania: form.cultivoAnteriorCampania.trim(),
    cerrado: Boolean(form.cerrado),
    hectareas: Number(areaHa.toFixed(4)),
    superficieTotal: Number(areaM2.toFixed(4)),
    coordenadas: form.coordenadas.map((point) => ({
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6))
    }))
  };
}

function hasLoteFormChanges(lote, form, areaHa, areaM2) {
  if (!lote) return false;

  const originalForm = formFromLote(lote);
  const originalAreaM2 = polygonAreaSquareMeters(originalForm.coordenadas);
  const originalAreaHa = originalAreaM2 / 10000;
  const originalValue = normalizeLoteFormForComparison(originalForm, originalAreaHa, originalAreaM2);
  const currentValue = normalizeLoteFormForComparison(form, areaHa, areaM2);

  return JSON.stringify(originalValue) !== JSON.stringify(currentValue);
}

function moveArrayItem(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const reorderedItems = [...items];
  const [movedItem] = reorderedItems.splice(fromIndex, 1);
  reorderedItems.splice(toIndex, 0, movedItem);
  return reorderedItems;
}

export { emptyForm, distanceMeters, polygonAreaSquareMeters, formatHectares, getPreviousCampaignOptions, formFromLote, lotePayloadFromForm, hasLoteFormChanges, moveArrayItem };
