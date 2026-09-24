import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CalendarDays, ClipboardCheck, CheckCircle2, Download, Edit, Eye, FileText, Flag, Filter, FlaskConical, Gauge, HelpCircle, Info, Leaf, Lightbulb, LockKeyhole, LoaderCircle, Map, MapPin, PlusCircle, RotateCcw, Route, Save, Search, Settings2, Sprout, UploadCloud, UserRound, Trash2 } from "lucide-react";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5135";
const defaultMapCenter = [-32.0025, -64.0055];
const DIAS_DESVIO_REQUIERE_JUSTIFICACION = 3;
const OPERATION_DATE_MIN = "2026-01-01";
const OPERATION_DATE_MAX = "2027-12-31";
const INCIDENCIAS_SEGUIMIENTO = ["Ninguna", "Plaga", "Maleza", "Enfermedad"];
const MOTIVOS_POSEMERGENTE = INCIDENCIAS_SEGUIMIENTO.filter((valor) => valor !== "Ninguna");
const GRANOS_PLANIFICABLES = ["Soja", "Maiz", "Sorgo", "Trigo", "Girasol", "Otro"];
const SINIESTROS_RESIEMBRA = ["Granizo", "Sequia / Estres hidrico", "Helada tardia", "Anegamiento / Inundacion", "Plagas de implantacion", "Fitotoxicidad por agroquimicos", "Encostramiento del suelo", "Falla de germinacion", "Incendio"];
const TIPOS_INSUMO = ["Herbicidas", "Insecticidas", "Fungicidas", "Acaricidas", "Nematicidas", "Raticidas", "Bactericidas", "Molusquicidas"];
const MARCAS_AGROQUIMICOS_INICIALES = ["Syngenta", "ACA", "Bayer", "Monsanto", "BASF", "Corteva Agriscience", "ADAMA", "FMC", "UPL", "Sumitomo Chemical"];
const DROGAS_AGROQUIMICOS_INICIALES = ["Glifosato", "Haloxifop-P-metil", "2,4-D", "Cletodim", "Dicamba", "Atrazina", "Glufosinato de amonio", "Metsulfuron-metil", "Flumioxazina", "Saflufenacil"];
const VARIEDADES_SEMILLA_INICIALES = { soja: ["46I20", "50I17"], maiz: ["ACA473", "DOW226"] };
const SIEMBRA_FIELD_RULES = { tipoRegistro: "Es obligatorio elegir Siembra o Resiembra. Solo puede existir una siembra y hasta cuatro resiembras por lote y periodo de campa\xF1a.", nombre: "Es de solo lectura y se genera al guardar con el formato SIEM - 0001.", loteSiembra: "Solo aparecen lotes planificados en la campa\xF1a que todav\xEDa no tienen una siembra en este periodo.", loteResiembra: "Podés elegir lotes cuya última siembra o resiembra, junto con su seguimiento, ya estén finalizados. Se admiten hasta cuatro resiembras por campaña.", siembraOriginal: "Se completa autom\xE1ticamente con el \xFAltimo registro finalizado del lote seleccionado.", hectareasLote: "Muestra la superficie registrada del lote. Más adelante, en Detalle de siembra, podrás indicar las hectáreas efectivamente a trabajar.", cultivoAfectado: "Es informativo y muestra el último cultivo cosechado en una campaña previa del lote.", cultivoSiembra: "Es obligatorio y se completa con el cultivo planificado para el lote en la campa\xF1a.", cultivoResiembra: "Es obligatorio. En resiembra parcial conserva el cultivo original; en resiembra total puede cambiarse.", tipoResiembra: "Es obligatorio. Parcial conserva el cultivo original; Total permite seleccionar otro cultivo.", siniestro: "Es obligatorio y debe elegirse de la lista de causas admitidas.", fechaInicioSiembra: (minima, maxima) => `Es obligatoria y debe estar entre ${minima} y ${maxima}.`, fechaInicioResiembra: (minima, maxima) => `Debe estar entre el fin real de la última siembra o resiembra (${minima}) y cuatro meses después, sin superar el fin de campaña (${maxima}).`, fechaFin: (maxima, esResiembra) => `Es obligatoria, no puede ser anterior al inicio ni posterior al ${maxima}${esResiembra ? ", fin del a\xF1o de campa\xF1a" : ""}.`, seguimiento: "Es de solo lectura y refleja el estado del seguimiento asociado.", variedadSemilla: "Es obligatoria, no puede quedar vac\xEDa y se guarda en may\xFAsculas.", tipoSoja: "Indica si corresponde a soja de primera o de segunda.", epocaSiembra: "Indica si corresponde a una siembra temprana o tardía.", cicloCultivo: "Clasificación simplificada del ciclo utilizada para análisis comparativos: corto o largo.", pmg: "Es obligatorio y debe ser mayor que cero. No admite valores negativos.", densidad: "Es obligatoria y debe ser mayor que cero. Se usa para calcular la cantidad de semillas.", profundidad: "Es obligatoria y debe ser mayor que cero. No admite valores negativos.", hectareasCultivables: "Es obligatoria y debe ser mayor que cero. Se completa desde el lote y puede ajustarse.", urea: "Es opcional. La necesidad de nitrógeno depende del análisis de suelo: es frecuente en maíz, trigo y sorgo; en soja solo se registra si corresponde a un manejo puntual.", cantidadSemillas: "Es obligatoria y mayor que cero. Se calcula como Densidad \xD7 Hect\xE1reas cultivables, pero puede editarse.", responsable: "Es obligatorio seleccionar un usuario disponible de la empresa.", fechaMuestreo: (minima, maxima) => `Es opcional. Si se carga, debe estar entre ${minima} y el inicio de siembra (${maxima}).`, fechaAnalisis: "Es opcional. No puede ser anterior al muestreo ni posterior al inicio de siembra.", cantidadMuestras: "Es opcional y solo admite n\xFAmeros enteros iguales o mayores que cero.", cultivoAntecesor: "Es de solo lectura y toma el \xFAltimo cultivo con cosecha finalizada del historial del lote.", observaciones: "Es opcional y permite registrar aclaraciones sobre el muestreo o el an\xE1lisis de suelo.", pulverizacion: "En resiembra, No es la opci\xF3n predeterminada. Si eleg\xEDs S\xED, deb\xE9s agregar al menos un agroqu\xEDmico a la tabla para continuar.", fechaAplicacion: (minima) => `Es obligatoria. Debe estar entre ${minima} y la fecha de inicio de siembra. Si el lote tiene una cosecha finalizada, el límite inicial toma esa fecha.`, marcaAgroquimico: "Es obligatoria y no puede quedar vac\xEDa.", tipoAgroquimico: "Es obligatorio y debe elegirse de la lista de tipos admitidos.", variedadAgroquimico: "La droga es obligatoria y no puede quedar vac\xEDa.", cantidadAgroquimico: "La cantidad debe ser mayor que cero y la unidad debe ser Litros o Kg.", documentacion: "La documentaci\xF3n es opcional. Los formatos sugeridos son PDF, JPG, PNG y XLSX." };
let tempIdSeq = 0;
function nextTempId() {
  tempIdSeq += 1;
  return `tmp-${tempIdSeq}`;
}
function normalizeSearchText(value) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function formatFecha(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-AR");
}
function formatNumber(value, suffix = "") {
  if (value === null || value === void 0 || value === "") return "-";
  return `${Number(value).toLocaleString("es-AR", { maximumFractionDigits: 2 })}${suffix}`;
}
function formatLargeNumberInput(value) {
  if (value === null || value === void 0 || value === "") return "";
  const [entero, decimal] = String(value).split(".");
  const enteroFormateado = (entero || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal === void 0 ? enteroFormateado : `${enteroFormateado},${decimal}`;
}
function parseLargeNumberInput(value) {
  const normalizado = String(value ?? "").replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [entero = "", ...decimales] = normalizado.split(".");
  return decimales.length > 0 ? `${entero}.${decimales.join("")}` : entero;
}
function formatDateInputLabel(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}
function toDateInput(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}
function todayIso() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function getEmptySeguimientoForm() {
  return { fecha: todayIso(), longitud: "", latitud: "", tipoRegistro: "Posemergente", siniestro: "", alcance: "", incidencia: "", perdidaEconomica: "", aplicacionAgroquimicos: "", observaciones: "" };
}
function getEmptySiembraForm() {
  return { tipoRegistro: "Siembra", siembraOriginalId: "", tipoResiembra: "Parcial", siniestro: "", loteId: "", cantidadHectareasLote: "", campaniaNombre: "", producto: "", empresa: "", fechaInicio: "", fechaFin: "", fechaFinReal: "", justificacionDesvioFin: "", hectareasHora: "", variedadSemilla: "", cicloCultivo: "", tipoImplantacion: "", pmg: "", densidadSiembra: "", profundidad: "", cantidadHectareasTrabajadas: "", ureaKgHa: "", cantidadSemillas: "", responsableACargo: "", fechaMuestreo: "", fechaAnalisis: "", cantidadMuestras: "", productoAntecesor: "", observacionesPreSiembra: "" };
}
const emptyInsumoForm = { fechaAplicacion: "", marca: "", tipo: "", variedad: "", cantidadAplicada: "", unidadMedida: "" };
const emptyPulverizacionForm = { fechaAplicacion: "", motivoAplicacion: "" };
function Siembras({ session, lotes, parentFilters, selectedCampania, selectedCampaniaCombinaciones = [], selectedEmpresaName = "", selectedCampaniaName = "", onLotesChanged, onCampaniasChanged }) {
  const [view, setView] = useState("list");
  const [siembras, setSiembras] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSiembra, setSelectedSiembra] = useState(null);
  const [form, setForm] = useState(getEmptySiembraForm);
  const [insumoForm, setInsumoForm] = useState(emptyInsumoForm);
  const [pulverizacionForm, setPulverizacionForm] = useState(emptyPulverizacionForm);
  const [insumos, setInsumos] = useState([]);
  const [marcasAgroquimicos, setMarcasAgroquimicos] = useState(() => [...MARCAS_AGROQUIMICOS_INICIALES].sort((a, b) => a.localeCompare(b, "es")));
  const [drogasAgroquimicos, setDrogasAgroquimicos] = useState(() => [...DROGAS_AGROQUIMICOS_INICIALES].sort((a, b) => a.localeCompare(b, "es")));
  const [variedadesSemilla, setVariedadesSemilla] = useState(() => Object.fromEntries(Object.entries(VARIEDADES_SEMILLA_INICIALES).map(([grano, variedades]) => [grano, [...variedades].sort((a, b) => a.localeCompare(b, "es"))])));
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
  const [seguimientoRedireccion, setSeguimientoRedireccion] = useState(null);
  const [grainChangeModal, setGrainChangeModal] = useState(null);
  const [pendingGrainChange, setPendingGrainChange] = useState(null);
  useEffect(() => {
    const cultivoAntecesor = lotes?.find((lote) => String(lote.loteId) === String(form.loteId))?.historialCultivos?.[0]?.cultivo || "";
    setForm((current) => current.productoAntecesor === cultivoAntecesor ? current : { ...current, productoAntecesor: cultivoAntecesor });
  }, [form.loteId, lotes]);
  function authHeaders(extra = {}) {
    return session?.token ? { ...extra, Authorization: `Bearer ${session.token}` } : extra;
  }
  async function loadCatalogos() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/catalogos`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const valores = await response.json();
      const ordenar = (opciones) => [...new Set(opciones)].sort((a, b) => a.localeCompare(b, "es"));
      setMarcasAgroquimicos(ordenar(valores.filter((valor) => valor.tipo === "MarcaAgroquimico").map((valor) => valor.nombre)));
      setDrogasAgroquimicos(ordenar(valores.filter((valor) => valor.tipo === "DrogaAgroquimico").map((valor) => valor.nombre)));
      setVariedadesSemilla(valores.filter((valor) => valor.tipo === "VariedadSemilla").reduce((porGrano, valor) => {
        const grano = normalizeSearchText(valor.grano);
        porGrano[grano] = ordenar([...(porGrano[grano] || []), valor.nombre]);
        return porGrano;
      }, {}));
    } catch (err) {
      setError(`No se pudieron cargar los catálogos: ${err.message}`);
    }
  }
  async function agregarValorCatalogo(tipo, valor) {
    const limpio = String(valor || "").trim();
    if (!limpio) return;
    const tipoApi = tipo === "marca" ? "MarcaAgroquimico" : "DrogaAgroquimico";
    try {
      const response = await fetch(`${API_BASE_URL}/api/catalogos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ tipo: tipoApi, nombre: limpio }) });
      if (!response.ok) throw new Error(await response.text());
    } catch (err) {
      setError(`No se pudo guardar el catálogo: ${err.message}`);
      return;
    }
    const setter = tipo === "marca" ? setMarcasAgroquimicos : setDrogasAgroquimicos;
    setter((actuales) => actuales.some((actual) => normalizeSearchText(actual) === normalizeSearchText(limpio)) ? actuales : [...actuales, limpio].sort((a, b) => a.localeCompare(b, "es")));
  }
  async function agregarVariedadSemilla(grano, valor) {
    const claveGrano = normalizeSearchText(grano);
    const variedad = String(valor || "").trim().toUpperCase();
    if (!claveGrano || !variedad) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/catalogos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ tipo: "VariedadSemilla", grano, nombre: variedad }) });
      if (!response.ok) throw new Error(await response.text());
    } catch (err) {
      setError(`No se pudo guardar la variedad: ${err.message}`);
      return;
    }
    setVariedadesSemilla((actuales) => {
      const opciones = actuales[claveGrano] || [];
      if (opciones.some((opcion) => normalizeSearchText(opcion) === normalizeSearchText(variedad))) return actuales;
      return { ...actuales, [claveGrano]: [...opciones, variedad].sort((a, b) => a.localeCompare(b, "es")) };
    });
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
    }
  }
  useEffect(() => {
    loadSiembras();
    loadUsuarios();
    loadCatalogos();
  }, []);
  function goToList() {
    setView("list");
    setSelectedSiembra(null);
    setGrainChangeModal(null);
    setPendingGrainChange(null);
    setError("");
    loadSiembras();
  }
  function startCreate() {
    setSelectedSiembra(null);
    setPendingGrainChange(null);
    setForm({ ...getEmptySiembraForm(), campaniaNombre: selectedCampaniaName || "", empresa: selectedEmpresaName || "" });
    setInsumoForm(emptyInsumoForm);
    setPulverizacionForm(emptyPulverizacionForm);
    setInsumos([]);
    setDocumentos([]);
    setError("");
    setView("create");
  }
  async function loadSubItems(siembraId) {
    try {
      const [insRes, docRes] = await Promise.all([fetch(`${API_BASE_URL}/api/siembras/${siembraId}/insumos`, { headers: authHeaders() }), fetch(`${API_BASE_URL}/api/siembras/${siembraId}/documentos`, { headers: authHeaders() })]);
      const insumosCargados = insRes.ok ? await insRes.json() : [];
      setInsumos(insumosCargados);
      const aplicacionActual = insumosCargados[0];
      setPulverizacionForm(aplicacionActual ? { fechaAplicacion: toDateInput(aplicacionActual.fechaAplicacion), motivoAplicacion: aplicacionActual.motivoAplicacion || "" } : emptyPulverizacionForm);
      setDocumentos(docRes.ok ? await docRes.json() : []);
    } catch (err) {
      setError(`No se pudo cargar la informacion de la siembra: ${err.message}`);
    }
  }
  function llenarFormDesdeSiembra(siembra) {
    const lote = lotes?.find((l) => String(l.loteId) === String(siembra.loteId));
    setForm({ loteId: siembra.loteId, cantidadHectareasLote: lote?.hectareas ?? "", tipoRegistro: siembra.tipoRegistro || "Siembra", siembraOriginalId: siembra.siembraOriginalId ?? "", tipoResiembra: siembra.tipoResiembra || "Parcial", siniestro: siembra.siniestro || "", campaniaNombre: siembra.campaniaNombre || "", producto: siembra.producto, empresa: siembra.empresa || "", fechaInicio: toDateInput(siembra.fechaInicio), fechaFin: toDateInput(siembra.fechaFin), fechaFinReal: toDateInput(siembra.fechaFinReal), justificacionDesvioFin: siembra.justificacionDesvioFin || "", hectareasHora: siembra.hectareasHora ?? "", variedadSemilla: siembra.variedadSemilla || "", cicloCultivo: siembra.cicloCultivo || "", tipoImplantacion: siembra.tipoImplantacion || "", pmg: siembra.pmg ?? "", densidadSiembra: siembra.densidadSiembra ?? "", profundidad: siembra.profundidad ?? "", cantidadHectareasTrabajadas: siembra.cantidadHectareasTrabajadas ?? "", ureaKgHa: siembra.ureaKgHa ?? "", cantidadSemillas: siembra.cantidadSemillas ?? "", responsableACargo: siembra.responsableACargo || "", fechaMuestreo: toDateInput(siembra.fechaMuestreo), fechaAnalisis: toDateInput(siembra.fechaAnalisis), cantidadMuestras: siembra.cantidadMuestras ?? "", productoAntecesor: siembra.productoAntecesor || "", observacionesPreSiembra: siembra.observacionesPreSiembra || "" });
  }
  async function openEdit(siembra) {
    setSelectedSiembra(siembra);
    setPendingGrainChange(null);
    llenarFormDesdeSiembra(siembra);
    setInsumoForm(emptyInsumoForm);
    setPulverizacionForm(emptyPulverizacionForm);
    setError("");
    await loadSubItems(siembra.siembraId);
    setView("edit");
  }
  async function openDetail(siembra) {
    setSelectedSiembra(siembra);
    llenarFormDesdeSiembra(siembra);
    setError("");
    await loadSubItems(siembra.siembraId);
    setView("detail");
  }
  function openFinalizarSiembra(siembra) {
    setSelectedSiembra(siembra);
    llenarFormDesdeSiembra(siembra);
    setError("");
    setView("finalizar");
  }
  function updateField(field, value) {
    if (["pmg", "densidadSiembra", "profundidad", "cantidadHectareasTrabajadas", "cantidadSemillas", "ureaKgHa", "hectareasHora"].includes(field) && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) return;
    if (field === "tipoRegistro" || field === "loteId" || field === "campaniaNombre") {
      setPendingGrainChange(null);
    }
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "tipoRegistro") {
        next.siembraOriginalId = "";
        next.tipoResiembra = value === "Resiembra" ? "Parcial" : "";
        next.siniestro = "";
        next.loteId = "";
        next.cantidadHectareasLote = "";
        next.campaniaNombre = selectedCampaniaName || next.campaniaNombre;
        next.empresa = selectedEmpresaName || next.empresa;
      }
      if (field === "campaniaNombre" && current.tipoRegistro === "Resiembra") {
        next.siembraOriginalId = "";
        next.loteId = "";
        next.cantidadHectareasLote = "";
        next.producto = "";
        next.empresa = "";
      }
      if (field === "loteId") {
        const lote = lotes?.find((l) => String(l.loteId) === String(value));
        const campaniaCombo = selectedCampaniaCombinaciones.find((item) => String(item.loteId) === String(value));
        const hectareas = campaniaCombo?.hectareas ?? lote?.hectareas ?? "";
        next.cantidadHectareasLote = hectareas;
        next.cantidadHectareasTrabajadas = hectareas;
        next.variedadSemilla = "";
        next.cicloCultivo = "";
        next.tipoImplantacion = "";
        if (campaniaCombo && current.tipoRegistro !== "Resiembra") {
          next.producto = campaniaCombo.producto ?? next.producto;
          next.campaniaNombre = campaniaCombo.campaniaNombre || selectedCampaniaName || next.campaniaNombre;
          next.empresa = campaniaCombo.empresaNombre || selectedEmpresaName || next.empresa;
        }
        if (current.tipoRegistro === "Resiembra") {
          const anteriores = siembras.filter((siembra) => String(siembra.loteId) === String(value) && normalizeSearchText(siembra.campaniaNombre || "") === normalizeSearchText(current.campaniaNombre || "")).sort((a, b) => b.siembraId - a.siembraId);
          const anterior = anteriores[0];
          next.siembraOriginalId = anterior?.siembraId ?? "";
          next.producto = anterior?.producto ?? next.producto;
          next.empresa = anterior?.empresa ?? next.empresa;
        }
      }
      if (field === "producto" && normalizeSearchText(value) !== normalizeSearchText(current.producto)) {
        next.variedadSemilla = "";
        next.cicloCultivo = "";
        next.tipoImplantacion = "";
      }
      if (field === "cantidadHectareasLote") {
        next.cantidadHectareasTrabajadas = value;
      }
      if (field === "tipoResiembra" && value === "Parcial" && current.siembraOriginalId) {
        const original = siembras.find((siembra) => String(siembra.siembraId) === String(current.siembraOriginalId));
        const productoOriginal = original?.producto ?? next.producto;
        if (normalizeSearchText(productoOriginal) !== normalizeSearchText(current.producto)) {
          next.variedadSemilla = "";
          next.cicloCultivo = "";
          next.tipoImplantacion = "";
        }
        next.producto = productoOriginal;
      }
      if (field === "densidadSiembra" || field === "cantidadHectareasTrabajadas") {
        const densidad = Number(field === "densidadSiembra" ? value : next.densidadSiembra);
        const hectareas = Number(field === "cantidadHectareasTrabajadas" ? value : next.cantidadHectareasTrabajadas);
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
    const combinaciones = (campania.combinaciones || []).map((item) => ({ loteId: item.loteId, producto: String(item.loteId) === String(loteId) ? producto : item.producto, fechaInicio: toDateInput(item.fechaInicio || campania.fechaInicio), fechaFin: toDateInput(item.fechaFin || campania.fechaFin) }));
    const updateResponse = await fetch(`${API_BASE_URL}/api/campanias/${selectedCampania.campaniaId}`, { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ fechaInicio: toDateInput(campania.fechaInicio), fechaFin: toDateInput(campania.fechaFin), observaciones: campania.observaciones || null, combinaciones }) });
    if (!updateResponse.ok) throw new Error(`No se pudo actualizar el grano planificado (${updateResponse.status}): ${await updateResponse.text()}`);
    await onCampaniasChanged?.();
    await onLotesChanged?.();
  }
  async function confirmGrainChange(nextProductOverride) {
    if (!grainChangeModal) return;
    const nextProduct = nextProductOverride || grainChangeModal.nextProduct;
    setError("");
    setPendingGrainChange({ loteId: grainChangeModal.loteId, producto: nextProduct });
    updateField("producto", nextProduct);
    setGrainChangeModal(null);
  }
  function buildBody() {
    const cultivoConDetalle = ["soja", "maiz"].includes(normalizeSearchText(form.producto));
    return { tipoRegistro: form.tipoRegistro || "Siembra", siembraOriginalId: form.tipoRegistro === "Resiembra" && form.siembraOriginalId !== "" ? Number(form.siembraOriginalId) : null, tipoResiembra: form.tipoRegistro === "Resiembra" ? form.tipoResiembra : null, siniestro: form.tipoRegistro === "Resiembra" ? form.siniestro || null : null, loteId: Number(form.loteId), campaniaNombre: selectedCampaniaName || form.campaniaNombre || null, producto: form.producto, empresa: selectedEmpresaName || form.empresa || null, fechaInicio: form.fechaInicio, fechaFin: form.fechaFin, variedadSemilla: form.variedadSemilla || null, cicloCultivo: cultivoConDetalle ? form.cicloCultivo || null : null, tipoImplantacion: cultivoConDetalle ? form.tipoImplantacion || null : null, pmg: form.pmg === "" ? null : Number(form.pmg), densidadSiembra: form.densidadSiembra === "" ? null : Number(form.densidadSiembra), profundidad: form.profundidad === "" ? null : Number(form.profundidad), cantidadHectareasTrabajadas: form.cantidadHectareasTrabajadas === "" ? null : Number(form.cantidadHectareasTrabajadas), ureaKgHa: form.ureaKgHa === "" ? null : Number(form.ureaKgHa), cantidadSemillas: form.cantidadSemillas === "" ? null : Number(form.cantidadSemillas), responsableACargo: form.responsableACargo || null, fechaMuestreo: form.fechaMuestreo || null, fechaAnalisis: form.fechaAnalisis || null, cantidadMuestras: form.cantidadMuestras === "" ? null : Number(form.cantidadMuestras), productoAntecesor: form.productoAntecesor || null, observacionesPreSiembra: form.observacionesPreSiembra || null };
  }
  async function handleGuardar() {
    setSaving(true);
    setError("");
    try {
      if (selectedSiembra) {
        const response2 = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}`, { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(buildBody()) });
        if (!response2.ok) throw new Error(`al guardar los cambios (status ${response2.status}): ${await response2.text()}`);
        if (pendingGrainChange) await updatePlannedGrain(pendingGrainChange.loteId, pendingGrainChange.producto);
        goToList();
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/siembras`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(buildBody()) });
      if (!response.ok) throw new Error(`al crear la siembra (status ${response.status}): ${await response.text()}`);
      const nuevaSiembra = await response.json();
      const siembraId = nuevaSiembra.siembraId;
      for (const insumo of insumos) {
        const res = await fetch(`${API_BASE_URL}/api/siembras/${siembraId}/insumos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ fechaAplicacion: insumo.fechaAplicacion || null, motivoAplicacion: insumo.motivoAplicacion || null, marca: insumo.marca || null, tipo: insumo.tipo || null, variedad: insumo.variedad || null, cantidadAplicada: insumo.cantidadAplicada === "" ? null : Number(insumo.cantidadAplicada), unidadMedida: insumo.unidadMedida || null }) });
        if (!res.ok) throw new Error(`al agregar el insumo "${insumo.marca}" (status ${res.status}): ${await res.text()}`);
      }
      for (const documento of documentos) {
        const formData = new FormData();
        formData.append("archivo", documento.file);
        const res = await fetch(`${API_BASE_URL}/api/siembras/${siembraId}/documentos`, { method: "POST", headers: authHeaders(), body: formData });
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
    setError("");
    const fechaInicio = form.fechaInicio;
    const fechaFinReal = form.fechaFinReal;
    const diasDesvio = form.fechaFin && fechaFinReal ? Math.abs((new Date(fechaFinReal) - new Date(form.fechaFin)) / 864e5) : 0;
    if (!fechaFinReal) {
      setError("La Fecha real de finalizacion es obligatoria.");
      return;
    }
    if (fechaInicio && fechaFinReal < fechaInicio) {
      setError("La Fecha real de finalizacion no puede ser anterior a la Fecha de Inicio.");
      return;
    }
    if (fechaFinReal < OPERATION_DATE_MIN || fechaFinReal > OPERATION_DATE_MAX) {
      setError(`La Fecha real de finalizacion debe estar entre ${formatDateInputLabel(OPERATION_DATE_MIN)} y ${formatDateInputLabel(OPERATION_DATE_MAX)}.`);
      return;
    }
    if (Number(form.hectareasHora) <= 0) {
      setError("Las Hectareas hora deben ser mayores a cero.");
      return;
    }
    if (diasDesvio > DIAS_DESVIO_REQUIERE_JUSTIFICACION && !form.justificacionDesvioFin.trim()) {
      setError("La fecha real se aleja mas de 3 dias de la fecha tentativa. Debes registrar una justificacion.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/finalizar`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ fechaFinReal: form.fechaFinReal, justificacionDesvioFin: form.justificacionDesvioFin || null, hectareasHora: Number(form.hectareasHora) }) });
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
    if (!pulverizacionForm.fechaAplicacion || !pulverizacionForm.motivoAplicacion) {
      setError("Completa la fecha y el motivo de aplicación antes de cargar las drogas.");
      return;
    }
    const fechaUltimaCosecha = toDateInput(lotes?.find((lote) => String(lote.loteId) === String(form.loteId))?.historialCultivos?.find((historial) => historial.fechaFin)?.fechaFin);
    if (fechaUltimaCosecha && pulverizacionForm.fechaAplicacion < fechaUltimaCosecha) {
      setError(`La fecha de aplicación no puede ser anterior a la última cosecha finalizada del lote (${formatDateInputLabel(fechaUltimaCosecha)}).`);
      return;
    }
    if (!Number.isFinite(Number(insumoForm.cantidadAplicada)) || Number(insumoForm.cantidadAplicada) <= 0) {
      setError("La Cantidad aplicada debe ser mayor a cero.");
      return;
    }
    if (selectedSiembra) {
      setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/insumos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ fechaAplicacion: pulverizacionForm.fechaAplicacion, motivoAplicacion: pulverizacionForm.motivoAplicacion, marca: insumoForm.marca || null, tipo: insumoForm.tipo || null, variedad: insumoForm.variedad || null, cantidadAplicada: insumoForm.cantidadAplicada === "" ? null : Number(insumoForm.cantidadAplicada), unidadMedida: insumoForm.unidadMedida || null }) });
        if (!response.ok) throw new Error(await response.text());
        setInsumoForm(emptyInsumoForm);
        await loadSubItems(selectedSiembra.siembraId);
      } catch (err) {
        setError(`No se pudo agregar el insumo: ${err.message}`);
      }
      return;
    }
    setInsumos((current) => [{ tempId: nextTempId(), ...insumoForm, fechaAplicacion: pulverizacionForm.fechaAplicacion, motivoAplicacion: pulverizacionForm.motivoAplicacion }, ...current]);
    setInsumoForm(emptyInsumoForm);
  }
  async function handleEliminarInsumo(insumo) {
    if (selectedSiembra) {
      try {
        await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/insumos/${insumo.siembraInsumoId}`, { method: "DELETE", headers: authHeaders() });
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
        formData.append("archivo", file);
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/documentos`, { method: "POST", headers: authHeaders(), body: formData });
        if (!response.ok) throw new Error(await response.text());
        await loadSubItems(selectedSiembra.siembraId);
      } catch (err) {
        setError(`No se pudo subir el archivo: ${err.message}`);
      }
      return;
    }
    setDocumentos((current) => [{ tempId: nextTempId(), file, nombreArchivo: file.name }, ...current]);
  }
  async function handleEliminarDocumento(documento) {
    if (selectedSiembra) {
      try {
        await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/documentos/${documento.siembraDocumentoId}`, { method: "DELETE", headers: authHeaders() });
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
      const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/documentos/${documento.siembraDocumentoId}/descargar`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = documento.nombreArchivo;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(`No se pudo descargar el archivo: ${err.message}`);
    }
  }
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
      const [insRes, docRes] = await Promise.all([fetch(`${API_BASE_URL}/api/siembras/${siembraId}/seguimientos/${seguimientoId}/insumos`, { headers: authHeaders() }), fetch(`${API_BASE_URL}/api/siembras/${siembraId}/seguimientos/${seguimientoId}/documentos`, { headers: authHeaders() })]);
      setSeguimientoInsumos(insRes.ok ? await insRes.json() : []);
      setSeguimientoDocumentos(docRes.ok ? await docRes.json() : []);
    } catch (err) {
      setError(`No se pudo cargar la informacion de la recorrida: ${err.message}`);
    }
  }
  async function openHistorialSeguimiento(siembra) {
    setSelectedSiembra(siembra);
    setError("");
    await loadSeguimientos(siembra.siembraId);
    setView("seguimientoHistorial");
  }
  function handleOpenSeguimiento(siembra) {
    const ultimaResiembra = siembras.filter((registro) => registro.tipoRegistro === "Resiembra" && String(registro.loteId) === String(siembra.loteId) && normalizeSearchText(registro.campaniaNombre || "") === normalizeSearchText(siembra.campaniaNombre || "")).sort((a, b) => b.siembraId - a.siembraId)[0];
    if (ultimaResiembra && ultimaResiembra.siembraId !== siembra.siembraId) {
      setSeguimientoRedireccion({ origen: siembra, destino: ultimaResiembra });
      return;
    }
    if ((siembra.estadoSiembra || "En curso") !== "Finalizado") {
      setSeguimientoBloqueadoSiembra(siembra);
      return;
    }
    openHistorialSeguimiento(siembra);
  }
  function backFromHistorialSeguimiento() {
    setView("list");
    setSelectedSiembra(null);
    setError("");
    loadSiembras();
  }
  function openNuevoSeguimiento(siembra, tipoRegistro) {
    setSelectedSiembra(siembra);
    setActiveSeguimientoId(null);
    setSeguimientoForm({ ...getEmptySeguimientoForm(), tipoRegistro });
    setSeguimientoInsumoForm(emptyInsumoForm);
    setSeguimientoInsumos([]);
    setSeguimientoDocumentos([]);
    setError("");
    setView("seguimientoForm");
  }
  async function openEditarSeguimiento(siembra, seguimiento) {
    setSelectedSiembra(siembra);
    setActiveSeguimientoId(seguimiento.siembraSeguimientoId);
    setSeguimientoForm({ fecha: toDateInput(seguimiento.fecha), longitud: seguimiento.longitud ?? "", latitud: seguimiento.latitud ?? "", tipoRegistro: seguimiento.tipoRegistro || "Posemergente", siniestro: seguimiento.siniestro || "", alcance: seguimiento.alcance || "", incidencia: seguimiento.incidencia || "", perdidaEconomica: seguimiento.perdidaEconomica === null || seguimiento.perdidaEconomica === void 0 ? "" : seguimiento.perdidaEconomica ? "Si" : "No", aplicacionAgroquimicos: seguimiento.aplicacionAgroquimicos === null || seguimiento.aplicacionAgroquimicos === void 0 ? "" : seguimiento.aplicacionAgroquimicos ? "Si" : "No", observaciones: seguimiento.observaciones || "" });
    setSeguimientoInsumoForm(emptyInsumoForm);
    setError("");
    await loadSeguimientoSubItems(siembra.siembraId, seguimiento.siembraSeguimientoId);
    setView("seguimientoForm");
  }
  function backFromSeguimientoForm() {
    setView("seguimientoHistorial");
    setError("");
    if (selectedSiembra) loadSeguimientos(selectedSiembra.siembraId);
  }
  function updateSeguimientoField(field, value) {
    setSeguimientoForm((current) => ({ ...current, [field]: value }));
  }
  function handlePickPuntoMapa(latlng) {
    const lote = lotes?.find((item) => String(item.loteId) === String(selectedSiembra?.loteId));
    if (!puntoDentroDelPoligono(latlng, lote?.coordenadas)) {
      setError("El punto del seguimiento debe ubicarse dentro del pol\xEDgono del lote.");
      return;
    }
    setError("");
    setSeguimientoForm((current) => ({ ...current, latitud: latlng.lat.toFixed(6), longitud: latlng.lng.toFixed(6) }));
  }
  async function handleGuardarSeguimiento(event) {
    event.preventDefault();
    setSeguimientoSaving(true);
    setError("");
    try {
      const inicio = toDateInput(selectedSiembra.fechaInicio);
      const maximo = addMonthsToDateInput(inicio, 6);
      if (!seguimientoForm.fecha || seguimientoForm.fecha <= inicio || seguimientoForm.fecha > maximo) {
        throw new Error(`La fecha debe ser posterior al ${formatDateInputLabel(inicio)} y no superar el ${formatDateInputLabel(maximo)}.`);
      }
      if (seguimientoForm.latitud === "" || seguimientoForm.longitud === "") throw new Error("Marc\xE1 el punto del seguimiento en el mapa.");
      if (!seguimientoForm.alcance) throw new Error("Seleccion\xE1 el alcance.");
      if (seguimientoForm.tipoRegistro === "Siniestro" && !seguimientoForm.siniestro) throw new Error("Seleccion\xE1 el siniestro.");
      if (seguimientoForm.tipoRegistro === "Posemergente" && !seguimientoForm.incidencia) throw new Error("Seleccion\xE1 el motivo de aplicaci\xF3n.");
      const body = { fecha: seguimientoForm.fecha ? (/* @__PURE__ */ new Date(`${seguimientoForm.fecha}T00:00:00`)).toISOString() : null, longitud: seguimientoForm.longitud === "" ? null : Number(seguimientoForm.longitud), latitud: seguimientoForm.latitud === "" ? null : Number(seguimientoForm.latitud), tipoRegistro: seguimientoForm.tipoRegistro, siniestro: seguimientoForm.siniestro || null, alcance: seguimientoForm.alcance || null, incidencia: seguimientoForm.incidencia || null, perdidaEconomica: null, aplicacionAgroquimicos: seguimientoForm.tipoRegistro === "Posemergente", observaciones: seguimientoForm.observaciones };
      if (seguimientoForm.tipoRegistro === "Posemergente" && seguimientoInsumos.length === 0) {
        throw new Error("Debes agregar al menos un agroqu\xEDmico para registrar el posemergente.");
      }
      if (activeSeguimientoId) {
        const response2 = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}`, { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
        if (!response2.ok) throw new Error(`al guardar la recorrida (status ${response2.status}): ${await response2.text()}`);
        backFromSeguimientoForm();
        return;
      }
      const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`al crear la recorrida (status ${response.status}): ${await response.text()}`);
      const nueva = await response.json();
      const seguimientoId = nueva.siembraSeguimientoId;
      for (const insumo of seguimientoInsumos) {
        const res = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${seguimientoId}/insumos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ fechaAplicacion: insumo.fechaAplicacion || null, marca: insumo.marca || null, tipo: insumo.tipo || null, variedad: insumo.variedad || null, cantidadAplicada: insumo.cantidadAplicada === "" ? null : Number(insumo.cantidadAplicada), unidadMedida: insumo.unidadMedida || null }) });
        if (!res.ok) throw new Error(`al agregar el insumo "${insumo.marca || ""}" (status ${res.status}): ${await res.text()}`);
      }
      for (const documento of seguimientoDocumentos) {
        const formData = new FormData();
        formData.append("archivo", documento.file);
        const res = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${seguimientoId}/documentos`, { method: "POST", headers: authHeaders(), body: formData });
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
      await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${seguimiento.siembraSeguimientoId}`, { method: "DELETE", headers: authHeaders() });
      await loadSeguimientos(selectedSiembra.siembraId);
    } catch (err) {
      setError(`No se pudo eliminar la recorrida: ${err.message}`);
    }
  }
  async function handleFinalizarSeguimiento() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/finalizar`, { method: "POST", headers: authHeaders() });
      if (!response.ok) throw new Error(await response.text());
      setSelectedSiembra((current) => current ? { ...current, estado: "Finalizado" } : current);
      await loadSeguimientos(selectedSiembra.siembraId);
    } catch (err) {
      setError(`No se pudo finalizar el seguimiento: ${err.message}`);
    }
  }
  async function handleAgregarSeguimientoInsumo(event) {
    event.preventDefault();
    if (!seguimientoInsumoForm.marca?.trim() || !seguimientoInsumoForm.tipo || !seguimientoInsumoForm.variedad?.trim() || Number(seguimientoInsumoForm.cantidadAplicada) <= 0 || !seguimientoInsumoForm.unidadMedida) {
      setError("Complet\xE1 marca, tipo, droga, cantidad mayor que cero y unidad.");
      return;
    }
    if (activeSeguimientoId) {
      setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/insumos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ fechaAplicacion: seguimientoInsumoForm.fechaAplicacion || null, marca: seguimientoInsumoForm.marca || null, tipo: seguimientoInsumoForm.tipo || null, variedad: seguimientoInsumoForm.variedad || null, cantidadAplicada: seguimientoInsumoForm.cantidadAplicada === "" ? null : Number(seguimientoInsumoForm.cantidadAplicada), unidadMedida: seguimientoInsumoForm.unidadMedida || null }) });
        if (!response.ok) throw new Error(await response.text());
        setSeguimientoInsumoForm(emptyInsumoForm);
        await loadSeguimientoSubItems(selectedSiembra.siembraId, activeSeguimientoId);
      } catch (err) {
        setError(`No se pudo agregar el insumo: ${err.message}`);
      }
      return;
    }
    setSeguimientoInsumos((current) => [{ tempId: nextTempId(), ...seguimientoInsumoForm }, ...current]);
    setSeguimientoInsumoForm(emptyInsumoForm);
  }
  async function handleEliminarSeguimientoInsumo(insumo) {
    if (activeSeguimientoId) {
      try {
        await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/insumos/${insumo.seguimientoInsumoId}`, { method: "DELETE", headers: authHeaders() });
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
        formData.append("archivo", file);
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/documentos`, { method: "POST", headers: authHeaders(), body: formData });
        if (!response.ok) throw new Error(await response.text());
        await loadSeguimientoSubItems(selectedSiembra.siembraId, activeSeguimientoId);
      } catch (err) {
        setError(`No se pudo subir el archivo: ${err.message}`);
      }
      return;
    }
    setSeguimientoDocumentos((current) => [{ tempId: nextTempId(), file, nombreArchivo: file.name }, ...current]);
  }
  async function handleEliminarSeguimientoDocumento(documento) {
    if (activeSeguimientoId) {
      try {
        await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/documentos/${documento.seguimientoDocumentoId}`, { method: "DELETE", headers: authHeaders() });
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
      const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${seguimientoId}/documentos/${documento.seguimientoDocumentoId}/descargar`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
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
    setError("");
    await loadSeguimientoSubItems(selectedSiembra.siembraId, seguimiento.siembraSeguimientoId);
    setView("seguimientoDetalle");
  }
  function backFromDetalleSeguimiento() {
    setView("seguimientoHistorial");
    setSeguimientoDetalle(null);
    setError("");
    if (selectedSiembra) loadSeguimientos(selectedSiembra.siembraId);
  }
  if (view === "create" || view === "edit") {
    return <>        <SiembraForm modoEdicion={view === "edit"} nombre={selectedSiembra?.nombre} estado={selectedSiembra?.estado} lotes={lotes ?? []} siembras={siembras} selectedCampania={selectedCampania} selectedCampaniaCombinaciones={selectedCampaniaCombinaciones ?? []} selectedEmpresaName={selectedEmpresaName} selectedCampaniaName={selectedCampaniaName} usuarios={usuarios} form={form} insumoForm={insumoForm} pulverizacionForm={pulverizacionForm} marcasAgroquimicos={marcasAgroquimicos} drogasAgroquimicos={drogasAgroquimicos} variedadesSemilla={variedadesSemilla} onAgregarValorCatalogo={agregarValorCatalogo} onAgregarVariedadSemilla={agregarVariedadSemilla} insumos={insumos} documentos={documentos} saving={saving} error={error} onFieldChange={updateField} onRequestGrainChange={(payload) => setGrainChangeModal(payload)} onPulverizacionFieldChange={(field, value) => setPulverizacionForm((current) => field === "fechaAplicacion" && current.fechaAplicacion !== value ? { fechaAplicacion: value, motivoAplicacion: "" } : { ...current, [field]: value })} onInsumoFieldChange={(field, value) => setInsumoForm((current) => ({ ...current, [field]: value }))} onGuardar={handleGuardar} onAgregarInsumo={handleAgregarInsumo} onEliminarInsumo={handleEliminarInsumo} onSubirDocumento={handleSubirDocumento} onDescargarDocumento={handleDescargarDocumento} onEliminarDocumento={handleEliminarDocumento} onBack={goToList} />        {grainChangeModal && <GrainChangeModal change={grainChangeModal} saving={saving} onCancel={() => setGrainChangeModal(null)} onConfirm={confirmGrainChange} />}      </>;
  }
  if (view === "detail") {
    return <SiembraDetalle siembra={selectedSiembra} insumos={insumos} documentos={documentos} onDescargarDocumento={handleDescargarDocumento} onBack={goToList} />;
  }
  if (view === "seguimientoHistorial") {
    return <SeguimientoHistorialList siembra={selectedSiembra} seguimientos={seguimientos} error={error} onNuevoSiniestro={() => openNuevoSeguimiento(selectedSiembra, "Siniestro")} onNuevoPosemergente={() => openNuevoSeguimiento(selectedSiembra, "Posemergente")} onVer={openDetalleSeguimiento} onEditar={(seguimiento) => openEditarSeguimiento(selectedSiembra, seguimiento)} onEliminar={handleEliminarSeguimiento} onFinalizar={handleFinalizarSeguimiento} onBack={backFromHistorialSeguimiento} />;
  }
  if (view === "seguimientoForm") {
    const loteDeSiembra = lotes?.find((l) => String(l.loteId) === String(selectedSiembra?.loteId));
    return <SeguimientoForm siembra={selectedSiembra} lotePoligono={loteDeSiembra?.coordenadas ?? []} modoEdicion={Boolean(activeSeguimientoId)} seguimientoForm={seguimientoForm} insumoForm={seguimientoInsumoForm} marcasAgroquimicos={marcasAgroquimicos} drogasAgroquimicos={drogasAgroquimicos} onAgregarValorCatalogo={agregarValorCatalogo} insumos={seguimientoInsumos} documentos={seguimientoDocumentos} saving={seguimientoSaving} error={error} onFieldChange={updateSeguimientoField} onPickPunto={handlePickPuntoMapa} onGuardar={handleGuardarSeguimiento} onInsumoFieldChange={(field, value) => setSeguimientoInsumoForm((current) => ({ ...current, [field]: value }))} onAgregarInsumo={handleAgregarSeguimientoInsumo} onEliminarInsumo={handleEliminarSeguimientoInsumo} onSubirDocumento={handleSubirSeguimientoDocumento} onDescargarDocumento={(doc) => handleDescargarSeguimientoDocumento(doc, activeSeguimientoId)} onEliminarDocumento={handleEliminarSeguimientoDocumento} onBack={backFromSeguimientoForm} />;
  }
  if (view === "seguimientoDetalle") {
    const loteDeSiembra = lotes?.find((l) => String(l.loteId) === String(selectedSiembra?.loteId));
    return <SeguimientoDetalle siembra={selectedSiembra} lotePoligono={loteDeSiembra?.coordenadas ?? []} seguimiento={seguimientoDetalle} insumos={seguimientoInsumos} documentos={seguimientoDocumentos} onDescargarDocumento={(doc) => handleDescargarSeguimientoDocumento(doc, seguimientoDetalle.siembraSeguimientoId)} onBack={backFromDetalleSeguimiento} />;
  }
  return <>      {view === "finalizar" && <FinalizarSiembra siembra={selectedSiembra} form={form} saving={saving} error={error} onFieldChange={updateField} onFinalizar={handleFinalizarSiembra} onBack={goToList} />}      <SiembrasList siembras={siembras} parentFilters={parentFilters} selectedEmpresaName={selectedEmpresaName} selectedCampaniaName={selectedCampaniaName} loading={loading} error={error} onAdd={startCreate} onEdit={openEdit} onView={openDetail} onSeguimiento={handleOpenSeguimiento} onFinalize={openFinalizarSiembra} />      {seguimientoBloqueadoSiembra && <SeguimientoBloqueadoModal siembra={seguimientoBloqueadoSiembra} onClose={() => setSeguimientoBloqueadoSiembra(null)} />}      {seguimientoRedireccion && <SeguimientoRedireccionModal origen={seguimientoRedireccion.origen} destino={seguimientoRedireccion.destino} onCancel={() => setSeguimientoRedireccion(null)} onGo={() => {
    const destino = seguimientoRedireccion.destino;
    setSeguimientoRedireccion(null);
    openHistorialSeguimiento(destino);
  }} />}    </>;
}
function addMonthsToDateInput(value, months) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12 + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
function puntoDentroDelPoligono(punto, coordenadas) {
  const vertices = (coordenadas ?? []).slice().sort((a, b) => a.orden - b.orden).map((coordenada) => ({ lat: Number(coordenada.latitud), lng: Number(coordenada.longitud) }));
  if (vertices.length < 3) return false;
  let dentro = false;
  for (let indice = 0, anterior = vertices.length - 1; indice < vertices.length; anterior = indice++) {
    const actual = vertices[indice];
    const previo = vertices[anterior];
    const intersecta = actual.lat > punto.lat !== previo.lat > punto.lat && punto.lng < (previo.lng - actual.lng) * (punto.lat - actual.lat) / (previo.lat - actual.lat) + actual.lng;
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}
function SiembrasList({ siembras, parentFilters, selectedEmpresaName, selectedCampaniaName, loading, error, onAdd, onEdit, onView, onSeguimiento, onFinalize }) {
  const [query, setQuery] = useState("");
  const [productoFilter, setProductoFilter] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [mostrarMasFiltros, setMostrarMasFiltros] = useState(false);
  const [selected, setSelected] = useState({});
  const productoOptions = useMemo(() => [...new Set(siembras.map((s) => s.producto).filter(Boolean))], [siembras]);
  const resiembrasPorOriginal = useMemo(() => siembras.reduce((acc, siembra) => {
    if (siembra.tipoRegistro === "Resiembra" && siembra.siembraOriginalId) {
      acc[String(siembra.siembraOriginalId)] = siembra;
    }
    return acc;
  }, {}), [siembras]);
  function getResiembraLabel(siembra) {
    if (siembra.tipoRegistro === "Resiembra") {
      return `Resiembra ${siembra.tipoResiembra || ""}`.trim();
    }
    return resiembrasPorOriginal[String(siembra.siembraId)] ? "Si" : "No";
  }
  function getSiniestroLabel(siembra) {
    if (siembra.siniestro) return siembra.siniestro;
    return resiembrasPorOriginal[String(siembra.siembraId)]?.siniestro || "-";
  }
  const filtered = useMemo(() => siembras.filter((s) => {
    const texto = normalizeSearchText(query.trim());
    const camposBusqueda = [s.nombre, s.campaniaNombre, s.producto, s.loteNombre, getResiembraLabel(s), s.siniestro, s.estadoSiembra, s.estado, String(s.cantidadHectareasTrabajadas ?? ""), formatNumber(s.cantidadHectareasTrabajadas, " ha")];
    const matchesQuery = !texto || camposBusqueda.some((campo) => normalizeSearchText(campo ?? "").includes(texto));
    const matchesGrano = !productoFilter || s.producto === productoFilter;
    const matchesEstado = !estadoFilter || s.estadoSiembra === estadoFilter;
    const matchesEmpresa = !selectedEmpresaName || normalizeSearchText(s.empresa || "") === normalizeSearchText(selectedEmpresaName);
    const matchesCampania = !selectedCampaniaName || normalizeSearchText(s.campaniaNombre || "") === normalizeSearchText(selectedCampaniaName);
    const fecha = toDateInput(s.fechaInicio);
    const matchesFecha = (!fechaDesde || fecha >= fechaDesde) && (!fechaHasta || fecha && fecha <= fechaHasta);
    return matchesQuery && matchesGrano && matchesEstado && matchesEmpresa && matchesCampania && matchesFecha;
  }), [siembras, query, productoFilter, estadoFilter, fechaDesde, fechaHasta, resiembrasPorOriginal, selectedEmpresaName, selectedCampaniaName]);
  const productividadPromedio = useMemo(() => {
    const registros = filtered.filter((s) => (s.estadoSiembra || "En curso") === "Finalizado" && Number(s.hectareasHora) > 0);
    if (registros.length === 0) return null;
    const total = registros.reduce((acc, siembra) => acc + Number(siembra.hectareasHora || 0), 0);
    return total / registros.length;
  }, [filtered]);
  function clearFilters() {
    setQuery("");
    setProductoFilter("");
    setEstadoFilter("");
    setFechaDesde("");
    setFechaHasta("");
  }
  const hayFilasSeleccionadas = Object.values(selected).some(Boolean);
  const hayFiltrosTabla = Boolean(query.trim() || productoFilter || estadoFilter || fechaDesde || fechaHasta);
  function toggleSeleccion(siembraId) {
    setSelected((current) => ({ ...current, [siembraId]: !current[siembraId] }));
  }
  return <section className="content-panel list-panel">      <div className="page-heading">        <div>          <h1>Siembras</h1>          <p>Registra y hace seguimiento de cada tarea de siembra.</p>        </div>        <button className="green-button add-lote-button" type="button" onClick={onAdd}>          <PlusCircle size={18} />          <span>Registrar Siembra</span>        </button>      </div>      {parentFilters}      {error && <p style={{ color: "#c0392b", fontWeight: 700 }}>{error}</p>}      <div className="summary-grid">        <article className="summary-card">          <div className="summary-icon"><Gauge size={28} /></div>          <div>            <span>Productividad promedio</span>            <strong>{formatNumber(productividadPromedio, " ha/h")}</strong>            <small>Calculado sobre siembras finalizadas</small>          </div>        </article>      </div>      <div className="filters-card">        <label className="search-field">          <Search size={21} />          <input data-text-case="preserve" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cualquier dato de la siembra..." />        </label>        <select value={productoFilter} onChange={(event) => setProductoFilter(event.target.value)}>          <option value="">Grano</option>          {productoOptions.map((producto) => <option key={producto} value={producto}>{producto}</option>)}        </select>        <select value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)}>          <option value="">Estado</option>          <option value="En curso">En curso</option>          <option value="Finalizado">Finalizado</option>        </select>        <button className="soft-filter-button" type="button" aria-expanded={mostrarMasFiltros} aria-controls="siembras-fechas-filtros" onClick={() => setMostrarMasFiltros((actual) => !actual)}>          <Filter size={17} />          <span>Mas filtros</span>        </button>        <button className="clear-button" type="button" onClick={clearFilters}>          <RotateCcw size={17} />          <span>Limpiar</span>        </button>        {mostrarMasFiltros && <fieldset id="siembras-fechas-filtros" className="siembras-date-filter">          <legend>Fecha de inicio</legend>          <label className="field">Desde            <input type="date" value={fechaDesde} max={fechaHasta || void 0} onChange={(event) => setFechaDesde(event.target.value)} />          </label>          <label className="field">Hasta            <input type="date" value={fechaHasta} min={fechaDesde || void 0} onChange={(event) => setFechaHasta(event.target.value)} />          </label>          {fechaDesde && fechaHasta && fechaDesde > fechaHasta && <span className="field-error">La fecha Hasta no puede ser anterior a Desde.</span>}        </fieldset>}      </div>      {loading ? <div className="table-shell dashboard-card">          <div className="loading-state">            <LoaderCircle className="spin" size={24} />            <span>Cargando siembras...</span>          </div>        </div> : siembras.length === 0 ? <section className="empty-state dashboard-card">          <div className="empty-state-icon"><Sprout size={92} strokeWidth={1.8} /></div>          <div className="empty-state-copy">            <h2>Aun no tenes siembras registradas</h2>            <p>Registra tu primera siembra para empezar a hacerle seguimiento.</p>          </div>          <button className="green-button empty-state-action" type="button" onClick={onAdd}>            <PlusCircle size={18} />            <span>Registrar Siembra</span>          </button>        </section> : filtered.length === 0 ? <section className="empty-state dashboard-card empty-state-compact">          <div className="empty-state-icon"><Search size={82} strokeWidth={1.8} /></div>          <div className="empty-state-copy">            <h2>{hayFiltrosTabla ? "No hay siembras para esos filtros" : "No hay siembras para la empresa o campa\xF1a seleccionada"}</h2>            <p>{hayFiltrosTabla ? "Limpia los filtros para volver a ver los registros disponibles." : "Cambia la empresa o campa\xF1a desde los filtros superiores."}</p>          </div>          {hayFiltrosTabla && <button className="green-button empty-state-action" type="button" onClick={clearFilters}>              <RotateCcw size={18} />              <span>Limpiar filtros</span>            </button>}          {!hayFiltrosTabla && <button className="green-button empty-state-action" type="button" onClick={onAdd}>              <PlusCircle size={18} />              <span>Registrar Siembra</span>            </button>}        </section> : <div className="table-shell dashboard-card">          <table className="lotes-table">            <thead>              <tr>                <th style={{ width: 32 }} />                <th>Nombre</th>                <th>Fecha de Inicio</th>                <th>Fecha de fin</th>                <th>Grano</th>                <th>Lote</th>                <th>Resiembra</th>                <th>Siniestro</th>                <th>Hectáreas</th>                <th>Hectareas hora</th>                <th>Seguimiento</th>                <th>Estado</th>                <th style={{ textAlign: "center" }}>Acciones</th>              </tr>            </thead>            <tbody>              {filtered.map((siembra) => <tr key={siembra.siembraId}>                  <td>                    <input type="checkbox" checked={Boolean(selected[siembra.siembraId])} onChange={() => toggleSeleccion(siembra.siembraId)} />                  </td>                  <td>{siembra.nombre}</td>                  <td>{formatFecha(siembra.fechaInicio)}</td>                  <td>{siembra.fechaFinReal ? formatFecha(siembra.fechaFinReal) : "\u2014"}</td>                  <td>{siembra.producto}</td>                  <td>{siembra.loteNombre}</td>                  <td><ResiembraChip value={getResiembraLabel(siembra)} /></td>                  <td>{getSiniestroLabel(siembra)}</td>                  <td>{formatNumber(siembra.cantidadHectareasTrabajadas, " ha")}</td>                  <td>{formatNumber(siembra.hectareasHora, " ha/h")}</td>                  <td><SeguimientoEstadoChip estado={siembra.estado} /></td>                  <td><EstadoSiembraButton estado={siembra.estadoSiembra || "En curso"} onFinalize={() => onFinalize(siembra)} /></td>                  <td className="actions-cell">                    <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar ${siembra.nombre}`} onClick={() => onEdit(siembra)}><Edit size={18} /></button>                    <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label={`Ver ${siembra.nombre}`} onClick={() => onView(siembra)}><Eye size={18} /></button>                    <button className="table-action-tooltip" data-tooltip="Seguimiento" type="button" aria-label={`Seguimiento de ${siembra.nombre}`} onClick={() => onSeguimiento(siembra)}><Route size={18} /></button>                  </td>                </tr>)}            </tbody>          </table>          {hayFilasSeleccionadas && <div className="form-actions" style={{ justifyContent: "flex-end", padding: "12px 16px" }}>              <button className="green-button" type="button">                Exportar Registros              </button>            </div>}        </div>}    </section>;
}
function ResiembraChip({ value }) {
  const esNo = value === "No";
  const esSi = value === "Si";
  const className = ["resiembra-chip", esNo ? "resiembra-chip-no" : "", esSi ? "resiembra-chip-si" : "", !esNo && !esSi ? "resiembra-chip-registro" : ""].filter(Boolean).join(" ");
  return <span className={className}>{value}</span>;
}
function SeguimientoBloqueadoModal({ siembra, onClose }) {
  return createPortal(<div className="cosecha-warning-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="seguimiento-bloqueado-title">      <div className="cosecha-warning-modal seguimiento-warning-modal">        <div className="login-icon">          <AlertTriangle size={25} />        </div>        <div>          <h2 id="seguimiento-bloqueado-title">Primero finaliza la siembra</h2>          <p>            Para registrar seguimientos de {siembra.nombre}, la siembra debe estar finalizada.            El seguimiento corresponde al cultivo ya implantado, no al proceso de sembrado.          </p>        </div>        <div className="form-actions modal-actions">          <button className="green-button" type="button" onClick={onClose}>Entendido</button>        </div>      </div>    </div>, document.body);
}
function SeguimientoRedireccionModal({ origen, destino, onCancel, onGo }) {
  return createPortal(<div className="cosecha-warning-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="seguimiento-redireccion-title">      <div className="cosecha-warning-modal seguimiento-warning-modal">        <div className="login-icon"><Info size={25} /></div>        <div>          <h2 id="seguimiento-redireccion-title">El seguimiento continúa en la última resiembra</h2>          <p>            {origen.nombre} pertenece a una etapa anterior. Para consultar el historial completo del lote,            incluidos siniestros y aplicaciones previas, abrí {destino.nombre}.          </p>        </div>        <div className="form-actions modal-actions">          <button className="back-button" type="button" onClick={onCancel}>Cancelar</button>          <button className="green-button" type="button" onClick={onGo}>Ir a la última resiembra</button>        </div>      </div>    </div>, document.body);
}
function GrainChangeModal({ change, saving, onCancel, onConfirm }) {
  const initialProduct = change.nextProduct || "";
  const [grainMode, setGrainMode] = useState(GRANOS_PLANIFICABLES.includes(initialProduct) ? initialProduct : initialProduct ? "Otro" : "");
  const [nextProduct, setNextProduct] = useState(GRANOS_PLANIFICABLES.includes(initialProduct) ? initialProduct : initialProduct);
  function handleGrainModeChange(value) {
    setGrainMode(value);
    setNextProduct(value === "Otro" ? "" : value);
  }
  return createPortal(<div className="cosecha-warning-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="grain-change-title">      <div className="cosecha-warning-modal grain-change-modal">        <div className="modal-heading">          <div className="campaign-period-icon"><AlertTriangle size={24} /></div>          <div>            <h2 id="grain-change-title">Cambiar grano planificado</h2>            <p>              En la planificacion de campaña para {change.loteNombre} se eligio {change.currentProduct}.              Al finalizar el registro de esta siembra, el cambio se actualizara tambien en Campañas y en Lotes.            </p>          </div>        </div>        <label className="field">          Nuevo grano          <select value={grainMode} onChange={(event) => handleGrainModeChange(event.target.value)}>            <option value="">Seleccionar</option>            {GRANOS_PLANIFICABLES.map((grain) => <option key={grain} value={grain}>{grain}</option>)}          </select>        </label>        {grainMode === "Otro" && <label className="field">            Otro grano            <input maxLength={10} value={nextProduct} onChange={(event) => setNextProduct(event.target.value.slice(0, 10))} placeholder="Max. 10 caracteres" />          </label>}        <div className="modal-actions">          <button className="green-button" type="button" disabled={saving || !nextProduct.trim()} onClick={() => onConfirm(nextProduct.trim())}>            {saving ? <LoaderCircle className="spin-icon" size={17} /> : <CheckCircle2 size={17} />}            Confirmar cambio          </button>          <button className="back-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>        </div>      </div>    </div>, document.body);
}
function SeguimientoEstadoChip({ estado }) {
  const normalized = estado || "Pendiente";
  const className = ["seguimiento-status-chip", normalized === "Pendiente" ? "seguimiento-status-pending" : "", normalized === "En curso" ? "seguimiento-status-active" : "", normalized === "Finalizado" ? "seguimiento-status-done" : ""].filter(Boolean).join(" ");
  return <span className={className}>      <span aria-hidden="true" />      {normalized}    </span>;
}
function EstadoSiembraButton({ estado, onFinalize }) {
  const finalizada = estado === "Finalizado";
  if (finalizada) {
    return <span className="siembra-state-pill siembra-state-done">Finalizado</span>;
  }
  return <button className="siembra-state-button" type="button" onClick={onFinalize} title="Finalizar siembra">      <span className="state-label-current">En curso</span>      <span className="state-label-action">Finalizar</span>    </button>;
}
function FinalizarSiembra({ siembra, form, saving, error, onFieldChange, onFinalizar, onBack }) {
  const diasDesvio = form.fechaFin && form.fechaFinReal ? Math.abs((new Date(form.fechaFinReal) - new Date(form.fechaFin)) / 864e5) : 0;
  const requiereJustificacion = diasDesvio > DIAS_DESVIO_REQUIERE_JUSTIFICACION;
  const fechaRealMinima = form.fechaInicio || OPERATION_DATE_MIN;
  const fechaRealMaxima = OPERATION_DATE_MAX;
  return createPortal(<div className="cosecha-warning-modal-backdrop" role="dialog" aria-modal="true" aria-label="Finalizar siembra"><section className="cosecha-warning-modal siembra-finalizar-modal">      <div className="page-heading create-heading">        <div>          <h1>Finalizar Siembra</h1>          <p>{siembra?.nombre} - registra el cierre real del proceso de siembra.</p>        </div>      </div>            {error && <p style={{ color: "#c0392b", fontWeight: 700 }}>{error}</p>}      <div className="create-form-card dashboard-card">        <div className="create-grid">          <label className="field">Fecha de Inicio<input readOnly value={formatFecha(siembra?.fechaInicio)} /></label>          <label className="field">Fecha tentativa de Fin<input readOnly value={formatFecha(siembra?.fechaFin)} /></label>          <label className="field">Grano<input readOnly value={siembra?.producto || "-"} /></label>          <label className="field">Lote<input readOnly value={siembra?.loteNombre || "-"} /></label>          <label className="field">Campaña<input readOnly value={siembra?.campaniaNombre || "-"} /></label>          <label className="field">Empresa<input readOnly value={siembra?.empresa || "-"} /></label>        </div>      </div>      <h2>Cierre de siembra</h2>      <div className="create-form-card dashboard-card">        <div className="create-grid">          <label className="field">            <span className="field-label">Fecha real de finalizacion <b>*</b></span>            <input autoFocus type="date" min={fechaRealMinima} max={fechaRealMaxima} required value={form.fechaFinReal} onChange={(e) => onFieldChange("fechaFinReal", e.target.value)} />          </label>          <label className="field">            <span className="field-label">Hectareas por hora promedio <b>*</b></span>            <input type="number" min="0" step="0.01" required value={form.hectareasHora} onChange={(e) => onFieldChange("hectareasHora", e.target.value)} />            <span style={{ fontSize: 12, color: "#6b7280" }}>Productividad operativa registrada para este lote.</span>          </label>          {requiereJustificacion && <label className="field" style={{ gridColumn: "1 / -1" }}>              <span className="field-label">Justificacion del desvio <b>*</b></span>              <textarea value={form.justificacionDesvioFin} onChange={(e) => onFieldChange("justificacionDesvioFin", e.target.value)} placeholder="Explica por que la fecha real se alejo de la fecha tentativa." />            </label>}        </div>      </div>      <div className="form-actions">        <button className="green-button" type="button" disabled={saving} onClick={onFinalizar}>          <CheckCircle2 size={17} />          {saving ? "Finalizando..." : "Finalizar siembra"}        </button>        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>      </div>    </section></div>, document.body);
}
function SiembraForm({ modoEdicion, nombre, estado, lotes = [], siembras = [], selectedCampania, selectedCampaniaCombinaciones = [], selectedEmpresaName, selectedCampaniaName, usuarios, form, insumoForm, pulverizacionForm, marcasAgroquimicos, drogasAgroquimicos, variedadesSemilla, onAgregarValorCatalogo, onAgregarVariedadSemilla, insumos, documentos, saving, error, onFieldChange, onRequestGrainChange, onPulverizacionFieldChange, onInsumoFieldChange, onGuardar, onAgregarInsumo, onEliminarInsumo, onSubirDocumento, onDescargarDocumento, onEliminarDocumento, onBack }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [pulverizoResiembra, setPulverizoResiembra] = useState(() => insumos.length > 0 ? "si" : "no");
  const mostrarAgroquimicos = form.tipoRegistro !== "Resiembra" || pulverizoResiembra === "si" || insumos.length > 0;
  const esResiembra = form.tipoRegistro === "Resiembra";
  const campaniaActualNombre = selectedCampaniaName || form.campaniaNombre;
  const empresaActualNombre = selectedEmpresaName || form.empresa;
  const campaniaNormalizada = normalizeSearchText(campaniaActualNombre);
  const periodoCampania = campaniaActualNombre?.match(/^(\d{4})-\d{4}(?:\s|$)/);
  const fechaPreSiembraMinima = periodoCampania ? `${periodoCampania[1]}-01-01` : OPERATION_DATE_MIN;
  const fechaPreSiembraMaxima = form.fechaInicio || OPERATION_DATE_MAX;
  const ultimaSiembraSeleccionada = siembras.find((siembra) => String(siembra.siembraId) === String(form.siembraOriginalId));
  const finCampania = campaniaActualNombre?.match(/^\d{4}-(\d{4})(?:\s|$)/);
  const fechaFinMaxima = esResiembra && finCampania ? `${finCampania[1]}-12-31` : OPERATION_DATE_MAX;
  const finOriginal = toDateInput(ultimaSiembraSeleccionada?.fechaFinReal);
  const fechaInicioMinima = esResiembra && finOriginal ? finOriginal : OPERATION_DATE_MIN;
  let fechaInicioMaxima = fechaFinMaxima;
  if (esResiembra && finOriginal) {
    const [year, month, day] = finOriginal.split("-").map(Number);
    const ultimoDia = new Date(Date.UTC(year, month - 1 + 5, 0)).getUTCDate();
    const limite = new Date(Date.UTC(year, month - 1 + 4, Math.min(day, ultimoDia))).toISOString().slice(0, 10);
    fechaInicioMaxima = limite < fechaFinMaxima ? limite : fechaFinMaxima;
  }
  const fechaInicioFueraDeRangoOperativo = Boolean(form.fechaInicio && (form.fechaInicio < fechaInicioMinima || form.fechaInicio > fechaInicioMaxima));
  const fechaFinFueraDeRangoOperativo = Boolean(form.fechaFin && (form.fechaFin < fechaInicioMinima || form.fechaFin > fechaFinMaxima));
  const fechaMuestreoFueraDeRangoOperativo = Boolean(form.fechaMuestreo && (form.fechaMuestreo < fechaPreSiembraMinima || form.fechaMuestreo > fechaPreSiembraMaxima));
  const fechaAnalisisFueraDeRangoOperativo = Boolean(form.fechaAnalisis && (form.fechaAnalisis < fechaPreSiembraMinima || form.fechaAnalisis > fechaPreSiembraMaxima));
  const fechaAnalisisAnteriorAMuestreo = Boolean(form.fechaMuestreo && form.fechaAnalisis && form.fechaAnalisis < form.fechaMuestreo);
  const loteParaAplicacion = lotes.find((lote) => String(lote.loteId) === String(form.loteId));
  const fechaUltimaCosecha = toDateInput(loteParaAplicacion?.historialCultivos?.find((historial) => historial.fechaFin)?.fechaFin);
  const fechaAplicacionMinima = fechaUltimaCosecha || OPERATION_DATE_MIN;
  const fechaAplicacionPosteriorASiembra = Boolean(pulverizacionForm.fechaAplicacion && form.fechaInicio && pulverizacionForm.fechaAplicacion > form.fechaInicio);
  const fechaAplicacionAnteriorACosecha = Boolean(fechaUltimaCosecha && pulverizacionForm.fechaAplicacion && pulverizacionForm.fechaAplicacion < fechaUltimaCosecha);
  const canContinueStep2 = Boolean((!esResiembra || pulverizoResiembra !== "si" || insumos.length > 0) && !fechaMuestreoFueraDeRangoOperativo && !fechaAnalisisFueraDeRangoOperativo && !fechaAnalisisAnteriorAMuestreo && (form.cantidadMuestras === "" || Number.isInteger(Number(form.cantidadMuestras)) && Number(form.cantidadMuestras) >= 0));
  const campaniaLoteIds = new Set(selectedCampaniaCombinaciones.map((item) => String(item.loteId)));
  const periodoActual = campaniaActualNombre?.match(/^\d{4}-\d{4}/)?.[0] || campaniaNormalizada;
  const lotesYaSembrados = new Set(siembras.filter((siembra) => siembra.tipoRegistro !== "Resiembra" && !(modoEdicion && siembra.nombre === nombre) && (siembra.campaniaNombre?.match(/^\d{4}-\d{4}/)?.[0] || normalizeSearchText(siembra.campaniaNombre || "")) === periodoActual).map((siembra) => String(siembra.loteId)));
  const resiembrasDelPeriodo = siembras.filter((siembra) => siembra.tipoRegistro === "Resiembra" && !(modoEdicion && siembra.nombre === nombre) && (siembra.campaniaNombre?.match(/^\d{4}-\d{4}/)?.[0] || normalizeSearchText(siembra.campaniaNombre || "")) === periodoActual);
  const cantidadResiembrasPorLote = new globalThis.Map();
  resiembrasDelPeriodo.forEach((siembra) => {
    const loteId = String(siembra.loteId);
    cantidadResiembrasPorLote.set(loteId, (cantidadResiembrasPorLote.get(loteId) || 0) + 1);
  });
  const loteIdsReembrables = new Set(lotes.filter((lote) => {
    const registros = siembras.filter((siembra) => String(siembra.loteId) === String(lote.loteId) && (siembra.campaniaNombre?.match(/^\d{4}-\d{4}/)?.[0] || normalizeSearchText(siembra.campaniaNombre || "")) === periodoActual).sort((a, b) => b.siembraId - a.siembraId);
    const ultimo = registros[0];
    return ultimo && ultimo.estadoSiembra === "Finalizado" && ultimo.estado === "Finalizado" && (cantidadResiembrasPorLote.get(String(lote.loteId)) || 0) < 4;
  }).map((lote) => String(lote.loteId)));
  const lotesDisponibles = esResiembra ? lotes.filter((lote) => loteIdsReembrables.has(String(lote.loteId))) : selectedCampaniaCombinaciones.length > 0 ? lotes.filter((lote) => campaniaLoteIds.has(String(lote.loteId)) && !lotesYaSembrados.has(String(lote.loteId))) : [];
  const granoBloqueado = esResiembra && form.tipoResiembra === "Parcial";
  const loteSeleccionado = lotes.find((lote) => String(lote.loteId) === String(form.loteId));
  const cultivoAnterior = loteSeleccionado?.historialCultivos?.[0]?.cultivo || "";
  const variedadesDisponibles = variedadesSemilla[normalizeSearchText(form.producto)] || [];
  const cantidadPulverizaciones = new Set(insumos.map((insumo) => `${toDateInput(insumo.fechaAplicacion) || "sin-fecha"}|${insumo.motivoAplicacion || "sin-motivo"}`)).size;
  const campaniaComboSeleccionada = selectedCampaniaCombinaciones.find((item) => String(item.loteId) === String(form.loteId));
  const plannedProduct = campaniaComboSeleccionada?.producto || "";
  const selectedUsuarioName = form.responsableACargo || "Sin responsable";
  const cultivoNormalizado = normalizeSearchText(form.producto);
  const esSoja = cultivoNormalizado === "soja";
  const esMaiz = cultivoNormalizado === "maiz";
  const requiereDetalleAgronomico = esSoja || esMaiz;
  const canContinueStep1 = Boolean(form.tipoRegistro && form.fechaInicio && form.fechaFin && form.fechaFin >= form.fechaInicio && !fechaInicioFueraDeRangoOperativo && !fechaFinFueraDeRangoOperativo && form.loteId && (esResiembra || !lotesYaSembrados.has(String(form.loteId))) && (!esResiembra || loteIdsReembrables.has(String(form.loteId))) && String(form.producto || "").trim() && (!esResiembra || finOriginal && form.tipoResiembra && form.siniestro && form.siembraOriginalId));
  const canContinueStep3 = Boolean(String(form.variedadSemilla || "").trim() && (!requiereDetalleAgronomico || form.cicloCultivo && form.tipoImplantacion) && Number(form.pmg) > 0 && Number(form.densidadSiembra) > 0 && Number(form.profundidad) > 0 && Number(form.cantidadHectareasTrabajadas) > 0 && Number(form.cantidadSemillas) > 0 && String(form.responsableACargo || "").trim());
  const canRegister = Boolean(canContinueStep1 && canContinueStep2 && canContinueStep3);
  const steps = [{ id: 1, title: "Datos generales", subtitle: "Informacion basica", icon: FileText }, { id: 2, title: "Pre-siembra y agroquimicos", subtitle: "Muestreo y aplicaciones", icon: FlaskConical }, { id: 3, title: "Detalle de siembra", subtitle: "Cultivo y superficie", icon: Sprout }, { id: 4, title: "Documentacion y revision", subtitle: "Archivos y confirmacion", icon: ClipboardCheck }];
  const stepTitles = { 1: { title: "Datos generales", description: "Completa la informacion basica de la siembra. Estos datos identifican el registro y lo conectan con lote, campa\xF1a y empresa." }, 2: { title: "Pre-siembra y agroquimicos", description: "Registra el muestreo de suelo, su analisis y los agroquimicos aplicados antes de la siembra." }, 3: { title: "Detalle de siembra", description: "Carga los datos tecnicos del cultivo y la superficie trabajada para calcular semillas y conservar trazabilidad operativa." }, 4: { title: "Documentacion y revision", description: "Adjunta archivos relevantes y revisa el resumen completo antes de guardar el registro." } };
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
      onRequestGrainChange?.({ loteId: form.loteId, loteNombre: loteSeleccionado?.nombre || "el lote seleccionado", currentProduct: plannedProduct, nextProduct: value || plannedProduct, campaniaNombre: campaniaActualNombre });
      return;
    }
    onFieldChange("producto", value);
  }
  function helpItemsForStep() {
    if (currentStep === 1) {
      return [{ icon: FileText, title: "Selecciona el tipo de registro", text: "Para una nueva siembra, mantene Registrar siembra. Para resiembra se habilitan lote original, tipo y siniestro." }, { icon: CalendarDays, title: "Defini el periodo", text: "La fecha de fin no puede ser anterior al inicio." }, { icon: Map, title: "Elegi lote y grano", text: "Las hectareas del lote se completan automaticamente al seleccionar el lote." }, { icon: Building2, title: "Empresa y campa\xF1a", text: "Estos datos mantienen la siembra ordenada dentro del flujo productivo." }];
    }
    if (currentStep === 2) {
      return [{ icon: FlaskConical, title: "Muestreo y analisis", text: "El muestreo puede realizarse desde el 1 de enero del primer a\xF1o de campa\xF1a. El analisis no puede ser anterior al muestreo y ninguna de las dos fechas puede superar el inicio de siembra." }, { icon: Leaf, title: "Agroquimicos aplicados", text: "Registra cada aplicacion con su droga, cantidad y unidad de medida." }, { icon: HelpCircle, title: "Multiples registros", text: "Podes agregar todos los agroquimicos que correspondan antes de continuar." }];
    }
    if (currentStep === 3) {
      return [{ icon: Gauge, title: "Cantidad de semillas", text: "Se calcula con Densidad x Hectareas cultivables, y podes ajustar el valor si hace falta." }, { icon: Leaf, title: "Verifica lote y grano", text: "Estos datos afectan recomendaciones y estadisticas posteriores." }, { icon: UserRound, title: "Responsable a cargo", text: "Elegir responsable mejora la trazabilidad de la tarea." }];
    }
    return [{ icon: CheckCircle2, title: "Listo para registrar", text: "Revisa cada bloque antes de confirmar el guardado." }, { icon: Info, title: "Edicion disponible", text: "Podes volver a pasos anteriores para corregir informacion." }, { icon: Save, title: "Registro final", text: "Al confirmar, la siembra queda guardada en el sistema." }];
  }
  function renderStepContent() {
    if (currentStep === 1) {
      return <div className="siembra-step-card dashboard-card">          <SectionTitle icon={FileText} title="Datos generales" description={currentStepInfo.description} />          <div className={`siembra-wizard-grid ${esResiembra ? "siembra-wizard-grid-reseeding" : ""}`}>            <SiembraGroupDivider icon={Map} label="Información del lote" className="siembra-reseed-lote-divider" />            <label className="field siembra-reseed-lote">              <span className="field-label">Lote <b>*</b></span>              <select required value={form.loteId} onChange={(e) => onFieldChange("loteId", e.target.value)}>                <option value="">Seleccionar</option>                {lotesDisponibles.map((lote) => <option key={lote.loteId} value={lote.loteId}>{lote.nombre}</option>)}              </select>              {esResiembra && !campaniaNormalizada && <span className="field-hint">Primero indica la campaña para ver lotes ya sembrados.</span>}              {esResiembra && <FieldRule>{SIEMBRA_FIELD_RULES.loteResiembra}</FieldRule>}              {esResiembra && campaniaNormalizada && lotesDisponibles.length === 0 && <span className="field-error">No hay lotes disponibles: la última siembra o resiembra y su seguimiento deben estar finalizados, y se permite un máximo de cuatro resiembras.</span>}              {esResiembra && form.loteId && !loteIdsReembrables.has(String(form.loteId)) && <span className="field-error">Este lote alcanzó el máximo de resiembras o su último seguimiento todavía no está finalizado.</span>}              {!esResiembra && <FieldRule>{SIEMBRA_FIELD_RULES.loteSiembra}</FieldRule>}              {!esResiembra && lotesYaSembrados.has(String(form.loteId)) && <span className="field-error">Este lote ya tiene una siembra en este periodo. Selecciona otro lote o registra una resiembra.</span>}              {!esResiembra && selectedCampaniaCombinaciones.length === 0 && <span className="field-error">La campaña seleccionada no tiene lotes planificados para sembrar.</span>}            </label>            <fieldset className="siembra-fields-require-lote" disabled={!form.loteId}>            <label className="field siembra-reseed-afectado">                <span className="field-label">Cultivo anterior</span>                <ReadonlyOutput value={cultivoAnterior} placeholder="Sin cultivo previo registrado" />                <FieldRule>{SIEMBRA_FIELD_RULES.cultivoAfectado}</FieldRule>              </label>            {esResiembra && <SiembraGroupDivider icon={Sprout} label="Datos de resiembra" className="siembra-reseed-data-divider" />}            <label className="field siembra-reseed-cultivo">              <span className="field-label">{esResiembra ? "Cultivo a resembrar" : "Cultivo"} <b>*</b></span>              <div className="grain-change-field">                {Boolean(plannedProduct) || granoBloqueado ? <ReadonlyOutput tone="green" value={form.producto} placeholder="Se completa al elegir el lote" /> : <input required value={form.producto} onChange={(e) => handleProductManualChange(e.target.value)} placeholder="Se completa al elegir el lote" />}                {plannedProduct && !granoBloqueado && <button type="button" onClick={() => handleProductManualChange("")} disabled={!form.loteId || saving}>                    Cambiar grano                  </button>}              </div>              <FieldRule>{esResiembra ? SIEMBRA_FIELD_RULES.cultivoResiembra : SIEMBRA_FIELD_RULES.cultivoSiembra}</FieldRule>            </label>            <label className="field siembra-reseed-hectareas">              <span className="field-label">Hectareas del lote</span>              <ReadonlyOutput type="number" step="0.01" value={form.cantidadHectareasLote || ""} placeholder="Se completa al elegir el lote" />              <FieldRule>{SIEMBRA_FIELD_RULES.hectareasLote}</FieldRule>            </label>            {esResiembra && <>                <label className="field siembra-reseed-tipo">                  <span className="field-label">Tipo de resiembra <b>*</b></span>                  <select required value={!form.loteId ? "" : form.tipoResiembra || "Parcial"} onChange={(e) => onFieldChange("tipoResiembra", e.target.value)}><option value="" hidden />                    <option value="Parcial">Parcial</option>                    <option value="Total">Total</option>                  </select>                  <FieldRule>{SIEMBRA_FIELD_RULES.tipoResiembra}</FieldRule>                </label>                <label className="field siembra-reseed-siniestro">                  <span className="field-label">Siniestro <b>*</b></span>                  <select required value={form.siniestro} onChange={(e) => onFieldChange("siniestro", e.target.value)}>                    <option value="">Seleccionar</option>                    {SINIESTROS_RESIEMBRA.map((siniestro) => <option key={siniestro} value={siniestro}>{siniestro}</option>)}                  </select>                  <FieldRule>{SIEMBRA_FIELD_RULES.siniestro}</FieldRule>                </label>                              </>}            <SiembraGroupDivider icon={CalendarDays} label="Fechas" className={`siembra-date-divider ${esResiembra ? "siembra-reseed-divider" : "siembra-normal-divider"}`} />            <label className="field siembra-reseed-fecha-inicio">              <span className="field-label">Fecha de Inicio <b>*</b></span>              <input type="date" required min={fechaInicioMinima} max={fechaInicioMaxima} disabled={esResiembra && !finOriginal} value={form.fechaInicio} onChange={(e) => onFieldChange("fechaInicio", e.target.value)} />              <FieldRule>{esResiembra ? SIEMBRA_FIELD_RULES.fechaInicioResiembra(formatDateInputLabel(fechaInicioMinima), formatDateInputLabel(fechaInicioMaxima)) : SIEMBRA_FIELD_RULES.fechaInicioSiembra(formatDateInputLabel(fechaInicioMinima), formatDateInputLabel(fechaInicioMaxima))}</FieldRule>              {fechaInicioFueraDeRangoOperativo && <span className="field-error">                  La fecha de inicio debe estar entre {formatDateInputLabel(fechaInicioMinima)} y {formatDateInputLabel(fechaInicioMaxima)}.                </span>}            </label>            <label className="field siembra-reseed-fecha-fin">              <span className="field-label">Fecha tentativa de Fin <b>*</b></span>              <input type="date" required min={form.fechaInicio || fechaInicioMinima} max={fechaFinMaxima} value={form.fechaFin} onChange={(e) => onFieldChange("fechaFin", e.target.value)} />              <FieldRule>{SIEMBRA_FIELD_RULES.fechaFin(formatDateInputLabel(fechaFinMaxima), esResiembra)}</FieldRule>              {form.fechaInicio && form.fechaFin && form.fechaFin < form.fechaInicio && <span className="field-error">La fecha de fin no puede ser anterior a la fecha de inicio.</span>}              {fechaFinFueraDeRangoOperativo && <span className="field-error">                  La fecha tentativa de fin debe estar entre {formatDateInputLabel(form.fechaInicio || fechaInicioMinima)} y {formatDateInputLabel(fechaFinMaxima)}.                </span>}            </label>                        {modoEdicion && <label className="field">                Seguimiento                <input readOnly value={estado} />                <FieldRule>{SIEMBRA_FIELD_RULES.seguimiento}</FieldRule>              </label>}            </fieldset>          </div>        </div>;
    }
    if (currentStep === 3) {
      return <>          <ContextStrip items={[{ icon: Sprout, label: "Campa\xF1a", value: campaniaActualNombre || "-" }, { icon: Map, label: "Lote", value: loteSeleccionado?.nombre || "-" }, { icon: Leaf, label: "Grano", value: form.producto || "-" }, { icon: Building2, label: "Empresa", value: empresaActualNombre || "-" }, { icon: CalendarDays, label: "Hectareas del lote", value: form.cantidadHectareasLote ? `${formatNumber(form.cantidadHectareasLote)} ha` : "-" }]} onEdit={() => setCurrentStep(1)} />          <div className="siembra-step-card dashboard-card">            <SectionTitle icon={Sprout} title="Detalle de siembra" description={currentStepInfo.description} />            <div className="siembra-wizard-grid">              <label className="field">                <span className="field-label">Variedad de Semilla <b>*</b></span>                <CatalogoAgroquimicoSelect tipo="variedadSemilla" label="variedad" value={form.variedadSemilla} options={variedadesDisponibles} onChange={(valor) => onFieldChange("variedadSemilla", valor)} onAgregar={(_, valor) => onAgregarVariedadSemilla(form.producto, valor)} />                <FieldRule>{SIEMBRA_FIELD_RULES.variedadSemilla}</FieldRule>              </label>              {esSoja && <label className="field">                <span className="field-label">Tipo de soja <b>*</b></span>                <select required value={form.tipoImplantacion} onChange={(e) => onFieldChange("tipoImplantacion", e.target.value)}>                  <option value="">Seleccionar</option>                  <option value="Primera">Primera</option>                  <option value="Segunda">Segunda</option>                </select>                <FieldRule>{SIEMBRA_FIELD_RULES.tipoSoja}</FieldRule>              </label>}              {esMaiz && <label className="field">                <span className="field-label">Época de siembra <b>*</b></span>                <select required value={form.tipoImplantacion} onChange={(e) => onFieldChange("tipoImplantacion", e.target.value)}>                  <option value="">Seleccionar</option>                  <option value="Temprano">Temprano</option>                  <option value="Tardío">Tardío</option>                </select>                <FieldRule>{SIEMBRA_FIELD_RULES.epocaSiembra}</FieldRule>              </label>}              {requiereDetalleAgronomico && <label className="field">                <span className="field-label">Ciclo del cultivo <b>*</b></span>                <select required value={form.cicloCultivo} onChange={(e) => onFieldChange("cicloCultivo", e.target.value)}>                  <option value="">Seleccionar</option>                  <option value="Corto">Corto</option>                  <option value="Largo">Largo</option>                </select>                <FieldRule>{SIEMBRA_FIELD_RULES.cicloCultivo}</FieldRule>              </label>}              <label className="field">                <span className="field-label">PMG (g) <b>*</b></span>                <input type="number" min="0" step="0.01" value={form.pmg} onChange={(e) => onFieldChange("pmg", e.target.value)} placeholder="Ej. 180" />                <FieldRule>{SIEMBRA_FIELD_RULES.pmg}</FieldRule>              </label>              <label className="field">                <span className="field-label">Densidad de Siembra (semillas/ha) <b>*</b></span>                <LargeNumberInput value={form.densidadSiembra} onChange={(valor) => onFieldChange("densidadSiembra", valor)} placeholder="Ej. 300.000" />                <FieldRule>{SIEMBRA_FIELD_RULES.densidad}</FieldRule>              </label>              <label className="field">                <span className="field-label">Profundidad (cm) <b>*</b></span>                <input type="number" min="0" step="0.01" value={form.profundidad} onChange={(e) => onFieldChange("profundidad", e.target.value)} placeholder="Ej. 3,5" />                <FieldRule>{SIEMBRA_FIELD_RULES.profundidad}</FieldRule>              </label>              <label className="field">                <span className="field-label">Hectareas cultivables <b>*</b></span>                <input type="number" min="0" step="0.01" value={form.cantidadHectareasTrabajadas} onChange={(e) => onFieldChange("cantidadHectareasTrabajadas", e.target.value)} placeholder="Ej. 52,3" />                <FieldRule>{SIEMBRA_FIELD_RULES.hectareasCultivables}</FieldRule>              </label>              <label className="field">                Urea (kg/ha)                <input type="number" min="0" step="0.01" value={form.ureaKgHa} onChange={(e) => onFieldChange("ureaKgHa", e.target.value)} placeholder="Opcional" />                <FieldRule>{SIEMBRA_FIELD_RULES.urea}</FieldRule>              </label>              <label className="field">                <span className="field-label">Cantidad de Semillas <b>*</b></span>                <LargeNumberInput value={form.cantidadSemillas} onChange={(valor) => onFieldChange("cantidadSemillas", valor)} placeholder="Se calcula automáticamente" />                <FieldRule>{SIEMBRA_FIELD_RULES.cantidadSemillas}</FieldRule>              </label>              <label className="field">                <span className="field-label">Responsable a Cargo <b>*</b></span>                <select value={form.responsableACargo} onChange={(e) => onFieldChange("responsableACargo", e.target.value)}>                  <option value="">Seleccionar responsable</option>                  {usuarios.map((usuario) => {
        const nombreCompleto = [usuario.nombre, usuario.apellido].filter(Boolean).join(" ");
        return <option key={usuario.usuarioId} value={nombreCompleto}>{nombreCompleto}</option>;
      })}                </select>                <FieldRule>{SIEMBRA_FIELD_RULES.responsable}</FieldRule>              </label>            </div>          </div>        </>;
    }
    if (currentStep === 2) {
      return <div className="siembra-step-stack">          <div className="siembra-step-card dashboard-card">            <SectionTitle icon={FlaskConical} title="Pre-Siembra" description={currentStepInfo.description} />            <div className="siembra-wizard-grid siembra-wizard-grid-three">              <label className="field">                Fecha de Muestreo                <input type="date" min={fechaPreSiembraMinima} max={fechaPreSiembraMaxima} value={form.fechaMuestreo} onChange={(e) => onFieldChange("fechaMuestreo", e.target.value)} />                <FieldRule>{SIEMBRA_FIELD_RULES.fechaMuestreo(formatDateInputLabel(fechaPreSiembraMinima), formatDateInputLabel(fechaPreSiembraMaxima))}</FieldRule>                {fechaMuestreoFueraDeRangoOperativo && <span className="field-error">La fecha de muestreo debe estar entre {formatDateInputLabel(fechaPreSiembraMinima)} y el inicio de siembra ({formatDateInputLabel(fechaPreSiembraMaxima)}).</span>}              </label>              <label className="field">                Fecha de Analisis                <input type="date" min={form.fechaMuestreo && form.fechaMuestreo > fechaPreSiembraMinima ? form.fechaMuestreo : fechaPreSiembraMinima} max={fechaPreSiembraMaxima} value={form.fechaAnalisis} onChange={(e) => onFieldChange("fechaAnalisis", e.target.value)} />                <FieldRule>{SIEMBRA_FIELD_RULES.fechaAnalisis}</FieldRule>                {fechaAnalisisAnteriorAMuestreo && <span className="field-error">La fecha de analisis no puede ser anterior a la fecha de muestreo.</span>}                {fechaAnalisisFueraDeRangoOperativo && <span className="field-error">La fecha de analisis debe estar entre {formatDateInputLabel(fechaPreSiembraMinima)} y el inicio de siembra ({formatDateInputLabel(fechaPreSiembraMaxima)}).</span>}              </label>              <label className="field">                Cantidad de Muestras                <input type="number" min="0" step="1" value={form.cantidadMuestras} onChange={(e) => {
        if (e.target.value === "" || Number.isInteger(Number(e.target.value)) && Number(e.target.value) >= 0) onFieldChange("cantidadMuestras", e.target.value);
      }} />                <FieldRule>{SIEMBRA_FIELD_RULES.cantidadMuestras}</FieldRule>              </label>              <label className="field">                Cultivo antecesor                <input readOnly value={form.productoAntecesor} placeholder="Sin historial" />                <FieldRule>{SIEMBRA_FIELD_RULES.cultivoAntecesor}</FieldRule>              </label>              <label className="field siembra-wide-field">                Observaciones                <input value={form.observacionesPreSiembra} onChange={(e) => onFieldChange("observacionesPreSiembra", e.target.value)} placeholder="Observaciones adicionales del analisis de suelo..." />                <FieldRule>{SIEMBRA_FIELD_RULES.observaciones}</FieldRule>              </label>            </div>          </div>          {esResiembra && <div className="siembra-step-card dashboard-card">              <fieldset className="siembra-pulverizacion">                <legend>¿Se pulverizó luego de la primera siembra?</legend>                <div className="siembra-pulverizacion-options">                  {[["no", "No"], ["si", "S\xED"]].map(([value, label]) => <label className="siembra-pulverizacion-option" key={value}>                      <input type="radio" name="pulverizo-resiembra" value={value} checked={(insumos.length > 0 ? "si" : pulverizoResiembra) === value} disabled={value === "no" && insumos.length > 0} onChange={() => setPulverizoResiembra(value)} />                      <span>{label}</span>                    </label>)}                </div>                <FieldRule>{SIEMBRA_FIELD_RULES.pulverizacion}</FieldRule>                {pulverizoResiembra === "si" && insumos.length === 0 && <p className="field-error" role="status">Agrega al menos un registro a la tabla de agroquimicos para continuar.</p>}                <span className="field-hint">{insumos.length > 0 ? "Para seleccionar No, elimina primero los agroquimicos cargados con sus acciones de eliminar." : "Si no se pulverizo, podes continuar sin cargar agroquimicos."}</span>              </fieldset>            </div>}          {mostrarAgroquimicos && <div className="siembra-step-card dashboard-card">
            <SectionTitle icon={Leaf} title="Barbechos / Preemergentes" description="Registra cada pulverización previa a la siembra y sus drogas aplicadas." />
            <div className="siembra-insumo-parent">
              <div className="siembra-insumo-title"><span>1</span><strong>Datos de la pulverización</strong></div>
              <div className="siembra-wizard-grid">
                <label className="field"><span className="field-label">Fecha de aplicación <b>*</b></span><input type="date" required min={fechaAplicacionMinima} max={form.fechaInicio || OPERATION_DATE_MAX} value={pulverizacionForm.fechaAplicacion} onChange={(e) => onPulverizacionFieldChange("fechaAplicacion", e.target.value)} /><FieldRule>{SIEMBRA_FIELD_RULES.fechaAplicacion(formatDateInputLabel(fechaAplicacionMinima))}</FieldRule>{fechaAplicacionAnteriorACosecha && <span className="field-error">La fecha de aplicación no puede ser anterior a la última cosecha finalizada del lote.</span>}{fechaAplicacionPosteriorASiembra && <span className="field-error">La fecha de aplicación no puede ser posterior a la fecha de inicio de la siembra.</span>}</label>
                <label className="field"><span className="field-label">Motivo de aplicación <b>*</b></span><select required value={pulverizacionForm.motivoAplicacion} onChange={(e) => onPulverizacionFieldChange("motivoAplicacion", e.target.value)}><option value="">Seleccionar</option>{MOTIVOS_POSEMERGENTE.map((motivo) => <option key={motivo} value={motivo}>{motivo}</option>)}</select><FieldRule>Es obligatorio. Si cambia la fecha, se inicia otra pulverización y debe volver a seleccionarse.</FieldRule></label>
              </div>
            </div>
            <form className="siembra-insumo-box" onSubmit={onAgregarInsumo}>
              <div className="siembra-insumo-title"><span>2</span><strong>Agregar droga a esta pulverización</strong></div>
              <div className="siembra-wizard-grid siembra-wizard-grid-three">
                <label className="field"><span className="field-label">Marca <b>*</b></span><CatalogoAgroquimicoSelect tipo="marca" value={insumoForm.marca} options={marcasAgroquimicos} onChange={(valor) => onInsumoFieldChange("marca", valor)} onAgregar={onAgregarValorCatalogo} /><FieldRule>{SIEMBRA_FIELD_RULES.marcaAgroquimico}</FieldRule></label>
                <label className="field"><span className="field-label">Tipo <b>*</b></span><select required value={insumoForm.tipo} onChange={(e) => onInsumoFieldChange("tipo", e.target.value)}><option value="">Seleccionar</option>{TIPOS_INSUMO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select><FieldRule>{SIEMBRA_FIELD_RULES.tipoAgroquimico}</FieldRule></label>
                <label className="field"><span className="field-label">Droga <b>*</b></span><CatalogoAgroquimicoSelect tipo="droga" value={insumoForm.variedad} options={drogasAgroquimicos} onChange={(valor) => onInsumoFieldChange("variedad", valor)} onAgregar={onAgregarValorCatalogo} /><FieldRule>{SIEMBRA_FIELD_RULES.variedadAgroquimico}</FieldRule></label>
                <label className="field"><span className="field-label">Cantidad aplicada <b>*</b></span><div className="siembra-quantity-with-unit"><input required type="number" min="0.01" step="0.01" value={insumoForm.cantidadAplicada} onChange={(e) => { if (e.target.value === "" || Number(e.target.value) >= 0) onInsumoFieldChange("cantidadAplicada", e.target.value); }} placeholder="Ej. 2.5" /><select required value={insumoForm.unidadMedida} onChange={(e) => onInsumoFieldChange("unidadMedida", e.target.value)} aria-label="Unidad de medida"><option value="">Unidad</option><option value="Litros">Litros</option><option value="Kg">Kg</option></select></div><FieldRule>{SIEMBRA_FIELD_RULES.cantidadAgroquimico}</FieldRule></label>
                <div className="siembra-insumo-action"><button className="green-button" type="submit" disabled={!pulverizacionForm.fechaAplicacion || !pulverizacionForm.motivoAplicacion}><PlusCircle size={18} />Agregar droga</button></div>
              </div>
            </form>
            <InsumosTable insumos={insumos} onEliminarInsumo={onEliminarInsumo} />
          </div>}        </div>;
    }
    const detalleItems = [["Lote", loteSeleccionado?.nombre || "-"], ["Cultivo", form.producto || "-"], ["Variedad", form.variedadSemilla || "-"]];
    if (esSoja) detalleItems.push(["Tipo de soja", form.tipoImplantacion || "-"]);
    if (esMaiz) detalleItems.push(["Época de siembra", form.tipoImplantacion || "-"]);
    if (requiereDetalleAgronomico) detalleItems.push(["Ciclo del cultivo", form.cicloCultivo || "-"]);
    detalleItems.push(["Superficie", form.cantidadHectareasTrabajadas ? `${formatNumber(form.cantidadHectareasTrabajadas)} ha` : "-"], ["Urea", form.ureaKgHa ? `${formatNumber(form.ureaKgHa)} kg/ha` : "-"], ["Densidad", form.densidadSiembra ? formatLargeNumberInput(form.densidadSiembra) : "-"], ["Responsable", selectedUsuarioName]);
    return <div className="siembra-step-stack">        <div className="siembra-step-card dashboard-card">          <SectionTitle icon={UploadCloud} title="Documentacion" description="Adjunta archivos relevantes para este registro de siembra." />          <div className="siembra-upload-zone">            <UploadCloud size={34} />            <div>              <strong>Arrastra archivos aqui o selecciona desde tu equipo</strong>              <span>Formatos sugeridos: PDF, JPG, PNG, XLSX.</span>              <FieldRule>{SIEMBRA_FIELD_RULES.documentacion}</FieldRule>            </div>            <label className="siembra-file-button">              <FileText size={16} />              Seleccionar archivo              <input type="file" onChange={(e) => onSubirDocumento(e.target.files?.[0])} />            </label>          </div>          <DocumentosTable documentos={documentos} onDescargarDocumento={onDescargarDocumento} onEliminarDocumento={onEliminarDocumento} />        </div>        <div className="siembra-step-card dashboard-card">          <div className="siembra-review-header">            <SectionTitle icon={ClipboardCheck} title="Revision final" description="Verifica que toda la informacion sea correcta antes de registrar la siembra." />            <button className="back-button" type="button" onClick={() => setCurrentStep(1)}>              <Edit size={16} />              Editar informacion            </button>          </div>          <div className="siembra-review-grid">            <ReviewCard title="Datos generales" icon={FileText} items={[["Tipo de registro", form.tipoRegistro || "-"], ["Nombre", modoEdicion ? nombre : "Se asigna al guardar"], ["Fecha de inicio", form.fechaInicio || "-"], ["Fecha tentativa de fin", form.fechaFin || "-"], ["Campa\xF1a", campaniaActualNombre || "-"], ["Empresa", empresaActualNombre || "-"]]} />            <ReviewCard title="Detalle de siembra" icon={Sprout} items={detalleItems} />            <ReviewCard title="Pre-siembra" icon={FlaskConical} items={[["Fecha de muestreo", form.fechaMuestreo || "-"], ["Fecha de analisis", form.fechaAnalisis || "-"], ["Cultivo antecesor", form.productoAntecesor || "Sin historial"], ["Cant. muestras", form.cantidadMuestras || "-"]]} />            <ReviewCard title="Barbechos / Preemergentes" icon={Leaf} items={[["Cantidad de agroquímicos", `${insumos.length} registro${insumos.length === 1 ? "" : "s"}`], ["Aplicaciones", `${cantidadPulverizaciones} aplicación${cantidadPulverizaciones === 1 ? "" : "es"}`], ["Documentos", `${documentos.length} archivo${documentos.length === 1 ? "" : "s"}`]]} />          </div>        </div>      </div>;
  }
  return <section className="content-panel create-panel siembra-wizard-panel">      <div className="page-heading create-heading">        <div>          <h1>{modoEdicion ? "Editar Siembra" : "Registrar Siembra"}</h1>          <p>{modoEdicion ? nombre : currentStepInfo.description}</p>        </div>      </div>      <div className="siembra-parent-context dashboard-card">        <div>          <span>Empresa</span>          <strong>{empresaActualNombre || "Sin empresa seleccionada"}</strong>        </div>        <div>          <span>Campaña</span>          <strong>{campaniaActualNombre || "Sin campa\xF1a seleccionada"}</strong>        </div>        <p>Para cambiar empresa o campaña, volve a la pantalla principal de Siembras y ajusta los filtros superiores.</p>      </div>      <section className="siembra-registration-card dashboard-card" aria-labelledby="tipo-registro-title">        <div className="siembra-registration-copy">          <div className="siembra-section-icon"><FileText size={28} /></div>          <div>            <h2 id="tipo-registro-title">Tipo de registro</h2>            <p>Selecciona el tipo de registro que deseas realizar. Solo puedes registrar una siembra y hasta cuatro resiembras por lote y periodo de campaña.</p>          </div>        </div>        <div className="siembra-registration-options" role="radiogroup" aria-label="Tipo de registro">          <button className={`siembra-registration-option ${form.tipoRegistro === "Siembra" ? "selected" : ""}`} type="button" role="radio" aria-checked={form.tipoRegistro === "Siembra"} onClick={() => onFieldChange("tipoRegistro", "Siembra")}>            <span className="siembra-registration-option-icon"><Sprout size={25} /></span>            <span className="siembra-registration-option-copy">              <strong>Registrar siembra</strong>              <small>Primera siembra del lote en la campaña.</small>            </span>            <span className="siembra-registration-radio" aria-hidden="true" />          </button>          <button className={`siembra-registration-option ${form.tipoRegistro === "Resiembra" ? "selected" : ""}`} type="button" role="radio" aria-checked={form.tipoRegistro === "Resiembra"} onClick={() => onFieldChange("tipoRegistro", "Resiembra")}>            <span className="siembra-registration-option-icon"><RotateCcw size={25} /></span>            <span className="siembra-registration-option-copy">              <strong>Registrar resiembra</strong>              <small>Una nueva siembra después de la siembra inicial.</small>            </span>            <span className="siembra-registration-radio" aria-hidden="true" />          </button>        </div>      </section>      <SiembraStepper steps={steps} currentStep={currentStep} onStepClick={(stepId) => {
    const precedingStepsValid = [canContinueStep1, canContinueStep2, canContinueStep3].slice(0, stepId - 1).every(Boolean);
    if (stepId <= currentStep || precedingStepsValid) {
      setCurrentStep(stepId);
    }
  }} />      {error && <p className="form-error-banner">{error}</p>}      <div className="siembra-wizard-layout">        <div className="siembra-wizard-main">          {renderStepContent()}        </div>        <aside className="siembra-help-card dashboard-card">          <div className="siembra-help-heading">            <div className="siembra-section-icon"><Lightbulb size={28} /></div>            <div>              <h2>{currentStep === 4 ? "Listo para registrar" : currentStep === 2 ? "Informacion importante" : currentStep === 3 ? "Resumen y ayuda" : "Consejos para este paso"}</h2>              <p>{currentStep === 4 ? "Se completaron los pasos principales del registro." : "Revisa estas recomendaciones para avanzar con datos limpios."}</p>            </div>          </div>          <div className="siembra-help-list">            {helpItemsForStep().map((item) => {
    const ItemIcon = item.icon;
    return <div className="siembra-help-item" key={item.title}>                  <ItemIcon size={24} />                  <div>                    <strong>{item.title}</strong>                    <span>{item.text}</span>                  </div>                </div>;
  })}          </div>          <div className="siembra-help-note">            <HelpCircle size={24} />            <div>              <strong>¿Necesitas ayuda?</strong>              <span>Si tenes dudas, consulta el manual de usuario o contacta al equipo de soporte.</span>            </div>          </div>        </aside>      </div>      <div className="siembra-wizard-footer">        {currentStep === 1 ? <button className="back-button" type="button" onClick={onBack}>Cancelar</button> : <button className="back-button" type="button" onClick={goPrevious}>            <ArrowLeft size={18} />            Volver          </button>}        {currentStep < 4 ? <button className="green-button" type="button" disabled={currentStep === 1 && !canContinueStep1 || currentStep === 2 && !canContinueStep2 || currentStep === 3 && !canContinueStep3} onClick={goNext}>            Continuar            <ArrowRight size={18} />          </button> : <button className="green-button" type="button" disabled={saving || !canRegister} onClick={onGuardar}>            <Save size={18} />            {saving ? "Guardando..." : modoEdicion ? "Guardar Siembra" : "Registrar Siembra"}            <ArrowRight size={18} />          </button>}      </div>    </section>;
}
function SectionTitle({ icon: Icon, title, description }) {
  return <div className="siembra-section-title">      <div className="siembra-section-icon"><Icon size={28} /></div>      <div>        <h2>{title}</h2>        <p>{description}</p>      </div>    </div>;
}
function FieldRule({ children }) {
  return <span className="field-rule">      <Info size={14} aria-hidden="true" />      <span><strong>Regla:</strong> {children}</span>    </span>;
}
function LargeNumberInput({ value, onChange, placeholder }) {
  return <input type="text" inputMode="decimal" data-text-case="preserve" value={formatLargeNumberInput(value)} onChange={(event) => onChange(parseLargeNumberInput(event.target.value))} placeholder={placeholder} />;
}
function CatalogoAgroquimicoSelect({ tipo, label, value, options, onChange, onAgregar }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const selectorRef = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrarAlHacerClickFuera = (event) => {
      if (!selectorRef.current?.contains(event.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarAlHacerClickFuera);
    return () => document.removeEventListener("mousedown", cerrarAlHacerClickFuera);
  }, [abierto]);
  const opciones = options.filter((opcion) => normalizeSearchText(opcion).includes(normalizeSearchText(busqueda)));
  const etiqueta = label || (tipo === "marca" ? "marca" : "droga");
  function confirmarNuevo() {
    const valor = nuevoValor.trim();
    if (!valor) return;
    const valorNormalizado = tipo === "variedadSemilla" ? valor.toUpperCase() : valor;
    onAgregar(tipo, valorNormalizado);
    onChange(valorNormalizado);
    setNuevoValor("");
    setNuevoAbierto(false);
    setAbierto(false);
  }
  const descripcionNuevoValor = tipo === "variedadSemilla" ? "El valor quedará disponible para el tipo de grano seleccionado." : "El valor quedará disponible en los selectores de agroquímicos.";
  return <><div className="catalogo-select" ref={selectorRef}><input required value={abierto ? busqueda : value} placeholder={`Buscar ${etiqueta}...`} onFocus={() => { setAbierto(true); setBusqueda(""); }} onChange={(event) => { setAbierto(true); setBusqueda(event.target.value); }} /><button type="button" aria-label={`Abrir opciones de ${etiqueta}`} onClick={() => setAbierto((actual) => !actual)}><Search size={17} /></button>{abierto && <div className="catalogo-select-menu"><button className="catalogo-select-add" type="button" onClick={() => { setNuevoAbierto(true); setAbierto(false); }}><PlusCircle size={16} />Agregar {etiqueta}</button>{opciones.map((opcion) => <button type="button" key={opcion} onClick={() => { onChange(opcion); setAbierto(false); }}>{opcion}</button>)}{opciones.length === 0 && <span>Sin coincidencias.</span>}</div>}</div>{nuevoAbierto && createPortal(<div className="confirmation-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Agregar ${etiqueta}`}><section className="confirmation-modal"><h2>Agregar {etiqueta}</h2><p>{descripcionNuevoValor}</p><input autoFocus value={nuevoValor} onChange={(event) => setNuevoValor(event.target.value)} placeholder={`Nombre de la ${etiqueta}`} onKeyDown={(event) => { if (event.key === "Enter") confirmarNuevo(); }} /><div className="confirmation-modal-actions"><button className="back-button" type="button" onClick={() => setNuevoAbierto(false)}>Cancelar</button><button className="green-button" type="button" onClick={confirmarNuevo}>Agregar</button></div></section></div>, document.body)}</>;
}
function ReadonlyOutput({ value, placeholder = "", type = "text", step, tone = "neutral" }) {
  return <div className={`readonly-output ${tone === "green" ? "readonly-output-green" : ""}`}>      <LockKeyhole size={17} aria-hidden="true" />      <input type={type} step={step} readOnly value={value} placeholder={placeholder} />    </div>;
}
function SiembraGroupDivider({ icon: Icon, label, className = "" }) {
  return <div className={`siembra-group-divider ${className}`} aria-hidden="true">      <span className="siembra-group-divider-label"><Icon size={17} />{label}</span>      <span className="siembra-group-divider-line" />    </div>;
}
function SiembraStepper({ steps, currentStep, onStepClick }) {
  return <div className="siembra-stepper" aria-label="Pasos del registro de siembra">      {steps.map((step, index) => {
    const StepIcon = step.icon;
    const isActive = currentStep === step.id;
    const isDone = currentStep > step.id;
    return <div className="siembra-stepper-item" key={step.id}>            <button className={`siembra-stepper-button ${isActive ? "active" : ""} ${isDone ? "done" : ""}`} type="button" onClick={() => onStepClick(step.id)} aria-current={isActive ? "step" : void 0}>              <span className="siembra-stepper-number">{isDone ? <CheckCircle2 size={20} /> : step.id}</span>              <span>                <strong>{step.title}</strong>                <small>{step.subtitle}</small>              </span>            </button>            {index < steps.length - 1 && <span className={`siembra-stepper-line ${currentStep > step.id ? "done" : ""}`} />}          </div>;
  })}    </div>;
}
function ContextStrip({ items, onEdit }) {
  return <div className="siembra-context-strip dashboard-card">      {items.map((item) => {
    const ItemIcon = item.icon;
    return <div className="siembra-context-item" key={item.label}>            <div className="siembra-context-icon"><ItemIcon size={22} /></div>            <div>              <span>{item.label}</span>              <strong>{item.value}</strong>            </div>          </div>;
  })}      <button className="soft-filter-button" type="button" onClick={onEdit}>        <Edit size={17} />        Editar datos generales      </button>    </div>;
}
function InsumosTable({ insumos, onEliminarInsumo }) {
  const [aplicacionDetalle, setAplicacionDetalle] = useState(null);
  const aplicaciones = useMemo(() => {
    const agrupadas = new globalThis.Map();
    insumos.forEach((insumo) => {
      const fecha = toDateInput(insumo.fechaAplicacion) || "sin-fecha";
      const motivo = insumo.motivoAplicacion || "Sin motivo registrado";
      const key = `${fecha}|${motivo}`;
      const grupo = agrupadas.get(key) || { key, fecha, motivo, insumos: [] };
      grupo.insumos.push(insumo);
      agrupadas.set(key, grupo);
    });
    return [...agrupadas.values()];
  }, [insumos]);
  const detalle = aplicaciones.find((aplicacion) => aplicacion.key === aplicacionDetalle) || null;
  return <div className="siembra-compact-table">
    <div className="siembra-insumo-title"><span>3</span><strong>Pulverizaciones cargadas</strong></div>
    <div className="table-shell"><table className="lotes-table"><thead><tr><th>Fecha de aplicación</th><th>Motivo de aplicación</th><th>Drogas aplicadas</th><th>Acciones</th></tr></thead><tbody>
      {aplicaciones.map((aplicacion) => <tr key={aplicacion.key}><td>{aplicacion.fecha === "sin-fecha" ? "-" : formatDateInputLabel(aplicacion.fecha)}</td><td>{aplicacion.motivo}</td><td>{[...new Set(aplicacion.insumos.map((insumo) => insumo.variedad).filter(Boolean))].join(", ") || "-"}</td><td className="actions-cell"><button className="table-action-tooltip" data-tooltip="Ver detalles" type="button" aria-label="Ver detalles de la pulverización" onClick={() => setAplicacionDetalle(aplicacion.key)}><Eye size={18} /></button></td></tr>)}
      {aplicaciones.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center" }}>Sin pulverizaciones cargadas.</td></tr>}
    </tbody></table></div>
    {detalle && createPortal(<div className="confirmation-modal-backdrop" role="dialog" aria-modal="true" aria-label="Detalle de pulverización"><section className="confirmation-modal siembra-insumo-detail-modal"><div className="confirmation-modal-heading"><div><h2>Pulverización del {formatDateInputLabel(detalle.fecha)}</h2><p>{detalle.motivo}</p></div></div><div className="table-shell"><table className="lotes-table"><thead><tr><th>Marca</th><th>Tipo</th><th>Droga</th><th>Cantidad aplicada</th><th>Unidad</th>{onEliminarInsumo && <th>Acciones</th>}</tr></thead><tbody>{detalle.insumos.map((insumo) => <tr key={insumo.siembraInsumoId ?? insumo.tempId}><td>{insumo.marca || "-"}</td><td>{insumo.tipo || "-"}</td><td>{insumo.variedad || "-"}</td><td>{insumo.cantidadAplicada ?? "-"}</td><td>{insumo.unidadMedida || "-"}</td>{onEliminarInsumo && <td className="actions-cell"><button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar droga" onClick={() => onEliminarInsumo(insumo)}><Trash2 size={18} /></button></td>}</tr>)}</tbody></table></div><div className="confirmation-modal-actions"><button className="back-button" type="button" onClick={() => setAplicacionDetalle(null)}>Cerrar</button></div></section></div>, document.body)}
  </div>;
}function SeguimientoInsumosTable({ insumos, onEliminarInsumo }) {
  return <div className="siembra-compact-table">      <div className="siembra-insumo-title"><span>2</span><strong>Agroquímicos cargados</strong></div>      <div className="table-shell">        <table className="lotes-table">          <thead><tr><th>Marca</th><th>Tipo</th><th>Droga</th><th>Cantidad aplicada</th><th>Unidad</th><th>Acciones</th></tr></thead>          <tbody>            {insumos.map((insumo) => <tr key={insumo.seguimientoInsumoId ?? insumo.tempId}>                <td>{insumo.marca || "-"}</td><td>{insumo.tipo || "-"}</td><td>{insumo.variedad || "-"}</td>                <td>{insumo.cantidadAplicada ?? "-"}</td><td>{insumo.unidadMedida || "-"}</td>                <td className="actions-cell"><button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar agroquímico" onClick={() => onEliminarInsumo(insumo)}><Trash2 size={18} /></button></td>              </tr>)}            {insumos.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center" }}>Sin agroquímicos cargados.</td></tr>}          </tbody>        </table>      </div>    </div>;
}
function DocumentosTable({ documentos, onDescargarDocumento, onEliminarDocumento }) {
  return <div className="siembra-compact-table">      <div className="table-shell">        <table className="lotes-table">          <thead>            <tr>              <th>Nombre</th>              <th>Fecha de carga</th>              <th>Cargado por</th>              <th>Acciones</th>            </tr>          </thead>          <tbody>            {documentos.map((doc) => <tr key={doc.siembraDocumentoId ?? doc.tempId}>                <td>{doc.nombreArchivo}</td>                <td>{doc.fechaCarga ? formatFecha(doc.fechaCarga) : "Pendiente de guardar"}</td>                <td>{doc.cargadoPor || "-"}</td>                <td className="actions-cell">                  {doc.siembraDocumentoId && <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>}                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar" onClick={() => onEliminarDocumento(doc)}><Trash2 size={18} /></button>                </td>              </tr>)}            {documentos.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center" }}>Sin archivos adjuntos.</td></tr>}          </tbody>        </table>      </div>    </div>;
}
function ReviewCard({ title, icon: Icon, items }) {
  return <div className="siembra-review-card">      <div className="siembra-review-card-title">        <span><Icon size={20} /></span>        <strong>{title}</strong>      </div>      <dl>        {items.map(([label, value]) => <div key={label}>            <dt>{label}</dt>            <dd>{value}</dd>          </div>)}      </dl>    </div>;
}
function SiembraDetalle({ siembra, insumos, documentos, onDescargarDocumento, onBack }) {
  if (!siembra) return null;
  const cultivoNormalizado = normalizeSearchText(siembra.producto);
  const esSoja = cultivoNormalizado === "soja";
  const esMaiz = cultivoNormalizado === "maiz";
  return <section className="content-panel create-panel">      <div className="page-heading create-heading">        <div>          <h1>Detalle Siembra</h1>          <p>{siembra.nombre}</p>        </div>      </div>      <div className="create-form-card dashboard-card">        <div className="create-grid">          <label className="field">Nombre<input readOnly value={siembra.nombre} /></label>          <label className="field">Fecha de Inicio<input readOnly value={formatFecha(siembra.fechaInicio)} /></label>          <label className="field">Fecha tentativa de Fin<input readOnly value={formatFecha(siembra.fechaFin)} /></label>          <label className="field">Fecha real de Fin<input readOnly value={formatFecha(siembra.fechaFinReal)} /></label>          <label className="field">Campaña<input readOnly value={siembra.campaniaNombre || "-"} /></label>          <label className="field">Resiembra<input readOnly value={siembra.tipoRegistro === "Resiembra" ? `Resiembra ${siembra.tipoResiembra || ""}`.trim() : "No"} /></label>          <label className="field">Siniestro<input readOnly value={siembra.siniestro || "-"} /></label>          {siembra.tipoRegistro === "Resiembra" && <label className="field">Siembra original<input readOnly value={siembra.siembraOriginalNombre || "-"} /></label>}          <label className="field">Lote<input readOnly value={siembra.loteNombre} /></label>          <label className="field">Grano<input readOnly value={siembra.producto} /></label>          <label className="field">Empresa<input readOnly value={siembra.empresa || "-"} /></label>          <label className="field">Seguimiento<input readOnly value={siembra.estado} /></label>          <label className="field">Estado<input readOnly value={siembra.estadoSiembra || "En curso"} /></label>          <label className="field">Hectareas hora<input readOnly value={formatNumber(siembra.hectareasHora, " ha/h")} /></label>          <label className="field" style={{ gridColumn: "1 / -1" }}>Justificacion del desvio<textarea readOnly value={siembra.justificacionDesvioFin || "-"} /></label>        </div>        <div className="create-grid" style={{ marginTop: 16 }}>          <label className="field">Variedad de Semilla<input readOnly value={siembra.variedadSemilla || "-"} /></label>          {esSoja && <label className="field">Tipo de soja<input readOnly value={siembra.tipoImplantacion || "-"} /></label>}          {esMaiz && <label className="field">Época de siembra<input readOnly value={siembra.tipoImplantacion || "-"} /></label>}          {(esSoja || esMaiz) && <label className="field">Ciclo del cultivo<input readOnly value={siembra.cicloCultivo || "-"} /></label>}          <label className="field">PMG (g)<input readOnly value={siembra.pmg ?? "-"} /></label>          <label className="field">Densidad de Siembra<input readOnly value={siembra.densidadSiembra ?? "-"} /></label>          <label className="field">Profundidad (cm)<input readOnly value={siembra.profundidad ?? "-"} /></label>          <label className="field">Hectareas cultivables<input readOnly value={siembra.cantidadHectareasTrabajadas ?? "-"} /></label>          <label className="field">Urea (kg/ha)<input readOnly value={siembra.ureaKgHa ?? "-"} /></label>          <label className="field">Cantidad de Semillas<input readOnly value={siembra.cantidadSemillas ?? "-"} /></label>          <label className="field">Responsable a Cargo<input readOnly value={siembra.responsableACargo || "-"} /></label>        </div>      </div>      <h2>Pre-Siembra</h2>      <div className="create-form-card dashboard-card">        <div className="create-grid">          <label className="field">Fecha de Muestreo<input readOnly value={formatFecha(siembra.fechaMuestreo)} /></label>          <label className="field">Fecha de Analisis<input readOnly value={formatFecha(siembra.fechaAnalisis)} /></label>          <label className="field">Cantidad de Muestras<input readOnly value={siembra.cantidadMuestras ?? "-"} /></label>          <label className="field">Cultivo antecesor<input readOnly value={siembra.productoAntecesor || "Sin historial"} /></label>        </div>        <label className="field" style={{ marginTop: 16 }}>          Observaciones          <input readOnly value={siembra.observacionesPreSiembra || "-"} />        </label>      </div>      <h2>Barbechos / Preemergentes</h2>      <div className="dashboard-card"><InsumosTable insumos={insumos} /></div>      <h2>Documentacion</h2>      <div className="table-shell dashboard-card">        <table className="lotes-table">          <thead>            <tr>              <th>Nombre</th>              <th>Fecha de carga</th>              <th>Cargado por</th>              <th>Acciones</th>            </tr>          </thead>          <tbody>            {documentos.map((doc) => <tr key={doc.siembraDocumentoId}>                <td>{doc.nombreArchivo}</td>                <td>{formatFecha(doc.fechaCarga)}</td>                <td>{doc.cargadoPor || "-"}</td>                <td className="actions-cell">                  <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>                </td>              </tr>)}            {documentos.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center" }}>Sin archivos adjuntos.</td></tr>}          </tbody>        </table>      </div>      <div className="form-actions">        <button className="back-button" type="button" onClick={onBack}>Volver</button>      </div>    </section>;
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
    const map = L.map(mapNodeRef.current, { center: defaultMapCenter, zoom: 16, minZoom: 4, maxZoom: 17, zoomControl: true });
    const satelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 17, maxNativeZoom: 17, attribution: "Tiles \xA9 Esri" });
    satelite.addTo(map);
    layerRef.current.addTo(map);
    map.on("click", (event) => {
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
    const poligonoOrdenado = (poligono ?? []).slice().sort((a, b) => a.orden - b.orden).map((c) => ({ lat: Number(c.latitud), lng: Number(c.longitud) }));
    if (poligonoOrdenado.length >= 3) {
      L.polygon(poligonoOrdenado, { color: "#1c8c3a", weight: 2, opacity: 0.9, fillOpacity: 0.08 }).addTo(layerRef.current);
    }
    const todosLosPuntos = pendiente ? [...puntos, pendiente] : puntos;
    if (todosLosPuntos.length >= 2) {
      L.polyline(todosLosPuntos, { color: "#df3b30", weight: 2, opacity: 0.9, dashArray: "6 8" }).addTo(layerRef.current);
    }
    puntos.forEach((punto) => {
      L.marker(punto, { icon: L.divIcon({ className: "seguimiento-marker", html: '<span style="display:block;width:14px;height:14px;border-radius:50% 50% 50% 0;background:#df3b30;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>', iconSize: [18, 18], iconAnchor: [9, 18] }) }).addTo(layerRef.current);
    });
    if (pendiente) {
      L.marker(pendiente, { icon: L.divIcon({ className: "seguimiento-marker-pendiente", html: '<span style="display:block;width:16px;height:16px;border-radius:50% 50% 50% 0;background:#1c8c3a;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 3px rgba(0,0,0,.4)"></span>', iconSize: [20, 20], iconAnchor: [10, 20] }) }).addTo(layerRef.current);
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
          mapRef.current.setMaxBounds(bounds.pad(0.45));
          mapRef.current.fitBounds(bounds.pad(0.16), { animate: false, maxZoom: 16 });
        }
      }, 120);
    }
  }, [puntos, pendiente, poligono]);
  return <div className="map-box seguimiento-map-box" style={{ height: 260, position: "relative", borderRadius: 12, overflow: "hidden" }}>      <div ref={mapNodeRef} style={{ width: "100%", height: "100%" }} />      {!readOnly && <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(255,255,255,.92)", padding: "6px 10px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>          <MapPin size={14} />          <span>Toca el mapa para marcar el punto de esta recorrida</span>        </div>}    </div>;
}
function SeguimientoHistorialList({ siembra, seguimientos, error, onNuevoSiniestro, onNuevoPosemergente, onVer, onEditar, onEliminar, onFinalizar, onBack }) {
  if (!siembra) return null;
  const finalizado = siembra.estado === "Finalizado";
  const siniestros = seguimientos.filter((seguimiento) => seguimiento.tipoRegistro === "Siniestro");
  const posemergentes = seguimientos.filter((seguimiento) => seguimiento.tipoRegistro !== "Siniestro");
  const esInicioDeEtapaAnterior = (registros, indice) => indice > 0 && registros[indice - 1].siembraId !== registros[indice].siembraId;
  const separadorDeResiembra = (colSpan, key) => <tr className="seguimiento-resiembra-separator" key={key}>      <td colSpan={colSpan}><span><Leaf size={18} />Resiembra</span></td>    </tr>;
  const actions = (seguimiento) => <td className="actions-cell">      <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label="Ver detalle" onClick={() => onVer(seguimiento)}><Eye size={18} /></button>      {!finalizado && !seguimiento.esHistorialAnterior && <>        <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label="Editar registro" onClick={() => onEditar(seguimiento)}><Edit size={18} /></button>        <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar registro" onClick={() => onEliminar(seguimiento)}><Trash2 size={18} /></button>      </>}    </td>;
  return <section className="content-panel create-panel seguimiento-history-page">      <div className="seguimiento-history-hero">        <div className="seguimiento-history-title">          <div className="seguimiento-history-title-icon"><Sprout size={34} /></div>          <div>            <h1>Historial {siembra.nombre}</h1>            <p>{siembra.loteNombre} - {siembra.producto}</p>          </div>        </div>        {!finalizado && <div className="seguimiento-history-actions">            <button className="green-button" type="button" onClick={onNuevoSiniestro}><PlusCircle size={18} />Registrar siniestro</button>            <button className="green-button" type="button" onClick={onNuevoPosemergente}><Leaf size={18} />Registrar posemergente</button>            <button className="green-button" type="button" onClick={onFinalizar}><Flag size={18} />Finalizar seguimiento</button>          </div>}      </div>      {error && <p style={{ color: "#c0392b", fontWeight: 700 }}>{error}</p>}      {finalizado && <p style={{ color: "#6b7280" }}>Este seguimiento ya fue finalizado: queda disponible solo para consulta.</p>}      <section className="seguimiento-history-card dashboard-card">        <div className="seguimiento-history-card-header">          <div className="seguimiento-history-card-icon"><AlertTriangle size={21} /></div>          <div><h2>Siniestros</h2><p>Registro de eventos que afectaron el cultivo.</p></div>        </div>        <div className="table-shell">        <table className="lotes-table">          <thead>            <tr>              <th><CalendarDays size={16} />Fecha</th>              <th><Sprout size={16} />Cultivo</th>              <th><AlertTriangle size={16} />Siniestro</th>              <th><Gauge size={16} />Alcance / pérdida</th>              <th><Leaf size={16} />Resiembra</th>              <th><FileText size={16} />Observaciones</th>              <th><Settings2 size={16} />Acciones</th>            </tr>          </thead>          <tbody>            {siniestros.map((s, indice) => <Fragment key={s.siembraSeguimientoId}>                {esInicioDeEtapaAnterior(siniestros, indice) && separadorDeResiembra(7, `separador-siniestro-${s.siembraSeguimientoId}`)}                <tr className={s.esResiembra ? "seguimiento-resiembra-row" : s.esHistorialAnterior ? "seguimiento-historico-row" : ""}>                  <td>{formatFecha(s.fecha)}</td>                  <td>{s.cultivo || "-"}</td>                  <td>{s.siniestro || "-"}</td>                  <td>{s.alcance || "-"}</td>                  <td>{s.esResiembra ? "S\xED" : "No"}</td>                  <td>{s.observaciones}</td>                  {actions(s)}                </tr>              </Fragment>)}            {siniestros.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center" }}>Todavía no hay siniestros registrados.</td></tr>}          </tbody>        </table>        </div>      </section>      <section className="seguimiento-history-card dashboard-card">        <div className="seguimiento-history-card-header">          <div className="seguimiento-history-card-icon"><Leaf size={21} /></div>          <div><h2>Posemergentes</h2><p>Aplicaciones realizadas luego de la emergencia del cultivo.</p></div>        </div>        <div className="table-shell">        <table className="lotes-table">          <thead><tr><th><CalendarDays size={16} />Fecha de aplicación</th><th><Sprout size={16} />Motivo de aplicación</th><th><Gauge size={16} />Alcance</th><th><FlaskConical size={16} />Drogas aplicadas</th><th><FileText size={16} />Observaciones</th><th><Settings2 size={16} />Acciones</th></tr></thead>          <tbody>            {posemergentes.map((s, indice) => <Fragment key={s.siembraSeguimientoId}>                {esInicioDeEtapaAnterior(posemergentes, indice) && separadorDeResiembra(6, `separador-posemergente-${s.siembraSeguimientoId}`)}                <tr className={s.esHistorialAnterior ? "seguimiento-historico-row" : ""}>                  <td>{formatFecha(s.fecha)}</td><td>{s.incidencia || "-"}</td><td>{s.alcance || "-"}</td>                  <td>{s.drogasAplicadas || "-"}</td><td>{s.observaciones}</td>{actions(s)}                </tr>              </Fragment>)}            {posemergentes.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center" }}>Todavía no hay posemergentes registrados.</td></tr>}          </tbody>        </table>        </div>      </section>      <div className="form-actions">        <button className="back-button" type="button" onClick={onBack}>Volver</button>      </div>    </section>;
}
function SeguimientoForm({ siembra, lotePoligono, modoEdicion, seguimientoForm, insumoForm, marcasAgroquimicos, drogasAgroquimicos, onAgregarValorCatalogo, insumos, documentos, saving, error, onFieldChange, onPickPunto, onGuardar, onInsumoFieldChange, onAgregarInsumo, onEliminarInsumo, onSubirDocumento, onDescargarDocumento, onEliminarDocumento, onBack }) {
  if (!siembra) return null;
  const puntoPendiente = seguimientoForm.latitud !== "" && seguimientoForm.longitud !== "" ? { lat: Number(seguimientoForm.latitud), lng: Number(seguimientoForm.longitud) } : null;
  const esSiniestro = seguimientoForm.tipoRegistro === "Siniestro";
  const fechaMinima = addMonthsToDateInput(toDateInput(siembra.fechaInicio), 0);
  const fechaMaxima = addMonthsToDateInput(toDateInput(siembra.fechaInicio), 6);
  return <section className="content-panel create-panel">      <div className="page-heading create-heading">        <div>          <h1>{modoEdicion ? "Editar" : "Registrar"} {esSiniestro ? "siniestro" : "posemergente"} {siembra.nombre}</h1>          <p>{siembra.loteNombre} - {siembra.producto}</p>        </div>      </div>      {error && <p style={{ color: "#c0392b", fontWeight: 700 }}>{error}</p>}      <div className="create-form-card dashboard-card">        <SeguimientoMapa puntos={[]} pendiente={puntoPendiente} poligono={lotePoligono} onPick={onPickPunto} readOnly={false} />        <div className="create-grid" style={{ marginTop: 16 }}>          <label className="field">            {esSiniestro ? "Fecha" : "Fecha de aplicaci\xF3n"}            <input type="date" required min={fechaMinima} max={fechaMaxima} value={seguimientoForm.fecha} onChange={(e) => onFieldChange("fecha", e.target.value)} />          </label>          {esSiniestro ? <label className="field"><span className="field-label">Siniestro <b>*</b></span>              <select required value={seguimientoForm.siniestro} onChange={(e) => onFieldChange("siniestro", e.target.value)}>                <option value="">Seleccionar</option>{SINIESTROS_RESIEMBRA.map((valor) => <option key={valor} value={valor}>{valor}</option>)}              </select>            </label> : <label className="field"><span className="field-label">Motivo de aplicación <b>*</b></span>              <select required value={seguimientoForm.incidencia} onChange={(e) => onFieldChange("incidencia", e.target.value)}>                <option value="">Seleccionar</option>{MOTIVOS_POSEMERGENTE.map((valor) => <option key={valor} value={valor}>{valor}</option>)}              </select>            </label>}          <label className="field"><span className="field-label">{esSiniestro ? "Alcance / p\xE9rdida" : "Alcance"} <b>*</b></span>            <select required value={seguimientoForm.alcance} onChange={(e) => onFieldChange("alcance", e.target.value)}>              <option value="">Seleccionar</option><option value="Parcial">Parcial</option><option value="Total">Total</option>            </select>          </label>        </div>        <label className="field" style={{ marginTop: 16 }}>          <span className="field-label">Observaciones <b>*</b></span>          <input required value={seguimientoForm.observaciones} onChange={(e) => onFieldChange("observaciones", e.target.value)} />        </label>      </div>      {!esSiniestro && <>      <div className="siembra-step-card dashboard-card">        <SectionTitle icon={Leaf} title="Agroquímicos" description="La fecha de aplicación es la fecha registrada arriba. Podés cargar múltiples productos." />        <form className="siembra-insumo-box" onSubmit={onAgregarInsumo}>          <div className="siembra-insumo-title"><span>1</span><strong>Agregar nuevo agroquímico</strong></div>          <div className="siembra-wizard-grid siembra-wizard-grid-three">            <label className="field">              <span className="field-label">Marca <b>*</b></span>              <CatalogoAgroquimicoSelect tipo="marca" value={insumoForm.marca} options={marcasAgroquimicos} onChange={(valor) => onInsumoFieldChange("marca", valor)} onAgregar={onAgregarValorCatalogo} />            </label>            <label className="field">              <span className="field-label">Tipo <b>*</b></span>              <select required value={insumoForm.tipo} onChange={(e) => onInsumoFieldChange("tipo", e.target.value)}>                <option value="">Seleccionar</option>                {TIPOS_INSUMO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}              </select>            </label>            <label className="field">              <span className="field-label">Droga <b>*</b></span>              <CatalogoAgroquimicoSelect tipo="droga" value={insumoForm.variedad} options={drogasAgroquimicos} onChange={(valor) => onInsumoFieldChange("variedad", valor)} onAgregar={onAgregarValorCatalogo} />            </label>            <label className="field">              <span className="field-label">Cantidad Aplicada <b>*</b></span>              <div className="siembra-quantity-with-unit">                <input required type="number" min="0.01" step="0.01" value={insumoForm.cantidadAplicada} onChange={(e) => onInsumoFieldChange("cantidadAplicada", e.target.value)} placeholder="Ej. 2.5" />                <select required value={insumoForm.unidadMedida} onChange={(e) => onInsumoFieldChange("unidadMedida", e.target.value)} aria-label="Unidad de medida">                  <option value="">Unidad</option><option value="Litros">Litros</option><option value="Kg">Kg</option>                </select>              </div>            </label>            <div className="siembra-insumo-action">              <button className="green-button" type="submit"><PlusCircle size={18} /> Agregar agroquímico</button>            </div>          </div>        </form>        <SeguimientoInsumosTable insumos={insumos} onEliminarInsumo={onEliminarInsumo} />      </div>      </>}      <h2>Documentacion</h2>      <div className="create-form-card dashboard-card">        <input type="file" onChange={(e) => onSubirDocumento(e.target.files?.[0])} />        <div className="table-shell" style={{ marginTop: 16 }}>          <table className="lotes-table">            <thead>              <tr>                <th>Nombre</th>                <th>Fecha de carga</th>                <th>Cargado por</th>                <th>Acciones</th>              </tr>            </thead>            <tbody>              {documentos.map((doc) => <tr key={doc.seguimientoDocumentoId ?? doc.tempId}>                  <td>{doc.nombreArchivo}</td>                  <td>{doc.fechaCarga ? formatFecha(doc.fechaCarga) : "Pendiente de guardar"}</td>                  <td>{doc.cargadoPor || "-"}</td>                  <td className="actions-cell">                    {doc.seguimientoDocumentoId && <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>}                    <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar" onClick={() => onEliminarDocumento(doc)}><Trash2 size={18} /></button>                  </td>                </tr>)}              {documentos.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center" }}>Sin archivos adjuntos.</td></tr>}            </tbody>          </table>        </div>      </div>      <div className="form-actions">        <button className="green-button" type="button" disabled={saving} onClick={onGuardar}>          {saving ? "Guardando..." : modoEdicion ? "Guardar" : "Registrar"}        </button>        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>      </div>    </section>;
}
function SeguimientoDetalle({ siembra, lotePoligono, seguimiento, insumos, documentos, onDescargarDocumento, onBack }) {
  if (!siembra || !seguimiento) return null;
  const punto = seguimiento.latitud != null && seguimiento.longitud != null ? [{ lat: Number(seguimiento.latitud), lng: Number(seguimiento.longitud) }] : [];
  const esSiniestro = seguimiento.tipoRegistro === "Siniestro";
  return <section className="content-panel create-panel">      <div className="page-heading create-heading">        <div>          <h1>Detalle - Historial {siembra.nombre}</h1>          <p>{siembra.loteNombre} - {siembra.producto}</p>        </div>      </div>      <div className="create-form-card dashboard-card">        {punto.length > 0 && <div style={{ marginBottom: 16 }}>            <SeguimientoMapa puntos={punto} pendiente={null} poligono={lotePoligono} onPick={() => {
  }} readOnly />          </div>}        <div className="create-grid">          <label className="field">Fecha<input readOnly value={formatFecha(seguimiento.fecha)} /></label>          <label className="field">Tipo<input readOnly value={esSiniestro ? "Siniestro" : "Posemergente"} /></label>          <label className="field">{esSiniestro ? "Siniestro" : "Motivo de aplicaci\xF3n"}<input readOnly value={esSiniestro ? seguimiento.siniestro || "-" : seguimiento.incidencia || "-"} /></label>          <label className="field">{esSiniestro ? "Alcance / p\xE9rdida" : "Alcance"}<input readOnly value={seguimiento.alcance || "-"} /></label>        </div>        <label className="field" style={{ marginTop: 16 }}>          Observaciones          <input readOnly value={seguimiento.observaciones || "-"} />        </label>      </div>      {!esSiniestro && <>      <h2>Agroquímicos</h2>      <div className="table-shell dashboard-card">        <table className="lotes-table">          <thead>            <tr>              <th>Fecha de aplicacion</th>              <th>Marca</th>              <th>Tipo</th>              <th>Droga</th>              <th>Cantidad aplicada</th>            </tr>          </thead>          <tbody>            {insumos.map((insumo) => <tr key={insumo.seguimientoInsumoId}>                <td>{insumo.fechaAplicacion || "-"}</td>                <td>{insumo.marca || "-"}</td>                <td>{insumo.tipo || "-"}</td>                <td>{insumo.variedad || "-"}</td>                <td>{insumo.cantidadAplicada ?? "-"}</td>              </tr>)}            {insumos.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center" }}>Sin insumos cargados.</td></tr>}          </tbody>        </table>      </div>      </>}      <h2>Documentacion</h2>      <div className="table-shell dashboard-card">        <table className="lotes-table">          <thead>            <tr>              <th>Nombre</th>              <th>Fecha de carga</th>              <th>Cargado por</th>              <th>Acciones</th>            </tr>          </thead>          <tbody>            {documentos.map((doc) => <tr key={doc.seguimientoDocumentoId}>                <td>{doc.nombreArchivo}</td>                <td>{formatFecha(doc.fechaCarga)}</td>                <td>{doc.cargadoPor || "-"}</td>                <td className="actions-cell">                  <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>                </td>              </tr>)}            {documentos.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center" }}>Sin archivos adjuntos.</td></tr>}          </tbody>        </table>      </div>      <div className="form-actions">        <button className="back-button" type="button" onClick={onBack}>Volver</button>      </div>    </section>;
}
export {
  Siembras as default
};
