import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  CalendarDays, ChevronLeft, ChevronRight, Eye, List, LoaderCircle, Map as MapIcon,
  PlusCircle, Search, Sprout, Tractor, Warehouse, Wheat
} from 'lucide-react';
import InicioAgenda from './InicioAgenda';
import { EventoAgenda, fechaCorta, haceDias, leerError, numero, saludo, toneladas } from './inicioUtils';
import './inicio.css';

/*
  Pantalla Principal (Inicio). Solo informativa: la unica accion es "Ver".
  Estados (los decide la API, GET /api/inicio/resumen):
    - SinLotes:    bienvenida; el boton "Registrar Lote" solo para el Encargado.
    - SinCampania: aviso + silos + agenda (los silos no dependen de la campania).
    - ConCampania: KPIs (Gerente/Encargado), avance, agenda, silos y tabla de lotes.
*/

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const LOTES_POR_PAGINA = 10;

export const ETAPAS = [
  { codigo: 0, nombre: 'Sin iniciar', color: '#dfe8e1', texto: '#14311f' },
  { codigo: 1, nombre: 'Siembra', color: '#83c994', texto: '#0a4327' },
  { codigo: 2, nombre: 'Cosecha', color: '#e8b23a', texto: '#3d2a00' },
  { codigo: 3, nombre: 'Destino del grano', color: '#3c7fb1', texto: '#ffffff' },
  { codigo: 4, nombre: 'Finalizado', color: '#0a4327', texto: '#ffffff' }
];

// Modulo al que lleva "Ver" segun la etapa de la combinacion.
const MODULO_POR_ETAPA = ['campanias', 'siembras', 'cosechas', 'campanias', 'campanias'];

// ===========================================================================
// Modulo
// ===========================================================================

