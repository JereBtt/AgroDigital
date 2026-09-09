import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Edit,
  Eye,
  Leaf,
  LoaderCircle,
  Package,
  PlusCircle,
  RotateCcw,
  Save,
  Search,
  Sprout,
  Scale,
  Truck,
  Trash2,
  X
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const commonGrains = ['Soja', 'Maiz', 'Sorgo', 'Trigo', 'Girasol', 'Otro'];
const rotationHierarchy = {
  soja: ['maiz', 'sorgo', 'trigo', 'girasol', 'soja'],
  maiz: ['soja', 'girasol', 'trigo', 'sorgo', 'maiz'],
  sorgo: ['soja', 'girasol', 'trigo', 'maiz', 'sorgo'],
  trigo: ['soja', 'girasol', 'maiz', 'sorgo', 'trigo'],
  girasol: ['maiz', 'sorgo', 'trigo', 'soja', 'girasol']
};

const emptyCombo = {
  producto: '',
  grainMode: ''
};

function formatFecha(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es-AR');
}

function formatNumber(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  return `${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })}${suffix}`;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function getCampaignDateLimits(referenceDate = new Date()) {
  const currentYear = referenceDate.getFullYear();
  const periodStartYear = referenceDate.getMonth() >= 5 ? currentYear : currentYear - 1;
  const min = `${periodStartYear}-01-01`;
  const max = `${periodStartYear + 1}-12-31`;

  return {
    min,
    max,
    label: `Las fechas de esta campaña deben estar entre el 01/01/${periodStartYear} y el 31/12/${periodStartYear + 1}.`
  };
}

function isWithinCampaignDateLimits(value) {
  if (!value) return false;
  const { min, max } = getCampaignDateLimits();
  return value >= min && value <= max;
}

function getRotationInfo(targetGrain, previousGrain) {
  const normalizedTarget = normalizeSearchText(targetGrain);
  const normalizedPrevious = normalizeSearchText(previousGrain || 'sin dato');
  const order = rotationHierarchy[rotationHierarchy[normalizedTarget] ? normalizedTarget : 'soja'];
  const index = order.indexOf(normalizedPrevious);
  const rank = index === -1 ? 99 : index;

  if (!previousGrain || normalizedPrevious === 'sin dato') return { rank: 98, label: 'Sin antecedente cargado', tone: 'empty' };
  if (rank === 0) return { rank, label: 'Rotacion muy favorable', tone: 'best' };
  if (rank <= 2) return { rank, label: 'Rotacion favorable', tone: 'good' };
  if (rank <= 4) return { rank, label: 'Rotacion menos favorable', tone: 'weak' };
  return { rank, label: 'Otro antecesor', tone: 'other' };
}

function getLatestCultivoFromHistory(lote) {
  const latest = lote?.historialCultivos?.[0]?.cultivo;
  return latest || lote?.cultivoActual || lote?.cultivoAnterior || '';
}

export default function Campanias({ session, lotes, parentFilters, selectedEmpresaId, onLotesChanged, onCampaniasChanged, onRegisterSiembra }) {
  const [view, setView] = useState('list');
  const [campanias, setCampanias] = useState([]);
  const [selectedCampania, setSelectedCampania] = useState(null);
  const [form, setForm] = useState({ fechaInicio: '', fechaFin: '', observaciones: '', combinaciones: [] });
  const [comboForm, setComboForm] = useState(emptyCombo);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [loteSelectorSortMode, setLoteSelectorSortMode] = useState('all');
  const [missingLots, setMissingLots] = useState([]);
  const [periodConflict, setPeriodConflict] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function authHeaders(extra = {}) {
    return session?.token ? { ...extra, Authorization: `Bearer ${session.token}` } : extra;
  }

  async function loadCampanias() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/campanias`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      setCampanias(await response.json());
    } catch (err) {
      setError(`No se pudieron cargar las campanias: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCampanias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToList() {
    setView('list');
    setSelectedCampania(null);
    setForm({ fechaInicio: '', fechaFin: '', observaciones: '', combinaciones: [] });
    setComboForm(emptyCombo);
    setSelectorOpen(false);
    setLoteSelectorSortMode('all');
    setMissingLots([]);
    setPeriodConflict('');
    setError('');
    setPeriodConflict('');
    loadCampanias();
  }

  function startCreate() {
    setSelectedCampania(null);
    setForm({ fechaInicio: '', fechaFin: '', observaciones: '', combinaciones: [] });
    setComboForm(emptyCombo);
    setLoteSelectorSortMode('all');
    setError('');
    setView('create');
  }

  async function openCampania(campaniaId, nextView) {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/campanias/${campaniaId}`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await response.text());
      const campania = await response.json();
      setSelectedCampania(campania);
      setForm({
        fechaInicio: toDateInput(campania.fechaInicio),
        fechaFin: toDateInput(campania.fechaFin),
        observaciones: campania.observaciones || '',
        combinaciones: campania.combinaciones.map((item) => ({
          tempId: item.campaniaCombinacionId,
          loteId: item.loteId,
          loteNombre: item.loteNombre,
          loteZona: item.loteZona,
          loteHectareas: item.loteHectareas,
          cultivoAntecesor: item.cultivoAntecesor,
          producto: item.producto,
          fechaInicio: toDateInput(item.fechaInicio),
          fechaFin: toDateInput(item.fechaFin),
          estado: item.estado,
          etapaActual: item.etapaActual
        }))
      });
      setComboForm(emptyCombo);
      setView(nextView);
    } catch (err) {
      setError(`No se pudo abrir la campania: ${err.message}`);
    }
  }

  function updateGrain(value) {
    setComboForm({ grainMode: value, producto: value === 'Otro' ? '' : value });
  }

  function updateCustomGrain(value) {
    setComboForm((current) => ({ ...current, producto: value.slice(0, 10) }));
  }

  function openLoteSelector() {
    setError('');
    if (!form.fechaInicio || !form.fechaFin) {
      setError('Completa Fecha de Inicio y Fecha tentativa de Fin antes de elegir lotes.');
      return;
    }
    if (form.fechaFin < form.fechaInicio) {
      setError('La Fecha tentativa de Fin no puede ser anterior a la Fecha de Inicio.');
      return;
    }
    if (!isWithinCampaignDateLimits(form.fechaInicio) || !isWithinCampaignDateLimits(form.fechaFin)) {
      setError(getCampaignDateLimits().label);
      return;
    }
    if (!comboForm.producto.trim()) {
      setError('Selecciona un grano antes de elegir lotes.');
      return;
    }
    setSelectorOpen(true);
  }

  function addSelectedLotes(selectedLotes) {
    const existingKeys = new Set(form.combinaciones.map((item) => `${item.loteId}-${normalizeSearchText(item.producto)}`));
    const producto = comboForm.producto.trim();
    const newItems = selectedLotes
      .filter((lote) => !existingKeys.has(`${lote.loteId}-${normalizeSearchText(producto)}`))
      .map((lote) => ({
        tempId: `tmp-${lote.loteId}-${Date.now()}`,
        loteId: Number(lote.loteId),
        loteNombre: lote.nombre,
        loteZona: lote.ciudad,
        loteHectareas: lote.hectareas,
        cultivoAntecesor: getLatestCultivoFromHistory(lote),
        producto,
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin,
        estado: 'Pendiente',
        etapaActual: 'Sin etapa'
      }));

    setForm((current) => ({ ...current, combinaciones: [...current.combinaciones, ...newItems] }));
    setSelectorOpen(false);
  }

  function removeCombo(tempId) {
    setForm((current) => ({
      ...current,
      combinaciones: current.combinaciones.filter((item) => item.tempId !== tempId)
    }));
  }

  function getMissingEnabledLots() {
    const assignedLoteIds = new Set(form.combinaciones.map((item) => Number(item.loteId)));
    return lotes.filter((lote) => lote.activo && !assignedLoteIds.has(Number(lote.loteId)));
  }

  async function handleSave({ force = false } = {}) {
    if (!force) {
      const missing = getMissingEnabledLots();
      if (missing.length > 0) {
        setMissingLots(missing);
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      const body = {
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin,
        observaciones: form.observaciones || null,
        combinaciones: form.combinaciones.map((item) => ({
          loteId: Number(item.loteId),
          producto: item.producto,
          fechaInicio: form.fechaInicio,
          fechaFin: form.fechaFin
        }))
      };

      const url = selectedCampania
        ? `${API_BASE_URL}/api/campanias/${selectedCampania.campaniaId}`
        : `${API_BASE_URL}/api/campanias`;
      const response = await fetch(url, {
        method: selectedCampania ? 'PUT' : 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(await response.text());
      await onLotesChanged?.();
      await onCampaniasChanged?.();
      goToList();
    } catch (err) {
      const message = err.message.replace(/^"|"$/g, '');
      try {
        const parsed = JSON.parse(message);
        if (parsed.codigo === 'CampaniaPeriodoDuplicado') {
          setPeriodConflict(parsed.mensaje);
          return;
        }
      } catch {
        // Mantiene el flujo existente para errores no estructurados.
      }
      setError(`No se pudo guardar la campania: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  async function disableMissingLotsAndSave() {
    setSaving(true);
    setError('');
    try {
      await Promise.all(missingLots.map(async (lote) => {
        const response = await fetch(`${API_BASE_URL}/api/lotes/${lote.loteId}/deshabilitar`, {
          method: 'POST',
          headers: authHeaders()
        });
        if (!response.ok) throw new Error(await response.text());
      }));
      await onLotesChanged?.();
      setMissingLots([]);
      await handleSave({ force: true });
    } catch (err) {
      setError(`No se pudieron deshabilitar los lotes pendientes: ${err.message}`);
      setSaving(false);
    }
  }

  if (view === 'create' || view === 'edit') {
    return (
      <>
        <CampaniaForm
          mode={view}
          campania={selectedCampania}
          form={form}
          comboForm={comboForm}
          saving={saving}
          error={error}
          onFormChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
          onGrainChange={updateGrain}
          onCustomGrainChange={updateCustomGrain}
          onOpenLoteSelector={openLoteSelector}
          onRemoveCombo={removeCombo}
          onSave={handleSave}
          onBack={goToList}
        />
        {selectorOpen && (
          <LoteSelectorModal
            lotes={lotes}
            producto={comboForm.producto}
            excludedLoteIds={form.combinaciones.map((item) => Number(item.loteId))}
            sortMode={loteSelectorSortMode}
            onSortModeChange={setLoteSelectorSortMode}
            onClose={() => setSelectorOpen(false)}
            onAdd={addSelectedLotes}
          />
        )}
        {missingLots.length > 0 && (
          <MissingLotsModal
            lots={missingLots}
            saving={saving}
            onContinueLoading={() => setMissingLots([])}
            onDisableAndSave={disableMissingLotsAndSave}
          />
        )}
        {periodConflict && (
          <CampaignPeriodConflictModal
            message={periodConflict}
            onClose={() => setPeriodConflict('')}
          />
        )}
      </>
    );
  }

  if (view === 'detail') {
    return (
      <CampaniaDetalle
        campania={selectedCampania}
        onBack={goToList}
        onEdit={() => openCampania(selectedCampania.campaniaId, 'edit')}
        onRegisterSiembra={onRegisterSiembra}
      />
    );
  }

  return (
    <CampaniasList
      campanias={campanias}
      selectedEmpresaId={selectedEmpresaId}
      loading={loading}
      error={error}
      parentFilters={parentFilters}
      onAdd={startCreate}
      onEdit={(campaniaId) => openCampania(campaniaId, 'edit')}
      onView={(campaniaId) => openCampania(campaniaId, 'detail')}
      onRegisterSiembra={onRegisterSiembra}
    />
  );
}

function CampaniasList({ campanias, selectedEmpresaId, loading, error, parentFilters, onAdd, onEdit, onView, onRegisterSiembra }) {
  const [query, setQuery] = useState('');
  const [productoFilter, setProductoFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [selected, setSelected] = useState({});
  const [activeCampaniaId, setActiveCampaniaId] = useState(null);

  const campaniasPorEmpresa = useMemo(() => (
    selectedEmpresaId
      ? campanias.filter((item) => String(item.empresaId) === String(selectedEmpresaId))
      : campanias
  ), [campanias, selectedEmpresaId]);

  const resumenes = useMemo(() => {
    const groups = new Map();

    campaniasPorEmpresa.forEach((item) => {
      if (!groups.has(item.campaniaId)) {
        groups.set(item.campaniaId, {
          campaniaId: item.campaniaId,
          campaniaNombre: item.campaniaNombre,
          empresaNombre: item.empresaNombre || '-',
          periodo: item.periodo || '-',
          fechaInicio: item.fechaInicio,
          fechaFin: item.fechaFin,
          combinaciones: []
        });
      }
      groups.get(item.campaniaId).combinaciones.push(item);
    });

    return [...groups.values()].map((campania) => {
      const cultivos = [...new Set(campania.combinaciones.map((item) => item.producto).filter(Boolean))];
      const estados = campania.combinaciones.map((item) => item.estado || 'Pendiente');
      const estado = estados.every((value) => value === 'Finalizado')
        ? 'Finalizado'
        : estados.every((value) => value === 'Pendiente')
          ? 'Pendiente'
          : 'En curso';

      return {
        ...campania,
        cultivos,
        lotes: new Set(campania.combinaciones.map((item) => item.loteId)).size,
        hectareas: campania.combinaciones.reduce((sum, item) => sum + Number(item.loteHectareas || 0), 0),
        pendientes: estados.filter((value) => value === 'Pendiente').length,
        estado
      };
    }).sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)));
  }, [campaniasPorEmpresa]);

  const productoOptions = useMemo(() => [...new Set(campaniasPorEmpresa.map((c) => c.producto).filter(Boolean))], [campaniasPorEmpresa]);
  const filteredResumenes = useMemo(() => resumenes.filter((item) => {
    const text = normalizeSearchText(query.trim());
    const searchFields = [item.campaniaNombre, item.periodo, item.empresaNombre, ...item.cultivos];
    const matchesQuery = !text || searchFields.some((field) => normalizeSearchText(field).includes(text));
    const matchesProducto = !productoFilter || item.cultivos.includes(productoFilter);
    const matchesEstado = !estadoFilter || item.estado === estadoFilter;
    return matchesQuery && matchesProducto && matchesEstado;
  }), [resumenes, query, productoFilter, estadoFilter]);

  const activeCampania = resumenes.find((item) => String(item.campaniaId) === String(activeCampaniaId));
  const filteredCombinaciones = useMemo(() => {
    if (!activeCampania) return [];
    const text = normalizeSearchText(query.trim());
    return activeCampania.combinaciones.filter((item) => {
      const searchFields = [item.producto, item.loteNombre, item.estado, item.etapaActual];
      const matchesQuery = !text || searchFields.some((field) => normalizeSearchText(field).includes(text));
      const matchesProducto = !productoFilter || item.producto === productoFilter;
      const matchesEstado = !estadoFilter || item.estado === estadoFilter;
      return matchesQuery && matchesProducto && matchesEstado;
    });
  }, [activeCampania, query, productoFilter, estadoFilter]);

  const metricRows = activeCampania ? filteredCombinaciones : filteredResumenes.flatMap((item) => item.combinaciones);
  const totalCampanias = activeCampania ? 1 : filteredResumenes.length;
  const totalCombinaciones = metricRows.length;
  const totalHectareas = metricRows.reduce((sum, item) => sum + Number(item.loteHectareas || 0), 0);
  const pendientes = metricRows.filter((item) => (item.estado || 'Pendiente') === 'Pendiente').length;
  const hayFilasSeleccionadas = Object.values(selected).some(Boolean);

  function clearFilters() {
    setQuery('');
    setProductoFilter('');
    setEstadoFilter('');
  }
  const hayFiltrosTabla = Boolean(query.trim() || productoFilter || estadoFilter);

  function openCampaniaTable(campaniaId) {
    setActiveCampaniaId(campaniaId);
    setSelected({});
    clearFilters();
  }

  function closeCampaniaTable() {
    setActiveCampaniaId(null);
    setSelected({});
    clearFilters();
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>{activeCampania ? activeCampania.periodo : 'Campañas'}</h1>
          <p>{activeCampania ? `Lotes y cultivos planificados para ${activeCampania.empresaNombre}.` : 'Consulta cada campaña y accede al detalle de sus lotes y cultivos.'}</p>
        </div>
        {activeCampania ? (
          <button className="back-button campaign-back-button" type="button" onClick={closeCampaniaTable}>
            <ArrowLeft size={18} />
            <span>Volver a campañas</span>
          </button>
        ) : (
          <button className="green-button add-lote-button" type="button" onClick={onAdd}>
            <PlusCircle size={18} />
            <span>Registrar Campaña</span>
          </button>
        )}
      </div>
      {parentFilters}

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="summary-grid summary-grid-four">
        <article className="summary-card">
          <div className="summary-icon"><CalendarDays size={28} /></div>
          <div><span>Campañas</span><strong>{totalCampanias}</strong></div>
          <p>Segun los filtros aplicados</p>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><BarChart3 size={28} /></div>
          <div><span>Combinaciones</span><strong>{totalCombinaciones}</strong></div>
          <p>Lote + grano registrados</p>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><Sprout size={28} /></div>
          <div><span>Pendientes</span><strong>{pendientes}</strong></div>
          <p>Lotes listos para iniciar siembra</p>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><CheckCircle2 size={28} /></div>
          <div><span>Hectareas planificadas</span><strong>{formatNumber(totalHectareas, ' ha')}</strong></div>
          <p>Superficie segun lotes cargados</p>
        </article>
      </div>

      <div className="filters-card campaign-list-filters">
        <label className="search-field">
          <Search size={21} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={activeCampania ? 'Buscar por lote, grano o etapa...' : 'Buscar por campaña, periodo, empresa o cultivo...'} />
        </label>
        <select value={productoFilter} onChange={(event) => setProductoFilter(event.target.value)}>
          <option value="">Grano</option>
          {productoOptions.map((producto) => <option key={producto} value={producto}>{producto}</option>)}
        </select>
        <select value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)}>
          <option value="">Estado</option>
          <option value="Pendiente">Pendiente</option>
          <option value="En curso">En curso</option>
          <option value="Finalizado">Finalizado</option>
        </select>
        <button className="clear-button" type="button" onClick={clearFilters}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
      </div>

      {loading ? (
        <div className="table-shell dashboard-card"><div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Cargando campañas...</span></div></div>
      ) : campanias.length === 0 ? (
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><CalendarDays size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Aun no tenes campañas registradas</h2>
            <p>Registra tu primera campaña para agrupar lotes, granos y procesos.</p>
          </div>
          <button className="green-button empty-state-action" type="button" onClick={onAdd}>
            <PlusCircle size={18} />
            <span>Registrar Campaña</span>
          </button>
        </section>
      ) : (activeCampania ? filteredCombinaciones.length : filteredResumenes.length) === 0 ? (
        <section className="empty-state dashboard-card empty-state-compact">
          <div className="empty-state-icon"><Search size={82} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>{hayFiltrosTabla ? `No encontramos ${activeCampania ? 'lotes' : 'campañas'} con esos filtros` : 'No hay campañas para la empresa seleccionada'}</h2>
            <p>{hayFiltrosTabla ? 'Limpia los filtros para volver a ver los registros disponibles.' : 'Cambia la empresa o registra una campaña para este periodo.'}</p>
          </div>
          {hayFiltrosTabla && (
            <button className="green-button empty-state-action" type="button" onClick={clearFilters}>
              <RotateCcw size={18} />
              <span>Limpiar filtros</span>
            </button>
          )}
        </section>
      ) : activeCampania ? (
        <div className="table-shell dashboard-card">
          <table className="lotes-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Grano</th>
                <th>Lote</th>
                <th>Fecha de Inicio</th>
                <th>Fecha tentativa de Fin</th>
                <th>Hectareas</th>
                <th>Estado</th>
                <th>Etapa actual</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredCombinaciones.map((item) => (
                <tr key={item.campaniaCombinacionId}>
                  <td><input type="checkbox" checked={Boolean(selected[item.campaniaCombinacionId])} onChange={() => setSelected((current) => ({ ...current, [item.campaniaCombinacionId]: !current[item.campaniaCombinacionId] }))} /></td>
                  <td>{item.producto}</td>
                  <td>{item.loteNombre}</td>
                  <td>{formatFecha(item.fechaInicio)}</td>
                  <td>{formatFecha(item.fechaFin)}</td>
                  <td>{formatNumber(item.loteHectareas, ' ha')}</td>
                  <td><CampaniaEstadoChip estado={item.estado} /></td>
                  <td><CampaniaEtapaChip etapa={item.etapaActual} /></td>
                  <td className="compact-actions-cell">
                    <div className="actions-cell actions-cell-center">
                      <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar ${item.campaniaNombre}`} onClick={() => onEdit(item.campaniaId)}><Edit size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label={`Ver ${item.campaniaNombre}`} onClick={() => onView(item.campaniaId)}><Eye size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Registrar siembra" type="button" aria-label="Registrar siembra" onClick={() => onRegisterSiembra?.(item.campaniaId)}><Sprout size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Registrar cosecha" type="button" aria-label="Registrar cosecha" disabled={item.estado === 'Pendiente'} onClick={() => alert('La accion quedo preparada para conectar con Registrar Cosecha.')}><Scale size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Almacenamiento" type="button" aria-label="Registrar almacenamiento" disabled={item.estado === 'Pendiente'}><Package size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Distribucion" type="button" aria-label="Registrar distribucion" disabled={item.estado === 'Pendiente'}><Truck size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hayFilasSeleccionadas && (
            <div className="form-actions" style={{ justifyContent: 'flex-end', padding: '12px 16px' }}>
              <button className="green-button" type="button">Exportar Registros</button>
            </div>
          )}
        </div>
      ) : (
        <div className="table-shell dashboard-card campaign-master-table">
          <table className="lotes-table">
            <thead>
              <tr>
                <th>Campaña</th>
                <th>Empresa</th>
                <th>Fecha de Inicio</th>
                <th>Fecha tentativa de Fin</th>
                <th>Lotes</th>
                <th>Cultivos</th>
                <th>Hectareas</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredResumenes.map((item) => (
                <tr key={item.campaniaId}>
                  <td>
                    <strong className="campaign-master-name">{item.periodo}</strong>
                    <span className="campaign-master-code">{item.campaniaNombre}</span>
                  </td>
                  <td>{item.empresaNombre}</td>
                  <td>{formatFecha(item.fechaInicio)}</td>
                  <td>{formatFecha(item.fechaFin)}</td>
                  <td><strong>{item.lotes}</strong></td>
                  <td>
                    <div className="campaign-crop-list">
                      {item.cultivos.map((cultivo) => <span key={cultivo} className="antecesor-chip">{cultivo}</span>)}
                    </div>
                  </td>
                  <td>{formatNumber(item.hectareas, ' ha')}</td>
                  <td><CampaniaEstadoChip estado={item.estado} /></td>
                  <td className="compact-actions-cell">
                    <div className="actions-cell actions-cell-center">
                      <button className="table-action-tooltip" data-tooltip="Ver lotes y cultivos" type="button" aria-label={`Ver lotes y cultivos de ${item.campaniaNombre}`} onClick={() => openCampaniaTable(item.campaniaId)}><Eye size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Editar campaña" type="button" aria-label={`Editar ${item.campaniaNombre}`} onClick={() => onEdit(item.campaniaId)}><Edit size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Ver ficha" type="button" aria-label={`Ver ficha de ${item.campaniaNombre}`} onClick={() => onView(item.campaniaId)}><CalendarDays size={18} /></button>
                    </div>
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

function CampaniaForm({ mode, campania, form, comboForm, saving, error, onFormChange, onGrainChange, onCustomGrainChange, onOpenLoteSelector, onRemoveCombo, onSave, onBack }) {
  const readonlyName = mode === 'edit' ? campania?.nombre : '';
  const selectedGrainMode = comboForm.grainMode || (commonGrains.includes(comboForm.producto) ? comboForm.producto : comboForm.producto ? 'Otro' : '');
  const campaignDateLimits = getCampaignDateLimits();
  const inicioOutsideRange = Boolean(form.fechaInicio && !isWithinCampaignDateLimits(form.fechaInicio));
  const finOutsideRange = Boolean(form.fechaFin && !isWithinCampaignDateLimits(form.fechaFin));
  const finBeforeInicio = Boolean(form.fechaInicio && form.fechaFin && form.fechaFin < form.fechaInicio);
  const canRegister = Boolean(
    form.fechaInicio
    && form.fechaFin
    && !inicioOutsideRange
    && !finOutsideRange
    && !finBeforeInicio
    && form.combinaciones.length > 0
  );

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{mode === 'edit' ? 'Editar Campaña' : 'Registrar Campaña'}</h1>
          <p>{mode === 'edit' ? campania?.nombre : 'El nombre se asigna automaticamente al guardar.'}</p>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">
            Nombre
            <input readOnly value={readonlyName} placeholder="Se asigna automaticamente al guardar" />
          </label>
          <label className={`field${inicioOutsideRange ? ' field-with-error' : ''}`}>
            Fecha de Inicio <b>*</b>
            <input type="date" min={campaignDateLimits.min} max={campaignDateLimits.max} value={form.fechaInicio} onChange={(event) => onFormChange('fechaInicio', event.target.value)} required />
            {inicioOutsideRange && <small className="field-error">{campaignDateLimits.label}</small>}
          </label>
          <label className={`field${finOutsideRange || finBeforeInicio ? ' field-with-error' : ''}`}>
            Fecha tentativa de Fin <b>*</b>
            <input type="date" min={campaignDateLimits.min} max={campaignDateLimits.max} value={form.fechaFin} onChange={(event) => onFormChange('fechaFin', event.target.value)} required />
            {finOutsideRange && <small className="field-error">{campaignDateLimits.label}</small>}
            {finBeforeInicio && <small className="field-error">La Fecha tentativa de Fin no puede ser anterior a la Fecha de Inicio.</small>}
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Observaciones
            <textarea value={form.observaciones} onChange={(event) => onFormChange('observaciones', event.target.value)} placeholder="Notas generales de planificacion de la campaña." />
          </label>
        </div>
      </div>

      <h2>Armar combinaciones por grano</h2>
      <div className="create-form-card dashboard-card">
        <div className="campaign-grain-builder">
          <label className="field">
            Grano <b>*</b>
            <select value={selectedGrainMode} onChange={(event) => onGrainChange(event.target.value)}>
              <option value="">Seleccionar</option>
              {commonGrains.map((grain) => <option key={grain} value={grain}>{grain}</option>)}
            </select>
          </label>
          {selectedGrainMode === 'Otro' && (
            <label className="field">
              Otro grano <b>*</b>
              <input maxLength={10} value={comboForm.producto} onChange={(event) => onCustomGrainChange(event.target.value)} placeholder="Max. 10 caracteres" />
            </label>
          )}
          <button className="green-button campaign-select-lotes-button" type="button" onClick={onOpenLoteSelector}>
            <Leaf size={18} />
            <span>Elegir lotes por rotacion</span>
          </button>
        </div>
      </div>

      <CombinacionesTable combinaciones={form.combinaciones} editable onRemove={onRemoveCombo} />

      <div className="form-actions">
        <button className="green-button" type="button" disabled={saving || !canRegister} onClick={onSave}>
          <Save size={17} />
          {saving ? 'Guardando...' : mode === 'edit' ? 'Guardar cambios' : 'Registrar'}
        </button>
        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
      </div>
    </section>
  );
}

function LoteSelectorModal({ lotes, producto, excludedLoteIds = [], sortMode, onSortModeChange, onClose, onAdd }) {
  const [selected, setSelected] = useState({});
  const [query, setQuery] = useState('');
  const excludedSet = useMemo(() => new Set(excludedLoteIds.map(Number)), [excludedLoteIds]);
  const availableLotes = useMemo(() => (
    lotes.filter((lote) => lote.activo && !excludedSet.has(Number(lote.loteId))).sort((a, b) => {
      if (sortMode === 'all') return String(a.nombre).localeCompare(String(b.nombre), 'es');
      const rotationA = getRotationInfo(producto, getLatestCultivoFromHistory(a));
      const rotationB = getRotationInfo(producto, getLatestCultivoFromHistory(b));
      if (rotationA.rank !== rotationB.rank) return rotationA.rank - rotationB.rank;
      return String(a.nombre).localeCompare(String(b.nombre), 'es');
    })
  ), [excludedSet, lotes, producto, sortMode]);

  const filteredLotes = useMemo(() => {
    const text = normalizeSearchText(query.trim());
    if (!text) return availableLotes;

    return availableLotes.filter((lote) => {
      const cultivoAntecesor = getLatestCultivoFromHistory(lote);
      const rotation = getRotationInfo(producto, cultivoAntecesor);
      return [
        lote.nombre,
        lote.ciudad,
        lote.hectareas,
        cultivoAntecesor,
        rotation.label
      ].some((field) => normalizeSearchText(field).includes(text));
    });
  }, [availableLotes, producto, query]);
  const groupedLotes = useMemo(() => {
    const groups = [];
    const byCultivo = new Map();

    filteredLotes.forEach((lote) => {
      const cultivoAntecesor = getLatestCultivoFromHistory(lote) || 'Sin dato';
      const key = normalizeSearchText(cultivoAntecesor);
      if (!byCultivo.has(key)) {
        const group = { key, cultivoAntecesor, lotes: [] };
        byCultivo.set(key, group);
        groups.push(group);
      }
      byCultivo.get(key).lotes.push(lote);
    });

    return groups.map((group) => ({
      ...group,
      hectareas: group.lotes.reduce((sum, lote) => sum + Number(lote.hectareas || 0), 0),
      allSelected: group.lotes.every((lote) => selected[lote.loteId])
    }));
  }, [filteredLotes, selected]);

  const selectedLotes = availableLotes.filter((lote) => selected[lote.loteId]);
  const totalHectareas = selectedLotes.reduce((sum, lote) => sum + Number(lote.hectareas || 0), 0);

  function toggleLote(loteId) {
    setSelected((current) => ({ ...current, [loteId]: !current[loteId] }));
  }

  function toggleCultivoGroup(group) {
    setSelected((current) => {
      const next = { ...current };
      group.lotes.forEach((lote) => {
        next[lote.loteId] = !group.allSelected;
      });
      return next;
    });
  }

  function renderLoteRow(lote) {
    const cultivoAntecesor = getLatestCultivoFromHistory(lote);
    const rotation = getRotationInfo(producto, cultivoAntecesor);
    return (
      <tr key={lote.loteId} className={selected[lote.loteId] ? 'campaign-lote-row-selected' : ''}>
        <td><input className="campaign-lote-checkbox" type="checkbox" checked={Boolean(selected[lote.loteId])} onChange={() => toggleLote(lote.loteId)} /></td>
        <td><strong>{lote.nombre}</strong></td>
        <td><span className="antecesor-chip">{cultivoAntecesor || 'Sin dato'}</span></td>
        <td><span className={`rotation-chip rotation-chip-${rotation.tone}`}>{rotation.label}</span></td>
        <td>{lote.ciudad || '-'}</td>
        <td>{formatNumber(lote.hectareas, ' ha')}</td>
      </tr>
    );
  }

  return (
    <div className="modal-backdrop">
      <section className="campaign-lote-modal dashboard-card">
        <div className="modal-heading">
          <div>
            <h2>Seleccionar lotes para {producto}</h2>
            <p>{sortMode === 'recommended' ? 'Ordenados por rotaciones favorables segun el ultimo cultivo registrado.' : 'Todos los lotes habilitados, ordenados alfabéticamente.'}</p>
          </div>
          <button className="icon-button table-action-tooltip" data-tooltip="Cerrar" type="button" onClick={onClose} aria-label="Cerrar selector de lotes">
            <X size={18} />
          </button>
        </div>

        <div className="campaign-lote-summary">
          <span>{selectedLotes.length} lotes seleccionados</span>
          <strong>{formatNumber(totalHectareas, ' ha')}</strong>
        </div>

        <div className="campaign-lote-controls">
          <label className="search-field campaign-lote-search">
            <Search size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              data-text-case="preserve"
              placeholder="Buscar por lote, zona, cultivo antecesor o rotacion..."
            />
          </label>
          <label className="campaign-lote-sort">
            <span>Ordenar lotes</span>
            <select value={sortMode} onChange={(event) => onSortModeChange(event.target.value)}>
              <option value="all">Todo</option>
              <option value="recommended">Rotaciones recomendadas</option>
            </select>
          </label>
        </div>

        <div className="table-shell table-shell-inner campaign-lote-selector-table">
          <table className="lotes-table">
            <thead>
              <tr>
                <th />
                <th>Alias del lote</th>
                <th>Cultivo antecesor</th>
                <th>Rotacion</th>
                <th>Zona</th>
                <th>Hectareas</th>
              </tr>
            </thead>
            <tbody>
              {sortMode === 'recommended' && groupedLotes.map((group) => (
                <Fragment key={group.key}>
                  <tr className="campaign-lote-group-row">
                    <td colSpan={6}>
                      <div className="campaign-lote-group-heading">
                        <div>
                          <span>Cultivo antecesor</span>
                          <strong>{group.cultivoAntecesor}</strong>
                        </div>
                        <small>{group.lotes.length} lotes · {formatNumber(group.hectareas, ' ha')}</small>
                        <button type="button" className="group-select-button" onClick={() => toggleCultivoGroup(group)}>
                          {group.allSelected ? 'Quitar seleccion' : `Seleccionar ${group.cultivoAntecesor}`}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {group.lotes.map(renderLoteRow)}
                </Fragment>
              ))}
              {sortMode === 'all' && filteredLotes.map(renderLoteRow)}
              {availableLotes.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center' }}>No hay lotes disponibles para seleccionar.</td></tr>
              )}
              {availableLotes.length > 0 && filteredLotes.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center' }}>No encontramos lotes con ese filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="form-actions modal-actions">
          <button className="green-button" type="button" disabled={selectedLotes.length === 0} onClick={() => onAdd(selectedLotes)}>
            <PlusCircle size={17} />
            <span>Agregar seleccion</span>
          </button>
          <button className="back-button" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </section>
    </div>
  );
}

function MissingLotsModal({ lots, saving, onContinueLoading, onDisableAndSave }) {
  const totalHectareas = lots.reduce((sum, lote) => sum + Number(lote.hectareas || 0), 0);

  return (
    <div className="modal-backdrop">
      <section className="campaign-lote-modal campaign-missing-modal dashboard-card">
        <div className="modal-heading">
          <div>
            <h2>Lotes habilitados sin grano asociado</h2>
            <p>Todos los lotes habilitados deben quedar dentro de la campaña antes de guardar.</p>
          </div>
        </div>

        <div className="campaign-lote-summary campaign-missing-summary">
          <span>{lots.length} lotes pendientes de asociar</span>
          <strong>{formatNumber(totalHectareas, ' ha')}</strong>
        </div>

        <div className="missing-lots-list">
          {lots.map((lote) => (
            <article key={lote.loteId} className="missing-lot-item">
              <div>
                <strong>{lote.nombre}</strong>
                <span>{lote.ciudad || 'Sin zona'} · {formatNumber(lote.hectareas, ' ha')}</span>
              </div>
              <span className="antecesor-chip">{getLatestCultivoFromHistory(lote) || 'Sin dato'}</span>
            </article>
          ))}
        </div>

        <div className="form-actions modal-actions">
          <button className="green-button" type="button" disabled={saving} onClick={onContinueLoading}>
            <PlusCircle size={17} />
            <span>Seguir cargando</span>
          </button>
          <button className="danger-soft-button campaign-disable-save-button" type="button" disabled={saving} onClick={onDisableAndSave}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}
            <span>Deshabilitar y guardar</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function CampaignPeriodConflictModal({ message, onClose }) {
  return (
    <div className="modal-backdrop">
      <section className="campaign-lote-modal campaign-period-modal dashboard-card" role="dialog" aria-modal="true" aria-labelledby="campaign-period-conflict-title">
        <div className="modal-heading">
          <div>
            <h2 id="campaign-period-conflict-title">Ya existe una campaña para este periodo</h2>
            <p>AgroDigital permite una sola campaña por empresa dentro de cada ciclo junio-junio.</p>
          </div>
          <span className="campaign-period-icon"><AlertTriangle size={22} /></span>
        </div>

        <div className="campaign-period-message">
          <strong>Regla de carga</strong>
          <span>{message}</span>
        </div>

        <div className="form-actions modal-actions">
          <button className="green-button" type="button" onClick={onClose}>
            <CheckCircle2 size={17} />
            <span>Entendido</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function CampaniaDetalle({ campania, onBack, onEdit, onRegisterSiembra }) {
  if (!campania) return null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Detalle Campaña</h1>
          <p>{campania.nombre}</p>
        </div>
      </div>

      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">Nombre<input readOnly value={campania.nombre} /></label>
          <label className="field">Fecha de Inicio<input readOnly value={formatFecha(campania.fechaInicio)} /></label>
          <label className="field">Fecha tentativa de Fin<input readOnly value={formatFecha(campania.fechaFin)} /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>Observaciones<textarea readOnly value={campania.observaciones || '-'} /></label>
        </div>
      </div>

      <h2>Combinaciones de campaña</h2>
      <CombinacionesTable
        combinaciones={campania.combinaciones}
        showOperationalActions
        onEdit={onEdit}
        onRegisterSiembra={onRegisterSiembra}
      />

      <div className="form-actions">
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
      </div>
    </section>
  );
}

function CombinacionesTable({ combinaciones, editable = false, showOperationalActions = false, showAntecesor = editable, onRemove, onEdit, onRegisterSiembra }) {
  const columnCount = 8 + (showAntecesor ? 1 : 0) + (editable || showOperationalActions ? 1 : 0);

  return (
    <div className="table-shell dashboard-card">
      <table className="lotes-table">
        <thead>
          <tr>
            <th>Lote</th>
            <th>Grano</th>
            {showAntecesor && <th>Antecesor</th>}
            <th>Zona</th>
            <th>Fecha de Inicio</th>
            <th>Fecha tentativa de Fin</th>
            <th>Hectareas</th>
            <th>Estado</th>
            <th>Etapa</th>
            {(editable || showOperationalActions) && <th style={{ textAlign: 'center' }}>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {combinaciones.map((item) => (
            <tr key={item.tempId ?? item.campaniaCombinacionId}>
              <td>{item.loteNombre}</td>
              <td><span className="antecesor-chip">{item.producto || '-'}</span></td>
              {showAntecesor && <td><span className="antecesor-chip">{item.cultivoAntecesor || '-'}</span></td>}
              <td>{item.loteZona || '-'}</td>
              <td>{formatFecha(item.fechaInicio)}</td>
              <td>{formatFecha(item.fechaFin)}</td>
              <td>{formatNumber(item.loteHectareas, ' ha')}</td>
              <td><CampaniaEstadoChip estado={item.estado || 'Pendiente'} /></td>
              <td><CampaniaEtapaChip etapa={item.etapaActual || 'Sin etapa'} /></td>
              {editable && (
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar combinacion" onClick={() => onRemove(item.tempId)}><Trash2 size={18} /></button>
                </td>
              )}
              {showOperationalActions && (
                <td className="compact-actions-cell">
                  <div className="actions-cell actions-cell-center">
                    <button className="table-action-tooltip" data-tooltip="Editar campaña" type="button" aria-label="Editar campaña" onClick={onEdit}><Edit size={18} /></button>
                    <button className="table-action-tooltip" data-tooltip="Detalle de campaña" type="button" aria-label="Detalle de campaña" onClick={() => alert('Ya estas consultando el detalle de esta campaña.')}><Eye size={18} /></button>
                    <button className="table-action-tooltip" data-tooltip="Registrar siembra" type="button" aria-label={`Registrar siembra para ${item.loteNombre}`} onClick={() => onRegisterSiembra?.(item.campaniaId)}><Sprout size={18} /></button>
                    <button className="table-action-tooltip" data-tooltip="Registrar cosecha" type="button" aria-label="Registrar cosecha" disabled={item.estado === 'Pendiente'} onClick={() => alert('La accion quedo preparada para conectar con Registrar Cosecha.')}><Scale size={18} /></button>
                    <button className="table-action-tooltip" data-tooltip="Almacenamiento" type="button" aria-label="Registrar almacenamiento" disabled={item.estado === 'Pendiente'}><Package size={18} /></button>
                    <button className="table-action-tooltip" data-tooltip="Distribucion" type="button" aria-label="Registrar distribucion" disabled={item.estado === 'Pendiente'}><Truck size={18} /></button>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {combinaciones.length === 0 && (
            <tr><td colSpan={columnCount} style={{ textAlign: 'center' }}>Todavia no agregaste combinaciones.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CampaniaEstadoChip({ estado }) {
  const value = estado || 'Pendiente';
  const className = [
    'campania-status-chip',
    value === 'Pendiente' ? 'campania-status-pending' : '',
    value === 'En curso' ? 'campania-status-active' : '',
    value === 'Finalizado' ? 'campania-status-done' : ''
  ].filter(Boolean).join(' ');
  return <span className={className}>{value}</span>;
}

function CampaniaEtapaChip({ etapa }) {
  return <span className="campania-stage-chip">{etapa || 'Sin etapa'}</span>;
}
