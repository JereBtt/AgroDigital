import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, ClipboardCheck, Clock, LoaderCircle, Scale, Truck, Warehouse, Wheat } from 'lucide-react';

/*
  Estadisticas (primera version, ver AGENTS.md).
  - Pestanias: Silos y almacenamiento | Distribucion.
  - Filtros comunes: empresa (barra superior de App), periodo con atajos y grano.
  - Cada indicador y grafico indica si responde al periodo o muestra el estado al dia de hoy.
  - Acceso: Gerente, Encargado y Admin (la API tambien lo valida).
  Los graficos son HTML/SVG propios, sin librerias, con la misma paleta del sistema.
*/

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const ROLES_ESTADISTICAS = ['Gerente', 'Encargado', 'Admin'];

const PRESETS = [
  { id: '30d', texto: 'Últimos 30 días' },
  { id: '6m', texto: 'Últimos 6 meses' },
  { id: 'anio', texto: 'Este año' },
  { id: 'campania', texto: 'Por campaña' },
  { id: 'personalizado', texto: 'Personalizado' }
];

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COLORES_DESTINO = ['#1E7B3A', '#E8A317', '#2F6DB5', '#8E5BB5', '#C2410C', '#4F8F96'];
const NIVEL_CLASE = { Bajo: 'bajo', Medio: 'medio', Alto: 'alto' };
const MOTIVO_TEXTO = { 'Diferencia de medicion': 'Diferencia de medición' };
const MOTIVO_COLOR = { 'Merma por secado': '#E8A317', Deterioro: '#A12622', 'Diferencia de medicion': '#9AA79F' };
const GRANOS_CON_TILDE = { maiz: 'Maíz' };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const numero = (valor, decimales = 0) =>
  Number(valor ?? 0).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const kg = (valor) => `${numero(valor)} kg`;
const pct = (valor, decimales = 1) => (valor == null ? '-' : `${numero(valor, decimales)} %`);
const pp = (valor) => (valor == null ? '-' : `${valor > 0 ? '+' : ''}${numero(valor, 1)} pp`);
// Toneladas: sin decimales desde 10 t; por debajo, un decimal solo si hace falta (6 t, 6,5 t).
const toneladas = (valorKg) => {
  const t = Number(valorKg ?? 0) / 1000;
  return t.toLocaleString('es-AR', { maximumFractionDigits: Math.abs(t) >= 10 ? 0 : 1 });
};

function normalizar(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function granoTexto(valor) {
  return GRANOS_CON_TILDE[normalizar(valor)] ?? valor;
}

function iso(fecha) {
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function rangoPreset(preset) {
  const hoy = new Date();
  const hasta = iso(hoy);
  if (preset === '30d') {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 29);
    return { desde: iso(d), hasta };
  }
  if (preset === 'anio') return { desde: `${hoy.getFullYear()}-01-01`, hasta };
  const d = new Date(hoy);
  d.setMonth(d.getMonth() - 6);
  d.setDate(d.getDate() + 1);
  return { desde: iso(d), hasta };
}

async function readError(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (typeof data === 'string') return data;
    return data?.title || text;
  } catch {
    return text || `Error ${response.status}`;
  }
}

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

function Alcance({ tipo }) {
  return tipo === 'hoy'
    ? <span className="est-alcance est-hoy">Al día de hoy</span>
    : <span className="est-alcance est-periodo">Según el período</span>;
}

function Kpi({ Icono, titulo, valor, detalle, alcance, alerta = false }) {
  return (
    <div className={`alm-kpi est-kpi ${alerta ? 'dist-kpi-alerta' : ''}`}>
      <span className="alm-kpi-icon"><Icono size={22} /></span>
      <div className="est-kpi-cuerpo">
        <small>{titulo}</small>
        <strong>{valor}</strong>
        {detalle && <p>{detalle}</p>}
        <div className="est-kpi-alcance"><Alcance tipo={alcance} /></div>
      </div>
    </div>
  );
}

function Tarjeta({ titulo, subtitulo, alcance, children, pie }) {
  return (
    <section className="dashboard-card est-tarjeta">
      <div className="est-tarjeta-cabecera">
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        <Alcance tipo={alcance} />
      </div>
      <div className="est-tarjeta-cuerpo">{children}</div>
      {pie && <div className="est-tarjeta-pie">{pie}</div>}
    </section>
  );
}

