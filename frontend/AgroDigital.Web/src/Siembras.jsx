import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  ClipboardCheck,
  CheckCircle2,
  Download,
  Edit,
  Eye,
  FileText,
  Filter,
  FlaskConical,
  Gauge,
  HelpCircle,
  Info,
  Leaf,
  Lightbulb,
  LoaderCircle,
  Map,
  MapPin,
  PlusCircle,
  RotateCcw,
  Route,
  Save,
  Search,
  Sprout,
  UploadCloud,
  UserRound,
  Trash2
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const defaultMapCenter = [-32.0025, -64.0055];
const DIAS_DESVIO_REQUIERE_JUSTIFICACION = 3;
const OPERATION_DATE_MIN = '2026-01-01';
const OPERATION_DATE_MAX = '2027-12-31';

const INCIDENCIAS_SEGUIMIENTO = ['Ninguna', 'Plaga', 'Maleza', 'Enfermedad'];
const GRANOS_PLANIFICABLES = ['Soja', 'Maiz', 'Sorgo', 'Trigo', 'Girasol', 'Otro'];

const SINIESTROS_RESIEMBRA = [
  'Granizo',
  'Sequia / Estres hidrico',
  'Helada tardia',
  'Anegamiento / Inundacion',
  'Plagas de implantacion',
  'Fitotoxicidad por agroquimicos',
  'Encostramiento del suelo',
  'Falla de germinacion'
];

const TIPOS_INSUMO = [
  'Herbicidas', 'Insecticidas', 'Fungicidas', 'Acaricidas',
  'Nematicidas', 'Raticidas', 'Bactericidas', 'Molusquicidas'
];

const SIEMBRA_FIELD_RULES = {
  tipoRegistro: 'Es obligatorio elegir Siembra o Resiembra. Solo puede existir una siembra y una resiembra por lote y periodo de campaña.',
  nombre: 'Es de solo lectura y se genera al guardar con el formato SIEM - 0001.',
  loteSiembra: 'Solo aparecen lotes planificados en la campaña que todavía no tienen una siembra en este periodo.',
  loteResiembra: 'Solo aparecen lotes con siembra y seguimiento originales finalizados y sin otra resiembra en el periodo.',
  siembraOriginal: 'Se completa automáticamente con la siembra finalizada del lote seleccionado.',
  hectareasLote: 'Es de solo lectura y toma la superficie registrada para el lote dentro de la campaña.',
  cultivoAfectado: 'Es informativo y muestra el cultivo registrado en la siembra original.',
  cultivoSiembra: 'Es obligatorio y se completa con el cultivo planificado para el lote en la campaña.',
  cultivoResiembra: 'Es obligatorio. En resiembra parcial conserva el cultivo original; en resiembra total puede cambiarse.',
  tipoResiembra: 'Es obligatorio. Parcial conserva el cultivo original; Total permite seleccionar otro cultivo.',
  siniestro: 'Es obligatorio y debe elegirse de la lista de causas admitidas.',
  fechaInicioSiembra: (minima, maxima) => `Es obligatoria y debe estar entre ${minima} y ${maxima}.`,
  fechaInicioResiembra: (minima, maxima) => `Debe estar entre el fin real de la siembra original (${minima}) y cuatro meses después, sin superar el fin de campaña (${maxima}).`,
  fechaFin: (maxima, esResiembra) => `Es obligatoria, no puede ser anterior al inicio ni posterior al ${maxima}${esResiembra ? ', fin del año de campaña' : ''}.`,
  seguimiento: 'Es de solo lectura y refleja el estado del seguimiento asociado.',
  variedadSemilla: 'Es obligatoria, no puede quedar vacía y se guarda en mayúsculas.',
  pmg: 'Es obligatorio y debe ser mayor que cero. No admite valores negativos.',
  densidad: 'Es obligatoria y debe ser mayor que cero. Se usa para calcular la cantidad de semillas.',
  profundidad: 'Es obligatoria y debe ser mayor que cero. No admite valores negativos.',
  hectareasCultivables: 'Es obligatoria y debe ser mayor que cero. Se completa desde el lote y puede ajustarse.',
  urea: 'Es opcional. Si se carga, debe ser igual o mayor que cero y representa kg aplicados por hectárea.',
  cantidadSemillas: 'Es obligatoria y mayor que cero. Se calcula como Densidad × Hectáreas cultivables, pero puede editarse.',
  responsable: 'Es obligatorio seleccionar un usuario disponible de la empresa.',
  fechaMuestreo: (minima, maxima) => `Es opcional. Si se carga, debe estar entre ${minima} y el inicio de siembra (${maxima}).`,
  fechaAnalisis: 'Es opcional. No puede ser anterior al muestreo ni posterior al inicio de siembra.',
  cantidadMuestras: 'Es opcional y solo admite números enteros iguales o mayores que cero.',
  cultivoAntecesor: 'Es de solo lectura y toma el último cultivo con cosecha finalizada del historial del lote.',
  observaciones: 'Es opcional y permite registrar aclaraciones sobre el muestreo o el análisis de suelo.',
  pulverizacion: 'En resiembra, No es la opción predeterminada. Si elegís Sí, debés agregar al menos un agroquímico a la tabla para continuar.',
  fechaAplicacion: (minima) => `Es obligatoria. Debe estar entre ${minima} y la fecha de inicio de siembra.`,
  marcaAgroquimico: 'Es obligatoria y no puede quedar vacía.',
  tipoAgroquimico: 'Es obligatorio y debe elegirse de la lista de tipos admitidos.',
  variedadAgroquimico: 'Es obligatoria y no puede quedar vacía.',
  cantidadAgroquimico: 'La cantidad debe ser mayor que cero y la unidad debe ser Litros o Kg.',
  documentacion: 'La documentación es opcional. Los formatos sugeridos son PDF, JPG, PNG y XLSX.'
};

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getEmptySeguimientoForm() {
  return {
    fecha: todayIso(),
    longitud: '',
    latitud: '',
    incidencia: '',
    perdidaEconomica: '',
    aplicacionAgroquimicos: '',
    observaciones: ''
  };
}

function getEmptySiembraForm() {
  return {
    tipoRegistro: 'Siembra',
    siembraOriginalId: '',
    tipoResiembra: '',
    siniestro: '',
    loteId: '',
    cantidadHectareasLote: '',
    campaniaNombre: '',
    producto: '',
    empresa: '',
    fechaInicio: '',
    fechaFin: '',
    fechaFinReal: '',
    justificacionDesvioFin: '',
    hectareasHora: '',
    variedadSemilla: '',
    pmg: '',
    densidadSiembra: '',
    profundidad: '',
    cantidadHectareasTrabajadas: '',
    ureaKgHa: '',
    cantidadSemillas: '',
    responsableACargo: '',
    fechaMuestreo: '',
    fechaAnalisis: '',
    cantidadMuestras: '',
    productoAntecesor: '',
    observacionesPreSiembra: ''
  };
}

const emptyInsumoForm = {
  fechaAplicacion: '',
  marca: '',
  tipo: '',
  variedad: '',
  cantidadAplicada: '',
  unidadMedida: ''
};

