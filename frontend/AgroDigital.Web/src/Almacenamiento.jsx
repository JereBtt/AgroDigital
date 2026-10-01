import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Download,
  FileText,
  Package,
  SlidersHorizontal,
  Sprout,
  Trash2,
  Upload,
  Warehouse,
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  Edit,
  Home,
  LoaderCircle,
  PlusCircle,
  RotateCcw,
  Search,
  Wheat
} from 'lucide-react';

/*
  Almacenamiento - rediseno fase 2.
  - Pestana "Stock actual" (entrada del modulo): cuanto grano hay, donde y de donde vino.
  - Pestana "Movimientos": el libro de ingresos y egresos.
  - Ingreso vinculado a una cosecha real, con saldo disponible y silos destino filtrados.
  - Egreso con vista previa de las partidas que consume (FIFO).
  Todo se muestra dentro de la empresa elegida en la barra superior.
*/

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';

const kg = (value) => `${Number(value ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg`;

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Mismos umbrales que el tablero de Silos, para que un silo tenga el mismo color en los dos modulos.
function ocupacionClass(porcentaje) {
  if (porcentaje >= 90) return 'alta';
  if (porcentaje >= 60) return 'media';
  return 'baja';
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

function emptyForm(overrides = {}) {
  return {
    tipoMovimiento: 'Ingreso',
    campaniaId: '',
    cosechaId: '',
    siloId: '',
    siloDestinoId: '',
    sentido: 'Negativo',
    motivo: '',
    archivos: [],
    fecha: todayIso(),
    cantidad: '',
    humedadIngreso: '',
    impurezas: '',
    observaciones: '',
    ...overrides
  };
}

export default function Almacenamiento({ session, parentFilters = null, selectedEmpresaId = '', selectedEmpresaName = '' }) {
  const [tab, setTab] = useState('stock');
  const [view, setView] = useState('list');
  const [stock, setStock] = useState(null);
  const [campaniaFilter, setCampaniaFilter] = useState('');
  const [campaniaOptions, setCampaniaOptions] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [silos, setSilos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [form, setForm] = useState(() => emptyForm());

  function authHeaders(extra = {}) {
    return session?.token ? { ...extra, Authorization: `Bearer ${session.token}` } : extra;
  }

  async function fetchJson(path) {
    const response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response));
    return response.json();
  }

  async function loadAll(campaniaId = campaniaFilter) {
    if (!selectedEmpresaId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ empresaId: selectedEmpresaId });
      if (campaniaId) query.set('campaniaId', campaniaId);

      const [stockData, movimientosData, silosData] = await Promise.all([
        fetchJson(`/api/almacenamientos/stock?${query}`),
        fetchJson('/api/almacenamientos'),
        fetchJson('/api/silos')
      ]);

      setStock(stockData);
      setMovimientos(movimientosData.filter((m) => String(m.empresaId) === String(selectedEmpresaId)));
      setSilos(silosData.filter((s) => String(s.empresaId) === String(selectedEmpresaId)));

      // Las opciones de campania salen de la vista sin filtrar, asi no desaparecen al elegir una.
      if (!campaniaId) {
        const opciones = new Map();
        stockData.silos.forEach((silo) => silo.partidas.forEach((p) => {
          if (p.campaniaId) opciones.set(p.campaniaId, p.campaniaNombre);
        }));
        stockData.cosechasConSaldo.forEach((c) => {
          if (c.campaniaId) opciones.set(c.campaniaId, c.campaniaNombre);
        });
        setCampaniaOptions([...opciones].map(([value, label]) => ({ value: String(value), label })));
      }
    } catch (err) {
      setError(`No se pudo cargar el almacenamiento: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setCampaniaFilter('');
    setView('list');
    loadAll('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmpresaId]);

  function changeCampania(value) {
    setCampaniaFilter(value);
    loadAll(value);
  }

  // Editable: solo el ultimo movimiento de cada silo, y solo si es manual (misma regla que la API).
  const editableIds = useMemo(() => {
    const ultimoPorSilo = new Map();
    movimientos.forEach((m) => {
      const actual = ultimoPorSilo.get(m.siloId);
      if (!actual || m.almacenamientoId > actual.almacenamientoId) ultimoPorSilo.set(m.siloId, m);
    });
    return new Set([...ultimoPorSilo.values()].filter((m) => m.origen === 'Manual').map((m) => m.almacenamientoId));
  }, [movimientos]);

  function goToList(nextTab = tab) {
    setTab(nextTab);
    setView('list');
    setSelectedMovimiento(null);
    setError('');
    loadAll();
  }

  function startCreate(overrides = {}) {
    setForm(emptyForm(overrides));
    setSelectedMovimiento(null);
    setError('');
    setView('create');
  }

  function openMovimiento(movimiento, mode) {
    setSelectedMovimiento(movimiento);
    const esAjuste = movimiento.tipoMovimiento === 'AjustePositivo' || movimiento.tipoMovimiento === 'AjusteNegativo';
    setForm(emptyForm({
      tipoMovimiento: esAjuste ? 'Ajuste' : movimiento.origen === 'Transferencia' ? 'Transferencia' : movimiento.tipoMovimiento,
      sentido: movimiento.tipoMovimiento === 'AjustePositivo' ? 'Positivo' : 'Negativo',
      motivo: movimiento.motivo ?? '',
      cosechaId: movimiento.cosechaId ? String(movimiento.cosechaId) : '',
      siloId: String(movimiento.siloId),
      fecha: movimiento.fecha ? String(movimiento.fecha).slice(0, 10) : todayIso(),
      cantidad: movimiento.cantidad,
      humedadIngreso: movimiento.humedadIngreso ?? '',
      impurezas: movimiento.impurezas ?? '',
      observaciones: movimiento.observaciones ?? ''
    }));
    setError('');
    setView(mode);
  }

  async function subirDocumentos(almacenamientoId, archivos) {
    for (const archivo of archivos) {
      const datos = new FormData();
      datos.append('archivo', archivo);
      const response = await fetch(`${API_BASE_URL}/api/almacenamientos/${almacenamientoId}/documentos`, { method: 'POST', headers: authHeaders(), body: datos });
      if (!response.ok) throw new Error(`El movimiento se registró, pero no se pudo subir ${archivo.name}: ${await readError(response)}`);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    const numberOrNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));
    const tipo = form.tipoMovimiento;
    const enviar = async (ruta, method, body) => {
      const response = await fetch(`${API_BASE_URL}${ruta}`, {
        method,
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(await readError(response));
      return response.status === 204 ? null : response.json();
    };

    try {
      let creadoId = null;
      if (view === 'edit') {
        await enviar(`/api/almacenamientos/${selectedMovimiento.almacenamientoId}`, 'PUT', {
          fecha: form.fecha,
          tipoMovimiento: selectedMovimiento.tipoMovimiento,
          cantidad: Number(form.cantidad),
          humedadIngreso: tipo === 'Ingreso' ? numberOrNull(form.humedadIngreso) : null,
          impurezas: tipo === 'Ingreso' ? numberOrNull(form.impurezas) : null,
          motivo: tipo === 'Egreso' ? form.motivo || null : null,
          observaciones: form.observaciones || null,
          producto: selectedMovimiento.producto ?? null,
          campania: selectedMovimiento.campania ?? null,
          cosecha: selectedMovimiento.cosecha ?? null
        });
      } else if (tipo === 'Transferencia') {
        const resultado = await enviar('/api/almacenamientos/transferencias', 'POST', {
          siloOrigenId: Number(form.siloId),
          siloDestinoId: Number(form.siloDestinoId),
          fecha: form.fecha,
          cantidad: Number(form.cantidad),
          motivo: form.observaciones || null
        });
        creadoId = resultado?.ingreso?.almacenamientoId ?? null;
      } else if (tipo === 'Ajuste') {
        const resultado = await enviar('/api/almacenamientos/ajustes', 'POST', {
          siloId: Number(form.siloId),
          fecha: form.fecha,
          sentido: form.sentido,
          cantidad: Number(form.cantidad),
          motivo: form.motivo,
          observaciones: form.observaciones || null
        });
        creadoId = resultado?.almacenamientoId ?? null;
      } else {
        const resultado = await enviar('/api/almacenamientos', 'POST', {
          siloId: Number(form.siloId),
          cosechaId: tipo === 'Ingreso' && form.cosechaId ? Number(form.cosechaId) : null,
          fecha: form.fecha,
          tipoMovimiento: tipo,
          cantidad: Number(form.cantidad),
          humedadIngreso: tipo === 'Ingreso' ? numberOrNull(form.humedadIngreso) : null,
          impurezas: tipo === 'Ingreso' ? numberOrNull(form.impurezas) : null,
          motivo: tipo === 'Egreso' ? form.motivo : null,
          observaciones: form.observaciones || null
        });
        creadoId = resultado?.almacenamientoId ?? null;
      }

      if (creadoId && form.archivos.length > 0) {
        await subirDocumentos(creadoId, form.archivos);
      }
      goToList('movimientos');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }


  if (!selectedEmpresaId) {
    return (
      <section className="content-panel list-panel">
        <div className="page-heading">
          <div>
            <h1>Almacenamiento</h1>
            <p>Cuánto grano hay, dónde está y de dónde vino.</p>
          </div>
        </div>
        {parentFilters}
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Home size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Elegí una empresa</h2>
            <p>El stock y los movimientos se muestran por empresa.</p>
          </div>
        </section>
      </section>
    );
  }

  if (view !== 'list') {
    return (
      <MovimientoForm
        mode={view}
        form={form}
        setForm={setForm}
        movimiento={selectedMovimiento}
        silos={silos}
        stock={campaniaFilter ? null : stock}
        canEdit={Boolean(selectedMovimiento && editableIds.has(selectedMovimiento.almacenamientoId))}
        empresaId={selectedEmpresaId}
        empresaNombre={selectedEmpresaName}
        fetchJson={fetchJson}
        authHeaders={authHeaders}
        saving={saving}
        error={error}
        onCancel={() => goToList()}
        onEdit={() => setView('edit')}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Almacenamiento</h1>
          <p>Cuánto grano hay, dónde está y de dónde vino.</p>
        </div>
        <button className="green-button add-lote-button" type="button" onClick={() => startCreate()}>
          <PlusCircle size={18} />
          <span>Registrar movimiento</span>
        </button>
      </div>

      {parentFilters}

      <div className="alm-tabs" role="tablist" aria-label="Vistas de almacenamiento">
        <button type="button" role="tab" aria-selected={tab === 'stock'} className={tab === 'stock' ? 'active' : ''} onClick={() => setTab('stock')}>Stock actual</button>
        <button type="button" role="tab" aria-selected={tab === 'movimientos'} className={tab === 'movimientos' ? 'active' : ''} onClick={() => setTab('movimientos')}>Movimientos ({movimientos.length})</button>
      </div>

      {error && <p className="alm-error" role="alert">{error}</p>}

      {loading ? (
        <div className="table-shell dashboard-card">
          <div className="loading-state">
            <LoaderCircle className="spin" size={24} />
            <span>Cargando almacenamiento...</span>
          </div>
        </div>
      ) : tab === 'stock' ? (
        <StockView
          stock={stock}
          campaniaFilter={campaniaFilter}
          campaniaOptions={campaniaOptions}
          onCampaniaChange={changeCampania}
          onIngresoCosecha={(cosechaId) => startCreate({ tipoMovimiento: 'Ingreso', cosechaId: String(cosechaId) })}
        />
      ) : (
        <MovimientosList
          movimientos={movimientos}
          editableIds={editableIds}
          onAdd={() => startCreate()}
          onView={(m) => openMovimiento(m, 'detail')}
          onEdit={(m) => openMovimiento(m, 'edit')}
        />
      )}
    </section>
  );
}

// ===========================================================================
// Stock actual
// ===========================================================================

function StockView({ stock, campaniaFilter, campaniaOptions, onCampaniaChange, onIngresoCosecha }) {
  const [expanded, setExpanded] = useState(() => new Set());

  if (!stock) return null;

  const ocupacionGeneral = stock.capacidadTotal > 0 ? Math.round((stock.kgTotales / stock.capacidadTotal) * 100) : 0;

  function toggle(siloId) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(siloId)) next.delete(siloId);
      else next.add(siloId);
      return next;
    });
  }

  return (
    <>
      <div className="alm-toolbar">
        <label className="alm-inline-field">
          <span>Campaña de origen</span>
          <select value={campaniaFilter} onChange={(event) => onCampaniaChange(event.target.value)}>
            <option value="">Todas las campañas</option>
            {campaniaOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {campaniaFilter && <small>Se muestran solo las partidas que vienen de esa campaña.</small>}
      </div>

      <div className="alm-kpis">
        {stock.granos.map((grano) => (
          <article key={grano.producto} className="alm-kpi">
            <span className="alm-kpi-icon"><Wheat size={22} /></span>
            <div>
              <small>{grano.producto}</small>
              <strong>{kg(grano.kg)}</strong>
              <p>{grano.cantidadSilos} {grano.cantidadSilos === 1 ? 'silo' : 'silos'} · {stock.kgTotales > 0 ? Math.round((grano.kg / stock.kgTotales) * 100) : 0} % del stock</p>
            </div>
          </article>
        ))}
        <article className="alm-kpi alm-kpi-total">
          <div>
            <small>Total almacenado</small>
            <strong>{kg(stock.kgTotales)}</strong>
            <p>{campaniaFilter ? 'De la campaña elegida' : `${ocupacionGeneral} % de la capacidad (${kg(stock.capacidadTotal)})`}</p>
          </div>
        </article>
      </div>

      <section className="dashboard-card alm-card">
        <h2>Stock por silo</h2>
        {stock.silos.length === 0 ? (
          <p className="alm-muted">No hay silos con grano{campaniaFilter ? ' de esta campaña' : ''}.</p>
        ) : (
          <div className="table-shell">
            <table className="lotes-table alm-table">
              <thead>
                <tr>
                  <th aria-label="Ver partidas" />
                  <th>Silo</th>
                  <th>Grano</th>
                  <th style={{ textAlign: 'right' }}>Kg</th>
                  <th>Ocupación</th>
                  <th style={{ textAlign: 'right' }}>Antigüedad</th>
                  <th>Origen</th>
                  <th>Último control</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {stock.silos.map((silo) => {
                  const abierto = expanded.has(silo.siloId);
                  const origenes = [...new Set(silo.partidas.map((p) => [p.campaniaNombre, p.cosechaNombre].filter(Boolean).join(' · ')).filter(Boolean))];
                  return [
                    <tr key={silo.siloId}>
                      <td>
                        {silo.partidas.length > 0 && (
                          <button type="button" className="alm-icon-button" aria-expanded={abierto} aria-label={`Ver partidas de ${silo.nombre}`} onClick={() => toggle(silo.siloId)}>
                            {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                      </td>
                      <td>
                        <strong>{silo.nombre}</strong>
                        <div className="alm-sub">{[silo.codigo, silo.tipoSilo === 'Bolson' ? 'Bolsón' : silo.tipoSilo, silo.loteNombre].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td>{silo.producto || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{kg(silo.kg)}</td>
                      <td>
                        <div className="alm-bar-cell">
                          <div className="alm-bar"><span className={`alm-bar-fill ${ocupacionClass(silo.porcentajeOcupacion)}`} style={{ width: `${Math.min(100, silo.porcentajeOcupacion)}%` }} /></div>
                          <span>{silo.porcentajeOcupacion} %</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{silo.diasAntiguedadPromedio == null ? '-' : `${silo.diasAntiguedadPromedio} días`}</td>
                      <td className="alm-sub-cell">{origenes.length ? origenes.join(', ') : '-'}</td>
                      <td><UltimoControlFecha fecha={silo.ultimoControlFecha} proximo={silo.fechaProximoControl} /></td>
                      <td><EstadoControlChip resultado={silo.ultimoControlResultado} tieneControl={Boolean(silo.ultimoControlFecha)} /></td>
                    </tr>,
                    abierto && (
                      <tr key={`${silo.siloId}-partidas`} className="alm-partidas-row">
                        <td />
                        <td colSpan={8}>
                          <PartidasTable partidas={silo.partidas} />
                        </td>
                      </tr>
                    )
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-card alm-card">
        <h2>Cosechas con grano sin almacenar</h2>
        {stock.cosechasConSaldo.length === 0 ? (
          <p className="alm-muted">Todas las cosechas finalizadas tienen su grano almacenado.</p>
        ) : (
          <div className="alm-saldo-list">
            {stock.cosechasConSaldo.map((cosecha) => (
              <div key={cosecha.cosechaId} className="alm-saldo-item">
                <div>
                  <strong>{cosecha.nombre} · {cosecha.producto} · {cosecha.loteNombre}</strong>
                  <div className="alm-sub">{cosecha.campaniaNombre} · Cosechado {kg(cosecha.kgCosechados)} · Almacenado {kg(cosecha.kgAlmacenados)}</div>
                </div>
                <div className="alm-saldo-actions">
                  <strong>{kg(cosecha.kgDisponibles)}</strong>
                  {onIngresoCosecha && (
                    <button type="button" className="green-button" onClick={() => onIngresoCosecha(cosecha.cosechaId)}>
                      <ArrowDownCircle size={16} />
                      <span>Registrar ingreso</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function PartidasTable({ partidas }) {
  return (
    <table className="alm-partidas">
      <thead>
        <tr>
          <th>Cosecha</th>
          <th>Lote · Campaña</th>
          <th>Ingreso</th>
          <th style={{ textAlign: 'right' }}>Kg restantes</th>
          <th style={{ textAlign: 'right' }}>Días</th>
        </tr>
      </thead>
      <tbody>
        {partidas.map((p) => (
          <tr key={p.partidaId}>
            <td>{p.cosechaNombre || 'Sin cosecha'}</td>
            <td>{[p.loteNombre, p.campaniaNombre].filter(Boolean).join(' · ') || '-'}</td>
            <td>{formatDate(p.fechaIngreso)}</td>
            <td style={{ textAlign: 'right' }}>{kg(p.kgRestantes)}</td>
            <td style={{ textAlign: 'right' }}>{p.diasAlmacenado}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Columna "Ultimo control": cuando se controlo, y si el proximo control ya vencio.
function UltimoControlFecha({ fecha, proximo }) {
  const vencido = proximo && String(proximo).slice(0, 10) < todayIso();
  return (
    <div className="alm-control-fecha">
      <span className={fecha ? '' : 'alm-muted'}>{fecha ? formatDate(fecha) : 'Sin control'}</span>
      {vencido && <small className="alm-vencido">Vencido: tocaba el {formatDate(proximo)}</small>}
    </div>
  );
}

// Columna "Estado": como dio el ultimo control.
function EstadoControlChip({ resultado, tieneControl }) {
  if (!tieneControl) return <span className="alm-muted">—</span>;
  if (!resultado) return <span className="alm-muted" title="Control registrado antes de la evaluación automática">Sin evaluar</span>;
  const tono = resultado === 'Normal' ? 'verde' : resultado === 'Atencion' ? 'ambar' : 'rojo';
  const texto = { Normal: 'Normal', Atencion: 'Atención', Critico: 'Crítico' }[resultado] ?? resultado;
  return <span className={`alm-chip alm-chip-${tono}`}>{texto}</span>;
}

// ===========================================================================
// Movimientos
// ===========================================================================

function MovimientosList({ movimientos, editableIds, onAdd, onView, onEdit }) {
  const [query, setQuery] = useState('');
  const [siloFilter, setSiloFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');

  const siloOptions = useMemo(
    () => [...new Set(movimientos.map((m) => m.siloNombre).filter(Boolean))],
    [movimientos]
  );

  const filtered = useMemo(() => movimientos.filter((m) => {
    const texto = normalizeSearchText(query.trim());
    const campos = [m.siloNombre, m.siloCodigo, m.producto, m.tipoMovimiento, m.origen, m.observaciones, m.campania, m.cosecha, String(m.cantidad ?? '')];
    const matchesQuery = !texto || campos.some((campo) => normalizeSearchText(campo).includes(texto));
    const tipoDe = m.origen === 'Transferencia' ? 'Transferencia' : m.tipoMovimiento.startsWith('Ajuste') ? 'Ajuste' : m.tipoMovimiento;
    return matchesQuery && (!siloFilter || m.siloNombre === siloFilter) && (!tipoFilter || tipoDe === tipoFilter);
  }), [movimientos, query, siloFilter, tipoFilter]);

  function clearFilters() {
    setQuery('');
    setSiloFilter('');
    setTipoFilter('');
  }

  const origenTexto = { Manual: 'Manual', AltaSilo: 'Alta de silo', Distribucion: 'Distribución', Transferencia: 'Transferencia' };

  return (
    <>
      <div className="filters-card">
        <label className="search-field">
          <Search size={21} />
          <input data-text-case="preserve" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cualquier dato del movimiento..." />
        </label>
        <select value={siloFilter} onChange={(event) => setSiloFilter(event.target.value)} aria-label="Filtrar por silo">
          <option value="">Silo</option>
          {siloOptions.map((silo) => <option key={silo} value={silo}>{silo}</option>)}
        </select>
        <select value={tipoFilter} onChange={(event) => setTipoFilter(event.target.value)} aria-label="Filtrar por tipo">
          <option value="">Tipo de Movimiento</option>
          <option value="Ingreso">Ingreso</option>
          <option value="Egreso">Egreso</option>
          <option value="Transferencia">Transferencia</option>
          <option value="Ajuste">Ajuste</option>
        </select>
        <button className="clear-button" type="button" onClick={clearFilters}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Home size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>{movimientos.length === 0 ? 'Aún no tenés movimientos de almacenamiento' : 'Ningún movimiento coincide con los filtros'}</h2>
            <p>Registrá el primer ingreso de grano desde una cosecha.</p>
          </div>
          <button className="green-button empty-state-action" type="button" onClick={onAdd}>
            <PlusCircle size={18} />
            <span>Registrar movimiento</span>
          </button>
        </section>
      ) : (
        <div className="table-shell dashboard-card">
          <table className="lotes-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Origen</th>
                <th>Silo</th>
                <th>Grano</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th style={{ textAlign: 'right' }}>Stock después</th>
                <th>Campaña · Cosecha</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const editable = editableIds.has(m.almacenamientoId);
                return (
                  <tr key={m.almacenamientoId}>
                    <td>{formatDate(m.fecha)}</td>
                    <td>
                      <span className={`movimiento-chip movimiento-${m.tipoMovimiento === 'Ingreso' || m.tipoMovimiento === 'AjustePositivo' ? 'ingreso' : 'egreso'} ${m.origen === 'Transferencia' || m.tipoMovimiento.startsWith('Ajuste') ? 'movimiento-especial' : ''}`}>
                        {m.origen === 'Transferencia' ? <ArrowRight size={15} />
                          : m.tipoMovimiento.startsWith('Ajuste') ? <SlidersHorizontal size={15} />
                            : m.tipoMovimiento === 'Ingreso' ? <ArrowDownCircle size={15} /> : <ArrowUpCircle size={15} />}
                        {etiquetaTipo(m)}
                      </span>
                    </td>
                    <td className="alm-sub-cell">
                      {origenTexto[m.origen] ?? m.origen}
                      {m.motivo && <div className="alm-sub">{etiquetaMotivo(m.motivo)}</div>}
                    </td>
                    <td>{m.siloNombre}</td>
                    <td>{m.producto || m.siloProducto || '-'}</td>
                    <td style={{ textAlign: 'right' }}>{kg(m.cantidad)}</td>
                    <td style={{ textAlign: 'right' }}>{kg(m.stockResultante)}</td>
                    <td className="alm-sub-cell">{[m.campania, m.cosecha].filter(Boolean).join(' · ') || '-'}</td>
                    <td className="actions-cell">
                      <button type="button" aria-label={`Ver movimiento de ${m.siloNombre}`} onClick={() => onView(m)}><Eye size={18} /></button>
                      <button
                        type="button"
                        aria-label={`Editar movimiento de ${m.siloNombre}`}
                        disabled={!editable}
                        title={editable ? undefined : 'Solo se puede editar el último movimiento manual del silo'}
                        onClick={() => onEdit(m)}
                      >
                        <Edit size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="alm-muted alm-footnote">Solo el último movimiento manual de cada silo se puede editar. Los automáticos se corrigen desde su módulo.</p>
        </div>
      )}
    </>
  );
}

// ===========================================================================
// Registrar / editar / detalle
// ===========================================================================
// Registrar / editar / detalle de movimiento (rediseno, paso 6: igual al prototipo)
// Tipos: Ingreso (desde una cosecha), Egreso (con motivo), Transferencia y Ajuste.
// ===========================================================================

const MOTIVOS_EGRESO = ['Semilla propia', 'Consumo interno', 'Deterioro'];
const MOTIVOS_AJUSTE = {
  Negativo: [
    { valor: 'Merma por secado', texto: 'Merma por secado' },
    { valor: 'Diferencia de medicion', texto: 'Diferencia de medición' },
    { valor: 'Deterioro', texto: 'Deterioro' }
  ],
  Positivo: [{ valor: 'Diferencia de medicion', texto: 'Diferencia de medición' }]
};

const TIPOS_MOVIMIENTO = [
  { valor: 'Ingreso', titulo: 'Ingreso', ayuda: 'Desde una cosecha', Icono: ArrowDownToLine },
  { valor: 'Egreso', titulo: 'Egreso', ayuda: 'Semilla, consumo, deterioro', Icono: ArrowUpFromLine },
  { valor: 'Transferencia', titulo: 'Transferencia', ayuda: 'De un silo a otro', Icono: ArrowRight },
  { valor: 'Ajuste', titulo: 'Ajuste', ayuda: 'Merma o medición', Icono: SlidersHorizontal }
];

function colorOcupacionAlm(porcentaje) {
  if (porcentaje >= 90) return '#c0392b';
  if (porcentaje >= 60) return '#d99a1e';
  return '#18883b';
}

// Mismo dibujo que en Silos: chapa vertical, bolson horizontal.
function SiloGlyphAlm({ tipo, porcentaje }) {
  const pct = Math.max(0, Math.min(100, Number(porcentaje) || 0));
  const color = pct === 0 ? '#c9d5cc' : colorOcupacionAlm(pct);
  if (tipo === 'Bolson') {
    const ancho = pct > 0 ? Math.max(Math.round((120 * pct) / 100), 14) : 0;
    return (
      <svg width="132" height="56" viewBox="0 0 132 56" aria-hidden="true">
        <rect x="2" y="10" width="128" height="36" rx="18" fill="#eef3ef" stroke="#d4e6d7" strokeWidth="1.5" />
        {ancho > 0 && <rect x="6" y="14" width={ancho} height="28" rx="14" fill={color} fillOpacity="0.85" />}
      </svg>
    );
  }
  const alto = pct > 0 ? Math.max(Math.round((58 * pct) / 100), 3) : 0;
  return (
    <svg width="64" height="84" viewBox="0 0 64 84" aria-hidden="true">
      <path d="M6 80V24a26 18 0 0 1 52 0v56z" fill="#eef3ef" stroke="#d4e6d7" strokeWidth="1.5" />
      {alto > 0 && <rect x="9" y={77 - alto} width="46" height={alto} fill={color} fillOpacity="0.85" />}
    </svg>
  );
}

function porcentajeTexto(valor) {
  const v = Number(valor) || 0;
  if (v <= 0) return '0 %';
  if (v < 1) return '< 1 %';
  return `${Math.round(v)} %`;
}

// Motivo corto para los silos que no pueden recibir el grano (como en el prototipo).
function motivoCorto(motivo) {
  if (!motivo) return '';
  if (motivo.startsWith('Contiene')) return 'Otro grano';
  if (motivo === 'En mantenimiento' || motivo === 'Dado de baja') return 'No recibe ingresos';
  if (motivo.startsWith('Sin capacidad')) return 'Sin capacidad libre';
  return motivo;
}

const mismoGranoAlm = (a, b) => normalizeSearchText(String(a ?? '').trim()) === normalizeSearchText(String(b ?? '').trim());
const codigoPartidaAlm = (id) => `P - ${String(id).padStart(4, '0')}`;

// FIFO: que partidas se consumen al sacar "cantidad" kg de un silo.
function consumoFifo(partidas, cantidad) {
  let pendiente = cantidad;
  return [...partidas]
    .sort((a, b) => String(a.fechaIngreso).localeCompare(String(b.fechaIngreso)) || a.partidaId - b.partidaId)
    .map((p) => {
      const toma = Math.max(0, Math.min(Number(p.kgRestantes), pendiente));
      pendiente -= toma;
      return { ...p, toma };
    })
    .filter((p) => p.toma > 0);
}

function Regla({ children }) {
  return <small className="silo-hint"><span className="control-regla">Regla</span> · {children}</small>;
}

function TituloCard({ Icono, children }) {
  return <h2 className="silo-card-title"><Icono size={19} />{children}</h2>;
}

// Zona de documentos (ticket de balanza, comprobantes).
// Al registrar, los archivos quedan pendientes y se suben despues de crear el movimiento.
function DocumentosMovimiento({ modo, almacenamientoId, pendientes, onPendientesChange, authHeaders }) {
  const [documentos, setDocumentos] = useState([]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);

  async function cargar() {
    if (!almacenamientoId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/almacenamientos/${almacenamientoId}/documentos`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await readError(response));
      setDocumentos(await response.json());
    } catch (err) {
      setError(`No se pudieron cargar los documentos: ${err.message}`);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenamientoId]);

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
        const response = await fetch(`${API_BASE_URL}/api/almacenamientos/${almacenamientoId}/documentos`, { method: 'POST', headers: authHeaders(), body: datos });
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
      const response = await fetch(`${API_BASE_URL}/api/almacenamientos/${almacenamientoId}/documentos/${documento.almacenamientoDocumentoId}/descargar`, { headers: authHeaders() });
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
      const response = await fetch(`${API_BASE_URL}/api/almacenamientos/${almacenamientoId}/documentos/${documento.almacenamientoDocumentoId}`, { method: 'DELETE', headers: authHeaders() });
      if (!response.ok) throw new Error(await readError(response));
      await cargar();
    } catch (err) {
      setError(`No se pudo eliminar: ${err.message}`);
    }
  }

  const soloLectura = modo === 'detail';
  const filas = modo === 'create'
    ? pendientes.map((archivo, indice) => ({ clave: `p-${indice}`, nombre: archivo.name, detalle: 'Se sube al registrar', indice }))
    : documentos.map((d) => ({ clave: d.almacenamientoDocumentoId, nombre: d.nombreArchivo, detalle: `${formatDate(d.fechaCarga)} · ${d.cargadoPor || '-'}`, documento: d }));

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
          <span>{trabajando ? 'Subiendo...' : 'Arrastrá el ticket de balanza o hacé clic para subir'}</span>
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

