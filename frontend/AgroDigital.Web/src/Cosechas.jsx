import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit,
  Eye,
  LoaderCircle,
  PlusCircle,
  RotateCcw,
  Save,
  Scale,
  Search,
  Trash2
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const DIAS_DESVIO_REQUIERE_JUSTIFICACION = 3;
const OPERATION_DATE_MIN = '2026-01-01';
const OPERATION_DATE_MAX = '2027-12-31';

let tempIdSeq = 0;
function nextTempId() {
  tempIdSeq += 1;
  return `tmp-${tempIdSeq}`;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatFecha(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es-AR');
}

function formatNumber(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  return `${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })}${suffix}`;
}

function formatDateInputLabel(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function toNumberOrNull(value) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}

function normalizeHectareas(value) {
  return value === null || value === undefined || value === '' ? '' : String(value);
}

function getEmptyCosechaForm() {
  return {
    siembraId: '',
    loteId: '',
    campaniaNombre: '',
    producto: '',
    empresa: '',
    fechaInicio: '',
    fechaFin: '',
    fechaFinReal: '',
    justificacionDesvioFin: '',
    cantidadGranoCosechado: '',
    cantidadHectareasTrabajadas: '',
    humedadGrano: '',
    impurezas: '',
    responsableACargo: '',
    rindeKgHa: ''
  };
}

function getEmptyTiradaForm() {
  return {
    fecha: new Date().toISOString().slice(0, 10),
    latitud: '',
    longitud: '',
    aroCabezal: '',
    aroCola1: '',
    aroCola2: '',
    aroCola3: '',
    pmg: '',
    ajustoMaquinaria: false,
    observaciones: ''
  };
}

export default function Cosechas({ session, lotes, parentFilters, selectedEmpresaName = '', selectedCampaniaName = '' }) {
  const [view, setView] = useState('list');
  const [cosechas, setCosechas] = useState([]);
  const [siembras, setSiembras] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [selectedCosecha, setSelectedCosecha] = useState(null);
  const [form, setForm] = useState(getEmptyCosechaForm);
  const [documentos, setDocumentos] = useState([]);
  const [tiradas, setTiradas] = useState([]);
  const [tiradaForm, setTiradaForm] = useState(getEmptyTiradaForm);
  const [editingTiradaId, setEditingTiradaId] = useState(null);
  const [pendingFinalizedTirada, setPendingFinalizedTirada] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tiradaSaving, setTiradaSaving] = useState(false);
  const [error, setError] = useState('');

  function authHeaders(extra = {}) {
    return session?.token ? { ...extra, Authorization: `Bearer ${session.token}` } : extra;
  }

  async function loadCosechas() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/cosechas`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      setCosechas(await response.json());
    } catch (err) {
      setError(`No se pudieron cargar las cosechas: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadReferenceData() {
    try {
      const [siembrasRes, usuariosRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/siembras`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/api/usuarios/resumen`, { headers: authHeaders() })
      ]);
      setSiembras(siembrasRes.ok ? await siembrasRes.json() : []);
      setUsuarios(usuariosRes.ok ? await usuariosRes.json() : []);
    } catch {
      setSiembras([]);
      setUsuarios([]);
    }
  }

  useEffect(() => {
    loadCosechas();
    loadReferenceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToList() {
    setView('list');
    setSelectedCosecha(null);
    setDocumentos([]);
    setTiradas([]);
    setEditingTiradaId(null);
    setPendingFinalizedTirada(null);
    setError('');
    loadCosechas();
  }

  function startCreate() {
    setSelectedCosecha(null);
    setForm(getEmptyCosechaForm());
    setDocumentos([]);
    setTiradas([]);
    setError('');
    setView('create');
  }

  async function loadDocumentos(cosechaId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/cosechas/${cosechaId}/documentos`, { headers: authHeaders() });
      setDocumentos(response.ok ? await response.json() : []);
    } catch (err) {
      setError(`No se pudo cargar la documentacion: ${err.message}`);
    }
  }

  async function loadTiradas(cosechaId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/cosechas/${cosechaId}/tirada-aros`, { headers: authHeaders() });
      setTiradas(response.ok ? await response.json() : []);
    } catch (err) {
      setError(`No se pudieron cargar los controles de Tirada de Aros: ${err.message}`);
    }
  }

  function llenarFormDesdeCosecha(cosecha) {
    const lote = lotes.find((item) => String(item.loteId) === String(cosecha.loteId));
    setForm({
      siembraId: cosecha.siembraId ?? '',
      loteId: cosecha.loteId,
      campaniaNombre: cosecha.campaniaNombre || '',
      producto: cosecha.producto || '',
      empresa: cosecha.empresa || '',
      fechaInicio: toDateInput(cosecha.fechaInicio),
      fechaFin: toDateInput(cosecha.fechaFin),
      fechaFinReal: toDateInput(cosecha.fechaFinReal),
      justificacionDesvioFin: cosecha.justificacionDesvioFin || '',
      cantidadGranoCosechado: cosecha.cantidadGranoCosechado ?? '',
      cantidadHectareasTrabajadas: normalizeHectareas(cosecha.cantidadHectareasTrabajadas ?? lote?.hectareas),
      humedadGrano: cosecha.humedadGrano ?? '',
      impurezas: cosecha.impurezas ?? '',
      responsableACargo: cosecha.responsableACargo || '',
      rindeKgHa: cosecha.rindeKgHa ?? ''
    });
  }

  async function openEdit(cosecha) {
    setSelectedCosecha(cosecha);
    llenarFormDesdeCosecha(cosecha);
    setTiradaForm(getEmptyTiradaForm());
    setEditingTiradaId(null);
    setError('');
    await Promise.all([loadDocumentos(cosecha.cosechaId), loadTiradas(cosecha.cosechaId)]);
    setView('edit');
  }

  async function openDetail(cosecha) {
    setSelectedCosecha(cosecha);
    setError('');
    await Promise.all([loadDocumentos(cosecha.cosechaId), loadTiradas(cosecha.cosechaId)]);
    setView('detail');
  }

  async function openFinalize(cosecha) {
    setSelectedCosecha(cosecha);
    llenarFormDesdeCosecha(cosecha);
    setTiradaForm(getEmptyTiradaForm());
    setEditingTiradaId(null);
    setError('');
    await Promise.all([loadDocumentos(cosecha.cosechaId), loadTiradas(cosecha.cosechaId)]);
    setView('finalize');
  }

  async function openTirada(cosecha, confirmed = false) {
    if (cosecha.estado === 'Finalizado' && !confirmed) {
      setPendingFinalizedTirada(cosecha);
      return;
    }

    setSelectedCosecha(cosecha);
    setTiradaForm(getEmptyTiradaForm());
    setEditingTiradaId(null);
    setPendingFinalizedTirada(null);
    setError('');
    await loadTiradas(cosecha.cosechaId);
    setView('tirada');
  }

  function updateField(field, value) {
    const nonNegativeFields = ['cantidadGranoCosechado', 'cantidadHectareasTrabajadas', 'humedadGrano', 'impurezas', 'rindeKgHa'];
    if (nonNegativeFields.includes(field) && Number(value) < 0) return;

    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === 'siembraId') {
        const siembra = siembras.find((item) => String(item.siembraId) === String(value));
        if (siembra) {
          const lote = lotes.find((item) => String(item.loteId) === String(siembra.loteId));
          next.loteId = siembra.loteId;
          next.campaniaNombre = siembra.campaniaNombre || '';
          next.producto = siembra.producto || '';
          next.empresa = siembra.empresa || '';
          next.cantidadHectareasTrabajadas = normalizeHectareas(siembra.cantidadHectareasTrabajadas ?? lote?.hectareas ?? next.cantidadHectareasTrabajadas);
        }
      }

      if (field === 'loteId') {
        const lote = lotes.find((item) => String(item.loteId) === String(value));
        next.cantidadHectareasTrabajadas = normalizeHectareas(lote?.hectareas ?? next.cantidadHectareasTrabajadas);
      }

      if (field === 'cantidadGranoCosechado' || field === 'cantidadHectareasTrabajadas') {
        const grano = Number(field === 'cantidadGranoCosechado' ? value : next.cantidadGranoCosechado);
        const hectareas = Number(field === 'cantidadHectareasTrabajadas' ? value : next.cantidadHectareasTrabajadas);
        if (grano > 0 && hectareas > 0) {
          next.rindeKgHa = (grano / hectareas).toFixed(2);
        }
      }

      return next;
    });
  }

  function updateTiradaField(field, value) {
    const numericFields = ['aroCabezal', 'aroCola1', 'aroCola2', 'aroCola3', 'pmg'];
    if (numericFields.includes(field) && Number(value) < 0) return;
    setTiradaForm((current) => ({ ...current, [field]: value }));
  }

  function buildBody() {
    return {
      siembraId: form.siembraId === '' ? null : Number(form.siembraId),
      loteId: Number(form.loteId),
      campaniaNombre: form.campaniaNombre || null,
      producto: form.producto,
      empresa: form.empresa || null,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      fechaFinReal: form.fechaFinReal || null,
      justificacionDesvioFin: form.justificacionDesvioFin || null,
      cantidadGranoCosechado: toNumberOrNull(form.cantidadGranoCosechado),
      cantidadHectareasTrabajadas: toNumberOrNull(form.cantidadHectareasTrabajadas),
      humedadGrano: toNumberOrNull(form.humedadGrano),
      impurezas: toNumberOrNull(form.impurezas),
      responsableACargo: form.responsableACargo || null,
      rindeKgHa: toNumberOrNull(form.rindeKgHa)
    };
  }

  function buildFinalizeBody() {
    return {
      fechaFinReal: form.fechaFinReal,
      justificacionDesvioFin: form.justificacionDesvioFin || null,
      cantidadGranoCosechado: Number(form.cantidadGranoCosechado),
      cantidadHectareasTrabajadas: Number(form.cantidadHectareasTrabajadas),
      humedadGrano: toNumberOrNull(form.humedadGrano),
      impurezas: toNumberOrNull(form.impurezas),
      responsableACargo: form.responsableACargo || null,
      rindeKgHa: toNumberOrNull(form.rindeKgHa)
    };
  }

  function buildTiradaBody() {
    return {
      fecha: tiradaForm.fecha,
      latitud: toNumberOrNull(tiradaForm.latitud),
      longitud: toNumberOrNull(tiradaForm.longitud),
      aroCabezal: Number(tiradaForm.aroCabezal || 0),
      aroCola1: Number(tiradaForm.aroCola1 || 0),
      aroCola2: Number(tiradaForm.aroCola2 || 0),
      aroCola3: Number(tiradaForm.aroCola3 || 0),
      pmg: Number(tiradaForm.pmg),
      fechaFinRealReferencia: form.fechaFinReal || selectedCosecha?.fechaFinReal || null,
      ajustoMaquinaria: Boolean(tiradaForm.ajustoMaquinaria),
      observaciones: tiradaForm.observaciones || null
    };
  }

  async function handleGuardar() {
    setSaving(true);
    setError('');
    try {
      if (selectedCosecha) {
        const response = await fetch(`${API_BASE_URL}/api/cosechas/${selectedCosecha.cosechaId}`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(buildBody())
        });
        if (!response.ok) throw new Error(`al guardar los cambios (status ${response.status}): ${await response.text()}`);
        goToList();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/cosechas`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(buildBody())
      });
      if (!response.ok) throw new Error(`al crear la cosecha (status ${response.status}): ${await response.text()}`);
      goToList();
    } catch (err) {
      setError(`No se pudo guardar la cosecha: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalizar() {
    setSaving(true);
    setError('');
    try {
      const fechaInicio = toDateInput(selectedCosecha.fechaInicio);
      if (form.fechaFinReal < fechaInicio) {
        throw new Error('La fecha real de finalizacion no puede ser anterior a la fecha de inicio.');
      }
      if (form.fechaFinReal < OPERATION_DATE_MIN || form.fechaFinReal > OPERATION_DATE_MAX) {
        throw new Error(`La fecha real de finalizacion debe estar entre ${formatDateInputLabel(OPERATION_DATE_MIN)} y ${formatDateInputLabel(OPERATION_DATE_MAX)}.`);
      }

      const response = await fetch(`${API_BASE_URL}/api/cosechas/${selectedCosecha.cosechaId}/finalizar`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(buildFinalizeBody())
      });
      if (!response.ok) throw new Error(`al finalizar la cosecha (status ${response.status}): ${await response.text()}`);
      goToList();
    } catch (err) {
      setError(`No se pudo finalizar la cosecha: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleGuardarTirada() {
    setTiradaSaving(true);
    setError('');
    try {
      const fechaControl = tiradaForm.fecha;
      const fechaInicio = toDateInput(form.fechaInicio || selectedCosecha.fechaInicio);
      const fechaFin = toDateInput(form.fechaFinReal || selectedCosecha.fechaFinReal || selectedCosecha.fechaFin);
      if (!fechaControl || fechaControl < fechaInicio || fechaControl > fechaFin) {
        throw new Error('La fecha del control debe estar dentro del rango de la cosecha.');
      }

      const url = editingTiradaId
        ? `${API_BASE_URL}/api/cosechas/${selectedCosecha.cosechaId}/tirada-aros/${editingTiradaId}`
        : `${API_BASE_URL}/api/cosechas/${selectedCosecha.cosechaId}/tirada-aros`;
      const response = await fetch(url, {
        method: editingTiradaId ? 'PUT' : 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(buildTiradaBody())
      });
      if (!response.ok) throw new Error(await response.text());
      await loadTiradas(selectedCosecha.cosechaId);
      setEditingTiradaId(null);
      setTiradaForm(getEmptyTiradaForm());
    } catch (err) {
      setError(`No se pudo guardar la Tirada de Aros: ${err.message}`);
    } finally {
      setTiradaSaving(false);
    }
  }

  async function handleEliminarTirada(tirada) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/cosechas/${selectedCosecha.cosechaId}/tirada-aros/${tirada.cosechaTiradaAroId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!response.ok) throw new Error(await response.text());
      await loadTiradas(selectedCosecha.cosechaId);
    } catch (err) {
      setError(`No se pudo eliminar la Tirada de Aros: ${err.message}`);
    }
  }

  function startEditTirada(tirada) {
    setEditingTiradaId(tirada.cosechaTiradaAroId);
    setTiradaForm({
      fecha: toDateInput(tirada.fecha),
      latitud: tirada.latitud ?? '',
      longitud: tirada.longitud ?? '',
      aroCabezal: tirada.aroCabezal ?? '',
      aroCola1: tirada.aroCola1 ?? '',
      aroCola2: tirada.aroCola2 ?? '',
      aroCola3: tirada.aroCola3 ?? '',
      pmg: tirada.pmg ?? '',
      ajustoMaquinaria: Boolean(tirada.ajustoMaquinaria),
      observaciones: tirada.observaciones || ''
    });
  }

  async function handleSubirDocumento(file) {
    if (!file || !selectedCosecha) return;

    try {
      const formData = new FormData();
      formData.append('archivo', file);
      const response = await fetch(`${API_BASE_URL}/api/cosechas/${selectedCosecha.cosechaId}/documentos`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });
      if (!response.ok) throw new Error(await response.text());
      await loadDocumentos(selectedCosecha.cosechaId);
    } catch (err) {
      setError(`No se pudo subir el archivo: ${err.message}`);
    }
  }

  async function handleEliminarDocumento(documento) {
    try {
      await fetch(`${API_BASE_URL}/api/cosechas/${selectedCosecha.cosechaId}/documentos/${documento.cosechaDocumentoId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      await loadDocumentos(selectedCosecha.cosechaId);
    } catch (err) {
      setError(`No se pudo eliminar el archivo: ${err.message}`);
    }
  }

  async function handleDescargarDocumento(documento) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/cosechas/${selectedCosecha.cosechaId}/documentos/${documento.cosechaDocumentoId}/descargar`,
        { headers: authHeaders() }
      );
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = documento.nombreArchivo;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(`No se pudo descargar el archivo: ${err.message}`);
    }
  }

  if (view === 'create' || view === 'edit') {
    return (
      <CosechaForm
        modoEdicion={view === 'edit'}
        nombre={selectedCosecha?.nombre}
        estado={selectedCosecha?.estado}
        lotes={lotes ?? []}
        siembras={siembras}
        usuarios={usuarios}
        form={form}
        documentos={documentos}
        tiradas={tiradas}
        tiradaForm={tiradaForm}
        editingTiradaId={editingTiradaId}
        saving={saving}
        tiradaSaving={tiradaSaving}
        error={error}
        onFieldChange={updateField}
        onTiradaFieldChange={updateTiradaField}
        onGuardar={handleGuardar}
        onGuardarTirada={handleGuardarTirada}
        onEditTirada={startEditTirada}
        onEliminarTirada={handleEliminarTirada}
        onSubirDocumento={handleSubirDocumento}
        onDescargarDocumento={handleDescargarDocumento}
        onEliminarDocumento={handleEliminarDocumento}
        onBack={goToList}
      />
    );
  }

  if (view === 'finalize') {
    return (
      <FinalizarCosecha
        cosecha={selectedCosecha}
        usuarios={usuarios}
        form={form}
        documentos={documentos}
        tiradas={tiradas}
        tiradaForm={tiradaForm}
        editingTiradaId={editingTiradaId}
        saving={saving}
        tiradaSaving={tiradaSaving}
        error={error}
        onFieldChange={updateField}
        onTiradaFieldChange={updateTiradaField}
        onFinalizar={handleFinalizar}
        onGuardarTirada={handleGuardarTirada}
        onEditTirada={startEditTirada}
        onEliminarTirada={handleEliminarTirada}
        onSubirDocumento={handleSubirDocumento}
        onDescargarDocumento={handleDescargarDocumento}
        onEliminarDocumento={handleEliminarDocumento}
        onBack={goToList}
      />
    );
  }

  if (view === 'tirada') {
    return (
      <TiradaStandalone
        cosecha={selectedCosecha}
        tiradas={tiradas}
        tiradaForm={tiradaForm}
        editingTiradaId={editingTiradaId}
        saving={tiradaSaving}
        error={error}
        onTiradaFieldChange={updateTiradaField}
        onGuardarTirada={handleGuardarTirada}
        onEditTirada={startEditTirada}
        onEliminarTirada={handleEliminarTirada}
        onBack={goToList}
      />
    );
  }

  if (view === 'detail') {
    return (
      <CosechaDetalle
        cosecha={selectedCosecha}
        documentos={documentos}
        tiradas={tiradas}
        onDescargarDocumento={handleDescargarDocumento}
        onBack={goToList}
      />
    );
  }

  return (
    <>
      <CosechasList
        cosechas={cosechas}
        lotes={lotes}
        parentFilters={parentFilters}
        selectedEmpresaName={selectedEmpresaName}
        selectedCampaniaName={selectedCampaniaName}
        loading={loading}
        error={error}
        onAdd={startCreate}
        onEdit={openEdit}
        onView={openDetail}
        onFinalize={openFinalize}
        onTirada={openTirada}
      />
      {pendingFinalizedTirada && (
        <ConfirmTiradaFinalizadaModal
          cosecha={pendingFinalizedTirada}
          onCancel={() => setPendingFinalizedTirada(null)}
          onContinue={() => openTirada(pendingFinalizedTirada, true)}
        />
      )}
    </>
  );
}

function ConfirmTiradaFinalizadaModal({ cosecha, onCancel, onContinue }) {
  return (
    <div className="modal-backdrop cosecha-warning-modal-backdrop" role="presentation">
      <section className="cosecha-warning-modal" role="dialog" aria-modal="true" aria-labelledby="tirada-finalizada-title">
        <div className="login-card-header">
          <span className="login-icon"><AlertTriangle size={25} /></span>
          <div>
            <strong id="tirada-finalizada-title">Cosecha ya finalizada</strong>
            <span>{cosecha.nombre}</span>
          </div>
        </div>
        <p>
          Vas a registrar controles de Tirada de Aros sobre una cosecha que ya fue finalizada.
          El resultado de cosecha no se modifica automaticamente.
        </p>
        <div className="form-actions">
          <button className="back-button" type="button" onClick={onCancel}>Cancelar</button>
          <button className="green-button" type="button" onClick={onContinue}>
            <CheckCircle2 size={17} />
            Continuar
          </button>
        </div>
      </section>
    </div>
  );
}

function CosechasList({ cosechas, lotes, parentFilters, selectedEmpresaName, selectedCampaniaName, loading, error, onAdd, onEdit, onView, onFinalize, onTirada }) {
  const [query, setQuery] = useState('');
  const [productoFilter, setProductoFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [selected, setSelected] = useState({});

  const productoOptions = useMemo(
    () => [...new Set(cosechas.map((cosecha) => cosecha.producto).filter(Boolean))],
    [cosechas]
  );

  const filtered = useMemo(() => cosechas.filter((cosecha) => {
    const texto = normalizeSearchText(query.trim());
    const camposBusqueda = [
      cosecha.nombre,
      cosecha.campaniaNombre,
      cosecha.producto,
      cosecha.empresa,
      cosecha.loteNombre,
      cosecha.estado,
      String(cosecha.rindeKgHa ?? '')
    ];
    const fechaInicio = toDateInput(cosecha.fechaInicio);
    const matchesQuery = !texto || camposBusqueda.some((campo) => normalizeSearchText(campo).includes(texto));
    const matchesGrano = !productoFilter || cosecha.producto === productoFilter;
    const matchesEstado = !estadoFilter || cosecha.estado === estadoFilter;
    const matchesFrom = !dateFromFilter || fechaInicio >= dateFromFilter;
    const matchesTo = !dateToFilter || fechaInicio <= dateToFilter;
    const matchesEmpresa = !selectedEmpresaName || normalizeSearchText(cosecha.empresa || '') === normalizeSearchText(selectedEmpresaName);
    const matchesCampania = !selectedCampaniaName || normalizeSearchText(cosecha.campaniaNombre || '') === normalizeSearchText(selectedCampaniaName);
    return matchesQuery && matchesGrano && matchesEstado && matchesFrom && matchesTo && matchesEmpresa && matchesCampania;
  }), [cosechas, query, productoFilter, estadoFilter, dateFromFilter, dateToFilter, selectedEmpresaName, selectedCampaniaName]);

  function getHectareas(cosecha) {
    const lote = lotes.find((item) => String(item.loteId) === String(cosecha.loteId));
    return cosecha.cantidadHectareasTrabajadas ?? lote?.hectareas;
  }

  const totalHectareas = filtered.reduce((sum, cosecha) => sum + Number(getHectareas(cosecha) || 0), 0);
  const rindesPorGrano = Object.values(filtered
    .filter((cosecha) => cosecha.estado === 'Finalizado' && cosecha.producto)
    .reduce((acc, cosecha) => {
      const grano = cosecha.producto;
      if (!acc[grano]) {
        acc[grano] = { grano, kilos: 0, hectareas: 0, rindeSum: 0, registrosConRinde: 0 };
      }

      acc[grano].kilos += Number(cosecha.cantidadGranoCosechado || 0);
      acc[grano].hectareas += Number(cosecha.cantidadHectareasTrabajadas || 0);
      if (Number(cosecha.rindeKgHa) > 0) {
        acc[grano].rindeSum += Number(cosecha.rindeKgHa);
        acc[grano].registrosConRinde += 1;
      }

      return acc;
    }, {}))
    .map((item) => ({
      ...item,
      rinde: item.kilos > 0 && item.hectareas > 0
        ? item.kilos / item.hectareas
        : item.registrosConRinde
          ? item.rindeSum / item.registrosConRinde
          : 0
    }));

  function clearFilters() {
    setQuery('');
    setProductoFilter('');
    setEstadoFilter('');
    setDateFromFilter('');
    setDateToFilter('');
  }

  const hayFilasSeleccionadas = Object.values(selected).some(Boolean);
  const hayFiltrosActivos = Boolean(query.trim() || productoFilter || estadoFilter || dateFromFilter || dateToFilter);

  function toggleSeleccion(cosechaId) {
    setSelected((current) => ({ ...current, [cosechaId]: !current[cosechaId] }));
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Cosechas</h1>
          <p>Registra cosechas activas, finaliza resultados y agrega controles opcionales de Tirada de Aros.</p>
        </div>
        <button className="green-button add-lote-button" type="button" onClick={onAdd}>
          <PlusCircle size={18} />
          <span>Registrar Cosecha</span>
        </button>
      </div>
      {parentFilters}

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="summary-grid summary-grid-four">
        <article className="summary-card">
          <div className="summary-icon"><Scale size={28} /></div>
          <div><span>Hectareas trabajadas</span><strong>{totalHectareas.toLocaleString('es-AR', { maximumFractionDigits: 2 })} ha</strong></div>
          <p>Superficie segun los filtros aplicados</p>
        </article>
        {rindesPorGrano.length > 0 ? rindesPorGrano.map((item) => (
          <article className="summary-card" key={item.grano}>
            <div className="summary-icon"><CheckCircle2 size={28} /></div>
            <div><span>Rinde promedio {item.grano}</span><strong>{item.rinde.toLocaleString('es-AR', { maximumFractionDigits: 2 })} kg/ha</strong></div>
            <p>Calculado sobre cosechas finalizadas</p>
          </article>
        )) : (
          <article className="summary-card">
            <div className="summary-icon"><CheckCircle2 size={28} /></div>
            <div><span>Rinde promedio</span><strong>Sin datos</strong></div>
            <p>Se muestra al finalizar cosechas</p>
          </article>
        )}
      </div>

      <div className="filters-card">
        <label className="search-field">
          <Search size={21} />
          <input data-text-case="preserve" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cualquier dato de la cosecha..." />
        </label>
        <select value={productoFilter} onChange={(event) => setProductoFilter(event.target.value)}>
          <option value="">Grano</option>
          {productoOptions.map((producto) => <option key={producto} value={producto}>{producto}</option>)}
        </select>
        <select value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)}>
          <option value="">Estado</option>
          <option value="En curso">En curso</option>
          <option value="Finalizado">Finalizado</option>
        </select>
        <button className="clear-button" type="button" onClick={clearFilters}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
        <div className="extra-filters-row">
          <label><span>Desde</span><input type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} /></label>
          <label><span>Hasta</span><input type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} /></label>
        </div>
      </div>

      {loading ? (
        <div className="table-shell dashboard-card"><div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Cargando cosechas...</span></div></div>
      ) : cosechas.length === 0 ? (
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Scale size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Aun no tenes cosechas registradas</h2>
            <p>Registra tu primera cosecha para iniciar el proceso activo.</p>
          </div>
          <button className="green-button empty-state-action" type="button" onClick={onAdd}>
            <PlusCircle size={18} />
            <span>Registrar Cosecha</span>
          </button>
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty-state dashboard-card empty-state-compact">
          <div className="empty-state-icon"><Search size={82} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>{hayFiltrosActivos ? 'No hay cosechas para esos filtros' : 'No hay cosechas para la empresa o campaña seleccionada'}</h2>
            <p>{hayFiltrosActivos ? 'Limpia los filtros para volver a ver los registros disponibles.' : 'Cambia la empresa o campaña desde los filtros superiores.'}</p>
          </div>
          {hayFiltrosActivos && (
            <button className="green-button empty-state-action" type="button" onClick={clearFilters}>
              <RotateCcw size={18} />
              <span>Limpiar filtros</span>
            </button>
          )}
        </section>
      ) : (
        <div className="table-shell dashboard-card">
          <table className="lotes-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Nombre</th>
                <th>Fecha de Inicio</th>
                <th>Fecha tentativa de Fin</th>
                <th>Fecha real de Fin</th>
                <th>Grano</th>
                <th>Lote</th>
                <th>Hectareas</th>
                <th>Rinde</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cosecha) => (
                <tr key={cosecha.cosechaId}>
                  <td><input type="checkbox" checked={Boolean(selected[cosecha.cosechaId])} onChange={() => toggleSeleccion(cosecha.cosechaId)} /></td>
                  <td>{cosecha.nombre}</td>
                  <td>{formatFecha(cosecha.fechaInicio)}</td>
                  <td>{formatFecha(cosecha.fechaFin)}</td>
                  <td>{formatFecha(cosecha.fechaFinReal)}</td>
                  <td>{cosecha.producto}</td>
                  <td>{cosecha.loteNombre}</td>
                  <td>{formatNumber(getHectareas(cosecha), ' ha')}</td>
                  <td>{formatNumber(cosecha.rindeKgHa, ' kg/ha')}</td>
                  <td><CosechaEstadoButton estado={cosecha.estado} onFinalize={() => onFinalize(cosecha)} /></td>
                  <td className="compact-actions-cell">
                    <div className="actions-cell actions-cell-center">
                      <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar ${cosecha.nombre}`} onClick={() => onEdit(cosecha)}><Edit size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label={`Ver ${cosecha.nombre}`} onClick={() => onView(cosecha)}><Eye size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Tirada de Aros" type="button" aria-label={`Tirada de Aros de ${cosecha.nombre}`} onClick={() => onTirada(cosecha)}><Scale size={18} /></button>
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
      )}
    </section>
  );
}