export default function Siembras({
  session,
  lotes,
  parentFilters,
  selectedCampania,
  selectedCampaniaCombinaciones = [],
  selectedEmpresaName = '',
  selectedCampaniaName = '',
  onLotesChanged,
  onCampaniasChanged
}) {
  const [view, setView] = useState('list');
  const [siembras, setSiembras] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSiembra, setSelectedSiembra] = useState(null);

  const [form, setForm] = useState(getEmptySiembraForm);
  const [insumoForm, setInsumoForm] = useState(emptyInsumoForm);
  const [insumos, setInsumos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [saving, setSaving] = useState(false);

  const [seguimientos, setSeguimientos] = useState([]);
  const [seguimientoForm, setSeguimientoForm] = useState(getEmptySeguimientoForm);
  const [activeSeguimientoId, setActiveSeguimientoId] = useState(null);
  const [seguimientoInsumoForm, setSeguimientoInsumoForm] = useState(emptyInsumoForm);
  const [seguimientoInsumos, setSeguimientoInsumos] = useState([]);
  const [seguimientoDocumentos, setSeguimientoDocumentos] = useState([]);
  const [seguimientoDetalle, setSeguimientoDetalle] = useState(null);
  const [seguimientoSaving, setSeguimientoSaving] = useState(false);
  const [seguimientoBloqueadoSiembra, setSeguimientoBloqueadoSiembra] = useState(null);
  const [grainChangeModal, setGrainChangeModal] = useState(null);
  const [pendingGrainChange, setPendingGrainChange] = useState(null);

  useEffect(() => {
    const cultivoAntecesor = lotes?.find((lote) => String(lote.loteId) === String(form.loteId))?.historialCultivos?.[0]?.cultivo || '';
    setForm((current) => current.productoAntecesor === cultivoAntecesor ? current : { ...current, productoAntecesor: cultivoAntecesor });
  }, [form.loteId, lotes]);

  function authHeaders(extra = {}) {
    return session?.token ? { ...extra, Authorization: `Bearer ${session.token}` } : extra;
  }

  async function loadSiembras() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/siembras`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      setSiembras(await response.json());
    } catch (err) {
      setError(`No se pudieron cargar las siembras: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsuarios() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/usuarios/resumen`, { headers: authHeaders() });
      if (response.ok) setUsuarios(await response.json());
    } catch {
      // El dropdown de Responsable queda vacio si esto falla; no bloquea el resto de la pantalla.
    }
  }

  useEffect(() => {
    loadSiembras();
    loadUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToList() {
    setView('list');
    setSelectedSiembra(null);
    setGrainChangeModal(null);
    setPendingGrainChange(null);
    setError('');
    loadSiembras();
  }

  function startCreate() {
    setSelectedSiembra(null);
    setPendingGrainChange(null);
    setForm({
      ...getEmptySiembraForm(),
      campaniaNombre: selectedCampaniaName || '',
      empresa: selectedEmpresaName || ''
    });
    setInsumoForm(emptyInsumoForm);
    setInsumos([]);
    setDocumentos([]);
    setError('');
    setView('create');
  }

  async function loadSubItems(siembraId) {
    try {
      const [insRes, docRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/siembras/${siembraId}/insumos`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/api/siembras/${siembraId}/documentos`, { headers: authHeaders() })
      ]);
      setInsumos(insRes.ok ? await insRes.json() : []);
      setDocumentos(docRes.ok ? await docRes.json() : []);
    } catch (err) {
      setError(`No se pudo cargar la informacion de la siembra: ${err.message}`);
    }
  }

  function llenarFormDesdeSiembra(siembra) {
    const lote = lotes?.find((l) => String(l.loteId) === String(siembra.loteId));
    setForm({
      loteId: siembra.loteId,
      cantidadHectareasLote: lote?.hectareas ?? '',
      tipoRegistro: siembra.tipoRegistro || 'Siembra',
      siembraOriginalId: siembra.siembraOriginalId ?? '',
      tipoResiembra: siembra.tipoResiembra || '',
      siniestro: siembra.siniestro || '',
      campaniaNombre: siembra.campaniaNombre || '',
      producto: siembra.producto,
      empresa: siembra.empresa || '',
      fechaInicio: toDateInput(siembra.fechaInicio),
      fechaFin: toDateInput(siembra.fechaFin),
      fechaFinReal: toDateInput(siembra.fechaFinReal),
      justificacionDesvioFin: siembra.justificacionDesvioFin || '',
      hectareasHora: siembra.hectareasHora ?? '',
      variedadSemilla: siembra.variedadSemilla || '',
      pmg: siembra.pmg ?? '',
      densidadSiembra: siembra.densidadSiembra ?? '',
      profundidad: siembra.profundidad ?? '',
      cantidadHectareasTrabajadas: siembra.cantidadHectareasTrabajadas ?? '',
      ureaKgHa: siembra.ureaKgHa ?? '',
      cantidadSemillas: siembra.cantidadSemillas ?? '',
      responsableACargo: siembra.responsableACargo || '',
      fechaMuestreo: toDateInput(siembra.fechaMuestreo),
      fechaAnalisis: toDateInput(siembra.fechaAnalisis),
      cantidadMuestras: siembra.cantidadMuestras ?? '',
      productoAntecesor: siembra.productoAntecesor || '',
      observacionesPreSiembra: siembra.observacionesPreSiembra || ''
    });
  }

  async function openEdit(siembra) {
    setSelectedSiembra(siembra);
    setPendingGrainChange(null);
    llenarFormDesdeSiembra(siembra);
    setInsumoForm(emptyInsumoForm);
    setError('');
    await loadSubItems(siembra.siembraId);
    setView('edit');
  }

  async function openDetail(siembra) {
    setSelectedSiembra(siembra);
    llenarFormDesdeSiembra(siembra);
    setError('');
    await loadSubItems(siembra.siembraId);
    setView('detail');
  }

  function openFinalizarSiembra(siembra) {
    setSelectedSiembra(siembra);
    llenarFormDesdeSiembra(siembra);
    setError('');
    setView('finalizar');
  }

  function updateField(field, value) {
    if (['pmg', 'densidadSiembra', 'profundidad', 'cantidadHectareasTrabajadas', 'cantidadSemillas', 'ureaKgHa', 'hectareasHora'].includes(field)
      && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return;
    if (field === 'tipoRegistro' || field === 'loteId' || field === 'campaniaNombre') {
      setPendingGrainChange(null);
    }

    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === 'tipoRegistro') {
        next.siembraOriginalId = '';
        next.tipoResiembra = value === 'Resiembra' ? 'Parcial' : '';
        next.siniestro = '';
        next.loteId = '';
        next.cantidadHectareasLote = '';
        next.campaniaNombre = selectedCampaniaName || next.campaniaNombre;
        next.empresa = selectedEmpresaName || next.empresa;
      }

      if (field === 'campaniaNombre' && current.tipoRegistro === 'Resiembra') {
        next.siembraOriginalId = '';
        next.loteId = '';
        next.cantidadHectareasLote = '';
        next.producto = '';
        next.empresa = '';
      }

      if (field === 'loteId') {
        const lote = lotes?.find((l) => String(l.loteId) === String(value));
        const campaniaCombo = selectedCampaniaCombinaciones.find((item) => String(item.loteId) === String(value));
        const hectareas = campaniaCombo?.hectareas ?? lote?.hectareas ?? '';
        next.cantidadHectareasLote = hectareas;
        next.cantidadHectareasTrabajadas = hectareas;

        if (campaniaCombo && current.tipoRegistro !== 'Resiembra') {
          next.producto = campaniaCombo.producto ?? next.producto;
          next.campaniaNombre = campaniaCombo.campaniaNombre || selectedCampaniaName || next.campaniaNombre;
          next.empresa = campaniaCombo.empresaNombre || selectedEmpresaName || next.empresa;
        }

        if (current.tipoRegistro === 'Resiembra') {
          const original = siembras.find((siembra) =>
            siembra.tipoRegistro !== 'Resiembra'
            && siembra.estadoSiembra === 'Finalizado' && siembra.estado === 'Finalizado'
            && String(siembra.loteId) === String(value)
            && normalizeSearchText(siembra.campaniaNombre || '') === normalizeSearchText(current.campaniaNombre || '')
          );
          next.siembraOriginalId = original?.siembraId ?? '';
          next.producto = original?.producto ?? next.producto;
          next.empresa = original?.empresa ?? next.empresa;
        }
      }

      if (field === 'cantidadHectareasLote') {
        next.cantidadHectareasTrabajadas = value;
      }

      if (field === 'tipoResiembra' && value === 'Parcial' && current.siembraOriginalId) {
        const original = siembras.find((siembra) => String(siembra.siembraId) === String(current.siembraOriginalId));
        next.producto = original?.producto ?? next.producto;
      }

      if (field === 'densidadSiembra' || field === 'cantidadHectareasTrabajadas') {
        const densidad = Number(field === 'densidadSiembra' ? value : next.densidadSiembra);
        const hectareas = Number(field === 'cantidadHectareasTrabajadas' ? value : next.cantidadHectareasTrabajadas);
        if (densidad > 0 && hectareas > 0) {
          next.cantidadSemillas = String(densidad * hectareas);
        }
      }

      return next;
    });
  }

  async function updatePlannedGrain(loteId, producto) {
    if (!selectedCampania?.campaniaId) return;
    const response = await fetch(`${API_BASE_URL}/api/campanias/${selectedCampania.campaniaId}`, { headers: authHeaders() });
    if (!response.ok) throw new Error(`No se pudo abrir la campania (${response.status}).`);
    const campania = await response.json();
    const combinaciones = (campania.combinaciones || []).map((item) => ({
      loteId: item.loteId,
      producto: String(item.loteId) === String(loteId) ? producto : item.producto,
      fechaInicio: toDateInput(item.fechaInicio || campania.fechaInicio),
      fechaFin: toDateInput(item.fechaFin || campania.fechaFin)
    }));
    const updateResponse = await fetch(`${API_BASE_URL}/api/campanias/${selectedCampania.campaniaId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fechaInicio: toDateInput(campania.fechaInicio),
        fechaFin: toDateInput(campania.fechaFin),
        observaciones: campania.observaciones || null,
        combinaciones
      })
    });
    if (!updateResponse.ok) throw new Error(`No se pudo actualizar el grano planificado (${updateResponse.status}): ${await updateResponse.text()}`);
    await onCampaniasChanged?.();
    await onLotesChanged?.();
  }

  async function confirmGrainChange(nextProductOverride) {
    if (!grainChangeModal) return;
    const nextProduct = nextProductOverride || grainChangeModal.nextProduct;
    setError('');
    setPendingGrainChange({
      loteId: grainChangeModal.loteId,
      producto: nextProduct
    });
    updateField('producto', nextProduct);
    setGrainChangeModal(null);
  }

  function buildBody() {
    return {
      tipoRegistro: form.tipoRegistro || 'Siembra',
      siembraOriginalId: form.tipoRegistro === 'Resiembra' && form.siembraOriginalId !== '' ? Number(form.siembraOriginalId) : null,
      tipoResiembra: form.tipoRegistro === 'Resiembra' ? form.tipoResiembra : null,
      siniestro: form.tipoRegistro === 'Resiembra' ? form.siniestro || null : null,
      loteId: Number(form.loteId),
      campaniaNombre: selectedCampaniaName || form.campaniaNombre || null,
      producto: form.producto,
      empresa: selectedEmpresaName || form.empresa || null,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      variedadSemilla: form.variedadSemilla || null,
      pmg: form.pmg === '' ? null : Number(form.pmg),
      densidadSiembra: form.densidadSiembra === '' ? null : Number(form.densidadSiembra),
      profundidad: form.profundidad === '' ? null : Number(form.profundidad),
      cantidadHectareasTrabajadas: form.cantidadHectareasTrabajadas === '' ? null : Number(form.cantidadHectareasTrabajadas),
      ureaKgHa: form.ureaKgHa === '' ? null : Number(form.ureaKgHa),
      cantidadSemillas: form.cantidadSemillas === '' ? null : Number(form.cantidadSemillas),
      responsableACargo: form.responsableACargo || null,
      fechaMuestreo: form.fechaMuestreo || null,
      fechaAnalisis: form.fechaAnalisis || null,
      cantidadMuestras: form.cantidadMuestras === '' ? null : Number(form.cantidadMuestras),
      productoAntecesor: form.productoAntecesor || null,
      observacionesPreSiembra: form.observacionesPreSiembra || null
    };
  }

  async function handleGuardar() {
    setSaving(true);
    setError('');
    try {
      if (selectedSiembra) {
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(buildBody())
        });
        if (!response.ok) throw new Error(`al guardar los cambios (status ${response.status}): ${await response.text()}`);
        if (pendingGrainChange) await updatePlannedGrain(pendingGrainChange.loteId, pendingGrainChange.producto);
        goToList();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/siembras`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(buildBody())
      });
      if (!response.ok) throw new Error(`al crear la siembra (status ${response.status}): ${await response.text()}`);
      const nuevaSiembra = await response.json();
      const siembraId = nuevaSiembra.siembraId;

      for (const insumo of insumos) {
        const res = await fetch(`${API_BASE_URL}/api/siembras/${siembraId}/insumos`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            fechaAplicacion: insumo.fechaAplicacion || null,
            marca: insumo.marca || null,
            tipo: insumo.tipo || null,
            variedad: insumo.variedad || null,
            cantidadAplicada: insumo.cantidadAplicada === '' ? null : Number(insumo.cantidadAplicada),
            unidadMedida: insumo.unidadMedida || null
          })
        });
        if (!res.ok) throw new Error(`al agregar el insumo "${insumo.marca}" (status ${res.status}): ${await res.text()}`);
      }

      for (const documento of documentos) {
        const formData = new FormData();
        formData.append('archivo', documento.file);
        const res = await fetch(`${API_BASE_URL}/api/siembras/${siembraId}/documentos`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData
        });
        if (!res.ok) throw new Error(`al subir el documento "${documento.nombreArchivo}" (status ${res.status}): ${await res.text()}`);
      }

      if (pendingGrainChange) await updatePlannedGrain(pendingGrainChange.loteId, pendingGrainChange.producto);

      goToList();
    } catch (err) {
      setError(`No se pudo guardar la siembra: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalizarSiembra() {
    setError('');
    const fechaInicio = form.fechaInicio;
    const fechaFinReal = form.fechaFinReal;
    const diasDesvio = form.fechaFin && fechaFinReal
      ? Math.abs((new Date(fechaFinReal) - new Date(form.fechaFin)) / 86400000)
      : 0;

    if (!fechaFinReal) {
      setError('La Fecha real de finalizacion es obligatoria.');
      return;
    }

    if (fechaInicio && fechaFinReal < fechaInicio) {
      setError('La Fecha real de finalizacion no puede ser anterior a la Fecha de Inicio.');
      return;
    }

    if (fechaFinReal < OPERATION_DATE_MIN || fechaFinReal > OPERATION_DATE_MAX) {
      setError(`La Fecha real de finalizacion debe estar entre ${formatDateInputLabel(OPERATION_DATE_MIN)} y ${formatDateInputLabel(OPERATION_DATE_MAX)}.`);
      return;
    }

    if (Number(form.hectareasHora) <= 0) {
      setError('Las Hectareas hora deben ser mayores a cero.');
      return;
    }

    if (diasDesvio > DIAS_DESVIO_REQUIERE_JUSTIFICACION && !form.justificacionDesvioFin.trim()) {
      setError('La fecha real se aleja mas de 3 dias de la fecha tentativa. Debes registrar una justificacion.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/finalizar`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          fechaFinReal: form.fechaFinReal,
          justificacionDesvioFin: form.justificacionDesvioFin || null,
          hectareasHora: Number(form.hectareasHora)
        })
      });
      if (!response.ok) throw new Error(await response.text());
      goToList();
    } catch (err) {
      setError(`No se pudo finalizar la siembra: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAgregarInsumo(event) {
    event.preventDefault();
    if (!Number.isFinite(Number(insumoForm.cantidadAplicada)) || Number(insumoForm.cantidadAplicada) <= 0) {
      setError('La Cantidad aplicada debe ser mayor a cero.');
      return;
    }

    if (selectedSiembra) {
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/insumos`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            fechaAplicacion: insumoForm.fechaAplicacion || null,
            marca: insumoForm.marca || null,
            tipo: insumoForm.tipo || null,
            variedad: insumoForm.variedad || null,
            cantidadAplicada: insumoForm.cantidadAplicada === '' ? null : Number(insumoForm.cantidadAplicada),
            unidadMedida: insumoForm.unidadMedida || null
          })
        });
        if (!response.ok) throw new Error(await response.text());
        setInsumoForm(emptyInsumoForm);
        await loadSubItems(selectedSiembra.siembraId);
      } catch (err) {
        setError(`No se pudo agregar el insumo: ${err.message}`);
      }
      return;
    }

    setInsumos((current) => [...current, { tempId: nextTempId(), ...insumoForm }]);
    setInsumoForm(emptyInsumoForm);
  }

  async function handleEliminarInsumo(insumo) {
    if (selectedSiembra) {
      try {
        await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/insumos/${insumo.siembraInsumoId}`, {
          method: 'DELETE',
          headers: authHeaders()
        });
        await loadSubItems(selectedSiembra.siembraId);
      } catch (err) {
        setError(`No se pudo eliminar el insumo: ${err.message}`);
      }
      return;
    }

    setInsumos((current) => current.filter((i) => i.tempId !== insumo.tempId));
  }

  async function handleSubirDocumento(file) {
    if (!file) return;

    if (selectedSiembra) {
      try {
        const formData = new FormData();
        formData.append('archivo', file);
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/documentos`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData
        });
        if (!response.ok) throw new Error(await response.text());
        await loadSubItems(selectedSiembra.siembraId);
      } catch (err) {
        setError(`No se pudo subir el archivo: ${err.message}`);
      }
      return;
    }

    setDocumentos((current) => [...current, { tempId: nextTempId(), file, nombreArchivo: file.name }]);
  }

  async function handleEliminarDocumento(documento) {
    if (selectedSiembra) {
      try {
        await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/documentos/${documento.siembraDocumentoId}`, {
          method: 'DELETE',
          headers: authHeaders()
        });
        await loadSubItems(selectedSiembra.siembraId);
      } catch (err) {
        setError(`No se pudo eliminar el archivo: ${err.message}`);
      }
      return;
    }

    setDocumentos((current) => current.filter((d) => d.tempId !== documento.tempId));
  }

  async function handleDescargarDocumento(documento) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/documentos/${documento.siembraDocumentoId}/descargar`,
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

  // ---------- Seguimiento de Siembra ----------

  async function loadSeguimientos(siembraId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/siembras/${siembraId}/seguimientos`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      setSeguimientos(await response.json());
    } catch (err) {
      setError(`No se pudieron cargar las recorridas: ${err.message}`);
    }
  }

  async function loadSeguimientoSubItems(siembraId, seguimientoId) {
    try {
      const [insRes, docRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/siembras/${siembraId}/seguimientos/${seguimientoId}/insumos`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/api/siembras/${siembraId}/seguimientos/${seguimientoId}/documentos`, { headers: authHeaders() })
      ]);
      setSeguimientoInsumos(insRes.ok ? await insRes.json() : []);
      setSeguimientoDocumentos(docRes.ok ? await docRes.json() : []);
    } catch (err) {
      setError(`No se pudo cargar la informacion de la recorrida: ${err.message}`);
    }
  }

  async function openHistorialSeguimiento(siembra) {
    setSelectedSiembra(siembra);
    setError('');
    await loadSeguimientos(siembra.siembraId);
    setView('seguimientoHistorial');
  }

  function handleOpenSeguimiento(siembra) {
    if ((siembra.estadoSiembra || 'En curso') !== 'Finalizado') {
      setSeguimientoBloqueadoSiembra(siembra);
      return;
    }

    openHistorialSeguimiento(siembra);
  }

  function backFromHistorialSeguimiento() {
    setView('list');
    setSelectedSiembra(null);
    setError('');
    loadSiembras();
  }

  function openNuevoSeguimiento(siembra) {
    setSelectedSiembra(siembra);
    setActiveSeguimientoId(null);
    setSeguimientoForm(getEmptySeguimientoForm());
    setSeguimientoInsumoForm(emptyInsumoForm);
    setSeguimientoInsumos([]);
    setSeguimientoDocumentos([]);
    setError('');
    setView('seguimientoForm');
  }

  async function openEditarSeguimiento(siembra, seguimiento) {
    setSelectedSiembra(siembra);
    setActiveSeguimientoId(seguimiento.siembraSeguimientoId);
    setSeguimientoForm({
      fecha: toDateInput(seguimiento.fecha),
      longitud: seguimiento.longitud ?? '',
      latitud: seguimiento.latitud ?? '',
      incidencia: seguimiento.incidencia || '',
      perdidaEconomica: seguimiento.perdidaEconomica === null || seguimiento.perdidaEconomica === undefined ? '' : (seguimiento.perdidaEconomica ? 'Si' : 'No'),
      aplicacionAgroquimicos: seguimiento.aplicacionAgroquimicos === null || seguimiento.aplicacionAgroquimicos === undefined ? '' : (seguimiento.aplicacionAgroquimicos ? 'Si' : 'No'),
      observaciones: seguimiento.observaciones || ''
    });
    setSeguimientoInsumoForm(emptyInsumoForm);
    setError('');
    await loadSeguimientoSubItems(siembra.siembraId, seguimiento.siembraSeguimientoId);
    setView('seguimientoForm');
  }

  function backFromSeguimientoForm() {
    setView('seguimientoHistorial');
    setError('');
    if (selectedSiembra) loadSeguimientos(selectedSiembra.siembraId);
  }

  function updateSeguimientoField(field, value) {
    setSeguimientoForm((current) => ({ ...current, [field]: value }));
  }

  function handlePickPuntoMapa(latlng) {
    setSeguimientoForm((current) => ({
      ...current,
      latitud: latlng.lat.toFixed(6),
      longitud: latlng.lng.toFixed(6)
    }));
  }

  async function handleGuardarSeguimiento(event) {
    event.preventDefault();
    setSeguimientoSaving(true);
    setError('');
    try {
      const body = {
        fecha: seguimientoForm.fecha ? new Date(`${seguimientoForm.fecha}T00:00:00`).toISOString() : null,
        longitud: seguimientoForm.longitud === '' ? null : Number(seguimientoForm.longitud),
        latitud: seguimientoForm.latitud === '' ? null : Number(seguimientoForm.latitud),
        incidencia: seguimientoForm.incidencia || null,
        perdidaEconomica: seguimientoForm.perdidaEconomica === '' ? null : seguimientoForm.perdidaEconomica === 'Si',
        aplicacionAgroquimicos: seguimientoForm.aplicacionAgroquimicos === '' ? null : seguimientoForm.aplicacionAgroquimicos === 'Si',
        observaciones: seguimientoForm.observaciones
      };

      if (activeSeguimientoId) {
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`al guardar la recorrida (status ${response.status}): ${await response.text()}`);
        backFromSeguimientoForm();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`al crear la recorrida (status ${response.status}): ${await response.text()}`);
      const nueva = await response.json();
      const seguimientoId = nueva.siembraSeguimientoId;

      for (const insumo of seguimientoInsumos) {
        const res = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${seguimientoId}/insumos`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            fechaAplicacion: insumo.fechaAplicacion || null,
            marca: insumo.marca || null,
            tipo: insumo.tipo || null,
            variedad: insumo.variedad || null,
            cantidadAplicada: insumo.cantidadAplicada === '' ? null : Number(insumo.cantidadAplicada)
          })
        });
        if (!res.ok) throw new Error(`al agregar el insumo "${insumo.marca || ''}" (status ${res.status}): ${await res.text()}`);
      }

      for (const documento of seguimientoDocumentos) {
        const formData = new FormData();
        formData.append('archivo', documento.file);
        const res = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${seguimientoId}/documentos`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData
        });
        if (!res.ok) throw new Error(`al subir el documento "${documento.nombreArchivo}" (status ${res.status}): ${await res.text()}`);
      }

      backFromSeguimientoForm();
    } catch (err) {
      setError(`No se pudo guardar la recorrida: ${err.message}`);
    } finally {
      setSeguimientoSaving(false);
    }
  }

  async function handleEliminarSeguimiento(seguimiento) {
    try {
      await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${seguimiento.siembraSeguimientoId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      await loadSeguimientos(selectedSiembra.siembraId);
    } catch (err) {
      setError(`No se pudo eliminar la recorrida: ${err.message}`);
    }
  }

  async function handleFinalizarSeguimiento() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/finalizar`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (!response.ok) throw new Error(await response.text());
      setSelectedSiembra((current) => (current ? { ...current, estado: 'Finalizado' } : current));
      await loadSeguimientos(selectedSiembra.siembraId);
    } catch (err) {
      setError(`No se pudo finalizar el seguimiento: ${err.message}`);
    }
  }

  async function handleAgregarSeguimientoInsumo(event) {
    event.preventDefault();

    if (activeSeguimientoId) {
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/insumos`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            fechaAplicacion: seguimientoInsumoForm.fechaAplicacion || null,
            marca: seguimientoInsumoForm.marca || null,
            tipo: seguimientoInsumoForm.tipo || null,
            variedad: seguimientoInsumoForm.variedad || null,
            cantidadAplicada: seguimientoInsumoForm.cantidadAplicada === '' ? null : Number(seguimientoInsumoForm.cantidadAplicada)
          })
        });
        if (!response.ok) throw new Error(await response.text());
        setSeguimientoInsumoForm(emptyInsumoForm);
        await loadSeguimientoSubItems(selectedSiembra.siembraId, activeSeguimientoId);
      } catch (err) {
        setError(`No se pudo agregar el insumo: ${err.message}`);
      }
      return;
    }

    setSeguimientoInsumos((current) => [...current, { tempId: nextTempId(), ...seguimientoInsumoForm }]);
    setSeguimientoInsumoForm(emptyInsumoForm);
  }

  async function handleEliminarSeguimientoInsumo(insumo) {
    if (activeSeguimientoId) {
      try {
        await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/insumos/${insumo.seguimientoInsumoId}`, {
          method: 'DELETE',
          headers: authHeaders()
        });
        await loadSeguimientoSubItems(selectedSiembra.siembraId, activeSeguimientoId);
      } catch (err) {
        setError(`No se pudo eliminar el insumo: ${err.message}`);
      }
      return;
    }

    setSeguimientoInsumos((current) => current.filter((i) => i.tempId !== insumo.tempId));
  }

  async function handleSubirSeguimientoDocumento(file) {
    if (!file) return;

    if (activeSeguimientoId) {
      try {
        const formData = new FormData();
        formData.append('archivo', file);
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/documentos`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData
        });
        if (!response.ok) throw new Error(await response.text());
        await loadSeguimientoSubItems(selectedSiembra.siembraId, activeSeguimientoId);
      } catch (err) {
        setError(`No se pudo subir el archivo: ${err.message}`);
      }
      return;
    }

    setSeguimientoDocumentos((current) => [...current, { tempId: nextTempId(), file, nombreArchivo: file.name }]);
  }

  async function handleEliminarSeguimientoDocumento(documento) {
    if (activeSeguimientoId) {
      try {
        await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/documentos/${documento.seguimientoDocumentoId}`, {
          method: 'DELETE',
          headers: authHeaders()
        });
        await loadSeguimientoSubItems(selectedSiembra.siembraId, activeSeguimientoId);
      } catch (err) {
        setError(`No se pudo eliminar el archivo: ${err.message}`);
      }
      return;
    }

    setSeguimientoDocumentos((current) => current.filter((d) => d.tempId !== documento.tempId));
  }

  async function handleDescargarSeguimientoDocumento(documento, seguimientoId) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${seguimientoId}/documentos/${documento.seguimientoDocumentoId}/descargar`,
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

  async function openDetalleSeguimiento(seguimiento) {
    setSeguimientoDetalle(seguimiento);
    setError('');
    await loadSeguimientoSubItems(selectedSiembra.siembraId, seguimiento.siembraSeguimientoId);
    setView('seguimientoDetalle');
  }

  function backFromDetalleSeguimiento() {
    setView('seguimientoHistorial');
    setSeguimientoDetalle(null);
    setError('');
    if (selectedSiembra) loadSeguimientos(selectedSiembra.siembraId);
  }

  if (view === 'create' || view === 'edit') {
    return (
      <>
        <SiembraForm
          modoEdicion={view === 'edit'}
          nombre={selectedSiembra?.nombre}
          estado={selectedSiembra?.estado}
          lotes={lotes ?? []}
          siembras={siembras}
          selectedCampania={selectedCampania}
          selectedCampaniaCombinaciones={selectedCampaniaCombinaciones}
          selectedEmpresaName={selectedEmpresaName}
          selectedCampaniaName={selectedCampaniaName}
          usuarios={usuarios}
          form={form}
          insumoForm={insumoForm}
          insumos={insumos}
          documentos={documentos}
          saving={saving}
          error={error}
          onFieldChange={updateField}
          onRequestGrainChange={(payload) => setGrainChangeModal(payload)}
          onInsumoFieldChange={(field, value) => setInsumoForm((current) => ({ ...current, [field]: value }))}
          onGuardar={handleGuardar}
          onAgregarInsumo={handleAgregarInsumo}
          onEliminarInsumo={handleEliminarInsumo}
          onSubirDocumento={handleSubirDocumento}
          onDescargarDocumento={handleDescargarDocumento}
          onEliminarDocumento={handleEliminarDocumento}
          onBack={goToList}
        />
        {grainChangeModal && (
          <GrainChangeModal
            change={grainChangeModal}
            saving={saving}
            onCancel={() => setGrainChangeModal(null)}
            onConfirm={confirmGrainChange}
          />
        )}
      </>
    );
  }

  if (view === 'detail') {
    return (
      <SiembraDetalle
        siembra={selectedSiembra}
        insumos={insumos}
        documentos={documentos}
        onDescargarDocumento={handleDescargarDocumento}
        onBack={goToList}
      />
    );
  }

  if (view === 'seguimientoHistorial') {
    return (
      <SeguimientoHistorialList
        siembra={selectedSiembra}
        seguimientos={seguimientos}
        error={error}
        onNuevo={() => openNuevoSeguimiento(selectedSiembra)}
        onVer={openDetalleSeguimiento}
        onEditar={(seguimiento) => openEditarSeguimiento(selectedSiembra, seguimiento)}
        onEliminar={handleEliminarSeguimiento}
        onFinalizar={handleFinalizarSeguimiento}
        onBack={backFromHistorialSeguimiento}
      />
    );
  }

  if (view === 'seguimientoForm') {
    const loteDeSiembra = lotes?.find((l) => String(l.loteId) === String(selectedSiembra?.loteId));
    return (
      <SeguimientoForm
        siembra={selectedSiembra}
        lotePoligono={loteDeSiembra?.coordenadas ?? []}
        modoEdicion={Boolean(activeSeguimientoId)}
        seguimientoForm={seguimientoForm}
        insumoForm={seguimientoInsumoForm}
        insumos={seguimientoInsumos}
        documentos={seguimientoDocumentos}
        saving={seguimientoSaving}
        error={error}
        onFieldChange={updateSeguimientoField}
        onPickPunto={handlePickPuntoMapa}
        onGuardar={handleGuardarSeguimiento}
        onInsumoFieldChange={(field, value) => setSeguimientoInsumoForm((current) => ({ ...current, [field]: value }))}
        onAgregarInsumo={handleAgregarSeguimientoInsumo}
        onEliminarInsumo={handleEliminarSeguimientoInsumo}
        onSubirDocumento={handleSubirSeguimientoDocumento}
        onDescargarDocumento={(doc) => handleDescargarSeguimientoDocumento(doc, activeSeguimientoId)}
        onEliminarDocumento={handleEliminarSeguimientoDocumento}
        onBack={backFromSeguimientoForm}
      />
    );
  }

  if (view === 'seguimientoDetalle') {
    const loteDeSiembra = lotes?.find((l) => String(l.loteId) === String(selectedSiembra?.loteId));
    return (
      <SeguimientoDetalle
        siembra={selectedSiembra}
        lotePoligono={loteDeSiembra?.coordenadas ?? []}
        seguimiento={seguimientoDetalle}
        insumos={seguimientoInsumos}
        documentos={seguimientoDocumentos}
        onDescargarDocumento={(doc) => handleDescargarSeguimientoDocumento(doc, seguimientoDetalle.siembraSeguimientoId)}
        onBack={backFromDetalleSeguimiento}
      />
    );
  }

  return (
    <>
      {view === 'finalizar' && (
        <FinalizarSiembra siembra={selectedSiembra} form={form} saving={saving} error={error}
          onFieldChange={updateField} onFinalizar={handleFinalizarSiembra} onBack={goToList} />
      )}
      <SiembrasList
        siembras={siembras}
        parentFilters={parentFilters}
        selectedEmpresaName={selectedEmpresaName}
        selectedCampaniaName={selectedCampaniaName}
        loading={loading}
        error={error}
        onAdd={startCreate}
        onEdit={openEdit}
        onView={openDetail}
        onSeguimiento={handleOpenSeguimiento}
        onFinalize={openFinalizarSiembra}
      />
      {seguimientoBloqueadoSiembra && (
        <SeguimientoBloqueadoModal
          siembra={seguimientoBloqueadoSiembra}
          onClose={() => setSeguimientoBloqueadoSiembra(null)}
        />
      )}
    </>
  );
}

function SiembrasList({ siembras, parentFilters, selectedEmpresaName, selectedCampaniaName, loading, error, onAdd, onEdit, onView, onSeguimiento, onFinalize }) {
  const [query, setQuery] = useState('');
  const [productoFilter, setProductoFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [mostrarMasFiltros, setMostrarMasFiltros] = useState(false);
  const [selected, setSelected] = useState({});

  const productoOptions = useMemo(
    () => [...new Set(siembras.map((s) => s.producto).filter(Boolean))],
    [siembras]
  );

  const resiembrasPorOriginal = useMemo(() => siembras.reduce((acc, siembra) => {
    if (siembra.tipoRegistro === 'Resiembra' && siembra.siembraOriginalId) {
      acc[String(siembra.siembraOriginalId)] = siembra;
    }
    return acc;
  }, {}), [siembras]);

  function getResiembraLabel(siembra) {
    if (siembra.tipoRegistro === 'Resiembra') {
      return `Resiembra ${siembra.tipoResiembra || ''}`.trim();
    }

    return resiembrasPorOriginal[String(siembra.siembraId)] ? 'Si' : 'No';
  }

  function getSiniestroLabel(siembra) {
    if (siembra.siniestro) return siembra.siniestro;
    return resiembrasPorOriginal[String(siembra.siembraId)]?.siniestro || '-';
  }

  const filtered = useMemo(() => siembras.filter((s) => {
    const texto = normalizeSearchText(query.trim());
    const camposBusqueda = [
      s.nombre,
      s.campaniaNombre,
      s.producto,
      s.loteNombre,
      getResiembraLabel(s),
      s.siniestro,
      s.estadoSiembra,
      s.estado,
      String(s.cantidadHectareasTrabajadas ?? ''),
      formatNumber(s.cantidadHectareasTrabajadas, ' ha')
    ];
    const matchesQuery = !texto || camposBusqueda.some(
      (campo) => normalizeSearchText(campo ?? '').includes(texto)
    );
    const matchesGrano = !productoFilter || s.producto === productoFilter;
    const matchesEstado = !estadoFilter || s.estadoSiembra === estadoFilter;
    const matchesEmpresa = !selectedEmpresaName || normalizeSearchText(s.empresa || '') === normalizeSearchText(selectedEmpresaName);
    const matchesCampania = !selectedCampaniaName || normalizeSearchText(s.campaniaNombre || '') === normalizeSearchText(selectedCampaniaName);
    const fecha = toDateInput(s.fechaInicio);
    const matchesFecha = (!fechaDesde || fecha >= fechaDesde) && (!fechaHasta || (fecha && fecha <= fechaHasta));
    return matchesQuery && matchesGrano && matchesEstado && matchesEmpresa && matchesCampania && matchesFecha;
  }), [siembras, query, productoFilter, estadoFilter, fechaDesde, fechaHasta, resiembrasPorOriginal, selectedEmpresaName, selectedCampaniaName]);

  const productividadPromedio = useMemo(() => {
    const registros = filtered.filter((s) => (s.estadoSiembra || 'En curso') === 'Finalizado' && Number(s.hectareasHora) > 0);
    if (registros.length === 0) return null;
    const total = registros.reduce((acc, siembra) => acc + Number(siembra.hectareasHora || 0), 0);
    return total / registros.length;
  }, [filtered]);

  function clearFilters() {
    setQuery('');
    setProductoFilter('');
    setEstadoFilter('');
    setFechaDesde('');
    setFechaHasta('');
  }

  const hayFilasSeleccionadas = Object.values(selected).some(Boolean);
  const hayFiltrosTabla = Boolean(query.trim() || productoFilter || estadoFilter || fechaDesde || fechaHasta);

  function toggleSeleccion(siembraId) {
    setSelected((current) => ({ ...current, [siembraId]: !current[siembraId] }));
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Siembras</h1>
          <p>Registra y hace seguimiento de cada tarea de siembra.</p>
        </div>
        <button className="green-button add-lote-button" type="button" onClick={onAdd}>
          <PlusCircle size={18} />
          <span>Registrar Siembra</span>
        </button>
      </div>
      {parentFilters}

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="summary-grid">
        <article className="summary-card">
          <div className="summary-icon"><Gauge size={28} /></div>
          <div>
            <span>Productividad promedio</span>
            <strong>{formatNumber(productividadPromedio, ' ha/h')}</strong>
            <small>Calculado sobre siembras finalizadas</small>
          </div>
        </article>
      </div>

      <div className="filters-card">
        <label className="search-field">
          <Search size={21} />
          <input data-text-case="preserve" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cualquier dato de la siembra..." />
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
        <button className="soft-filter-button" type="button" aria-expanded={mostrarMasFiltros} aria-controls="siembras-fechas-filtros" onClick={() => setMostrarMasFiltros((actual) => !actual)}>
          <Filter size={17} />
          <span>Mas filtros</span>
        </button>
        <button className="clear-button" type="button" onClick={clearFilters}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
        {mostrarMasFiltros && <fieldset id="siembras-fechas-filtros" className="siembras-date-filter">
          <legend>Fecha de inicio</legend>
          <label className="field">Desde
            <input type="date" value={fechaDesde} max={fechaHasta || undefined} onChange={(event) => setFechaDesde(event.target.value)} />
          </label>
          <label className="field">Hasta
            <input type="date" value={fechaHasta} min={fechaDesde || undefined} onChange={(event) => setFechaHasta(event.target.value)} />
          </label>
          {fechaDesde && fechaHasta && fechaDesde > fechaHasta && <span className="field-error">La fecha Hasta no puede ser anterior a Desde.</span>}
        </fieldset>}
      </div>

      {loading ? (
        <div className="table-shell dashboard-card">
          <div className="loading-state">
            <LoaderCircle className="spin" size={24} />
            <span>Cargando siembras...</span>
          </div>
        </div>
      ) : siembras.length === 0 ? (
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Sprout size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Aun no tenes siembras registradas</h2>
            <p>Registra tu primera siembra para empezar a hacerle seguimiento.</p>
          </div>
          <button className="green-button empty-state-action" type="button" onClick={onAdd}>
            <PlusCircle size={18} />
            <span>Registrar Siembra</span>
          </button>
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty-state dashboard-card empty-state-compact">
          <div className="empty-state-icon"><Search size={82} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>{hayFiltrosTabla ? 'No hay siembras para esos filtros' : 'No hay siembras para la empresa o campaña seleccionada'}</h2>
            <p>{hayFiltrosTabla ? 'Limpia los filtros para volver a ver los registros disponibles.' : 'Cambia la empresa o campaña desde los filtros superiores.'}</p>
          </div>
          {hayFiltrosTabla && (
            <button className="green-button empty-state-action" type="button" onClick={clearFilters}>
              <RotateCcw size={18} />
              <span>Limpiar filtros</span>
            </button>
          )}
          {!hayFiltrosTabla && (
            <button className="green-button empty-state-action" type="button" onClick={onAdd}>
              <PlusCircle size={18} />
              <span>Registrar Siembra</span>
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
                <th>Fecha de fin</th>
                <th>Grano</th>
                <th>Lote</th>
                <th>Resiembra</th>
                <th>Siniestro</th>
                <th>Hectáreas</th>
                <th>Hectareas hora</th>
                <th>Seguimiento</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((siembra) => (
                <tr key={siembra.siembraId}>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[siembra.siembraId])}
                      onChange={() => toggleSeleccion(siembra.siembraId)}
                    />
                  </td>
                  <td>{siembra.nombre}</td>
                  <td>{formatFecha(siembra.fechaInicio)}</td>
                  <td>{siembra.fechaFinReal ? formatFecha(siembra.fechaFinReal) : '—'}</td>
                  <td>{siembra.producto}</td>
                  <td>{siembra.loteNombre}</td>
                  <td><ResiembraChip value={getResiembraLabel(siembra)} /></td>
                  <td>{getSiniestroLabel(siembra)}</td>
                  <td>{formatNumber(siembra.cantidadHectareasTrabajadas, ' ha')}</td>
                  <td>{formatNumber(siembra.hectareasHora, ' ha/h')}</td>
                  <td><SeguimientoEstadoChip estado={siembra.estado} /></td>
                  <td><EstadoSiembraButton estado={siembra.estadoSiembra || 'En curso'} onFinalize={() => onFinalize(siembra)} /></td>
                  <td className="actions-cell">
                    <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar ${siembra.nombre}`} onClick={() => onEdit(siembra)}><Edit size={18} /></button>
                    <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label={`Ver ${siembra.nombre}`} onClick={() => onView(siembra)}><Eye size={18} /></button>
                    <button className="table-action-tooltip" data-tooltip="Seguimiento" type="button" aria-label={`Seguimiento de ${siembra.nombre}`} onClick={() => onSeguimiento(siembra)}><Route size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hayFilasSeleccionadas && (
            <div className="form-actions" style={{ justifyContent: 'flex-end', padding: '12px 16px' }}>
              <button className="green-button" type="button">
                Exportar Registros
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ResiembraChip({ value }) {
  const esNo = value === 'No';
  const esSi = value === 'Si';
  const className = [
    'resiembra-chip',
    esNo ? 'resiembra-chip-no' : '',
    esSi ? 'resiembra-chip-si' : '',
    !esNo && !esSi ? 'resiembra-chip-registro' : ''
  ].filter(Boolean).join(' ');

  return <span className={className}>{value}</span>;
}

function SeguimientoBloqueadoModal({ siembra, onClose }) {
  return (
    <div className="cosecha-warning-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="seguimiento-bloqueado-title">
      <div className="cosecha-warning-modal seguimiento-warning-modal">
        <div className="login-icon">
          <AlertTriangle size={25} />
        </div>
        <div>
          <h2 id="seguimiento-bloqueado-title">Primero finaliza la siembra</h2>
          <p>
            Para registrar seguimientos de {siembra.nombre}, la siembra debe estar finalizada.
            El seguimiento corresponde al cultivo ya implantado, no al proceso de sembrado.
          </p>
        </div>
        <div className="form-actions modal-actions">
          <button className="green-button" type="button" onClick={onClose}>Entendido</button>
        </div>
      </div>
    </div>
  );
}

function GrainChangeModal({ change, saving, onCancel, onConfirm }) {
  const initialProduct = change.nextProduct || '';
  const [grainMode, setGrainMode] = useState(
    GRANOS_PLANIFICABLES.includes(initialProduct) ? initialProduct : initialProduct ? 'Otro' : ''
  );
  const [nextProduct, setNextProduct] = useState(
    GRANOS_PLANIFICABLES.includes(initialProduct) ? initialProduct : initialProduct
  );

  function handleGrainModeChange(value) {
    setGrainMode(value);
    setNextProduct(value === 'Otro' ? '' : value);
  }

  return (
    <div className="cosecha-warning-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="grain-change-title">
      <div className="cosecha-warning-modal grain-change-modal">
        <div className="modal-heading">
          <div className="campaign-period-icon"><AlertTriangle size={24} /></div>
          <div>
            <h2 id="grain-change-title">Cambiar grano planificado</h2>
            <p>
              En la planificacion de campaña para {change.loteNombre} se eligio {change.currentProduct}.
              Al finalizar el registro de esta siembra, el cambio se actualizara tambien en Campañas y en Lotes.
            </p>
          </div>
        </div>
        <label className="field">
          Nuevo grano
          <select value={grainMode} onChange={(event) => handleGrainModeChange(event.target.value)}>
            <option value="">Seleccionar</option>
            {GRANOS_PLANIFICABLES.map((grain) => <option key={grain} value={grain}>{grain}</option>)}
          </select>
        </label>
        {grainMode === 'Otro' && (
          <label className="field">
            Otro grano
            <input maxLength={10} value={nextProduct} onChange={(event) => setNextProduct(event.target.value.slice(0, 10))} placeholder="Max. 10 caracteres" />
          </label>
        )}
        <div className="modal-actions">
          <button className="green-button" type="button" disabled={saving || !nextProduct.trim()} onClick={() => onConfirm(nextProduct.trim())}>
            {saving ? <LoaderCircle className="spin-icon" size={17} /> : <CheckCircle2 size={17} />}
            Confirmar cambio
          </button>
          <button className="back-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function SeguimientoEstadoChip({ estado }) {
  const normalized = estado || 'Pendiente';
  const className = [
    'seguimiento-status-chip',
    normalized === 'Pendiente' ? 'seguimiento-status-pending' : '',
    normalized === 'En curso' ? 'seguimiento-status-active' : '',
    normalized === 'Finalizado' ? 'seguimiento-status-done' : ''
  ].filter(Boolean).join(' ');

  return (
    <span className={className}>
      <span aria-hidden="true" />
      {normalized}
    </span>
  );
}

function EstadoSiembraButton({ estado, onFinalize }) {
  const finalizada = estado === 'Finalizado';

  if (finalizada) {
    return <span className="siembra-state-pill siembra-state-done">Finalizado</span>;
  }

  return (
    <button className="siembra-state-button" type="button" onClick={onFinalize} title="Finalizar siembra">
      <span className="state-label-current">En curso</span>
      <span className="state-label-action">Finalizar</span>
    </button>
  );
}

function FinalizarSiembra({ siembra, form, saving, error, onFieldChange, onFinalizar, onBack }) {
  const diasDesvio = form.fechaFin && form.fechaFinReal
    ? Math.abs((new Date(form.fechaFinReal) - new Date(form.fechaFin)) / 86400000)
    : 0;
  const requiereJustificacion = diasDesvio > DIAS_DESVIO_REQUIERE_JUSTIFICACION;
  const fechaRealMinima = form.fechaInicio || OPERATION_DATE_MIN;
  const fechaRealMaxima = OPERATION_DATE_MAX;

  return (
    <div className="cosecha-warning-modal-backdrop" role="dialog" aria-modal="true" aria-label="Finalizar siembra"><section className="cosecha-warning-modal siembra-finalizar-modal">
      <div className="page-heading create-heading">
        <div>
          <h1>Finalizar Siembra</h1>
          <p>{siembra?.nombre} - registra el cierre real del proceso de siembra.</p>
        </div>
      </div>
      

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">Fecha de Inicio<input readOnly value={formatFecha(siembra?.fechaInicio)} /></label>
          <label className="field">Fecha tentativa de Fin<input readOnly value={formatFecha(siembra?.fechaFin)} /></label>
          <label className="field">Grano<input readOnly value={siembra?.producto || '-'} /></label>
          <label className="field">Lote<input readOnly value={siembra?.loteNombre || '-'} /></label>
          <label className="field">Campaña<input readOnly value={siembra?.campaniaNombre || '-'} /></label>
          <label className="field">Empresa<input readOnly value={siembra?.empresa || '-'} /></label>
        </div>
      </div>

      <h2>Cierre de siembra</h2>
      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">
            Fecha real de finalizacion <b>*</b>
            <input autoFocus type="date" min={fechaRealMinima} max={fechaRealMaxima} required value={form.fechaFinReal} onChange={(e) => onFieldChange('fechaFinReal', e.target.value)} />
          </label>
          <label className="field">
            Hectareas por hora promedio <b>*</b>
            <input type="number" min="0" step="0.01" required value={form.hectareasHora} onChange={(e) => onFieldChange('hectareasHora', e.target.value)} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>Productividad operativa registrada para este lote.</span>
          </label>
          {requiereJustificacion && (
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              Justificacion del desvio <b>*</b>
              <textarea value={form.justificacionDesvioFin} onChange={(e) => onFieldChange('justificacionDesvioFin', e.target.value)} placeholder="Explica por que la fecha real se alejo de la fecha tentativa." />
            </label>
          )}
        </div>
      </div>

      <div className="form-actions">
        <button className="green-button" type="button" disabled={saving} onClick={onFinalizar}>
          <CheckCircle2 size={17} />
          {saving ? 'Finalizando...' : 'Finalizar siembra'}
        </button>
        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
      </div>
    </section></div>
  );
}

function SiembraForm({
  modoEdicion,
  nombre,
  estado,
  lotes,
  siembras,
  selectedCampania,
  selectedCampaniaCombinaciones,
  selectedEmpresaName,
  selectedCampaniaName,
  usuarios,
  form,
  insumoForm,
  insumos,
  documentos,
  saving,
  error,
  onFieldChange,
  onRequestGrainChange,
  onInsumoFieldChange,
  onGuardar,
  onAgregarInsumo,
  onEliminarInsumo,
  onSubirDocumento,
  onDescargarDocumento,
  onEliminarDocumento,
  onBack
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [pulverizoResiembra, setPulverizoResiembra] = useState(() => insumos.length > 0 ? 'si' : 'no');
  const mostrarAgroquimicos = form.tipoRegistro !== 'Resiembra' || pulverizoResiembra === 'si' || insumos.length > 0;
  const esResiembra = form.tipoRegistro === 'Resiembra';
  const campaniaActualNombre = selectedCampaniaName || form.campaniaNombre;
  const empresaActualNombre = selectedEmpresaName || form.empresa;
  const campaniaNormalizada = normalizeSearchText(campaniaActualNombre);
  const periodoCampania = campaniaActualNombre?.match(/^(\d{4})-\d{4}(?:\s|$)/);
  const fechaPreSiembraMinima = periodoCampania ? `${periodoCampania[1]}-01-01` : OPERATION_DATE_MIN;
  const fechaPreSiembraMaxima = form.fechaInicio || OPERATION_DATE_MAX;
  const siembraOriginalSeleccionada = siembras.find((siembra) => String(siembra.siembraId) === String(form.siembraOriginalId));
  const finCampania = campaniaActualNombre?.match(/^\d{4}-(\d{4})(?:\s|$)/);
  const fechaFinMaxima = esResiembra && finCampania ? `${finCampania[1]}-12-31` : OPERATION_DATE_MAX;
  const finOriginal = toDateInput(siembraOriginalSeleccionada?.fechaFinReal);
  const fechaInicioMinima = esResiembra && finOriginal ? finOriginal : OPERATION_DATE_MIN;
  let fechaInicioMaxima = fechaFinMaxima;
  if (esResiembra && finOriginal) {
    const [year, month, day] = finOriginal.split('-').map(Number);
    const ultimoDia = new Date(Date.UTC(year, month - 1 + 5, 0)).getUTCDate();
    const limite = new Date(Date.UTC(year, month - 1 + 4, Math.min(day, ultimoDia))).toISOString().slice(0, 10);
    fechaInicioMaxima = limite < fechaFinMaxima ? limite : fechaFinMaxima;
  }
  const fechaInicioFueraDeRangoOperativo = Boolean(
    form.fechaInicio
    && (form.fechaInicio < fechaInicioMinima || form.fechaInicio > fechaInicioMaxima)
  );
  const fechaFinFueraDeRangoOperativo = Boolean(
    form.fechaFin
    && (form.fechaFin < fechaInicioMinima || form.fechaFin > fechaFinMaxima)
  );
  const fechaMuestreoFueraDeRangoOperativo = Boolean(
    form.fechaMuestreo
    && (form.fechaMuestreo < fechaPreSiembraMinima || form.fechaMuestreo > fechaPreSiembraMaxima)
  );
  const fechaAnalisisFueraDeRangoOperativo = Boolean(
    form.fechaAnalisis
    && (form.fechaAnalisis < fechaPreSiembraMinima || form.fechaAnalisis > fechaPreSiembraMaxima)
  );
  const fechaAnalisisAnteriorAMuestreo = Boolean(
    form.fechaMuestreo
    && form.fechaAnalisis
    && form.fechaAnalisis < form.fechaMuestreo
  );
  const fechaAplicacionPosteriorASiembra = Boolean(
    insumoForm.fechaAplicacion
    && form.fechaInicio
    && insumoForm.fechaAplicacion > form.fechaInicio
  );
  const canContinueStep2 = Boolean(
    (!esResiembra || pulverizoResiembra !== 'si' || insumos.length > 0)
    &&
    !fechaMuestreoFueraDeRangoOperativo
    && !fechaAnalisisFueraDeRangoOperativo
    && !fechaAnalisisAnteriorAMuestreo
    && (form.cantidadMuestras === '' || (Number.isInteger(Number(form.cantidadMuestras)) && Number(form.cantidadMuestras) >= 0))
  );
  const siembrasOriginalesDeCampania = siembras.filter((siembra) =>
    siembra.tipoRegistro !== 'Resiembra'
    && siembra.estadoSiembra === 'Finalizado' && siembra.estado === 'Finalizado'
    && (!esResiembra || (campaniaNormalizada && normalizeSearchText(siembra.campaniaNombre || '') === campaniaNormalizada))
  );
  const loteIdsReembrables = new Set(siembrasOriginalesDeCampania.map((siembra) => String(siembra.loteId)));
  const campaniaLoteIds = new Set(selectedCampaniaCombinaciones.map((item) => String(item.loteId)));
  const periodoActual = campaniaActualNombre?.match(/^\d{4}-\d{4}/)?.[0] || campaniaNormalizada;
  const lotesYaSembrados = new Set(siembras.filter((siembra) =>
    siembra.tipoRegistro !== 'Resiembra'
    && !(modoEdicion && siembra.nombre === nombre)
    && (siembra.campaniaNombre?.match(/^\d{4}-\d{4}/)?.[0] || normalizeSearchText(siembra.campaniaNombre || '')) === periodoActual
  ).map((siembra) => String(siembra.loteId)));
  const lotesYaResembrados = new Set(siembras.filter((siembra) =>
    siembra.tipoRegistro === 'Resiembra'
    && !(modoEdicion && siembra.nombre === nombre)
    && (siembra.campaniaNombre?.match(/^\d{4}-\d{4}/)?.[0] || normalizeSearchText(siembra.campaniaNombre || '')) === periodoActual
  ).map((siembra) => String(siembra.loteId)));
  const lotesDisponibles = esResiembra
    ? lotes.filter((lote) => loteIdsReembrables.has(String(lote.loteId)) && !lotesYaResembrados.has(String(lote.loteId)))
    : selectedCampaniaCombinaciones.length > 0
      ? lotes.filter((lote) => campaniaLoteIds.has(String(lote.loteId)) && !lotesYaSembrados.has(String(lote.loteId)))
      : [];

  const granoBloqueado = esResiembra && form.tipoResiembra === 'Parcial';
  const loteSeleccionado = lotes.find((lote) => String(lote.loteId) === String(form.loteId));
  const campaniaComboSeleccionada = selectedCampaniaCombinaciones.find((item) => String(item.loteId) === String(form.loteId));
  const plannedProduct = campaniaComboSeleccionada?.producto || '';
  const selectedUsuarioName = form.responsableACargo || 'Sin responsable';
  const canContinueStep1 = Boolean(
    form.tipoRegistro
    && form.fechaInicio
    && form.fechaFin
    && form.fechaFin >= form.fechaInicio
    && !fechaInicioFueraDeRangoOperativo
    && !fechaFinFueraDeRangoOperativo
    && form.loteId
    && (esResiembra || !lotesYaSembrados.has(String(form.loteId)))
    && (!esResiembra || !lotesYaResembrados.has(String(form.loteId)))
    && String(form.producto || '').trim()
    && (!esResiembra || (finOriginal && form.tipoResiembra && form.siniestro && form.siembraOriginalId))
  );
  const canContinueStep3 = Boolean(
    String(form.variedadSemilla || '').trim()
    && Number(form.pmg) > 0
    && Number(form.densidadSiembra) > 0
    && Number(form.profundidad) > 0
    && Number(form.cantidadHectareasTrabajadas) > 0
    && Number(form.cantidadSemillas) > 0
    && String(form.responsableACargo || '').trim()
  );
  const canRegister = Boolean(
    canContinueStep1
    && canContinueStep2
    && canContinueStep3
  );
  const steps = [
    { id: 1, title: 'Datos generales', subtitle: 'Informacion basica', icon: FileText },
    { id: 2, title: 'Pre-siembra y agroquimicos', subtitle: 'Muestreo y aplicaciones', icon: FlaskConical },
    { id: 3, title: 'Detalle de siembra', subtitle: 'Cultivo y superficie', icon: Sprout },
    { id: 4, title: 'Documentacion y revision', subtitle: 'Archivos y confirmacion', icon: ClipboardCheck }
  ];
  const stepTitles = {
    1: {
      title: 'Datos generales',
      description: 'Completa la informacion basica de la siembra. Estos datos identifican el registro y lo conectan con lote, campaña y empresa.'
    },
    2: {
      title: 'Pre-siembra y agroquimicos',
      description: 'Registra el muestreo de suelo, su analisis y los agroquimicos aplicados antes de la siembra.'
    },
    3: {
      title: 'Detalle de siembra',
      description: 'Carga los datos tecnicos del cultivo y la superficie trabajada para calcular semillas y conservar trazabilidad operativa.'
    },
    4: {
      title: 'Documentacion y revision',
      description: 'Adjunta archivos relevantes y revisa el resumen completo antes de guardar el registro.'
    }
  };
  const currentStepInfo = stepTitles[currentStep];

  function goNext() {
    if (currentStep === 1 && !canContinueStep1) return;
    if (currentStep === 2 && !canContinueStep2) return;
    if (currentStep === 3 && !canContinueStep3) return;
    setCurrentStep((step) => Math.min(step + 1, 4));
  }

  function goPrevious() {
    setCurrentStep((step) => Math.max(step - 1, 1));
  }

  function handleProductManualChange(value) {
    if (granoBloqueado) return;
    if (plannedProduct && normalizeSearchText(value) !== normalizeSearchText(plannedProduct)) {
      onRequestGrainChange?.({
        loteId: form.loteId,
        loteNombre: loteSeleccionado?.nombre || 'el lote seleccionado',
        currentProduct: plannedProduct,
        nextProduct: value || plannedProduct,
        campaniaNombre: campaniaActualNombre
      });
      return;
    }
    onFieldChange('producto', value);
  }

  function helpItemsForStep() {
    if (currentStep === 1) {
      return [
        { icon: FileText, title: 'Selecciona el tipo de registro', text: 'Para una nueva siembra, mantene Registrar siembra. Para resiembra se habilitan lote original, tipo y siniestro.' },
        { icon: CalendarDays, title: 'Defini el periodo', text: 'La fecha de fin no puede ser anterior al inicio.' },
        { icon: Map, title: 'Elegi lote y grano', text: 'Las hectareas del lote se completan automaticamente al seleccionar el lote.' },
        { icon: Building2, title: 'Empresa y campaña', text: 'Estos datos mantienen la siembra ordenada dentro del flujo productivo.' }
      ];
    }
    if (currentStep === 2) {
      return [
        { icon: FlaskConical, title: 'Muestreo y analisis', text: 'El muestreo puede realizarse desde el 1 de enero del primer año de campaña. El analisis no puede ser anterior al muestreo y ninguna de las dos fechas puede superar el inicio de siembra.' },
        { icon: Leaf, title: 'Agroquimicos aplicados', text: 'Registra cada aplicacion con su variedad, cantidad y unidad de medida.' },
        { icon: HelpCircle, title: 'Multiples registros', text: 'Podes agregar todos los agroquimicos que correspondan antes de continuar.' }
      ];
    }
    if (currentStep === 3) {
      return [
        { icon: Gauge, title: 'Cantidad de semillas', text: 'Se calcula con Densidad x Hectareas cultivables, y podes ajustar el valor si hace falta.' },
        { icon: Leaf, title: 'Verifica lote y grano', text: 'Estos datos afectan recomendaciones y estadisticas posteriores.' },
        { icon: UserRound, title: 'Responsable a cargo', text: 'Elegir responsable mejora la trazabilidad de la tarea.' }
      ];
    }
    return [
      { icon: CheckCircle2, title: 'Listo para registrar', text: 'Revisa cada bloque antes de confirmar el guardado.' },
      { icon: Info, title: 'Edicion disponible', text: 'Podes volver a pasos anteriores para corregir informacion.' },
      { icon: Save, title: 'Registro final', text: 'Al confirmar, la siembra queda guardada en el sistema.' }
    ];
  }

  function renderStepContent() {
    if (currentStep === 1) {
      return (
        <div className="siembra-step-card dashboard-card">
          <SectionTitle icon={FileText} title="Datos generales" description={currentStepInfo.description} />
          <div className="siembra-wizard-grid">
            <label className="field">
              Tipo de registro <b>*</b>
              <div className="status-segmented siembra-registration-type" role="group" aria-label="Tipo de registro">
                <button
                  className={form.tipoRegistro === 'Siembra' ? 'status-segmented-active' : ''}
                  type="button"
                  aria-pressed={form.tipoRegistro === 'Siembra'}
                  onClick={() => onFieldChange('tipoRegistro', 'Siembra')}
                >
                  Registrar siembra
                </button>
                <button
                  className={form.tipoRegistro === 'Resiembra' ? 'status-segmented-active' : ''}
                  type="button"
                  aria-pressed={form.tipoRegistro === 'Resiembra'}
                  onClick={() => onFieldChange('tipoRegistro', 'Resiembra')}
                >
                  Registrar resiembra
                </button>
              </div>
              <FieldRule>{SIEMBRA_FIELD_RULES.tipoRegistro}</FieldRule>
            </label>
            <label className="field">
              Nombre
              <input readOnly value={modoEdicion ? nombre : ''} placeholder="Se asigna automaticamente al guardar" />
              <FieldRule>{SIEMBRA_FIELD_RULES.nombre}</FieldRule>
            </label>
            <label className="field">
              Lote <b>*</b>
              <select required value={form.loteId} onChange={(e) => onFieldChange('loteId', e.target.value)}>
                <option value="">Seleccionar</option>
                {lotesDisponibles.map((lote) => (
                  <option key={lote.loteId} value={lote.loteId}>{lote.nombre}</option>
                ))}
              </select>
              {esResiembra && !campaniaNormalizada && <span className="field-hint">Primero indica la campaña para ver lotes ya sembrados.</span>}
              {esResiembra && <FieldRule>{SIEMBRA_FIELD_RULES.loteResiembra}</FieldRule>}
              {esResiembra && campaniaNormalizada && lotesDisponibles.length === 0 && <span className="field-error">No hay lotes disponibles: deben tener siembra y seguimiento finalizados y no contar con otra resiembra en este periodo.</span>}
              {esResiembra && lotesYaResembrados.has(String(form.loteId)) && <span className="field-error">Este lote ya tiene una resiembra registrada en este periodo.</span>}
              {!esResiembra && <FieldRule>{SIEMBRA_FIELD_RULES.loteSiembra}</FieldRule>}
              {!esResiembra && lotesYaSembrados.has(String(form.loteId)) && <span className="field-error">Este lote ya tiene una siembra en este periodo. Selecciona otro lote o registra una resiembra.</span>}
              {!esResiembra && selectedCampaniaCombinaciones.length === 0 && <span className="field-error">La campaña seleccionada no tiene lotes planificados para sembrar.</span>}
            </label>
            {esResiembra && (
<label className="field">
                  Siembra original
                  <input readOnly value={siembraOriginalSeleccionada?.nombre || 'Se completa al elegir el lote'} />
                  <FieldRule>{SIEMBRA_FIELD_RULES.siembraOriginal}</FieldRule>
                </label>
)}
            <label className="field">
              Hectareas del lote
              <input type="number" step="0.01" readOnly value={form.cantidadHectareasLote || ''} placeholder="Se completa al elegir el lote" />
              <FieldRule>{SIEMBRA_FIELD_RULES.hectareasLote}</FieldRule>
            </label>
            {esResiembra && (
              <label className="field">
                Cultivo afectado
                <input readOnly value={siembraOriginalSeleccionada?.producto || ''} placeholder="Se completa al elegir el lote" />
                <FieldRule>{SIEMBRA_FIELD_RULES.cultivoAfectado}</FieldRule>
              </label>
            )}
            <label className="field">
              {esResiembra ? 'Cultivo a resembrar' : 'Cultivo'} <b>*</b>
              <div className="grain-change-field">
                <input required readOnly={Boolean(plannedProduct) || granoBloqueado} value={form.producto} onChange={(e) => handleProductManualChange(e.target.value)} placeholder="Se completa al elegir el lote" />
                {plannedProduct && !granoBloqueado && (
                  <button type="button" onClick={() => handleProductManualChange('')} disabled={!form.loteId || saving}>
                    Cambiar grano
                  </button>
                )}
              </div>
              <FieldRule>{esResiembra ? SIEMBRA_FIELD_RULES.cultivoResiembra : SIEMBRA_FIELD_RULES.cultivoSiembra}</FieldRule>
            </label>
            {esResiembra && (
              <>
                <label className="field">
                  Tipo de resiembra <b>*</b>
                  <select required value={form.tipoResiembra} onChange={(e) => onFieldChange('tipoResiembra', e.target.value)}>
                    <option value="">Seleccionar</option>
                    <option value="Parcial">Parcial</option>
                    <option value="Total">Total</option>
                  </select>
                  <FieldRule>{SIEMBRA_FIELD_RULES.tipoResiembra}</FieldRule>
                </label>
                <label className="field">
                  Siniestro <b>*</b>
                  <select required value={form.siniestro} onChange={(e) => onFieldChange('siniestro', e.target.value)}>
                    <option value="">Seleccionar</option>
                    {SINIESTROS_RESIEMBRA.map((siniestro) => (
                      <option key={siniestro} value={siniestro}>{siniestro}</option>
                    ))}
                  </select>
                  <FieldRule>{SIEMBRA_FIELD_RULES.siniestro}</FieldRule>
                </label>
                
              </>
            )}
<label className="field">
              Fecha de Inicio <b>*</b>
              <input
                type="date"
                required
                min={fechaInicioMinima}
                max={fechaInicioMaxima}
                disabled={esResiembra && !finOriginal}
                value={form.fechaInicio}
                onChange={(e) => onFieldChange('fechaInicio', e.target.value)}
              />
              <FieldRule>{esResiembra
                ? SIEMBRA_FIELD_RULES.fechaInicioResiembra(formatDateInputLabel(fechaInicioMinima), formatDateInputLabel(fechaInicioMaxima))
                : SIEMBRA_FIELD_RULES.fechaInicioSiembra(formatDateInputLabel(fechaInicioMinima), formatDateInputLabel(fechaInicioMaxima))}</FieldRule>
              {fechaInicioFueraDeRangoOperativo && (
                <span className="field-error">
                  La fecha de inicio debe estar entre {formatDateInputLabel(fechaInicioMinima)} y {formatDateInputLabel(fechaInicioMaxima)}.
                </span>
              )}
            </label>
            <label className="field">
              Fecha tentativa de Fin <b>*</b>
              <input
                type="date"
                required
                min={form.fechaInicio || fechaInicioMinima}
                max={fechaFinMaxima}
                value={form.fechaFin}
                onChange={(e) => onFieldChange('fechaFin', e.target.value)}
              />
              <FieldRule>{SIEMBRA_FIELD_RULES.fechaFin(formatDateInputLabel(fechaFinMaxima), esResiembra)}</FieldRule>
              {form.fechaInicio && form.fechaFin && form.fechaFin < form.fechaInicio && (
                <span className="field-error">La fecha de fin no puede ser anterior a la fecha de inicio.</span>
              )}
              {fechaFinFueraDeRangoOperativo && (
                <span className="field-error">
                  La fecha tentativa de fin debe estar entre {formatDateInputLabel(form.fechaInicio || fechaInicioMinima)} y {formatDateInputLabel(fechaFinMaxima)}.
                </span>
              )}
            </label>
                        {modoEdicion && (
              <label className="field">
                Seguimiento
                <input readOnly value={estado} />
                <FieldRule>{SIEMBRA_FIELD_RULES.seguimiento}</FieldRule>
              </label>
            )}
          </div>
        </div>
      );
    }

    if (currentStep === 3) {
      return (
        <>
          <ContextStrip
            items={[
              { icon: Sprout, label: 'Campaña', value: campaniaActualNombre || '-' },
              { icon: Map, label: 'Lote', value: loteSeleccionado?.nombre || '-' },
              { icon: Leaf, label: 'Grano', value: form.producto || '-' },
              { icon: Building2, label: 'Empresa', value: empresaActualNombre || '-' },
              { icon: CalendarDays, label: 'Hectareas del lote', value: form.cantidadHectareasLote ? `${formatNumber(form.cantidadHectareasLote)} ha` : '-' }
            ]}
            onEdit={() => setCurrentStep(1)}
          />
          <div className="siembra-step-card dashboard-card">
            <SectionTitle icon={Sprout} title="Detalle de siembra" description={currentStepInfo.description} />
            <div className="siembra-wizard-grid">
              <label className="field">
                Variedad de Semilla <b>*</b>
                <input data-text-case="upper" value={form.variedadSemilla} onChange={(e) => onFieldChange('variedadSemilla', e.target.value)} placeholder="Seleccionar variedad" />
                <FieldRule>{SIEMBRA_FIELD_RULES.variedadSemilla}</FieldRule>
              </label>
              <label className="field">
                PMG (g) <b>*</b>
                <input type="number" min="0" step="0.01" value={form.pmg} onChange={(e) => onFieldChange('pmg', e.target.value)} placeholder="Ej. 180" />
                <FieldRule>{SIEMBRA_FIELD_RULES.pmg}</FieldRule>
              </label>
              <label className="field">
                Densidad de Siembra (semillas/ha) <b>*</b>
                <input type="number" min="0" step="0.01" value={form.densidadSiembra} onChange={(e) => onFieldChange('densidadSiembra', e.target.value)} placeholder="Ej. 300000" />
                <FieldRule>{SIEMBRA_FIELD_RULES.densidad}</FieldRule>
              </label>
              <label className="field">
                Profundidad (cm) <b>*</b>
                <input type="number" min="0" step="0.01" value={form.profundidad} onChange={(e) => onFieldChange('profundidad', e.target.value)} placeholder="Ej. 3,5" />
                <FieldRule>{SIEMBRA_FIELD_RULES.profundidad}</FieldRule>
              </label>
              <label className="field">
                Hectareas cultivables <b>*</b>
                <input type="number" min="0" step="0.01" value={form.cantidadHectareasTrabajadas} onChange={(e) => onFieldChange('cantidadHectareasTrabajadas', e.target.value)} placeholder="Ej. 52,3" />
                <FieldRule>{SIEMBRA_FIELD_RULES.hectareasCultivables}</FieldRule>
              </label>
              <label className="field">
                Urea (kg/ha)
                <input type="number" min="0" step="0.01" value={form.ureaKgHa} onChange={(e) => onFieldChange('ureaKgHa', e.target.value)} placeholder="Opcional" />
                <FieldRule>{SIEMBRA_FIELD_RULES.urea}</FieldRule>
              </label>
              <label className="field">
                Cantidad de Semillas <b>*</b>
                <input type="number" min="0" step="0.01" value={form.cantidadSemillas} onChange={(e) => onFieldChange('cantidadSemillas', e.target.value)} placeholder="Se calcula automaticamente" />
                <FieldRule>{SIEMBRA_FIELD_RULES.cantidadSemillas}</FieldRule>
              </label>
              <label className="field">
                Responsable a Cargo <b>*</b>
                <select value={form.responsableACargo} onChange={(e) => onFieldChange('responsableACargo', e.target.value)}>
                  <option value="">Seleccionar responsable</option>
                  {usuarios.map((usuario) => {
                    const nombreCompleto = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ');
                    return <option key={usuario.usuarioId} value={nombreCompleto}>{nombreCompleto}</option>;
                  })}
                </select>
                <FieldRule>{SIEMBRA_FIELD_RULES.responsable}</FieldRule>
              </label>
            </div>
          </div>
        </>
      );
    }

    if (currentStep === 2) {
      return (
        <div className="siembra-step-stack">
          <div className="siembra-step-card dashboard-card">
            <SectionTitle icon={FlaskConical} title="Pre-Siembra" description={currentStepInfo.description} />
            <div className="siembra-wizard-grid siembra-wizard-grid-three">
              <label className="field">
                Fecha de Muestreo
                <input type="date" min={fechaPreSiembraMinima} max={fechaPreSiembraMaxima} value={form.fechaMuestreo} onChange={(e) => onFieldChange('fechaMuestreo', e.target.value)} />
                <FieldRule>{SIEMBRA_FIELD_RULES.fechaMuestreo(formatDateInputLabel(fechaPreSiembraMinima), formatDateInputLabel(fechaPreSiembraMaxima))}</FieldRule>
                {fechaMuestreoFueraDeRangoOperativo && <span className="field-error">La fecha de muestreo debe estar entre {formatDateInputLabel(fechaPreSiembraMinima)} y el inicio de siembra ({formatDateInputLabel(fechaPreSiembraMaxima)}).</span>}
              </label>
              <label className="field">
                Fecha de Analisis
                <input type="date" min={form.fechaMuestreo && form.fechaMuestreo > fechaPreSiembraMinima ? form.fechaMuestreo : fechaPreSiembraMinima} max={fechaPreSiembraMaxima} value={form.fechaAnalisis} onChange={(e) => onFieldChange('fechaAnalisis', e.target.value)} />
                <FieldRule>{SIEMBRA_FIELD_RULES.fechaAnalisis}</FieldRule>
                {fechaAnalisisAnteriorAMuestreo && <span className="field-error">La fecha de analisis no puede ser anterior a la fecha de muestreo.</span>}
                {fechaAnalisisFueraDeRangoOperativo && <span className="field-error">La fecha de analisis debe estar entre {formatDateInputLabel(fechaPreSiembraMinima)} y el inicio de siembra ({formatDateInputLabel(fechaPreSiembraMaxima)}).</span>}
              </label>
              <label className="field">
                Cantidad de Muestras
                <input type="number" min="0" step="1" value={form.cantidadMuestras} onChange={(e) => { if (e.target.value === '' || (Number.isInteger(Number(e.target.value)) && Number(e.target.value) >= 0)) onFieldChange('cantidadMuestras', e.target.value); }} />
                <FieldRule>{SIEMBRA_FIELD_RULES.cantidadMuestras}</FieldRule>
              </label>
              <label className="field">
                Cultivo antecesor
                <input readOnly value={form.productoAntecesor} placeholder="Sin historial" />
                <FieldRule>{SIEMBRA_FIELD_RULES.cultivoAntecesor}</FieldRule>
              </label>
              <label className="field siembra-wide-field">
                Observaciones
                <input value={form.observacionesPreSiembra} onChange={(e) => onFieldChange('observacionesPreSiembra', e.target.value)} placeholder="Observaciones adicionales del analisis de suelo..." />
                <FieldRule>{SIEMBRA_FIELD_RULES.observaciones}</FieldRule>
              </label>
            </div>
          </div>

          {esResiembra && (
            <div className="siembra-step-card dashboard-card">
              <fieldset className="siembra-pulverizacion">
                <legend>¿Se pulverizó luego de la primera siembra?</legend>
                <div className="siembra-pulverizacion-options">
                  {[['no', 'No'], ['si', 'Sí']].map(([value, label]) => (
                    <label className="siembra-pulverizacion-option" key={value}>
                      <input type="radio" name="pulverizo-resiembra" value={value}
                        checked={(insumos.length > 0 ? 'si' : pulverizoResiembra) === value}
                        disabled={value === 'no' && insumos.length > 0}
                        onChange={() => setPulverizoResiembra(value)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <FieldRule>{SIEMBRA_FIELD_RULES.pulverizacion}</FieldRule>
                {pulverizoResiembra === 'si' && insumos.length === 0 && (
                  <p className="field-error" role="status">Agrega al menos un registro a la tabla de agroquimicos para continuar.</p>
                )}
                <span className="field-hint">{insumos.length > 0 ? 'Para seleccionar No, elimina primero los agroquimicos cargados con sus acciones de eliminar.' : 'Si no se pulverizo, podes continuar sin cargar agroquimicos.'}</span>
              </fieldset>
            </div>
          )}
          {mostrarAgroquimicos && <div className="siembra-step-card dashboard-card">
            <SectionTitle icon={Leaf} title="Agroquimicos" description="Registra los agroquimicos aplicados. Podes cargar multiples registros." />
            <form className="siembra-insumo-box" onSubmit={onAgregarInsumo}>
              <div className="siembra-insumo-title">
                <span>1</span>
                <strong>Agregar nuevo agroquimico</strong>
              </div>
              <div className="siembra-wizard-grid siembra-wizard-grid-three">
                <label className="field">
                  Fecha de aplicacion <b>*</b>
                  <input type="date" required min={OPERATION_DATE_MIN} max={form.fechaInicio || OPERATION_DATE_MAX} value={insumoForm.fechaAplicacion} onChange={(e) => onInsumoFieldChange('fechaAplicacion', e.target.value)} />
                  <FieldRule>{SIEMBRA_FIELD_RULES.fechaAplicacion(formatDateInputLabel(OPERATION_DATE_MIN))}</FieldRule>
                  {fechaAplicacionPosteriorASiembra && <span className="field-error">La fecha de aplicacion no puede ser posterior a la fecha de inicio de la siembra.</span>}
                </label>
                <label className="field">
                  Marca <b>*</b>
                  <input value={insumoForm.marca} onChange={(e) => onInsumoFieldChange('marca', e.target.value)} placeholder="Ej. Bayer, Syngenta" />
                  <FieldRule>{SIEMBRA_FIELD_RULES.marcaAgroquimico}</FieldRule>
                </label>
                <label className="field">
                  Tipo <b>*</b>
                  <select value={insumoForm.tipo} onChange={(e) => onInsumoFieldChange('tipo', e.target.value)}>
                    <option value="">Seleccionar</option>
                    {TIPOS_INSUMO.map((tipo) => (
                      <option key={tipo} value={tipo}>{tipo}</option>
                    ))}
                  </select>
                  <FieldRule>{SIEMBRA_FIELD_RULES.tipoAgroquimico}</FieldRule>
                </label>
                <label className="field">
                  Variedad <b>*</b>
                  <input required value={insumoForm.variedad} onChange={(e) => onInsumoFieldChange('variedad', e.target.value)} placeholder="Ej. Roundup, 2,4-D" />
                  <FieldRule>{SIEMBRA_FIELD_RULES.variedadAgroquimico}</FieldRule>
                </label>
                <label className="field">
                  Cantidad Aplicada <b>*</b>
                  <div className="siembra-quantity-with-unit">
                    <input required type="number" min="0.01" step="0.01" value={insumoForm.cantidadAplicada} onChange={(e) => { if (e.target.value === '' || Number(e.target.value) >= 0) onInsumoFieldChange('cantidadAplicada', e.target.value); }} placeholder="Ej. 2.5" />
                    <select required value={insumoForm.unidadMedida} onChange={(e) => onInsumoFieldChange('unidadMedida', e.target.value)} aria-label="Unidad de medida">
                      <option value="">Unidad</option>
                      <option value="Litros">Litros</option>
                      <option value="Kg">Kg</option>
                    </select>
                  </div>
                  <FieldRule>{SIEMBRA_FIELD_RULES.cantidadAgroquimico}</FieldRule>
                </label>
                <div className="siembra-insumo-action">
                  <button className="green-button" type="submit"><PlusCircle size={18} /> Agregar agroquimico</button>
                </div>
              </div>
            </form>
            <InsumosTable insumos={insumos} onEliminarInsumo={onEliminarInsumo} />
          </div>}
        </div>
      );
    }

    return (
      <div className="siembra-step-stack">
        <div className="siembra-step-card dashboard-card">
          <SectionTitle icon={UploadCloud} title="Documentacion" description="Adjunta archivos relevantes para este registro de siembra." />
          <div className="siembra-upload-zone">
            <UploadCloud size={34} />
            <div>
              <strong>Arrastra archivos aqui o selecciona desde tu equipo</strong>
              <span>Formatos sugeridos: PDF, JPG, PNG, XLSX.</span>
              <FieldRule>{SIEMBRA_FIELD_RULES.documentacion}</FieldRule>
            </div>
            <label className="siembra-file-button">
              <FileText size={16} />
              Seleccionar archivo
              <input type="file" onChange={(e) => onSubirDocumento(e.target.files?.[0])} />
            </label>
          </div>
          <DocumentosTable
            documentos={documentos}
            onDescargarDocumento={onDescargarDocumento}
            onEliminarDocumento={onEliminarDocumento}
          />
        </div>

        <div className="siembra-step-card dashboard-card">
          <div className="siembra-review-header">
            <SectionTitle icon={ClipboardCheck} title="Revision final" description="Verifica que toda la informacion sea correcta antes de registrar la siembra." />
            <button className="back-button" type="button" onClick={() => setCurrentStep(1)}>
              <Edit size={16} />
              Editar informacion
            </button>
          </div>
          <div className="siembra-review-grid">
            <ReviewCard title="Datos generales" icon={FileText} items={[
              ['Tipo de registro', form.tipoRegistro || '-'],
              ['Nombre', modoEdicion ? nombre : 'Se asigna al guardar'],
              ['Fecha de inicio', form.fechaInicio || '-'],
              ['Fecha tentativa de fin', form.fechaFin || '-'],
              ['Campaña', campaniaActualNombre || '-'],
              ['Empresa', empresaActualNombre || '-']
            ]} />
            <ReviewCard title="Detalle de siembra" icon={Sprout} items={[
              ['Lote', loteSeleccionado?.nombre || '-'],
              ['Cultivo', form.producto || '-'],
              ['Variedad', form.variedadSemilla || '-'],
              ['Superficie', form.cantidadHectareasTrabajadas ? `${formatNumber(form.cantidadHectareasTrabajadas)} ha` : '-'],
              ['Urea', form.ureaKgHa ? `${formatNumber(form.ureaKgHa)} kg/ha` : '-'],
              ['Densidad', form.densidadSiembra || '-'],
              ['Responsable', selectedUsuarioName]
            ]} />
            <ReviewCard title="Pre-siembra" icon={FlaskConical} items={[
              ['Fecha de muestreo', form.fechaMuestreo || '-'],
              ['Fecha de analisis', form.fechaAnalisis || '-'],
              ['Cultivo antecesor', form.productoAntecesor || 'Sin historial'],
              ['Cant. muestras', form.cantidadMuestras || '-']
            ]} />
            <ReviewCard title="Agroquimicos cargados" icon={Leaf} items={[
              ['Cantidad', `${insumos.length} registro${insumos.length === 1 ? '' : 's'}`],
              ['Documentos', `${documentos.length} archivo${documentos.length === 1 ? '' : 's'}`]
            ]} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="content-panel create-panel siembra-wizard-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{modoEdicion ? 'Editar Siembra' : 'Registrar Siembra'}</h1>
          <p>{modoEdicion ? nombre : currentStepInfo.description}</p>
        </div>
      </div>

      <div className="siembra-parent-context dashboard-card">
        <div>
          <span>Empresa</span>
          <strong>{empresaActualNombre || 'Sin empresa seleccionada'}</strong>
        </div>
        <div>
          <span>Campaña</span>
          <strong>{campaniaActualNombre || 'Sin campaña seleccionada'}</strong>
        </div>
        <p>Para cambiar empresa o campaña, volve a la pantalla principal de Siembras y ajusta los filtros superiores.</p>
      </div>

      <SiembraStepper steps={steps} currentStep={currentStep} onStepClick={(stepId) => {
        const precedingStepsValid = [canContinueStep1, canContinueStep2, canContinueStep3]
          .slice(0, stepId - 1)
          .every(Boolean);
        if (stepId <= currentStep || precedingStepsValid) {
          setCurrentStep(stepId);
        }
      }} />

      {error && <p className="form-error-banner">{error}</p>}

      <div className="siembra-wizard-layout">
        <div className="siembra-wizard-main">
          {renderStepContent()}
        </div>
        <aside className="siembra-help-card dashboard-card">
          <div className="siembra-help-heading">
            <div className="siembra-section-icon"><Lightbulb size={28} /></div>
            <div>
              <h2>{currentStep === 4 ? 'Listo para registrar' : currentStep === 2 ? 'Informacion importante' : currentStep === 3 ? 'Resumen y ayuda' : 'Consejos para este paso'}</h2>
              <p>{currentStep === 4 ? 'Se completaron los pasos principales del registro.' : 'Revisa estas recomendaciones para avanzar con datos limpios.'}</p>
            </div>
          </div>
          <div className="siembra-help-list">
            {helpItemsForStep().map((item) => {
              const ItemIcon = item.icon;
              return (
                <div className="siembra-help-item" key={item.title}>
                  <ItemIcon size={24} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="siembra-help-note">
            <HelpCircle size={24} />
            <div>
              <strong>¿Necesitas ayuda?</strong>
              <span>Si tenes dudas, consulta el manual de usuario o contacta al equipo de soporte.</span>
            </div>
          </div>
        </aside>
      </div>

      <div className="siembra-wizard-footer">
        {currentStep === 1 ? (
          <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
        ) : (
          <button className="back-button" type="button" onClick={goPrevious}>
            <ArrowLeft size={18} />
            Volver
          </button>
        )}
        {currentStep < 4 ? (
          <button
            className="green-button"
            type="button"
            disabled={(currentStep === 1 && !canContinueStep1) || (currentStep === 2 && !canContinueStep2) || (currentStep === 3 && !canContinueStep3)}
            onClick={goNext}
          >
            Continuar
            <ArrowRight size={18} />
          </button>
        ) : (
          <button className="green-button" type="button" disabled={saving || !canRegister} onClick={onGuardar}>
            <Save size={18} />
            {saving ? 'Guardando...' : modoEdicion ? 'Guardar Siembra' : 'Registrar Siembra'}
            <ArrowRight size={18} />
          </button>
        )}
      </div>
    </section>
  );
}

function SectionTitle({ icon: Icon, title, description }) {
  return (
    <div className="siembra-section-title">
      <div className="siembra-section-icon"><Icon size={28} /></div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function FieldRule({ children }) {
  return (
    <span className="field-rule">
      <Info size={14} aria-hidden="true" />
      <span><strong>Regla:</strong> {children}</span>
    </span>
  );
}

function SiembraStepper({ steps, currentStep, onStepClick }) {
  return (
    <div className="siembra-stepper" aria-label="Pasos del registro de siembra">
      {steps.map((step, index) => {
        const StepIcon = step.icon;
        const isActive = currentStep === step.id;
        const isDone = currentStep > step.id;
        return (
          <div className="siembra-stepper-item" key={step.id}>
            <button
              className={`siembra-stepper-button ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
              type="button"
              onClick={() => onStepClick(step.id)}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="siembra-stepper-number">{isDone ? <CheckCircle2 size={20} /> : step.id}</span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.subtitle}</small>
              </span>
            </button>
            {index < steps.length - 1 && <span className={`siembra-stepper-line ${currentStep > step.id ? 'done' : ''}`} />}
          </div>
        );
      })}
    </div>
  );
}

function ContextStrip({ items, onEdit }) {
  return (
    <div className="siembra-context-strip dashboard-card">
      {items.map((item) => {
        const ItemIcon = item.icon;
        return (
          <div className="siembra-context-item" key={item.label}>
            <div className="siembra-context-icon"><ItemIcon size={22} /></div>
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </div>
        );
      })}
      <button className="soft-filter-button" type="button" onClick={onEdit}>
        <Edit size={17} />
        Editar datos generales
      </button>
    </div>
  );
}

function InsumosTable({ insumos, onEliminarInsumo }) {
  return (
    <div className="siembra-compact-table">
      <div className="siembra-insumo-title">
        <span>2</span>
        <strong>Agroquimicos cargados</strong>
      </div>
      <div className="table-shell">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha de aplicacion</th>
              <th>Marca</th>
              <th>Tipo</th>
              <th>Variedad</th>
              <th>Cantidad aplicada</th>
              <th>Unidad</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((insumo) => (
              <tr key={insumo.siembraInsumoId ?? insumo.tempId}>
                <td>{insumo.fechaAplicacion || '-'}</td>
                <td>{insumo.marca || '-'}</td>
                <td>{insumo.tipo || '-'}</td>
                <td>{insumo.variedad || '-'}</td>
                <td>{insumo.cantidadAplicada ?? '-'}</td>
                <td>{insumo.unidadMedida || '-'}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar insumo" onClick={() => onEliminarInsumo(insumo)}>
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {insumos.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center' }}>Sin agroquimicos cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentosTable({ documentos, onDescargarDocumento, onEliminarDocumento }) {
  return (
    <div className="siembra-compact-table">
      <div className="table-shell">
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
              <tr key={doc.siembraDocumentoId ?? doc.tempId}>
                <td>{doc.nombreArchivo}</td>
                <td>{doc.fechaCarga ? formatFecha(doc.fechaCarga) : 'Pendiente de guardar'}</td>
                <td>{doc.cargadoPor || '-'}</td>
                <td className="actions-cell">
                  {doc.siembraDocumentoId && (
                    <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>
                  )}
                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar" onClick={() => onEliminarDocumento(doc)}><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
            {documentos.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin archivos adjuntos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewCard({ title, icon: Icon, items }) {
  return (
    <div className="siembra-review-card">
      <div className="siembra-review-card-title">
        <span><Icon size={20} /></span>
        <strong>{title}</strong>
      </div>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SiembraDetalle({ siembra, insumos, documentos, onDescargarDocumento, onBack }) {
  if (!siembra) return null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Detalle Siembra</h1>
          <p>{siembra.nombre}</p>
        </div>
      </div>

      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">Nombre<input readOnly value={siembra.nombre} /></label>
          <label className="field">Fecha de Inicio<input readOnly value={formatFecha(siembra.fechaInicio)} /></label>
          <label className="field">Fecha tentativa de Fin<input readOnly value={formatFecha(siembra.fechaFin)} /></label>
          <label className="field">Fecha real de Fin<input readOnly value={formatFecha(siembra.fechaFinReal)} /></label>
          <label className="field">Campaña<input readOnly value={siembra.campaniaNombre || '-'} /></label>
          <label className="field">Resiembra<input readOnly value={siembra.tipoRegistro === 'Resiembra' ? `Resiembra ${siembra.tipoResiembra || ''}`.trim() : 'No'} /></label>
          <label className="field">Siniestro<input readOnly value={siembra.siniestro || '-'} /></label>
          {siembra.tipoRegistro === 'Resiembra' && <label className="field">Siembra original<input readOnly value={siembra.siembraOriginalNombre || '-'} /></label>}
          <label className="field">Lote<input readOnly value={siembra.loteNombre} /></label>
          <label className="field">Grano<input readOnly value={siembra.producto} /></label>
          <label className="field">Empresa<input readOnly value={siembra.empresa || '-'} /></label>
          <label className="field">Seguimiento<input readOnly value={siembra.estado} /></label>
          <label className="field">Estado<input readOnly value={siembra.estadoSiembra || 'En curso'} /></label>
          <label className="field">Hectareas hora<input readOnly value={formatNumber(siembra.hectareasHora, ' ha/h')} /></label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>Justificacion del desvio<textarea readOnly value={siembra.justificacionDesvioFin || '-'} /></label>
        </div>
        <div className="create-grid" style={{ marginTop: 16 }}>
          <label className="field">Variedad de Semilla<input readOnly value={siembra.variedadSemilla || '-'} /></label>
          <label className="field">PMG (g)<input readOnly value={siembra.pmg ?? '-'} /></label>
          <label className="field">Densidad de Siembra<input readOnly value={siembra.densidadSiembra ?? '-'} /></label>
          <label className="field">Profundidad (cm)<input readOnly value={siembra.profundidad ?? '-'} /></label>
          <label className="field">Hectareas cultivables<input readOnly value={siembra.cantidadHectareasTrabajadas ?? '-'} /></label>
          <label className="field">Urea (kg/ha)<input readOnly value={siembra.ureaKgHa ?? '-'} /></label>
          <label className="field">Cantidad de Semillas<input readOnly value={siembra.cantidadSemillas ?? '-'} /></label>
          <label className="field">Responsable a Cargo<input readOnly value={siembra.responsableACargo || '-'} /></label>
        </div>
      </div>

      <h2>Pre-Siembra</h2>
      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">Fecha de Muestreo<input readOnly value={formatFecha(siembra.fechaMuestreo)} /></label>
          <label className="field">Fecha de Analisis<input readOnly value={formatFecha(siembra.fechaAnalisis)} /></label>
          <label className="field">Cantidad de Muestras<input readOnly value={siembra.cantidadMuestras ?? '-'} /></label>
          <label className="field">Cultivo antecesor<input readOnly value={siembra.productoAntecesor || 'Sin historial'} /></label>
        </div>
        <label className="field" style={{ marginTop: 16 }}>
          Observaciones
          <input readOnly value={siembra.observacionesPreSiembra || '-'} />
        </label>
      </div>

      <h2>Agroquimicos</h2>
      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha de aplicacion</th>
              <th>Marca</th>
              <th>Tipo</th>
              <th>Variedad</th>
              <th>Cantidad aplicada</th>
              <th>Unidad</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((insumo) => (
              <tr key={insumo.siembraInsumoId}>
                <td>{insumo.fechaAplicacion || '-'}</td>
                <td>{insumo.marca || '-'}</td>
                <td>{insumo.tipo || '-'}</td>
                <td>{insumo.variedad || '-'}</td>
                <td>{insumo.cantidadAplicada ?? '-'}</td>
                <td>{insumo.unidadMedida || '-'}</td>
              </tr>
            ))}
            {insumos.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center' }}>Sin agroquimicos cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Documentacion</h2>
      <div className="table-shell dashboard-card">
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
              <tr key={doc.siembraDocumentoId}>
                <td>{doc.nombreArchivo}</td>
                <td>{formatFecha(doc.fechaCarga)}</td>
                <td>{doc.cargadoPor || '-'}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>
                </td>
              </tr>
            ))}
            {documentos.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin archivos adjuntos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form-actions">
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
      </div>
    </section>
  );
}

function SeguimientoMapa({ puntos, pendiente, poligono, onPick, readOnly }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(L.layerGroup());
  const onPickRef = useRef(onPick);
  const readOnlyRef = useRef(readOnly);
  const initialFitDoneRef = useRef(false);

  useEffect(() => {
    onPickRef.current = onPick;
    readOnlyRef.current = readOnly;
  }, [onPick, readOnly]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;

    const map = L.map(mapNodeRef.current, {
      center: defaultMapCenter,
      zoom: 16,
      minZoom: 4,
      maxZoom: 19,
      zoomControl: true
    });

    const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles © Esri'
    });
    satelite.addTo(map);

    layerRef.current.addTo(map);

    map.on('click', (event) => {
      if (readOnlyRef.current) return;
      onPickRef.current?.(event.latlng);
    });

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 0);
    setTimeout(() => map.invalidateSize(), 180);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    layerRef.current.clearLayers();

    const poligonoOrdenado = (poligono ?? [])
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map((c) => ({ lat: Number(c.latitud), lng: Number(c.longitud) }));

    if (poligonoOrdenado.length >= 3) {
      L.polygon(poligonoOrdenado, { color: '#1c8c3a', weight: 2, opacity: 0.9, fillOpacity: 0.08 }).addTo(layerRef.current);
    }

    const todosLosPuntos = pendiente ? [...puntos, pendiente] : puntos;

    if (todosLosPuntos.length >= 2) {
      L.polyline(todosLosPuntos, { color: '#df3b30', weight: 2, opacity: 0.9, dashArray: '6 8' }).addTo(layerRef.current);
    }

    puntos.forEach((punto) => {
      L.marker(punto, {
        icon: L.divIcon({
          className: 'seguimiento-marker',
          html: '<span style="display:block;width:14px;height:14px;border-radius:50% 50% 50% 0;background:#df3b30;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>',
          iconSize: [18, 18],
          iconAnchor: [9, 18]
        })
      }).addTo(layerRef.current);
    });

    if (pendiente) {
      L.marker(pendiente, {
        icon: L.divIcon({
          className: 'seguimiento-marker-pendiente',
          html: '<span style="display:block;width:16px;height:16px;border-radius:50% 50% 50% 0;background:#1c8c3a;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>',
          iconSize: [20, 20],
          iconAnchor: [10, 20]
        })
      }).addTo(layerRef.current);
    }

    const puntosParaEncuadrar = poligonoOrdenado.length >= 3 ? poligonoOrdenado : todosLosPuntos;

    if (!initialFitDoneRef.current && puntosParaEncuadrar.length > 0) {
      initialFitDoneRef.current = true;
      window.setTimeout(() => {
        if (!mapRef.current) return;
        mapRef.current.invalidateSize();
        if (puntosParaEncuadrar.length === 1) {
          mapRef.current.setView(puntosParaEncuadrar[0], 16, { animate: false });
          return;
        }
        const bounds = L.latLngBounds(puntosParaEncuadrar);
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds.pad(0.25), { animate: false, maxZoom: 17 });
        }
      }, 120);
    }
  }, [puntos, pendiente, poligono]);

  return (
    <div className="map-box" style={{ height: 320, position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
      <div ref={mapNodeRef} style={{ width: '100%', height: '100%' }} />
      {!readOnly && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8, background: 'rgba(255,255,255,.92)',
          padding: '6px 10px', borderRadius: 8, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6
        }}>
          <MapPin size={14} />
          <span>Toca el mapa para marcar el punto de esta recorrida</span>
        </div>
      )}
    </div>
  );
}

function SeguimientoHistorialList({ siembra, seguimientos, error, onNuevo, onVer, onEditar, onEliminar, onFinalizar, onBack }) {
  if (!siembra) return null;

  const finalizado = siembra.estado === 'Finalizado';

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Historial {siembra.nombre}</h1>
          <p>{siembra.loteNombre} - {siembra.producto}</p>
        </div>
        {!finalizado && (
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="green-button" type="button" onClick={onNuevo}>Nuevo Seguimiento</button>
            <button className="green-button" type="button" onClick={onFinalizar}>Finalizar Seguimiento</button>
          </div>
        )}
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}
      {finalizado && (
        <p style={{ color: '#6b7280' }}>Este seguimiento ya fue finalizado: queda disponible solo para consulta.</p>
      )}

      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Longitud</th>
              <th>Latitud</th>
              <th>Incidencias</th>
              <th>Perdida Economica</th>
              <th>Aplicacion de Agroquimicos</th>
              <th>Observaciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {seguimientos.map((s) => (
              <tr key={s.siembraSeguimientoId}>
                <td>{formatFecha(s.fecha)}</td>
                <td>{s.longitud ?? '-'}</td>
                <td>{s.latitud ?? '-'}</td>
                <td>{s.incidencia || '-'}</td>
                <td>{s.perdidaEconomica === null || s.perdidaEconomica === undefined ? '-' : s.perdidaEconomica ? 'Si' : 'No'}</td>
                <td>{s.aplicacionAgroquimicos === null || s.aplicacionAgroquimicos === undefined ? '-' : s.aplicacionAgroquimicos ? 'Si' : 'No'}</td>
                <td>{s.observaciones}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label="Ver detalle" onClick={() => onVer(s)}><Eye size={18} /></button>
                  {!finalizado && (
                    <>
                      <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label="Editar recorrida" onClick={() => onEditar(s)}><Edit size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar recorrida" onClick={() => onEliminar(s)}><Trash2 size={18} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {seguimientos.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center' }}>Todavia no hay recorridas registradas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form-actions">
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
      </div>
    </section>
  );
}

function SeguimientoForm({
  siembra,
  lotePoligono,
  modoEdicion,
  seguimientoForm,
  insumoForm,
  insumos,
  documentos,
  saving,
  error,
  onFieldChange,
  onPickPunto,
  onGuardar,
  onInsumoFieldChange,
  onAgregarInsumo,
  onEliminarInsumo,
  onSubirDocumento,
  onDescargarDocumento,
  onEliminarDocumento,
  onBack
}) {
  if (!siembra) return null;

  const puntoPendiente = seguimientoForm.latitud !== '' && seguimientoForm.longitud !== ''
    ? { lat: Number(seguimientoForm.latitud), lng: Number(seguimientoForm.longitud) }
    : null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{modoEdicion ? 'Editar' : 'Nuevo'} Seguimiento {siembra.nombre}</h1>
          <p>{siembra.loteNombre} - {siembra.producto}</p>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="create-form-card dashboard-card">
        <SeguimientoMapa puntos={[]} pendiente={puntoPendiente} poligono={lotePoligono} onPick={onPickPunto} readOnly={false} />

        <div className="create-grid" style={{ marginTop: 16 }}>
          <label className="field">
            Fecha
            <input type="date" value={seguimientoForm.fecha} onChange={(e) => onFieldChange('fecha', e.target.value)} />
          </label>
          <label className="field">
            Longitud
            <input readOnly value={seguimientoForm.longitud} placeholder="Se completa al tocar el mapa" />
          </label>
          <label className="field">
            Latitud
            <input readOnly value={seguimientoForm.latitud} placeholder="Se completa al tocar el mapa" />
          </label>
          <label className="field">
            Incidencia
            <select value={seguimientoForm.incidencia} onChange={(e) => onFieldChange('incidencia', e.target.value)}>
              <option value="">Seleccionar</option>
              {INCIDENCIAS_SEGUIMIENTO.map((valor) => <option key={valor} value={valor}>{valor}</option>)}
            </select>
          </label>
          <label className="field">
            Perdida Economica
            <select value={seguimientoForm.perdidaEconomica} onChange={(e) => onFieldChange('perdidaEconomica', e.target.value)}>
              <option value="">Seleccionar</option>
              <option value="Si">Si</option>
              <option value="No">No</option>
            </select>
          </label>
          <label className="field">
            Aplicacion de Agroquimicos
            <select value={seguimientoForm.aplicacionAgroquimicos} onChange={(e) => onFieldChange('aplicacionAgroquimicos', e.target.value)}>
              <option value="">Seleccionar</option>
              <option value="Si">Si</option>
              <option value="No">No</option>
            </select>
          </label>
        </div>
        <label className="field" style={{ marginTop: 16 }}>
          Observaciones <b>*</b>
          <input required value={seguimientoForm.observaciones} onChange={(e) => onFieldChange('observaciones', e.target.value)} />
        </label>
      </div>

      <h2>Insumos/Agroquimicos</h2>
      <div className="create-form-card dashboard-card">
        <form onSubmit={onAgregarInsumo}>
          <div className="create-grid">
            <label className="field">
              Fecha de aplicacion
              <input type="date" value={insumoForm.fechaAplicacion} onChange={(e) => onInsumoFieldChange('fechaAplicacion', e.target.value)} />
            </label>
            <label className="field">
              Marca
              <input value={insumoForm.marca} onChange={(e) => onInsumoFieldChange('marca', e.target.value)} />
            </label>
            <label className="field">
              Tipo
              <select value={insumoForm.tipo} onChange={(e) => onInsumoFieldChange('tipo', e.target.value)}>
                <option value="">Seleccionar</option>
                {TIPOS_INSUMO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
            </label>
            <label className="field">
              Variedad
              <input value={insumoForm.variedad} onChange={(e) => onInsumoFieldChange('variedad', e.target.value)} />
            </label>
            <label className="field">
              Cantidad Aplicada
              <input type="number" step="0.01" value={insumoForm.cantidadAplicada} onChange={(e) => onInsumoFieldChange('cantidadAplicada', e.target.value)} />
            </label>
          </div>
          <div className="form-actions">
            <button className="green-button" type="submit">Agregar</button>
          </div>
        </form>
      </div>

      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha de aplicacion</th>
              <th>Marca</th>
              <th>Tipo</th>
              <th>Variedad</th>
              <th>Cantidad aplicada</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((insumo) => (
              <tr key={insumo.seguimientoInsumoId ?? insumo.tempId}>
                <td>{insumo.fechaAplicacion || '-'}</td>
                <td>{insumo.marca || '-'}</td>
                <td>{insumo.tipo || '-'}</td>
                <td>{insumo.variedad || '-'}</td>
                <td>{insumo.cantidadAplicada ?? '-'}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar insumo" onClick={() => onEliminarInsumo(insumo)}><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
            {insumos.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center' }}>Sin insumos cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Documentacion</h2>
      <div className="create-form-card dashboard-card">
        <input type="file" onChange={(e) => onSubirDocumento(e.target.files?.[0])} />
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
                <tr key={doc.seguimientoDocumentoId ?? doc.tempId}>
                  <td>{doc.nombreArchivo}</td>
                  <td>{doc.fechaCarga ? formatFecha(doc.fechaCarga) : 'Pendiente de guardar'}</td>
                  <td>{doc.cargadoPor || '-'}</td>
                  <td className="actions-cell">
                    {doc.seguimientoDocumentoId && (
                      <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>
                    )}
                    <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar" onClick={() => onEliminarDocumento(doc)}><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
              {documentos.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin archivos adjuntos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="form-actions">
        <button className="green-button" type="button" disabled={saving} onClick={onGuardar}>
          {saving ? 'Guardando...' : modoEdicion ? 'Guardar' : 'Registrar'}
        </button>
        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
      </div>
    </section>
  );
}

function SeguimientoDetalle({ siembra, lotePoligono, seguimiento, insumos, documentos, onDescargarDocumento, onBack }) {
  if (!siembra || !seguimiento) return null;

  const punto = seguimiento.latitud != null && seguimiento.longitud != null
    ? [{ lat: Number(seguimiento.latitud), lng: Number(seguimiento.longitud) }]
    : [];

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Detalle - Historial {siembra.nombre}</h1>
          <p>{siembra.loteNombre} - {siembra.producto}</p>
        </div>
      </div>

      <div className="create-form-card dashboard-card">
        {punto.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <SeguimientoMapa puntos={punto} pendiente={null} poligono={lotePoligono} onPick={() => {}} readOnly />
          </div>
        )}
        <div className="create-grid">
          <label className="field">Fecha<input readOnly value={formatFecha(seguimiento.fecha)} /></label>
          <label className="field">Longitud<input readOnly value={seguimiento.longitud ?? '-'} /></label>
          <label className="field">Latitud<input readOnly value={seguimiento.latitud ?? '-'} /></label>
          <label className="field">Incidencia<input readOnly value={seguimiento.incidencia || '-'} /></label>
          <label className="field">Perdida Economica<input readOnly value={seguimiento.perdidaEconomica === null || seguimiento.perdidaEconomica === undefined ? '-' : seguimiento.perdidaEconomica ? 'Si' : 'No'} /></label>
          <label className="field">Aplicacion de Agroquimicos<input readOnly value={seguimiento.aplicacionAgroquimicos === null || seguimiento.aplicacionAgroquimicos === undefined ? '-' : seguimiento.aplicacionAgroquimicos ? 'Si' : 'No'} /></label>
        </div>
        <label className="field" style={{ marginTop: 16 }}>
          Observaciones
          <input readOnly value={seguimiento.observaciones || '-'} />
        </label>
      </div>

      <h2>Insumos/Agroquimicos</h2>
      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha de aplicacion</th>
              <th>Marca</th>
              <th>Tipo</th>
              <th>Variedad</th>
              <th>Cantidad aplicada</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((insumo) => (
              <tr key={insumo.seguimientoInsumoId}>
                <td>{insumo.fechaAplicacion || '-'}</td>
                <td>{insumo.marca || '-'}</td>
                <td>{insumo.tipo || '-'}</td>
                <td>{insumo.variedad || '-'}</td>
                <td>{insumo.cantidadAplicada ?? '-'}</td>
              </tr>
            ))}
            {insumos.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin insumos cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Documentacion</h2>
      <div className="table-shell dashboard-card">
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
              <tr key={doc.seguimientoDocumentoId}>
                <td>{doc.nombreArchivo}</td>
                <td>{formatFecha(doc.fechaCarga)}</td>
                <td>{doc.cargadoPor || '-'}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>
                </td>
              </tr>
            ))}
            {documentos.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin archivos adjuntos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="form-actions">
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
      </div>
    </section>
  );
}