function SinDatos({ texto = 'No hay datos para este período.' }) {
  return <p className="est-sin-datos">{texto}</p>;
}

function Referencia({ color, children }) {
  return <span className="est-referencia"><span style={{ background: color }} aria-hidden="true" />{children}</span>;
}

function FilaBarra({ etiqueta, valor, porcentaje, color, chip }) {
  return (
    <div className="est-fila">
      <div className="est-fila-texto">
        <span className="est-fila-etiqueta">{etiqueta}</span>
        <span className="est-fila-valor">{chip}{valor}</span>
      </div>
      <div className="est-barra"><span style={{ width: `${Math.max(0, Math.min(100, porcentaje))}%`, background: color }} /></div>
    </div>
  );
}

// ===========================================================================
// Modulo
// ===========================================================================

export default function Estadisticas({ session, parentFilters = null, selectedEmpresaId = '' }) {
  const puedeVer = ROLES_ESTADISTICAS.includes(session?.role);
  const [tab, setTab] = useState('almacenamiento');
  const [preset, setPreset] = useState('6m');
  const [rango, setRango] = useState(() => rangoPreset('6m'));
  const [campaniaId, setCampaniaId] = useState('');
  const [grano, setGrano] = useState('');
  const [campanias, setCampanias] = useState([]);
  const [granos, setGranos] = useState([]);
  const [datos, setDatos] = useState({ almacenamiento: null, distribucion: null });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const headers = useMemo(() => (session?.token ? { Authorization: `Bearer ${session.token}` } : {}), [session?.token]);
  const rangoInvalido = !rango.desde || !rango.hasta || rango.desde > rango.hasta;

  // Campanias de la empresa (una fila por combinacion: se agrupan por campania).
  useEffect(() => {
    if (!puedeVer || !selectedEmpresaId) return;
    setGrano('');
    setDatos({ almacenamiento: null, distribucion: null });
    fetch(`${API_BASE_URL}/api/campanias`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((filas) => {
        const porId = new Map();
        filas.filter((f) => String(f.empresaId) === String(selectedEmpresaId)).forEach((f) => {
          const actual = porId.get(f.campaniaId);
          const inicio = String(f.fechaInicio).slice(0, 10);
          const fin = String(f.fechaFin).slice(0, 10);
          porId.set(f.campaniaId, actual
            ? { ...actual, desde: inicio < actual.desde ? inicio : actual.desde, hasta: fin > actual.hasta ? fin : actual.hasta }
            : { id: String(f.campaniaId), nombre: f.campaniaNombre, desde: inicio, hasta: fin });
        });
        setCampanias([...porId.values()].sort((a, b) => b.desde.localeCompare(a.desde)));
      })
      .catch(() => setCampanias([]));
  }, [puedeVer, selectedEmpresaId, headers]);

  // Datos de la pestania activa.
  useEffect(() => {
    if (!puedeVer || !selectedEmpresaId || rangoInvalido) return undefined;
    let vigente = true;
    const query = new URLSearchParams({ empresaId: selectedEmpresaId, desde: rango.desde, hasta: rango.hasta });
    if (grano) query.set('grano', grano);

    setCargando(true);
    setError('');
    fetch(`${API_BASE_URL}/api/estadisticas/${tab}?${query}`, { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readError(r));
        return r.json();
      })
      .then((data) => {
        if (!vigente) return;
        setDatos((d) => ({ ...d, [tab]: data }));
        if (tab === 'almacenamiento' && !grano) setGranos(data.granosDisponibles ?? []);
      })
      .catch((err) => vigente && setError(`No se pudieron cargar las estadísticas: ${err.message}`))
      .finally(() => vigente && setCargando(false));

    return () => { vigente = false; };
  }, [puedeVer, selectedEmpresaId, tab, rango.desde, rango.hasta, grano, rangoInvalido, headers]);

  function elegirPreset(id) {
    setPreset(id);
    if (id === 'campania') {
      const campania = campanias.find((c) => c.id === campaniaId) ?? campanias[0];
      if (campania) aplicarCampania(campania.id);
      return;
    }
    if (id !== 'personalizado') setRango(rangoPreset(id));
  }

  function aplicarCampania(id) {
    const campania = campanias.find((c) => c.id === id);
    if (!campania) return;
    const hoy = iso(new Date());
    setCampaniaId(id);
    // Una campania en curso termina en el futuro: las estadisticas llegan hasta hoy.
    setRango({ desde: campania.desde, hasta: campania.hasta > hoy ? hoy : campania.hasta });
  }

  function cambiarFecha(campo, valor) {
    setPreset('personalizado');
    setRango((r) => ({ ...r, [campo]: valor }));
  }

  function limpiar() {
    setPreset('6m');
    setRango(rangoPreset('6m'));
    setCampaniaId('');
    setGrano('');
  }

  const encabezado = (
    <div className="page-heading">
      <div>
        <h1>Estadísticas</h1>
        <p>Indicadores de la operación por empresa y período.</p>
      </div>
    </div>
  );

  if (!puedeVer) {
    return (
      <section className="content-panel list-panel">
        {encabezado}
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><BarChart3 size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Estadísticas disponibles para el Gerente y el Encargado</h2>
            <p>Tu rol no tiene acceso a este módulo.</p>
          </div>
        </section>
      </section>
    );
  }

  if (!selectedEmpresaId) {
    return (
      <section className="content-panel list-panel">
        {encabezado}
        {parentFilters}
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><BarChart3 size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Elegí una empresa</h2>
            <p>Las estadísticas se muestran por empresa.</p>
          </div>
        </section>
      </section>
    );
  }

  const actual = datos[tab];

  return (
    <section className="content-panel list-panel">
      {encabezado}
      {parentFilters}

      <section className="dashboard-card est-filtros" aria-label="Período y grano">
        <div className="est-filtros-grilla">
          <div className="est-campo est-campo-periodo">
            <span className="est-etiqueta" id="est-periodo">Período</span>
            <div className="est-presets" role="radiogroup" aria-labelledby="est-periodo">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={preset === p.id}
                  className={preset === p.id ? 'activo' : ''} onClick={() => elegirPreset(p.id)}
                  disabled={p.id === 'campania' && campanias.length === 0}
                  title={p.id === 'campania' && campanias.length === 0 ? 'La empresa no tiene campañas' : undefined}>
                  {p.texto}
                </button>
              ))}
            </div>
          </div>
          {preset === 'campania' && (
            <label className="est-campo">
              <span className="est-etiqueta">Campaña</span>
              <select value={campaniaId} onChange={(e) => aplicarCampania(e.target.value)}>
                {campanias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
          )}
          <label className="est-campo">
            <span className="est-etiqueta">Desde</span>
            <input type="date" value={rango.desde} max={rango.hasta || undefined} onChange={(e) => cambiarFecha('desde', e.target.value)} />
          </label>
          <label className="est-campo">
            <span className="est-etiqueta">Hasta</span>
            <input type="date" value={rango.hasta} min={rango.desde || undefined} onChange={(e) => cambiarFecha('hasta', e.target.value)} />
          </label>
          <label className="est-campo">
            <span className="est-etiqueta">Grano</span>
            <select value={grano} onChange={(e) => setGrano(e.target.value)}>
              <option value="">Todos</option>
              {granos.map((g) => <option key={g} value={g}>{granoTexto(g)}</option>)}
            </select>
          </label>
          <button className="clear-button est-limpiar" type="button" onClick={limpiar}>Limpiar filtros</button>
        </div>
        <div className="est-leyenda-alcance">
          <span>Cada gráfico indica qué muestra:</span>
          <Alcance tipo="periodo" />
          <Alcance tipo="hoy" />
        </div>
        {rangoInvalido && <p className="alm-error" role="alert">La fecha Desde no puede ser posterior a Hasta.</p>}
      </section>

      <div className="alm-tabs" role="tablist" aria-label="Secciones de estadísticas">
        <button type="button" role="tab" aria-selected={tab === 'almacenamiento'} className={tab === 'almacenamiento' ? 'active' : ''} onClick={() => setTab('almacenamiento')}>Silos y almacenamiento</button>
        <button type="button" role="tab" aria-selected={tab === 'distribucion'} className={tab === 'distribucion' ? 'active' : ''} onClick={() => setTab('distribucion')}>Distribución</button>
      </div>

      {error && <p className="alm-error" role="alert">{error}</p>}

      {!actual ? (
        <div className="table-shell dashboard-card">
          <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Calculando estadísticas...</span></div>
        </div>
      ) : (
        <div className={cargando ? 'est-recalculando' : undefined} aria-busy={cargando}>
          {tab === 'almacenamiento'
            ? <VistaAlmacenamiento datos={actual} />
            : <VistaDistribucion datos={actual} />}
        </div>
      )}
    </section>
  );
}

