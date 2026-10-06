export const RANGOS_DENSIDAD_SIEMBRA = {
  maiz: [50000, 100000], soja: [250000, 500000], sorgo: [180000, 320000],
  "sorgo granifero": [180000, 320000], trigo: [2000000, 4500000], girasol: [35000, 70000]
};

export const RANGOS_PMG = {
  soja: [130, 220], maiz: [220, 400], sorgo: [20, 40],
  "sorgo granifero": [20, 40], trigo: [30, 50], girasol: [40, 80]
};

export const RANGOS_PROFUNDIDAD = {
  soja: [3, 5], maiz: [4, 8], sorgo: [4, 5],
  "sorgo granifero": [4, 5], trigo: [2, 4], girasol: [3, 6]
};

export const RANGOS_UREA = {
  soja: [0, 100], maiz: [0, 400], sorgo: [0, 300],
  "sorgo granifero": [0, 300], trigo: [0, 300], girasol: [0, 250]
};

export function fueraDeRangoOrientativo(value, rango) {
  const numero = Number(value);
  return Boolean(rango && value !== "" && value != null && Number.isFinite(numero) && numero > 0 && (numero < rango[0] || numero > rango[1]));
}
