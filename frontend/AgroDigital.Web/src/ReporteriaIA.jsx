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
  return <svg viewBox="0 0 1000 210" preserveAspectRatio="xMidYMid slice" role="presentation">
    <defs>
      <linearGradient id="ria-trace" x1="0" x2="1"><stop stopColor="#85cf9e" stopOpacity="0" /><stop offset=".48" stopColor="#51ad73" stopOpacity=".9" /><stop offset="1" stopColor="#61b980" stopOpacity=".1" /></linearGradient>
      <radialGradient id="ria-orbit"><stop stopColor="#d2f2dc" stopOpacity=".95" /><stop offset="1" stopColor="#f9fffb" stopOpacity=".18" /></radialGradient>
    </defs>
    <g className="ria-art-waves">
      {Array.from({ length: 10 }, (_, index) => <path key={`h${index}`}
        d={`M 0 ${166 + index * 3.4} C 155 ${136 - index * 1.2}, 200 ${175 - index * 4.2}, 323 ${99 - index * 1.8} S 512 ${85 + index * 2.5}, 624 ${130 + index * 1.2} S 790 ${162 - index * 2.5}, 1000 ${116 + index * 2.3}`} />)}
      {Array.from({ length: 9 }, (_, index) => <path key={`b${index}`}
        d={`M ${index * 120} 210 C ${110 + index * 99} 172, ${186 + index * 88} 171, ${243 + index * 91} 105`} />)}
    </g>
    <g className="ria-art-connections">
      <path d="M 0 128 H 138 C 208 128 211 66 290 66 H 355 C 409 66 401 111 470 111 H 529" />
      <path d="M 0 185 H 221 C 297 185 303 133 374 133 H 466" />
      <path d="M 639 107 H 754 C 786 107 778 137 822 137 H 1000" />
      <path d="M 663 48 H 809 C 843 48 850 82 894 82 H 1000" />
      <circle cx="290" cy="66" r="5" /><circle cx="374" cy="133" r="5" /><circle cx="754" cy="107" r="5" /><circle cx="809" cy="48" r="5" />
    </g>
    <circle className="ria-art-orbit" cx="566" cy="101" r="83" fill="url(#ria-orbit)" />
    <circle className="ria-art-ring" cx="566" cy="101" r="69" />
    <circle className="ria-art-ring inner" cx="566" cy="101" r="52" />
    <g className="ria-art-leaf">
      <path d="M 566 142 C 562 116 560 95 568 68" />
      <path d="M 566 119 C 538 121 528 101 532 80 C 552 82 566 93 566 119 Z" />
      <path d="M 563 102 C 589 104 603 86 600 57 C 578 62 565 75 563 102 Z" />
    </g>
  </svg>;
}

async function leerError(response) {
  const body = await response.text();
  try {
    const json = JSON.parse(body);
    return json.title || json.detail || (typeof json === 'string' ? json : body);
  } catch { return body || `Error ${response.status}`; }
}

export default function ReporteriaIA({ session, parentFilters, selectedEmpresaId, selectedEmpresaName, puedeVer, promptInicial, onPromptInicialConsumido }) {
  const [recientes, setRecientes] = useState([]);
  const [conversacionId, setConversacionId] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [pregunta, setPregunta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
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

  useEffect(() => {
    if (!promptInicial || !puedeVer || String(promptInicial.empresaId) !== String(selectedEmpresaId)) return;
    setConversacionId(null);
    setMensajes([]);
    setError('');
    setPregunta(promptInicial.texto);
    inputRef.current?.focus();
    onPromptInicialConsumido?.(promptInicial.id);
  }, [promptInicial, selectedEmpresaId, puedeVer, onPromptInicialConsumido]);

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
      <div className="ria-header-art" aria-hidden="true"><TramaFutura /></div>
      <div className="ria-heading-actions">
        <div className="ria-tagline">DATOS REALES<br /><span>DECISIONES CON <em>IMPACTO</em></span></div>
        <button className="ria-new" type="button" onClick={nueva} disabled={cargando}><Plus size={18} /> Nueva consulta</button>
      </div>
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
              <div><textarea ref={inputRef} id="ria-pregunta" value={pregunta} maxLength={1000} rows={2}
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