// ===========================================================================
// Silos y almacenamiento
// ===========================================================================

function VistaAlmacenamiento({ datos }) {
  const pctMas180 = datos.stockKg > 0 ? (datos.kgMas180Dias / datos.stockKg) * 100 : 0;
  return (
    <>
      <div className="alm-kpis est-kpis">
        <Kpi Icono={Warehouse} titulo="Stock almacenado" alcance="hoy" valor={kg(datos.stockKg)}
          detalle={`${datos.silosConGrano} ${datos.silosConGrano === 1 ? 'silo' : 'silos'} con grano`} />
        <Kpi Icono={Clock} titulo="Antigüedad promedio" alcance="hoy"
          valor={datos.antiguedadPromedioDias != null ? `${numero(datos.antiguedadPromedioDias)} días` : '-'}
          detalle={datos.stockKg <= 0 ? 'Sin grano almacenado' : datos.kgMas180Dias > 0 ? `${kg(datos.kgMas180Dias)} superan los 180 días (${numero(pctMas180, 0)} %)` : 'Ningún grano supera los 180 días'}
          alerta={datos.kgMas180Dias > 0} />
        <Kpi Icono={Scale} titulo="Merma en almacenamiento" alcance="periodo"
          valor={pct(datos.mermaPct, 2)}
          detalle={datos.kgIngresados > 0 ? `${kg(datos.kgMerma)} sobre ${kg(datos.kgIngresados)} ingresados` : 'Sin ingresos en el período'} />
        <Kpi Icono={ClipboardCheck} titulo="Controles en término" alcance="periodo"
          valor={datos.controlesEnTerminoPct != null ? `${numero(datos.controlesEnTerminoPct)} %` : '-'}
          detalle={datos.controlesProgramados > 0
            ? `${datos.controlesEnTermino} de ${datos.controlesProgramados}${datos.atrasoPromedioDias != null ? ` · atraso promedio ${numero(datos.atrasoPromedioDias, 1)} días` : ''}`
            : 'Sin controles programados en el período'}
          alerta={datos.controlesEnTerminoPct != null && datos.controlesEnTerminoPct < 90} />
      </div>

      <div className="est-grilla">
        <AntiguedadChart filas={datos.antiguedad} />
        <FlujoChart meses={datos.flujoMensual} />
        <MermasChart mermas={datos.mermas} total={datos.kgMerma} />
        <ControlesChart silos={datos.controlesPorSilo} />
      </div>
    </>
  );
}

