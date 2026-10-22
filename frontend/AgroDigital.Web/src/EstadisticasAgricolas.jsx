import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { agrupar, calcularSiniestros, calcularSuperficie, construirFlujoPlanificacion, desvioDias, filtrar, granoTexto, normalizar, productividad, resumirParticipacionGranos, resumirRindes, suma } from './estadisticasAgricolas.js';
import './estadisticasAgricolas.css';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const n = (v, d = 1) => v == null ? 'Sin datos' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: d });
const colors = ['#218943', '#d99b24', '#4389b0', '#9265b4', '#d56f45', '#4b9b91'];
const fecha = v => v ? v.slice(0, 10).split('-').reverse().join('/') : '—';
function Card({ title, note, children, wide = false }) {
  return <section className={`dashboard-card agr-card ${wide ? 'agr-wide' : ''}`}><h2>{title}</h2>{note && <p className="agr-note">{note}</p>}{children}</section>;
}
function Empty() { return <p className="est-sin-datos">No hay registros suficientes para estos filtros.</p>; }
function Bars({ rows, unit = '', decimals = 1 }) {
  const max = Math.max(0, ...rows.map(r => r.value || 0));
  if (!rows.length) return <Empty />;
  return <div className="agr-bars">{rows.map((r, i) => <div className="agr-bar-row" key={r.id ?? i}>
    <div><span>{r.label}</span><strong>{n(r.value, decimals)} {unit}</strong></div>
    <div className="agr-bar-track"><span style={{ width: `${max ? r.value / max * 100 : 0}%`, background: r.color || colors[i % colors.length] }} /></div>
    {r.detail && <small>{r.detail}</small>}
  </div>)}</div>;
}
function Table({ headers, rows }) {
  if (!rows.length) return <Empty />;
  return <div className="agr-table"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
function Kpis({ items }) {
  return <div className="agr-kpis">{items.map(([label, value, note]) => <article className="dashboard-card" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</div>;
}
function pieSegmentPath(start, end) {
  const point = angle => {
    const radians = angle * Math.PI / 180;
    return [110 + 100 * Math.cos(radians), 110 + 100 * Math.sin(radians)];
  };
  const [x1, y1] = point(start);
  const [x2, y2] = point(end);
  return `M 110 110 L ${x1} ${y1} A 100 100 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}
function Pie({ rows, base }) {
  const [hovered, setHovered] = useState(null);
  const total = suma(rows, 'ha');
  if (!total) return <Empty />;
  let start = -90;
  const segments = rows.map((row, index) => {
    const from = start;
    start += row.ha / total * 360;
    return { row, index, from, to: start };
  });
  const showValues = (event, index) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;
    setHovered({ index, left: Math.max(8, Math.min(x + 14, window.innerWidth - 270)), top: Math.max(8, Math.min(y + 14, window.innerHeight - 170)) });
  };
  const active = hovered && rows[hovered.index];
  return <div className="agr-pie-layout"><svg className="agr-pie" viewBox="0 0 220 220" role="img" aria-label="Participación de cada grano en las hectáreas cosechadas. Enfocá cada porción para consultar sus valores.">
      {segments.map(({ row, index, from, to }) => {
        const label = `${granoTexto(row.grano)}: ${n(row.ha)} ha, ${n(row.ha / total * 100)} % de la superficie, ${row.kg == null ? 'sin kg registrados' : `${n(row.kg, 0)} kg`}, rinde ${row.rinde == null ? 'sin datos' : `${n(row.rinde, 0)} kg/ha`}`;
        const props = { key: row.id ?? index, className: 'agr-pie-slice', fill: colors[index % colors.length], tabIndex: 0, role: 'img', 'aria-label': label, 'aria-describedby': hovered?.index === index ? 'agr-pie-tooltip' : undefined, onMouseEnter: event => showValues(event, index), onMouseMove: event => showValues(event, index), onMouseLeave: () => setHovered(null), onFocus: event => showValues(event, index), onBlur: () => setHovered(null) };
        return to - from >= 359.999 ? <circle {...props} cx="110" cy="110" r="100" /> : <path {...props} d={pieSegmentPath(from, to)} />;
      })}
    </svg>
    {active && createPortal(<div id="agr-pie-tooltip" className="agr-pie-tooltip" role="tooltip" style={{ left: hovered.left, top: hovered.top }}>
      <strong>{granoTexto(active.grano)}</strong>
      <span>Hectáreas cosechadas: {n(active.ha)} ha</span>
      <span>Participación: {n(active.ha / total * 100)} %</span>
      <span>Kg cosechados: {active.kg == null ? 'Sin datos' : `${n(active.kg, 0)} kg`}</span>
      <span>Rinde promedio {base === 'seco' ? 'seco' : 'húmedo'}: {active.rinde == null ? 'Sin datos' : `${n(active.rinde, 0)} kg/ha`}</span>
    </div>, document.body)}
    <Table headers={['Grano', 'Hectáreas cosechadas', 'Kg cosechados', `Rinde promedio ${base === 'seco' ? 'seco' : 'húmedo'}`, 'Participación']} rows={rows.map((r, i) => [<span><i className="agr-dot" style={{ background: colors[i % colors.length] }} />{granoTexto(r.grano)}</span>, `${n(r.ha)} ha`, r.kg == null ? 'Sin datos' : `${n(r.kg, 0)} kg`, r.rinde == null ? 'Sin datos' : `${n(r.rinde, 0)} kg/ha`, `${n(r.ha / total * 100)} %`])} /></div>;
}

function FlujoPlanificacion({ rows }) {
  const [tooltip, setTooltip] = useState(null);
  const tooltipTimer = useRef(null);
  useEffect(() => () => clearTimeout(tooltipTimer.current), []);
  const { puntos, totalPrevisto, totalReal, excluidos } = construirFlujoPlanificacion(rows);
  if (!puntos.length) return <Empty />;
  const width = 1000;
  const left = 52;
  const right = 22;
  const top = 22;
  const bottom = 248;
  const first = Date.parse(`${puntos[0].fecha}T00:00:00Z`) - 86400000;
  const last = Math.max(first + 2 * 86400000, Date.parse(`${puntos.at(-1).fecha}T00:00:00Z`));
  const x = day => left + (Date.parse(`${day}T00:00:00Z`) - first) / (last - first) * (width - left - right);
  const y = count => bottom - count / Math.max(1, totalPrevisto) * (bottom - top);
  const path = key => puntos.reduce((d, point) => `${d} H ${x(point.fecha)} V ${y(point[key])}`, `M ${left} ${y(0)}`);
  const max = Math.max(1, totalPrevisto);
  const step = Math.max(1, Math.ceil(max / 4));
  const ticks = [...new Set([0, ...Array.from({ length: Math.ceil(max / step) }, (_, i) => Math.min(max, (i + 1) * step)), max])];
  const dateTicks = Array.from({ length: 5 }, (_, i) => new Date(first + (last - first) * i / 4).toISOString().slice(0, 10));
  const mostrarTooltip = (event, serie, day, items, delay = 700) => {
    clearTimeout(tooltipTimer.current);
    setTooltip(null);
    const target = event.currentTarget;
    tooltipTimer.current = setTimeout(() => {
      const rect = target.getBoundingClientRect();
      setTooltip({ serie, day, items, left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(360, window.innerWidth - 24) - 12)), top: Math.max(12, Math.min(rect.bottom + 12, window.innerHeight - Math.min(330, window.innerHeight - 24) - 12)) });
    }, delay);
  };
  const ocultarTooltip = () => { clearTimeout(tooltipTimer.current); setTooltip(null); };
  return <div className="agr-flow">
    <div className="agr-flow-head"><div className="agr-flow-legend"><span><i className="agr-flow-key agr-flow-expected" />Flujo esperado</span><span><i className="agr-flow-key agr-flow-actual" />Flujo real</span></div><p>{totalReal} de {totalPrevisto} operaciones finalizadas</p></div>
    <div className="agr-flow-scroll"><svg className="agr-flow-chart" viewBox={`0 0 ${width} 292`} role="img" aria-label={`Flujo acumulado de operaciones por fecha: ${totalPrevisto} planificadas y ${totalReal} finalizadas. La línea naranja representa las fechas tentativas y la azul las fechas reales.`}>
      {ticks.map(value => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#e1ebe4" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="agr-flow-axis">{value}</text></g>)}
      {dateTicks.map((day, i) => <text key={i} x={left + (width - left - right) * i / 4} y={bottom + 25} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} className="agr-flow-axis">{fecha(day)}</text>)}
      <path d={path('esperado')} fill="none" stroke="#d97706" strokeWidth="4" strokeLinejoin="round" />
      <path d={path('real')} fill="none" stroke="#1d4ed8" strokeWidth="4" strokeDasharray="9 7" strokeLinejoin="round" />
      {puntos.map(point => {
        const previstas = rows.filter(r => r.finTentativo?.slice(0, 10) === point.fecha);
        const reales = rows.filter(r => r.estado === 'Finalizado' && r.finTentativo && r.finReal?.slice(0, 10) === point.fecha);
        const coinciden = point.esperado === point.real && previstas.length && reales.length;
        return <g key={point.fecha}>
          {previstas.length > 0 && <circle className="agr-flow-point agr-flow-point-expected" cx={x(point.fecha) - (coinciden ? 6 : 0)} cy={y(point.esperado)} r="6" tabIndex="0" aria-label={`Flujo esperado el ${fecha(point.fecha)}: ${previstas.length} operaciones. Ver fechas tentativas y reales.`} onMouseEnter={e => mostrarTooltip(e, 'esperado', point.fecha, previstas)} onMouseLeave={ocultarTooltip} onFocus={e => mostrarTooltip(e, 'esperado', point.fecha, previstas, 0)} onBlur={ocultarTooltip} />}
          {reales.length > 0 && <circle className="agr-flow-point agr-flow-point-actual" cx={x(point.fecha) + (coinciden ? 6 : 0)} cy={y(point.real)} r="6" tabIndex="0" aria-label={`Flujo real el ${fecha(point.fecha)}: ${reales.length} operaciones. Ver fechas tentativas y reales.`} onMouseEnter={e => mostrarTooltip(e, 'real', point.fecha, reales)} onMouseLeave={ocultarTooltip} onFocus={e => mostrarTooltip(e, 'real', point.fecha, reales, 0)} onBlur={ocultarTooltip} />}
        </g>;
      })}
    </svg></div>
    {tooltip && createPortal(<div className="agr-flow-tooltip" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}><strong>{tooltip.serie === 'esperado' ? 'Flujo esperado' : 'Flujo real'} · {fecha(tooltip.day)}</strong><span>{tooltip.items.length} {tooltip.items.length === 1 ? 'operación' : 'operaciones'} en este punto</span><div className="agr-flow-tooltip-items">{tooltip.items.map((r, i) => <div key={`${r.operacion}-${r.id ?? i}`}><b>{r.operacion} · {r.nombre}</b>{r.loteNombre && <span>Lote: {r.loteNombre}</span>}<span>Cultivo: {r.grano ? granoTexto(r.grano) : 'Sin dato'}</span><span>Fin tentativo: {fecha(r.finTentativo)}</span><span>Fin real: {r.estado === 'Finalizado' ? fecha(r.finReal) : 'Pendiente'}</span>{r.motivoDesvio?.trim() && <span>Motivo del desvío: {r.motivoDesvio.trim()}</span>}</div>)}</div></div>, document.body)}
    <p className="agr-flow-caption">Cada salto representa una operación. Las pendientes avanzan solo en la línea esperada.{excluidos > 0 ? ` ${excluidos} registro(s) sin fecha tentativa quedaron fuera del gráfico.` : ''}</p>
  </div>;
}

export default function EstadisticasAgricolas({ session, empresaId, tab }) {
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [comparar, setComparar] = useState(false);
  const [campanias, setCampanias] = useState([]);
  const [ciclo, setCiclo] = useState('Verano');
  const [grano, setGrano] = useState('');
  const [lote, setLote] = useState('');
  const [epoca, setEpoca] = useState('');
  const [cicloCultivo, setCicloCultivo] = useState('');
  const [variedad, setVariedad] = useState('');
  const [base, setBase] = useState('humedo');
  const [cruzar, setCruzar] = useState(false);
  const [operacion, setOperacion] = useState('siembra');
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(null); setError('');
    setGrano(''); setLote(''); setEpoca(''); setCicloCultivo(''); setVariedad('');
    fetch(`${API}/api/estadisticas/agricolas?empresaId=${encodeURIComponent(empresaId)}`, {
      headers: { Authorization: `Bearer ${session.token}` }, signal: controller.signal
    }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }).then(data => {
      if (controller.signal.aborted) return;
      // FOR JSON omite las listas vacías: se completan para mostrar KPIs en 0 / Sin datos.
      for (const k of ['lotes', 'siembras', 'cosechas', 'siniestros', 'planes']) data[k] ??= [];
      const periods = [...new Set([...data.siembras, ...data.cosechas, ...data.planes].map(r => r.campania).filter(Boolean))].sort().reverse();
      setCampanias(periods.slice(0, 1)); setLoaded({ empresaId, data });
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [empresaId, session.token, retry]);
  const data = loaded?.empresaId === empresaId ? loaded.data : null;
  const filtros = { campanias, ciclo, grano, lote, epoca, cicloCultivo, variedad };
  const cultivos = useMemo(() => data ? [...new Set([...data.siembras, ...data.cosechas].map(r => normalizar(r.grano)).filter(Boolean))].sort() : [], [data]);
  if (error) return <section className="dashboard-card agr-card"><p role="alert" className="alm-error">No se pudieron cargar las estadísticas: {error}</p><button type="button" className="clear-button" onClick={() => setRetry(v => v + 1)}>Reintentar</button></section>;
  if (!data) return <div className="loading-state" role="status">Cargando datos agrícolas…</div>;
  const periodos = [...new Set([...data.siembras, ...data.cosechas, ...data.planes].map(r => r.campania).filter(Boolean))].sort().reverse();
  if (!periodos.length) return <Card title="Sin actividad agrícola"><p>Registrá campañas, siembras y cosechas en esta empresa para comenzar a comparar.</p></Card>;
  const variedades = [...new Set(data.siembras.filter(r => !grano || normalizar(r.grano) === grano).map(r => normalizar(r.variedad)).filter(Boolean))].sort();
  const epocas = grano === 'soja' ? ['Primera', 'Segunda'] : grano === 'maiz' ? ['Temprano', 'Tardío'] : !grano ? ['Primera', 'Segunda', 'Temprano', 'Tardío'] : [];
  const select = (label, value, change, options, all = 'Todos') => <label className="field"><span>{label}</span><select value={value} onChange={e => change(e.target.value)}><option value="">{all}</option>{options.map(([v, text]) => <option value={v} key={v}>{text}</option>)}</select></label>;
  const limpiar = () => { setComparar(false); setCampanias(periodos.slice(0, 1)); setCiclo('Verano'); setGrano(''); setLote(''); setEpoca(''); setCicloCultivo(''); setVariedad(''); };
  return <div className="agr-module">
    <section className="dashboard-card agr-filters" aria-label="Filtros de estadísticas agrícolas">
      <div className="agr-mode"><button type="button" className={!comparar ? 'active' : ''} onClick={() => { setComparar(false); setCampanias(c => c.slice(0, 1)); }}>Una campaña</button><button type="button" className={comparar ? 'active' : ''} onClick={() => { setComparar(true); setCampanias(periodos.slice(0, 3)); }}>Comparar campañas</button></div>
      <div className="agr-filter-grid">
        {comparar ? <fieldset className="agr-periods"><legend>Campañas a comparar</legend>{periodos.map(p => <label key={p}><input type="checkbox" checked={campanias.includes(p)} disabled={campanias.length === 1 && campanias.includes(p)} onChange={e => setCampanias(c => e.target.checked ? [...c, p] : c.filter(v => v !== p))} />{p}</label>)}</fieldset>
          : <label className="field"><span>Campaña</span><select value={campanias[0] || ''} onChange={e => setCampanias([e.target.value])}>{periodos.map(p => <option key={p}>{p}</option>)}</select></label>}
        {select('Ciclo estacional', ciclo, setCiclo, [['Verano', 'Verano'], ['Invierno', 'Invierno']], 'Todos los ciclos')}
        {select('Grano', grano, v => { setGrano(v); setEpoca(''); setVariedad(''); }, cultivos.map(v => [v, granoTexto(v)]))}
        {select('Lote', lote, setLote, data.lotes.map(l => [String(l.id), l.nombre]))}
        {select('Época de siembra', epoca, setEpoca, epocas.map(v => [v, v]), 'Todas')}
        {select('Ciclo del cultivo', cicloCultivo, setCicloCultivo, [['Corto', 'Corto'], ['Largo', 'Largo']])}
        {select('Variedad de semilla', variedad, setVariedad, variedades.map(v => [v, v.toUpperCase()]), 'Todas')}
        <button type="button" className="clear-button" onClick={limpiar}>Limpiar filtros</button>
      </div>
    </section>
    {tab === 'rinde' && <Rinde data={data} filtros={filtros} base={base} setBase={setBase} cruzar={cruzar} setCruzar={setCruzar} comparar={comparar} />}
    {tab === 'siniestros' && <Siniestros data={data} filtros={filtros} />}
    {tab === 'productividad' && <Productividad data={data} filtros={filtros} operacion={operacion} setOperacion={setOperacion} />}
  </div>;
}

function Rinde({ data, filtros, base, setBase, cruzar, setCruzar, comparar }) {
  const rows = filtrar(data.cosechas, filtros);
  const finalizadas = rows.filter(r => r.estado === 'Finalizado');
  const porCampania = resumirRindes(rows, r => JSON.stringify([r.campania, normalizar(r.grano)]), base).sort((a, b) => a.campania.localeCompare(b.campania));
  const volumen = resumirRindes(rows, r => JSON.stringify([r.campania, normalizar(r.grano)]));
  const porGrano = resumirParticipacionGranos(rows, base);
  const ranking = resumirRindes(rows, r => JSON.stringify([r.campania, normalizar(r.grano), r.loteId]), base);
  const lotes = new Map(data.lotes.map(l => [l.id, l.nombre]));
  const cruces = resumirRindes(rows, r => JSON.stringify([r.campania, normalizar(r.grano), r.epoca || 'Sin dato', ...(cruzar ? [r.cicloCultivo || 'Sin dato', normalizar(r.variedad) || 'Sin dato'] : [])]), base);
  const excluidas = finalizadas.length - suma(porCampania, 'registros');
  return <>
    <Kpis items={[["Total cosechado", `${n(suma(volumen, 'kg'), 0)} kg`, 'Peso registrado al finalizar'], ['Superficie cosechada', `${n(suma(volumen, 'ha'))} ha`, 'Cosechas con resultado válido'], ['Cosechas finalizadas', n(finalizadas.length, 0), `${rows.length - finalizadas.length} en curso excluidas del rinde`]]} />
    <div className="agr-controls"><label>Rinde a comparar <select value={base} onChange={e => setBase(e.target.value)}><option value="humedo">Húmedo (kg registrados ÷ ha)</option><option value="seco">Seco (a humedad base)</option></select></label><p>Promedio ponderado por superficie: suma de kg ÷ suma de ha. Compará siempre dentro del mismo grano.</p></div>
    {excluidas > 0 && <p className="agr-notice">{excluidas} cosecha(s) sin superficie o rinde válido quedaron fuera de esta comparación; no se interpretan como cero.</p>}
    <div className="agr-grid">
      {agrupar(porCampania, r => normalizar(r.grano)).map(([g, items]) => <Card key={g} title={`Rinde ${base === 'humedo' ? 'húmedo' : 'seco'} · ${granoTexto(g)}`} note="Cada barra representa una campaña; incluye solo cosechas finalizadas."><Bars unit="kg/ha" decimals={0} rows={items.map(r => ({ id: r.id, label: r.campania, value: r.rinde, detail: `${n(r.ha)} ha · ${r.lotes} lotes · ${r.registros} cosechas` }))} /></Card>)}
      {!porCampania.length && <Card title="Rinde por campaña"><Empty /></Card>}
      {agrupar(volumen, r => normalizar(r.grano)).map(([g, items]) => <Card key={`kg-${g}`} title={`Producción total · ${granoTexto(g)}`} note="Kilos registrados, sin ajuste de humedad."><Bars unit="kg" decimals={0} rows={items.sort((a, b) => a.campania.localeCompare(b.campania)).map(r => ({ id: r.id, label: r.campania, value: r.kg, detail: `${n(r.ha)} ha cosechadas` }))} /></Card>)}
      {!comparar && <Card title="Participación de los granos" note="Porcentaje sobre las hectáreas cosechadas. Los kg son los registrados sin ajuste de humedad; el rinde sigue la base seleccionada." wide><Pie rows={porGrano} base={base} /></Card>}
      {agrupar(ranking, r => normalizar(r.grano)).map(([g, items]) => <Card key={`top-${g}`} title={`Mejores rindes · ${granoTexto(g)}`} note="Hasta 10 combinaciones de lote y campaña, ordenadas por kg/ha."><Bars unit="kg/ha" decimals={0} rows={items.sort((a, b) => b.rinde - a.rinde).slice(0, 10).map(r => ({ id: r.id, label: `${lotes.get(r.loteId)} · ${r.campania}`, value: r.rinde, detail: `${n(r.ha)} ha cosechadas` }))} /></Card>)}
      <Card title="Comparativa por época de siembra" note="Comparación descriptiva: las diferencias también pueden depender del lote, clima y manejo." wide>
        <label className="agr-check"><input type="checkbox" checked={cruzar} onChange={e => setCruzar(e.target.checked)} />Cruzar también ciclo del cultivo y variedad de semilla</label>
        <Table headers={['Campaña', 'Grano', 'Época', ...(cruzar ? ['Ciclo', 'Variedad'] : []), 'Lotes', 'Ha', `Rinde ${base === 'humedo' ? 'húmedo' : 'seco'} (kg/ha)`]} rows={cruces.sort((a, b) => a.campania.localeCompare(b.campania) || normalizar(a.grano).localeCompare(normalizar(b.grano)) || String(a.epoca).localeCompare(String(b.epoca))).map(r => [r.campania, granoTexto(r.grano), r.epoca || 'Sin dato', ...(cruzar ? [r.cicloCultivo || 'Sin dato', r.variedad || 'Sin dato'] : []), r.lotes, n(r.ha), n(r.rinde, 0)])} />
      </Card>
    </div>
  </>;
}

function Siniestros({ data, filtros }) {
  const result = calcularSiniestros(data, filtros);
  const lotes = new Map(data.lotes.map(l => [l.id, l.nombre]));
  const categorias = [['sinResiembra', 'Afectados sin resiembra'], ['resiembra', 'Afectados con resiembra'], ['total', 'Pérdida total']];
  return <><Kpis items={[["Lotes evaluados", n(result.total, 0), 'Una unidad por lote, campaña y ciclo'], ['Lotes con siniestros', n(result.afectados, 0), 'Cada unidad se cuenta una sola vez'], ['Índice de siniestralidad', result.porcentaje == null ? 'Sin datos' : `${n(result.porcentaje)} %`, 'Lotes afectados ÷ lotes con siembra']]} />
    <div className="agr-grid"><Card title="Siniestros con mayor incidencia" note="% de lotes-campaña-ciclo con ese siniestro sobre todos los evaluados. Un lote puede sufrir varios tipos; los porcentajes no se suman." wide><Bars unit="%" rows={result.ranking.map(r => ({ id: r.id, label: r.nombre, value: r.porcentaje, detail: `${r.cantidad} de ${result.total} unidades afectadas` }))} /></Card>
      {categorias.map(([key, title]) => <Card key={key} title={title} note={`${result.categorias[key].length} ${result.categorias[key].length === 1 ? 'unidad' : 'unidades'} · ${n(result.afectados ? result.categorias[key].length / result.afectados * 100 : 0)} % de los afectados${key === 'total' ? ' · Siembras deshabilitadas por siniestro' : ''}`}>
        <Table headers={['Lote', 'Campaña', 'Ciclo', 'Cultivo', 'Siniestro']} rows={result.categorias[key].map(r => [lotes.get(r.loteId), r.campania, r.ciclo, r.cultivos.map(granoTexto).join(', ') || 'Sin dato', r.siniestros.join(', ') || 'Sin dato'])} />
      </Card>)}
    </div><p className="agr-note">Cada lote-campaña-ciclo afectado aparece una sola vez: pérdida total si su última siembra o resiembra fue deshabilitada por un siniestro, aunque antes se haya resembrado; con resiembra si volvió a sembrarse y no terminó en pérdida total; en los demás casos, afectado sin resiembra. El alcance Parcial o Total de la recorrida no define la categoría. Se muestran todos los siniestros de la cadena en orden; en pérdida total, el último es el que causó la baja. El alcance no permite calcular un porcentaje de kilos perdidos.</p>
  </>;
}

function Productividad({ data, filtros, operacion, setOperacion }) {
  const sembradas = filtrar(data.siembras, filtros);
  const cosechadas = filtrar(data.cosechas, filtros);
  const registros = operacion === 'siembra' ? sembradas : cosechadas;
  const resumen = productividad(registros);
  const superficies = calcularSuperficie(data, filtros);
  const lotes = new Map(data.lotes.map(l => [l.id, l]));
  const trazabilidad = [...sembradas.map(r => ({ ...r, operacion: r.tipo || 'Siembra', loteNombre: lotes.get(r.loteId)?.nombre })), ...cosechadas.map(r => ({ ...r, operacion: 'Cosecha', loteNombre: lotes.get(r.loteId)?.nombre }))].sort((a, b) => a.loteId - b.loteId || String(a.inicio).localeCompare(String(b.inicio)));
  const conFechas = registros.filter(r => r.estado === 'Finalizado' && desvioDias(r) != null);
  const enPlazo = conFechas.filter(r => desvioDias(r) <= 0).length;
  const ranking = agrupar(registros.filter(r => r.estado === 'Finalizado' && Number(r.haHora) > 0 && Number(r.ha) > 0), r => JSON.stringify([r.loteId, r.campania])).map(([id, rows]) => ({ id, ...rows[0], ...productividad(rows) })).sort((a, b) => b.valor - a.valor);
  const evolucion = agrupar(registros, r => r.campania).map(([id, rows]) => ({ id, label: id, ...productividad(rows) })).filter(r => r.valor != null).sort((a, b) => a.id.localeCompare(b.id));
  const superficiesTrabajadas = superficies.filter(r => r.trabajadas > 0);
  const zonas = agrupar(superficiesTrabajadas, r => JSON.stringify([r.provincia, r.zona])).map(([id, rows]) => ({ id, nombre: `${rows[0].zona}${rows[0].provincia ? ` · ${rows[0].provincia}` : ''}`, cantidad: new Set(rows.map(r => r.loteId)).size, ha: suma(rows, 'trabajadas') })).sort((a, b) => b.cantidad - a.cantidad);
  const puntos = agrupar(superficiesTrabajadas, r => r.loteId).map(([id, rows]) => ({ ...lotes.get(id), ha: suma(rows, 'trabajadas') }));
  const barraRanking = list => list.map(r => ({ id: `${r.loteId}-${r.campania}`, label: `${lotes.get(r.loteId)?.nombre} · ${r.campania}`, value: r.valor, detail: `${n(r.ha)} ha · ${r.registros} operaciones` }));
  return <>
    <div className="agr-controls"><label>Operación para productividad y cumplimiento <select value={operacion} onChange={e => setOperacion(e.target.value)}><option value="siembra">Siembra y resiembra</option><option value="cosecha">Cosecha</option></select></label></div>
    <Kpis items={[["Productividad ponderada", resumen.valor == null ? 'Sin datos' : `${n(resumen.valor, 2)} ha/h`, 'Ha totales ÷ horas estimadas (ha ÷ ha/h)'], ['Finalizadas en plazo', conFechas.length ? `${n(enPlazo / conFechas.length * 100)} %` : 'Sin datos', `${enPlazo} de ${conFechas.length} operaciones con ambas fechas`], ['Superficie cultivada', `${n(suma(superficies, 'trabajadas'))} ha`, 'Última siembra o resiembra de cada lote y ciclo']]} />
    <div className="agr-grid"><Card title="Cumplimiento de planificación y trazabilidad" note="Siembras, resiembras y cosechas de los filtros elegidos. Las líneas muestran cuántas operaciones deberían haberse completado y cuántas se completaron en cada fecha." wide>
      <FlujoPlanificacion rows={trazabilidad} />
      <details className="agr-flow-detail"><summary>Ver detalle de registros ({trazabilidad.length})</summary>
      <Table headers={['Lote', 'Campaña / ciclo', 'Registro', 'Inicio', 'Fin tentativo', 'Fin real', 'Cumplimiento']} rows={trazabilidad.map(r => {
        const dias = desvioDias(r);
        return [lotes.get(r.loteId)?.nombre, `${r.campania} · ${r.ciclo || 'Sin dato'}`, `${r.operacion} · ${r.nombre}${r.deshabilitada ? ' · Deshabilitada' : ''}`, fecha(r.inicio), fecha(r.finTentativo), fecha(r.finReal), r.estado !== 'Finalizado' ? 'En curso' : dias == null ? 'Sin fechas' : dias > 0 ? `${dias} días después` : dias < 0 ? `${Math.abs(dias)} días antes` : 'En fecha'];
      })} />
      </details>
    </Card>
    <Card title="Mayor superficie sin trabajar" note="Superficie total actual del lote menos hectáreas cultivadas en la última siembra o resiembra de cada campaña y ciclo. Incluye planes sin siembra.">
      <Bars unit="ha" rows={[...superficies].filter(r => r.sinTrabajar >= 0.05).sort((a, b) => b.sinTrabajar - a.sinTrabajar).slice(0, 10).map(r => ({ id: r.id, label: `${r.nombre} · ${r.campania} · ${r.ciclo}`, value: r.sinTrabajar, detail: `${n(r.trabajadas)} ha trabajadas de ${n(r.total)} ha` }))} />
      {superficies.some(r => r.excedida) && <p className="agr-notice">Hay superficies sembradas mayores al tamaño actual del lote; la cobertura se limita al tamaño actual.</p>}
    </Card>
    <Card title="Evolución de la productividad" note="Seleccioná Comparar campañas para ver la evolución. Las resiembras cuentan como trabajo adicional."><Bars unit="ha/h" decimals={2} rows={evolucion.map(r => ({ ...r, value: r.valor, detail: `${n(r.ha)} ha · ${r.registros} operaciones finalizadas` }))} /></Card>
    <Card title="Lotes con mayor productividad"><Bars unit="ha/h" decimals={2} rows={barraRanking(ranking.slice(0, 10))} /></Card>
    <Card title="Lotes con menor productividad"><Bars unit="ha/h" decimals={2} rows={barraRanking([...ranking].reverse().slice(0, 10))} /></Card>
    <Card title="Concentración y superficie por zona" note="Lotes distintos por zona. Al comparar campañas, las hectáreas son acumuladas por campaña y ciclo." wide>
      <MapaCalor puntos={puntos} />
      <Table headers={['Zona / provincia', 'Lotes distintos', 'Ha trabajadas']} rows={zonas.map(r => [r.nombre, r.cantidad, n(r.ha)])} />
    </Card></div>
  </>;
}

function MapaCalor({ puntos }) {
  const node = useRef(null);
  const [peso, setPeso] = useState('lotes');
  const geograficos = puntos.filter(p => p.latitud != null && p.longitud != null && Number.isFinite(Number(p.latitud)) && Number.isFinite(Number(p.longitud)));
  useEffect(() => {
    if (!node.current || !geograficos.length) return;
    const map = L.map(node.current, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    map.fitBounds(L.latLngBounds(geograficos.map(p => [p.latitud, p.longitud])), { padding: [40, 40], maxZoom: 13 });
    const canvas = document.createElement('canvas');
    canvas.className = 'agr-heat-canvas'; node.current.appendChild(canvas);
    const draw = () => {
      const size = map.getSize();
      if (size.x <= 0 || size.y <= 0) return;
      canvas.width = size.x; canvas.height = size.y;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const maxPeso = Math.max(1, ...geograficos.map(p => peso === 'ha' ? p.ha : 1));
      geograficos.forEach(p => {
        const point = map.latLngToContainerPoint([p.latitud, p.longitud]);
        const weight = peso === 'ha' ? p.ha / maxPeso : 1;
        if (weight <= 0) return;
        const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 48);
        gradient.addColorStop(0, `rgba(0,0,0,${weight * 0.65})`); gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient; ctx.fillRect(point.x - 48, point.y - 48, 96, 96);
      });
      const pixels = ctx.getImageData(0, 0, size.x, size.y);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const alpha = pixels.data[i + 3] / 255;
        if (!alpha) continue;
        pixels.data[i] = Math.round(255 * Math.min(1, alpha * 2));
        pixels.data[i + 1] = Math.round(210 * (1 - Math.max(0, alpha - 0.4) / 0.6));
        pixels.data[i + 2] = Math.round(180 * Math.max(0, 1 - alpha * 3));
        pixels.data[i + 3] = Math.round(Math.min(0.8, alpha + 0.12) * 255);
      }
      ctx.putImageData(pixels, 0, 0);
    };
    map.on('move zoom resize', draw); draw();
    const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(node.current);
    return () => { observer.disconnect(); canvas.remove(); map.remove(); };
  }, [puntos, peso]);
  return <><div className="agr-controls"><label>Mapa de calor por <select value={peso} onChange={e => setPeso(e.target.value)}><option value="lotes">Concentración de lotes</option><option value="ha">Hectáreas trabajadas</option></select></label><span className="agr-heat-legend">Menor <i /> Mayor intensidad</span></div>
    {geograficos.length ? <div className="agr-map" ref={node} aria-label="Mapa de calor de los lotes de la empresa" /> : <p className="est-sin-datos">No hay coordenadas disponibles para ubicar estos lotes.</p>}
    <p className="agr-note">Intensidad relativa en la vista actual, calculada desde el centro aproximado de cada lote. {puntos.length - geograficos.length} lotes sin coordenadas quedan fuera del mapa.</p></>;
}
