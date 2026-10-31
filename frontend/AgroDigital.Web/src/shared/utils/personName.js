function formatPersonName(value) {
  return value
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s'-])([a-záéíóúñ])/g, (_, separator, letter) => `${separator}${letter.toLocaleUpperCase('es-AR')}`);
}

export { formatPersonName };