const TRAMOS = [
  { campo: 'kg0a30', texto: '0 a 30 días', color: '#B9DFC1' },
  { campo: 'kg31a90', texto: '31 a 90 días', color: '#6FBF80' },
  { campo: 'kg91a180', texto: '91 a 180 días', color: '#1E7B3A' },
  { campo: 'kgMas180', texto: 'Más de 180 días', color: '#C2410C' }
];

function AntiguedadChart({ filas }) {
  const maximo = Math.max(1, ...filas.map((f) => f.kgTotal));
  const totales = TRAMOS.map((t) => filas.reduce((s, f) => s + f[t.campo], 0));
  return (
    <Tarjeta titulo="Antigüedad del stock por grano" subtitulo="Kg en silo según los días desde su ingreso (partidas FIFO)" alcance="hoy"
      pie={filas.length > 0 && TRAMOS.map((t, i) => <Referencia key={t.campo} color={t.color}>{t.texto} · {toneladas(totales[i])} t</Referencia>)}>
      {filas.length === 0 ? <SinDatos texto="No hay grano almacenado." /> : filas.map((f) => (
        <div key={f.producto} className="est-fila">
          <div className="est-fila-texto">
            <span className="est-fila-etiqueta">{granoTexto(f.producto)}</span>
            <span className="est-fila-valor">{kg(f.kgTotal)}</span>
          </div>
          <div className="est-barra est-barra-alta" role="img"
            aria-label={`${granoTexto(f.producto)}: ${TRAMOS.map((t) => `${t.texto} ${kg(f[t.campo])}`).join(', ')}`}>
            <span className="est-apilada" style={{ width: `${(f.kgTotal / maximo) * 100}%` }}>
              {TRAMOS.map((t) => f[t.campo] > 0 && (
                <span key={t.campo} style={{ width: `${(f[t.campo] / f.kgTotal) * 100}%`, background: t.color }} />
              ))}
            </span>
          </div>
        </div>
      ))}
    </Tarjeta>
  );
}