function MovimientoForm({ mode, form, setForm, movimiento, silos, stock, canEdit, empresaId, empresaNombre, fetchJson, authHeaders, saving, error, onCancel, onEdit, onSubmit }) {
  const isCreate = mode === 'create';
  const readOnly = mode === 'detail';
  const tipo = form.tipoMovimiento;
  const isIngreso = tipo === 'Ingreso';
  const isEgreso = tipo === 'Egreso';
  const isTransferencia = tipo === 'Transferencia';
  const isAjuste = tipo === 'Ajuste';

  const [cosechas, setCosechas] = useState([]);
  const [saldo, setSaldo] = useState(null);
  const [silosDestino, setSilosDestino] = useState([]);
  const [loadingDestino, setLoadingDestino] = useState(false);
  const [localError, setLocalError] = useState('');
  const [parametros, setParametros] = useState([]);

  function update(field, value) {
    setLocalError('');
    setForm((current) => ({ ...current, [field]: value }));
  }

  // Cosechas con saldo (solo para registrar ingresos nuevos).
  useEffect(() => {
    if (!isCreate || !isIngreso) return;
    fetchJson(`/api/almacenamientos/cosechas-con-saldo?empresaId=${empresaId}`)
      .then(setCosechas)
      .catch((err) => setLocalError(`No se pudieron cargar las cosechas: ${err.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, isIngreso, empresaId]);

  // Saldo de la cosecha elegida.
  useEffect(() => {
    if (!form.cosechaId) {
      setSaldo(null);
      return;
    }
    fetchJson(`/api/almacenamientos/cosechas/${form.cosechaId}/saldo`).then(setSaldo).catch(() => setSaldo(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cosechaId]);

  // Silos destino segun el grano de la cosecha.
  useEffect(() => {
    if (!isCreate || !isIngreso || !saldo?.producto) {
      setSilosDestino([]);
      return;
    }
    setLoadingDestino(true);
    fetchJson(`/api/almacenamientos/silos-destino?empresaId=${empresaId}&producto=${encodeURIComponent(saldo.producto)}`)
      .then((data) => {
        setSilosDestino(data);
        if (form.siloId && !data.some((s) => String(s.siloId) === String(form.siloId) && s.compatible)) update('siloId', '');
      })
      .catch((err) => setLocalError(`No se pudieron cargar los silos: ${err.message}`))
      .finally(() => setLoadingDestino(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, isIngreso, saldo?.producto, empresaId]);

  // Umbrales del ingeniero, para advertir humedad alta al ingreso.
  useEffect(() => {
    if (!isIngreso || readOnly) return;
    fetchJson(`/api/grano-parametros?empresaId=${empresaId}`).then(setParametros).catch(() => setParametros([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIngreso, readOnly, empresaId]);

  const cantidad = Number(form.cantidad) || 0;
  const siloDe = (id) => silos.find((s) => String(s.siloId) === String(id));
  const siloOrigen = siloDe(form.siloId);
  const siloDestinoTransf = siloDe(form.siloDestinoId);
  const siloDestino = silosDestino.find((s) => String(s.siloId) === String(form.siloId));
  const silosConStock = silos.filter((s) => Number(s.cantidadGranoAlmacenado) > 0 && s.estadoOperativo !== 'Dado de baja');
  const partidasDe = (siloId) => stock?.silos.find((s) => String(s.siloId) === String(siloId))?.partidas ?? [];

  // Campañas del selector de ingreso, a partir de las cosechas con saldo.
  const campanias = useMemo(() => {
    const mapa = new Map();
    cosechas.forEach((c) => { if (c.campaniaNombre) mapa.set(String(c.campaniaId ?? c.campaniaNombre), c.campaniaNombre); });
    return [...mapa].map(([valor, texto]) => ({ valor, texto }));
  }, [cosechas]);
  const cosechasDeCampania = form.campaniaId
    ? cosechas.filter((c) => String(c.campaniaId ?? c.campaniaNombre) === String(form.campaniaId))
    : cosechas;

  // Saldo disponible: al editar, lo propio de este movimiento vuelve a estar disponible.
  const disponible = saldo
    ? Number(saldo.kgDisponibles) + (mode === 'edit' && movimiento?.cosechaId ? Number(movimiento.cantidad) : 0)
    : null;

  // Aviso de humedad alta segun el umbral de almacenamiento.
  const granoIngreso = saldo?.producto ?? movimiento?.producto ?? '';
  const tipoSiloDestino = siloDestino?.tipoSilo ?? siloDe(form.siloId)?.tipoSilo;
  const parametroIngreso = tipoSiloDestino ? parametros.find((p) => p.tipoSilo === tipoSiloDestino && mismoGranoAlm(p.producto, granoIngreso)) : null;
  const humedadIngreso = form.humedadIngreso === '' ? null : Number(form.humedadIngreso);
  const humedadAlta = parametroIngreso && humedadIngreso !== null && humedadIngreso > Number(parametroIngreso.umbralHumedad);

  // Destinos posibles de una transferencia, con el motivo de los que no sirven.
  const destinosTransferencia = useMemo(() => silos
    .filter((s) => String(s.siloId) !== String(form.siloId) && s.estadoOperativo !== 'Dado de baja')
    .map((s) => {
      const libre = Number(s.capacidadMax) - Number(s.cantidadGranoAlmacenado);
      let motivo = null;
      if (s.estadoOperativo === 'En mantenimiento') motivo = 'No recibe ingresos';
      else if (Number(s.cantidadGranoAlmacenado) > 0 && siloOrigen?.producto && s.producto && !mismoGranoAlm(s.producto, siloOrigen.producto)) motivo = 'Otro grano';
      else if (libre <= 0) motivo = 'Sin capacidad libre';
      return { ...s, libre, motivo };
    }), [silos, form.siloId, siloOrigen?.producto]);

  // Vistas previas FIFO (egreso, ajuste negativo y transferencia).
  const consumeFifo = isCreate && (isEgreso || isTransferencia || (isAjuste && form.sentido === 'Negativo'));
  const previewFifo = consumeFifo && form.siloId ? consumoFifo(partidasDe(form.siloId), cantidad) : [];

  function validar() {
    if (!form.fecha) return 'Indicá la fecha.';
    if (form.fecha > todayIso()) return 'La fecha no puede ser posterior a hoy.';
    if (isCreate && isIngreso && !form.cosechaId) return 'Elegí la cosecha de la que viene el grano.';
    if (isCreate && !form.siloId) return isIngreso ? 'Elegí el silo destino.' : isTransferencia ? 'Elegí el silo de origen.' : 'Elegí el silo.';
    if (isCreate && isTransferencia && !form.siloDestinoId) return 'Elegí el silo de destino.';
    if (!(cantidad > 0)) return 'La cantidad debe ser mayor a cero.';
    if (isEgreso && !form.motivo) return 'Indicá el motivo del egreso.';
    if (isAjuste && !form.motivo) return 'Indicá el motivo del ajuste.';
    if (isIngreso && disponible !== null && cantidad > disponible) return `La cantidad supera el saldo disponible de la cosecha (${kg(disponible)}).`;
    if (isCreate && isIngreso && siloDestino && cantidad > siloDestino.capacidadLibre) return `La cantidad supera la capacidad libre del silo (${kg(siloDestino.capacidadLibre)}).`;
    if (isCreate && (isEgreso || isTransferencia || (isAjuste && form.sentido === 'Negativo')) && siloOrigen && cantidad > Number(siloOrigen.cantidadGranoAlmacenado)) {
      return `La cantidad supera el stock del silo (${kg(siloOrigen.cantidadGranoAlmacenado)}).`;
    }
    if (isCreate && isTransferencia && siloDestinoTransf && cantidad > Number(siloDestinoTransf.capacidadMax) - Number(siloDestinoTransf.cantidadGranoAlmacenado)) {
      return 'La cantidad supera la capacidad libre del silo de destino.';
    }
    if (isCreate && isAjuste && form.sentido === 'Positivo' && siloOrigen && cantidad > Number(siloOrigen.capacidadMax) - Number(siloOrigen.cantidadGranoAlmacenado)) {
      return 'El ajuste supera la capacidad libre del silo.';
    }
    const humedad = form.humedadIngreso === '' ? null : Number(form.humedadIngreso);
    const impurezas = form.impurezas === '' ? null : Number(form.impurezas);
    if (humedad !== null && (humedad < 0 || humedad > 100)) return 'La humedad debe estar entre 0 y 100 %.';
    if (impurezas !== null && (impurezas < 0 || impurezas > 100)) return 'Las impurezas deben estar entre 0 y 100 %.';
    return null;
  }

  function submit(event) {
    event.preventDefault();
    const mensaje = validar();
    if (mensaje) {
      setLocalError(mensaje);
      return;
    }
    setLocalError('');
    onSubmit(event);
  }

  const mensajeError = localError || error;
  const descripcion = {
    Ingreso: 'Elegí el tipo y el formulario se adapta.',
    Egreso: 'El grano sale de las partidas del silo, empezando por la más antigua.',
    Transferencia: 'La transferencia genera un Egreso y un Ingreso vinculados.',
    Ajuste: 'Corrige el stock por merma o diferencia de medición. Solo lo registra el Encargado.'
  }[tipo];
  const contexto = {
    Ingreso: '· solo se listan silos y cosechas de esta empresa',
    Egreso: '· solo se listan silos de esta empresa',
    Transferencia: '· origen y destino deben ser de la misma empresa',
    Ajuste: '· solo se listan silos de esta empresa'
  }[tipo];

  // "Asi queda": silo afectado antes/despues segun el tipo.
  const siloPreview = isIngreso ? (siloDestino ? { nombre: siloDestino.nombre, tipo: siloDestino.tipoSilo, kg: Number(siloDestino.kg), cap: Number(siloDestino.capacidadMax), signo: 1 } : null)
    : siloOrigen && !isTransferencia ? { nombre: siloOrigen.nombre, tipo: siloOrigen.tipoSilo, kg: Number(siloOrigen.cantidadGranoAlmacenado), cap: Number(siloOrigen.capacidadMax), signo: isAjuste && form.sentido === 'Positivo' ? 1 : -1 } : null;
  const despues = siloPreview ? Math.max(0, siloPreview.kg + siloPreview.signo * cantidad) : 0;
  const pctDespues = siloPreview && siloPreview.cap > 0 ? (despues / siloPreview.cap) * 100 : 0;

  const titulo = isCreate ? 'Registrar movimiento' : mode === 'edit' ? 'Editar movimiento' : 'Detalle del movimiento';
  const textoBoton = { Ingreso: 'Registrar ingreso', Egreso: 'Registrar egreso', Transferencia: 'Registrar transferencia', Ajuste: 'Registrar ajuste' }[tipo];
  const IconoBoton = (TIPOS_MOVIMIENTO.find((t) => t.valor === tipo) ?? TIPOS_MOVIMIENTO[0]).Icono;
  const saldoUsado = disponible > 0 ? Math.min(100, Math.round((cantidad / disponible) * 100)) : 0;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{titulo}</h1>
          <p>{mode === 'edit' ? 'Solo se puede editar el último movimiento manual del silo.' : readOnly ? 'Información en modo de solo lectura.' : descripcion}</p>
        </div>
      </div>

      <div className="alm-context">
        <Home size={18} />
        <span>{readOnly ? 'Empresa' : 'Registrando en'}</span>
        <strong>{empresaNombre || 'Empresa seleccionada'}</strong>
        {!readOnly && <span className="alm-context-extra">{contexto}</span>}
        {!readOnly && <small>Para cambiar de empresa, volvé al listado.</small>}
      </div>

      {mensajeError && <p className="alm-error" role="alert">{mensajeError}</p>}

      <form onSubmit={submit} noValidate>
        {isCreate && (
          <div className="dashboard-card alm-card">
            <div className="alm-type-grid alm-type-grid-4" role="radiogroup" aria-label="Tipo de movimiento">
              {TIPOS_MOVIMIENTO.map(({ valor, titulo: t, ayuda, Icono }) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={tipo === valor}
                  className={`alm-type-option ${tipo === valor ? 'selected' : ''}`}
                  onClick={() => setForm(emptyForm({ tipoMovimiento: valor, fecha: form.fecha }))}
                >
                  <Icono size={22} />
                  <span><strong>{t}</strong><small>{ayuda}</small></span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="alm-form-layout">
          <div className="alm-form-main">
            {/* ------------------------------ INGRESO ------------------------------ */}
            {isIngreso && (
              <div className="dashboard-card alm-card">
                <TituloCard Icono={Sprout}>Origen</TituloCard>
                <div className="create-grid alm-grid-4">
                  {isCreate ? (
                    <>
                      <label className="field">
                        <span className="field-label">Campaña <b>*</b></span>
                        <select value={form.campaniaId} onChange={(event) => { setLocalError(''); setForm((c) => ({ ...c, campaniaId: event.target.value, cosechaId: '', siloId: '' })); }}>
                          <option value="">Todas</option>
                          {campanias.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
                        </select>
                      </label>
                      <label className="field">
                        <span className="field-label">Cosecha <b>*</b></span>
                        <select value={form.cosechaId} onChange={(event) => { setLocalError(''); setForm((c) => ({ ...c, cosechaId: event.target.value, siloId: '' })); }}>
                          <option value="">Seleccionar</option>
                          {cosechasDeCampania.map((c) => <option key={c.cosechaId} value={c.cosechaId}>{c.nombre} · {c.producto}</option>)}
                        </select>
                        <Regla>Solo cosechas con saldo disponible.</Regla>
                      </label>
                    </>
                  ) : (
                    <label className="field">
                      Cosecha
                      <input value={movimiento?.cosecha || 'Sin cosecha vinculada'} readOnly disabled />
                    </label>
                  )}
                  <label className="field">
                    Lote
                    <input value={saldo?.loteNombre ?? '-'} readOnly disabled />
                    {isCreate && <Regla>Se completa desde la cosecha.</Regla>}
                  </label>
                  <label className="field">
                    Grano
                    <input value={saldo?.producto ?? movimiento?.producto ?? '-'} readOnly disabled />
                    {isCreate && <Regla>Se completa desde la cosecha.</Regla>}
                  </label>
                </div>
                {isCreate && cosechas.length === 0 && <p className="alm-muted">No hay cosechas finalizadas con grano pendiente de almacenar.</p>}
              </div>
            )}

            {/* ------------------------------ SILO(S) ------------------------------ */}
            <div className="dashboard-card alm-card">
              {isIngreso && isCreate ? (
                <>
                  <TituloCard Icono={Warehouse}>Silo destino</TituloCard>
                  {!form.cosechaId ? (
                    <p className="alm-muted">Elegí primero la cosecha: los silos se filtran según su grano.</p>
                  ) : loadingDestino ? (
                    <p className="alm-muted">Buscando silos...</p>
                  ) : silosDestino.length === 0 ? (
                    <p className="alm-muted">La empresa no tiene silos registrados.</p>
                  ) : (
                    <div className="alm-silo-options" role="radiogroup" aria-label="Silo destino">
                      <p className="alm-muted">Solo se pueden elegir silos vacíos o con el mismo grano.</p>
                      {silosDestino.map((s) => (
                        <button
                          key={s.siloId}
                          type="button"
                          role="radio"
                          aria-checked={String(form.siloId) === String(s.siloId)}
                          disabled={!s.compatible}
                          title={s.compatible ? undefined : s.motivoNoCompatible}
                          className={`alm-silo-option ${String(form.siloId) === String(s.siloId) ? 'selected' : ''}`}
                          onClick={() => update('siloId', String(s.siloId))}
                        >
                          <span>
                            <strong>{s.nombre}</strong>
                            <small>{[s.tipoSilo === 'Bolson' ? 'Bolsón' : 'Chapa', s.estadoOperativo === 'En mantenimiento' ? 'En mantenimiento' : s.kg > 0 ? `${s.producto} · ${kg(s.kg)}` : 'Vacío'].join(' · ')}</small>
                          </span>
                          <em>{s.compatible ? `${kg(s.capacidadLibre)} libres` : motivoCorto(s.motivoNoCompatible)}</em>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : isTransferencia && isCreate ? (
                <>
                  <TituloCard Icono={ArrowRight}>Transferencia</TituloCard>
                  <div className="create-grid">
                    <label className="field">
                      <span className="field-label">Silo origen <b>*</b></span>
                      <select value={form.siloId} onChange={(event) => setForm((c) => ({ ...c, siloId: event.target.value, siloDestinoId: '' }))}>
                        <option value="">Seleccionar</option>
                        {silosConStock.map((s) => <option key={s.siloId} value={s.siloId}>{s.nombre} · {s.producto || 'Grano sin indicar'} · {kg(s.cantidadGranoAlmacenado)}</option>)}
                      </select>
                      <Regla>Debe tener stock.</Regla>
                    </label>
                    <label className="field">
                      <span className="field-label">Silo destino <b>*</b></span>
                      <select value={form.siloDestinoId} disabled={!form.siloId} onChange={(event) => update('siloDestinoId', event.target.value)}>
                        <option value="">{form.siloId ? 'Seleccionar' : 'Elegí primero el origen'}</option>
                        {destinosTransferencia.map((s) => (
                          <option key={s.siloId} value={s.siloId} disabled={Boolean(s.motivo)}>
                            {s.nombre} · {s.motivo ? s.motivo : `${kg(s.libre)} libres`}
                          </option>
                        ))}
                      </select>
                      <Regla>Vacío o con el mismo grano; no en mantenimiento.</Regla>
                    </label>
                  </div>
                </>
              ) : (isEgreso || isAjuste) && isCreate ? (
                <>
                  <TituloCard Icono={Warehouse}>{isAjuste ? 'Silo a ajustar' : 'Silo de origen'}</TituloCard>
                  <label className="field">
                    <span className="field-label">Silo <b>*</b></span>
                    <select value={form.siloId} onChange={(event) => update('siloId', event.target.value)}>
                      <option value="">Seleccionar silo con grano</option>
                      {silosConStock.map((s) => <option key={s.siloId} value={s.siloId}>{s.nombre} · {s.producto || 'Grano sin indicar'} · {kg(s.cantidadGranoAlmacenado)}</option>)}
                    </select>
                    <Regla>{isAjuste ? 'Solo silos con grano: para cargar un silo vacío registrá un ingreso.' : 'Solo silos con grano.'}</Regla>
                  </label>
                </>
              ) : (
                <>
                  <TituloCard Icono={Warehouse}>Silo</TituloCard>
                  <label className="field">
                    Silo
                    <input value={movimiento?.siloNombre ?? '-'} readOnly disabled />
                  </label>
                </>
              )}
            </div>

            {/* ------------------------------ DATOS ------------------------------ */}
            <div className="dashboard-card alm-card">
              <TituloCard Icono={(TIPOS_MOVIMIENTO.find((t) => t.valor === tipo) ?? TIPOS_MOVIMIENTO[0]).Icono}>
                {{ Ingreso: 'Ingreso', Egreso: 'Egreso', Transferencia: 'Datos de la transferencia', Ajuste: 'Ajuste' }[tipo]}
              </TituloCard>
              <div className="create-grid alm-grid-4">
                {isAjuste && (
                  <label className="field">
                    <span className="field-label">Sentido <b>*</b></span>
                    <select value={form.sentido} disabled={!isCreate} onChange={(event) => setForm((c) => ({ ...c, sentido: event.target.value, motivo: '' }))}>
                      <option value="Negativo">Negativo (descuenta)</option>
                      <option value="Positivo">Positivo (suma)</option>
                    </select>
                  </label>
                )}
                <label className="field">
                  <span className="field-label">Fecha <b>*</b></span>
                  <input type="date" value={form.fecha} max={todayIso()} readOnly={readOnly} onChange={(event) => update('fecha', event.target.value)} />
                  {!readOnly && <Regla>{isIngreso ? 'Entre el inicio de la cosecha y hoy.' : 'No posterior a hoy.'}</Regla>}
                </label>
                <label className="field">
                  <span className="field-label">Cantidad (kg) <b>*</b></span>
                  <input type="number" min="0" step="any" value={form.cantidad} readOnly={readOnly || (!isCreate && isAjuste)} onChange={(event) => update('cantidad', event.target.value)} />
                  {!readOnly && (
                    <Regla>
                      {isIngreso ? '≤ saldo de cosecha y ≤ capacidad libre.'
                        : isTransferencia ? '≤ stock del origen y ≤ capacidad libre del destino.'
                          : isAjuste && form.sentido === 'Positivo' ? '≤ capacidad libre del silo.'
                            : '≤ stock del silo.'}
                    </Regla>
                  )}
                </label>
                {isIngreso && (
                  <>
                    <label className="field">
                      Humedad al ingreso (%)
                      <input type="number" min="0" max="100" step="0.1" className={humedadAlta ? 'input-alerta' : undefined} value={form.humedadIngreso} readOnly={readOnly} onChange={(event) => update('humedadIngreso', event.target.value)} placeholder="Opcional" />
                      {humedadAlta
                        ? <small className="control-aviso">Supera {Number(parametroIngreso.umbralHumedad).toLocaleString('es-AR')} %: se sugiere secado y control.</small>
                        : !readOnly && <Regla>Entre 0 y 100.</Regla>}
                    </label>
                    <label className="field">
                      Impurezas (%)
                      <input type="number" min="0" max="100" step="0.1" value={form.impurezas} readOnly={readOnly} onChange={(event) => update('impurezas', event.target.value)} placeholder="Opcional" />
                      {!readOnly && <Regla>Entre 0 y 100.</Regla>}
                    </label>
                  </>
                )}
                {(isEgreso || isAjuste) && (
                  <label className="field">
                    <span className="field-label">Motivo <b>*</b></span>
                    <select value={form.motivo} disabled={readOnly || (!isCreate && isAjuste)} onChange={(event) => update('motivo', event.target.value)}>
                      <option value="">Seleccionar</option>
                      {(isAjuste ? MOTIVOS_AJUSTE[form.sentido] : MOTIVOS_EGRESO.map((m) => ({ valor: m, texto: m })))
                        .map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
                    </select>
                    {!readOnly && <Regla>{isAjuste ? (form.sentido === 'Positivo' ? 'Solo por diferencia de medición.' : 'Merma, medición o deterioro.') : 'Las ventas salen por Distribución.'}</Regla>}
                  </label>
                )}
                <label className="field field-wide">
                  {isTransferencia ? 'Motivo' : 'Observaciones'}
                  <input
                    value={form.observaciones}
                    readOnly={readOnly}
                    maxLength={500}
                    onChange={(event) => update('observaciones', event.target.value)}
                    placeholder={isTransferencia ? 'Ej.: vaciado del bolsón antes del vencimiento (opcional)' : 'Opcional'}
                  />
                </label>
              </div>
              <h3 className="alm-subtitulo">Documentación</h3>
              <DocumentosMovimiento
                modo={mode}
                almacenamientoId={movimiento?.almacenamientoId}
                pendientes={form.archivos}
                onPendientesChange={(archivos) => setForm((c) => ({ ...c, archivos }))}
                authHeaders={authHeaders}
              />
            </div>

            {/* ------------------------ TRANSFERENCIA: VISTA PREVIA ------------------------ */}
            {isTransferencia && isCreate && siloOrigen && siloDestinoTransf && (
              <div className="dashboard-card alm-card">
                <TituloCard Icono={Warehouse}>Vista previa</TituloCard>
                <div className="alm-transfer-preview">
                  {[{ rol: 'ORIGEN', s: siloOrigen, signo: -1 }, null, { rol: 'DESTINO', s: siloDestinoTransf, signo: 1 }].map((item, i) => (item ? (
                    <div key={item.rol} className="alm-transfer-silo">
                      <small>{item.rol}</small>
                      <strong>{item.s.nombre}</strong>
                      <span className="alm-muted">{item.s.tipoSilo === 'Bolson' ? 'Bolsón' : 'Chapa'} · {item.rol === 'DESTINO' && Number(item.s.cantidadGranoAlmacenado) === 0 ? `Vacío → ${siloOrigen.producto || 'grano'}` : (item.s.producto || 'Sin grano')}</span>
                      {(() => {
                        const antes = Number(item.s.cantidadGranoAlmacenado);
                        const cap = Number(item.s.capacidadMax);
                        const desp = Math.max(0, antes + item.signo * cantidad);
                        return (
                          <div className="alm-transfer-body">
                            <SiloGlyphAlm tipo={item.s.tipoSilo} porcentaje={cap > 0 ? (desp / cap) * 100 : 0} />
                            <div>
                              <span>Antes: {kg(antes)} ({porcentajeTexto(cap > 0 ? (antes / cap) * 100 : 0)})</span>
                              <b>Después: {kg(desp)} ({porcentajeTexto(cap > 0 ? (desp / cap) * 100 : 0)})</b>
                              <span>Capacidad {kg(cap)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div key={`flecha-${i}`} className="alm-transfer-flecha"><ArrowRight size={26} /><b>{kg(cantidad)}</b></div>
                  )))}
                </div>
              </div>
            )}

            {/* ------------------------ PARTIDAS QUE SE CONSUMEN / MUEVEN ------------------------ */}
            {previewFifo.length > 0 && (
              <div className="dashboard-card alm-card">
                <TituloCard Icono={Package}>{isTransferencia ? 'Partidas que se mueven' : 'Partidas que se consumen'}</TituloCard>
                <p className="alm-muted">
                  {isTransferencia
                    ? 'La partida conserva su fecha de ingreso y su cosecha: la antigüedad del grano no se reinicia al cambiar de silo.'
                    : 'El grano sale primero de la partida más antigua.'}
                </p>
                <div className="silo-table-scroll">
                  <table className="silo-mini-table">
                    <thead>
                      <tr>
                        <th>Partida</th><th>Cosecha</th><th>Ingreso original</th>
                        <th className="num">{isTransferencia ? 'Kg que se transfieren' : 'Kg que salen'}</th>
                        <th className="num">Queda en origen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewFifo.map((p) => (
                        <tr key={p.partidaId}>
                          <td>{codigoPartidaAlm(p.partidaId)}</td>
                          <td>{p.cosechaNombre ? <span className="alm-chip alm-chip-verde">{p.cosechaNombre}</span> : <span className="alm-muted">Sin cosecha</span>}</td>
                          <td>{formatDate(p.fechaIngreso)}</td>
                          <td className="num">{Number(p.toma).toLocaleString('es-AR')}</td>
                          <td className="num">{(Number(p.kgRestantes) - p.toma).toLocaleString('es-AR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {readOnly && movimiento && (
              <div className="dashboard-card alm-card">
                <TituloCard Icono={FileText}>Trazabilidad</TituloCard>
                <dl className="alm-kv">
                  <div><dt>Tipo</dt><dd>{etiquetaTipo(movimiento)}</dd></div>
                  {movimiento.motivo && <div><dt>Motivo</dt><dd>{etiquetaMotivo(movimiento.motivo)}</dd></div>}
                  <div><dt>Origen del registro</dt><dd>{ORIGEN_TEXTO[movimiento.origen] ?? movimiento.origen}</dd></div>
                  <div><dt>Stock antes</dt><dd>{kg(movimiento.stockAnterior)}</dd></div>
                  <div><dt>Stock después</dt><dd>{kg(movimiento.stockResultante)}</dd></div>
                  <div><dt>Registrado por</dt><dd>{movimiento.creadoPorNombre || '-'}</dd></div>
                </dl>
              </div>
            )}
          </div>

          {/* ------------------------------ PANEL LATERAL ------------------------------ */}
          {!readOnly && ((isIngreso && saldo) || siloPreview) && (
            <aside className="alm-form-side">
              {isIngreso && saldo && (
                <div className="dashboard-card alm-card">
                  <TituloCard Icono={Sprout}>Saldo de la cosecha</TituloCard>
                  <strong className="alm-side-title">{saldo.nombre} · {saldo.producto} · {saldo.loteNombre}</strong>
                  <dl className="alm-kv">
                    <div><dt>Cosechado</dt><dd>{kg(saldo.kgCosechados)}</dd></div>
                    <div><dt>Ya almacenado</dt><dd>{kg(Number(saldo.kgAlmacenados) - (mode === 'edit' && movimiento?.cosechaId ? Number(movimiento.cantidad) : 0))}</dd></div>
                    <div><dt>Distribuido directo</dt><dd>{kg(saldo.kgDistribuidosDirecto)}</dd></div>
                    <div className="alm-kv-total"><dt>Disponible</dt><dd>{kg(disponible)}</dd></div>
                  </dl>
                  <div className="alm-bar alm-bar-lg" style={{ marginTop: 12 }}><span className="alm-bar-fill baja" style={{ width: `${saldoUsado}%` }} /></div>
                  <p className="alm-muted">Este ingreso usa el {saldoUsado} % del saldo.</p>
                </div>
              )}
              {siloPreview && (
                <div className="dashboard-card alm-card">
                  <TituloCard Icono={Warehouse}>Así queda {siloPreview.nombre}</TituloCard>
                  <div className="alm-asi-queda">
                    <SiloGlyphAlm tipo={siloPreview.tipo} porcentaje={pctDespues} />
                    <div>
                      <strong style={{ color: colorOcupacionAlm(pctDespues) }}>{porcentajeTexto(pctDespues)}</strong>
                      <span>{Number(despues).toLocaleString('es-AR')} / {kg(siloPreview.cap)}</span>
                    </div>
                  </div>
                  {siloPreview.signo > 0 && pctDespues >= 90 && pctDespues <= 100 && (
                    <p className="alm-warning">Queda cerca del límite. El {isAjuste ? 'ajuste' : 'ingreso'} se permite.</p>
                  )}
                  {siloPreview.signo < 0 && despues === 0 && cantidad > 0 && (
                    <p className="alm-muted">El silo queda vacío y pasa a estado Vacío.</p>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>

        <div className="form-actions alm-form-actions">
          {readOnly ? (
            <>
              <button className="back-button" type="button" onClick={onCancel}>Volver</button>
              {canEdit && <button className="green-button" type="button" onClick={onEdit}>Editar</button>}
            </>
          ) : (
            <>
              <button className="back-button" type="button" onClick={onCancel}>Cancelar</button>
              <button className="green-button alm-submit" type="submit" disabled={saving}>
                <IconoBoton size={17} />
                <span>{saving ? 'Guardando...' : isCreate ? textoBoton : 'Guardar'}</span>
              </button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}

const ORIGEN_TEXTO = { Manual: 'Manual', AltaSilo: 'Alta de silo', Distribucion: 'Distribución', Transferencia: 'Transferencia' };

function etiquetaMotivo(motivo) {
  return motivo === 'Diferencia de medicion' ? 'Diferencia de medición' : motivo;
}

function etiquetaTipo(m) {
  if (m.tipoMovimiento === 'AjustePositivo') return 'Ajuste +';
  if (m.tipoMovimiento === 'AjusteNegativo') return 'Ajuste −';
  if (m.origen === 'Transferencia') return m.tipoMovimiento === 'Egreso' ? 'Transferencia (sale)' : 'Transferencia (entra)';
  return m.tipoMovimiento;
}