function CosechaEstadoButton({ estado, onFinalize }) {
  const finalizada = estado === 'Finalizado';

  if (finalizada) {
    return <span className="siembra-state-pill siembra-state-done">Finalizado</span>;
  }

  return (
    <button className="siembra-state-button" type="button" onClick={onFinalize} title="Finalizar cosecha">
      <span className="state-label-current">En curso</span>
      <span className="state-label-action">Finalizar</span>
    </button>
  );
}

function InitialFields({ modoEdicion, nombre, estado, lotes, siembras, form, onFieldChange }) {
  const hasInheritedData = Boolean(form.siembraId);
  const fechaInicioFueraDeRangoOperativo = Boolean(
    form.fechaInicio
    && (form.fechaInicio < OPERATION_DATE_MIN || form.fechaInicio > OPERATION_DATE_MAX)
  );
  const fechaFinFueraDeRangoOperativo = Boolean(
    form.fechaFin
    && (form.fechaFin < OPERATION_DATE_MIN || form.fechaFin > OPERATION_DATE_MAX)
  );

  return (
    <div className="create-form-card dashboard-card">
      <div className="create-grid">
        <label className="field">Nombre<input readOnly value={modoEdicion ? nombre : ''} placeholder="Se asigna automaticamente al guardar" /></label>
        <label className="field">
          Campaña / siembra asociada
          <select value={form.siembraId} onChange={(e) => onFieldChange('siembraId', e.target.value)}>
            <option value="">Seleccionar manualmente</option>
            {siembras.map((siembra) => (
              <option key={siembra.siembraId} value={siembra.siembraId}>{siembra.nombre} - {siembra.producto} - {siembra.loteNombre}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Fecha de Inicio <b>*</b>
          <input type="date" min={OPERATION_DATE_MIN} max={OPERATION_DATE_MAX} required value={form.fechaInicio} onChange={(e) => onFieldChange('fechaInicio', e.target.value)} />
          {fechaInicioFueraDeRangoOperativo && (
            <span className="field-error">
              La fecha de inicio debe estar entre {formatDateInputLabel(OPERATION_DATE_MIN)} y {formatDateInputLabel(OPERATION_DATE_MAX)}.
            </span>
          )}
        </label>
        <label className="field">
          Fecha tentativa de Fin <b>*</b>
          <input type="date" min={OPERATION_DATE_MIN} max={OPERATION_DATE_MAX} required value={form.fechaFin} onChange={(e) => onFieldChange('fechaFin', e.target.value)} />
          {form.fechaInicio && form.fechaFin && form.fechaFin < form.fechaInicio && (
            <span className="field-error">La fecha de fin no puede ser anterior a la fecha de inicio.</span>
          )}
          {fechaFinFueraDeRangoOperativo && (
            <span className="field-error">
              La fecha tentativa de fin debe estar entre {formatDateInputLabel(OPERATION_DATE_MIN)} y {formatDateInputLabel(OPERATION_DATE_MAX)}.
            </span>
          )}
        </label>
        <label className="field">
          Campaña
          <input value={form.campaniaNombre} readOnly={hasInheritedData} onChange={(e) => onFieldChange('campaniaNombre', e.target.value)} placeholder="Opcional" />
        </label>
        <label className="field">
          Lote <b>*</b>
          <select required value={form.loteId} disabled={hasInheritedData} onChange={(e) => onFieldChange('loteId', e.target.value)}>
            <option value="">Seleccionar</option>
            {lotes.map((lote) => <option key={lote.loteId} value={lote.loteId}>{lote.nombre}</option>)}
          </select>
        </label>
        <label className="field">
          Grano <b>*</b>
          <input required value={form.producto} readOnly={hasInheritedData} onChange={(e) => onFieldChange('producto', e.target.value)} />
        </label>
        <label className="field">
          Empresa
          <input value={form.empresa} readOnly={hasInheritedData} onChange={(e) => onFieldChange('empresa', e.target.value)} />
        </label>
        {modoEdicion && <label className="field">Estado<input readOnly value={estado} /></label>}
      </div>
    </div>
  );
}

function ResultFields({ usuarios, form, onFieldChange, showRealDate = false }) {
  const diasDesvio = form.fechaFin && form.fechaFinReal
    ? Math.abs((new Date(form.fechaFinReal) - new Date(form.fechaFin)) / 86400000)
    : 0;
  const requiereJustificacion = diasDesvio > DIAS_DESVIO_REQUIERE_JUSTIFICACION;
  const fechaRealMinima = form.fechaInicio || OPERATION_DATE_MIN;
  const fechaRealMaxima = OPERATION_DATE_MAX;

  return (
    <div className="create-form-card dashboard-card">
      <div className="create-grid">
        {showRealDate && (
          <label className="field">
            Fecha real de finalizacion <b>*</b>
            <input type="date" min={fechaRealMinima} max={fechaRealMaxima} required value={form.fechaFinReal} onChange={(e) => onFieldChange('fechaFinReal', e.target.value)} />
          </label>
        )}
        <label className="field">
          Cantidad de grano cosechado (kg) <b>*</b>
          <input type="number" min="0" step="0.01" required value={form.cantidadGranoCosechado} onChange={(e) => onFieldChange('cantidadGranoCosechado', e.target.value)} />
        </label>
        <label className="field">
          Cant. Hectareas Trabajadas <b>*</b>
          <input type="number" min="0" step="0.01" required value={form.cantidadHectareasTrabajadas} onChange={(e) => onFieldChange('cantidadHectareasTrabajadas', e.target.value)} />
        </label>
        <label className="field">
          Rinde (kg/ha) <b>*</b>
          <input type="number" min="0" step="0.01" required value={form.rindeKgHa} onChange={(e) => onFieldChange('rindeKgHa', e.target.value)} />
          <span style={{ fontSize: 12, color: '#6b7280' }}>Se calcula solo y podes ajustarlo si hace falta.</span>
        </label>
        <label className="field">
          Humedad del grano (%)
          <input type="number" min="0" step="0.01" value={form.humedadGrano} onChange={(e) => onFieldChange('humedadGrano', e.target.value)} />
        </label>
        <label className="field">
          Impurezas (%)
          <input type="number" min="0" step="0.01" value={form.impurezas} onChange={(e) => onFieldChange('impurezas', e.target.value)} />
        </label>
        <label className="field">
          Responsable a Cargo
          <select value={form.responsableACargo} onChange={(e) => onFieldChange('responsableACargo', e.target.value)}>
            <option value="">Seleccionar</option>
            {usuarios.map((usuario) => {
              const nombreCompleto = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ');
              return <option key={usuario.usuarioId} value={nombreCompleto}>{nombreCompleto}</option>;
            })}
          </select>
        </label>
        {showRealDate && requiereJustificacion && (
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            Justificacion del desvio <b>*</b>
            <textarea value={form.justificacionDesvioFin} onChange={(e) => onFieldChange('justificacionDesvioFin', e.target.value)} placeholder="Explica por que la fecha real se alejo de la fecha tentativa." />
          </label>
        )}
      </div>
    </div>
  );
}

function CosechaForm({
  modoEdicion,
  nombre,
  estado,
  lotes,
  siembras,
  usuarios,
  form,
  documentos,
  tiradas,
  tiradaForm,
  editingTiradaId,
  saving,
  tiradaSaving,
  error,
  onFieldChange,
  onTiradaFieldChange,
  onGuardar,
  onGuardarTirada,
  onEditTirada,
  onEliminarTirada,
  onSubirDocumento,
  onDescargarDocumento,
  onEliminarDocumento,
  onBack
}) {
  const puedeEditarResultado = modoEdicion && estado === 'Finalizado';
  const fechaInicioFueraDeRangoOperativo = Boolean(
    form.fechaInicio
    && (form.fechaInicio < OPERATION_DATE_MIN || form.fechaInicio > OPERATION_DATE_MAX)
  );
  const fechaFinFueraDeRangoOperativo = Boolean(
    form.fechaFin
    && (form.fechaFin < OPERATION_DATE_MIN || form.fechaFin > OPERATION_DATE_MAX)
  );
  const canRegister = Boolean(
    form.fechaInicio
    && form.fechaFin
    && form.fechaFin >= form.fechaInicio
    && !fechaInicioFueraDeRangoOperativo
    && !fechaFinFueraDeRangoOperativo
    && form.loteId
    && String(form.producto || '').trim()
  );

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{modoEdicion ? 'Editar Cosecha' : 'Registrar Cosecha'}</h1>
          <p>{modoEdicion ? nombre : 'Al guardar queda En curso. El resultado se carga al finalizar.'}</p>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <InitialFields modoEdicion={modoEdicion} nombre={nombre} estado={estado} lotes={lotes} siembras={siembras} form={form} onFieldChange={onFieldChange} />

      {modoEdicion && (
        <>
          {puedeEditarResultado && (
            <>
              <h2>Resultado de cosecha</h2>
              <ResultFields usuarios={usuarios} form={form} onFieldChange={onFieldChange} showRealDate />
            </>
          )}
          <h2>Tirada de Aros</h2>
          <TiradaArosSection tiradas={tiradas} form={tiradaForm} editingTiradaId={editingTiradaId} saving={tiradaSaving} fechaInicio={form.fechaInicio} fechaFin={form.fechaFinReal || form.fechaFin} onFieldChange={onTiradaFieldChange} onGuardar={onGuardarTirada} onEdit={onEditTirada} onEliminar={onEliminarTirada} />
          <h2>Documentacion</h2>
          <DocumentacionSection documentos={documentos} onSubirDocumento={onSubirDocumento} onDescargarDocumento={onDescargarDocumento} onEliminarDocumento={onEliminarDocumento} editable />
        </>
      )}

      <div className="form-actions">
        <button className="green-button" type="button" disabled={saving || !canRegister} onClick={onGuardar}>
          <Save size={17} />
          {saving ? 'Guardando...' : modoEdicion ? 'Guardar cambios' : 'Registrar'}
        </button>
        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
      </div>
    </section>
  );
}

function FinalizarCosecha(props) {
  const { cosecha, usuarios, form, documentos, tiradas, tiradaForm, editingTiradaId, saving, tiradaSaving, error, onFieldChange, onTiradaFieldChange, onFinalizar, onGuardarTirada, onEditTirada, onEliminarTirada, onSubirDocumento, onDescargarDocumento, onEliminarDocumento, onBack } = props;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Finalizar Cosecha</h1>
          <p>{cosecha?.nombre} - completa el resultado y registra la fecha real de finalizacion.</p>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">Fecha de Inicio<input readOnly value={formatFecha(cosecha?.fechaInicio)} /></label>
          <label className="field">Fecha tentativa de Fin<input readOnly value={formatFecha(cosecha?.fechaFin)} /></label>
          <label className="field">Grano<input readOnly value={cosecha?.producto || '-'} /></label>
          <label className="field">Lote<input readOnly value={cosecha?.loteNombre || '-'} /></label>
        </div>
      </div>

      <h2>Resultado de cosecha</h2>
      <ResultFields usuarios={usuarios} form={form} onFieldChange={onFieldChange} showRealDate />

      <h2>Tirada de Aros opcional</h2>
      <TiradaArosSection tiradas={tiradas} form={tiradaForm} editingTiradaId={editingTiradaId} saving={tiradaSaving} fechaInicio={form.fechaInicio} fechaFin={form.fechaFinReal || form.fechaFin} onFieldChange={onTiradaFieldChange} onGuardar={onGuardarTirada} onEdit={onEditTirada} onEliminar={onEliminarTirada} />

      <h2>Documentacion</h2>
      <DocumentacionSection documentos={documentos} onSubirDocumento={onSubirDocumento} onDescargarDocumento={onDescargarDocumento} onEliminarDocumento={onEliminarDocumento} editable />

      <div className="form-actions">
        <button className="green-button" type="button" disabled={saving} onClick={onFinalizar}>
          <CheckCircle2 size={17} />
          {saving ? 'Finalizando...' : 'Finalizar cosecha'}
        </button>
        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
      </div>
    </section>
  );
}

function TiradaStandalone({ cosecha, tiradas, tiradaForm, editingTiradaId, saving, error, onTiradaFieldChange, onGuardarTirada, onEditTirada, onEliminarTirada, onBack }) {
  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Tirada de Aros</h1>
          <p>{cosecha?.nombre} - control opcional para estimar perdidas de cosecha.</p>
        </div>
      </div>

      {cosecha?.estado === 'Finalizado' && (
        <div className="create-form-card dashboard-card" style={{ borderColor: '#f6c453', background: '#fff9e8' }}>
          <p style={{ margin: 0, fontWeight: 800, color: '#7a4d00', display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={18} />
            Vas a registrar controles sobre una cosecha ya finalizada. El resultado de cosecha no se modifica automaticamente.
          </p>
        </div>
      )}

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <TiradaArosSection tiradas={tiradas} form={tiradaForm} editingTiradaId={editingTiradaId} saving={saving} fechaInicio={toDateInput(cosecha?.fechaInicio)} fechaFin={toDateInput(cosecha?.fechaFinReal || cosecha?.fechaFin)} onFieldChange={onTiradaFieldChange} onGuardar={onGuardarTirada} onEdit={onEditTirada} onEliminar={onEliminarTirada} />

      <div className="form-actions">
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
      </div>
    </section>
  );
}

function TiradaArosSection({ tiradas, form, editingTiradaId, saving, fechaInicio, fechaFin, onFieldChange, onGuardar, onEdit, onEliminar }) {
  return (
    <div className="create-form-card dashboard-card">
      <div className="create-grid">
        <label className="field">Fecha del control <b>*</b><input type="date" min={fechaInicio || undefined} max={fechaFin || undefined} value={form.fecha} onChange={(e) => onFieldChange('fecha', e.target.value)} /></label>
        <label className="field">PMG <b>*</b><input type="number" min="0" step="0.01" value={form.pmg} onChange={(e) => onFieldChange('pmg', e.target.value)} placeholder="Peso de mil granos" /></label>
        <label className="field">Latitud<input type="number" step="0.000001" value={form.latitud} onChange={(e) => onFieldChange('latitud', e.target.value)} /></label>
        <label className="field">Longitud<input type="number" step="0.000001" value={form.longitud} onChange={(e) => onFieldChange('longitud', e.target.value)} /></label>
        <label className="field">Aro Cabezal <b>*</b><input type="number" min="0" value={form.aroCabezal} onChange={(e) => onFieldChange('aroCabezal', e.target.value)} /></label>
        <label className="field">Aro Cola 1 <b>*</b><input type="number" min="0" value={form.aroCola1} onChange={(e) => onFieldChange('aroCola1', e.target.value)} /></label>
        <label className="field">Aro Cola 2 <b>*</b><input type="number" min="0" value={form.aroCola2} onChange={(e) => onFieldChange('aroCola2', e.target.value)} /></label>
        <label className="field">Aro Cola 3 <b>*</b><input type="number" min="0" value={form.aroCola3} onChange={(e) => onFieldChange('aroCola3', e.target.value)} /></label>
        <label className="field"><span>Ajusto maquinaria</span><input type="checkbox" checked={form.ajustoMaquinaria} onChange={(e) => onFieldChange('ajustoMaquinaria', e.target.checked)} /></label>
        <label className="field" style={{ gridColumn: '1 / -1' }}>Observaciones<textarea value={form.observaciones} onChange={(e) => onFieldChange('observaciones', e.target.value)} /></label>
      </div>
      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="green-button" type="button" disabled={saving} onClick={onGuardar}>
          <ClipboardList size={17} />
          {saving ? 'Guardando...' : editingTiradaId ? 'Guardar Tirada' : 'Agregar Tirada'}
        </button>
      </div>

      <div className="table-shell" style={{ marginTop: 16 }}>
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Aros</th>
              <th>PMG</th>
              <th>Perdida total</th>
              <th>Severidad</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tiradas.map((tirada) => (
              <tr key={tirada.cosechaTiradaAroId}>
                <td>{formatFecha(tirada.fecha)}</td>
                <td>Cabezal {tirada.aroCabezal} / Cola {tirada.aroCola1}, {tirada.aroCola2}, {tirada.aroCola3}</td>
                <td>{formatNumber(tirada.pmg)}</td>
                <td>{formatNumber(tirada.perdidaTotalKgHa, ' kg/ha')}</td>
                <td>{tirada.severidad}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label="Editar Tirada de Aros" onClick={() => onEdit(tirada)}><Edit size={18} /></button>
                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar Tirada de Aros" onClick={() => onEliminar(tirada)}><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
            {tiradas.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center' }}>Sin controles de Tirada de Aros registrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CosechaDetalle({ cosecha, documentos, tiradas, onDescargarDocumento, onBack }) {
  if (!cosecha) return null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Detalle Cosecha</h1>
          <p>{cosecha.nombre}</p>
        </div>
      </div>

      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">Nombre<input readOnly value={cosecha.nombre} /></label>
          <label className="field">Siembra asociada<input readOnly value={cosecha.siembraNombre || '-'} /></label>
          <label className="field">Fecha de Inicio<input readOnly value={formatFecha(cosecha.fechaInicio)} /></label>
          <label className="field">Fecha tentativa de Fin<input readOnly value={formatFecha(cosecha.fechaFin)} /></label>
          <label className="field">Fecha real de Fin<input readOnly value={formatFecha(cosecha.fechaFinReal)} /></label>
          <label className="field">Campaña<input readOnly value={cosecha.campaniaNombre || '-'} /></label>
          <label className="field">Lote<input readOnly value={cosecha.loteNombre} /></label>
          <label className="field">Grano<input readOnly value={cosecha.producto} /></label>
          <label className="field">Empresa<input readOnly value={cosecha.empresa || '-'} /></label>
          <label className="field">Estado<input readOnly value={cosecha.estado} /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>Justificacion del desvio<textarea readOnly value={cosecha.justificacionDesvioFin || '-'} /></label>
        </div>
      </div>

      <h2>Resultado de cosecha</h2>
      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">Cantidad de grano cosechado<input readOnly value={formatNumber(cosecha.cantidadGranoCosechado, ' kg')} /></label>
          <label className="field">Cant. Hectareas Trabajadas<input readOnly value={formatNumber(cosecha.cantidadHectareasTrabajadas)} /></label>
          <label className="field">Rinde<input readOnly value={formatNumber(cosecha.rindeKgHa, ' kg/ha')} /></label>
          <label className="field">Humedad del grano<input readOnly value={formatNumber(cosecha.humedadGrano, ' %')} /></label>
          <label className="field">Impurezas<input readOnly value={formatNumber(cosecha.impurezas, ' %')} /></label>
          <label className="field">Responsable a Cargo<input readOnly value={cosecha.responsableACargo || '-'} /></label>
        </div>
      </div>

      <h2>Tirada de Aros</h2>
      <TiradasReadonly tiradas={tiradas} />

      <h2>Documentacion</h2>
      <DocumentacionSection documentos={documentos} onDescargarDocumento={onDescargarDocumento} />

      <div className="form-actions">
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
      </div>
    </section>
  );
}

function TiradasReadonly({ tiradas }) {
  return (
    <div className="create-form-card dashboard-card">
      <div className="table-shell">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Perdida cabezal</th>
              <th>Perdida cola</th>
              <th>Perdida total</th>
              <th>Severidad</th>
            </tr>
          </thead>
          <tbody>
            {tiradas.map((tirada) => (
              <tr key={tirada.cosechaTiradaAroId}>
                <td>{formatFecha(tirada.fecha)}</td>
                <td>{formatNumber(tirada.perdidaCabezalKgHa, ' kg/ha')}</td>
                <td>{formatNumber(tirada.perdidaColaKgHa, ' kg/ha')}</td>
                <td>{formatNumber(tirada.perdidaTotalKgHa, ' kg/ha')}</td>
                <td>{tirada.severidad}</td>
              </tr>
            ))}
            {tiradas.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin controles registrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentacionSection({ documentos, onSubirDocumento, onDescargarDocumento, onEliminarDocumento, editable = false }) {
  return (
    <div className="create-form-card dashboard-card">
      {editable && <input type="file" onChange={(e) => onSubirDocumento(e.target.files?.[0])} />}
      <DocumentosTable
        documentos={documentos}
        onDescargarDocumento={onDescargarDocumento}
        onEliminarDocumento={onEliminarDocumento}
        editable={editable}
      />
    </div>
  );
}

function DocumentosTable({ documentos, onDescargarDocumento, onEliminarDocumento, editable = false }) {
  return (
    <div className="table-shell" style={{ marginTop: 16 }}>
      <table className="lotes-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Fecha de carga</th>
            <th>Cargado por</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {documentos.map((doc) => (
            <tr key={doc.cosechaDocumentoId ?? doc.tempId}>
              <td>{doc.nombreArchivo}</td>
              <td>{doc.fechaCarga ? formatFecha(doc.fechaCarga) : 'Pendiente de guardar'}</td>
              <td>{doc.cargadoPor || '-'}</td>
              <td className="actions-cell">
                {doc.cosechaDocumentoId && (
                  <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>
                )}
                {editable && doc.cosechaDocumentoId && (
                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar" onClick={() => onEliminarDocumento(doc)}><Trash2 size={18} /></button>
                )}
              </td>
            </tr>
          ))}
          {documentos.length === 0 && (
            <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin archivos adjuntos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
