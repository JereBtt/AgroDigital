function positivo(valor) {
  return valor !== '' && valor != null && Number.isFinite(Number(valor)) && Number(valor) > 0;
}

export function calcularKgCosechados(rindeKgHa, hectareas) {
  return positivo(rindeKgHa) && positivo(hectareas)
    ? String(Math.round(Number(rindeKgHa) * Number(hectareas)))
    : '';
}

export function calcularRindeKgHa(kgCosechados, hectareas) {
  return positivo(kgCosechados) && positivo(hectareas)
    ? String(Math.round(Number(kgCosechados) / Number(hectareas)))
    : '';
}

export function parsearEnteroConMiles(texto) {
  return String(texto ?? '').split(',')[0].replace(/\./g, '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

export function formatearEnteroConMiles(valor) {
  return valor === '' || valor == null ? '' : Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}
