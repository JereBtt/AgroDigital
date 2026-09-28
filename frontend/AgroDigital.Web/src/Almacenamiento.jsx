import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
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
    cosechaId: '',
    siloId: '',
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
    setForm(emptyForm({
      tipoMovimiento: movimiento.tipoMovimiento,
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

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    const numberOrNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));
    const body = {
      fecha: form.fecha,
      tipoMovimiento: form.tipoMovimiento,
      cantidad: Number(form.cantidad),
      humedadIngreso: form.tipoMovimiento === 'Ingreso' ? numberOrNull(form.humedadIngreso) : null,
      impurezas: form.tipoMovimiento === 'Ingreso' ? numberOrNull(form.impurezas) : null,
      observaciones: form.observaciones || null
    };

    try {
      const isEdit = view === 'edit';
      const response = await fetch(
        isEdit
          ? `${API_BASE_URL}/api/almacenamientos/${selectedMovimiento.almacenamientoId}`
          : `${API_BASE_URL}/api/almacenamientos`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(isEdit
            ? { ...body, producto: selectedMovimiento.producto ?? null, campania: selectedMovimiento.campania ?? null, cosecha: selectedMovimiento.cosecha ?? null }
            : { ...body, siloId: Number(form.siloId), cosechaId: form.cosechaId ? Number(form.cosechaId) : null })
        }
      );
      if (!response.ok) throw new Error(await readError(response));
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
    return matchesQuery && (!siloFilter || m.siloNombre === siloFilter) && (!tipoFilter || m.tipoMovimiento === tipoFilter);
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
                      <span className={`movimiento-chip movimiento-${m.tipoMovimiento === 'Ingreso' ? 'ingreso' : 'egreso'}`}>
                        {m.tipoMovimiento === 'Ingreso' ? <ArrowDownCircle size={15} /> : <ArrowUpCircle size={15} />}
                        {m.tipoMovimiento}
                      </span>
                    </td>
                    <td className="alm-sub-cell">{origenTexto[m.origen] ?? m.origen}</td>
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

function MovimientoForm({ mode, form, setForm, movimiento, silos, stock, canEdit, empresaId, empresaNombre, fetchJson, saving, error, onCancel, onEdit, onSubmit }) {
  const isCreate = mode === 'create';
  const readOnly = mode === 'detail';
  const isIngreso = form.tipoMovimiento === 'Ingreso';

  const [cosechas, setCosechas] = useState([]);
  const [saldo, setSaldo] = useState(null);
  const [silosDestino, setSilosDestino] = useState([]);
  const [loadingDestino, setLoadingDestino] = useState(false);
  const [localError, setLocalError] = useState('');
  const [parametros, setParametros] = useState([]);

  // Umbrales del ingeniero (paso 4 de Silos), para advertir humedad alta al ingreso.
  useEffect(() => {
    if (!isIngreso || readOnly) return;
    fetchJson(`/api/grano-parametros?empresaId=${empresaId}`).then(setParametros).catch(() => setParametros([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIngreso, readOnly, empresaId]);

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

  // Saldo de la cosecha elegida (tambien al editar o ver un ingreso vinculado).
  useEffect(() => {
    if (!form.cosechaId) {
      setSaldo(null);
      return;
    }
    fetchJson(`/api/almacenamientos/cosechas/${form.cosechaId}/saldo`)
      .then(setSaldo)
      .catch(() => setSaldo(null));
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
        // Si el silo elegido dejo de ser compatible, se deselecciona.
        if (form.siloId && !data.some((s) => String(s.siloId) === String(form.siloId) && s.compatible)) {
          update('siloId', '');
        }
      })
      .catch((err) => setLocalError(`No se pudieron cargar los silos: ${err.message}`))
      .finally(() => setLoadingDestino(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, isIngreso, saldo?.producto, empresaId]);

  const cantidad = Number(form.cantidad) || 0;
  const granoIngreso = saldo?.producto ?? movimiento?.producto ?? '';
  const tipoSiloDestino = silosDestino.find((s) => String(s.siloId) === String(form.siloId))?.tipoSilo
    ?? silos.find((s) => String(s.siloId) === String(form.siloId))?.tipoSilo;
  const normalizar = (v) => normalizeSearchText(String(v ?? '').trim());
  const parametroIngreso = tipoSiloDestino
    ? parametros.find((p) => p.tipoSilo === tipoSiloDestino && normalizar(p.producto) === normalizar(granoIngreso))
    : null;
  const humedadIngreso = form.humedadIngreso === '' ? null : Number(form.humedadIngreso);
  const humedadAlta = parametroIngreso && humedadIngreso !== null && humedadIngreso > Number(parametroIngreso.umbralHumedad);
  const siloDestino = silosDestino.find((s) => String(s.siloId) === String(form.siloId));
  const siloActual = silos.find((s) => String(s.siloId) === String(form.siloId));
  const silosConStock = silos.filter((s) => Number(s.cantidadGranoAlmacenado) > 0 && s.estadoOperativo !== 'Dado de baja');

  // Saldo disponible: al editar, lo propio de este movimiento vuelve a estar disponible.
  const disponible = saldo
    ? Number(saldo.kgDisponibles) + (mode === 'edit' && movimiento?.cosechaId ? Number(movimiento.cantidad) : 0)
    : null;

  // Vista previa del egreso: que partidas consume, de la mas vieja a la mas nueva.
  const previewEgreso = useMemo(() => {
    if (!isCreate || isIngreso || !form.siloId || !stock) return [];
    const partidas = stock.silos.find((s) => String(s.siloId) === String(form.siloId))?.partidas ?? [];
    let pendiente = cantidad;
    return partidas.map((p) => {
      const toma = Math.max(0, Math.min(p.kgRestantes, pendiente));
      pendiente -= toma;
      return { ...p, toma };
    }).filter((p) => p.toma > 0);
  }, [isCreate, isIngreso, form.siloId, stock, cantidad]);

  function validar() {
    if (!form.fecha) return 'Indicá la fecha.';
    if (form.fecha > todayIso()) return 'La fecha no puede ser posterior a hoy.';
    if (!(cantidad > 0)) return 'La cantidad debe ser mayor a cero.';
    if (isCreate && isIngreso && !form.cosechaId) return 'Elegí la cosecha de la que viene el grano.';
    if (isCreate && !form.siloId) return isIngreso ? 'Elegí el silo destino.' : 'Elegí el silo del que sale el grano.';
    if (isIngreso && disponible !== null && cantidad > disponible) return `La cantidad supera el saldo disponible de la cosecha (${kg(disponible)}).`;
    if (isCreate && isIngreso && siloDestino && cantidad > siloDestino.capacidadLibre) return `La cantidad supera la capacidad libre del silo (${kg(siloDestino.capacidadLibre)}).`;
    if (isCreate && !isIngreso && siloActual && cantidad > Number(siloActual.cantidadGranoAlmacenado)) return `La cantidad supera el stock del silo (${kg(siloActual.cantidadGranoAlmacenado)}).`;
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

  const titles = {
    create: ['Registrar movimiento', 'Elegí el tipo y el formulario se adapta.'],
    edit: ['Editar movimiento', 'Solo se puede editar el último movimiento manual del silo.'],
    detail: ['Detalle del movimiento', 'Información en modo de solo lectura.']
  };
  const [title, description] = titles[mode];
  const mensajeError = localError || error;

  const cosechaElegida = saldo;
  const previewSilo = isIngreso && isCreate && siloDestino ? {
    antes: Number(siloDestino.kg),
    despues: Number(siloDestino.kg) + cantidad,
    capacidad: Number(siloDestino.capacidadMax)
  } : null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>

      <div className="alm-context">
        <Home size={18} />
        <span>{readOnly ? 'Empresa' : 'Registrando en'}</span>
        <strong>{empresaNombre || 'Empresa seleccionada'}</strong>
        {!readOnly && <small>Para cambiar de empresa, volvé al listado.</small>}
      </div>

      {mensajeError && <p className="alm-error" role="alert">{mensajeError}</p>}

      <form onSubmit={submit} noValidate>
        {isCreate && (
          <div className="dashboard-card alm-card">
            <div className="alm-type-grid" role="radiogroup" aria-label="Tipo de movimiento">
              {[
                { value: 'Ingreso', label: 'Ingreso', help: 'Grano que entra desde una cosecha', icon: <ArrowDownCircle size={22} /> },
                { value: 'Egreso', label: 'Egreso', help: 'Grano que sale de un silo', icon: <ArrowUpCircle size={22} /> }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={form.tipoMovimiento === option.value}
                  className={`alm-type-option ${form.tipoMovimiento === option.value ? 'selected' : ''}`}
                  onClick={() => setForm(emptyForm({ tipoMovimiento: option.value, fecha: form.fecha }))}
                >
                  {option.icon}
                  <span><strong>{option.label}</strong><small>{option.help}</small></span>
                </button>
              ))}
            </div>
            <p className="alm-muted alm-footnote">Transferencias entre silos y ajustes de stock llegan en la próxima etapa.</p>
          </div>
        )}

        <div className="alm-form-layout">
          <div className="alm-form-main">
            {isIngreso && (
              <div className="dashboard-card alm-card">
                <h2>Origen</h2>
                <div className="create-grid">
                  <label className="field field-wide">
                    <span className="field-label">Cosecha <b>*</b></span>
                    {isCreate ? (
                      <select value={form.cosechaId} onChange={(event) => { setLocalError(''); setForm((c) => ({ ...c, cosechaId: event.target.value, siloId: '' })); }}>
                        <option value="">Seleccionar cosecha con saldo</option>
                        {cosechas.map((c) => (
                          <option key={c.cosechaId} value={c.cosechaId}>
                            {c.nombre} · {c.producto} · {c.loteNombre} · {kg(c.kgDisponibles)} disponibles
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={movimiento?.cosecha || 'Sin cosecha vinculada'} readOnly disabled />
                    )}
                    {isCreate && cosechas.length === 0 && <small className="alm-muted">No hay cosechas finalizadas con grano pendiente de almacenar.</small>}
                  </label>
                  <label className="field">
                    Lote
                    <input value={cosechaElegida?.loteNombre ?? '-'} readOnly disabled />
                  </label>
                  <label className="field">
                    Grano
                    <input value={cosechaElegida?.producto ?? movimiento?.producto ?? '-'} readOnly disabled />
                  </label>
                  <label className="field">
                    Campaña
                    <input value={cosechaElegida?.campaniaNombre ?? movimiento?.campania ?? '-'} readOnly disabled />
                  </label>
                </div>
              </div>
            )}

            <div className="dashboard-card alm-card">
              <h2>{isIngreso ? 'Silo destino' : 'Silo de origen'}</h2>
              {isCreate && isIngreso ? (
                !form.cosechaId ? (
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
                        className={`alm-silo-option ${String(form.siloId) === String(s.siloId) ? 'selected' : ''}`}
                        onClick={() => update('siloId', String(s.siloId))}
                      >
                        <span>
                          <strong>{s.nombre}</strong>
                          <small>{[s.tipoSilo === 'Bolson' ? 'Bolsón' : s.tipoSilo, s.kg > 0 ? `${s.producto} · ${kg(s.kg)}` : 'Vacío'].join(' · ')}</small>
                        </span>
                        <em>{s.compatible ? `${kg(s.capacidadLibre)} libres` : s.motivoNoCompatible}</em>
                      </button>
                    ))}
                  </div>
                )
              ) : isCreate ? (
                <label className="field">
                  <span className="field-label">Silo <b>*</b></span>
                  <select value={form.siloId} onChange={(event) => update('siloId', event.target.value)}>
                    <option value="">Seleccionar silo con grano</option>
                    {silosConStock.map((s) => (
                      <option key={s.siloId} value={s.siloId}>{s.nombre} · {s.producto || 'Sin grano'} · {kg(s.cantidadGranoAlmacenado)}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="field">
                  Silo
                  <input value={movimiento?.siloNombre ?? '-'} readOnly disabled />
                </label>
              )}
            </div>

            <div className="dashboard-card alm-card">
              <h2>{isIngreso ? 'Ingreso' : 'Egreso'}</h2>
              <div className="create-grid">
                <label className="field">
                  <span className="field-label">Fecha <b>*</b></span>
                  <input type="date" value={form.fecha} max={todayIso()} readOnly={readOnly} onChange={(event) => update('fecha', event.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">Cantidad (kg) <b>*</b></span>
                  <input type="number" min="0" step="any" value={form.cantidad} readOnly={readOnly} onChange={(event) => update('cantidad', event.target.value)} />
                </label>
                {isIngreso && (
                  <>
                    <label className="field">
                      Humedad al ingreso (%)
                      <input type="number" min="0" max="100" step="0.1" className={humedadAlta ? 'input-alerta' : undefined} value={form.humedadIngreso} readOnly={readOnly} onChange={(event) => update('humedadIngreso', event.target.value)} placeholder="Opcional" />
                      {humedadAlta && (
                        <small className="control-aviso">
                          Supera el umbral de almacenamiento ({Number(parametroIngreso.umbralHumedad).toLocaleString('es-AR')} %). Se recomienda secado y programar un control.
                        </small>
                      )}
                    </label>
                    <label className="field">
                      Impurezas (%)
                      <input type="number" min="0" max="100" step="0.1" value={form.impurezas} readOnly={readOnly} onChange={(event) => update('impurezas', event.target.value)} placeholder="Opcional" />
                    </label>
                  </>
                )}
                <label className="field field-wide">
                  Observaciones
                  <input value={form.observaciones} readOnly={readOnly} onChange={(event) => update('observaciones', event.target.value)} placeholder="Opcional" />
                </label>
              </div>
            </div>

            {!isIngreso && previewEgreso.length > 0 && (
              <div className="dashboard-card alm-card">
                <h2>Partidas que se consumen</h2>
                <p className="alm-muted">El grano sale primero de la partida más antigua.</p>
                <table className="alm-partidas">
                  <thead>
                    <tr><th>Cosecha</th><th>Ingreso</th><th style={{ textAlign: 'right' }}>Se toman</th><th style={{ textAlign: 'right' }}>Quedan</th></tr>
                  </thead>
                  <tbody>
                    {previewEgreso.map((p) => (
                      <tr key={p.partidaId}>
                        <td>{p.cosechaNombre || 'Sin cosecha'}</td>
                        <td>{formatDate(p.fechaIngreso)}</td>
                        <td style={{ textAlign: 'right' }}>{kg(p.toma)}</td>
                        <td style={{ textAlign: 'right' }}>{kg(p.kgRestantes - p.toma)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {readOnly && movimiento && (
              <div className="dashboard-card alm-card">
                <h2>Trazabilidad</h2>
                <dl className="alm-kv">
                  <div><dt>Origen del registro</dt><dd>{movimiento.origen}</dd></div>
                  <div><dt>Stock antes</dt><dd>{kg(movimiento.stockAnterior)}</dd></div>
                  <div><dt>Stock después</dt><dd>{kg(movimiento.stockResultante)}</dd></div>
                  <div><dt>Registrado por</dt><dd>{movimiento.creadoPorNombre || '-'}</dd></div>
                </dl>
              </div>
            )}
          </div>

          {isIngreso && (cosechaElegida || previewSilo) && (
            <aside className="alm-form-side">
              {cosechaElegida && (
                <div className="dashboard-card alm-card">
                  <h2>Saldo de la cosecha</h2>
                  <strong className="alm-side-title">{cosechaElegida.nombre} · {cosechaElegida.producto} · {cosechaElegida.loteNombre}</strong>
                  <dl className="alm-kv">
                    <div><dt>Cosechado</dt><dd>{kg(cosechaElegida.kgCosechados)}</dd></div>
                    <div><dt>Ya almacenado</dt><dd>{kg(Number(cosechaElegida.kgAlmacenados) - (mode === 'edit' && movimiento?.cosechaId ? Number(movimiento.cantidad) : 0))}</dd></div>
                    <div><dt>Distribuido directo</dt><dd>{kg(cosechaElegida.kgDistribuidosDirecto)}</dd></div>
                    <div className="alm-kv-total"><dt>Disponible</dt><dd>{kg(disponible)}</dd></div>
                  </dl>
                  {!readOnly && disponible > 0 && (
                    <p className="alm-muted">Este movimiento usa el {Math.min(100, Math.round((cantidad / disponible) * 100))} % del saldo.</p>
                  )}
                </div>
              )}
              {previewSilo && (
                <div className="dashboard-card alm-card">
                  <h2>Así queda {siloDestino.nombre}</h2>
                  {(() => {
                    const porcentaje = previewSilo.capacidad > 0 ? Math.round((previewSilo.despues / previewSilo.capacidad) * 100) : 0;
                    return (
                      <>
                        <div className="alm-bar alm-bar-lg"><span className={`alm-bar-fill ${ocupacionClass(porcentaje)}`} style={{ width: `${Math.min(100, porcentaje)}%` }} /></div>
                        <p className="alm-preview-numbers"><strong>{porcentaje} %</strong> · {kg(previewSilo.despues)} de {kg(previewSilo.capacidad)}</p>
                        {porcentaje >= 90 && porcentaje <= 100 && <p className="alm-warning">Queda cerca del límite. El ingreso se permite.</p>}
                      </>
                    );
                  })()}
                </div>
              )}
            </aside>
          )}
        </div>

        <div className="form-actions">
          {readOnly ? (
            <>
              <button className="back-button" type="button" onClick={onCancel}>Volver</button>
              {canEdit && <button className="green-button" type="button" onClick={onEdit}>Editar</button>}
            </>
          ) : (
            <>
              <button className="green-button" type="submit" disabled={saving}>
                {saving ? 'Guardando...' : isCreate ? `Registrar ${isIngreso ? 'ingreso' : 'egreso'}` : 'Guardar'}
              </button>
              <button className="back-button" type="button" onClick={onCancel}>Cancelar</button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
