import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Edit,
  Eye,
  FileText,
  Home,
  LoaderCircle,
  MapPin,
  PlusCircle,
  RotateCcw,
  Scale,
  Search,
  Settings,
  Sprout,
  Trash2,
  Truck,
  Upload,
  User,
  Warehouse,
  Wheat,
  X
} from 'lucide-react';

/*
  Distribucion (rediseno acordado, ver AGENTS.md).
  - Envios: indicadores + tabla por camion / Carta de Porte.
  - Registrar: un envio con todos sus camiones. Si sale de un silo genera el egreso FIFO.
  - Conciliar: recepcion y liquidacion por camion, con la merma esperada calculada en vivo.
  - Detalle: trazabilidad lote -> siembra -> cosecha -> silo -> camion -> destino.
  - Catalogos (transportistas, choferes, camiones, destinos) y parametros por grano.
  Los kg despachados no se editan nunca; solo los datos logisticos del camion.
*/

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';

const ROLES_GESTION = ['Gerente', 'Encargado', 'EmpleadoAdministrativo', 'Admin'];
const ROLES_PARAMETROS = ['Gerente', 'Encargado', 'Admin'];
const TIPOS_DESTINO = ['Acopiadora', 'Cooperativa', 'Puerto', 'Industria', 'Otro'];

const ESTADO_TEXTO = { 'En transito': 'En tránsito', Recibido: 'Recibido', Conciliado: 'Conciliado' };
const ESTADO_CLASE = { 'En transito': 'info', Recibido: 'medio', Conciliado: 'bajo' };
const NIVEL_CLASE = { Bajo: 'bajo', Medio: 'medio', Alto: 'alto' };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const numero = (valor, decimales = 0) =>
  Number(valor ?? 0).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const kg = (valor) => `${numero(valor)} kg`;
const pct = (valor, decimales = 2) => (valor == null ? '-' : `${numero(valor, decimales)} %`);
const pp = (valor) => (valor == null ? '-' : `${valor > 0 ? '+' : ''}${numero(valor, 1)} pp`);

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
}

// En la base los granos se guardan sin tilde (Maiz); en pantalla se muestran con tilde.
const GRANOS_CON_TILDE = { maiz: 'Maíz' };
function granoTexto(valor) {
  if (!valor) return valor;
  return GRANOS_CON_TILDE[normalizeSearchText(valor).trim()] ?? valor;
}

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function aNumero(texto) {
  if (texto === '' || texto == null) return null;
  const valor = Number(String(texto).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(valor) ? valor : null;
}

function aDecimal(texto) {
  if (texto === '' || texto == null) return null;
  const valor = Number(String(texto).replace(',', '.'));
  return Number.isFinite(valor) ? valor : null;
}

async function readError(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (typeof data === 'string') return data;
    if (data?.errors) return Object.values(data.errors).flat().join(' ');
    return data?.title || data?.mensaje || text;
  } catch {
    return text || `Error ${response.status}`;
  }
}

function useApi(session) {
  return useMemo(() => {
    const headers = (extra = {}) => (session?.token ? { ...extra, Authorization: `Bearer ${session.token}` } : extra);

    async function request(method, path, body) {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: headers(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      if (!response.ok) throw new Error(await readError(response));
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }

    return {
      headers,
      get: (path) => request('GET', path),
      post: (path, body) => request('POST', path, body),
      put: (path, body) => request('PUT', path, body),
      del: (path) => request('DELETE', path)
    };
  }, [session?.token]);
}

function Regla({ children }) {
  return <small className="silo-hint"><span className="control-regla">Regla</span> · {children}</small>;
}

function TituloCard({ Icono, children }) {
  return <h2 className="silo-card-title"><Icono size={19} />{children}</h2>;
}

function EstadoChip({ estado, diasSinConciliar }) {
  return (
    <span className={`dist-chip dist-${ESTADO_CLASE[estado] ?? 'info'}`}>
      {ESTADO_TEXTO[estado] ?? estado}
      {estado === 'Recibido' && diasSinConciliar != null && <> · {diasSinConciliar} d sin liquidar</>}
    </span>
  );
}

function DesvioChip({ desvioPp, nivel }) {
  if (desvioPp == null || !nivel) return <span className="alm-muted">-</span>;
  return (
    <span className={`dist-chip dist-${NIVEL_CLASE[nivel]}`}>
      <span className="dist-dot" aria-hidden="true" />
      {pp(desvioPp)} · {nivel}
    </span>
  );
}

// ===========================================================================
// Modulo
// ===========================================================================

export default function Distribucion({ permisos = null, session, parentFilters = null, selectedEmpresaId = '', selectedEmpresaName = '' }) {
  const api = useApi(session);
  // Rol en la empresa seleccionada (App.jsx). Si no llega, se usa el rol general.
  const puedeGestionar = permisos ? permisos.movimientoGrano : ROLES_GESTION.includes(session?.role);
  const puedeParametros = ROLES_PARAMETROS.includes(session?.role);

  const [tab, setTab] = useState('envios');
  const [view, setView] = useState('list');
  const [camionId, setCamionId] = useState(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    setTab('envios');
    setView('list');
    setCamionId(null);
  }, [selectedEmpresaId]);

  function abrir(nuevaVista, id = null) {
    setAviso('');
    setCamionId(id);
    setView(nuevaVista);
  }

  function volver(mensaje = '') {
    setAviso(mensaje);
    setCamionId(null);
    setView('list');
  }

  if (!selectedEmpresaId) {
    return (
      <section className="content-panel list-panel">
        <div className="page-heading">
          <div>
            <h1>Distribución</h1>
            <p>Envíos de grano por camión y Carta de Porte.</p>
          </div>
        </div>
        {parentFilters}
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Truck size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Elegí una empresa</h2>
            <p>Los envíos se muestran por empresa.</p>
          </div>
        </section>
      </section>
    );
  }

  const comunes = { api, empresaId: selectedEmpresaId, empresaNombre: selectedEmpresaName, session };

  if (view === 'create') {
    return <RegistrarDistribucion {...comunes} onCancel={() => volver()} onSaved={(nombre) => volver(`${nombre} registrado. Los camiones quedaron en tránsito.`)} />;
  }

  if (view === 'conciliar') {
    return <ConciliarCamion {...comunes} camionId={camionId} puedeGestionar={puedeGestionar} onCancel={() => volver()} onSaved={(texto) => volver(texto)} />;
  }

  if (view === 'detalle') {
    return <DetalleCamion {...comunes} camionId={camionId} puedeGestionar={puedeGestionar} onBack={() => volver()} onConciliar={() => abrir('conciliar', camionId)} />;
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Distribución</h1>
          <p>Envíos de grano por camión y su conciliación con lo liquidado por la acopiadora.</p>
        </div>
        {puedeGestionar && tab === 'envios' && (
          <button className="green-button add-lote-button" type="button" onClick={() => abrir('create')}>
            <PlusCircle size={18} />
            <span>Registrar distribución</span>
          </button>
        )}
      </div>

      {parentFilters}

      <div className="alm-tabs" role="tablist" aria-label="Vistas de distribución">
        <button type="button" role="tab" aria-selected={tab === 'envios'} className={tab === 'envios' ? 'active' : ''} onClick={() => setTab('envios')}>Envíos</button>
        <button type="button" role="tab" aria-selected={tab === 'catalogos'} className={tab === 'catalogos' ? 'active' : ''} onClick={() => setTab('catalogos')}>Choferes, camiones y destinos</button>
        <button type="button" role="tab" aria-selected={tab === 'parametros'} className={tab === 'parametros' ? 'active' : ''} onClick={() => setTab('parametros')}>Parámetros por grano</button>
      </div>

      {aviso && <p className="dist-aviso" role="status"><CheckCircle2 size={18} />{aviso}</p>}

      {!puedeGestionar && tab !== 'parametros' && (
        <p className="dist-rol" role="note">
          <Eye size={18} />
          <span>Tu rol tiene acceso de consulta. Los envíos, las conciliaciones y los catálogos los cargan el Encargado o el Empleado Administrativo.</span>
        </p>
      )}

      {tab === 'envios' && (
        <EnviosList
          {...comunes}
          puedeGestionar={puedeGestionar}
          onAdd={() => abrir('create')}
          onDetalle={(id) => abrir('detalle', id)}
          onConciliar={(id) => abrir('conciliar', id)}
        />
      )}
      {tab === 'catalogos' && <CatalogosView {...comunes} puedeGestionar={puedeGestionar} />}
      {tab === 'parametros' && <ParametrosView {...comunes} puedeEditar={puedeParametros} />}
    </section>
  );
}

// ===========================================================================
// Envios: indicadores + tabla por camion
// ===========================================================================

