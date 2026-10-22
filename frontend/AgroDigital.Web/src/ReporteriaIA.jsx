import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, BarChart3, Clock3, Database, Leaf, LineChart, LoaderCircle, MessageSquareText, Plus, Send, ShieldCheck, Sparkles } from 'lucide-react';
import ReporteriaFormato from './ReporteriaFormato';
import './reporteriaIA.css';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const SUGERENCIAS = [
  { titulo: 'Informe de campaña', texto: 'Generá un informe completo de la última campaña registrada: siembra, cosecha, insumos, siniestros, almacenamiento y distribución.', icono: BarChart3, tono: 'verde' },
  { titulo: 'Comparar campañas', texto: 'Compará las dos campañas más recientes y explicá qué diferencias muestran los datos registrados.', icono: LineChart, tono: 'azul' },
  { titulo: 'Rindes por cultivo', texto: '¿Cuál fue el rinde promedio de cada cultivo en la última campaña registrada?', icono: Leaf, tono: 'ambar' },
  { titulo: 'Siniestros y resiembras', texto: '¿Qué lotes sufrieron siniestros y cuáles necesitaron resiembra en la última campaña?', icono: AlertTriangle, tono: 'violeta' }
];

const NOMBRES_FUENTES = {
  lote_ficha: 'Datos del lote', antecesor_lote: 'Cultivo antecesor',
  lote_bajas: 'Bajas del lote', siembras_detalle: 'Detalle de siembras',
  refertilizaciones_detalle: 'Refertilización', cosechas_detalle: 'Detalle de cosechas',
  agroquimicos_detalle: 'Agroquímicos', tiradas_detalle: 'Tiradas de aros',
  almacenamientos_lote: 'Ingresos del lote a silos', partidas_lote: 'Stock trazado del lote',
  distribuciones_detalle: 'Envíos y destinos',
  contexto: 'Contexto', siembras_resumen: 'Siembras', resumen_campania: 'Cosechas', rindes_lote: 'Rindes por lote',
  mejores_rindes: 'Mejores rindes', peores_rindes: 'Menores rindes', variedades: 'Variedades',
  insumos: 'Insumos', fertilizacion: 'Fertilización', siniestros: 'Siniestros',
  resiembras: 'Resiembras', resiembras_resumen: 'Superficie resembrada', epocas: 'Épocas de siembra',
  perdidas_cosecha: 'Pérdidas de cosecha', silos: 'Silos', almacenamiento: 'Almacenamiento', distribucion: 'Distribución',
  informe_campania: 'Informe de campaña', comparativa_campanias: 'Comparación de campañas',
  desvios_siembra: 'Fechas de siembra',
  estadisticas_rinde: 'Estadísticas · Rinde', estadisticas_siniestros: 'Estadísticas · Siniestros',
  estadisticas_general: 'Estadísticas · Panorama general',
  estadisticas_productividad: 'Estadísticas · Productividad',
  estadisticas_almacenamiento: 'Estadísticas · Silos y almacenamiento',
  estadisticas_distribucion: 'Estadísticas · Distribución'
};

function fuenteLegible(fuente) {
  const [tipo, ...detalle] = fuente.split(' · ');
  return [NOMBRES_FUENTES[tipo] || tipo, ...detalle].join(' · ');
}

