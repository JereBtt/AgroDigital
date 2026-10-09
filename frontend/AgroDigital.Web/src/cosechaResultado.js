function positivo(valor) {
  return valor !== '' && valor != null && Number.isFinite(Number(valor)) && Number(valor) > 0;
}

export function calcularKgCosechados(rindeKgHa, hectareas) {
  return positivo(rindeKgHa) && positivo(hectareas)
    ? String(Number((Number(rindeKgHa) * Number(hectareas)).toFixed(4)))
    : '';
}

export function calcularRindeKgHa(kgCosechados, hectareas) {
  return positivo(kgCosechados) && positivo(hectareas)
    ? String(Number((Number(kgCosechados) / Number(hectareas)).toFixed(4)))
    : '';
}