export default function Inicio({
  session,
  parentFilters = null,
  selectedEmpresaId = '',
  selectedCampaniaId = '',
  lotes = [],
  onNavigate,
  onRegistrarLote
}) {
  const [resumen, setResumen] = useState(null);
  const [agenda, setAgenda] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [vista, setVista] = useState('lista');
  const [agendaAbierta, setAgendaAbierta] = useState(false);
  const tablaRef = useRef(null);

  const headers = useMemo(() => (session?.token ? { Authorization: `Bearer ${session.token}` } : {}), [session?.token]);

  // ---- Resumen y agenda corta (7 dias) ----
  useEffect(() => {
    if (!selectedEmpresaId) return undefined;
    let vigente = true;

    const query = new URLSearchParams({ empresaId: selectedEmpresaId });
    if (selectedCampaniaId) query.set('campaniaId', selectedCampaniaId);
    const queryAgenda = new URLSearchParams(query);
    queryAgenda.set('dias', '7');

    setCargando(true);
    setError('');
    Promise.all([
      fetch(`${API_BASE_URL}/api/inicio/resumen?${query}`, { headers }).then(async (r) => {
        if (!r.ok) throw new Error(await leerError(r));
        return r.json();
      }),
      fetch(`${API_BASE_URL}/api/inicio/agenda?${queryAgenda}`, { headers })
        .then((r) => (r.ok ? r.json() : { eventos: [] }))
        .catch(() => ({ eventos: [] }))
    ])
      .then(([datosResumen, datosAgenda]) => {
        if (!vigente) return;
        setResumen(datosResumen);
        setAgenda(datosAgenda?.eventos ?? []);
        setFiltro('todos');
        setPagina(1);
      })
      .catch((e) => {
        if (vigente) setError(e.message || 'No se pudo cargar la pantalla principal.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => { vigente = false; };
  }, [selectedEmpresaId, selectedCampaniaId, headers]);

  // ---- Tabla de lotes: filtro + busqueda + paginacion ----
  const lotesFiltrados = useMemo(() => {
    const filas = resumen?.lotes ?? [];
    const texto = busqueda.trim().toLowerCase();
    return filas.filter((l) => {
      if (filtro === 'alertas' && l.atencionNivel !== 'Atencion') return false;
      if (filtro === 'finalizar' && !l.listoParaFinalizar) return false;
      if (filtro.startsWith('etapa-') && `etapa-${l.etapaCodigo}` !== filtro) return false;
      if (texto && !`${l.loteNombre} ${l.loteCiudad ?? ''} ${l.producto}`.toLowerCase().includes(texto)) return false;
      return true;
    });
  }, [resumen, filtro, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(lotesFiltrados.length / LOTES_POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const lotesPagina = lotesFiltrados.slice((paginaActual - 1) * LOTES_POR_PAGINA, paginaActual * LOTES_POR_PAGINA);

  function elegirFiltro(valor, desplazar = false) {
    setFiltro(valor);
    setPagina(1);
    setVista('lista');
    if (desplazar) tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const nombre = (session?.name || '').trim().split(' ')[0];
  const hoyTexto = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  const encabezado = (
    <div className="page-heading">
      <div>
        <h1>{saludo()}{nombre ? `, ${nombre}` : ''}</h1>
        <p className="ini-subtitulo">
          <span className="ini-capitalizar">{hoyTexto}</span>
          {resumen?.campania && <> · {resumen.campania.nombre} · {resumen.lotes.length} {resumen.lotes.length === 1 ? 'lote' : 'lotes'}</>}
        </p>
      </div>
    </div>
  );

  // ---- Estados sin datos ----
  if (!selectedEmpresaId) {
    return (
      <section className="content-panel list-panel">
        {encabezado}
        {parentFilters}
        <EstadoVacio titulo="Elegí una empresa" texto="La pantalla principal muestra la información de una empresa." />
      </section>
    );
  }

  if (cargando && !resumen) {
    return (
      <section className="content-panel list-panel">
        {encabezado}
        {parentFilters}
        <div className="dashboard-card ini-cargando"><LoaderCircle className="spin-icon" size={28} /> Cargando…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="content-panel list-panel">
        {encabezado}
        {parentFilters}
        <p className="ini-error" role="alert">{error}</p>
      </section>
    );
  }

  if (!resumen) return null;

  if (resumen.estado === 'SinLotes') {
    return (
      <section className="content-panel list-panel">
        {encabezado}
        {parentFilters}
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Tractor size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Bienvenido a AgroDigital</h2>
            <p>
              {resumen.puedeRegistrarLotes
                ? 'Aún no tenés lotes registrados. Registrá tus lotes y comenzá a operar con AgroDigital.'
                : 'Todavía no hay lotes registrados. Consultá con el Encargado de tu empresa.'}
            </p>
          </div>
          {resumen.puedeRegistrarLotes && (
            <button className="green-button empty-state-action" type="button" onClick={onRegistrarLote}>
              <PlusCircle size={18} />
              <span>Registrar Lote</span>
            </button>
          )}
        </section>
      </section>
    );
  }

  const agendaPanel = (
    <InicioAgenda
      abierta={agendaAbierta}
      onCerrar={() => setAgendaAbierta(false)}
      headers={headers}
      empresaId={selectedEmpresaId}
      campaniaId={resumen.campania?.campaniaId ?? ''}
      campaniaNombre={resumen.campania?.nombre ?? ''}
      onNavigate={onNavigate}
    />
  );

  const filaSecundaria = (
    <div className="ini-fila">
      <AgendaCorta eventos={agenda} onVerAgenda={() => setAgendaAbierta(true)} onNavigate={onNavigate} />
      <SilosCard silos={resumen.silos} onNavigate={onNavigate} />
    </div>
  );

  if (resumen.estado === 'SinCampania') {
    return (
      <section className="content-panel list-panel">
        {encabezado}
        {parentFilters}
        <section className="dashboard-card ini-aviso">
          <CalendarDays size={28} />
          <div>
            <h2>No hay una campaña en curso</h2>
            <p>Todas las campañas de la empresa están finalizadas. Cuando se registre una nueva, vas a ver acá su avance.</p>
          </div>
          <button className="ini-boton-ver" type="button" onClick={() => onNavigate?.('campanias')}>
            <Eye size={16} /> Ver campañas
          </button>
        </section>
        {filaSecundaria}
        {agendaPanel}
      </section>
    );
  }

  // ---- Con campania ----
  const chips = [
    { id: 'todos', texto: 'Todos', cantidad: resumen.lotes.length },
    { id: 'alertas', texto: 'Con alertas', cantidad: resumen.lotesConAlertas },
    { id: 'finalizar', texto: 'Listos para finalizar', cantidad: resumen.lotesListosParaFinalizar },
    ...resumen.etapas.map((e) => ({ id: `etapa-${e.codigo}`, texto: e.nombre, cantidad: e.lotes }))
  ];

  return (
    <section className="content-panel list-panel">
      {encabezado}
      {parentFilters}

      {resumen.indicadores ? (
        <Indicadores datos={resumen.indicadores} />
      ) : (
        <p className="ini-nota">Los indicadores agregados de la campaña están disponibles para los roles Gerente y Encargado.</p>
      )}

      <Avance etapas={resumen.etapas} cultivos={resumen.cultivos} filtro={filtro} onElegir={(id) => elegirFiltro(filtro === id ? 'todos' : id, true)} />

      <section className="dashboard-card ini-tarjeta" ref={tablaRef} aria-labelledby="ini-lotes-titulo">
        <div className="ini-tarjeta-cabecera">
          <h2 id="ini-lotes-titulo">Lotes de la campaña</h2>
          <div className="ini-herramientas">
            <label className="ini-buscador">
              <Search size={16} aria-hidden="true" />
              <span className="ini-oculto">Buscar lote</span>
              <input
                type="search"
                value={busqueda}
                placeholder="Buscar lote, ciudad o cultivo"
                onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
              />
            </label>
            <div className="ini-segmento" role="group" aria-label="Forma de ver los lotes">
              <button type="button" className={vista === 'lista' ? 'activo' : ''} aria-pressed={vista === 'lista'} onClick={() => setVista('lista')}>
                <List size={16} /> Lista
              </button>
              <button type="button" className={vista === 'mapa' ? 'activo' : ''} aria-pressed={vista === 'mapa'} onClick={() => setVista('mapa')}>
                <MapIcon size={16} /> Mapa
              </button>
            </div>
          </div>
        </div>

        <div className="ini-chips" role="group" aria-label="Filtrar lotes">
          {chips.map((c) => (
            <button key={c.id} type="button" className={filtro === c.id ? 'activo' : ''} aria-pressed={filtro === c.id} onClick={() => elegirFiltro(c.id)}>
              {c.texto} <span>{c.cantidad}</span>
            </button>
          ))}
        </div>

        {vista === 'lista' ? (
          <>
            <TablaLotes filas={lotesPagina} onNavigate={onNavigate} />
            <div className="ini-pie-tabla">
              <span>Mostrando {lotesPagina.length} de {lotesFiltrados.length} · ordenados por prioridad</span>
              {totalPaginas > 1 && (
                <div className="ini-paginas">
                  <button type="button" aria-label="Página anterior" disabled={paginaActual === 1} onClick={() => setPagina(paginaActual - 1)}><ChevronLeft size={16} /></button>
                  <span>{paginaActual} / {totalPaginas}</span>
                  <button type="button" aria-label="Página siguiente" disabled={paginaActual === totalPaginas} onClick={() => setPagina(paginaActual + 1)}><ChevronRight size={16} /></button>
                </div>
              )}
            </div>
          </>
        ) : (
          <MapaLotes filas={lotesFiltrados} lotes={lotes} />
        )}
      </section>

      {filaSecundaria}

      {agendaPanel}
    </section>
  );
}

// ===========================================================================
// Piezas
// ===========================================================================

function EstadoVacio({ titulo, texto }) {
  return (
    <section className="empty-state dashboard-card">
      <div className="empty-state-icon"><Tractor size={92} strokeWidth={1.8} /></div>
      <div className="empty-state-copy">
        <h2>{titulo}</h2>
        <p>{texto}</p>
      </div>
    </section>
  );
}

function Indicadores({ datos }) {
  // Mismo estilo que las tarjetas resumen de Lotes y Campañas (.summary-card).
  return (
    <section className="summary-grid summary-grid-four" aria-label="Indicadores de la campaña">
      <article className="summary-card">
        <div className="summary-icon"><MapIcon size={28} /></div>
        <div><span>Superficie en campaña</span><strong>{numero(datos.superficieHa)} ha</strong></div>
        <p>{datos.cantidadLotes} {datos.cantidadLotes === 1 ? 'lote' : 'lotes'} · {datos.cantidadCultivos} {datos.cantidadCultivos === 1 ? 'cultivo' : 'cultivos'}</p>
      </article>
      <article className="summary-card">
        <div className="summary-icon"><Sprout size={28} /></div>
        <div><span>Sembrado</span><strong>{numero(datos.sembradoPct ?? 0)}%</strong></div>
        <div className="ini-progreso ini-kpi-progreso"><span style={{ width: `${datos.sembradoPct ?? 0}%`, background: '#18883b' }} /></div>
        <p>{numero(datos.sembradoHa)} de {numero(datos.superficieHa)} ha</p>
      </article>
      <article className="summary-card">
        <div className="summary-icon"><Wheat size={28} /></div>
        <div><span>Cosechado</span><strong>{numero(datos.cosechadoPct ?? 0)}%</strong></div>
        <div className="ini-progreso ini-kpi-progreso"><span style={{ width: `${datos.cosechadoPct ?? 0}%`, background: '#c48a12' }} /></div>
        <p>{numero(datos.cosechadoHa)} de {numero(datos.superficieHa)} ha</p>
      </article>
      <article className="summary-card">
        <div className="summary-icon"><Warehouse size={28} /></div>
        <div><span>Grano en silos</span><strong>{toneladas(datos.stockSilosKg)} t</strong></div>
        <p>{datos.ocupacionSilosPct == null ? 'Sin silos registrados' : `${numero(datos.ocupacionSilosPct)}% de ocupación · ${datos.cantidadSilos} ${datos.cantidadSilos === 1 ? 'silo' : 'silos'}`}</p>
      </article>
    </section>
  );
}

function Avance({ etapas, cultivos, filtro, onElegir }) {
  const conSuperficie = etapas.filter((e) => e.hectareas > 0);

  return (
    <section className="dashboard-card ini-tarjeta" aria-labelledby="ini-avance-titulo">
      <div className="ini-tarjeta-cabecera">
        <h2 id="ini-avance-titulo">Avance de la campaña</h2>
        <span className="ini-ayuda">Por superficie · tocá una etapa para filtrar los lotes</span>
      </div>

      <div className="ini-barra-etapas">
        {conSuperficie.map((e) => {
          const etapa = ETAPAS[e.codigo];
          const activo = filtro === `etapa-${e.codigo}`;
          return (
            <button
              key={e.codigo}
              type="button"
              className={activo ? 'activo' : ''}
              style={{ flexGrow: e.hectareas, background: etapa.color, color: etapa.texto }}
              aria-label={`${e.nombre}: ${e.lotes} lotes, ${numero(e.porcentaje ?? 0)}% de la superficie`}
              aria-pressed={activo}
              onClick={() => onElegir(`etapa-${e.codigo}`)}
            >
              {numero(e.porcentaje ?? 0)}%
            </button>
          );
        })}
      </div>

      <div className="ini-leyenda-etapas">
        {etapas.map((e) => (
          <div key={e.codigo}>
            <span className="ini-muestra" style={{ background: ETAPAS[e.codigo].color }} aria-hidden="true" />
            <div>
              <small>{e.nombre}</small>
              <strong>{e.lotes} {e.lotes === 1 ? 'lote' : 'lotes'}</strong>
              <small>{numero(e.hectareas)} ha</small>
            </div>
          </div>
        ))}
      </div>

      {cultivos.length > 0 && (
        <div className="ini-cultivos">
          {cultivos.map((c) => {
            const sembrado = c.hectareas > 0 ? (c.sembradoHa * 100) / c.hectareas : 0;
            const cosechado = c.hectareas > 0 ? (c.cosechadoHa * 100) / c.hectareas : 0;
            return (
              <div key={c.producto} className="ini-cultivo">
                <div className="ini-cultivo-titulo">
                  <strong>{c.producto}</strong>
                  <small>{c.lotes} {c.lotes === 1 ? 'lote' : 'lotes'} · {numero(c.hectareas)} ha</small>
                </div>
                <div className="ini-progreso" aria-label={`${numero(sembrado)}% sembrado, ${numero(cosechado)}% cosechado`}>
                  <span style={{ width: `${cosechado}%`, background: '#c48a12' }} />
                  <span style={{ width: `${Math.max(0, sembrado - cosechado)}%`, background: '#83c994' }} />
                </div>
                <small>
                  {c.rindePromedioKgHa != null
                    ? `Rinde a la fecha ${numero(c.rindePromedioKgHa)} kg/ha · `
                    : ''}
                  {c.lotesCosechados} {c.lotesCosechados === 1 ? 'lote cosechado' : 'lotes cosechados'}
                </small>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AgendaCorta({ eventos, onVerAgenda, onNavigate }) {
  // Primero lo vencido y lo que esta en transito, despues lo proximo. Maximo 5.
  const orden = { Vencidos: 0, EnTransito: 1, Proximos: 2 };
  const visibles = [...eventos].sort((a, b) => (orden[a.grupo] - orden[b.grupo]) || a.fecha.localeCompare(b.fecha)).slice(0, 5);

  return (
    <section className="dashboard-card ini-tarjeta" aria-labelledby="ini-agenda-titulo">
      <div className="ini-tarjeta-cabecera">
        <h2 id="ini-agenda-titulo">Próximos 7 días</h2>
        <button className="ini-enlace" type="button" onClick={onVerAgenda}>Ver agenda</button>
      </div>
      {visibles.length === 0 ? (
        <p className="ini-vacio">No hay eventos programados para esta semana.</p>
      ) : (
        <ul className="ini-eventos">
          {visibles.map((ev) => (
            <EventoAgenda key={`${ev.subtipo}-${ev.referenciaId}-${ev.fecha}`} evento={ev} onNavigate={onNavigate} compacto />
          ))}
        </ul>
      )}
    </section>
  );
}

function SilosCard({ silos, onNavigate }) {
  return (
    <section className="dashboard-card ini-tarjeta" aria-labelledby="ini-silos-titulo">
      <div className="ini-tarjeta-cabecera">
        <h2 id="ini-silos-titulo">Silos</h2>
        <button className="ini-enlace" type="button" onClick={() => onNavigate?.('silos')}>Ir a Silos</button>
      </div>
      {silos.length === 0 ? (
        <p className="ini-vacio"><Warehouse size={16} /> La empresa no tiene silos registrados.</p>
      ) : (
        <ul className="ini-silos">
          {silos.map((s) => {
            const color = s.ocupacionPct >= 90 ? '#b3261e' : s.ocupacionPct >= 70 ? '#c48a12' : '#18883b';
            const estadoClase = { 'Crítico': 'critico', 'Atención': 'atencion', Normal: 'normal' }[s.estadoControl] ?? 'neutro';
            return (
              <li key={s.siloId}>
                <div className="ini-silo-titulo">
                  <span><strong>{s.nombre}</strong>{s.producto ? ` · ${s.producto}` : ''}</span>
                  <span className={`ini-estado ini-estado-${estadoClase}`}>{s.estadoControl}</span>
                </div>
                <div className="ini-progreso"><span style={{ width: `${Math.min(100, s.ocupacionPct)}%`, background: color }} /></div>
                <small>
                  {numero(s.ocupacionPct)}% · {toneladas(s.stockKg)} de {toneladas(s.capacidadKg)} t
                  {s.controlVencido && ' · control vencido'}
                  {!s.controlVencido && s.fechaProximoControl && ` · próximo control ${fechaCorta(s.fechaProximoControl)}`}
                </small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PasosEtapa({ codigo }) {
  // 4 tramos: Siembra, Cosecha, Destino, Finalizado.
  return (
    <div className="ini-pasos" aria-hidden="true">
      {[1, 2, 3, 4].map((n) => {
        const estado = codigo === 4 || codigo > n ? 'hecho' : codigo === n ? 'actual' : '';
        return <span key={n} className={estado} />;
      })}
    </div>
  );
}

function TablaLotes({ filas, onNavigate }) {
  if (filas.length === 0) {
    return <p className="ini-vacio">No hay lotes que coincidan con el filtro.</p>;
  }

  return (
    <div className="ini-tabla-contenedor">
      <table className="ini-tabla">
        <thead>
          <tr>
            <th scope="col">Lote</th>
            <th scope="col">Cultivo</th>
            <th scope="col" className="ini-num">Sup.</th>
            <th scope="col">Etapa</th>
            <th scope="col">Último movimiento</th>
            <th scope="col">Atención</th>
            <th scope="col" className="ini-num">Acción</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((l) => {
            const nivel = l.atencionNivel === 'Atencion' ? 'atencion' : l.atencionNivel === 'Info' ? 'info' : 'neutro';
            return (
              <tr key={l.campaniaCombinacionId}>
                <td><strong>{l.loteNombre}</strong>{l.loteCiudad && <small>{l.loteCiudad}</small>}</td>
                <td>{l.producto}</td>
                <td className="ini-num">{numero(l.hectareas, l.hectareas < 10 ? 1 : 0)} ha</td>
                <td>
                  <PasosEtapa codigo={l.etapaCodigo} />
                  <small className="ini-etapa-nombre">{l.etapaNombre}</small>
                </td>
                <td>
                  {l.ultimoMovimientoDescripcion ?? '-'}
                  {l.ultimoMovimientoFecha && <small>{haceDias(l.ultimoMovimientoFecha)}</small>}
                </td>
                <td><span className={`ini-estado ini-estado-${nivel}`}>{l.atencionTexto}</span></td>
                <td className="ini-num">
                  <button className="ini-boton-ver" type="button" onClick={() => onNavigate?.(MODULO_POR_ETAPA[l.etapaCodigo])}>
                    <Eye size={15} /> Ver
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MapaLotes({ filas, lotes }) {
  const [nodo, setNodo] = useState(null);
  const lotesPorId = useMemo(() => new Map(lotes.map((l) => [l.loteId, l])), [lotes]);
  const conPoligono = useMemo(
    () => filas.filter((f) => (lotesPorId.get(f.loteId)?.coordenadas?.length ?? 0) >= 3),
    [filas, lotesPorId]
  );

  useEffect(() => {
    if (!nodo) return undefined;

    const mapa = L.map(nodo, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Tiles © Esri'
    }).addTo(mapa);

    const capa = L.featureGroup().addTo(mapa);
    conPoligono.forEach((f) => {
      const puntos = [...lotesPorId.get(f.loteId).coordenadas]
        .sort((a, b) => a.orden - b.orden)
        .map((c) => [Number(c.latitud), Number(c.longitud)]);
      const etapa = ETAPAS[f.etapaCodigo];
      const conAlerta = f.atencionNivel === 'Atencion';

      L.polygon(puntos, {
        color: conAlerta ? '#b3261e' : '#ffffff',
        weight: conAlerta ? 3 : 1.5,
        fillColor: etapa.color,
        fillOpacity: 0.75
      })
        .bindTooltip(
          `<strong>${f.loteNombre}</strong><br>${f.producto} · ${etapa.nombre}<br>${f.atencionTexto}`,
          { sticky: true }
        )
        .addTo(capa);
    });

    if (capa.getLayers().length > 0) {
      mapa.fitBounds(capa.getBounds(), { padding: [24, 24] });
    } else {
      mapa.setView([-31.4, -64.2], 7);
    }

    return () => mapa.remove();
  }, [nodo, conPoligono, lotesPorId]);

  return (
    <>
      <div className="ini-mapa" ref={setNodo} role="img" aria-label="Mapa de lotes coloreados según su etapa" />
      <div className="ini-leyenda-mapa">
        {ETAPAS.map((e) => (
          <span key={e.codigo}><span className="ini-muestra" style={{ background: e.color }} aria-hidden="true" />{e.nombre}</span>
        ))}
        <span><span className="ini-muestra ini-muestra-alerta" aria-hidden="true" />Lote con alerta</span>
        {conPoligono.length < filas.length && (
          <span className="ini-ayuda">{filas.length - conPoligono.length} lote(s) sin perímetro cargado no se muestran.</span>
        )}
      </div>
    </>
  );
}
