import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  Edit,
  Filter,
  Home,
  LoaderCircle,
  PlusCircle,
  RotateCcw,
  Search
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyMovimientoForm() {
  return {
    siloId: '',
    fecha: todayIso(),
    tipoMovimiento: 'Ingreso',
    cantidad: '',
    campania: '',
    cosecha: '',
    observaciones: ''
  };
}

function normalizeSearchText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function Almacenamiento({ session }) {
  const [view, setView] = useState('list');
  const [movimientos, setMovimientos] = useState([]);
  const [silos, setSilos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedMovimiento, setSelectedMovimiento] = useState(null);
  const [form, setForm] = useState(emptyMovimientoForm);

  function authHeaders(extra = {}) {
    return session?.token ? { ...extra, Authorization: `Bearer ${session.token}` } : extra;
  }

  async function loadMovimientos() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/almacenamientos`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      setMovimientos(await response.json());
    } catch (err) {
      setError(`No se pudieron cargar los movimientos de almacenamiento: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadSilos() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/silos`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      setSilos(await response.json());
    } catch (err) {
      setError(`No se pudieron cargar los silos: ${err.message}`);
    }
  }

  useEffect(() => {
    loadMovimientos();
    loadSilos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Un movimiento solo se puede editar si es el ultimo cargado para ese
  // silo (misma regla que aplica el backend). Se calcula sobre la lista ya
  // ordenada por Fecha/Id descendente que devuelve la API.
  const editableIds = useMemo(() => {
    const vistos = new Set();
    const editables = new Set();
    for (const movimiento of movimientos) {
      if (!vistos.has(movimiento.siloId)) {
        vistos.add(movimiento.siloId);
        editables.add(movimiento.almacenamientoId);
      }
    }
    return editables;
  }, [movimientos]);

  function goToList() {
    setView('list');
    setSelectedMovimiento(null);
    setError('');
    loadMovimientos();
    loadSilos();
  }

  function startCreate() {
    setForm(emptyMovimientoForm());
    setError('');
    setView('create');
  }

  function openMovimiento(movimiento, mode) {
    setSelectedMovimiento(movimiento);
    setForm({
      siloId: movimiento.siloId,
      fecha: movimiento.fecha ? movimiento.fecha.slice(0, 10) : todayIso(),
      tipoMovimiento: movimiento.tipoMovimiento,
      cantidad: movimiento.cantidad,
      campania: movimiento.campania ?? '',
      cosecha: movimiento.cosecha ?? '',
      observaciones: movimiento.observaciones ?? ''
    });
    setError('');
    setView(mode);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function validarContraSilo() {
    const silo = silos.find((s) => String(s.siloId) === String(form.siloId));
    if (!silo) return null;

    const cantidad = Number(form.cantidad) || 0;
    const stockActual = Number(silo.cantidadGranoAlmacenado) || 0;

    if (form.tipoMovimiento === 'Ingreso') {
      const disponible = Number(silo.capacidadMax) - stockActual;
      if (cantidad > disponible) {
        return `La cantidad a almacenar supera la capacidad disponible del silo. Disponible: ${disponible.toLocaleString('es-AR')} kg (capacidad max ${Number(silo.capacidadMax).toLocaleString('es-AR')} kg, stock actual ${stockActual.toLocaleString('es-AR')} kg).`;
      }
    } else if (cantidad > stockActual) {
      return `La cantidad a retirar supera el stock actual del silo (${stockActual.toLocaleString('es-AR')} kg).`;
    }

    return null;
  }

  async function handleCreate(event) {
    event.preventDefault();
    const validacion = validarContraSilo();
    if (validacion) {
      setError(validacion);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/almacenamientos`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          siloId: Number(form.siloId),
          fecha: form.fecha,
          tipoMovimiento: form.tipoMovimiento,
          cantidad: Number(form.cantidad),
          campania: form.campania || null,
          cosecha: form.cosecha || null,
          observaciones: form.observaciones || null
        })
      });
      if (!response.ok) throw new Error(await response.text());
      goToList();
    } catch (err) {
      setError(`No se pudo registrar el movimiento: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/almacenamientos/${selectedMovimiento.almacenamientoId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          fecha: form.fecha,
          tipoMovimiento: form.tipoMovimiento,
          cantidad: Number(form.cantidad),
          campania: form.campania || null,
          cosecha: form.cosecha || null,
          observaciones: form.observaciones || null
        })
      });
      if (!response.ok) throw new Error(await response.text());
      goToList();
    } catch (err) {
      setError(`No se pudo guardar el movimiento: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (view === 'create' || view === 'edit' || view === 'detail') {
    const titles = {
      create: ['Registrar Almacenamiento', 'Registra un ingreso o egreso de grano en un silo.', 'Registrar'],
      edit: ['Editar Almacenamiento', 'Modifica el ultimo movimiento cargado para este silo.', 'Guardar'],
      detail: ['Detalle Almacenamiento', 'Informacion del movimiento en modo de solo lectura.', 'Editar']
    };
    const [title, description, submitLabel] = titles[view];

    return (
      <MovimientoForm
        title={title}
        description={description}
        submitLabel={submitLabel}
        form={form}
        silos={silos}
        saving={saving}
        error={error}
        readOnly={view === 'detail'}
        isCreate={view === 'create'}
        onFieldChange={updateField}
        onCancel={goToList}
        onEdit={() => setView('edit')}
        onSubmit={view === 'create' ? handleCreate : handleUpdate}
      />
    );
  }

  return (
    <MovimientosList
      movimientos={movimientos}
      loading={loading}
      error={error}
      editableIds={editableIds}
      onAdd={startCreate}
      onView={(movimiento) => openMovimiento(movimiento, 'detail')}
      onEdit={(movimiento) => openMovimiento(movimiento, 'edit')}
    />
  );
}

function MovimientosList({ movimientos, loading, error, editableIds, onAdd, onView, onEdit }) {
  const [query, setQuery] = useState('');
  const [siloFilter, setSiloFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');

  const siloOptions = useMemo(
    () => [...new Set(movimientos.map((movimiento) => movimiento.siloNombre).filter(Boolean))],
    [movimientos]
  );

  const filtered = useMemo(() => movimientos.filter((movimiento) => {
    const texto = normalizeSearchText(query.trim());
    const camposBusqueda = [
      movimiento.siloNombre,
      movimiento.siloProducto,
      movimiento.tipoMovimiento,
      movimiento.origen,
      movimiento.observaciones,
      movimiento.campania,
      movimiento.cosecha,
      String(movimiento.cantidad ?? ''),
      String(movimiento.stockResultante ?? '')
    ];
    const matchesQuery = !texto || camposBusqueda.some(
      (campo) => normalizeSearchText(campo ?? '').includes(texto)
    );
    const matchesSilo = !siloFilter || movimiento.siloNombre === siloFilter;
    const matchesTipo = !tipoFilter || movimiento.tipoMovimiento === tipoFilter;
    return matchesQuery && matchesSilo && matchesTipo;
  }), [movimientos, query, siloFilter, tipoFilter]);

  function clearFilters() {
    setQuery('');
    setSiloFilter('');
    setTipoFilter('');
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Almacenamiento</h1>
          <p>Registra y consulta los ingresos y egresos de grano de tus silos.</p>
        </div>
        <button className="green-button add-lote-button" type="button" onClick={onAdd}>
          <PlusCircle size={18} />
          <span>Registrar Almacenamiento</span>
        </button>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="filters-card">
        <label className="search-field">
          <Search size={21} />
          <input data-text-case="preserve" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cualquier dato del movimiento..." />
        </label>
        <select value={siloFilter} onChange={(event) => setSiloFilter(event.target.value)}>
          <option value="">Silo</option>
          {siloOptions.map((silo) => <option key={silo} value={silo}>{silo}</option>)}
        </select>
        <select value={tipoFilter} onChange={(event) => setTipoFilter(event.target.value)}>
          <option value="">Tipo de Movimiento</option>
          <option value="Ingreso">Ingreso</option>
          <option value="Egreso">Egreso</option>
        </select>
        <button className="soft-filter-button" type="button">
          <Filter size={17} />
          <span>Mas filtros</span>
        </button>
        <button className="clear-button" type="button" onClick={clearFilters}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
      </div>

      {loading ? (
        <div className="table-shell dashboard-card">
          <div className="loading-state">
            <LoaderCircle className="spin" size={24} />
            <span>Cargando movimientos...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Home size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Aun no tenes movimientos de almacenamiento</h2>
            <p>Registra el primer ingreso o egreso de grano de un silo.</p>
          </div>
          <button className="green-button empty-state-action" type="button" onClick={onAdd}>
            <PlusCircle size={18} />
            <span>Registrar Almacenamiento</span>
          </button>
        </section>
      ) : (
        <div className="table-shell dashboard-card">
          <table className="lotes-table">
            <thead>
              <tr>
                <th>Fecha de registro</th>
                <th>Silo</th>
                <th>Tipo de Movimiento</th>
                <th>Cantidad</th>
                <th>Stock existente</th>
                <th>Producto</th>
                <th>Campaña</th>
                <th>Cosecha</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((movimiento) => (
                <tr key={movimiento.almacenamientoId}>
                  <td>{movimiento.fecha}</td>
                  <td>{movimiento.siloNombre}</td>
                  <td>
                    <span className={`movimiento-chip movimiento-${movimiento.tipoMovimiento === 'Ingreso' ? 'ingreso' : 'egreso'}`}>
                      {movimiento.tipoMovimiento === 'Ingreso' ? <ArrowDownCircle size={15} /> : <ArrowUpCircle size={15} />}
                      {movimiento.tipoMovimiento}
                    </span>
                  </td>
                  <td>{Number(movimiento.cantidad).toLocaleString('es-AR')} kg</td>
                  <td>{Number(movimiento.stockResultante).toLocaleString('es-AR')} kg</td>
                  <td>{movimiento.siloProducto || '-'}</td>
                  <td>{movimiento.campania || '-'}</td>
                  <td>{movimiento.cosecha || '-'}</td>
                  <td className="actions-cell">
                    <button type="button" aria-label={`Ver movimiento de ${movimiento.siloNombre}`} onClick={() => onView(movimiento)}><Eye size={18} /></button>
                    <button
                      type="button"
                      aria-label={`Editar movimiento de ${movimiento.siloNombre}`}
                      disabled={!editableIds.has(movimiento.almacenamientoId)}
                      title={editableIds.has(movimiento.almacenamientoId) ? undefined : 'Solo se puede editar el ultimo movimiento del silo'}
                      onClick={() => onEdit(movimiento)}
                    >
                      <Edit size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function MovimientoForm({
  title,
  description,
  submitLabel,
  form,
  silos,
  saving,
  error,
  readOnly,
  isCreate,
  onFieldChange,
  onCancel,
  onEdit,
  onSubmit
}) {
  const siloSeleccionado = silos.find((silo) => String(silo.siloId) === String(form.siloId));

  const content = (
    <div className="create-form-card dashboard-card">
      <div className="create-grid">
        <label className="field">
          Fecha <b>*</b>
          <input type="date" value={form.fecha} readOnly={readOnly} onChange={(e) => onFieldChange('fecha', e.target.value)} />
        </label>
        <label className="field">
          Silo <b>*</b>
          <select
            value={form.siloId}
            disabled={readOnly || !isCreate}
            onChange={(e) => onFieldChange('siloId', e.target.value)}
          >
            <option value="">Seleccionar</option>
            {silos.map((silo) => (
              <option key={silo.siloId} value={silo.siloId}>{silo.nombre}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Tipo de Movimiento <b>*</b>
          <select value={form.tipoMovimiento} disabled={readOnly} onChange={(e) => onFieldChange('tipoMovimiento', e.target.value)}>
            <option value="Ingreso">Ingreso</option>
            <option value="Egreso">Egreso</option>
          </select>
        </label>
        <label className="field">
          Cant. grano actual
          <input value={siloSeleccionado ? `${Number(siloSeleccionado.cantidadGranoAlmacenado).toLocaleString('es-AR')} kg` : '-'} readOnly disabled />
          {siloSeleccionado && (
            <small style={{ fontWeight: 600, color: '#637168' }}>
              Capacidad max: {Number(siloSeleccionado.capacidadMax).toLocaleString('es-AR')} kg
              {form.tipoMovimiento === 'Ingreso'
                ? ` · Disponible: ${(Number(siloSeleccionado.capacidadMax) - Number(siloSeleccionado.cantidadGranoAlmacenado)).toLocaleString('es-AR')} kg`
                : ''}
            </small>
          )}
        </label>
        <label className="field">
          Cant. grano a {form.tipoMovimiento === 'Egreso' ? 'retirar' : 'almacenar'} <b>*</b>
          <input type="number" min="0" value={form.cantidad} readOnly={readOnly} onChange={(e) => onFieldChange('cantidad', e.target.value)} />
        </label>
        <label className="field">
          Campaña
          <input value={form.campania} readOnly={readOnly} onChange={(e) => onFieldChange('campania', e.target.value)} placeholder="Opcional" />
        </label>
        <label className="field">
          Cosecha
          <input value={form.cosecha} readOnly={readOnly} onChange={(e) => onFieldChange('cosecha', e.target.value)} placeholder="Opcional" />
        </label>
        <label className="field field-wide">
          Observaciones
          <input value={form.observaciones} readOnly={readOnly} onChange={(e) => onFieldChange('observaciones', e.target.value)} placeholder="Opcional" />
        </label>
      </div>
    </div>
  );

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      {readOnly ? (
        <>
          {content}
          <div className="form-actions">
            <button className="back-button" type="button" onClick={onCancel}>Volver</button>
            <button className="green-button" type="button" onClick={onEdit}>{submitLabel}</button>
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          {content}
          <div className="form-actions">
            <button className="green-button" type="submit" disabled={saving}>
              {saving ? 'Guardando...' : submitLabel}
            </button>
            <button className="back-button" type="button" onClick={onCancel}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}