function FlujoChart({ meses }) {
  const hayDatos = meses.some((m) => m.ingresosKg > 0 || m.egresosDistribucionKg > 0 || m.egresosOtrosKg > 0);
  const n = Math.max(1, meses.length);
  const izquierda = 44;
  const ancho = 520 - izquierda - 10;
  const columna = ancho / n;
  const barra = Math.min(34, columna * 0.6);
  const maximo = Math.max(1, ...meses.map((m) => Math.max(m.ingresosKg, m.egresosDistribucionKg + m.egresosOtrosKg)));
  const escala = 110 / maximo;
  const base = 150;
  const conValores = n <= 12;
  const cada = Math.ceil(n / 12);

  return (
    <Tarjeta titulo="Flujo mensual de grano" subtitulo="Toneladas que entraron y salieron de los silos, y stock al cierre de cada mes" alcance="periodo"
      pie={hayDatos && (
        <>
          <Referencia color="#1E7B3A">Ingresos</Referencia>
          <Referencia color="#C2410C">Egresos por distribución</Referencia>
          <Referencia color="#E8A317">Consumo interno, semilla y ajustes</Referencia>
          <span>Debajo de cada mes: stock al cierre</span>
        </>
      )}>
      {!hayDatos ? <SinDatos texto="No hubo movimientos de grano en el período." /> : (
        <svg viewBox="0 0 520 316" role="img" aria-label="Ingresos y egresos de grano por mes" className="est-svg">
          <line x1={izquierda} y1={base} x2={510} y2={base} stroke="#9AA79F" strokeWidth="1" />
          <text x={izquierda - 6} y={44} textAnchor="end" className="est-svg-suave">Entra</text>
          <text x={izquierda - 6} y={252} textAnchor="end" className="est-svg-suave">Sale</text>
          {meses.map((m, i) => {
            const cx = izquierda + columna * i + columna / 2;
            const x = cx - barra / 2;
            const hIngreso = m.ingresosKg * escala;
            const hDist = m.egresosDistribucionKg * escala;
            const hOtros = m.egresosOtrosKg * escala;
            const egreso = m.egresosDistribucionKg + m.egresosOtrosKg;
            const etiqueta = i % cada === 0;
            return (
              <g key={`${m.anio}-${m.mes}`}>
                <title>{`${MESES[m.mes - 1]} ${m.anio}: entraron ${kg(m.ingresosKg)}, salieron ${kg(egreso)}, stock al cierre ${kg(m.stockCierreKg)}`}</title>
                {hIngreso > 0 && <rect x={x} y={base - hIngreso} width={barra} height={hIngreso} rx="3" fill="#1E7B3A" />}
                {hDist > 0 && <rect x={x} y={base} width={barra} height={hDist} fill="#C2410C" />}
                {hOtros > 0 && <rect x={x} y={base + hDist} width={barra} height={Math.max(hOtros, 1.5)} fill="#E8A317" />}
                {conValores && m.ingresosKg > 0 && <text x={cx} y={base - hIngreso - 6} textAnchor="middle" className="est-svg-fuerte">+{toneladas(m.ingresosKg)}</text>}
                {conValores && egreso > 0 && <text x={cx} y={base + hDist + hOtros + 14} textAnchor="middle" className="est-svg-fuerte">−{toneladas(egreso)}</text>}
                {etiqueta && <text x={cx} y={294} textAnchor="middle" className="est-svg-fuerte">{MESES[m.mes - 1]}{n > 12 ? ` ${String(m.anio).slice(2)}` : ''}</text>}
                {etiqueta && <text x={cx} y={310} textAnchor="middle" className="est-svg-suave">{toneladas(m.stockCierreKg)} t</text>}
              </g>
            );
          })}
        </svg>
      )}
    </Tarjeta>
  );
}

