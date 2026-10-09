import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { calcularAvanceApto, finPeriodoCampania } from './cosechaIndicators.js';
import { calcularKgCosechados, calcularRindeKgHa, formatearEnteroConMiles, parsearEnteroConMiles } from './cosechaResultado.js';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit,
  Eye,
  Flag,
  Gauge,
  Info,
  LoaderCircle,
  MapPin,
  PlusCircle,
  RotateCcw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Target,
  Tractor,
  Trash2,
  Wheat,
  X
} from 'lucide-react';

/*
  Modulo Cosechas (rediseño).

  Dos estados independientes, igual que Siembras:
    - Estado de la cosecha: En curso -> Finalizado (modal con fecha real y resultado).
    - Control de pérdidas (Tirada de Aros): Sin controles -> En curso -> Finalizado.

  Vistas: consulta, registrar / editar, detalle, partes diarios y Tirada de Aros.
  Estilos: bloque cos-* al final de styles.css; reutiliza las clases de Siembras.
*/

// Permisos por rol (los calcula App.jsx segun el rol en la empresa). Sin la prop, se muestra todo.
const PERMISOS_TODOS = { estructura: true, registroCampo: true, movimientoGrano: true };

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const DIAS_DESVIO_REQUIERE_JUSTIFICACION = 3;
const MESES_MAXIMOS_COSECHA = 6;
const MESES_MAXIMOS_TIRADA = 4;
const AREA_ARO_M2 = 0.25;
const DEFAULT_MAP_CENTER = [-32.0025, -64.0055];

const DESTINOS_PARTE = [
  { value: 'Silo', label: 'Silo' },
  { value: 'Distribucion directa', label: 'Distribución directa' },
  { value: 'Pendiente', label: 'Pendiente de destino' }
];

const SEVERIDADES = {
  Baja: { letra: 'B', clase: 'cos-sev-baja', color: '#1f7a43' },
  Media: { letra: 'M', clase: 'cos-sev-media', color: '#b86b00' },
  Alta: { letra: 'A', clase: 'cos-sev-alta', color: '#b42318' }
};

// Ayudas "Regla" debajo de cada campo: deben acompañar las validaciones del frontend y la API.
const COSECHA_FIELD_RULES = {
  siembra: 'Solo aparecen lotes activos y cultivados cuya última siembra y su seguimiento finalizaron, sin cosecha registrada.',
  heredados: 'Se toman de la siembra y no se editan acá.',
  fechaInicio: (minima, maxima) => `Entre el fin real de la siembra${minima ? ` (${formatFecha(minima)})` : ''}${maxima ? ` y el ${formatFecha(maxima)}, fin del período de campaña` : ''}.`,
  fechaFin: `Es obligatoria, no anterior al inicio y hasta ${MESES_MAXIMOS_COSECHA} meses después. Al finalizar se compara con la fecha real.`,
  responsable: 'Es obligatorio seleccionar un usuario de la empresa.',
  maquinaria: 'Es opcional. Junto con las ha/h del cierre permite comparar rendimiento operativo y pérdidas por contratista.',
  fechaFinReal: `Entre el inicio y hasta ${MESES_MAXIMOS_COSECHA} meses después. Si se aleja más de ${DIAS_DESVIO_REQUIERE_JUSTIFICACION} días de la tentativa, se pide justificación.`,
  hectareasHora: 'Es obligatoria y mayor que cero. Alimenta la productividad promedio de la consulta.',
  kg: 'Es obligatorio y no puede ser menor a lo que ya ingresó a silos desde esta cosecha.',
  hectareas: 'Es obligatoria, mayor que cero y sin superar la superficie del lote.',
  rinde: 'Se calcula: kg ÷ ha. No se edita a mano.',
  rindeSeco: 'Rinde llevado a la humedad base de comercialización del grano.',
  humedad: 'Es obligatoria, entre 0 y 100 %.',
  impurezas: 'Es opcional, entre 0 y 100 %.',
  parteFecha: 'Entre el inicio de la cosecha y hoy.',
  parteHectareas: 'Mayor que cero. El total de partes no puede superar las hectáreas sembradas.',
  parteDestino: 'Si elegís un silo, se registra el ingreso en Almacenamiento y el parte queda fijo (solo se editan observaciones).',
  tiradaFecha: `Entre el inicio de la cosecha y ${MESES_MAXIMOS_TIRADA} meses después; si ya finalizó, hasta su fecha real de fin.`,
  tiradaPunto: 'Tocá el mapa: las coordenadas se completan solas y deben quedar dentro del lote.',
  tiradaPmg: 'Se precarga desde la siembra (o la referencia del grano). Podés ajustarlo: el grano cosechado puede pesar distinto que la semilla.',
  tiradaPrecosecha: 'Opcional. Promedio de granos por aro que ya estaban en el suelo antes de pasar la cosechadora; se descuenta del cabezal.'
};

// =====================================================================
// Utilidades
// =====================================================================

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function grainKey(value) {
  return normalizeSearchText(value).trim();
}

function grainLabel(value) {
  const key = grainKey(value);
  if (key === 'maiz') return 'Maíz';
  if (key === 'soja') return 'Soja';
  const nombre = String(value ?? '').trim();
  return nombre ? nombre[0].toLocaleUpperCase('es') + nombre.slice(1).toLocaleLowerCase('es') : '';
}

function pad(valor) {
  return String(valor).padStart(2, '0');
}

/** Fecha de hoy en hora local (toISOString usa UTC y de noche puede dar el dia siguiente). */
function hoyInput() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
}

function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

/** dd/mm/aaaa sin pasar por Date, para no correr el dia por zona horaria. */
function formatFecha(value) {
  const texto = toDateInput(value);
  if (!texto) return '-';
  const [year, month, day] = texto.split('-');
  return `${day}/${month}/${year}`;
}