function EnviosList({ api, empresaId, puedeGestionar, onAdd, onDetalle, onConciliar }) {
  const [camiones, setCamiones] = useState([]);
  const [indicadores, setIndicadores] = useState(null);
  const [campanias, setCampanias] = useState([]);
  const [filtros, setFiltros] = useState({ campaniaId: '', estado: '', desde: '', hasta: '', texto: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function cargar(f = filtros) {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ empresaId });
      if (f.campaniaId) query.set('campaniaId', f.campaniaId);
      if (f.desde) query.set('desde', f.desde);
      if (f.hasta) query.set('hasta', f.hasta);
      const queryTabla = new URLSearchParams(query);
      if (f.estado) queryTabla.set('estado', f.estado);

      const [lista, kpis] = await Promise.all([
        api.get(`/api/distribuciones/camiones?${queryTabla}`),
        api.get(`/api/distribuciones/indicadores?${query}`)
      ]);
      setCamiones(lista);
      setIndicadores(kpis);

      // Las opciones de campania salen de la lista sin filtrar, para que no desaparezcan al elegir una.
      if (!f.campaniaId && !f.estado && !f.desde && !f.hasta) {
        const opciones = new Map();
        lista.forEach((c) => { if (c.campaniaId) opciones.set(c.campaniaId, c.campania); });
        setCampanias([...opciones].map(([valor, texto]) => ({ valor: String(valor), texto })));
      }
    } catch (err) {
      setError(`No se pudieron cargar los envíos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function cambiar(campo, valor) {
    const siguientes = { ...filtros, [campo]: valor };
    setFiltros(siguientes);
    if (campo !== 'texto') cargar(siguientes);
  }

  function limpiar() {
    const vacios = { campaniaId: '', estado: '', desde: '', hasta: '', texto: '' };
    setFiltros(vacios);
    cargar(vacios);
  }

  const filtrados = useMemo(() => {
    const texto = normalizeSearchText(filtros.texto.trim());
    if (!texto) return camiones;
    return camiones.filter((c) =>
      [c.codigoCpe, c.chofer, c.transportista, c.patente, c.destino, c.distribucion, c.producto, c.campania]
        .some((campo) => normalizeSearchText(campo).includes(texto)));
  }, [camiones, filtros.texto]);

  return (
    <>
      {indicadores && <Indicadores datos={indicadores} conCampania={Boolean(filtros.campaniaId)} />}

      <div className="filters-card dist-filtros">
        <label className="search-field">
          <Search size={21} />
          <input data-text-case="preserve" value={filtros.texto} onChange={(e) => cambiar('texto', e.target.value)} placeholder="Buscar por CPE, chofer, patente o destino..." />
        </label>
        <select value={filtros.campaniaId} onChange={(e) => cambiar('campaniaId', e.target.value)} aria-label="Filtrar por campaña">
          <option value="">Campaña</option>
          {campanias.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
        </select>
        <select value={filtros.estado} onChange={(e) => cambiar('estado', e.target.value)} aria-label="Filtrar por estado">
          <option value="">Estado</option>
          {Object.entries(ESTADO_TEXTO).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
        </select>
        <label className="dist-fecha-filtro">
          <span>Salida desde</span>
          <input type="date" value={filtros.desde} onChange={(e) => cambiar('desde', e.target.value)} />
        </label>
        <label className="dist-fecha-filtro">
          <span>Hasta</span>
          <input type="date" value={filtros.hasta} onChange={(e) => cambiar('hasta', e.target.value)} />
        </label>
        <button className="clear-button" type="button" onClick={limpiar}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
      </div>

      {error && <p className="alm-error" role="alert">{error}</p>}

      {loading ? (
        <div className="table-shell dashboard-card">
          <div className="loading-state">
            <LoaderCircle className="spin" size={24} />
            <span>Cargando envíos...</span>
          </div>
        </div>
      ) : filtrados.length === 0 ? (
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Truck size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>{camiones.length === 0 ? 'Aún no registraste envíos' : 'Ningún envío coincide con los filtros'}</h2>
            <p>
              {camiones.length > 0 ? 'Probá con otro filtro o limpialos.'
                : puedeGestionar ? 'Registrá la primera salida de grano desde un silo o directo de una cosecha.'
                  : 'Cuando el Encargado o el Empleado Administrativo registren envíos, los vas a ver acá.'}
            </p>
          </div>
          {puedeGestionar && camiones.length === 0 && (
            <button className="green-button empty-state-action" type="button" onClick={onAdd}>
              <PlusCircle size={18} />
              <span>Registrar distribución</span>
            </button>
          )}
        </section>
      ) : (
        <div className="table-shell dashboard-card">
          <table className="lotes-table dist-tabla">
            <thead>
              <tr>
                <th>Salida</th>
                <th>Carta de Porte</th>
                <th>Chofer y camión</th>
                <th>Destino</th>
                <th className="dist-num">Despachado</th>
                <th className="dist-num">Liquidado</th>
                <th className="dist-num">Merma</th>
                <th>Desvío</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.distribucionCamionId} className={c.estado === 'Recibido' ? 'dist-fila-pendiente' : undefined}>
                  <td>{formatDate(c.fechaSalida)}<div className="alm-sub">{c.distribucion}</div></td>
                  <td className="dist-cpe">{c.codigoCpe}</td>
                  <td><span className="dist-nowrap">{c.chofer}</span><div className="alm-sub">{c.patente} · {c.transportista || 'Sin transporte'}</div></td>
                  <td>{c.destino}</td>
                  <td className="dist-num">{kg(c.kgDespachados)}</td>
                  <td className="dist-num">{c.kgNetosLiquidados != null ? kg(c.kgNetosLiquidados) : '-'}</td>
                  <td className="dist-num">{c.mermaTotalPct != null && c.estado === 'Conciliado' ? pct(c.mermaTotalPct) : '-'}</td>
                  <td><DesvioChip desvioPp={c.desvioPp} nivel={c.nivelDesvio} /></td>
                  <td>
                    <EstadoChip estado={c.estado} />
                    {c.estado === 'Recibido' && c.diasSinConciliar != null && <div className="alm-sub">{c.diasSinConciliar} días sin liquidar</div>}
                  </td>
                  <td className="actions-cell lote-actions-cell">
                    <div className="actions-cell-content">
                      <button type="button" aria-label={`Ver detalle y trazabilidad de ${c.codigoCpe}`} onClick={() => onDetalle(c.distribucionCamionId)}><Eye size={18} /></button>
                      {puedeGestionar && (
                        c.estado === 'Conciliado' ? (
                          <button type="button" aria-label={`Ver conciliación de ${c.codigoCpe}`} onClick={() => onConciliar(c.distribucionCamionId)}><ClipboardCheck size={18} /></button>
                        ) : (
                          <button type="button" className="dist-accion-texto" aria-label={`${c.estado === 'Recibido' ? 'Conciliar' : 'Registrar la llegada de'} ${c.codigoCpe}`} onClick={() => onConciliar(c.distribucionCamionId)}>
                            {c.estado === 'Recibido' ? 'Conciliar' : 'Llegada'}
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="alm-muted alm-footnote">
            Desvío: diferencia entre la merma real y la que explican la humedad y las materias extrañas informadas.
            Bajo hasta 0,5 pp · Medio hasta 1,5 pp · Alto por encima (umbrales configurables por grano).
          </p>
        </div>
      )}
    </>
  );
}

function Indicadores({ datos, conCampania }) {
  return (
    <div className="alm-kpis">
      <div className="alm-kpi alm-kpi-total">
        <span className="alm-kpi-icon"><Truck size={22} /></span>
        <div>
          <small>Kg despachados</small>
          <strong>{kg(datos.kgDespachados)}</strong>
          <p>{datos.cantidadCamiones} camiones · {datos.cantidadDestinos} destinos</p>
        </div>
      </div>

      <div className="alm-kpi">
        <span className="alm-kpi-icon"><Wheat size={22} /></span>
        <div className="dist-kpi-ancho">
          <small>Cosecha con destino</small>
          {conCampania && datos.pctDistribuido != null ? (
            <>
              <strong>{numero(datos.pctDistribuido, 0)} % <span className="dist-kpi-sufijo">distribuida</span></strong>
              <div className="dist-barra-apilada" aria-label={`${numero(datos.pctDistribuido, 0)} % distribuida, ${numero(datos.pctEnSilos, 0)} % en silos, ${numero(datos.pctSinDestino, 0)} % sin destino`}>
                <span className="dist-seg-distribuido" style={{ width: `${datos.pctDistribuido}%` }} />
                <span className="dist-seg-silos" style={{ width: `${datos.pctEnSilos}%` }} />
              </div>
              <p>En silos {numero(datos.pctEnSilos, 0)} % · Sin destino {numero(datos.pctSinDestino, 0)} %</p>
            </>
          ) : (
            <>
              <strong className="dist-kpi-vacio">-</strong>
              <p>Elegí una campaña para ver qué parte de la cosecha ya tiene destino.</p>
            </>
          )}
        </div>
      </div>

      <div className="alm-kpi">
        <span className="alm-kpi-icon"><Scale size={22} /></span>
        <div>
          <small>Merma real vs. esperada</small>
          {!datos.incluyeMerma ? (
            <>
              <strong className="dist-kpi-vacio">-</strong>
              <p>Indicador disponible para Gerente y Encargado.</p>
            </>
          ) : datos.mermaRealPct == null ? (
            <>
              <strong className="dist-kpi-vacio">-</strong>
              <p>Todavía no hay envíos conciliados con parámetros.</p>
            </>
          ) : (
            <>
              <strong>{pct(datos.mermaRealPct, 1)} <span className="dist-kpi-sufijo">vs {pct(datos.mermaEsperadaPct, 1)}</span></strong>
              <p><DesvioChip desvioPp={datos.desvioPp} nivel={datos.nivelDesvio} /> {kg(datos.kgSinJustificar)} sin justificar</p>
            </>
          )}
        </div>
      </div>

      <div className={`alm-kpi ${datos.camionesRecibidosSinConciliar > 0 ? 'dist-kpi-alerta' : ''}`}>
        <span className="alm-kpi-icon"><ClipboardCheck size={22} /></span>
        <div>
          <small>Envíos sin conciliar</small>
          <strong>{datos.camionesRecibidosSinConciliar + datos.camionesEnTransito}</strong>
          <p>
            {datos.camionesRecibidosSinConciliar} recibidos sin liquidar
            {datos.maxDiasSinConciliar != null && ` (el más antiguo, ${datos.maxDiasSinConciliar} d)`} · {datos.camionesEnTransito} en tránsito
          </p>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Registrar distribucion
// ===========================================================================

function camionVacio() {
  return { choferId: '', camionId: '', destinoId: '', codigoCpe: '', nroTicketBalanza: '', kgDespachados: '' };
}

function RegistrarDistribucion({ api, empresaId, empresaNombre, session, onCancel, onSaved }) {
  const [catalogos, setCatalogos] = useState({ choferes: [], camiones: [], destinos: [], transportistas: [] });
  const [cosechas, setCosechas] = useState([]);
  const [silos, setSilos] = useState([]);
  const [form, setForm] = useState({
    origenGrano: 'Silo',
    siloId: '',
    cosechaId: '',
    fechaSalida: todayIso(),
    responsableACargo: session?.name ?? '',
    observaciones: ''
  });
  const [camion, setCamion] = useState(camionVacio);
  const [camiones, setCamiones] = useState([]);
  const [editandoIndice, setEditandoIndice] = useState(null);
  const [disponibilidad, setDisponibilidad] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [modal, setModal] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errorCamion, setErrorCamion] = useState('');

  async function cargarCatalogos() {
    const q = `empresaId=${empresaId}`;
    const [choferes, camionesCat, destinos, transportistas] = await Promise.all([
      api.get(`/api/distribucion-catalogos/choferes?${q}`),
      api.get(`/api/distribucion-catalogos/camiones?${q}`),
      api.get(`/api/distribucion-catalogos/destinos?${q}`),
      api.get(`/api/distribucion-catalogos/transportistas?${q}`)
    ]);
    setCatalogos({ choferes, camiones: camionesCat, destinos, transportistas });
  }

  useEffect(() => {
    (async () => {
      try {
        const [silosData, cosechasData] = await Promise.all([
          api.get('/api/silos'),
          api.get(`/api/almacenamientos/cosechas-con-saldo?empresaId=${empresaId}`)
        ]);
        setSilos(silosData.filter((s) => String(s.empresaId) === String(empresaId) && Number(s.cantidadGranoAlmacenado) > 0));
        setCosechas(cosechasData);
        await cargarCatalogos();
      } catch (err) {
        setError(`No se pudieron cargar los datos del formulario: ${err.message}`);
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // Kg disponibles del origen elegido (silo o cosecha).
  useEffect(() => {
    const id = form.origenGrano === 'Silo' ? form.siloId : form.cosechaId;
    if (!id) {
      setDisponibilidad(null);
      return;
    }
    const param = form.origenGrano === 'Silo' ? `siloId=${id}` : `cosechaId=${id}`;
    api.get(`/api/distribuciones/disponibilidad?empresaId=${empresaId}&${param}`)
      .then(setDisponibilidad)
      .catch((err) => setError(err.message));
  }, [api, empresaId, form.origenGrano, form.siloId, form.cosechaId]);

  const totalCargado = camiones.reduce((suma, c, i) => suma + (i === editandoIndice ? 0 : Number(c.kgDespachados)), 0);
  const restante = disponibilidad ? Number(disponibilidad.kgDisponibles) - totalCargado : null;
  const kgCamion = aNumero(camion.kgDespachados);
  const excedeDisponible = restante != null && kgCamion != null && kgCamion > restante;
  const cpeRepetida = camion.codigoCpe.trim() !== '' && camiones.some((c, i) => i !== editandoIndice && c.codigoCpe.trim().toUpperCase() === camion.codigoCpe.trim().toUpperCase());

  const choferSel = catalogos.choferes.find((c) => String(c.choferId) === String(camion.choferId));
  const camionSel = catalogos.camiones.find((c) => String(c.camionId) === String(camion.camionId));
  const transporte = camionSel?.transportista || choferSel?.transportista || '';

  function cambiarOrigen(origen) {
    setForm((f) => ({ ...f, origenGrano: origen, siloId: '', cosechaId: '' }));
    setCamiones([]);
    setEditandoIndice(null);
  }

  function agregarCamion() {
    setErrorCamion('');
    if (!camion.choferId || !camion.camionId || !camion.destinoId) return setErrorCamion('Elegí chofer, camión y destino.');
    if (!camion.codigoCpe.trim()) return setErrorCamion('Ingresá el código de la Carta de Porte.');
    if (cpeRepetida) return setErrorCamion('Esa Carta de Porte ya está en este envío.');
    if (kgCamion == null || kgCamion <= 0) return setErrorCamion('Ingresá los kg despachados.');
    if (excedeDisponible) return setErrorCamion(`Supera lo disponible. Máximo para este camión: ${kg(restante)}.`);

    const fila = { ...camion, kgDespachados: kgCamion };
    setCamiones((lista) => (editandoIndice != null
      ? lista.map((c, i) => (i === editandoIndice ? fila : c))
      : [fila, ...lista]));
    setCamion(camionVacio());
    setEditandoIndice(null);
  }

  function editarCamion(indice) {
    const fila = camiones[indice];
    setCamion({ ...fila, kgDespachados: String(fila.kgDespachados) });
    setEditandoIndice(indice);
    setErrorCamion('');
  }

  async function registrar(event) {
    event.preventDefault();
    setError('');
    if (form.origenGrano === 'Silo' && !form.siloId) return setError('Elegí el silo de origen.');
    if (form.origenGrano === 'Cosecha' && !form.cosechaId) return setError('Elegí la cosecha de origen.');
    if (!form.responsableACargo.trim()) return setError('Indicá el responsable a cargo del envío.');
    if (camiones.length === 0) return setError('Agregá al menos un camión al envío.');
    if (editandoIndice != null) return setError('Terminá de editar el camión antes de registrar.');

    setGuardando(true);
    try {
      const envio = await api.post('/api/distribuciones', {
        empresaId: Number(empresaId),
        origenGrano: form.origenGrano,
        siloId: form.origenGrano === 'Silo' ? Number(form.siloId) : null,
        cosechaId: form.origenGrano === 'Cosecha' ? Number(form.cosechaId) : null,
        fechaSalida: form.fechaSalida,
        responsableACargo: form.responsableACargo.trim(),
        observaciones: form.observaciones.trim() || null,
        camiones: camiones.map((c) => ({
          choferId: Number(c.choferId),
          camionId: Number(c.camionId),
          destinoId: Number(c.destinoId),
          codigoCpe: c.codigoCpe.trim(),
          nroTicketBalanza: c.nroTicketBalanza.trim() || null,
          kgDespachados: c.kgDespachados
        }))
      });

      for (const archivo of archivos) {
        const datos = new FormData();
        datos.append('archivo', archivo);
        const response = await fetch(`${API_BASE_URL}/api/distribuciones/${envio.distribucionId}/documentos`, { method: 'POST', headers: api.headers(), body: datos });
        if (!response.ok) throw new Error(`El envío se registró, pero no se pudo subir ${archivo.name}: ${await readError(response)}`);
      }

      onSaved(envio.nombre);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function alGuardarCatalogo(tipo, registro) {
    await cargarCatalogos();
    const campo = { chofer: 'choferId', camion: 'camionId', destino: 'destinoId' }[tipo];
    const id = { chofer: registro.choferId, camion: registro.camionId, destino: registro.destinoId }[tipo];
    if (campo) setCamion((c) => ({ ...c, [campo]: String(id) }));
    setModal(null);
  }

  const nombre = (c) => `${c.apellido}, ${c.nombre}`;
  const pctUsado = disponibilidad && Number(disponibilidad.kgDisponibles) > 0
    ? Math.min(100, (totalCargado / Number(disponibilidad.kgDisponibles)) * 100)
    : 0;

  if (cargando) {
    return (
      <section className="content-panel create-panel">
        <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Preparando el formulario...</span></div>
      </section>
    );
  }

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Registrar distribución</h1>
          <p>Cargá el envío y cada camión que participa. La llegada y la liquidación se registran después, camión por camión.</p>
        </div>
      </div>

      <div className="alm-context">
        <Home size={18} />
        <span>Registrando en</span>
        <strong>{empresaNombre || 'Empresa seleccionada'}</strong>
        <small>Para cambiar de empresa, volvé al listado.</small>
      </div>

      {error && <p className="alm-error" role="alert">{error}</p>}

      <form onSubmit={registrar} noValidate>
        <div className="dashboard-card alm-card">
          <TituloCard Icono={Warehouse}>Origen del grano</TituloCard>
          <div className="alm-type-grid" role="radiogroup" aria-label="De dónde sale el grano">
            {[
              { valor: 'Silo', titulo: 'Desde un silo', ayuda: 'Genera el egreso del silo automáticamente.', Icono: Warehouse },
              { valor: 'Cosecha', titulo: 'Directo de la cosecha', ayuda: 'El grano va del lote al destino.', Icono: Sprout }
            ].map(({ valor, titulo, ayuda, Icono }) => (
              <button key={valor} type="button" role="radio" aria-checked={form.origenGrano === valor}
                className={`alm-type-option ${form.origenGrano === valor ? 'selected' : ''}`} onClick={() => cambiarOrigen(valor)}>
                <Icono size={22} />
                <span><strong>{titulo}</strong><small>{ayuda}</small></span>
              </button>
            ))}
          </div>

          <div className="create-grid alm-grid-4" style={{ marginTop: 16 }}>
            {form.origenGrano === 'Silo' ? (
              <label className="field">
                <span className="field-label">Silo de origen <b>*</b></span>
                <select value={form.siloId} onChange={(e) => { setForm((f) => ({ ...f, siloId: e.target.value })); setCamiones([]); }}>
                  <option value="">Seleccionar</option>
                  {silos.map((s) => <option key={s.siloId} value={s.siloId}>{s.nombre} · {granoTexto(s.producto)} · {kg(s.cantidadGranoAlmacenado)}</option>)}
                </select>
                <Regla>Solo silos con grano.</Regla>
              </label>
            ) : (
              <label className="field">
                <span className="field-label">Cosecha de origen <b>*</b></span>
                <select value={form.cosechaId} onChange={(e) => { setForm((f) => ({ ...f, cosechaId: e.target.value })); setCamiones([]); }}>
                  <option value="">Seleccionar</option>
                  {cosechas.map((c) => <option key={c.cosechaId} value={c.cosechaId}>{c.nombre} · {granoTexto(c.producto)} · {c.loteNombre}</option>)}
                </select>
                <Regla>Cosechas finalizadas con grano sin destino.</Regla>
              </label>
            )}
            <label className="field">
              Grano
              <input value={granoTexto(disponibilidad?.producto) ?? '-'} readOnly disabled />
              <Regla>Se completa desde el origen.</Regla>
            </label>
            <label className="field">
              <span className="field-label">Fecha de salida <b>*</b></span>
              <input type="date" value={form.fechaSalida} max={todayIso()} onChange={(e) => setForm((f) => ({ ...f, fechaSalida: e.target.value }))} />
              <Regla>No posterior a hoy.</Regla>
            </label>
            <label className="field">
              <span className="field-label">Responsable a cargo <b>*</b></span>
              <input value={form.responsableACargo} maxLength={150} onChange={(e) => setForm((f) => ({ ...f, responsableACargo: e.target.value }))} />
              <Regla>Quien gestiona el envío, no el chofer.</Regla>
            </label>
          </div>

          {disponibilidad && (
            <div className="dist-disponible">
              <div><small>Disponible</small><strong>{kg(disponibilidad.kgDisponibles)}</strong></div>
              <div><small>Cargado en este envío</small><strong>{kg(totalCargado)}</strong></div>
              <div><small>Restante para otros camiones</small><strong className={restante < 0 ? 'dist-negativo' : 'dist-positivo'}>{kg(Math.max(0, restante))}</strong></div>
              <div className="dist-disponible-barra">
                <div className="alm-bar alm-bar-lg"><span className="alm-bar-fill baja" style={{ width: `${pctUsado}%` }} /></div>
                <p className="alm-muted">{disponibilidad.detalle}{form.origenGrano === 'Silo' && ' Al registrar se genera el egreso del silo, tomando primero el grano más antiguo.'}</p>
              </div>
            </div>
          )}
        </div>

        <div className="dashboard-card alm-card">
          <TituloCard Icono={Truck}>{editandoIndice != null ? 'Editar camión' : 'Agregar camión'}</TituloCard>
          <div className="dist-camion-grid">
            <div className="dist-camion-col">
              <span className="dist-col-titulo">Chofer</span>
              <label className="field">
                <span className="field-label">Chofer <b>*</b></span>
                <div className="dist-select-con-alta">
                  <select value={camion.choferId} onChange={(e) => setCamion((c) => ({ ...c, choferId: e.target.value }))}>
                    <option value="">Seleccionar</option>
                    {catalogos.choferes.map((c) => <option key={c.choferId} value={c.choferId}>{nombre(c)} · DNI {c.dni}</option>)}
                  </select>
                  <button type="button" className="dist-alta-rapida" onClick={() => setModal({ tipo: 'chofer' })} aria-label="Nuevo chofer"><PlusCircle size={18} /></button>
                </div>
              </label>
              {choferSel && <p className="alm-muted dist-ficha">Tel. {choferSel.telefono}{choferSel.transportista && ` · ${choferSel.transportista}`}</p>}
            </div>

            <div className="dist-camion-col">
              <span className="dist-col-titulo">Camión</span>
              <label className="field">
                <span className="field-label">Patente <b>*</b></span>
                <div className="dist-select-con-alta">
                  <select value={camion.camionId} onChange={(e) => setCamion((c) => ({ ...c, camionId: e.target.value }))}>
                    <option value="">Seleccionar</option>
                    {catalogos.camiones.map((c) => <option key={c.camionId} value={c.camionId}>{c.patente} · {c.marca} {c.modelo}</option>)}
                  </select>
                  <button type="button" className="dist-alta-rapida" onClick={() => setModal({ tipo: 'camion' })} aria-label="Nuevo camión"><PlusCircle size={18} /></button>
                </div>
              </label>
              <label className="field">
                Transporte
                <input value={transporte || '-'} readOnly disabled />
                <Regla>Sale del camión o, si no tiene, del chofer.</Regla>
              </label>
              <label className="field">
                <span className="field-label">Kg despachados (balanza de origen) <b>*</b></span>
                <input inputMode="numeric" data-text-case="preserve" value={camion.kgDespachados}
                  className={excedeDisponible ? 'dist-input-error' : undefined}
                  aria-invalid={excedeDisponible}
                  onChange={(e) => setCamion((c) => ({ ...c, kgDespachados: e.target.value }))} />
                {excedeDisponible
                  ? <small className="dist-error-campo"><AlertTriangle size={14} />Supera lo disponible. Máximo para este camión: {kg(restante)}.</small>
                  : <Regla>Una vez registrado no se modifica.</Regla>}
              </label>
            </div>

            <div className="dist-camion-col">
              <span className="dist-col-titulo">Destino y documentación</span>
              <label className="field">
                <span className="field-label">Destino <b>*</b></span>
                <div className="dist-select-con-alta">
                  <select value={camion.destinoId} onChange={(e) => setCamion((c) => ({ ...c, destinoId: e.target.value }))}>
                    <option value="">Seleccionar</option>
                    {catalogos.destinos.map((d) => <option key={d.destinoId} value={d.destinoId}>{d.nombre} · {d.ciudad}, {d.provincia}</option>)}
                  </select>
                  <button type="button" className="dist-alta-rapida" onClick={() => setModal({ tipo: 'destino' })} aria-label="Nuevo destino"><PlusCircle size={18} /></button>
                </div>
              </label>
              <label className="field">
                <span className="field-label">Código de Carta de Porte <b>*</b></span>
                <input data-text-case="upper" value={camion.codigoCpe} maxLength={30}
                  className={cpeRepetida ? 'dist-input-error' : undefined}
                  onChange={(e) => setCamion((c) => ({ ...c, codigoCpe: e.target.value }))} />
                {cpeRepetida
                  ? <small className="dist-error-campo"><AlertTriangle size={14} />Ya está en este envío.</small>
                  : <Regla>Única por empresa: se valida al registrar.</Regla>}
              </label>
              <label className="field">
                Nº de ticket de balanza
                <input data-text-case="preserve" value={camion.nroTicketBalanza} maxLength={30} onChange={(e) => setCamion((c) => ({ ...c, nroTicketBalanza: e.target.value }))} />
              </label>
            </div>
          </div>

          {errorCamion && <p className="alm-error" role="alert">{errorCamion}</p>}

          <div className="alm-form-actions">
            {editandoIndice != null && (
              <button className="back-button" type="button" onClick={() => { setCamion(camionVacio()); setEditandoIndice(null); setErrorCamion(''); }}>Cancelar edición</button>
            )}
            <button className="green-button alm-submit" type="button" onClick={agregarCamion} disabled={!disponibilidad}>
              <PlusCircle size={17} />
              <span>{editandoIndice != null ? 'Guardar camión' : 'Agregar camión'}</span>
            </button>
          </div>

          {camiones.length > 0 && (
            <div className="table-shell dist-tabla-camiones">
              <table className="lotes-table">
                <thead>
                  <tr>
                    <th>Chofer</th>
                    <th>Patente</th>
                    <th>Destino</th>
                    <th>Carta de Porte</th>
                    <th className="dist-num">Kg despachados</th>
                    <th style={{ textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {camiones.map((c, i) => (
                    <tr key={`${c.codigoCpe}-${i}`} className={i === editandoIndice ? 'dist-fila-editando' : undefined}>
                      <td>{nombre(catalogos.choferes.find((x) => String(x.choferId) === String(c.choferId)) ?? { apellido: '-', nombre: '' })}</td>
                      <td>{catalogos.camiones.find((x) => String(x.camionId) === String(c.camionId))?.patente ?? '-'}</td>
                      <td>{catalogos.destinos.find((x) => String(x.destinoId) === String(c.destinoId))?.nombre ?? '-'}</td>
                      <td className="dist-cpe">{c.codigoCpe}</td>
                      <td className="dist-num">{kg(c.kgDespachados)}</td>
                      <td className="actions-cell lote-actions-cell">
                        <div className="actions-cell-content">
                          <button type="button" aria-label={`Editar camión ${c.codigoCpe}`} onClick={() => editarCamion(i)}><Edit size={18} /></button>
                          <button type="button" aria-label={`Quitar camión ${c.codigoCpe}`} onClick={() => { setCamiones((l) => l.filter((_, j) => j !== i)); if (editandoIndice === i) { setEditandoIndice(null); setCamion(camionVacio()); } }}><Trash2 size={18} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}><strong>Total del envío · {camiones.length} {camiones.length === 1 ? 'camión' : 'camiones'}</strong></td>
                    <td className="dist-num"><strong>{kg(camiones.reduce((s, c) => s + Number(c.kgDespachados), 0))}</strong></td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <p className="alm-muted alm-footnote">Hasta registrar podés editar o quitar camiones. Después, solo se editan los datos logísticos.</p>
            </div>
          )}
        </div>

        <div className="dashboard-card alm-card">
          <TituloCard Icono={FileText}>Observaciones y documentación</TituloCard>
          <label className="field field-wide">
            Observaciones
            <textarea className="dist-textarea" value={form.observaciones} maxLength={1000} rows={3} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
          </label>
          <Documentos modo="create" pendientes={archivos} onPendientesChange={setArchivos} api={api} textoZona="Arrastrá las Cartas de Porte o tickets de balanza, o hacé clic para subir" />
        </div>

        <div className="form-actions alm-form-actions">
          <button className="back-button" type="button" onClick={onCancel}>Cancelar</button>
          <button className="green-button alm-submit" type="submit" disabled={guardando}>
            {guardando ? <LoaderCircle className="spin" size={17} /> : <Truck size={17} />}
            <span>{guardando ? 'Registrando...' : 'Registrar distribución'}</span>
          </button>
        </div>
      </form>

      {modal && (
        <CatalogoModal
          tipo={modal.tipo}
          api={api}
          empresaId={empresaId}
          transportistas={catalogos.transportistas}
          onClose={() => setModal(null)}
          onSaved={(registro) => alGuardarCatalogo(modal.tipo, registro)}
          onTransportistaCreado={cargarCatalogos}
        />
      )}
    </section>
  );
}

// ===========================================================================
// Conciliar camion (recepcion + liquidacion)
// ===========================================================================

function ConciliarCamion({ api, camionId, puedeGestionar, onCancel, onSaved }) {
  const [traza, setTraza] = useState(null);
  const [form, setForm] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/api/distribuciones/camiones/${camionId}`)
      .then((data) => {
        const c = data.camion;
        setTraza(data);
        setForm({
          fechaLlegada: c.fechaLlegada ?? todayIso(),
          kgRecibidos: c.kgRecibidos != null ? String(c.kgRecibidos) : '',
          humedadDestino: c.humedadDestino != null ? String(c.humedadDestino).replace('.', ',') : '',
          materiasExtranasDestino: c.materiasExtranasDestino != null ? String(c.materiasExtranasDestino).replace('.', ',') : '',
          kgNetosLiquidados: c.kgNetosLiquidados != null ? String(c.kgNetosLiquidados) : '',
          nroLiquidacion: c.nroLiquidacion ?? '',
          observaciones: c.observaciones ?? ''
        });
      })
      .catch((err) => setError(err.message));
  }, [api, camionId]);

  const valores = form && {
    kgRecibidos: aNumero(form.kgRecibidos),
    humedadDestino: aDecimal(form.humedadDestino),
    materiasExtranasDestino: aDecimal(form.materiasExtranasDestino),
    kgNetosLiquidados: aNumero(form.kgNetosLiquidados)
  };
  const completo = valores && Object.values(valores).every((v) => v != null) && valores.kgRecibidos > 0 && valores.kgNetosLiquidados > 0;

  // Recalcula la merma esperada mientras se completa el formulario (la cuenta la hace la API).
  useEffect(() => {
    if (!completo) {
      setAnalisis(null);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setCalculando(true);
      try {
        setAnalisis(await api.post(`/api/distribuciones/camiones/${camionId}/conciliacion/previsualizar`, { fechaLlegada: form.fechaLlegada, ...valores }));
        setError('');
      } catch (err) {
        setAnalisis(null);
        setError(err.message);
      } finally {
        setCalculando(false);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completo, form?.kgRecibidos, form?.humedadDestino, form?.materiasExtranasDestino, form?.kgNetosLiquidados]);

  if (!traza || !form) {
    return (
      <section className="content-panel create-panel">
        {error ? <p className="alm-error" role="alert">{error}</p> : <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Cargando el envío...</span></div>}
        <button className="back-button" type="button" onClick={onCancel}>Volver</button>
      </section>
    );
  }

  const c = traza.camion;
  const conciliado = c.estado === 'Conciliado';
  const soloLectura = !puedeGestionar;
  const actualizar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function guardarRecepcion() {
    setError('');
    if (!form.fechaLlegada || valores.kgRecibidos == null || valores.kgRecibidos <= 0) return setError('Completá la fecha de llegada y los kg recibidos.');
    setGuardando(true);
    try {
      await api.put(`/api/distribuciones/camiones/${camionId}/recepcion`, { fechaLlegada: form.fechaLlegada, kgRecibidos: valores.kgRecibidos });
      onSaved(`Llegada de la CPE ${c.codigoCpe} registrada. Queda pendiente la liquidación.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function conciliar(event) {
    event.preventDefault();
    setError('');
    if (!completo) return setError('Completá todos los datos de la recepción y de la liquidación.');
    setGuardando(true);
    try {
      await api.put(`/api/distribuciones/camiones/${camionId}/conciliacion`, {
        fechaLlegada: form.fechaLlegada,
        ...valores,
        nroLiquidacion: form.nroLiquidacion.trim() || null,
        observaciones: form.observaciones.trim() || null
      });
      onSaved(`CPE ${c.codigoCpe} conciliada.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{conciliado ? 'Conciliación' : 'Conciliar envío'} <span className="dist-cpe-titulo">{c.codigoCpe}</span></h1>
          <p>{c.chofer} · {c.transportista || 'Sin transporte'} · {c.patente} → {c.destino} · {granoTexto(c.producto)}{c.campania ? ` · ${c.campania}` : ''}</p>
        </div>
        <EstadoPasos estado={c.estado} />
      </div>

      {conciliado && puedeGestionar && (
        <p className="alm-warning">Este camión ya está conciliado. Si guardás de nuevo, la merma se recalcula con los parámetros vigentes.</p>
      )}
      {error && <p className="alm-error" role="alert">{error}</p>}

      <div className="dist-resumen">
        <div><small>Despachado (balanza de origen)</small><strong>{kg(c.kgDespachados)}</strong><span>Salida {formatDate(c.fechaSalida)}{c.silo ? ` · ${c.silo}` : ''}</span></div>
        <div><small>Recibido (balanza de destino)</small><strong>{valores.kgRecibidos != null ? kg(valores.kgRecibidos) : '-'}</strong><span>{form.fechaLlegada ? `Llegada ${formatDate(form.fechaLlegada)}` : 'Sin llegada'}</span></div>
        <div><small>Neto liquidado</small><strong>{valores.kgNetosLiquidados != null ? kg(valores.kgNetosLiquidados) : '-'}</strong><span>Según la acopiadora</span></div>
        <div><small>Merma total real</small><strong>{analisis ? `${kg(analisis.mermaTotalKg)} · ${pct(analisis.mermaTotalPct)}` : '-'}</strong><span>Despachado − neto liquidado</span></div>
      </div>

      <form onSubmit={conciliar} noValidate>
        <div className="alm-form-layout dist-conciliar-layout">
          <div className="alm-form-main">
            <div className="dashboard-card alm-card">
              <TituloCard Icono={MapPin}>Recepción en destino</TituloCard>
              <div className="create-grid">
                <label className="field">
                  <span className="field-label">Fecha de llegada <b>*</b></span>
                  <input type="date" value={form.fechaLlegada} min={c.fechaSalida} max={todayIso()} onChange={actualizar('fechaLlegada')} disabled={soloLectura} />
                  <Regla>Entre la salida ({formatDate(c.fechaSalida)}) y hoy.</Regla>
                </label>
                <label className="field">
                  <span className="field-label">Kg recibidos (balanza de destino) <b>*</b></span>
                  <input inputMode="numeric" data-text-case="preserve" value={form.kgRecibidos} onChange={actualizar('kgRecibidos')} disabled={soloLectura} />
                </label>
              </div>
            </div>

            <div className="dashboard-card alm-card">
              <TituloCard Icono={ClipboardCheck}>Análisis y liquidación de la acopiadora</TituloCard>
              <div className="create-grid">
                <label className="field">
                  <span className="field-label">Humedad (%) <b>*</b></span>
                  <input inputMode="decimal" data-text-case="preserve" value={form.humedadDestino} onChange={actualizar('humedadDestino')} disabled={soloLectura} />
                  {traza.humedadCosecha != null && <Regla>En la cosecha se midió {pct(traza.humedadCosecha, 1)}.</Regla>}
                </label>
                <label className="field">
                  <span className="field-label">Materias extrañas (%) <b>*</b></span>
                  <input inputMode="decimal" data-text-case="preserve" value={form.materiasExtranasDestino} onChange={actualizar('materiasExtranasDestino')} disabled={soloLectura} />
                  {traza.impurezasCosecha != null && <Regla>Impurezas en la cosecha: {pct(traza.impurezasCosecha, 1)}.</Regla>}
                </label>
                <label className="field">
                  <span className="field-label">Kg netos liquidados <b>*</b></span>
                  <input inputMode="numeric" data-text-case="preserve" value={form.kgNetosLiquidados} onChange={actualizar('kgNetosLiquidados')} disabled={soloLectura} />
                  <Regla>No puede superar lo recibido.</Regla>
                </label>
                <label className="field">
                  Nº de liquidación
                  <input data-text-case="preserve" value={form.nroLiquidacion} maxLength={40} onChange={actualizar('nroLiquidacion')} disabled={soloLectura} />
                </label>
                <label className="field field-wide">
                  Observaciones
                  <textarea className="dist-textarea" rows={3} value={form.observaciones} maxLength={1000} onChange={actualizar('observaciones')} disabled={soloLectura} />
                </label>
              </div>
            </div>

            <div className="dashboard-card alm-card">
              <TituloCard Icono={FileText}>Documentación del camión</TituloCard>
              <Documentos
                modo={soloLectura ? 'detail' : 'edit'}
                api={api}
                distribucionId={c.distribucionId}
                distribucionCamionId={c.distribucionCamionId}
                textoZona="Adjuntá la liquidación o el certificado de análisis"
              />
            </div>
          </div>

          <aside className="alm-form-side">
            <AnalisisMerma analisis={analisis} calculando={calculando} completo={completo} />
          </aside>
        </div>

        <div className="form-actions alm-form-actions">
          <button className="back-button" type="button" onClick={onCancel}>{soloLectura ? 'Volver' : 'Cancelar'}</button>
          {!soloLectura && !conciliado && (
            <button className="back-button" type="button" onClick={guardarRecepcion} disabled={guardando}>Guardar solo la llegada</button>
          )}
          {!soloLectura && (
            <button className="green-button alm-submit" type="submit" disabled={guardando || !completo}>
              {guardando ? <LoaderCircle className="spin" size={17} /> : <ClipboardCheck size={17} />}
              <span>{guardando ? 'Guardando...' : conciliado ? 'Volver a conciliar' : 'Conciliar envío'}</span>
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function EstadoPasos({ estado }) {
  const pasos = ['En transito', 'Recibido', 'Conciliado'];
  const actual = pasos.indexOf(estado);
  return (
    <ol className="dist-pasos" aria-label="Estado del envío">
      {pasos.map((paso, i) => (
        <li key={paso} className={i <= actual ? 'hecho' : ''} aria-current={i === actual ? 'step' : undefined}>
          <span className="dist-paso-marca">{i < actual || estado === 'Conciliado' ? <CheckCircle2 size={16} /> : i + 1}</span>
          {ESTADO_TEXTO[paso]}
        </li>
      ))}
    </ol>
  );
}

function AnalisisMerma({ analisis, calculando, completo }) {
  if (!completo) {
    return (
      <div className="dashboard-card alm-card dist-analisis">
        <TituloCard Icono={Scale}>Análisis de merma</TituloCard>
        <p className="alm-muted">Completá los kg recibidos, la humedad, las materias extrañas y el neto liquidado para calcular la merma esperada.</p>
      </div>
    );
  }

  if (!analisis) {
    return (
      <div className="dashboard-card alm-card dist-analisis">
        <TituloCard Icono={Scale}>Análisis de merma</TituloCard>
        <div className="loading-state"><LoaderCircle className="spin" size={20} /><span>Calculando...</span></div>
      </div>
    );
  }

  const esperado = analisis.mermaEsperadaKg ?? 0;
  const aplicado = analisis.descuentoCalidadKg;
  const maximo = Math.max(esperado, aplicado, 1);

  return (
    <div className={`dashboard-card alm-card dist-analisis ${calculando ? 'dist-recalculando' : ''}`}>
      <div className="dist-analisis-cabecera">
        <TituloCard Icono={Scale}>Análisis de merma</TituloCard>
        {analisis.nivelDesvio && <DesvioChip desvioPp={analisis.desvioPp} nivel={analisis.nivelDesvio} />}
      </div>

      {!analisis.parametrosCompletos ? (
        <p className="alm-warning">{analisis.advertencia} Igual podés conciliar: se guardan la merma total y la diferencia de balanza.</p>
      ) : (
        <>
          <h3 className="dist-sub">Merma esperada por calidad</h3>
          <dl className="alm-kv">
            <div><dt>Secado<small>({pct(analisis.humedadBase, 1)} de humedad base)</small></dt><dd>{pct(analisis.secadoPct)}</dd></div>
            <div><dt>Manipuleo<small>Parámetro del grano</small></dt><dd>{pct(analisis.manipuleoPct)}</dd></div>
            <div><dt>Materias extrañas<small>Sobre tolerancia de {pct(analisis.toleranciaMateriasExtranasPct, 1)}</small></dt><dd>{pct(analisis.materiasExtranasExcesoPct)}</dd></div>
            <div className="alm-kv-total"><dt>Total esperado</dt><dd>{pct(analisis.mermaEsperadaPct)} · {kg(analisis.mermaEsperadaKg)}</dd></div>
          </dl>

          <h3 className="dist-sub">Descuento por calidad</h3>
          <div className="dist-comparacion">
            <span>Esperado</span>
            <div className="dist-barra"><span className="dist-barra-esperada" style={{ width: `${(esperado / maximo) * 100}%` }} /></div>
            <strong>{kg(esperado)}</strong>
            <span>Aplicado</span>
            <div className="dist-barra"><span className="dist-barra-aplicada" style={{ width: `${(aplicado / maximo) * 100}%` }} /></div>
            <strong>{kg(aplicado)}</strong>
          </div>

          <h3 className="dist-sub">De dónde sale la diferencia</h3>
          <dl className="alm-kv">
            <div><dt>Diferencia de balanza<small>Pérdida en tránsito o diferencia de balanza</small></dt><dd>{kg(analisis.diferenciaBalanzaKg)} · {pct(analisis.diferenciaBalanzaPct)}</dd></div>
            <div><dt>Descuento no justificado<small>Aplicado − esperado</small></dt><dd>{kg(analisis.descuentoNoJustificadoKg)}</dd></div>
            <div className="alm-kv-total"><dt>Total sin justificar</dt><dd>{kg(analisis.mermaNoJustificadaKg)} · {pp(analisis.desvioPp)}</dd></div>
          </dl>

          {analisis.nivelDesvio && analisis.nivelDesvio !== 'Bajo' && (
            <p className={`dist-alerta dist-alerta-${NIVEL_CLASE[analisis.nivelDesvio]}`}>
              <AlertTriangle size={18} />
              <span>
                {analisis.descuentoNoJustificadoKg > 0
                  ? `La acopiadora descontó ${kg(analisis.descuentoNoJustificadoKg)} más de lo que explican la humedad y las materias extrañas informadas. Conviene pedir el detalle de la liquidación.`
                  : 'La mayor parte de la diferencia es de balanza: revisá el ticket de origen y el de destino.'}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Detalle y trazabilidad
// ===========================================================================

function DetalleCamion({ api, camionId, puedeGestionar, onBack, onConciliar }) {
  const [traza, setTraza] = useState(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState(false);

  function cargar() {
    api.get(`/api/distribuciones/camiones/${camionId}`).then(setTraza).catch((err) => setError(err.message));
  }

  useEffect(cargar, [api, camionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!traza) {
    return (
      <section className="content-panel create-panel">
        {error ? <p className="alm-error" role="alert">{error}</p> : <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Cargando el envío...</span></div>}
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
      </section>
    );
  }

  const c = traza.camion;
  const etapas = [
    traza.lote && { Icono: MapPin, titulo: 'Lote', valor: traza.lote, detalle: [traza.loteUbicacion, traza.loteCondicion].filter(Boolean).join(' · ') },
    traza.siembra && { Icono: Sprout, titulo: 'Siembra', valor: traza.siembra, detalle: [traza.variedadSemilla, formatDate(traza.fechaSiembra)].filter(Boolean).join(' · ') },
    c.cosecha && { Icono: Wheat, titulo: 'Cosecha', valor: c.cosecha, detalle: traza.humedadCosecha != null ? `Humedad ${pct(traza.humedadCosecha, 1)} · Impurezas ${pct(traza.impurezasCosecha, 1)}` : '' },
    c.silo && { Icono: Warehouse, titulo: 'Almacenamiento', valor: c.silo, detalle: traza.partidas.length ? `${traza.partidas.length} ${traza.partidas.length === 1 ? 'partida' : 'partidas'}` : '' },
    { Icono: Truck, titulo: 'Transporte', valor: c.patente, detalle: `${c.chofer} · ${formatDate(c.fechaSalida)}` },
    { Icono: Building2, titulo: 'Destino', valor: c.destino, detalle: c.kgNetosLiquidados != null ? `Neto liquidado ${kg(c.kgNetosLiquidados)}` : ESTADO_TEXTO[c.estado] }
  ].filter(Boolean);

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Detalle de envío <span className="dist-cpe-titulo">{c.codigoCpe}</span></h1>
          <p>{c.distribucion} · {granoTexto(c.producto)} · Responsable: {c.responsableACargo}</p>
        </div>
        <div className="dist-cabecera-chips">
          <EstadoChip estado={c.estado} diasSinConciliar={c.diasSinConciliar} />
          <DesvioChip desvioPp={c.desvioPp} nivel={c.nivelDesvio} />
        </div>
      </div>

      {error && <p className="alm-error" role="alert">{error}</p>}

      <div className="dashboard-card alm-card">
        <TituloCard Icono={MapPin}>Trazabilidad del grano</TituloCard>
        <p className="alm-muted">Recorrido de los {kg(c.kgDespachados)} de este camión, desde el lote hasta el destino.</p>
        <ol className="dist-traza">
          {etapas.map(({ Icono, titulo, valor, detalle }) => (
            <li key={titulo}>
              <span className="dist-traza-icono"><Icono size={18} /></span>
              <small>{titulo}</small>
              <strong>{valor}</strong>
              {detalle && <span>{detalle}</span>}
            </li>
          ))}
        </ol>
        {!c.cosecha && !traza.partidas.length && <p className="alm-muted">Este envío no está vinculado a una cosecha, por eso el recorrido empieza en el silo.</p>}
      </div>

      <div className="alm-form-layout">
        <div className="alm-form-main">
          {c.silo && (
            <div className="dashboard-card alm-card">
              <TituloCard Icono={Warehouse}>Partidas del silo consumidas</TituloCard>
              <p className="alm-muted">El egreso tomó primero el grano que llevaba más tiempo almacenado.</p>
              {traza.partidas.length === 0 ? (
                <p className="alm-muted">No hay detalle de partidas para este egreso.</p>
              ) : (
                <div className="table-shell">
                  <table className="lotes-table">
                    <thead>
                      <tr><th>Partida</th><th>Ingreso al silo</th><th>Cosecha y lote</th><th className="dist-num">Kg tomados</th><th className="dist-num">Días almacenado</th></tr>
                    </thead>
                    <tbody>
                      {traza.partidas.map((p) => (
                        <tr key={p.partidaId}>
                          <td>P - {String(p.partidaId).padStart(4, '0')}</td>
                          <td>{formatDate(p.fechaIngreso)}</td>
                          <td>{[p.cosecha, p.lote].filter(Boolean).join(' · ') || '-'}</td>
                          <td className="dist-num">{kg(p.kg)}</td>
                          <td className="dist-num">{p.diasAlmacenado}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {traza.ultimoControlSilo && (
                <p className="dist-control">
                  <span className={`dist-chip dist-${traza.ultimoControlSilo.estadoGrano === 'Bueno' ? 'bajo' : traza.ultimoControlSilo.estadoGrano === 'Regular' ? 'medio' : 'alto'}`}>{traza.ultimoControlSilo.estadoGrano}</span>
                  Último control antes del despacho: {formatDate(traza.ultimoControlSilo.fecha)} · Humedad {pct(traza.ultimoControlSilo.humedadGrano, 1)} · {numero(traza.ultimoControlSilo.temperatura, 1)} °C · {traza.ultimoControlSilo.presenciaPlagas ? 'con plagas' : 'sin plagas'}
                </p>
              )}
            </div>
          )}

          <div className="dashboard-card alm-card">
            <TituloCard Icono={Truck}>Datos logísticos</TituloCard>
            <dl className="alm-kv dist-kv-2">
              <div><dt>Chofer</dt><dd>{c.chofer}</dd></div>
              <div><dt>Transporte</dt><dd>{c.transportista || '-'}</dd></div>
              <div><dt>Patente</dt><dd>{c.patente}</dd></div>
              <div><dt>Destino</dt><dd>{c.destino}</dd></div>
              <div><dt>Carta de Porte</dt><dd>{c.codigoCpe}</dd></div>
              <div><dt>Ticket de balanza</dt><dd>{c.nroTicketBalanza || '-'}</dd></div>
            </dl>
          </div>

          <div className="dashboard-card alm-card">
            <TituloCard Icono={FileText}>Documentación</TituloCard>
            <Documentos modo="detail" api={api} distribucionId={c.distribucionId} distribucionCamionId={c.distribucionCamionId} />
          </div>
        </div>

        <aside className="alm-form-side">
          <div className="dashboard-card alm-card">
            <TituloCard Icono={Scale}>Conciliación</TituloCard>
            <dl className="alm-kv dist-kv-neutro">
              <div><dt>Despachado</dt><dd>{kg(c.kgDespachados)}</dd></div>
              <div><dt>Recibido en destino</dt><dd>{c.kgRecibidos != null ? kg(c.kgRecibidos) : '-'}</dd></div>
              <div><dt>Neto liquidado</dt><dd>{c.kgNetosLiquidados != null ? kg(c.kgNetosLiquidados) : '-'}</dd></div>
              <div><dt>Merma esperada</dt><dd>{c.mermaEsperadaKg != null ? `${kg(c.mermaEsperadaKg)} · ${pct(c.mermaEsperadaPct)}` : '-'}</dd></div>
              <div className="alm-kv-total"><dt>Sin justificar</dt><dd>{c.mermaNoJustificadaKg != null ? `${kg(c.mermaNoJustificadaKg)} · ${pp(c.desvioPp)}` : '-'}</dd></div>
            </dl>
            {c.estado !== 'Conciliado' && <p className="alm-muted">Se completa al conciliar con la liquidación de la acopiadora.</p>}
          </div>

        </aside>
      </div>

      <div className="form-actions alm-form-actions">
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
        {puedeGestionar && <button className="back-button" type="button" onClick={() => setEditando(true)}><Edit size={17} /> Editar datos logísticos</button>}
        {puedeGestionar && (
          <button className="green-button alm-submit" type="button" onClick={onConciliar}>
            <ClipboardCheck size={17} />
            <span>{c.estado === 'Conciliado' ? 'Ver conciliación' : c.estado === 'Recibido' ? 'Conciliar' : 'Registrar llegada'}</span>
          </button>
        )}
      </div>

      {editando && (
        <EditarLogisticaModal api={api} camion={c} onClose={() => setEditando(false)} onSaved={() => { setEditando(false); cargar(); }} />
      )}
    </section>
  );
}

function EditarLogisticaModal({ api, camion, onClose, onSaved }) {
  const [catalogos, setCatalogos] = useState(null);
  const [form, setForm] = useState({
    choferId: String(camion.choferId),
    camionId: String(camion.camionId),
    destinoId: String(camion.destinoId),
    codigoCpe: camion.codigoCpe,
    nroTicketBalanza: camion.nroTicketBalanza ?? ''
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = `empresaId=${camion.empresaId}`;
    Promise.all([
      api.get(`/api/distribucion-catalogos/choferes?${q}`),
      api.get(`/api/distribucion-catalogos/camiones?${q}`),
      api.get(`/api/distribucion-catalogos/destinos?${q}`)
    ]).then(([choferes, camiones, destinos]) => setCatalogos({ choferes, camiones, destinos }))
      .catch((err) => setError(err.message));
  }, [api, camion.empresaId]);

  async function guardar(event) {
    event.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api.put(`/api/distribuciones/camiones/${camion.distribucionCamionId}`, {
        choferId: Number(form.choferId),
        camionId: Number(form.camionId),
        destinoId: Number(form.destinoId),
        codigoCpe: form.codigoCpe.trim(),
        nroTicketBalanza: form.nroTicketBalanza.trim() || null
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <Modal titulo="Editar datos logísticos" descripcion={`Los ${kg(camion.kgDespachados)} despachados no se modifican.`} onClose={onClose}>
      {!catalogos ? (
        error ? <p className="alm-error">{error}</p> : <div className="loading-state"><LoaderCircle className="spin" size={20} /><span>Cargando...</span></div>
      ) : (
        <form onSubmit={guardar} noValidate>
          <div className="create-grid">
            <label className="field">
              Chofer
              <select value={form.choferId} onChange={cambiar('choferId')}>
                {catalogos.choferes.map((c) => <option key={c.choferId} value={c.choferId}>{c.apellido}, {c.nombre}</option>)}
              </select>
            </label>
            <label className="field">
              Patente
              <select value={form.camionId} onChange={cambiar('camionId')}>
                {catalogos.camiones.map((c) => <option key={c.camionId} value={c.camionId}>{c.patente}</option>)}
              </select>
            </label>
            <label className="field">
              Destino
              <select value={form.destinoId} onChange={cambiar('destinoId')}>
                {catalogos.destinos.map((d) => <option key={d.destinoId} value={d.destinoId}>{d.nombre}</option>)}
              </select>
            </label>
            <label className="field">
              Carta de Porte
              <input data-text-case="upper" value={form.codigoCpe} maxLength={30} onChange={cambiar('codigoCpe')} />
            </label>
            <label className="field">
              Nº de ticket de balanza
              <input data-text-case="preserve" value={form.nroTicketBalanza} maxLength={30} onChange={cambiar('nroTicketBalanza')} />
            </label>
          </div>
          {error && <p className="alm-error" role="alert">{error}</p>}
          <div className="alm-form-actions">
            <button className="back-button" type="button" onClick={onClose}>Cancelar</button>
            <button className="green-button alm-submit" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ===========================================================================
// Documentos (del envio o de un camion)
// ===========================================================================

function Documentos({ modo, api, distribucionId, distribucionCamionId = null, pendientes = [], onPendientesChange, textoZona = 'Arrastrá archivos o hacé clic para subir' }) {
  const [documentos, setDocumentos] = useState([]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef(null);

  async function cargar() {
    if (!distribucionId) return;
    try {
      const todos = await api.get(`/api/distribuciones/${distribucionId}/documentos`);
      // Documentos de este camion mas los del envio completo.
      setDocumentos(distribucionCamionId
        ? todos.filter((d) => d.distribucionCamionId == null || d.distribucionCamionId === distribucionCamionId)
        : todos);
    } catch (err) {
      setError(`No se pudieron cargar los documentos: ${err.message}`);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distribucionId, distribucionCamionId]);

  async function agregar(archivos) {
    const lista = [...archivos];
    if (lista.length === 0) return;
    setError('');
    if (modo === 'create') {
      onPendientesChange([...pendientes, ...lista]);
      return;
    }
    setTrabajando(true);
    try {
      for (const archivo of lista) {
        const datos = new FormData();
        datos.append('archivo', archivo);
        const query = distribucionCamionId ? `?distribucionCamionId=${distribucionCamionId}` : '';
        const response = await fetch(`${API_BASE_URL}/api/distribuciones/${distribucionId}/documentos${query}`, { method: 'POST', headers: api.headers(), body: datos });
        if (!response.ok) throw new Error(await readError(response));
      }
      await cargar();
    } catch (err) {
      setError(`No se pudo subir el archivo: ${err.message}`);
    } finally {
      setTrabajando(false);
    }
  }

  async function descargar(documento) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/distribuciones/${distribucionId}/documentos/${documento.distribucionDocumentoId}/descargar`, { headers: api.headers() });
      if (!response.ok) throw new Error(await readError(response));
      const url = window.URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = documento.nombreArchivo;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(`No se pudo descargar: ${err.message}`);
    }
  }

  async function eliminar(documento) {
    try {
      await api.del(`/api/distribuciones/${distribucionId}/documentos/${documento.distribucionDocumentoId}`);
      await cargar();
    } catch (err) {
      setError(`No se pudo eliminar: ${err.message}`);
    }
  }

  const soloLectura = modo === 'detail';
  const filas = modo === 'create'
    ? pendientes.map((archivo, indice) => ({ clave: `p-${indice}`, nombre: archivo.name, detalle: 'Se sube al registrar', indice }))
    : documentos.map((d) => ({
      clave: d.distribucionDocumentoId,
      nombre: d.nombreArchivo,
      detalle: `${formatDate(d.fechaCarga)} · ${d.cargadoPor || '-'}${d.distribucionCamionId == null ? ' · del envío' : ''}`,
      documento: d
    }));

  return (
    <div className="alm-docs">
      {error && <p className="alm-error" role="alert">{error}</p>}
      {!soloLectura && (
        <button
          type="button"
          className={`alm-dropzone ${arrastrando ? 'activa' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(event) => { event.preventDefault(); setArrastrando(false); agregar(event.dataTransfer.files); }}
          disabled={trabajando}
        >
          <Upload size={18} />
          <span>{trabajando ? 'Subiendo...' : textoZona}</span>
        </button>
      )}
      <input ref={inputRef} type="file" multiple hidden onChange={(event) => { agregar(event.target.files); event.target.value = ''; }} />
      {filas.length > 0 ? (
        <ul className="alm-docs-lista">
          {filas.map((fila) => (
            <li key={fila.clave}>
              <FileText size={16} />
              <span className="alm-docs-nombre">{fila.nombre}</span>
              <small>{fila.detalle}</small>
              {fila.documento && (
                <button type="button" className="alm-icon-button" aria-label={`Descargar ${fila.nombre}`} onClick={() => descargar(fila.documento)}><Download size={15} /></button>
              )}
              {!soloLectura && (
                <button
                  type="button"
                  className="alm-icon-button"
                  aria-label={`Quitar ${fila.nombre}`}
                  onClick={() => (fila.documento ? eliminar(fila.documento) : onPendientesChange(pendientes.filter((_, i) => i !== fila.indice)))}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        soloLectura && <p className="alm-muted">Sin documentos adjuntos.</p>
      )}
    </div>
  );
}

// ===========================================================================
// Catalogos
// ===========================================================================

const CATALOGOS = {
  transportista: { titulo: 'Transportista', plural: 'Transportistas', ruta: 'transportistas', id: 'transportistaId', Icono: Building2 },
  chofer: { titulo: 'Chofer', plural: 'Choferes', ruta: 'choferes', id: 'choferId', Icono: User },
  camion: { titulo: 'Camión', plural: 'Camiones', ruta: 'camiones', id: 'camionId', Icono: Truck },
  destino: { titulo: 'Destino', plural: 'Destinos', ruta: 'destinos', id: 'destinoId', Icono: MapPin }
};

function formularioCatalogo(tipo, registro) {
  const base = { activo: registro?.activo ?? true };
  if (tipo === 'transportista') return { ...base, razonSocial: registro?.razonSocial ?? '', cuit: registro?.cuit ?? '', telefono: registro?.telefono ?? '' };
  if (tipo === 'chofer') return { ...base, nombre: registro?.nombre ?? '', apellido: registro?.apellido ?? '', dni: registro?.dni ?? '', telefono: registro?.telefono ?? '', transportistaId: registro?.transportistaId ? String(registro.transportistaId) : '' };
  if (tipo === 'camion') return { ...base, patente: registro?.patente ?? '', marca: registro?.marca ?? '', modelo: registro?.modelo ?? '', transportistaId: registro?.transportistaId ? String(registro.transportistaId) : '' };
  return { ...base, nombre: registro?.nombre ?? '', tipoDestino: registro?.tipoDestino ?? 'Acopiadora', pais: registro?.pais ?? 'Argentina', provincia: registro?.provincia ?? '', ciudad: registro?.ciudad ?? '' };
}

function CatalogoModal({ tipo, registro = null, api, empresaId, transportistas = [], onClose, onSaved, onTransportistaCreado }) {
  const config = CATALOGOS[tipo];
  const [form, setForm] = useState(() => formularioCatalogo(tipo, registro));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [altaTransportista, setAltaTransportista] = useState(false);
  const cambiar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function guardar(event) {
    event.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const cuerpo = { ...form, empresaId: Number(empresaId) };
      if ('transportistaId' in cuerpo) cuerpo.transportistaId = cuerpo.transportistaId ? Number(cuerpo.transportistaId) : null;
      const ruta = `/api/distribucion-catalogos/${config.ruta}`;
      const guardado = registro
        ? await api.put(`${ruta}/${registro[config.id]}`, cuerpo)
        : await api.post(ruta, cuerpo);
      onSaved(guardado);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const selectorTransportista = (
    <label className="field">
      Transportista
      <div className="dist-select-con-alta">
        <select value={form.transportistaId} onChange={cambiar('transportistaId')}>
          <option value="">Sin transportista</option>
          {transportistas.map((t) => <option key={t.transportistaId} value={t.transportistaId}>{t.razonSocial}</option>)}
        </select>
        <button type="button" className="dist-alta-rapida" onClick={() => setAltaTransportista(true)} aria-label="Nuevo transportista"><PlusCircle size={18} /></button>
      </div>
    </label>
  );

  return (
    <Modal titulo={registro ? `Editar ${config.titulo.toLowerCase()}` : `Nuevo ${config.titulo.toLowerCase()}`} onClose={onClose}>
      <form onSubmit={guardar} noValidate>
        <div className="create-grid">
          {tipo === 'transportista' && (
            <>
              <label className="field field-wide"><span className="field-label">Razón social <b>*</b></span><input value={form.razonSocial} maxLength={150} onChange={cambiar('razonSocial')} autoFocus /></label>
              <label className="field">CUIT<input data-text-case="preserve" value={form.cuit} maxLength={13} onChange={cambiar('cuit')} /></label>
              <label className="field">Teléfono<input data-text-case="preserve" inputMode="tel" value={form.telefono} maxLength={30} onChange={cambiar('telefono')} /></label>
            </>
          )}
          {tipo === 'chofer' && (
            <>
              <label className="field"><span className="field-label">Nombre <b>*</b></span><input value={form.nombre} maxLength={100} onChange={cambiar('nombre')} autoFocus /></label>
              <label className="field"><span className="field-label">Apellido <b>*</b></span><input value={form.apellido} maxLength={100} onChange={cambiar('apellido')} /></label>
              <label className="field"><span className="field-label">DNI <b>*</b></span><input data-text-case="preserve" inputMode="numeric" value={form.dni} maxLength={12} onChange={cambiar('dni')} /><Regla>Único en la empresa.</Regla></label>
              <label className="field"><span className="field-label">Teléfono <b>*</b></span><input data-text-case="preserve" inputMode="tel" value={form.telefono} maxLength={30} onChange={cambiar('telefono')} /></label>
              {selectorTransportista}
            </>
          )}
          {tipo === 'camion' && (
            <>
              <label className="field"><span className="field-label">Patente <b>*</b></span><input data-text-case="upper" value={form.patente} maxLength={12} onChange={cambiar('patente')} autoFocus /><Regla>Se guarda sin espacios ni guiones.</Regla></label>
              <label className="field"><span className="field-label">Marca <b>*</b></span><input value={form.marca} maxLength={60} onChange={cambiar('marca')} /></label>
              <label className="field"><span className="field-label">Modelo <b>*</b></span><input value={form.modelo} maxLength={60} onChange={cambiar('modelo')} /></label>
              {selectorTransportista}
            </>
          )}
          {tipo === 'destino' && (
            <>
              <label className="field"><span className="field-label">Nombre <b>*</b></span><input value={form.nombre} maxLength={150} onChange={cambiar('nombre')} autoFocus /></label>
              <label className="field">
                <span className="field-label">Tipo <b>*</b></span>
                <select value={form.tipoDestino} onChange={cambiar('tipoDestino')}>{TIPOS_DESTINO.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              </label>
              <label className="field"><span className="field-label">País <b>*</b></span><input value={form.pais} maxLength={100} onChange={cambiar('pais')} /></label>
              <label className="field"><span className="field-label">Provincia <b>*</b></span><input value={form.provincia} maxLength={100} onChange={cambiar('provincia')} /></label>
              <label className="field"><span className="field-label">Ciudad <b>*</b></span><input value={form.ciudad} maxLength={100} onChange={cambiar('ciudad')} /></label>
            </>
          )}
          {registro && (
            <label className="dist-check">
              <input type="checkbox" checked={form.activo} onChange={cambiar('activo')} />
              Activo (los inactivos no se ofrecen en nuevos envíos)
            </label>
          )}
        </div>
        {error && <p className="alm-error" role="alert">{error}</p>}
        <div className="alm-form-actions">
          <button className="back-button" type="button" onClick={onClose}>Cancelar</button>
          <button className="green-button alm-submit" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : registro ? 'Guardar cambios' : `Agregar ${config.titulo.toLowerCase()}`}</button>
        </div>
      </form>

      {altaTransportista && (
        <CatalogoModal
          tipo="transportista"
          api={api}
          empresaId={empresaId}
          onClose={() => setAltaTransportista(false)}
          onSaved={async (t) => {
            await onTransportistaCreado?.();
            setForm((f) => ({ ...f, transportistaId: String(t.transportistaId) }));
            setAltaTransportista(false);
          }}
        />
      )}
    </Modal>
  );
}

function CatalogosView({ api, empresaId, puedeGestionar }) {
  const [datos, setDatos] = useState(null);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');

  async function cargar() {
    try {
      const q = `empresaId=${empresaId}&incluirInactivos=true`;
      const [transportistas, choferes, camiones, destinos] = await Promise.all(
        ['transportistas', 'choferes', 'camiones', 'destinos'].map((r) => api.get(`/api/distribucion-catalogos/${r}?${q}`))
      );
      setDatos({ transportista: transportistas, chofer: choferes, camion: camiones, destino: destinos });
    } catch (err) {
      setError(`No se pudieron cargar los catálogos: ${err.message}`);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  if (!datos) {
    return error ? <p className="alm-error" role="alert">{error}</p> : <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Cargando catálogos...</span></div>;
  }

  const columnas = {
    transportista: (t) => [t.razonSocial, t.cuit || '-', t.telefono || '-'],
    chofer: (c) => [`${c.apellido}, ${c.nombre}`, c.dni, c.transportista || '-'],
    camion: (c) => [c.patente, `${c.marca} ${c.modelo}`, c.transportista || '-'],
    destino: (d) => [d.nombre, d.tipoDestino, `${d.ciudad}, ${d.provincia}`]
  };
  const encabezados = {
    transportista: ['Razón social', 'CUIT', 'Teléfono'],
    chofer: ['Chofer', 'DNI', 'Transporte'],
    camion: ['Patente', 'Marca y modelo', 'Transporte'],
    destino: ['Nombre', 'Tipo', 'Ubicación']
  };

  return (
    <>
      <p className="alm-muted">Se cargan una sola vez y se eligen al registrar cada envío. No se borran: se desactivan, porque los envíos anteriores los siguen usando.</p>
      <div className="dist-catalogos">
        {Object.entries(CATALOGOS).map(([tipo, config]) => (
          <section key={tipo} className="dashboard-card alm-card">
            <div className="dist-catalogo-cabecera">
              <TituloCard Icono={config.Icono}>{config.plural} ({datos[tipo].length})</TituloCard>
              {puedeGestionar && (
                <button type="button" className="clear-button" onClick={() => setModal({ tipo })}><PlusCircle size={17} /><span>Agregar</span></button>
              )}
            </div>
            {datos[tipo].length === 0 ? (
              <p className="alm-muted">Todavía no hay {config.plural.toLowerCase()} cargados.</p>
            ) : (
              <div className="table-shell">
                <table className="lotes-table">
                  <thead><tr>{encabezados[tipo].map((h) => <th key={h}>{h}</th>)}<th>Estado</th>{puedeGestionar && <th style={{ textAlign: 'center' }}>Editar</th>}</tr></thead>
                  <tbody>
                    {datos[tipo].map((registro) => (
                      <tr key={registro[config.id]} className={registro.activo ? undefined : 'dist-fila-inactiva'}>
                        {columnas[tipo](registro).map((valor, i) => <td key={i}>{valor}</td>)}
                        <td><span className={`dist-chip ${registro.activo ? 'dist-bajo' : 'dist-neutro'}`}>{registro.activo ? 'Activo' : 'Inactivo'}</span></td>
                        {puedeGestionar && (
                          <td className="actions-cell lote-actions-cell">
                            <div className="actions-cell-content">
                              <button type="button" aria-label={`Editar ${config.titulo.toLowerCase()}`} onClick={() => setModal({ tipo, registro })}><Edit size={18} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>

      {modal && (
        <CatalogoModal
          tipo={modal.tipo}
          registro={modal.registro}
          api={api}
          empresaId={empresaId}
          transportistas={datos.transportista.filter((t) => t.activo)}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); cargar(); }}
          onTransportistaCreado={cargar}
        />
      )}
    </>
  );
}

// ===========================================================================
// Parametros por grano
// ===========================================================================

function ParametrosView({ api, empresaId, puedeEditar }) {
  const [filas, setFilas] = useState(null);
  const [guardandoGrano, setGuardandoGrano] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function cargar() {
    try {
      const data = await api.get(`/api/distribucion-catalogos/parametros?empresaId=${empresaId}`);
      setFilas(data.map((p) => ({
        ...p,
        manipuleo: p.manipuleoPct != null ? String(p.manipuleoPct).replace('.', ',') : '',
        tolerancia: p.toleranciaMateriasExtranasPct != null ? String(p.toleranciaMateriasExtranasPct).replace('.', ',') : '',
        medio: String(p.desvioMedioPp).replace('.', ','),
        alto: String(p.desvioAltoPp).replace('.', ',')
      })));
    } catch (err) {
      setError(`No se pudieron cargar los parámetros: ${err.message}`);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function cambiar(producto, campo, valor) {
    setFilas((lista) => lista.map((f) => (f.producto === producto ? { ...f, [campo]: valor } : f)));
  }

  async function guardar(fila) {
    setError('');
    setAviso('');
    const cuerpo = {
      empresaId: Number(empresaId),
      producto: fila.producto,
      manipuleoPct: aDecimal(fila.manipuleo),
      toleranciaMateriasExtranasPct: aDecimal(fila.tolerancia),
      desvioMedioPp: aDecimal(fila.medio),
      desvioAltoPp: aDecimal(fila.alto)
    };
    if (Object.values(cuerpo).some((v) => v == null)) return setError(`Completá todos los valores de ${granoTexto(fila.producto)}.`);
    setGuardandoGrano(fila.producto);
    try {
      await api.put('/api/distribucion-catalogos/parametros', cuerpo);
      setAviso(`Parámetros de ${granoTexto(fila.producto)} guardados. Se aplican a las próximas conciliaciones.`);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoGrano('');
    }
  }

  if (!filas) {
    return error ? <p className="alm-error" role="alert">{error}</p> : <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Cargando parámetros...</span></div>;
  }

  return (
    <div className="dashboard-card alm-card">
      <TituloCard Icono={Settings}>Parámetros para calcular la merma esperada</TituloCard>
      <p className="alm-muted">
        La humedad base es la de comercialización de cada grano (Res. SAGyP 1075/94) y no se edita.
        El manipuleo, la tolerancia de materias extrañas y los umbrales del semáforo los define la empresa.
        {!puedeEditar && ' Solo el Gerente o el Encargado pueden modificarlos.'}
      </p>
      {error && <p className="alm-error" role="alert">{error}</p>}
      {aviso && <p className="dist-aviso" role="status"><CheckCircle2 size={18} />{aviso}</p>}
      <div className="table-shell">
        <table className="lotes-table dist-parametros">
          <thead>
            <tr>
              <th>Grano</th>
              <th className="dist-num">Humedad base</th>
              <th>Manipuleo (%)</th>
              <th>Tolerancia de materias extrañas (%)</th>
              <th>Desvío medio desde (pp)</th>
              <th>Desvío alto desde (pp)</th>
              <th>Estado</th>
              {puedeEditar && <th />}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.producto}>
                <td><strong>{granoTexto(f.producto)}</strong></td>
                <td className="dist-num">{f.humedadBase != null ? pct(f.humedadBase, 1) : 'Sin base'}</td>
                {['manipuleo', 'tolerancia', 'medio', 'alto'].map((campo) => (
                  <td key={campo}>
                    <input
                      className="dist-input-chico"
                      inputMode="decimal"
                      data-text-case="preserve"
                      aria-label={`${campo} de ${f.producto}`}
                      value={f[campo]}
                      disabled={!puedeEditar}
                      onChange={(e) => cambiar(f.producto, campo, e.target.value)}
                    />
                  </td>
                ))}
                <td><span className={`dist-chip ${f.configurado ? 'dist-bajo' : 'dist-medio'}`}>{f.configurado ? 'Configurado' : 'Sin configurar'}</span></td>
                {puedeEditar && (
                  <td>
                    <button type="button" className="green-button dist-boton-chico" onClick={() => guardar(f)} disabled={guardandoGrano === f.producto}>
                      {guardandoGrano === f.producto ? 'Guardando...' : 'Guardar'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="alm-muted alm-footnote">Los envíos ya conciliados conservan los parámetros con los que se calcularon.</p>
    </div>
  );
}

// ===========================================================================
// Modal (portal sobre document.body, centrado en el viewport)
// ===========================================================================

// Pila de modales abiertos: Escape cierra solo el de arriba (hay altas rapidas dentro de otro modal).
const pilaModales = [];

function Modal({ titulo, descripcion, onClose, children }) {
  const idRef = useRef(Symbol('modal'));
  const cerrarRef = useRef(onClose);
  cerrarRef.current = onClose;

  useEffect(() => {
    const id = idRef.current;
    pilaModales.push(id);
    function alPresionar(event) {
      if (event.key === 'Escape' && pilaModales[pilaModales.length - 1] === id) cerrarRef.current();
    }
    document.addEventListener('keydown', alPresionar);
    return () => {
      document.removeEventListener('keydown', alPresionar);
      pilaModales.splice(pilaModales.indexOf(id), 1);
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dashboard-card dist-modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-heading">
          <div>
            <h2>{titulo}</h2>
            {descripcion && <p>{descripcion}</p>}
          </div>
          <button type="button" className="alm-icon-button" aria-label="Cerrar" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </section>
    </div>,
    document.body
  );
}