function MermasChart({ mermas, total }) {
  const maximo = Math.max(1, ...mermas.map((m) => m.kg));
  return (
    <Tarjeta titulo="Mermas en almacenamiento por motivo" subtitulo="Ajustes negativos y egresos por deterioro registrados en los silos" alcance="periodo"
      pie={mermas.length > 0 && <span>Total: {kg(total)}. En la pestaña Distribución está la merma de los envíos.</span>}>
      {mermas.length === 0 ? <SinDatos texto="No se registraron mermas en el período." /> : mermas.map((m) => (
        <FilaBarra key={m.motivo} etiqueta={MOTIVO_TEXTO[m.motivo] ?? m.motivo} valor={`${kg(m.kg)} · ${numero(m.pct, 0)} %`}
          porcentaje={(m.kg / maximo) * 100} color={MOTIVO_COLOR[m.motivo] ?? '#9AA79F'} />
      ))}
    </Tarjeta>
  );
}

function colorCumplimiento(valor) {
  if (valor >= 90) return '#1E7B3A';
  if (valor >= 70) return '#E8A317';
  return '#A12622';
}

function ControlesChart({ silos }) {
  return (
    <Tarjeta titulo="Cumplimiento de controles por silo" subtitulo="Controles hechos hasta la fecha programada, sobre los que vencían en el período" alcance="periodo"
      pie={silos.length > 0 && (
        <>
          <span className="dist-chip dist-bajo">90 % o más</span>
          <span className="dist-chip dist-medio">70 a 89 %</span>
          <span className="dist-chip dist-alto">Menos de 70 %</span>
          <span>La frecuencia sale de los parámetros por grano y tipo de silo.</span>
        </>
      )}>
      {silos.length === 0 ? <SinDatos texto="No vencieron controles en el período." /> : silos.map((s) => (
        <FilaBarra key={s.siloId}
          etiqueta={`${s.silo} · ${s.tipoSilo === 'Bolson' ? 'Bolsón' : s.tipoSilo}`}
          valor={`${numero(s.pct)} % · ${s.enTermino} de ${s.programados}${s.atrasoPromedioDias != null ? ` · atraso promedio ${numero(s.atrasoPromedioDias, 1)} días` : ''}`}
          porcentaje={s.pct} color={colorCumplimiento(s.pct)} />
      ))}
    </Tarjeta>
  );
}

// ===========================================================================
// Distribucion
// ===========================================================================

function VistaDistribucion({ datos }) {
  const pendientes = datos.camionesRecibidosSinConciliar + datos.camionesEnTransito;
  return (
    <>
      <div className="alm-kpis est-kpis">
        <Kpi Icono={Truck} titulo="Kg despachados" alcance="periodo" valor={kg(datos.kgDespachados)}
          detalle={`${datos.cantidadCamiones} ${datos.cantidadCamiones === 1 ? 'camión' : 'camiones'} · ${datos.cantidadDestinos} ${datos.cantidadDestinos === 1 ? 'destino' : 'destinos'}`} />
        <Kpi Icono={Scale} titulo="Merma real vs. esperada" alcance="periodo"
          valor={pct(datos.mermaRealPct, 1)}
          detalle={datos.nivelDesvio
            ? <>Esperada {pct(datos.mermaEsperadaPct, 1)} <span className={`dist-chip dist-${NIVEL_CLASE[datos.nivelDesvio]}`}>{pp(datos.desvioPp)} · {datos.nivelDesvio}</span></>
            : 'Sin envíos conciliados con parámetros'} />
        <Kpi Icono={Wheat} titulo="Merma sin justificar" alcance="periodo"
          valor={datos.kgSinJustificar != null ? kg(datos.kgSinJustificar) : '-'}
          detalle={datos.kgSinJustificar != null ? `${kg(datos.kgSinJustificarBalanza)} de balanza · ${kg(datos.kgSinJustificarCalidad)} de descuento por calidad` : null} />
        <Kpi Icono={CalendarDays} titulo="Envíos sin conciliar" alcance="hoy" valor={pendientes}
          detalle={`${datos.camionesRecibidosSinConciliar} ${datos.camionesRecibidosSinConciliar === 1 ? 'recibido' : 'recibidos'} sin liquidar · ${datos.camionesEnTransito} en tránsito`}
          alerta={datos.camionesRecibidosSinConciliar > 0} />
      </div>

      <div className="est-grilla est-grilla-3">
        <AcopiadoraChart filas={datos.mermaPorAcopiadora} />
        <DestinosChart filas={datos.kgPorDestino} total={datos.kgDespachados} />
        <BalanzaChart filas={datos.balanzaPorTransportista} />
      </div>
    </>
  );
}