function fechaCorta(fecha) {
  if (!fecha) return '';
  const parsed = new Date(`${String(fecha).slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function TramaFutura() {
  return <svg viewBox="0 0 760 150" preserveAspectRatio="none" role="presentation">
    {Array.from({ length: 19 }, (_, index) => <path key={`h${index}`}
      d={`M 0 ${120 + index * 1.6} C 145 ${96 - index * 2.2}, 215 ${31 + index * 1.8}, 340 ${78 + index * 1.3} S 535 ${16 + index * 2.2}, 760 ${85 + index * 1.3}`} />)}
    {Array.from({ length: 15 }, (_, index) => <path key={`v${index}`}
      d={`M ${index * 55} 150 C ${80 + index * 42} 111, ${100 + index * 43} 43, ${155 + index * 43} 0`} />)}
  </svg>;
}

async function leerError(response) {
  const body = await response.text();
  try {
    const json = JSON.parse(body);
    return json.title || json.detail || (typeof json === 'string' ? json : body);
  } catch { return body || `Error ${response.status}`; }
}

export default function ReporteriaIA({ session, parentFilters, selectedEmpresaId, selectedEmpresaName, puedeVer }) {
  const [recientes, setRecientes] = useState([]);
  const [conversacionId, setConversacionId] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [pregunta, setPregunta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const empresaRef = useRef(selectedEmpresaId);
  empresaRef.current = selectedEmpresaId;
  const headers = { Authorization: `Bearer ${session?.token}` };

  useEffect(() => {
    setConversacionId(null);
    setMensajes([]);
    setRecientes([]);
    setError('');
    if (!puedeVer || !selectedEmpresaId) return undefined;
    const controller = new AbortController();
    fetch(`${API}/api/reporteria-ia/conversaciones?empresaId=${encodeURIComponent(selectedEmpresaId)}`,
      { headers, signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await leerError(response));
        return response.json();
      })
      .then(setRecientes)
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [selectedEmpresaId, puedeVer, session?.token]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [mensajes, cargando]);

  async function abrir(id) {
    if (cargando || abriendo) return;
    const empresa = selectedEmpresaId;
    setAbriendo(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/reporteria-ia/conversaciones/${id}?empresaId=${encodeURIComponent(selectedEmpresaId)}`,
        { headers });
      if (!response.ok) throw new Error(await leerError(response));
      const rows = await response.json();
      if (empresaRef.current !== empresa) return;
      setConversacionId(id);
      setMensajes(rows.map(row => ({
        rol: row.rol, contenido: row.contenido, modo: row.modo,
        fuentes: (() => { try { return JSON.parse(row.fuentes || '[]'); } catch { return []; } })()
      })));
    } catch (e) { if (empresaRef.current === empresa) setError(e.message); }
    finally { setAbriendo(false); }
  }

  function nueva() {
    if (cargando) return;
    setConversacionId(null);
    setMensajes([]);
    setPregunta('');
    setError('');
  }

  async function enviar(texto = pregunta) {
    const value = texto.trim();
    if (!value || cargando || !selectedEmpresaId) return;
    const empresa = selectedEmpresaId;
    setPregunta('');
    setError('');
    setCargando(true);
    setMensajes(previous => [...previous, { rol: 'usuario', contenido: value }]);
    try {
      const response = await fetch(`${API}/api/reporteria-ia/consultar`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId: Number(selectedEmpresaId), conversacionId, pregunta: value })
      });
      if (!response.ok) throw new Error(await leerError(response));
      const result = await response.json();
      if (empresaRef.current !== empresa) return;
      setConversacionId(result.conversacionId);
      setMensajes(previous => [...previous, {
        rol: 'asistente', contenido: result.respuesta, modo: result.modo, fuentes: result.fuentes
      }]);
      const list = await fetch(`${API}/api/reporteria-ia/conversaciones?empresaId=${encodeURIComponent(selectedEmpresaId)}`,
        { headers });
      if (list.ok) {
        const rows = await list.json();
        if (empresaRef.current === empresa) setRecientes(rows);
      }
    } catch (e) {
      if (empresaRef.current === empresa) {
        setMensajes(previous => previous.slice(0, -1));
        setPregunta(value);
        setError(e.message);
      }
    } finally { setCargando(false); }
  }

  return <section className="content-panel list-panel ria-page">
    <div className="page-heading ria-heading">
      <div className="ria-heading-copy"><span className="ria-eyebrow"><Sparkles size={16} /> Información con respaldo</span>
        <h1>Reportería IA</h1>
        <p>Consultá y analizá los datos registrados de tu operación.</p>
      </div>
      <div className="ria-header-art" aria-hidden="true"><TramaFutura /><span>DATOS REALES<br />DECISIONES CON IMPACTO</span></div>
      <button className="ria-new" type="button" onClick={nueva} disabled={cargando}><Plus size={18} /> Nueva consulta</button>
    </div>
    {parentFilters}
    {!puedeVer ? <div className="dashboard-card ria-empty">Reportería IA está disponible para Gerente y Encargado de esta empresa.</div>
      : !selectedEmpresaId ? <div className="dashboard-card ria-empty">Seleccioná una empresa para consultar sus datos.</div>
        : <div className="ria-layout">
          <aside className="dashboard-card ria-sidebar">
            <div className="ria-side-title"><Clock3 size={18} /><h2>Recientes</h2></div>
            <p>Solo tus consultas en {selectedEmpresaName || 'esta empresa'}.</p>
            {recientes.length ? <div className="ria-history">{recientes.map(item =>
              <button key={item.id} className={String(conversacionId) === String(item.id) ? 'ria-active' : ''}
                type="button" onClick={() => abrir(item.id)} disabled={abriendo || cargando} title={item.titulo}>
                <MessageSquareText size={18} /><span className="ria-history-text"><strong>{item.titulo}</strong><small>{fechaCorta(item.fecha)}</small></span>
              </button>)}</div>
              : <span className="ria-no-history">Tus conversaciones aparecerán acá.</span>}
            <div className="ria-private"><ShieldCheck size={18} /><span>Los datos se consultan únicamente para la empresa seleccionada.</span></div>
          </aside>
          <div className="dashboard-card ria-main">
            {mensajes.length === 0 ? <div className="ria-welcome">
              <div className="ria-welcome-icon"><Sparkles size={30} /></div>
              <h2>¿Qué querés saber de tu operación?</h2>
              <p>Elegí una pregunta o escribí la tuya. La respuesta indicará qué registros consideró y cuándo faltan datos.</p>
              <div className="ria-suggestions">{SUGERENCIAS.map(item => {
                const Icono = item.icono;
                return <button type="button" key={item.titulo} className={`ria-suggestion ria-${item.tono}`}
                  onClick={() => enviar(item.texto)} disabled={cargando}>
                  <span className="ria-suggestion-icon"><Icono size={24} strokeWidth={2} /></span>
                  <span className="ria-suggestion-copy"><strong>{item.titulo}</strong><span>{item.texto}</span></span>
                  <span className="ria-suggestion-arrow"><ArrowRight size={18} /></span>
                </button>;
              })}</div>
            </div> : <div className="ria-messages" aria-live="polite">{mensajes.map((message, index) =>
              <article className={`ria-message ria-${message.rol}`} key={index}>
                <div className="ria-avatar">{message.rol === 'usuario' ? 'Vos' : <Sparkles size={17} />}</div>
                <div className="ria-bubble">
                  {message.rol === 'asistente' ? <>
                    <span className="ria-mode"><BarChart3 size={17} /> {message.modo === 'analisis' ? 'Análisis profundo' : 'Consulta de datos'}</span>
                    <ReporteriaFormato contenido={message.contenido} />
                    {message.fuentes?.length > 0 && <div className="ria-sources"><Database size={21} />
                      <div><strong>Registros consultados</strong><span>{message.fuentes.map(fuenteLegible).join(' · ')}</span></div>
                    </div>}
                  </> : <p className="ria-user-text">{message.contenido}</p>}
                </div>
              </article>)}
              {cargando && <div className="ria-thinking"><LoaderCircle size={17} className="ria-spin" /> Consultando registros y preparando la respuesta…</div>}
              <div ref={bottomRef} />
            </div>}
            {error && <div className="ria-error" role="alert">{error}</div>}
            <form className="ria-composer" onSubmit={event => { event.preventDefault(); enviar(); }}>
              <label htmlFor="ria-pregunta">Tu consulta</label>
              <div><textarea id="ria-pregunta" value={pregunta} maxLength={1000} rows={2}
                onChange={event => setPregunta(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); enviar(); } }}
                placeholder="Ej.: ¿Qué variedad de soja predominó en la campaña 2025-2026?" disabled={cargando} />
                <button type="submit" disabled={cargando || !pregunta.trim()} aria-label="Enviar consulta">
                  {cargando ? <LoaderCircle size={19} className="ria-spin" /> : <Send size={19} />}
                </button></div>
              <small>Enter para enviar <span aria-hidden="true">·</span> Shift + Enter para otra línea</small>
            </form>
          </div>
        </div>}
  </section>;
}