/** Igual que DateTime.AddMonths de .NET: si el dia no existe, toma el ultimo del mes. */
function sumarMeses(fechaInput, meses) {
  if (!fechaInput) return '';
  const [year, month, day] = fechaInput.split('-').map(Number);
  const destino = new Date(year, month - 1 + meses, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  return `${destino.getFullYear()}-${pad(destino.getMonth() + 1)}-${pad(Math.min(day, ultimoDia))}`;
}

function diasEntre(desde, hasta) {
  if (!desde || !hasta) return 0;
  return Math.round((Date.parse(toDateInput(hasta)) - Date.parse(toDateInput(desde))) / 86400000);
}

function minFecha(...fechas) {
  return fechas.filter(Boolean).sort()[0] ?? '';
}

function formatNumber(value, suffix = '', decimales = 2) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toLocaleString('es-AR', { maximumFractionDigits: decimales })}${suffix}`;
}

function toNumberOrNull(value) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}

function esNumeroPositivo(value) {
  return value !== '' && value !== null && Number.isFinite(Number(value)) && Number(value) > 0;
}

function nombreCompleto(usuario) {
  return [usuario?.nombre, usuario?.apellido].filter(Boolean).join(' ');
}

function labelDestino(destino) {
  return DESTINOS_PARTE.find((item) => item.value === destino)?.label ?? destino ?? '-';
}

/** Misma formula que CalculadoraPerdidasCosecha en la API. */
function kgHa(granosPorAro, pmg) {
  return (granosPorAro / AREA_ARO_M2) * pmg / 100;
}

function clasificarPerdida(total, tolerancia, factor) {
  if (total <= tolerancia) return 'Baja';
  if (total <= tolerancia * factor) return 'Media';
  return 'Alta';
}

function calcularPerdidas(form, parametros) {
  const pmg = Number(form.pmg);
  const aros = ['aroCabezal', 'aroCola1', 'aroCola2', 'aroCola3'];
  if (!parametros || !(pmg > 0) || aros.some((campo) => form[campo] === '')) return null;

  const precosecha = form.granosPrecosecha === '' ? 0 : Number(form.granosPrecosecha);
  const cabezalNeto = Math.max(0, Number(form.aroCabezal) - precosecha);
  const promedioCola = (Number(form.aroCola1) + Number(form.aroCola2) + Number(form.aroCola3)) / 3;
  const cabezal = kgHa(cabezalNeto, pmg);
  const cola = kgHa(promedioCola, pmg);
  const total = cabezal + cola;

  return {
    precosecha: kgHa(precosecha, pmg),
    cabezal,
    cola,
    total,
    severidad: clasificarPerdida(total, Number(parametros.toleranciaKgHa), Number(parametros.factorAlta))
  };
}

function calcularRindeSeco(rinde, humedad, humedadBase) {
  if (!(rinde > 0) || humedad === '' || humedadBase == null) return null;
  const h = Number(humedad);
  if (h <= humedadBase) return rinde;
  return (rinde * (100 - h)) / (100 - humedadBase);
}

function getEmptyCosechaForm() {
  return {
    siembraId: '',
    fechaInicio: '',
    fechaFin: '',
    responsableACargo: '',
    tipoServicio: '',
    contratista: '',
    cosechadora: '',
    anchoCabezalM: '',
    fechaFinReal: '',
    justificacionDesvioFin: '',
    cantidadGranoCosechado: '',
    cantidadHectareasTrabajadas: '',
    humedadGrano: '',
    impurezas: '',
    hectareasHora: ''
  };
}

function getEmptyTiradaForm(pmg = '', cosecha = null) {
  const inicio = toDateInput(cosecha?.fechaInicio);
  const limite = minFecha(sumarMeses(inicio, MESES_MAXIMOS_TIRADA), toDateInput(cosecha?.fechaFinReal));
  const hoy = hoyInput();
  const fecha = inicio ? hoy < inicio ? inicio : hoy > limite ? limite : hoy : hoy;
  return {
    fecha,
    latitud: '',
    longitud: '',
    aroCabezal: '',
    aroCola1: '',
    aroCola2: '',
    aroCola3: '',
    granosPrecosecha: '',
    pmg: pmg === null || pmg === undefined ? '' : String(pmg),
    ajustoMaquinaria: false,
    observaciones: ''
  };
}

function getEmptyParteForm() {
  return {
    fecha: hoyInput(),
    hectareas: '',
    kgCosechados: '',
    humedadPct: '',
    destino: 'Silo',
    siloId: '',
    observaciones: ''
  };
}

// =====================================================================
// Contenedor
// =====================================================================

export default function Cosechas({ permisos = PERMISOS_TODOS, session, lotes, parentFilters, selectedEmpresaId = '', selectedEmpresaName = '', selectedCampaniaName = '' }) {
  const [view, setView] = useState('list');
  const [cosechas, setCosechas] = useState([]);
  const [siembrasDisponibles, setSiembrasDisponibles] = useState([]);
  const [maquinariaCatalogos, setMaquinariaCatalogos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [basesHumedad, setBasesHumedad] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(getEmptyCosechaForm);
  const [documentos, setDocumentos] = useState([]);
  const [tiradas, setTiradas] = useState([]);
  const [parametros, setParametros] = useState(null);
  const [tiradaForm, setTiradaForm] = useState(getEmptyTiradaForm);
  const [editingTiradaId, setEditingTiradaId] = useState(null);
  const [partes, setPartes] = useState([]);
  const [parteForm, setParteForm] = useState(getEmptyParteForm);
  const [editingParteId, setEditingParteId] = useState(null);
  const [silosDestino, setSilosDestino] = useState([]);
  const [finalizarTarget, setFinalizarTarget] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const [parametrosModal, setParametrosModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  function authHeaders(extra = {}) {
    return session?.token ? { ...extra, Authorization: `Bearer ${session.token}` } : extra;
  }

  /** fetch con token. Devuelve JSON, texto o null (204). Si falla, lanza el mensaje de la API. */
  async function api(path, { method = 'GET', body } = {}) {
    const esJson = body !== undefined && !(body instanceof FormData);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: authHeaders(esJson ? { 'Content-Type': 'application/json' } : {}),
      body: body === undefined ? undefined : esJson ? JSON.stringify(body) : body
    });

    if (!response.ok) {
      const texto = await response.text();
      throw new Error(texto || `Error ${response.status}`);
    }

    if (response.status === 204) return null;
    const tipo = response.headers.get('content-type') || '';
    return tipo.includes('application/json') ? response.json() : response.text();
  }

  function mostrarError(prefijo, err) {
    setAviso('');
    setError(`${prefijo}: ${err.message}`);
  }

  async function loadCosechas() {
    setLoading(true);
    try {
      setCosechas(await api('/api/cosechas'));
    } catch (err) {
      mostrarError('No se pudieron cargar las cosechas', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadReferenceData() {
    const [siembrasRes, usuariosRes, basesRes, catalogosRes] = await Promise.allSettled([
      api('/api/cosechas/siembras-disponibles'),
      api('/api/usuarios/resumen'),
      api('/api/grano-parametros/bases'),
      api('/api/catalogos')
    ]);
    setSiembrasDisponibles(siembrasRes.status === 'fulfilled' ? siembrasRes.value : []);
    setUsuarios(usuariosRes.status === 'fulfilled' ? usuariosRes.value : []);
    setBasesHumedad(basesRes.status === 'fulfilled' ? basesRes.value : []);
    setMaquinariaCatalogos(catalogosRes.status === 'fulfilled' ? catalogosRes.value : []);
  }

  useEffect(() => {
    loadCosechas();
    loadReferenceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Vuelve a leer la cosecha abierta (avance, estados) despues de un cambio. */
  async function refreshSelected(cosechaId) {
    try {
      const actualizada = await api(`/api/cosechas/${cosechaId}`);
      setSelected(actualizada);
      return actualizada;
    } catch {
      return null;
    }
  }

  async function agregarValorMaquinaria(tipo, nombre) {
    const valor = tipo === 'Cosechadora' ? String(nombre ?? '').trim().toLocaleUpperCase('es') : String(nombre ?? '').trim();
    const guardado = await api('/api/catalogos', { method: 'POST', body: { tipo, nombre: valor } });
    setMaquinariaCatalogos((actual) => actual.some((item) => item.tipo === guardado.tipo && item.nombre === guardado.nombre)
      ? actual : [...actual, guardado]);
    return guardado.nombre;
  }

  function humedadBaseDe(producto) {
    const grano = normalizeSearchText(producto);
    const base = basesHumedad.find((item) => normalizeSearchText(item.producto) === grano);
    return base ? Number(base.humedadBase) : null;
  }

  function loteDe(cosecha) {
    return (lotes ?? []).find((lote) => String(lote.loteId) === String(cosecha?.loteId));
  }

  function goToList() {
    setView('list');
    setSelected(null);
    setDocumentos([]);
    setTiradas([]);
    setPartes([]);
    setParametros(null);
    setEditingTiradaId(null);
    setEditingParteId(null);
    setError('');
    loadCosechas();
    loadReferenceData();
  }

  // -------------------------------------------------------------------
  // Registrar / editar
  // -------------------------------------------------------------------

  function startCreate() {
    setSelected(null);
    setForm(getEmptyCosechaForm());
    setDocumentos([]);
    setError('');
    setAviso('');
    loadReferenceData();
    setView('create');
  }

  async function openEdit(cosecha) {
    setSelected(cosecha);
    setForm({
      ...getEmptyCosechaForm(),
      siembraId: cosecha.siembraId ?? '',
      fechaInicio: toDateInput(cosecha.fechaInicio),
      fechaFin: toDateInput(cosecha.fechaFin),
      responsableACargo: cosecha.responsableACargo || '',
      tipoServicio: cosecha.tipoServicio || '',
      contratista: cosecha.contratista || '',
      cosechadora: cosecha.cosechadora || '',
      anchoCabezalM: cosecha.anchoCabezalM ?? '',
      fechaFinReal: toDateInput(cosecha.fechaFinReal),
      justificacionDesvioFin: cosecha.justificacionDesvioFin || '',
      cantidadGranoCosechado: cosecha.cantidadGranoCosechado ?? '',
      cantidadHectareasTrabajadas: cosecha.cantidadHectareasTrabajadas ?? '',
      humedadGrano: cosecha.humedadGrano ?? '',
      impurezas: cosecha.impurezas ?? '',
      hectareasHora: cosecha.hectareasHora ?? ''
    });
    setError('');
    setAviso('');
    await loadDocumentos(cosecha.cosechaId);
    setView('edit');
  }

  function updateField(field, value) {
    const numericos = ['anchoCabezalM', 'cantidadGranoCosechado', 'cantidadHectareasTrabajadas', 'humedadGrano', 'impurezas', 'hectareasHora'];
    if (numericos.includes(field) && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return;
    setForm((current) => {
      const next = { ...current, [field]: field === 'cosechadora' ? String(value).toLocaleUpperCase('es') : value };
      if (field === 'tipoServicio' && value !== 'Contratada') next.contratista = '';
      if (field === 'tipoServicio' && value === '') { next.cosechadora = ''; next.anchoCabezalM = ''; }
      return next;
    });
  }

  async function handleGuardar() {
    setSaving(true);
    setError('');
    try {
      const generales = {
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin,
        responsableACargo: form.responsableACargo,
        tipoServicio: form.tipoServicio || null,
        contratista: form.tipoServicio === 'Contratada' ? form.contratista || null : null,
        cosechadora: form.tipoServicio ? form.cosechadora?.toLocaleUpperCase('es') || null : null,
        anchoCabezalM: form.tipoServicio ? toNumberOrNull(form.anchoCabezalM) : null
      };

      if (selected) {
        const resultado = selected.estado === 'Finalizado'
          ? {
            fechaFinReal: form.fechaFinReal || null,
            justificacionDesvioFin: form.justificacionDesvioFin || null,
            cantidadGranoCosechado: toNumberOrNull(form.cantidadGranoCosechado),
            cantidadHectareasTrabajadas: toNumberOrNull(form.cantidadHectareasTrabajadas),
            humedadGrano: toNumberOrNull(form.humedadGrano),
            impurezas: toNumberOrNull(form.impurezas),
            hectareasHora: toNumberOrNull(form.hectareasHora)
          }
          : {};
        await api(`/api/cosechas/${selected.cosechaId}`, { method: 'PUT', body: { ...generales, ...resultado } });
        setAviso(`Se guardaron los cambios de ${selected.nombre}.`);
      } else {
        const creada = await api('/api/cosechas', { method: 'POST', body: { siembraId: Number(form.siembraId), ...generales } });
        setAviso(`${creada.nombre} quedó registrada En curso.`);
      }
      goToList();
    } catch (err) {
      mostrarError('No se pudo guardar la cosecha', err);
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------
  // Detalle y documentos
  // -------------------------------------------------------------------

  async function loadDocumentos(cosechaId) {
    try {
      setDocumentos(await api(`/api/cosechas/${cosechaId}/documentos`));
    } catch (err) {
      mostrarError('No se pudo cargar la documentación', err);
    }
  }

  async function openDetail(cosecha) {
    setSelected(cosecha);
    setError('');
    setAviso('');
    const [docs, tiradasRes, partesRes] = await Promise.allSettled([
      api(`/api/cosechas/${cosecha.cosechaId}/documentos`),
      api(`/api/cosechas/${cosecha.cosechaId}/tirada-aros`),
      api(`/api/cosechas/${cosecha.cosechaId}/partes`)
    ]);
    setDocumentos(docs.status === 'fulfilled' ? docs.value : []);
    setTiradas(tiradasRes.status === 'fulfilled' ? tiradasRes.value : []);
    setPartes(partesRes.status === 'fulfilled' ? partesRes.value : []);
    setView('detail');
  }

  async function handleSubirDocumento(file) {
    if (!file || !selected) return;
    const data = new FormData();
    data.append('archivo', file);
    try {
      await api(`/api/cosechas/${selected.cosechaId}/documentos`, { method: 'POST', body: data });
      await loadDocumentos(selected.cosechaId);
    } catch (err) {
      mostrarError('No se pudo subir el archivo', err);
    }
  }

  function handleEliminarDocumento(documento) {
    setConfirmacion({
      titulo: 'Eliminar archivo',
      texto: `¿Eliminás ${documento.nombreArchivo}? Esta acción no se puede deshacer.`,
      confirmar: 'Eliminar',
      peligro: true,
      accion: async () => {
        await api(`/api/cosechas/${selected.cosechaId}/documentos/${documento.cosechaDocumentoId}`, { method: 'DELETE' });
        await loadDocumentos(selected.cosechaId);
      }
    });
  }

  async function handleDescargarDocumento(documento) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/cosechas/${selected.cosechaId}/documentos/${documento.cosechaDocumentoId}/descargar`,
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
      mostrarError('No se pudo descargar el archivo', err);
    }
  }

  // -------------------------------------------------------------------
  // Finalizar cosecha (modal)
  // -------------------------------------------------------------------

  async function handleFinalizar(body) {
    setSaving(true);
    try {
      await api(`/api/cosechas/${finalizarTarget.cosechaId}/finalizar`, { method: 'POST', body });
      setAviso(`${finalizarTarget.nombre} quedó Finalizada.`);
      setFinalizarTarget(null);
      if (view === 'list') {
        await loadCosechas();
      } else {
        await refreshSelected(finalizarTarget.cosechaId);
      }
      return null;
    } catch (err) {
      return err.message;
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------
  // Partes diarios
  // -------------------------------------------------------------------

  async function openPartes(cosecha) {
    setSelected(cosecha);
    setParteForm(getEmptyParteForm());
    setEditingParteId(null);
    setError('');
    setAviso('');
    try {
      const [listado, silos] = await Promise.all([
        api(`/api/cosechas/${cosecha.cosechaId}/partes`),
        cosecha.empresaId
          ? api(`/api/almacenamientos/silos-destino?empresaId=${cosecha.empresaId}&producto=${encodeURIComponent(cosecha.producto)}`).catch(() => [])
          : Promise.resolve([])
      ]);
      setPartes(listado);
      setSilosDestino(silos);
      setView('partes');
    } catch (err) {
      mostrarError('No se pudieron cargar los partes', err);
    }
  }

  function updateParteField(field, value) {
    const numericos = ['hectareas', 'kgCosechados', 'humedadPct'];
    if (numericos.includes(field) && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return;
    setParteForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'destino' && value !== 'Silo') next.siloId = '';
      return next;
    });
  }

  function startEditParte(parte) {
    setEditingParteId(parte.cosechaParteId);
    setParteForm({
      fecha: toDateInput(parte.fecha),
      hectareas: String(parte.hectareas),
      kgCosechados: String(parte.kgCosechados),
      humedadPct: String(parte.humedadPct),
      destino: parte.destino,
      siloId: parte.siloId ? String(parte.siloId) : '',
      observaciones: parte.observaciones || ''
    });
  }

  function cancelEditParte() {
    setEditingParteId(null);
    setParteForm(getEmptyParteForm());
  }

  async function handleGuardarParte() {
    setSaving(true);
    setError('');
    try {
      const body = {
        fecha: parteForm.fecha,
        hectareas: Number(parteForm.hectareas),
        kgCosechados: Number(parteForm.kgCosechados),
        humedadPct: Number(parteForm.humedadPct),
        destino: parteForm.destino,
        siloId: parteForm.destino === 'Silo' ? Number(parteForm.siloId) : null,
        observaciones: parteForm.observaciones || null
      };
      if (editingParteId) {
        await api(`/api/cosechas/${selected.cosechaId}/partes/${editingParteId}`, { method: 'PUT', body });
        setAviso('Parte actualizado.');
      } else {
        await api(`/api/cosechas/${selected.cosechaId}/partes`, { method: 'POST', body });
        setAviso(body.destino === 'Silo' ? 'Parte registrado. El grano ingresó al silo en Almacenamiento.' : 'Parte registrado.');
      }
      cancelEditParte();
      setPartes(await api(`/api/cosechas/${selected.cosechaId}/partes`));
      await refreshSelected(selected.cosechaId);
      if (body.destino === 'Silo' && selected.empresaId) {
        // La capacidad libre de los silos cambio con el ingreso.
        setSilosDestino(await api(`/api/almacenamientos/silos-destino?empresaId=${selected.empresaId}&producto=${encodeURIComponent(selected.producto)}`).catch(() => silosDestino));
      }
    } catch (err) {
      mostrarError('No se pudo guardar el parte', err);
    } finally {
      setSaving(false);
    }
  }

  function handleEliminarParte(parte) {
    setConfirmacion({
      titulo: 'Eliminar parte',
      texto: `¿Eliminás el parte del ${formatFecha(parte.fecha)} (${formatNumber(parte.hectareas, ' ha')}, ${formatNumber(parte.kgCosechados, ' kg', 0)})?`,
      confirmar: 'Eliminar',
      peligro: true,
      accion: async () => {
        await api(`/api/cosechas/${selected.cosechaId}/partes/${parte.cosechaParteId}`, { method: 'DELETE' });
        setPartes(await api(`/api/cosechas/${selected.cosechaId}/partes`));
        await refreshSelected(selected.cosechaId);
      }
    });
  }

  // -------------------------------------------------------------------
  // Tirada de Aros
  // -------------------------------------------------------------------

  async function openTirada(cosecha) {
    setSelected(cosecha);
    setEditingTiradaId(null);
    setError('');
    setAviso('');
    try {
      const [listado, params] = await Promise.all([
        api(`/api/cosechas/${cosecha.cosechaId}/tirada-aros`),
        api(`/api/cosechas/${cosecha.cosechaId}/tirada-aros/parametros`)
      ]);
      setTiradas(listado);
      setParametros(params);
      setTiradaForm(getEmptyTiradaForm(params.pmgSiembra ?? params.pmgReferencia, cosecha));
      setView('tirada');
    } catch (err) {
      mostrarError('No se pudo abrir la Tirada de Aros', err);
    }
  }

  function updateTiradaField(field, value) {
    const numericos = ['aroCabezal', 'aroCola1', 'aroCola2', 'aroCola3', 'granosPrecosecha', 'pmg'];
    if (numericos.includes(field) && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return;
    setTiradaForm((current) => ({ ...current, [field]: value }));
  }

  function handlePickPunto(latlng) {
    setTiradaForm((current) => ({ ...current, latitud: latlng.lat.toFixed(6), longitud: latlng.lng.toFixed(6) }));
  }

  function startEditTirada(tirada) {
    setEditingTiradaId(tirada.cosechaTiradaAroId);
    setTiradaForm({
      fecha: toDateInput(tirada.fecha),
      latitud: tirada.latitud ?? '',
      longitud: tirada.longitud ?? '',
      aroCabezal: String(tirada.aroCabezal),
      aroCola1: String(tirada.aroCola1),
      aroCola2: String(tirada.aroCola2),
      aroCola3: String(tirada.aroCola3),
      granosPrecosecha: tirada.granosPrecosecha ?? '',
      pmg: String(tirada.pmg),
      ajustoMaquinaria: Boolean(tirada.ajustoMaquinaria),
      observaciones: tirada.observaciones || ''
    });
  }

  function cancelEditTirada() {
    setEditingTiradaId(null);
    setTiradaForm(getEmptyTiradaForm(parametros?.pmgSiembra ?? parametros?.pmgReferencia, selected));
  }

  async function handleGuardarTirada() {
    setSaving(true);
    setError('');
    try {
      const body = {
        fecha: tiradaForm.fecha,
        latitud: toNumberOrNull(tiradaForm.latitud),
        longitud: toNumberOrNull(tiradaForm.longitud),
        aroCabezal: Number(tiradaForm.aroCabezal),
        aroCola1: Number(tiradaForm.aroCola1),
        aroCola2: Number(tiradaForm.aroCola2),
        aroCola3: Number(tiradaForm.aroCola3),
        granosPrecosecha: toNumberOrNull(tiradaForm.granosPrecosecha),
        pmg: toNumberOrNull(tiradaForm.pmg),
        ajustoMaquinaria: tiradaForm.ajustoMaquinaria,
        observaciones: tiradaForm.observaciones || null
      };
      if (editingTiradaId) {
        await api(`/api/cosechas/${selected.cosechaId}/tirada-aros/${editingTiradaId}`, { method: 'PUT', body });
        setAviso('Tirada actualizada.');
      } else {
        await api(`/api/cosechas/${selected.cosechaId}/tirada-aros`, { method: 'POST', body });
        setAviso('Tirada registrada.');
      }
      cancelEditTirada();
      setTiradas(await api(`/api/cosechas/${selected.cosechaId}/tirada-aros`));
      await refreshSelected(selected.cosechaId);
    } catch (err) {
      mostrarError('No se pudo guardar la tirada', err);
    } finally {
      setSaving(false);
    }
  }

  function handleEliminarTirada(tirada) {
    setConfirmacion({
      titulo: 'Eliminar tirada',
      texto: `¿Eliminás la tirada del ${formatFecha(tirada.fecha)} (${formatNumber(tirada.perdidaTotalKgHa, ' kg/ha', 1)})?`,
      confirmar: 'Eliminar',
      peligro: true,
      accion: async () => {
        await api(`/api/cosechas/${selected.cosechaId}/tirada-aros/${tirada.cosechaTiradaAroId}`, { method: 'DELETE' });
        setTiradas(await api(`/api/cosechas/${selected.cosechaId}/tirada-aros`));
        await refreshSelected(selected.cosechaId);
      }
    });
  }

  function handleFinalizarControl() {
    setConfirmacion({
      titulo: 'Finalizar control de pérdidas',
      texto: `Se cierra el control de ${selected.nombre}: no se podrán agregar, editar ni eliminar tiradas. La cosecha no se finaliza; eso se hace desde su botón de estado.`,
      confirmar: 'Finalizar control',
      accion: async () => {
        await api(`/api/cosechas/${selected.cosechaId}/control/finalizar`, { method: 'POST' });
        await refreshSelected(selected.cosechaId);
        setAviso('Control de pérdidas finalizado.');
      }
    });
  }

  /** Empresa para los parametros desde la consulta: la elegida arriba o, si todas las cosechas son de una sola, esa. */
  function empresaParaParametros() {
    if (selectedEmpresaId) return { empresaId: selectedEmpresaId, nombre: selectedEmpresaName };
    const empresas = [...new Map(cosechas.filter((c) => c.empresaId).map((c) => [c.empresaId, c.empresa])).entries()];
    return empresas.length === 1 ? { empresaId: empresas[0][0], nombre: empresas[0][1] } : null;
  }

  async function openParametros(empresa, producto = null) {
    if (!empresa?.empresaId) {
      setAviso('');
      setError('Elegí una empresa en los filtros superiores para ver sus parámetros de cosecha.');
      return;
    }
    try {
      const lista = await api(`/api/grano-parametros/cosecha?empresaId=${empresa.empresaId}`);
      setError('');
      setParametrosModal({ empresaId: empresa.empresaId, empresaNombre: empresa.nombre, producto, lista });
    } catch (err) {
      mostrarError('No se pudieron cargar las tolerancias', err);
    }
  }

  /** Recarga la tabla del modal y, si hay una Tirada abierta, sus parametros (leyenda y calculo en vivo). */
  async function recargarParametros() {
    const lista = await api(`/api/grano-parametros/cosecha?empresaId=${parametrosModal.empresaId}`);
    setParametrosModal((actual) => ({ ...actual, lista }));
    if (view === 'tirada' && selected) {
      setParametros(await api(`/api/cosechas/${selected.cosechaId}/tirada-aros/parametros`));
    }
  }

  async function guardarParametro(producto, toleranciaKgHa, factorAlta) {
    await api('/api/grano-parametros/cosecha', {
      method: 'PUT',
      body: { empresaId: Number(parametrosModal.empresaId), producto, toleranciaKgHa: Number(toleranciaKgHa), factorAlta: Number(factorAlta) }
    });
    await recargarParametros();
  }

  async function restablecerParametro(parametro) {
    await api(`/api/grano-parametros/cosecha/${parametro.granoParametroCosechaId}`, { method: 'DELETE' });
    await recargarParametros();
  }

  // -------------------------------------------------------------------
  // Confirmaciones
  // -------------------------------------------------------------------

  async function ejecutarConfirmacion() {
    if (!confirmacion) return;
    setSaving(true);
    try {
      await confirmacion.accion();
      setConfirmacion(null);
    } catch (err) {
      setConfirmacion(null);
      mostrarError('No se pudo completar la acción', err);
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  const modales = (
    <>
      {finalizarTarget && (
        <FinalizarCosechaModal
          cosecha={finalizarTarget}
          humedadBase={humedadBaseDe(finalizarTarget.producto)}
          saving={saving}
          onFinalizar={handleFinalizar}
          onCancel={() => setFinalizarTarget(null)}
        />
      )}
      {confirmacion && (
        <ConfirmModal
          {...confirmacion}
          saving={saving}
          onConfirm={ejecutarConfirmacion}
          onCancel={() => setConfirmacion(null)}
        />
      )}
      {parametrosModal && (
        <ParametrosPerdidaModal
          parametros={parametrosModal.lista}
          empresaNombre={parametrosModal.empresaNombre}
          productoActual={parametrosModal.producto}
          editable={permisos.estructura}
          onGuardar={guardarParametro}
          onRestablecer={restablecerParametro}
          onClose={() => setParametrosModal(null)}
        />
      )}
    </>
  );

  const mensajes = (
    <>
      {error && <p className="cos-mensaje cos-mensaje-error" role="alert">{error}</p>}
      {aviso && !error && <p className="cos-mensaje cos-mensaje-ok" role="status">{aviso}</p>}
    </>
  );

  if (view === 'create' || view === 'edit') {
    return (
      <>
        <CosechaForm
          modoEdicion={view === 'edit'}
          cosecha={selected}
          siembras={siembrasDisponibles}
          usuarios={usuarios}
          maquinariaCatalogos={maquinariaCatalogos}
          cosechas={cosechas}
          onAgregarValorMaquinaria={agregarValorMaquinaria}
          form={form}
          documentos={documentos}
          saving={saving}
          mensajes={mensajes}
          humedadBase={selected ? humedadBaseDe(selected.producto) : null}
          onFieldChange={updateField}
          onGuardar={handleGuardar}
          onSubirDocumento={permisos.estructura ? handleSubirDocumento : null}
          onDescargarDocumento={handleDescargarDocumento}
          onEliminarDocumento={permisos.estructura ? handleEliminarDocumento : null}
          onBack={goToList}
        />
        {modales}
      </>
    );
  }

  if (view === 'detail' && selected) {
    return (
      <>
        <CosechaDetalle
          cosecha={selected}
          documentos={documentos}
          tiradas={tiradas}
          partes={partes}
          mensajes={mensajes}
          onDescargarDocumento={handleDescargarDocumento}
          onBack={goToList}
        />
        {modales}
      </>
    );
  }

  if (view === 'partes' && selected) {
    return (
      <>
        <PartesView
          cosecha={selected}
          partes={partes}
          form={parteForm}
          editingParteId={editingParteId}
          silos={silosDestino}
          saving={saving}
          mensajes={mensajes}
          puedeCargar={permisos.registroCampo}
          puedeFinalizar={permisos.estructura}
          onFieldChange={updateParteField}
          onGuardar={handleGuardarParte}
          onEdit={startEditParte}
          onCancelEdit={cancelEditParte}
          onEliminar={handleEliminarParte}
          onFinalizar={() => setFinalizarTarget(selected)}
          onBack={goToList}
        />
        {modales}
      </>
    );
  }

  if (view === 'tirada' && selected) {
    return (
      <>
        <TiradaView
          cosecha={selected}
          lote={loteDe(selected)}
          tiradas={tiradas}
          parametros={parametros}
          form={tiradaForm}
          editingTiradaId={editingTiradaId}
          saving={saving}
          mensajes={mensajes}
          puedeCargar={permisos.registroCampo}
          puedeFinalizarControl={permisos.estructura}
          onFieldChange={updateTiradaField}
          onPickPunto={handlePickPunto}
          onGuardar={handleGuardarTirada}
          onEdit={startEditTirada}
          onCancelEdit={cancelEditTirada}
          onEliminar={handleEliminarTirada}
          onFinalizarControl={handleFinalizarControl}
          onVerParametros={() => openParametros({ empresaId: selected.empresaId, nombre: selected.empresa }, selected.producto)}
          onBack={goToList}
        />
        {modales}
      </>
    );
  }

  return (
    <>
      <CosechasList
        permisos={permisos}
        cosechas={cosechas}
        siembrasDisponibles={siembrasDisponibles}
        lotes={lotes}
        parentFilters={parentFilters}
        selectedEmpresaName={selectedEmpresaName}
        selectedCampaniaName={selectedCampaniaName}
        loading={loading}
        mensajes={mensajes}
        onAdd={startCreate}
        onEdit={openEdit}
        onView={openDetail}
        onPartes={openPartes}
        onTirada={openTirada}
        onParametros={() => openParametros(empresaParaParametros())}
        onFinalize={permisos.estructura ? (cosecha) => setFinalizarTarget(cosecha) : null}
      />
      {modales}
    </>
  );
}

// =====================================================================
// Consulta
// =====================================================================

/** Hectareas cosechadas: las trabajadas si esta finalizada; si no, las de los partes. */
function hectareasCosechadasDe(cosecha) {
  if (cosecha.estado === 'Finalizado') {
    return Number(cosecha.cantidadHectareasTrabajadas ?? cosecha.hectareasCosechadas ?? 0);
  }
  return Number(cosecha.hectareasCosechadas ?? 0);
}

function porcentajeAvance(cosecha) {
  if (cosecha.estado === 'Finalizado') return 100;
  const sembradas = Number(cosecha.hectareasSembradas ?? 0);
  if (!(sembradas > 0)) return 0;
  return Math.min(100, (hectareasCosechadasDe(cosecha) / sembradas) * 100);
}

function CosechasList({ permisos = PERMISOS_TODOS, cosechas, siembrasDisponibles, lotes, parentFilters, selectedEmpresaName, selectedCampaniaName, loading, mensajes, onAdd, onEdit, onView, onPartes, onTirada, onParametros, onFinalize }) {
  const [query, setQuery] = useState('');
  const [productoFilter, setProductoFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [cicloEstacionalFilter, setCicloEstacionalFilter] = useState('');
  const [controlFilter, setControlFilter] = useState('');
  const [mostrarMasFiltros, setMostrarMasFiltros] = useState(false);
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [selected, setSelected] = useState({});

  const productoOptions = useMemo(() => {
    const opciones = new Map();
    cosechas.forEach((cosecha) => {
      const key = grainKey(cosecha.producto);
      if (key && !opciones.has(key)) opciones.set(key, grainLabel(cosecha.producto));
    });
    return [...opciones].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [cosechas]);

  const filtered = useMemo(() => cosechas.filter((cosecha) => {
    const texto = normalizeSearchText(query.trim());
    const camposBusqueda = [
      cosecha.nombre, cosecha.siembraNombre, cosecha.campaniaNombre, cosecha.producto, cosecha.empresa,
      cosecha.loteNombre, cosecha.estado, cosecha.estadoControl, cosecha.responsableACargo, cosecha.contratista
    ];
    const fechaInicio = toDateInput(cosecha.fechaInicio);
    const matchesQuery = !texto || camposBusqueda.some((campo) => normalizeSearchText(campo).includes(texto));
    const matchesGrano = !productoFilter || grainKey(cosecha.producto) === productoFilter;
    const matchesEstado = !estadoFilter || cosecha.estado === estadoFilter;
    const matchesCicloEstacional = !cicloEstacionalFilter || cosecha.cicloEstacional === cicloEstacionalFilter;
    const matchesControl = !controlFilter || cosecha.estadoControl === controlFilter;
    const matchesFrom = !dateFromFilter || fechaInicio >= dateFromFilter;
    const matchesTo = !dateToFilter || fechaInicio <= dateToFilter;
    const matchesEmpresa = !selectedEmpresaName || normalizeSearchText(cosecha.empresa || '') === normalizeSearchText(selectedEmpresaName);
    const matchesCampania = !selectedCampaniaName || normalizeSearchText(cosecha.campaniaNombre || '') === normalizeSearchText(selectedCampaniaName);
    return matchesQuery && matchesGrano && matchesEstado && matchesCicloEstacional && matchesControl && matchesFrom && matchesTo && matchesEmpresa && matchesCampania;
  }), [cosechas, query, productoFilter, estadoFilter, cicloEstacionalFilter, controlFilter, dateFromFilter, dateToFilter, selectedEmpresaName, selectedCampaniaName]);

  const indicadores = useMemo(() => {
    const avance = calcularAvanceApto(siembrasDisponibles, cosechas, lotes, selectedEmpresaName, selectedCampaniaName, cicloEstacionalFilter);

    // Rinde ponderado por grano: kg totales / ha totales de las finalizadas.
    const porGrano = {};
    filtered.forEach((c) => {
      const key = grainKey(c.producto);
      if (!key) return;
      porGrano[key] ??= { grano: grainLabel(c.producto), kg: 0, ha: 0 };
      if (c.estado === 'Finalizado' && c.cantidadGranoCosechado > 0 && c.cantidadHectareasTrabajadas > 0) {
        porGrano[key].kg += Number(c.cantidadGranoCosechado);
        porGrano[key].ha += Number(c.cantidadHectareasTrabajadas);
      }
    });
    const rindes = Object.values(porGrano)
      .map((item) => ({ grano: item.grano, rinde: item.ha > 0 ? item.kg / item.ha : null }))
      .sort((a, b) => a.grano.localeCompare(b.grano));

    const conProductividad = filtered.filter((c) => c.estado === 'Finalizado' && Number(c.hectareasHora) > 0);
    const productividad = conProductividad.length
      ? conProductividad.reduce((sum, c) => sum + Number(c.hectareasHora), 0) / conProductividad.length
      : null;

    const conTiradas = filtered.filter((c) => c.cantidadTiradas > 0 && c.perdidaPromedioKgHa != null);
    const totalTiradas = conTiradas.reduce((sum, c) => sum + c.cantidadTiradas, 0);
    const perdida = totalTiradas
      ? conTiradas.reduce((sum, c) => sum + Number(c.perdidaPromedioKgHa) * c.cantidadTiradas, 0) / totalTiradas
      : null;

    return {
      ...avance,
      rindes,
      productividad,
      productividadCantidad: conProductividad.length,
      perdida,
      totalTiradas
    };
  }, [filtered, cosechas, siembrasDisponibles, lotes, selectedEmpresaName, selectedCampaniaName, cicloEstacionalFilter]);

  function clearFilters() {
    setQuery('');
    setProductoFilter('');
    setEstadoFilter('');
    setCicloEstacionalFilter('');
    setControlFilter('');
    setDateFromFilter('');
    setDateToFilter('');
  }

  const hayFilasSeleccionadas = Object.values(selected).some(Boolean);
  const cantidadFiltrosAvanzados = [dateFromFilter, dateToFilter].filter(Boolean).length;
  const hayFiltrosActivos = Boolean(query.trim() || productoFilter || estadoFilter || cicloEstacionalFilter || controlFilter || cantidadFiltrosAvanzados);

  function toggleSeleccion(cosechaId) {
    setSelected((current) => ({ ...current, [cosechaId]: !current[cosechaId] }));
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Cosechas</h1>
          <p>Registrá cada cosecha, cargá su avance diario y cerrala con la fecha real.</p>
        </div>
        <div className="cos-heading-actions">
          <button className="back-button" type="button" onClick={onParametros} title="Tolerancias de pérdida por grano para la Tirada de Aros">
            <SlidersHorizontal size={17} />
            <span>Parámetros</span>
          </button>
          {permisos.estructura && (
            <button className="green-button add-lote-button" type="button" onClick={onAdd}>
              <PlusCircle size={18} />
              <span>Registrar Cosecha</span>
            </button>
          )}
        </div>
      </div>
      {parentFilters}
      {mensajes}

      <div className="summary-grid summary-grid-four cos-summary-grid">
        <article className="summary-card">
          <div className="summary-icon"><Tractor size={28} /></div>
          <div>
            <span>Avance de cosecha</span>
            <strong>{formatNumber(indicadores.cosechadas, '', 0)} / {formatNumber(indicadores.sembradas, ' ha', 0)}</strong>
            <div className="cos-progress cos-progress-wide" aria-hidden="true"><span style={{ width: `${indicadores.porcentaje}%` }} /></div>
            <small>{formatNumber(indicadores.porcentaje, ' %', 0)} del área apta en la campaña ya cosechada</small>
          </div>
        </article>
        {(indicadores.rindes.length ? indicadores.rindes : [{ grano: null, rinde: null }]).map((item) => (
          <article className="summary-card" key={item.grano || 'sin-rindes'}>
            <div className="summary-icon"><Wheat size={28} /></div>
            <div>
              <span>{item.grano ? `Rinde promedio · ${item.grano}` : 'Rinde promedio por grano'}</span>
              <strong>{item.rinde == null ? 'Sin datos' : formatNumber(item.rinde, ' kg/ha', 0)}</strong>
              <small>{item.rinde == null ? 'Se calcula al finalizar cosechas' : 'Cosechas finalizadas de la campaña'}</small>
            </div>
          </article>
        ))}
        <article className="summary-card">
          <div className="summary-icon"><Gauge size={28} /></div>
          <div>
            <span>Productividad promedio</span>
            <strong>{indicadores.productividad == null ? 'Sin datos' : formatNumber(indicadores.productividad, ' ha/h', 1)}</strong>
            <small>{indicadores.productividadCantidad ? `Sobre ${indicadores.productividadCantidad} cosechas finalizadas` : 'Se informa al finalizar'}</small>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon"><Target size={28} /></div>
          <div>
            <span>Pérdida promedio · Tirada de Aros</span>
            <strong>{indicadores.perdida == null ? 'Sin datos' : formatNumber(indicadores.perdida, ' kg/ha', 0)}</strong>
            <small>{indicadores.totalTiradas ? `Promedio de ${indicadores.totalTiradas} tiradas` : 'Sin tiradas registradas'}</small>
          </div>
        </article>
      </div>

      <div className="filters-card">
        <label className="search-field">
          <Search size={21} />
          <input data-text-case="preserve" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cualquier dato de la cosecha..." aria-label="Buscar cosechas" />
        </label>
        <select value={productoFilter} onChange={(event) => setProductoFilter(event.target.value)} aria-label="Filtrar por grano">
          <option value="">Grano</option>
          {productoOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)} aria-label="Filtrar por estado">
          <option value="">Estado</option>
          <option value="En curso">En curso</option>
          <option value="Finalizado">Finalizado</option>
        </select>
        <select value={cicloEstacionalFilter} onChange={(event) => setCicloEstacionalFilter(event.target.value)} aria-label="Filtrar por ciclo estacional">
          <option value="">Ciclo estacional</option>
          <option value="Verano">Verano</option>
          <option value="Invierno">Invierno</option>
        </select>
        <select value={controlFilter} onChange={(event) => setControlFilter(event.target.value)} aria-label="Filtrar por control de pérdidas">
          <option value="">Control de pérdidas</option>
          <option value="Sin controles">Sin controles</option>
          <option value="En curso">En curso</option>
          <option value="Finalizado">Cerrado</option>
        </select>
        <button className="soft-filter-button" type="button" aria-expanded={mostrarMasFiltros} onClick={() => setMostrarMasFiltros((actual) => !actual)}>
          <Settings2 size={17} />
          <span>Más filtros{cantidadFiltrosAvanzados > 0 ? ` (${cantidadFiltrosAvanzados})` : ""}</span>
        </button>
        <button className="clear-button" type="button" onClick={clearFilters}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
        {mostrarMasFiltros && (
          <fieldset className="siembras-date-filter">
            <legend>Fecha de inicio</legend>
            <label className="field">Desde<input type="date" value={dateFromFilter} max={dateToFilter || undefined} onChange={(event) => setDateFromFilter(event.target.value)} /></label>
            <label className="field">Hasta<input type="date" value={dateToFilter} min={dateFromFilter || undefined} onChange={(event) => setDateToFilter(event.target.value)} /></label>
          </fieldset>
        )}
      </div>

      {loading ? (
        <div className="table-shell dashboard-card"><div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Cargando cosechas...</span></div></div>
      ) : cosechas.length === 0 ? (
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Wheat size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Aún no tenés cosechas registradas</h2>
            <p>Registrá la cosecha de una siembra finalizada para empezar a cargar su avance.</p>
          </div>
          {permisos.estructura && (
            <button className="green-button empty-state-action" type="button" onClick={onAdd}>
              <PlusCircle size={18} />
              <span>Registrar Cosecha</span>
            </button>
          )}
        </section>
      ) : filtered.length === 0 ? (
        <section className="empty-state dashboard-card empty-state-compact">
          <div className="empty-state-icon"><Search size={82} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>{hayFiltrosActivos ? 'No hay cosechas para esos filtros' : 'No hay cosechas para la empresa o campaña seleccionada'}</h2>
            <p>{hayFiltrosActivos ? 'Limpiá los filtros para volver a ver los registros disponibles.' : 'Cambiá la empresa o campaña desde los filtros superiores.'}</p>
          </div>
          {hayFiltrosActivos ? (
            <button className="green-button empty-state-action" type="button" onClick={clearFilters}>
              <RotateCcw size={18} />
              <span>Limpiar filtros</span>
            </button>
          ) : permisos.estructura ? (
            <button className="green-button empty-state-action" type="button" onClick={onAdd}>
              <PlusCircle size={18} />
              <span>Registrar Cosecha</span>
            </button>
          ) : null}
        </section>
      ) : (
        <div className="table-shell dashboard-card">
          <table className="lotes-table cos-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}><span className="cos-sr-only">Seleccionar</span></th>
                <th>Nombre</th>
                <th>Siembra · Lote</th>
                <th>Grano</th>
                <th>Inicio</th>
                <th>Fin real</th>
                <th>Avance</th>
                <th>Rinde</th>
                <th>Control de pérdidas</th>
                <th>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cosecha) => (
                <tr key={cosecha.cosechaId}>
                  <td><input type="checkbox" aria-label={`Seleccionar ${cosecha.nombre}`} checked={Boolean(selected[cosecha.cosechaId])} onChange={() => toggleSeleccion(cosecha.cosechaId)} /></td>
                  <td><strong>{cosecha.nombre}</strong></td>
                  <td><strong className="cos-lote-name">{cosecha.loteNombre}</strong><span className="cos-related-sowing">{cosecha.siembraNombre || '—'}</span></td>
                  <td>{cosecha.producto}</td>
                  <td>{formatFecha(cosecha.fechaInicio)}</td>
                  <td><FechaRealCelda cosecha={cosecha} /></td>
                  <td><AvanceCelda cosecha={cosecha} /></td>
                  <td>
                    {cosecha.rindeKgHa ? <><strong>{formatNumber(cosecha.rindeKgHa, '', 0)}</strong> kg/ha</> : <span className="cos-muted">—</span>}
                    {cosecha.rindeSecoKgHa ? <span className="cos-sub">Seco {formatNumber(cosecha.rindeSecoKgHa, ' kg/ha', 0)}</span> : null}
                  </td>
                  <td><ControlChip cosecha={cosecha} onClick={() => onTirada(cosecha)} /></td>
                  <td><EstadoCosechaButton estado={cosecha.estado} onFinalize={onFinalize ? () => onFinalize(cosecha) : null} /></td>
                  <td className="compact-actions-cell">
                    <div className="actions-cell actions-cell-center">
                      {permisos.estructura && (
                        <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar ${cosecha.nombre}`} onClick={() => onEdit(cosecha)}><Edit size={18} /></button>
                      )}
                      <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label={`Ver ${cosecha.nombre}`} onClick={() => onView(cosecha)}><Eye size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Partes de avance" type="button" aria-label={`Partes de avance de ${cosecha.nombre}`} onClick={() => onPartes(cosecha)}><ClipboardList size={18} /></button>
                      <button className="table-action-tooltip" data-tooltip="Tirada de Aros" type="button" aria-label={`Tirada de Aros de ${cosecha.nombre}`} onClick={() => onTirada(cosecha)}><Target size={18} /></button>
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

function FechaRealCelda({ cosecha }) {
  if (!cosecha.fechaFinReal) return <span className="cos-muted">—</span>;
  const desvio = diasEntre(cosecha.fechaFin, cosecha.fechaFinReal);
  const texto = desvio === 0 ? 'En fecha' : `${desvio > 0 ? '+' : ''}${desvio} días`;
  const justificado = Math.abs(desvio) > DIAS_DESVIO_REQUIERE_JUSTIFICACION;
  return (
    <>
      {formatFecha(cosecha.fechaFinReal)}
      <span className="cos-sub">
        <span className={`cos-chip ${justificado ? 'cos-chip-warn' : 'cos-chip-ok'}`} title={justificado ? cosecha.justificacionDesvioFin || '' : undefined}>
          {texto}{justificado ? ' · justificado' : ''}
        </span>
      </span>
    </>
  );
}

function AvanceCelda({ cosecha }) {
  const porcentaje = porcentajeAvance(cosecha);
  const cosechadas = hectareasCosechadasDe(cosecha);
  return (
    <>
      <div className="cos-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(porcentaje)} aria-label={`Avance de ${cosecha.nombre}`}>
        <span style={{ width: `${porcentaje}%` }} />
      </div>
      <span className="cos-sub">
        {formatNumber(cosechadas, '', 1)} de {formatNumber(cosecha.hectareasSembradas, ' ha', 1)} · {formatNumber(porcentaje, ' %', 0)}
      </span>
    </>
  );
}

function ControlChip({ cosecha, onClick }) {
  const tiradas = cosecha.cantidadTiradas ?? 0;
  const severidad = SEVERIDADES[cosecha.ultimaSeveridad];
  const config = {
    'Sin controles': { clase: 'cos-chip-muted', texto: 'Sin controles' },
    'En curso': { clase: 'cos-chip-info', texto: `En curso · ${tiradas} ${tiradas === 1 ? 'tirada' : 'tiradas'}` },
    Finalizado: { clase: 'cos-chip-done', texto: `Cerrado · ${tiradas} ${tiradas === 1 ? 'tirada' : 'tiradas'}` }
  }[cosecha.estadoControl] ?? { clase: 'cos-chip-muted', texto: cosecha.estadoControl };

  return (
    <button type="button" className={`cos-chip cos-chip-button ${config.clase}`} onClick={onClick} title="Abrir Tirada de Aros">
      {config.texto}
      {severidad && (
        <span className={`cos-sev-dot ${severidad.clase}`} title={`Última tirada: ${cosecha.ultimaSeveridad}`}>{severidad.letra}</span>
      )}
    </button>
  );
}

function EstadoCosechaButton({ estado, onFinalize }) {
  if (estado === 'Finalizado') {
    return <span className="siembra-state-pill siembra-state-done">Finalizado</span>;
  }

  if (!onFinalize) {
    return <span className="siembra-state-pill">En curso</span>;
  }

  return (
    <button className="siembra-state-button" type="button" onClick={onFinalize} title="Finalizar cosecha">
      <span className="state-label-current">En curso</span>
      <span className="state-label-action">Finalizar</span>
    </button>
  );
}

// =====================================================================
// Registrar / editar
// =====================================================================

function FieldRule({ children }) {
  return (
    <span className="field-rule">
      <Info size={14} aria-hidden="true" />
      <span><strong>Regla:</strong> {children}</span>
    </span>
  );
}

function SectionTitle({ icon: Icon, title, description }) {
  return (
    <div className="siembra-section-title">
      <div className="siembra-section-icon"><Icon size={28} /></div>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}

function ResponsableSelect({ usuarios, value, onChange }) {
  const opciones = usuarios.map(nombreCompleto).filter(Boolean);
  const incluyeActual = !value || opciones.includes(value);
  return (
    <select required value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Seleccionar usuario de la empresa</option>
      {!incluyeActual && <option value={value}>{value}</option>}
      {opciones.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}
    </select>
  );
}

/** Validaciones del formulario, alineadas con las de la API. Devuelve { campo: mensaje }. */
function validarCosechaForm(form, { modoEdicion, cosecha, siembra }) {
  const errores = {};
  const finSiembra = modoEdicion ? null : toDateInput(siembra?.fechaFinReal);

  if (!modoEdicion && !form.siembraId) errores.siembraId = 'Seleccioná la siembra a cosechar.';
  if (!form.fechaInicio) {
    errores.fechaInicio = 'La fecha de inicio es obligatoria.';
  } else if (finSiembra && form.fechaInicio < finSiembra) {
    errores.fechaInicio = `No puede ser anterior al fin real de la siembra (${formatFecha(finSiembra)}).`;
  } else if (finPeriodoCampania(siembra?.campaniaNombre || cosecha?.campaniaNombre) && form.fechaInicio > finPeriodoCampania(siembra?.campaniaNombre || cosecha?.campaniaNombre)) {
    errores.fechaInicio = 'No puede superar el fin del período de campaña.';
  }

  if (!form.fechaFin) {
    errores.fechaFin = 'La fecha tentativa de fin es obligatoria.';
  } else if (form.fechaInicio && form.fechaFin < form.fechaInicio) {
    errores.fechaFin = 'No puede ser anterior a la fecha de inicio.';
  } else if (form.fechaInicio && form.fechaFin > sumarMeses(form.fechaInicio, MESES_MAXIMOS_COSECHA)) {
    errores.fechaFin = `No puede superar los ${MESES_MAXIMOS_COSECHA} meses desde el inicio.`;
  }

  if (!form.responsableACargo) errores.responsableACargo = 'Seleccioná el responsable.';
  if (form.anchoCabezalM !== '' && !(Number(form.anchoCabezalM) > 0 && Number(form.anchoCabezalM) <= 30)) {
    errores.anchoCabezalM = 'Debe ser mayor a 0 y hasta 30 m.';
  }

  if (modoEdicion && cosecha?.estado === 'Finalizado') {
    Object.assign(errores, validarResultado(form, cosecha));
  }

  return errores;
}

/** Reglas del resultado (finalizar y editar una cosecha finalizada). */
function validarResultado(datos, cosecha) {
  const errores = {};
  const inicio = toDateInput(datos.fechaInicio || cosecha.fechaInicio);
  const tentativa = toDateInput(datos.fechaFin || cosecha.fechaFin);

  if (!datos.fechaFinReal) {
    errores.fechaFinReal = 'La fecha real es obligatoria.';
  } else if (datos.fechaFinReal < inicio) {
    errores.fechaFinReal = `No puede ser anterior al inicio (${formatFecha(inicio)}).`;
  } else if (datos.fechaFinReal > sumarMeses(inicio, MESES_MAXIMOS_COSECHA)) {
    errores.fechaFinReal = `No puede superar los ${MESES_MAXIMOS_COSECHA} meses desde el inicio.`;
  }

  const desvio = Math.abs(diasEntre(tentativa, datos.fechaFinReal));
  if (datos.fechaFinReal && desvio > DIAS_DESVIO_REQUIERE_JUSTIFICACION && !String(datos.justificacionDesvioFin || '').trim()) {
    errores.justificacionDesvioFin = 'Explicá el desvío respecto de la fecha tentativa.';
  }

  if (!esNumeroPositivo(datos.cantidadGranoCosechado)) errores.cantidadGranoCosechado = 'Debe ser mayor a cero.';
  if (!esNumeroPositivo(datos.cantidadHectareasTrabajadas)) errores.cantidadHectareasTrabajadas = 'Debe ser mayor a cero.';
  if (datos.humedadGrano === '' || Number(datos.humedadGrano) < 0 || Number(datos.humedadGrano) >= 100) errores.humedadGrano = 'Entre 0 y 100 %.';
  if (datos.impurezas !== '' && (Number(datos.impurezas) < 0 || Number(datos.impurezas) >= 100)) errores.impurezas = 'Entre 0 y 100 %.';
  if (!esNumeroPositivo(datos.hectareasHora)) errores.hectareasHora = 'Debe ser mayor a cero.';
  return errores;
}

function CatalogoMaquinariaCampo({ tipo, etiqueta, value, options, onChange, onAgregar, numerico = false, mayusculas = false, placeholder }) {
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const listId = `maquinaria-${tipo}`;
  async function guardar() {
    const valor = mayusculas ? nuevo.trim().toLocaleUpperCase('es') : nuevo.trim();
    if (!valor) { setError('Ingresá un valor.'); return; }
    if (numerico && (!(Number(valor) > 0) || Number(valor) > 30)) {
      setError('Debe ser mayor a 0 y hasta 30 m.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const guardado = await onAgregar(tipo, valor);
      onChange(guardado);
      setAbierto(false);
      setNuevo('');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }
  return <>
    <div className="cos-catalog-field">
      <input type={numerico ? 'number' : 'text'} list={listId} min={numerico ? '0.1' : undefined} max={numerico ? '30' : undefined} step={numerico ? '0.1' : undefined} maxLength={numerico ? undefined : 150} value={value} onChange={(event) => onChange(mayusculas ? event.target.value.toLocaleUpperCase('es') : event.target.value)} placeholder={placeholder} />
      <datalist id={listId}>{options.map((opcion) => <option key={opcion} value={opcion} />)}</datalist>
      <button className="back-button cos-catalog-add" type="button" onClick={() => { setNuevo(String(value || '')); setError(''); setAbierto(true); }}><PlusCircle size={16} />Guardar valor</button>
    </div>
    {abierto && createPortal(<div className="confirmation-modal-backdrop" role="presentation"><section className="confirmation-modal" role="dialog" aria-modal="true" aria-label={`Guardar ${etiqueta}`}>
      <h2>Guardar {etiqueta}</h2>
      <p>Quedará disponible para futuras cosechas.</p>
      <input autoFocus type={numerico ? 'number' : 'text'} min={numerico ? '0.1' : undefined} max={numerico ? '30' : undefined} step={numerico ? '0.1' : undefined} maxLength={numerico ? undefined : 100} value={nuevo} onChange={(event) => setNuevo(mayusculas ? event.target.value.toLocaleUpperCase('es') : event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') guardar(); }} />
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="confirmation-modal-actions"><button className="back-button" type="button" onClick={() => setAbierto(false)}>Cancelar</button><button className="green-button" type="button" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando...' : 'Guardar valor'}</button></div>
    </section></div>, document.body)}
  </>;
}

function CosechaForm({
  modoEdicion,
  cosecha,
  siembras,
  usuarios,
  maquinariaCatalogos,
  cosechas,
  onAgregarValorMaquinaria,
  form,
  documentos,
  saving,
  mensajes,
  humedadBase,
  onFieldChange,
  onGuardar,
  onSubirDocumento,
  onDescargarDocumento,
  onEliminarDocumento,
  onBack
}) {
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const siembra = modoEdicion ? null : siembras.find((item) => String(item.siembraId) === String(form.siembraId));
  const finalizada = modoEdicion && cosecha?.estado === 'Finalizado';
  const errores = validarCosechaForm(form, { modoEdicion, cosecha, siembra });
  const hayErrores = Object.keys(errores).length > 0;
  const mostrarError = (campo) => (intentoGuardar || form[campo] !== '') && errores[campo]
    ? <span className="field-error">{errores[campo]}</span>
    : null;

  const heredados = modoEdicion
    ? {
      campania: cosecha?.campaniaNombre, lote: cosecha?.loteNombre, grano: cosecha?.producto,
      hectareas: cosecha?.hectareasSembradas, finSiembra: null, empresa: cosecha?.empresa
    }
    : {
      campania: siembra?.campaniaNombre, lote: siembra?.loteNombre, grano: siembra?.producto,
      hectareas: siembra?.hectareasSembradas, finSiembra: siembra?.fechaFinReal, empresa: siembra?.empresa
    };

  const opcionesMaquinaria = (tipo, campo) => [...new Set([
    ...maquinariaCatalogos.filter((item) => item.tipo === tipo).map((item) => item.nombre),
    ...cosechas.map((item) => item[campo]).filter(Boolean).map(String)
  ])].sort((a, b) => a.localeCompare(b, 'es'));

  const rinde = esNumeroPositivo(form.cantidadGranoCosechado) && esNumeroPositivo(form.cantidadHectareasTrabajadas)
    ? Number(form.cantidadGranoCosechado) / Number(form.cantidadHectareasTrabajadas)
    : null;
  const rindeSeco = calcularRindeSeco(rinde, form.humedadGrano, humedadBase);
  const desvio = finalizada && form.fechaFinReal ? diasEntre(form.fechaFin, form.fechaFinReal) : 0;

  function guardar() {
    setIntentoGuardar(true);
    if (!hayErrores) onGuardar();
  }

  return (
    <section className="content-panel create-panel cos-page">
      <div className="page-heading create-heading">
        <div>
          <h1>{modoEdicion ? `Editar ${cosecha?.nombre}` : 'Registrar cosecha'}</h1>
          <p>{modoEdicion
            ? `${cosecha?.loteNombre} · ${cosecha?.producto} · ${cosecha?.estado}`
            : 'Al guardar queda En curso con su fecha tentativa. El resultado se carga con los partes diarios y al finalizar.'}</p>
        </div>
      </div>

      {mensajes}

      <div className="siembra-step-card dashboard-card">
        <SectionTitle icon={Wheat} title="Siembra asociada" description="La cosecha hereda lote, grano, campaña y empresa de la siembra." />
        {!modoEdicion && (
          <label className="field cos-field-wide">
            <span className="field-label">Siembra a cosechar <b>*</b></span>
            <select required value={form.siembraId} onChange={(event) => onFieldChange('siembraId', event.target.value)}>
              <option value="">{siembras.length ? 'Seleccionar siembra' : 'No hay siembras finalizadas pendientes de cosecha'}</option>
              {siembras.map((item) => (
                <option key={item.siembraId} value={item.siembraId}>
                  {item.nombre} · {item.loteNombre} · {item.producto}{item.tipoRegistro === 'Resiembra' ? ' (resiembra)' : ''} — finalizada el {formatFecha(item.fechaFinReal)}
                </option>
              ))}
            </select>
            {mostrarError('siembraId')}
            <FieldRule>{COSECHA_FIELD_RULES.siembra}</FieldRule>
          </label>
        )}
        <div className="create-grid cos-grid-auto">
          <label className="field">Campaña<input readOnly value={heredados.campania || '-'} /></label>
          <label className="field">Lote<input readOnly value={heredados.lote || '-'} /></label>
          <label className="field">Grano<input readOnly value={heredados.grano || '-'} /></label>
          <label className="field">Hectáreas sembradas<input readOnly value={formatNumber(heredados.hectareas, ' ha')} /></label>
          {!modoEdicion && <label className="field">Fin real de siembra<input readOnly value={formatFecha(heredados.finSiembra)} /></label>}
          <label className="field">Empresa<input readOnly value={heredados.empresa || '-'} /></label>
        </div>
        <FieldRule>{COSECHA_FIELD_RULES.heredados}</FieldRule>
      </div>

      <div className="siembra-step-card dashboard-card">
        <SectionTitle icon={ClipboardList} title="Fechas y responsable" />
        <div className="create-grid cos-grid-auto">
          <label className="field">
            <span className="field-label">Fecha de inicio <b>*</b></span>
            <input type="date" required min={toDateInput(heredados.finSiembra) || undefined} max={finPeriodoCampania(heredados.campania) || undefined} value={form.fechaInicio} onChange={(event) => onFieldChange('fechaInicio', event.target.value)} />
            {mostrarError('fechaInicio')}
            <FieldRule>{COSECHA_FIELD_RULES.fechaInicio(heredados.finSiembra, finPeriodoCampania(heredados.campania))}</FieldRule>
          </label>
          <label className="field">
            <span className="field-label">Fecha tentativa de fin <b>*</b></span>
            <input type="date" required min={form.fechaInicio || undefined} max={form.fechaInicio ? sumarMeses(form.fechaInicio, MESES_MAXIMOS_COSECHA) : undefined} value={form.fechaFin} onChange={(event) => onFieldChange('fechaFin', event.target.value)} />
            {mostrarError('fechaFin')}
            <FieldRule>{COSECHA_FIELD_RULES.fechaFin}</FieldRule>
          </label>
          <label className="field">
            <span className="field-label">Responsable a cargo <b>*</b></span>
            <ResponsableSelect usuarios={usuarios} value={form.responsableACargo} onChange={(valor) => onFieldChange('responsableACargo', valor)} />
            {mostrarError('responsableACargo')}
            <FieldRule>{COSECHA_FIELD_RULES.responsable}</FieldRule>
          </label>
        </div>
      </div>

      <div className="siembra-step-card dashboard-card">
        <SectionTitle icon={Tractor} title="Maquinaria" description="Opcional." />
        <fieldset className="cos-radio-group">
          <legend>Tipo de servicio</legend>
          {['', 'Propia', 'Contratada'].map((opcion) => (
            <label key={opcion || 'sin-dato'} className={`cos-radio ${form.tipoServicio === opcion ? 'cos-radio-on' : ''}`}>
              <input type="radio" name="tipoServicio" checked={form.tipoServicio === opcion} onChange={() => onFieldChange('tipoServicio', opcion)} />
              {opcion || 'Sin dato'}
            </label>
          ))}
        </fieldset>
        {form.tipoServicio && <div className="create-grid cos-grid-auto">
          {form.tipoServicio === 'Contratada' && (
            <div className="field"><span className="field-label">Contratista</span><CatalogoMaquinariaCampo tipo="ContratistaCosecha" etiqueta="contratista" value={form.contratista} options={opcionesMaquinaria('ContratistaCosecha', 'contratista')} onChange={(valor) => onFieldChange('contratista', valor)} onAgregar={onAgregarValorMaquinaria} placeholder="Nombre del contratista" /></div>
          )}
          <div className="field"><span className="field-label">Cosechadora</span><CatalogoMaquinariaCampo tipo="Cosechadora" etiqueta="cosechadora" mayusculas value={form.cosechadora} options={opcionesMaquinaria('Cosechadora', 'cosechadora')} onChange={(valor) => onFieldChange('cosechadora', valor)} onAgregar={onAgregarValorMaquinaria} placeholder="Marca y modelo" /></div>
          <div className="field">
            <span className="field-label">Ancho de cabezal (m)</span>
            <CatalogoMaquinariaCampo tipo="AnchoCabezalCosecha" etiqueta="ancho de cabezal" numerico value={form.anchoCabezalM} options={opcionesMaquinaria('AnchoCabezalCosecha', 'anchoCabezalM')} onChange={(valor) => onFieldChange('anchoCabezalM', valor)} onAgregar={onAgregarValorMaquinaria} placeholder="Ej. 9" />
            {mostrarError('anchoCabezalM')}
          </div>
        </div>}
        {form.tipoServicio && <FieldRule>{COSECHA_FIELD_RULES.maquinaria}</FieldRule>}
      </div>

      {finalizada && (
        <div className="siembra-step-card dashboard-card">
          <SectionTitle icon={CheckCircle2} title="Resultado de cosecha" description="La cosecha está finalizada: podés corregir el resultado." />
          <div className="create-grid cos-grid-auto">
            <label className="field">
              <span className="field-label">Fecha real de finalización <b>*</b></span>
              <input type="date" required min={form.fechaInicio || undefined} max={form.fechaInicio ? sumarMeses(form.fechaInicio, MESES_MAXIMOS_COSECHA) : undefined} value={form.fechaFinReal} onChange={(event) => onFieldChange('fechaFinReal', event.target.value)} />
              {desvio !== 0 && <span className={`cos-chip ${Math.abs(desvio) > DIAS_DESVIO_REQUIERE_JUSTIFICACION ? 'cos-chip-warn' : 'cos-chip-ok'}`}>{desvio > 0 ? '+' : ''}{desvio} días respecto de la tentativa</span>}
              {mostrarError('fechaFinReal')}
              <FieldRule>{COSECHA_FIELD_RULES.fechaFinReal}</FieldRule>
            </label>
            <label className="field">
              <span className="field-label">Hectáreas por hora <b>*</b></span>
              <input type="number" min="0" step="0.1" value={form.hectareasHora} onChange={(event) => onFieldChange('hectareasHora', event.target.value)} />
              {mostrarError('hectareasHora')}
            </label>
            <label className="field">
              <span className="field-label">Grano cosechado (kg) <b>*</b></span>
              <input type="number" min="0" step="1" value={form.cantidadGranoCosechado} onChange={(event) => onFieldChange('cantidadGranoCosechado', event.target.value)} />
              {mostrarError('cantidadGranoCosechado')}
            </label>
            <label className="field">
              <span className="field-label">Hectáreas trabajadas <b>*</b></span>
              <input type="number" min="0" step="0.01" value={form.cantidadHectareasTrabajadas} onChange={(event) => onFieldChange('cantidadHectareasTrabajadas', event.target.value)} />
              {mostrarError('cantidadHectareasTrabajadas')}
            </label>
            <label className="field">
              <span className="field-label">Humedad del grano (%) <b>*</b></span>
              <input type="number" min="0" max="99.99" step="0.1" value={form.humedadGrano} onChange={(event) => onFieldChange('humedadGrano', event.target.value)} />
              {mostrarError('humedadGrano')}
            </label>
            <label className="field">
              Impurezas (%)
              <input type="number" min="0" max="99.99" step="0.1" value={form.impurezas} onChange={(event) => onFieldChange('impurezas', event.target.value)} />
              {mostrarError('impurezas')}
            </label>
            <label className="field">Rinde húmedo<input readOnly value={formatNumber(rinde, ' kg/ha', 0)} /><FieldRule>{COSECHA_FIELD_RULES.rinde}</FieldRule></label>
            <label className="field">Rinde seco<input readOnly value={humedadBase == null ? 'Sin humedad base para el grano' : formatNumber(rindeSeco, ' kg/ha', 0)} /><FieldRule>{COSECHA_FIELD_RULES.rindeSeco}{humedadBase != null ? ` Base: ${formatNumber(humedadBase, ' %', 1)}.` : ''}</FieldRule></label>
          </div>
          {Math.abs(desvio) > DIAS_DESVIO_REQUIERE_JUSTIFICACION && (
            <label className="field cos-field-wide">
              <span className="field-label">Justificación del desvío <b>*</b></span>
              <textarea maxLength={1000} value={form.justificacionDesvioFin} onChange={(event) => onFieldChange('justificacionDesvioFin', event.target.value)} placeholder="Explicá por qué la fecha real se alejó de la tentativa." />
              {mostrarError('justificacionDesvioFin')}
            </label>
          )}
        </div>
      )}

      {modoEdicion && (
        <div className="siembra-step-card dashboard-card">
          <SectionTitle icon={Download} title="Documentación" description="Formatos sugeridos: PDF, JPG, PNG y XLSX." />
          <DocumentosSection documentos={documentos} onSubir={onSubirDocumento} onDescargar={onDescargarDocumento} onEliminar={onEliminarDocumento} />
        </div>
      )}

      <div className="form-actions">
        <button className="green-button" type="button" disabled={saving} onClick={guardar}>
          <Save size={17} />
          {saving ? 'Guardando...' : modoEdicion ? 'Guardar cambios' : 'Registrar'}
        </button>
        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
        {intentoGuardar && hayErrores && <span className="field-error">Revisá los campos marcados.</span>}
      </div>
    </section>
  );
}

function DocumentosSection({ documentos, onSubir, onDescargar, onEliminar }) {
  return (
    <>
      {onSubir && (
        <label className="cos-upload">
          <input type="file" onChange={(event) => { onSubir(event.target.files?.[0]); event.target.value = ''; }} />
          <span>Arrastrá un archivo o hacé clic para subir</span>
        </label>
      )}
      <div className="table-shell">
        <table className="lotes-table">
          <thead>
            <tr><th>Nombre</th><th>Fecha de carga</th><th>Cargado por</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {documentos.map((doc) => (
              <tr key={doc.cosechaDocumentoId}>
                <td>{doc.nombreArchivo}</td>
                <td>{formatFecha(doc.fechaCarga)}</td>
                <td>{doc.cargadoPor || '-'}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label={`Descargar ${doc.nombreArchivo}`} onClick={() => onDescargar(doc)}><Download size={18} /></button>
                  {onEliminar && <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label={`Eliminar ${doc.nombreArchivo}`} onClick={() => onEliminar(doc)}><Trash2 size={18} /></button>}
                </td>
              </tr>
            ))}
            {documentos.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin archivos adjuntos.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// =====================================================================
// Modales
// =====================================================================

function FinalizarCosechaModal({ cosecha, humedadBase, saving, onFinalizar, onCancel }) {
  // Se precarga con lo acumulado en los partes diarios; todo queda editable.
  const [datos, setDatos] = useState(() => ({
    fechaFinReal: toDateInput(cosecha.fechaFin),
    justificacionDesvioFin: '',
    cantidadGranoCosechado: cosecha.kgAcumulados > 0 ? String(Math.round(cosecha.kgAcumulados)) : '',
    rindeIngresado: calcularRindeKgHa(cosecha.kgAcumulados > 0 ? Math.round(cosecha.kgAcumulados) : '', cosecha.hectareasCosechadas > 0 ? cosecha.hectareasCosechadas : cosecha.hectareasSembradas),
    cantidadHectareasTrabajadas: cosecha.hectareasCosechadas > 0
      ? String(cosecha.hectareasCosechadas)
      : cosecha.hectareasSembradas ? String(cosecha.hectareasSembradas) : '',
    humedadGrano: cosecha.humedadPromedioPct != null ? String(Math.round(cosecha.humedadPromedioPct * 10) / 10) : '',
    impurezas: '',
    hectareasHora: '',
    finalizarControl: cosecha.estadoControl === 'En curso'
  }));
  const [origenResultado, setOrigenResultado] = useState('total');
  const [intento, setIntento] = useState(false);
  const [errorApi, setErrorApi] = useState('');

  const errores = validarResultado({ ...datos, fechaInicio: cosecha.fechaInicio, fechaFin: cosecha.fechaFin }, cosecha);
  if (cosecha.kgASilo > 0 && Number(datos.cantidadGranoCosechado) < cosecha.kgASilo) {
    errores.cantidadGranoCosechado = `No puede ser menor a lo que ya ingresó a silos (${formatNumber(cosecha.kgASilo, ' kg', 0)}).`;
  }

  const desvio = diasEntre(cosecha.fechaFin, datos.fechaFinReal);
  const requiereJustificacion = Math.abs(desvio) > DIAS_DESVIO_REQUIERE_JUSTIFICACION;
  const rinde = esNumeroPositivo(datos.cantidadGranoCosechado) && esNumeroPositivo(datos.cantidadHectareasTrabajadas)
    ? Number(datos.cantidadGranoCosechado) / Number(datos.cantidadHectareasTrabajadas)
    : null;
  const rindeSeco = calcularRindeSeco(rinde, datos.humedadGrano, humedadBase);
  const sugeridoDePartes = cosecha.cantidadPartes > 0;

  function cambiar(campo, valor) {
    if (campo === 'cantidadGranoCosechado' || campo === 'rindeIngresado') valor = parsearEnteroConMiles(valor);
    const numericos = ['cantidadGranoCosechado', 'rindeIngresado', 'cantidadHectareasTrabajadas', 'humedadGrano', 'impurezas', 'hectareasHora'];
    if (numericos.includes(campo) && valor !== '' && (!Number.isFinite(Number(valor)) || Number(valor) < 0)) return;
    if (campo === 'cantidadGranoCosechado') setOrigenResultado('total');
    if (campo === 'rindeIngresado') setOrigenResultado('rinde');
    setDatos((actual) => {
      const siguiente = { ...actual, [campo]: valor };
      if (campo === 'cantidadGranoCosechado') {
        siguiente.rindeIngresado = calcularRindeKgHa(valor, actual.cantidadHectareasTrabajadas);
      } else if (campo === 'rindeIngresado') {
        siguiente.cantidadGranoCosechado = calcularKgCosechados(valor, actual.cantidadHectareasTrabajadas);
      } else if (campo === 'cantidadHectareasTrabajadas') {
        if (origenResultado === 'rinde') {
          siguiente.cantidadGranoCosechado = calcularKgCosechados(actual.rindeIngresado, valor);
        } else {
          siguiente.rindeIngresado = calcularRindeKgHa(actual.cantidadGranoCosechado, valor);
        }
      }
      return siguiente;
    });
  }

  const mostrar = (campo) => intento && errores[campo] ? <span className="field-error">{errores[campo]}</span> : null;

  async function confirmar() {
    setIntento(true);
    setErrorApi('');
    if (Object.keys(errores).length > 0) return;

    const mensaje = await onFinalizar({
      fechaFinReal: datos.fechaFinReal,
      justificacionDesvioFin: requiereJustificacion ? datos.justificacionDesvioFin : null,
      cantidadGranoCosechado: Number(datos.cantidadGranoCosechado),
      cantidadHectareasTrabajadas: Number(datos.cantidadHectareasTrabajadas),
      humedadGrano: Number(datos.humedadGrano),
      impurezas: toNumberOrNull(datos.impurezas),
      hectareasHora: Number(datos.hectareasHora),
      finalizarControl: datos.finalizarControl
    });
    if (mensaje) setErrorApi(mensaje);
  }

  return createPortal(
    <div className="cosecha-warning-modal-backdrop" role="presentation">
      <section className="cos-modal" role="dialog" aria-modal="true" aria-labelledby="cos-finalizar-titulo">
        <div className="cos-modal-header">
          <div className="cos-modal-icon"><Flag size={24} /></div>
          <div>
            <h2 id="cos-finalizar-titulo">Finalizar cosecha</h2>
            <p>{cosecha.nombre} · {cosecha.loteNombre} · {cosecha.producto}{cosecha.campaniaNombre ? ` · ${cosecha.campaniaNombre}` : ''}</p>
          </div>
          <button className="cos-icon-button" type="button" aria-label="Cerrar" onClick={onCancel}><X size={18} /></button>
        </div>

        <div className="cos-modal-summary">
          <div><span>Fecha de inicio</span><strong>{formatFecha(cosecha.fechaInicio)}</strong></div>
          <div><span>Fecha tentativa de fin</span><strong>{formatFecha(cosecha.fechaFin)}</strong></div>
          <div><span>Partes de avance</span><strong>{cosecha.cantidadPartes || 0} cargados</strong></div>
          <div><span>Superficie</span><strong>{formatNumber(cosecha.hectareasCosechadas, '', 1)} de {formatNumber(cosecha.hectareasSembradas, ' ha', 1)}</strong></div>
        </div>

        {errorApi && <p className="cos-mensaje cos-mensaje-error" role="alert">{errorApi}</p>}

        <h3 className="cos-section-title">Cierre</h3>
        <div className="cos-modal-grid cos-modal-grid-2">
          <label className="field">
            <span className="field-label">Fecha real de finalización <b>*</b></span>
            <input type="date" autoFocus min={toDateInput(cosecha.fechaInicio)} max={sumarMeses(toDateInput(cosecha.fechaInicio), MESES_MAXIMOS_COSECHA)} value={datos.fechaFinReal} onChange={(event) => cambiar('fechaFinReal', event.target.value)} />
            {datos.fechaFinReal && desvio !== 0 && (
              <span className={`cos-chip ${requiereJustificacion ? 'cos-chip-warn' : 'cos-chip-ok'}`}>
                {Math.abs(desvio)} {Math.abs(desvio) === 1 ? 'día' : 'días'} {desvio > 0 ? 'después' : 'antes'} de la fecha tentativa
              </span>
            )}
            {mostrar('fechaFinReal')}
            <FieldRule>{COSECHA_FIELD_RULES.fechaFinReal}</FieldRule>
          </label>
          <label className="field">
            <span className="field-label">Hectáreas por hora promedio <b>*</b></span>
            <input type="number" min="0" step="0.1" value={datos.hectareasHora} onChange={(event) => cambiar('hectareasHora', event.target.value)} />
            {mostrar('hectareasHora')}
            <FieldRule>{COSECHA_FIELD_RULES.hectareasHora}</FieldRule>
          </label>
        </div>

        <div className="cos-section-row">
          <h3 className="cos-section-title">Resultado</h3>
          {sugeridoDePartes && <span className="cos-chip cos-chip-ok">Sugerido desde los partes diarios · editable</span>}
        </div>
        <div className="cos-modal-grid cos-modal-grid-3">
          <label className="field">
            <span className="field-label">Total cosechado (kg) <b>*</b></span>
            <input type="text" inputMode="numeric" value={formatearEnteroConMiles(datos.cantidadGranoCosechado)} onChange={(event) => cambiar('cantidadGranoCosechado', event.target.value)} />
            {mostrar('cantidadGranoCosechado')}
            <span className="cos-hint">Ingresá el total o el rinde; el otro valor se calcula automáticamente.</span>
          </label>
          <label className="field">
            <span className="field-label">Hectáreas trabajadas <b>*</b></span>
            <input type="number" min="0" step="0.01" value={datos.cantidadHectareasTrabajadas} onChange={(event) => cambiar('cantidadHectareasTrabajadas', event.target.value)} />
            {mostrar('cantidadHectareasTrabajadas')}
          </label>
          <label className="field">
            <span className="field-label">Rinde promedio (kg/ha) <b>*</b></span>
            <input type="text" inputMode="numeric" value={formatearEnteroConMiles(datos.rindeIngresado)} onChange={(event) => cambiar('rindeIngresado', event.target.value)} />
            <span className="cos-hint">Rinde húmedo: kg ÷ ha.</span>
          </label>
          <label className="field">
            <span className="field-label">Humedad del grano (%) <b>*</b></span>
            <input type="number" min="0" max="99.99" step="0.1" value={datos.humedadGrano} onChange={(event) => cambiar('humedadGrano', event.target.value)} />
            {mostrar('humedadGrano')}
          </label>
          <label className="field">
            Impurezas (%)
            <input type="number" min="0" max="99.99" step="0.1" value={datos.impurezas} onChange={(event) => cambiar('impurezas', event.target.value)} />
            {mostrar('impurezas')}
          </label>
          <label className="field">
            Rinde seco
            <input readOnly value={humedadBase == null ? 'Sin base para el grano' : formatNumber(rindeSeco, ' kg/ha', 0)} />
            <span className="cos-hint">{humedadBase == null ? 'No hay humedad base cargada.' : `A humedad base ${formatNumber(humedadBase, ' %', 1)}.`}</span>
          </label>
        </div>

        {requiereJustificacion && (
          <label className="field">
            <span className="field-label">Justificación del desvío <b>*</b></span>
            <textarea maxLength={1000} value={datos.justificacionDesvioFin} onChange={(event) => cambiar('justificacionDesvioFin', event.target.value)} placeholder="Explicá por qué la fecha real se alejó de la tentativa (lluvias, rotura de máquina...)." />
            {mostrar('justificacionDesvioFin')}
          </label>
        )}

        {cosecha.estadoControl === 'En curso' && (
          <label className="cos-checkbox">
            <input type="checkbox" checked={datos.finalizarControl} onChange={(event) => cambiar('finalizarControl', event.target.checked)} />
            <span>Cerrar también el control de pérdidas ({cosecha.cantidadTiradas} {cosecha.cantidadTiradas === 1 ? 'tirada' : 'tiradas'})</span>
          </label>
        )}
        {cosecha.estadoControl !== 'Finalizado' && !datos.finalizarControl && (
          <p className="cos-hint">La Tirada de Aros sigue disponible después de finalizar, hasta que cierres el control.</p>
        )}

        <div className="form-actions modal-actions">
          <button className="back-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="green-button" type="button" onClick={confirmar} disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}
            {saving ? 'Finalizando...' : 'Finalizar cosecha'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function ConfirmModal({ titulo, texto, confirmar = 'Confirmar', peligro = false, saving, onConfirm, onCancel }) {
  return createPortal(
    <div className="confirmation-modal-backdrop" role="presentation">
      <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="cos-confirm-titulo">
        <h2 id="cos-confirm-titulo">{titulo}</h2>
        <p>{texto}</p>
        <div className="confirmation-modal-actions">
          <button className="back-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className={`green-button ${peligro ? 'cos-button-danger' : ''}`} type="button" onClick={onConfirm} disabled={saving}>
            {saving ? 'Procesando...' : confirmar}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function ParametrosPerdidaModal({ parametros, empresaNombre, productoActual, editable, onGuardar, onRestablecer, onClose }) {
  const [edicion, setEdicion] = useState(null);
  const [errorLocal, setErrorLocal] = useState('');
  const [guardando, setGuardando] = useState(false);
  const granoActual = normalizeSearchText(productoActual);
  const tieneGranoActual = parametros.some((item) => normalizeSearchText(item.producto) === granoActual);

  function editar(item) {
    setErrorLocal('');
    setEdicion({ producto: item.producto, toleranciaKgHa: String(item.toleranciaKgHa), factorAlta: String(item.factorAlta) });
  }

  async function guardar() {
    const tolerancia = Number(edicion.toleranciaKgHa);
    const factor = Number(edicion.factorAlta);
    if (!(tolerancia > 0 && tolerancia <= 1000)) return setErrorLocal('La tolerancia debe ser mayor a 0 y hasta 1000 kg/ha.');
    if (!(factor > 1 && factor <= 5)) return setErrorLocal('El factor de severidad debe ser mayor a 1 y hasta 5.');
    setGuardando(true);
    try {
      await onGuardar(edicion.producto, tolerancia, factor);
      setEdicion(null);
    } catch (err) {
      setErrorLocal(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function restablecer(item) {
    setGuardando(true);
    try {
      await onRestablecer(item);
    } catch (err) {
      setErrorLocal(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return createPortal(
    <div className="cosecha-warning-modal-backdrop" role="presentation">
      <section className="cos-modal" role="dialog" aria-modal="true" aria-labelledby="cos-parametros-titulo">
        <div className="cos-modal-header">
          <div className="cos-modal-icon"><Settings2 size={24} /></div>
          <div>
            <h2 id="cos-parametros-titulo">Parámetros de cosecha{empresaNombre ? ` · ${empresaNombre}` : ''}</h2>
            <p>Tolerancias de pérdida para la Tirada de Aros. Baja hasta la tolerancia · Media hasta tolerancia × factor · Alta por encima. Referencia: INTA PRECOP.</p>
          </div>
          <button className="cos-icon-button" type="button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>

        {errorLocal && <p className="cos-mensaje cos-mensaje-error" role="alert">{errorLocal}</p>}
        {!editable && <p className="cos-hint">Solo el Gerente o el Encargado de la empresa pueden ajustar estos valores.</p>}

        <div className="table-shell">
          <table className="lotes-table">
            <thead>
              <tr><th>Grano</th><th>Tolerancia</th><th>Factor</th><th>Media hasta</th><th>Origen</th>{editable && <th>Acciones</th>}</tr>
            </thead>
            <tbody>
              {parametros.map((item) => {
                const enEdicion = edicion?.producto === item.producto;
                return (
                  <tr key={item.producto} className={normalizeSearchText(item.producto) === granoActual ? 'cos-row-highlight' : ''}>
                    <td><strong>{item.producto}</strong></td>
                    <td>
                      {enEdicion
                        ? <input className="cos-input-small" type="number" min="1" step="1" aria-label={`Tolerancia de ${item.producto}`} value={edicion.toleranciaKgHa} onChange={(event) => setEdicion((actual) => ({ ...actual, toleranciaKgHa: event.target.value }))} />
                        : formatNumber(item.toleranciaKgHa, ' kg/ha', 0)}
                    </td>
                    <td>
                      {enEdicion
                        ? <input className="cos-input-small" type="number" min="1.05" max="5" step="0.05" aria-label={`Factor de ${item.producto}`} value={edicion.factorAlta} onChange={(event) => setEdicion((actual) => ({ ...actual, factorAlta: event.target.value }))} />
                        : `× ${formatNumber(item.factorAlta, '', 2)}`}
                    </td>
                    <td>{formatNumber(item.limiteMediaKgHa, ' kg/ha', 0)}</td>
                    <td>
                      {item.personalizado
                        ? <span className="cos-chip cos-chip-info" title={item.toleranciaReferenciaKgHa ? `Referencia: ${formatNumber(item.toleranciaReferenciaKgHa, ' kg/ha', 0)}` : undefined}>Ajuste de la empresa</span>
                        : <span className="cos-chip cos-chip-muted" title={item.fuenteReferencia || undefined}>Referencia</span>}
                    </td>
                    {editable && (
                      <td className="actions-cell">
                        {enEdicion ? (
                          <>
                            <button className="green-button cos-button-small" type="button" disabled={guardando} onClick={guardar}>Guardar</button>
                            <button className="back-button cos-button-small" type="button" disabled={guardando} onClick={() => setEdicion(null)}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            <button className="table-action-tooltip" data-tooltip="Ajustar" type="button" aria-label={`Ajustar ${item.producto}`} onClick={() => editar(item)}><Edit size={18} /></button>
                            {item.personalizado && (
                              <button className="table-action-tooltip" data-tooltip="Volver a la referencia" type="button" aria-label={`Volver a la referencia de ${item.producto}`} disabled={guardando} onClick={() => restablecer(item)}><RotateCcw size={18} /></button>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!tieneGranoActual && productoActual && (
          <div className="cos-banner cos-banner-warn">
            <AlertTriangle size={18} />
            <span>{productoActual} no tiene tolerancia de referencia: se usan cortes generales (Baja hasta 80, Media hasta 150 kg/ha).</span>
            {editable && !edicion && (
              <button className="green-button cos-button-small" type="button" onClick={() => setEdicion({ producto: productoActual, toleranciaKgHa: '', factorAlta: '1.5' })}>Definir tolerancia</button>
            )}
          </div>
        )}
        {edicion && !parametros.some((item) => item.producto === edicion.producto) && (
          <div className="cos-modal-grid cos-modal-grid-3">
            <label className="field">Grano<input readOnly value={edicion.producto} /></label>
            <label className="field">Tolerancia (kg/ha)<input type="number" min="1" step="1" value={edicion.toleranciaKgHa} onChange={(event) => setEdicion((actual) => ({ ...actual, toleranciaKgHa: event.target.value }))} /></label>
            <label className="field">Factor de severidad<input type="number" min="1.05" max="5" step="0.05" value={edicion.factorAlta} onChange={(event) => setEdicion((actual) => ({ ...actual, factorAlta: event.target.value }))} /></label>
            <div className="form-actions">
              <button className="green-button" type="button" disabled={guardando} onClick={guardar}>Guardar</button>
              <button className="back-button" type="button" disabled={guardando} onClick={() => setEdicion(null)}>Cancelar</button>
            </div>
          </div>
        )}

        <p className="cos-hint">Cambiar una tolerancia no reclasifica las tiradas ya cargadas: cada una conserva los valores con que se calculó.</p>

        <div className="form-actions modal-actions">
          <button className="green-button" type="button" onClick={onClose}>Listo</button>
        </div>
      </section>
    </div>,
    document.body
  );
}

// =====================================================================
// Partes diarios de avance
// =====================================================================

function EstadoPill({ estado }) {
  return estado === 'Finalizado'
    ? <span className="siembra-state-pill siembra-state-done">Cosecha finalizada</span>
    : <span className="cos-chip cos-chip-warn cos-chip-lg">Cosecha en curso</span>;
}

function PartesView({ cosecha, partes, form, editingParteId, silos, saving, mensajes, puedeCargar, puedeFinalizar, onFieldChange, onGuardar, onEdit, onCancelEdit, onEliminar, onFinalizar, onBack }) {
  const [intento, setIntento] = useState(false);
  const enCurso = cosecha.estado === 'En curso';
  const porcentaje = porcentajeAvance(cosecha);
  const parteEditado = partes.find((parte) => parte.cosechaParteId === editingParteId);
  const soloObservaciones = parteEditado?.destino === 'Silo';
  const hectareasDisponibles = Number(cosecha.hectareasSembradas ?? 0)
    - Number(cosecha.hectareasCosechadas ?? 0)
    + Number(parteEditado?.hectareas ?? 0);
  const rindeParte = esNumeroPositivo(form.kgCosechados) && esNumeroPositivo(form.hectareas)
    ? Number(form.kgCosechados) / Number(form.hectareas)
    : null;

  const errores = {};
  if (!form.fecha) errores.fecha = 'La fecha es obligatoria.';
  else if (form.fecha < toDateInput(cosecha.fechaInicio)) errores.fecha = `No puede ser anterior al inicio (${formatFecha(cosecha.fechaInicio)}).`;
  else if (form.fecha > hoyInput()) errores.fecha = 'No puede ser posterior a hoy.';
  if (!esNumeroPositivo(form.hectareas)) errores.hectareas = 'Debe ser mayor a cero.';
  else if (Number(form.hectareas) > hectareasDisponibles + 0.0001) errores.hectareas = `Quedan ${formatNumber(hectareasDisponibles, ' ha')} por cosechar.`;
  if (!esNumeroPositivo(form.kgCosechados)) errores.kgCosechados = 'Debe ser mayor a cero.';
  if (form.humedadPct === '' || Number(form.humedadPct) >= 100) errores.humedadPct = 'Entre 0 y 100 %.';
  if (form.destino === 'Silo' && !form.siloId) errores.siloId = 'Elegí el silo.';
  if (soloObservaciones) Object.keys(errores).forEach((campo) => delete errores[campo]);
  const mostrar = (campo) => intento && errores[campo] ? <span className="field-error">{errores[campo]}</span> : null;

  function guardar() {
    setIntento(true);
    if (Object.keys(errores).length === 0) {
      onGuardar();
      setIntento(false);
    }
  }

  return (
    <section className="content-panel create-panel cos-page">
      <div className="dashboard-card cos-hero">
        <div className="cos-hero-head">
          <div>
            <h1>Avance de {cosecha.nombre}</h1>
            <p>{cosecha.loteNombre} · {cosecha.producto} · {cosecha.siembraNombre || 'sin siembra'} · inicio {formatFecha(cosecha.fechaInicio)} · fin tentativo {formatFecha(cosecha.fechaFin)}</p>
          </div>
          <EstadoPill estado={cosecha.estado} />
        </div>
        <div>
          <div className="cos-hero-progress-label">
            <span>{formatNumber(hectareasCosechadasDe(cosecha), '', 1)} de {formatNumber(cosecha.hectareasSembradas, ' ha', 1)} cosechadas</span>
            <strong>{formatNumber(porcentaje, ' %', 0)}</strong>
          </div>
          <div className="cos-progress cos-progress-big"><span style={{ width: `${porcentaje}%` }} /></div>
        </div>
        <div className="cos-stats">
          <div><span>Grano acumulado</span><strong>{formatNumber(cosecha.kgAcumulados, ' kg', 0)}</strong></div>
          <div><span>Rinde parcial</span><strong>{cosecha.hectareasCosechadas > 0 ? formatNumber(cosecha.kgAcumulados / cosecha.hectareasCosechadas, ' kg/ha', 0) : '-'}</strong></div>
          <div><span>Humedad promedio</span><strong>{formatNumber(cosecha.humedadPromedioPct, ' %', 1)}</strong></div>
          <div><span>A silo / directo / pendiente</span><strong>{formatNumber(cosecha.kgASilo, '', 0)} / {formatNumber(cosecha.kgDistribucionDirecta, '', 0)} / {formatNumber(cosecha.kgPendientes, ' kg', 0)}</strong></div>
        </div>
      </div>

      {mensajes}

      {!enCurso && (
        <div className="cos-banner cos-banner-info">
          <Info size={18} />
          <span>La cosecha está finalizada: sus partes quedan solo para consulta.</span>
        </div>
      )}

      {enCurso && puedeCargar && (
        <div className="siembra-step-card dashboard-card">
          <SectionTitle icon={PlusCircle} title={editingParteId ? `Editar parte del ${formatFecha(parteEditado?.fecha)}` : 'Registrar parte del día'} />
          {soloObservaciones && (
            <div className="cos-banner cos-banner-warn">
              <AlertTriangle size={18} />
              <span>Este parte ya generó su ingreso al silo en Almacenamiento: solo podés editar las observaciones. Para corregir el stock registrá un ajuste en Almacenamiento.</span>
            </div>
          )}
          <div className="create-grid cos-grid-partes">
            <label className="field">
              <span className="field-label">Fecha <b>*</b></span>
              <input type="date" disabled={soloObservaciones} min={toDateInput(cosecha.fechaInicio)} max={hoyInput()} value={form.fecha} onChange={(event) => onFieldChange('fecha', event.target.value)} />
              {mostrar('fecha')}
            </label>
            <label className="field">
              <span className="field-label">Hectáreas <b>*</b></span>
              <input type="number" disabled={soloObservaciones} min="0" step="0.01" value={form.hectareas} onChange={(event) => onFieldChange('hectareas', event.target.value)} placeholder={`Hasta ${formatNumber(hectareasDisponibles, '')}`} />
              {mostrar('hectareas')}
            </label>
            <label className="field">
              <span className="field-label">Kg (balanza / tolva) <b>*</b></span>
              <input type="number" disabled={soloObservaciones} min="0" step="1" value={form.kgCosechados} onChange={(event) => onFieldChange('kgCosechados', event.target.value)} />
              {mostrar('kgCosechados')}
            </label>
            <label className="field">
              <span className="field-label">Humedad (%) <b>*</b></span>
              <input type="number" disabled={soloObservaciones} min="0" max="99.99" step="0.1" value={form.humedadPct} onChange={(event) => onFieldChange('humedadPct', event.target.value)} />
              {mostrar('humedadPct')}
            </label>
            <label className="field">
              <span className="field-label">Destino <b>*</b></span>
              <select disabled={soloObservaciones} value={form.destino} onChange={(event) => onFieldChange('destino', event.target.value)}>
                {DESTINOS_PARTE.map((destino) => <option key={destino.value} value={destino.value}>{destino.label}</option>)}
              </select>
            </label>
            {form.destino === 'Silo' && (
              <label className="field">
                <span className="field-label">Silo <b>*</b></span>
                <select disabled={soloObservaciones} value={form.siloId} onChange={(event) => onFieldChange('siloId', event.target.value)}>
                  <option value="">{silos.length ? 'Seleccionar silo' : 'No hay silos en la empresa'}</option>
                  {silos.map((silo) => (
                    <option key={silo.siloId} value={silo.siloId} disabled={!silo.compatible && String(silo.siloId) !== String(form.siloId)}>
                      {silo.nombre} · libre {formatNumber(silo.capacidadLibre, ' kg', 0)}{silo.compatible ? '' : ` — ${silo.motivoNoCompatible}`}
                    </option>
                  ))}
                </select>
                {mostrar('siloId')}
              </label>
            )}
          </div>
          <label className="field cos-field-wide">
            Observaciones
            <input maxLength={1000} value={form.observaciones} onChange={(event) => onFieldChange('observaciones', event.target.value)} placeholder="Ej. lote con vuelco en la cabecera norte" />
          </label>
          <div className="cos-inline-info">
            {rindeParte && !soloObservaciones && <span>Rinde del parte: <strong>{formatNumber(rindeParte, ' kg/ha', 0)}</strong></span>}
            <FieldRule>{COSECHA_FIELD_RULES.parteHectareas} {COSECHA_FIELD_RULES.parteDestino}</FieldRule>
          </div>
          <div className="form-actions">
            <button className="green-button" type="button" disabled={saving} onClick={guardar}>
              {editingParteId ? <Save size={17} /> : <PlusCircle size={17} />}
              {saving ? 'Guardando...' : editingParteId ? 'Guardar parte' : 'Agregar parte'}
            </button>
            {editingParteId && <button className="back-button" type="button" onClick={onCancelEdit}>Cancelar edición</button>}
          </div>
        </div>
      )}

      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr><th>Fecha</th><th>Hectáreas</th><th>Kg</th><th>Rinde del día</th><th>Humedad</th><th>Destino</th><th>Cargado por</th><th>Observaciones</th>{enCurso && puedeCargar && <th style={{ textAlign: 'center' }}>Acciones</th>}</tr>
          </thead>
          <tbody>
            {partes.map((parte) => (
              <tr key={parte.cosechaParteId} className={parte.cosechaParteId === editingParteId ? 'cos-row-highlight' : ''}>
                <td>{formatFecha(parte.fecha)}</td>
                <td>{formatNumber(parte.hectareas, ' ha')}</td>
                <td>{formatNumber(parte.kgCosechados, ' kg', 0)}</td>
                <td>{formatNumber(parte.rindeKgHa, ' kg/ha', 0)}</td>
                <td>{formatNumber(parte.humedadPct, ' %', 1)}</td>
                <td><span className={`cos-chip ${parte.destino === 'Silo' ? 'cos-chip-info' : parte.destino === 'Pendiente' ? 'cos-chip-muted' : 'cos-chip-warn'}`}>{parte.destino === 'Silo' ? parte.siloNombre || 'Silo' : labelDestino(parte.destino)}</span></td>
                <td>{parte.cargadoPor || '-'}</td>
                <td className="cos-cell-wrap">{parte.observaciones || '-'}</td>
                {enCurso && puedeCargar && (
                  <td className="actions-cell">
                    <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar parte del ${formatFecha(parte.fecha)}`} onClick={() => onEdit(parte)}><Edit size={18} /></button>
                    {parte.destino !== 'Silo' && (
                      <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label={`Eliminar parte del ${formatFecha(parte.fecha)}`} onClick={() => onEliminar(parte)}><Trash2 size={18} /></button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {partes.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center' }}>Todavía no hay partes cargados.</td></tr>}
          </tbody>
          {partes.length > 0 && (
            <tfoot>
              <tr className="cos-total-row">
                <td>Total</td>
                <td>{formatNumber(cosecha.hectareasCosechadas, ' ha')}</td>
                <td>{formatNumber(cosecha.kgAcumulados, ' kg', 0)}</td>
                <td>{cosecha.hectareasCosechadas > 0 ? formatNumber(cosecha.kgAcumulados / cosecha.hectareasCosechadas, ' kg/ha', 0) : '-'}</td>
                <td>{formatNumber(cosecha.humedadPromedioPct, ' %', 1)}</td>
                <td colSpan={enCurso && puedeCargar ? 4 : 3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="form-actions">
        {enCurso && puedeFinalizar && (
          <button className="green-button" type="button" onClick={onFinalizar}><Flag size={17} /> Finalizar cosecha</button>
        )}
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
      </div>
    </section>
  );
}

// =====================================================================
// Tirada de Aros
// =====================================================================

function CosechaMapa({ poligono, puntos, pendiente, onPick, readOnly, height = 380 }) {
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
    if (!mapNodeRef.current || mapRef.current) return undefined;
    const map = L.map(mapNodeRef.current, { center: DEFAULT_MAP_CENTER, zoom: 16, minZoom: 4, maxZoom: 17, zoomControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 17,
      maxNativeZoom: 17,
      attribution: 'Tiles © Esri'
    }).addTo(map);
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

    const poligonoOrdenado = (poligono ?? []).slice()
      .sort((a, b) => a.orden - b.orden)
      .map((c) => ({ lat: Number(c.latitud), lng: Number(c.longitud) }));
    if (poligonoOrdenado.length >= 3) {
      L.polygon(poligonoOrdenado, { color: '#ffffff', weight: 2, dashArray: '8 6', opacity: 0.95, fillOpacity: 0.06 }).addTo(layerRef.current);
    }

    puntos.forEach((punto) => {
      const severidad = SEVERIDADES[punto.severidad] ?? SEVERIDADES.Baja;
      L.marker(punto, {
        title: `${formatFecha(punto.fecha)} · ${formatNumber(punto.total, ' kg/ha', 1)} · ${punto.severidad}`,
        icon: L.divIcon({
          className: 'cos-map-pin',
          html: `<span style="background:${severidad.color}"><b>${severidad.letra}</b></span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30]
        })
      }).addTo(layerRef.current);
    });

    if (pendiente) {
      L.marker(pendiente, {
        icon: L.divIcon({ className: 'cos-map-pin cos-map-pin-pending', html: '<span><b>+</b></span>', iconSize: [30, 30], iconAnchor: [15, 30] })
      }).addTo(layerRef.current);
    }

    const encuadre = poligonoOrdenado.length >= 3 ? poligonoOrdenado : [...puntos, ...(pendiente ? [pendiente] : [])];
    if (!initialFitDoneRef.current && encuadre.length > 0) {
      initialFitDoneRef.current = true;
      window.setTimeout(() => {
        if (!mapRef.current) return;
        mapRef.current.invalidateSize();
        if (encuadre.length === 1) {
          mapRef.current.setView(encuadre[0], 16, { animate: false });
          return;
        }
        const bounds = L.latLngBounds(encuadre);
        if (bounds.isValid()) {
          mapRef.current.setMaxBounds(bounds.pad(0.45));
          mapRef.current.fitBounds(bounds.pad(0.16), { animate: false, maxZoom: 16 });
        }
      }, 120);
    }
  }, [puntos, pendiente, poligono]);

  return (
    <div className="map-box cos-map-box" style={{ height }}>
      <div ref={mapNodeRef} style={{ width: '100%', height: '100%' }} />
      {!readOnly && (
        <div className="cos-map-hint"><MapPin size={14} /><span>Tocá el mapa para marcar el punto de medición</span></div>
      )}
    </div>
  );
}

function TiradaView({ cosecha, lote, tiradas, parametros, form, editingTiradaId, saving, mensajes, puedeCargar, puedeFinalizarControl, onFieldChange, onPickPunto, onGuardar, onEdit, onCancelEdit, onEliminar, onFinalizarControl, onVerParametros, onBack }) {
  const [intento, setIntento] = useState(false);
  const controlCerrado = cosecha.estadoControl === 'Finalizado';
  const puedeEditar = puedeCargar && !controlCerrado;
  const calculo = calcularPerdidas(form, parametros);
  const severidad = calculo ? SEVERIDADES[calculo.severidad] : null;
  const poligono = lote?.coordenadas ?? [];
  const limiteCuatroMeses = sumarMeses(toDateInput(cosecha.fechaInicio), MESES_MAXIMOS_TIRADA);
  const finMaximo = minFecha(limiteCuatroMeses, toDateInput(cosecha.fechaFinReal));

  const puntos = useMemo(() => tiradas
    .filter((tirada) => tirada.latitud != null && tirada.longitud != null && tirada.cosechaTiradaAroId !== editingTiradaId)
    .map((tirada) => ({
      lat: Number(tirada.latitud),
      lng: Number(tirada.longitud),
      severidad: tirada.severidad,
      fecha: tirada.fecha,
      total: tirada.perdidaTotalKgHa
    })), [tiradas, editingTiradaId]);
  const pendiente = form.latitud !== '' && form.longitud !== '' ? { lat: Number(form.latitud), lng: Number(form.longitud) } : null;

  const errores = {};
  if (!form.fecha) errores.fecha = 'La fecha es obligatoria.';
  else if (form.fecha < toDateInput(cosecha.fechaInicio)) errores.fecha = `No puede ser anterior al inicio (${formatFecha(cosecha.fechaInicio)}).`;
  else if (form.fecha > limiteCuatroMeses) errores.fecha = `No puede superar los ${MESES_MAXIMOS_TIRADA} meses desde el inicio.`;
  else if (cosecha.fechaFinReal && form.fecha > toDateInput(cosecha.fechaFinReal)) errores.fecha = 'No puede ser posterior al fin real de la cosecha.';
  if (!pendiente) errores.punto = 'Marcá en el mapa el punto de medición.';
  ['aroCabezal', 'aroCola1', 'aroCola2', 'aroCola3'].forEach((campo) => {
    if (form[campo] === '' || !Number.isInteger(Number(form[campo]))) errores[campo] = 'Entero ≥ 0.';
  });
  if (!(Number(form.pmg) > 0 && Number(form.pmg) <= 1000)) errores.pmg = 'Entre 0 y 1000 g.';
  const mostrar = (campo) => intento && errores[campo] ? <span className="field-error">{errores[campo]}</span> : null;

  const origenPmg = !form.pmg ? null
    : Number(form.pmg) === Number(parametros?.pmgSiembra) ? `de ${cosecha.siembraNombre || 'la siembra'}`
      : Number(form.pmg) === Number(parametros?.pmgReferencia) ? 'de referencia del grano'
        : 'cargado a mano';

  function guardar() {
    setIntento(true);
    if (Object.keys(errores).length === 0) {
      onGuardar();
      setIntento(false);
    }
  }

  const leyenda = parametros && [
    { severidad: 'Baja', texto: `hasta ${formatNumber(parametros.toleranciaKgHa, '', 0)}` },
    { severidad: 'Media', texto: `hasta ${formatNumber(parametros.limiteMediaKgHa, '', 0)}` },
    { severidad: 'Alta', texto: `más de ${formatNumber(parametros.limiteMediaKgHa, ' kg/ha', 0)}` }
  ];

  const origenParametros = {
    Empresa: 'ajuste de la empresa',
    Referencia: 'referencia INTA PRECOP',
    General: 'cortes generales (grano sin referencia)'
  }[parametros?.origen] ?? '';

  return (
    <section className="content-panel create-panel cos-page">
      <div className="page-heading create-heading">
        <div>
          <h1>Control de pérdidas · Tirada de Aros</h1>
          <p>{cosecha.nombre} · {cosecha.loteNombre} · {cosecha.producto} · cada aro cubre {AREA_ARO_M2.toLocaleString('es-AR')} m²</p>
        </div>
        <div className="cos-heading-chips">
          <span className={`cos-chip cos-chip-lg ${controlCerrado ? 'cos-chip-done' : cosecha.estadoControl === 'En curso' ? 'cos-chip-info' : 'cos-chip-muted'}`}>
            Control: {controlCerrado ? 'Cerrado' : cosecha.estadoControl}
          </span>
          <EstadoPill estado={cosecha.estado} />
        </div>
      </div>

      {mensajes}

      {controlCerrado && (
        <div className="cos-banner cos-banner-info"><Info size={18} /><span>El control de pérdidas está cerrado: las tiradas quedan solo para consulta.</span></div>
      )}
      {!controlCerrado && cosecha.estado === 'Finalizado' && (
        <div className="cos-banner cos-banner-warn"><AlertTriangle size={18} /><span>La cosecha ya está finalizada. Podés registrar tiradas hasta su fecha real de fin; el resultado de la cosecha no cambia.</span></div>
      )}
      {parametros?.origen === 'General' && (
        <div className="cos-banner cos-banner-warn"><AlertTriangle size={18} /><span>{cosecha.producto} no tiene tolerancia de referencia: se clasifica con cortes generales. Podés definir una tolerancia propia en “Tolerancias”.</span></div>
      )}

      <div className="cos-tirada-grid">
        <div className="dashboard-card cos-card">
          <h2 className="cos-section-title">Punto de medición</h2>
          <div className="cos-map-wrap">
            <CosechaMapa poligono={poligono} puntos={puntos} pendiente={pendiente} onPick={onPickPunto} readOnly={!puedeEditar} />
            {leyenda && (
              <div className="cos-legend">
                {leyenda.map((item) => (
                  <span key={item.severidad}><i className={`cos-sev-dot ${SEVERIDADES[item.severidad].clase}`}>{SEVERIDADES[item.severidad].letra}</i>{item.severidad} {item.texto}</span>
                ))}
                <button type="button" className="cos-link-button" onClick={onVerParametros}>Tolerancias de {cosecha.producto} · {origenParametros}</button>
              </div>
            )}
          </div>
          {puedeEditar && (
            <>
              <div className="cos-modal-grid cos-modal-grid-3">
                <label className="field">
                  <span className="field-label">Fecha <b>*</b></span>
                  <input type="date" min={toDateInput(cosecha.fechaInicio)} max={finMaximo} value={form.fecha} onChange={(event) => onFieldChange('fecha', event.target.value)} />
                  {mostrar('fecha')}
                  <FieldRule>{COSECHA_FIELD_RULES.tiradaFecha}</FieldRule>
                </label>
                <label className="field">Latitud<input readOnly value={form.latitud || '-'} /></label>
                <label className="field">Longitud<input readOnly value={form.longitud || '-'} /></label>
              </div>
              {mostrar('punto')}
              <FieldRule>{COSECHA_FIELD_RULES.tiradaPunto}</FieldRule>
            </>
          )}
        </div>

        {puedeEditar && (
          <div className="dashboard-card cos-card">
            <h2 className="cos-section-title">{editingTiradaId ? 'Editar tirada' : 'Granos contados por aro'}</h2>
            <div className="cos-aros">
              {[['aroCabezal', 'Cabezal'], ['aroCola1', 'Cola 1'], ['aroCola2', 'Cola 2'], ['aroCola3', 'Cola 3']].map(([campo, etiqueta]) => (
                <label key={campo} className="field cos-aro">
                  <span className="field-label">{etiqueta} <b>*</b></span>
                  <input type="number" inputMode="numeric" min="0" step="1" value={form[campo]} onChange={(event) => onFieldChange(campo, event.target.value)} />
                  {mostrar(campo)}
                </label>
              ))}
            </div>
            <div className="cos-modal-grid cos-modal-grid-2">
              <label className="field">
                <span className="field-label">PMG del grano (g) <b>*</b></span>
                <input type="number" min="0" step="0.1" value={form.pmg} onChange={(event) => onFieldChange('pmg', event.target.value)} />
                {origenPmg && <span className="cos-hint">PMG {origenPmg}.</span>}
                {mostrar('pmg')}
                <FieldRule>{COSECHA_FIELD_RULES.tiradaPmg}</FieldRule>
              </label>
              <label className="field">
                Granos de precosecha por aro
                <input type="number" min="0" step="0.1" value={form.granosPrecosecha} onChange={(event) => onFieldChange('granosPrecosecha', event.target.value)} placeholder="Opcional" />
                <FieldRule>{COSECHA_FIELD_RULES.tiradaPrecosecha}</FieldRule>
              </label>
            </div>

            <div className="cos-live-cards" aria-live="polite">
              <div className="cos-live-card">
                <span>Pérdida cabezal</span>
                <strong>{calculo ? formatNumber(calculo.cabezal, '', 1) : '—'}</strong>
                <small>kg/ha{calculo && form.granosPrecosecha !== '' ? ` · precosecha ${formatNumber(calculo.precosecha, '', 1)} descontada` : ''}</small>
              </div>
              <div className="cos-live-card">
                <span>Pérdida cola</span>
                <strong>{calculo ? formatNumber(calculo.cola, '', 1) : '—'}</strong>
                <small>kg/ha · promedio 3 aros</small>
              </div>
              <div className={`cos-live-card cos-live-card-total ${severidad ? severidad.clase : ''}`}>
                <span>Pérdida total</span>
                <strong>{calculo ? formatNumber(calculo.total, '', 1) : '—'}</strong>
                <small>kg/ha{calculo ? ` · ${calculo.severidad}` : ''}</small>
              </div>
            </div>
            <p className="cos-hint">Se recalcula mientras cargás los aros: ((granos ÷ 0,25) × PMG) ÷ 100.</p>

            <fieldset className="cos-radio-group">
              <legend>¿Se ajustó la máquina a partir de este control? <b>*</b></legend>
              {[false, true].map((valor) => (
                <label key={String(valor)} className={`cos-radio ${form.ajustoMaquinaria === valor ? 'cos-radio-on' : ''}`}>
                  <input type="radio" name="ajustoMaquinaria" checked={form.ajustoMaquinaria === valor} onChange={() => onFieldChange('ajustoMaquinaria', valor)} />
                  {valor ? 'Sí' : 'No'}
                </label>
              ))}
            </fieldset>
            <label className="field">
              Observaciones
              <textarea maxLength={1000} value={form.observaciones} onChange={(event) => onFieldChange('observaciones', event.target.value)} placeholder="Ej. velocidad de avance, regulación del cabezal" />
            </label>
            <div className="form-actions">
              <button className="green-button" type="button" disabled={saving} onClick={guardar}>
                {editingTiradaId ? <Save size={17} /> : <PlusCircle size={17} />}
                {saving ? 'Guardando...' : editingTiradaId ? 'Guardar tirada' : 'Agregar tirada'}
              </button>
              {editingTiradaId && <button className="back-button" type="button" onClick={onCancelEdit}>Cancelar edición</button>}
            </div>
          </div>
        )}
      </div>

      <TiradasTable tiradas={tiradas} editingTiradaId={editingTiradaId} onEdit={puedeEditar ? onEdit : null} onEliminar={puedeEditar ? onEliminar : null} />

      <div className="dashboard-card cos-card cos-close-block">
        <div>
          <strong>Cerrar el control de pérdidas</strong>
          <p>Bloquea la carga de nuevas tiradas y deja el historial en solo lectura. No finaliza la cosecha: eso se hace desde su botón de estado con la fecha real.</p>
        </div>
        <div className="form-actions">
          <button className="back-button" type="button" onClick={onBack}>Volver</button>
          {puedeFinalizarControl && cosecha.estadoControl === 'En curso' && (
            <button className="green-button" type="button" onClick={onFinalizarControl}><Flag size={17} /> Finalizar control</button>
          )}
        </div>
      </div>
    </section>
  );
}

function TiradasTable({ tiradas, editingTiradaId, onEdit, onEliminar }) {
  const conAcciones = Boolean(onEdit || onEliminar);
  return (
    <div className="table-shell dashboard-card">
      <table className="lotes-table">
        <thead>
          <tr>
            <th>Fecha</th><th>Aros (cab. / cola)</th><th>Precosecha</th><th>PMG</th><th>Cabezal</th><th>Cola</th><th>Total</th><th>Severidad</th><th>Ajuste</th>
            {conAcciones && <th style={{ textAlign: 'center' }}>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {tiradas.map((tirada) => {
            const severidad = SEVERIDADES[tirada.severidad];
            return (
              <tr key={tirada.cosechaTiradaAroId} className={tirada.cosechaTiradaAroId === editingTiradaId ? 'cos-row-highlight' : ''}>
                <td>{formatFecha(tirada.fecha)}</td>
                <td>{tirada.aroCabezal} / {tirada.aroCola1} · {tirada.aroCola2} · {tirada.aroCola3}</td>
                <td>{tirada.perdidaPrecosechaKgHa != null ? formatNumber(tirada.perdidaPrecosechaKgHa, ' kg/ha', 1) : '-'}</td>
                <td>{formatNumber(tirada.pmg, ' g', 1)}{tirada.pmgOrigen && <span className="cos-sub">{tirada.pmgOrigen}</span>}</td>
                <td>{formatNumber(tirada.perdidaCabezalKgHa, ' kg/ha', 1)}</td>
                <td>{formatNumber(tirada.perdidaColaKgHa, ' kg/ha', 1)}</td>
                <td><strong>{formatNumber(tirada.perdidaTotalKgHa, ' kg/ha', 1)}</strong></td>
                <td>
                  <span className={`cos-sev ${severidad?.clase ?? ''}`}>{severidad?.letra} · {tirada.severidad}</span>
                  {tirada.toleranciaAplicadaKgHa != null && <span className="cos-sub">Tolerancia {formatNumber(tirada.toleranciaAplicadaKgHa, ' kg/ha', 0)}</span>}
                </td>
                <td>{tirada.ajustoMaquinaria ? 'Sí' : 'No'}</td>
                {conAcciones && (
                  <td className="actions-cell">
                    {onEdit && <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar tirada del ${formatFecha(tirada.fecha)}`} onClick={() => onEdit(tirada)}><Edit size={18} /></button>}
                    {onEliminar && <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label={`Eliminar tirada del ${formatFecha(tirada.fecha)}`} onClick={() => onEliminar(tirada)}><Trash2 size={18} /></button>}
                  </td>
                )}
              </tr>
            );
          })}
          {tiradas.length === 0 && <tr><td colSpan={conAcciones ? 10 : 9} style={{ textAlign: 'center' }}>Sin controles de Tirada de Aros registrados.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================================
// Detalle
// =====================================================================

function CosechaDetalle({ cosecha, documentos, tiradas, partes, mensajes, onDescargarDocumento, onBack }) {
  const desvio = cosecha.fechaFinReal ? diasEntre(cosecha.fechaFin, cosecha.fechaFinReal) : null;
  const dato = (etiqueta, valor) => <div className="cos-dato"><span>{etiqueta}</span><strong>{valor ?? '-'}</strong></div>;

  return (
    <section className="content-panel create-panel cos-page">
      <div className="page-heading create-heading">
        <div>
          <h1>Detalle {cosecha.nombre}</h1>
          <p>{cosecha.loteNombre} · {cosecha.producto} · {cosecha.campaniaNombre || 'sin campaña'}</p>
        </div>
        <div className="cos-heading-chips">
          <span className={`cos-chip cos-chip-lg ${cosecha.estadoControl === 'Finalizado' ? 'cos-chip-done' : cosecha.estadoControl === 'En curso' ? 'cos-chip-info' : 'cos-chip-muted'}`}>
            Control: {cosecha.estadoControl === 'Finalizado' ? 'Cerrado' : cosecha.estadoControl}
          </span>
          <EstadoPill estado={cosecha.estado} />
        </div>
      </div>

      {mensajes}

      <div className="cos-detalle-grid">
        <div className="dashboard-card cos-card">
          <h2 className="cos-section-title">Datos generales</h2>
          <div className="cos-datos">
            {dato('Siembra', cosecha.siembraNombre)}
            {dato('Empresa', cosecha.empresa)}
            {dato('Hectáreas sembradas', formatNumber(cosecha.hectareasSembradas, ' ha'))}
            {dato('Responsable', cosecha.responsableACargo)}
            {dato('Fecha de inicio', formatFecha(cosecha.fechaInicio))}
            {dato('Fecha tentativa de fin', formatFecha(cosecha.fechaFin))}
            {dato('Fecha real de fin', cosecha.fechaFinReal ? `${formatFecha(cosecha.fechaFinReal)}${desvio ? ` (${desvio > 0 ? '+' : ''}${desvio} días)` : ''}` : '-')}
            {dato('Maquinaria', [cosecha.tipoServicio, cosecha.contratista, cosecha.cosechadora, cosecha.anchoCabezalM ? `${formatNumber(cosecha.anchoCabezalM, ' m')} de cabezal` : null].filter(Boolean).join(' · ') || '-')}
          </div>
          {cosecha.justificacionDesvioFin && <p className="cos-justificacion"><strong>Justificación del desvío:</strong> {cosecha.justificacionDesvioFin}</p>}
        </div>

        <div className="dashboard-card cos-card">
          <h2 className="cos-section-title">Resultado</h2>
          <div className="cos-datos">
            {dato('Grano cosechado', formatNumber(cosecha.cantidadGranoCosechado, ' kg', 0))}
            {dato('Hectáreas trabajadas', formatNumber(cosecha.cantidadHectareasTrabajadas, ' ha'))}
            {dato('Rinde húmedo', formatNumber(cosecha.rindeKgHa, ' kg/ha', 0))}
            {dato('Rinde seco', cosecha.rindeSecoKgHa ? `${formatNumber(cosecha.rindeSecoKgHa, ' kg/ha', 0)} (base ${formatNumber(cosecha.humedadBaseAplicada, ' %', 1)})` : '-')}
            {dato('Humedad', formatNumber(cosecha.humedadGrano, ' %', 1))}
            {dato('Impurezas', formatNumber(cosecha.impurezas, ' %', 1))}
            {dato('Productividad', formatNumber(cosecha.hectareasHora, ' ha/h', 1))}
            {dato('Destino del grano (partes)', `${formatNumber(cosecha.kgASilo, '', 0)} silo · ${formatNumber(cosecha.kgDistribucionDirecta, '', 0)} directo · ${formatNumber(cosecha.kgPendientes, ' kg', 0)} pendiente`)}
          </div>
        </div>
      </div>

      <h2>Partes de avance</h2>
      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead><tr><th>Fecha</th><th>Hectáreas</th><th>Kg</th><th>Rinde</th><th>Humedad</th><th>Destino</th><th>Cargado por</th></tr></thead>
          <tbody>
            {partes.map((parte) => (
              <tr key={parte.cosechaParteId}>
                <td>{formatFecha(parte.fecha)}</td>
                <td>{formatNumber(parte.hectareas, ' ha')}</td>
                <td>{formatNumber(parte.kgCosechados, ' kg', 0)}</td>
                <td>{formatNumber(parte.rindeKgHa, ' kg/ha', 0)}</td>
                <td>{formatNumber(parte.humedadPct, ' %', 1)}</td>
                <td>{parte.destino === 'Silo' ? parte.siloNombre || 'Silo' : labelDestino(parte.destino)}</td>
                <td>{parte.cargadoPor || '-'}</td>
              </tr>
            ))}
            {partes.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center' }}>Sin partes cargados.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Tirada de Aros</h2>
      <TiradasTable tiradas={tiradas} />

      <h2>Documentación</h2>
      <div className="dashboard-card cos-card">
        <DocumentosSection documentos={documentos} onDescargar={onDescargarDocumento} />
      </div>

      <div className="form-actions">
        <button className="back-button" type="button" onClick={onBack}>Volver</button>
      </div>
    </section>
  );
}