function AcopiadoraChart({ filas }) {
  const maximo = Math.max(1, ...filas.flatMap((f) => [f.mermaRealPct, f.mermaEsperadaPct]));
  return (
    <Tarjeta titulo="Merma por acopiadora" subtitulo="Real vs. esperada según la humedad y la calidad informadas" alcance="periodo"
      pie={filas.length > 0 && <><Referencia color="#C2410C">Real</Referencia><Referencia color="#9DB8A4">Esperada</Referencia></>}>
      {filas.length === 0 ? <SinDatos texto="No hay envíos conciliados con parámetros en el período." /> : filas.map((f) => (
        <div key={f.destinoId} className="est-fila">
          <div className="est-fila-texto">
            <span className="est-fila-etiqueta">{f.destino}</span>
            <span className={`dist-chip dist-${NIVEL_CLASE[f.nivelDesvio]}`}>{pp(f.desvioPp)}</span>
          </div>
          <div className="est-par">
            <div className="est-barra"><span style={{ width: `${(f.mermaRealPct / maximo) * 100}%`, background: '#C2410C' }} /></div>
            <span>{pct(f.mermaRealPct, 2)}</span>
            <div className="est-barra"><span style={{ width: `${(f.mermaEsperadaPct / maximo) * 100}%`, background: '#9DB8A4' }} /></div>
            <span className="est-suave">{pct(f.mermaEsperadaPct, 2)}</span>
          </div>
        </div>
      ))}
    </Tarjeta>
  );
}

function DestinosChart({ filas, total }) {
  let acumulado = 0;
  const tramos = filas.map((f, i) => {
    const color = COLORES_DESTINO[i % COLORES_DESTINO.length];
    const inicio = acumulado;
    acumulado += total > 0 ? (f.kg / total) * 100 : 0;
    return `${color} ${inicio}% ${acumulado}%`;
  });
  return (
    <Tarjeta titulo="Kg despachados por destino" subtitulo="Total despachado en el período" alcance="periodo">
      {filas.length === 0 ? <SinDatos texto="No hubo envíos en el período." /> : (
        <div className="est-dona-contenedor">
          <div className="est-dona" style={{ background: `conic-gradient(${tramos.join(', ')})` }} role="img"
            aria-label={filas.map((f) => `${f.destino} ${numero(f.pct, 0)} %`).join(', ')}>
            <div><strong>{toneladas(total)} t</strong><small>total</small></div>
          </div>
          <ul className="est-dona-lista">
            {filas.map((f, i) => (
              <li key={f.destinoId}>
                <span className="est-punto" style={{ background: COLORES_DESTINO[i % COLORES_DESTINO.length] }} aria-hidden="true" />
                <div><strong>{f.destino}</strong><span>{kg(f.kg)} · {numero(f.pct, 0)} %</span></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tarjeta>
  );
}

function BalanzaChart({ filas }) {
  const maximo = Math.max(0.01, ...filas.map((f) => Math.abs(f.diferenciaPct)));
  return (
    <Tarjeta titulo="Diferencia de balanza por transportista" subtitulo="Kg despachados en origen vs. kg recibidos en destino" alcance="periodo"
      pie={filas.length > 0 && <span>Solo camiones con la llegada registrada. Barras relativas al transportista con mayor diferencia.</span>}>
      {filas.length === 0 ? <SinDatos texto="No hay camiones con la llegada registrada en el período." /> : filas.map((f) => (
        <FilaBarra key={f.transportista} etiqueta={f.transportista}
          valor={`${pct(f.diferenciaPct, 2)} · ${kg(f.diferenciaKg)}`}
          porcentaje={(Math.abs(f.diferenciaPct) / maximo) * 100} color="#0A4327" />
      ))}
    </Tarjeta>
  );
}
