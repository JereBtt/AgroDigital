export const normalizar = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export const granoTexto = (v) => ({ maiz: 'Maíz', soja: 'Soja', trigo: 'Trigo', sorgo: 'Sorgo', girasol: 'Girasol' }[normalizar(v)] || v || 'Sin dato');
export const claveLote = (r) => JSON.stringify([r.loteId, r.campania, r.ciclo || 'Sin dato']);
export const valido = (n) => n != null && Number.isFinite(Number(n));
export const suma = (rows, field) => rows.reduce((n, r) => n + (valido(r[field]) ? Number(r[field]) : 0), 0);
export function agrupar(rows, key) {
  const groups = new Map();
  rows.forEach(r => { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  return [...groups.entries()];
}
export function filtrar(rows, f) {
  return rows.filter(r => (!f.campanias?.length || f.campanias.includes(r.campania))
    && (!f.ciclo || r.ciclo === f.ciclo)
    && (!f.grano || normalizar(r.grano) === f.grano)
    && (!f.lote || String(r.loteId) === f.lote)
    && (!f.epoca || r.epoca === f.epoca)
    && (!f.cicloCultivo || r.cicloCultivo === f.cicloCultivo)
    && (!f.variedad || normalizar(r.variedad) === f.variedad));
}
export function resumirRindes(rows, key, base = 'humedo') {
  const validas = rows.filter(r => r.estado === 'Finalizado' && Number(r.ha) > 0
    && (base === 'seco' ? valido(r.rindeSeco) : valido(r.kg)));
  return agrupar(validas, key).map(([id, items]) => {
    const ha = suma(items, 'ha');
    const kg = items.reduce((n, r) => n + (base === 'seco' ? Number(r.rindeSeco) * Number(r.ha) : Number(r.kg)), 0);
    return { ...items[0], id, ha, kg, rinde: kg / ha, registros: items.length, lotes: new Set(items.map(r => r.loteId)).size };
  });
}
export function resumirParticipacionGranos(rows, base = 'humedo') {
  const finalizadas = rows.filter(r => r.estado === 'Finalizado' && Number(r.ha) > 0);
  return agrupar(finalizadas, r => normalizar(r.grano)).map(([id, items]) => {
    const conPeso = items.filter(r => valido(r.kg) && Number(r.kg) >= 0);
    const conRinde = base === 'seco'
      ? items.filter(r => valido(r.rindeSeco) && Number(r.rindeSeco) >= 0)
      : conPeso;
    const haRinde = suma(conRinde, 'ha');
    const kgRinde = base === 'seco'
      ? conRinde.reduce((total, r) => total + Number(r.rindeSeco) * Number(r.ha), 0)
      : suma(conPeso, 'kg');
    return { id, grano: items[0].grano, ha: suma(items, 'ha'),
      kg: conPeso.length ? suma(conPeso, 'kg') : null,
      rinde: haRinde ? kgRinde / haRinde : null };
  });
}
export function calcularSiniestros(data, f) {
  const siembras = filtrar(data.siembras, f);
  const porId = new Map(data.siembras.map(s => [s.id, s]));
  const unidades = agrupar(siembras, claveLote);
  const todasLasEtapas = new Map(agrupar(data.siembras, claveLote));
  const unidadesResembradas = new Set(data.siembras.filter(s => s.tipo === 'Resiembra').map(claveLote));
  const categorias = { sinResiembra: [], resiembra: [], total: [] };
  const causasPorTipo = new Map();
  let afectados = 0;
  unidades.forEach(([id, etapas]) => {
    const cadena = todasLasEtapas.get(id);
    const etapaIds = new Set(cadena.map(s => s.id));
    const hechos = data.siniestros.filter(r => etapaIds.has(r.siembraId))
      .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || Number(a.id || 0) - Number(b.id || 0));
    const ultimaEtapa = cadena.reduce((ultima, etapa) => !ultima || Number(etapa.id) > Number(ultima.id) ? etapa : ultima, null);
    const perdidaTotal = ultimaEtapa?.deshabilitada && ultimaEtapa.motivoBaja === 'Siniestro';
    if (!hechos.length && !perdidaTotal) return;
    afectados++;
    const siniestros = new Map();
    const cultivos = new Map();
    const agregar = (map, valor) => { if (normalizar(valor)) map.set(normalizar(valor), valor); };
    hechos.forEach(r => {
      agregar(siniestros, r.siniestro);
      agregar(cultivos, r.cultivo || porId.get(r.siembraId)?.grano);
    });
    if (perdidaTotal) {
      // La causa de la baja queda última aun si ya existía una recorrida del mismo tipo.
      siniestros.delete(normalizar(ultimaEtapa.siniestroBaja));
      agregar(siniestros, ultimaEtapa.siniestroBaja);
      if (!hechos.length) agregar(cultivos, ultimaEtapa.grano);
    }
    siniestros.forEach((nombre, causa) => {
      if (!causasPorTipo.has(causa)) causasPorTipo.set(causa, { id: causa, nombre, cantidad: 0 });
      causasPorTipo.get(causa).cantidad++;
    });
    const categoria = perdidaTotal ? 'total' : unidadesResembradas.has(id) ? 'resiembra' : 'sinResiembra';
    categorias[categoria].push({ ...etapas[0], id,
      cultivos: [...cultivos.values()], siniestros: [...siniestros.values()] });
  });
  const ranking = [...causasPorTipo.values()].map(r => ({ ...r, porcentaje: unidades.length ? r.cantidad / unidades.length * 100 : 0 })).sort((a, b) => b.cantidad - a.cantidad);
  return { ranking, categorias, total: unidades.length, afectados, porcentaje: unidades.length ? afectados / unidades.length * 100 : null };
}
export function calcularSuperficie(data, f) {
  const siembras = filtrar(data.siembras, f);
  // La última etapa describe la superficie que quedó cultivada en ese ciclo.
  const bases = [...siembras, ...(!f.epoca && !f.cicloCultivo && !f.variedad ? filtrar(data.planes, f) : [])];
  const lotes = new Map(data.lotes.map(l => [l.id, l]));
  return agrupar(bases, claveLote).map(([id, rows]) => {
    const l = lotes.get(rows[0].loteId);
    const etapas = siembras.filter(s => claveLote(s) === id);
    const total = Number(l?.superficie || l?.cultivables || 0);
    const ultima = etapas.reduce((vigente, etapa) => !vigente || Number(etapa.id ?? 0) >= Number(vigente.id ?? 0) ? etapa : vigente, null);
    const sembradas = Math.max(0, Number(ultima?.ha) || 0);
    return { ...rows[0], id, nombre: l?.nombre || 'Sin lote', zona: l?.zona || 'Sin zona', provincia: l?.provincia || '', total,
      trabajadas: Math.min(total, sembradas), sinTrabajar: Math.max(0, total - sembradas), excedida: sembradas > total + 0.05 };
  });
}
export function productividad(rows) {
  const validas = rows.filter(r => r.estado === 'Finalizado' && Number(r.ha) > 0 && Number(r.haHora) > 0);
  const ha = suma(validas, 'ha');
  const horas = validas.reduce((n, r) => n + Number(r.ha) / Number(r.haHora), 0);
  return { valor: horas ? ha / horas : null, ha, horas, registros: validas.length };
}
export function desvioDias(r) {
  if (!r.finReal || !r.finTentativo) return null;
  return Math.round((Date.parse(r.finReal.slice(0, 10) + 'T00:00:00Z') - Date.parse(r.finTentativo.slice(0, 10) + 'T00:00:00Z')) / 86400000);
}

export function construirFlujoPlanificacion(rows) {
  const fechaValida = value => {
    const day = String(value ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? day : null;
  };
  const eventos = new Map();
  let excluidos = 0;
  for (const row of rows) {
    const prevista = fechaValida(row.finTentativo);
    if (!prevista) { excluidos++; continue; }
    const plan = eventos.get(prevista) || { esperado: 0, real: 0 };
    plan.esperado++;
    eventos.set(prevista, plan);
    const terminada = row.estado === 'Finalizado' ? fechaValida(row.finReal) : null;
    if (terminada) {
      const actual = eventos.get(terminada) || { esperado: 0, real: 0 };
      actual.real++;
      eventos.set(terminada, actual);
    }
  }
  let esperado = 0;
  let real = 0;
  const puntos = [...eventos].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, evento]) => {
    esperado += evento.esperado;
    real += evento.real;
    return { fecha, esperado, real };
  });
  return { puntos, totalPrevisto: esperado, totalReal: real, excluidos };
}
