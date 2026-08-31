import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Download,
  Edit,
  Eye,
  Filter,
  LoaderCircle,
  MapPin,
  PlusCircle,
  RotateCcw,
  Route,
  Search,
  Sprout,
  Trash2
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const defaultMapCenter = [-32.0025, -64.0055];

const INCIDENCIAS_SEGUIMIENTO = ['Ninguna', 'Plaga', 'Maleza', 'Enfermedad'];

const TIPOS_INSUMO = [
  'Herbicidas', 'Insecticidas', 'Fungicidas', 'Acaricidas',
  'Nematicidas', 'Raticidas', 'Bactericidas', 'Molusquicidas'
];

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
    loteId: '',
    cantidadHectareasLote: '',
    campaniaNombre: '',
    producto: '',
    empresa: '',
    fechaInicio: '',
    fechaFin: '',
    variedadSemilla: '',
    pmg: '',
    densidadSiembra: '',
    profundidad: '',
    cantidadHectareasTrabajadas: '',
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
  cantidadAplicada: ''
};

export default function Siembras({ session, lotes }) {
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
  const [editingSeguimientoId, setEditingSeguimientoId] = useState(null);
  const [activeSeguimientoId, setActiveSeguimientoId] = useState(null);
  const [seguimientoInsumoForm, setSeguimientoInsumoForm] = useState(emptyInsumoForm);
  const [seguimientoInsumos, setSeguimientoInsumos] = useState([]);
  const [seguimientoDocumentos, setSeguimientoDocumentos] = useState([]);
  const [seguimientoDetalle, setSeguimientoDetalle] = useState(null);
  const [seguimientoSaving, setSeguimientoSaving] = useState(false);

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
    setError('');
    loadSiembras();
  }

  function startCreate() {
    setSelectedSiembra(null);
    setForm(getEmptySiembraForm());
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
      campaniaNombre: siembra.campaniaNombre || '',
      producto: siembra.producto,
      empresa: siembra.empresa || '',
      fechaInicio: toDateInput(siembra.fechaInicio),
      fechaFin: toDateInput(siembra.fechaFin),
      variedadSemilla: siembra.variedadSemilla || '',
      pmg: siembra.pmg ?? '',
      densidadSiembra: siembra.densidadSiembra ?? '',
      profundidad: siembra.profundidad ?? '',
      cantidadHectareasTrabajadas: siembra.cantidadHectareasTrabajadas ?? '',
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

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };

      if (field === 'loteId') {
        const lote = lotes?.find((l) => String(l.loteId) === String(value));
        next.cantidadHectareasLote = lote?.hectareas ?? '';
        if (lote && !current.cantidadHectareasTrabajadas) {
          next.cantidadHectareasTrabajadas = lote.hectareas ?? '';
        }
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

  function buildBody() {
    return {
      loteId: Number(form.loteId),
      campaniaNombre: form.campaniaNombre || null,
      producto: form.producto,
      empresa: form.empresa || null,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      variedadSemilla: form.variedadSemilla || null,
      pmg: form.pmg === '' ? null : Number(form.pmg),
      densidadSiembra: form.densidadSiembra === '' ? null : Number(form.densidadSiembra),
      profundidad: form.profundidad === '' ? null : Number(form.profundidad),
      cantidadHectareasTrabajadas: form.cantidadHectareasTrabajadas === '' ? null : Number(form.cantidadHectareasTrabajadas),
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
            cantidadAplicada: insumo.cantidadAplicada === '' ? null : Number(insumo.cantidadAplicada)
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

      goToList();
    } catch (err) {
      setError(`No se pudo guardar la siembra: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAgregarInsumo(event) {
    event.preventDefault();

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
            cantidadAplicada: insumoForm.cantidadAplicada === '' ? null : Number(insumoForm.cantidadAplicada)
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

  async function openSeguimiento(siembra) {
    setSelectedSiembra(siembra);
    setError('');
    setSeguimientoForm(getEmptySeguimientoForm());
    setEditingSeguimientoId(null);
    setActiveSeguimientoId(null);
    setSeguimientoInsumoForm(emptyInsumoForm);
    setSeguimientoInsumos([]);
    setSeguimientoDocumentos([]);
    await loadSeguimientos(siembra.siembraId);
    setView('seguimiento');
  }

  function backFromSeguimiento() {
    setView('list');
    setSelectedSiembra(null);
    setError('');
    loadSiembras();
  }

  function updateSeguimientoField(field, value) {
    setSeguimientoForm((current) => ({ ...current, [field]: value }));
  }

  function iniciarEdicionSeguimiento(seguimiento) {
    setEditingSeguimientoId(seguimiento.siembraSeguimientoId);
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
    loadSeguimientoSubItems(selectedSiembra.siembraId, seguimiento.siembraSeguimientoId);
  }

  function cancelarEdicionSeguimiento() {
    setEditingSeguimientoId(null);
    setSeguimientoForm(getEmptySeguimientoForm());
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

      if (editingSeguimientoId) {
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${editingSeguimientoId}`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`al guardar la recorrida (status ${response.status}): ${await response.text()}`);
      } else {
        const response = await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(`al crear la recorrida (status ${response.status}): ${await response.text()}`);
        const nueva = await response.json();
        setActiveSeguimientoId(nueva.siembraSeguimientoId);
        setSeguimientoInsumos([]);
        setSeguimientoDocumentos([]);
      }

      setSeguimientoForm(getEmptySeguimientoForm());
      setEditingSeguimientoId(null);
      await loadSeguimientos(selectedSiembra.siembraId);
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
      if (activeSeguimientoId === seguimiento.siembraSeguimientoId) {
        setActiveSeguimientoId(null);
        setSeguimientoInsumos([]);
        setSeguimientoDocumentos([]);
      }
      if (editingSeguimientoId === seguimiento.siembraSeguimientoId) {
        cancelarEdicionSeguimiento();
      }
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
      backFromSeguimiento();
    } catch (err) {
      setError(`No se pudo finalizar el seguimiento: ${err.message}`);
    }
  }

  async function handleAgregarSeguimientoInsumo(event) {
    event.preventDefault();
    if (!activeSeguimientoId) {
      setError('Agrega o edita una recorrida primero para poder cargarle insumos.');
      return;
    }
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
  }

  async function handleEliminarSeguimientoInsumo(insumo) {
    try {
      await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/insumos/${insumo.seguimientoInsumoId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      await loadSeguimientoSubItems(selectedSiembra.siembraId, activeSeguimientoId);
    } catch (err) {
      setError(`No se pudo eliminar el insumo: ${err.message}`);
    }
  }

  async function handleSubirSeguimientoDocumento(file) {
    if (!file) return;
    if (!activeSeguimientoId) {
      setError('Agrega o edita una recorrida primero para poder adjuntarle archivos.');
      return;
    }
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
  }

  async function handleEliminarSeguimientoDocumento(documento) {
    try {
      await fetch(`${API_BASE_URL}/api/siembras/${selectedSiembra.siembraId}/seguimientos/${activeSeguimientoId}/documentos/${documento.seguimientoDocumentoId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      await loadSeguimientoSubItems(selectedSiembra.siembraId, activeSeguimientoId);
    } catch (err) {
      setError(`No se pudo eliminar el archivo: ${err.message}`);
    }
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
    setView('seguimiento');
    setSeguimientoDetalle(null);
    setError('');
    if (selectedSiembra) loadSeguimientos(selectedSiembra.siembraId);
  }

  if (view === 'create' || view === 'edit') {
    return (
      <SiembraForm
        modoEdicion={view === 'edit'}
        nombre={selectedSiembra?.nombre}
        estado={selectedSiembra?.estado}
        lotes={lotes ?? []}
        usuarios={usuarios}
        form={form}
        insumoForm={insumoForm}
        insumos={insumos}
        documentos={documentos}
        saving={saving}
        error={error}
        onFieldChange={updateField}
        onInsumoFieldChange={(field, value) => setInsumoForm((current) => ({ ...current, [field]: value }))}
        onGuardar={handleGuardar}
        onAgregarInsumo={handleAgregarInsumo}
        onEliminarInsumo={handleEliminarInsumo}
        onSubirDocumento={handleSubirDocumento}
        onDescargarDocumento={handleDescargarDocumento}
        onEliminarDocumento={handleEliminarDocumento}
        onBack={goToList}
      />
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

  if (view === 'seguimiento') {
    if (selectedSiembra?.estado === 'Finalizado') {
      return (
        <SeguimientoHistorial
          siembra={selectedSiembra}
          seguimientos={seguimientos}
          onVerDetalle={openDetalleSeguimiento}
          onBack={backFromSeguimiento}
        />
      );
    }

    return (
      <SeguimientoLive
        siembra={selectedSiembra}
        seguimientos={seguimientos}
        seguimientoForm={seguimientoForm}
        editingSeguimientoId={editingSeguimientoId}
        activeSeguimientoId={activeSeguimientoId}
        insumoForm={seguimientoInsumoForm}
        insumos={seguimientoInsumos}
        documentos={seguimientoDocumentos}
        saving={seguimientoSaving}
        error={error}
        onFieldChange={updateSeguimientoField}
        onPickPunto={handlePickPuntoMapa}
        onGuardar={handleGuardarSeguimiento}
        onEditar={iniciarEdicionSeguimiento}
        onCancelarEdicion={cancelarEdicionSeguimiento}
        onEliminar={handleEliminarSeguimiento}
        onFinalizar={handleFinalizarSeguimiento}
        onInsumoFieldChange={(field, value) => setSeguimientoInsumoForm((current) => ({ ...current, [field]: value }))}
        onAgregarInsumo={handleAgregarSeguimientoInsumo}
        onEliminarInsumo={handleEliminarSeguimientoInsumo}
        onSubirDocumento={handleSubirSeguimientoDocumento}
        onDescargarDocumento={(doc) => handleDescargarSeguimientoDocumento(doc, activeSeguimientoId)}
        onEliminarDocumento={handleEliminarSeguimientoDocumento}
        onBack={backFromSeguimiento}
      />
    );
  }

  if (view === 'seguimientoDetalle') {
    return (
      <SeguimientoDetalle
        siembra={selectedSiembra}
        seguimiento={seguimientoDetalle}
        insumos={seguimientoInsumos}
        documentos={seguimientoDocumentos}
        onDescargarDocumento={(doc) => handleDescargarSeguimientoDocumento(doc, seguimientoDetalle.siembraSeguimientoId)}
        onBack={backFromDetalleSeguimiento}
      />
    );
  }

  return (
    <SiembrasList
      siembras={siembras}
      loading={loading}
      error={error}
      onAdd={startCreate}
      onEdit={openEdit}
      onView={openDetail}
      onSeguimiento={openSeguimiento}
    />
  );
}

function SiembrasList({ siembras, loading, error, onAdd, onEdit, onView, onSeguimiento }) {
  const [query, setQuery] = useState('');
  const [productoFilter, setProductoFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [selected, setSelected] = useState({});

  const productoOptions = useMemo(
    () => [...new Set(siembras.map((s) => s.producto).filter(Boolean))],
    [siembras]
  );

  const filtered = useMemo(() => siembras.filter((s) => {
    const texto = normalizeSearchText(query.trim());
    const camposBusqueda = [
      s.nombre,
      s.campaniaNombre,
      s.producto,
      s.empresa,
      s.loteNombre,
      s.estado,
      String(s.cantidadSemillas ?? '')
    ];
    const matchesQuery = !texto || camposBusqueda.some(
      (campo) => normalizeSearchText(campo ?? '').includes(texto)
    );
    const matchesProducto = !productoFilter || s.producto === productoFilter;
    const matchesEstado = !estadoFilter || s.estado === estadoFilter;
    return matchesQuery && matchesProducto && matchesEstado;
  }), [siembras, query, productoFilter, estadoFilter]);

  function clearFilters() {
    setQuery('');
    setProductoFilter('');
    setEstadoFilter('');
  }

  const hayFilasSeleccionadas = Object.values(selected).some(Boolean);

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

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="filters-card">
        <label className="search-field">
          <Search size={21} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cualquier dato de la siembra..." />
        </label>
        <select value={productoFilter} onChange={(event) => setProductoFilter(event.target.value)}>
          <option value="">Producto</option>
          {productoOptions.map((producto) => <option key={producto} value={producto}>{producto}</option>)}
        </select>
        <select value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)}>
          <option value="">Estado</option>
          <option value="Pendiente">Pendiente</option>
          <option value="En curso">En curso</option>
          <option value="Finalizado">Finalizado</option>
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
            <span>Cargando siembras...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
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
      ) : (
        <div className="table-shell dashboard-card">
          <table className="lotes-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Nombre</th>
                <th>Fecha de Inicio</th>
                <th>Fecha de Fin</th>
                <th>Campaña</th>
                <th>Producto</th>
                <th>Empresa</th>
                <th>Lote</th>
                <th>Cantidad de Semillas</th>
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
                  <td>{formatFecha(siembra.fechaFin)}</td>
                  <td>{siembra.campaniaNombre || '-'}</td>
                  <td>{siembra.producto}</td>
                  <td>{siembra.empresa || '-'}</td>
                  <td>{siembra.loteNombre}</td>
                  <td>{siembra.cantidadSemillas ?? '-'}</td>
                  <td>{siembra.estado}</td>
                  <td className="actions-cell">
                    <button type="button" aria-label={`Editar ${siembra.nombre}`} onClick={() => onEdit(siembra)}><Edit size={18} /></button>
                    <button type="button" aria-label={`Ver ${siembra.nombre}`} onClick={() => onView(siembra)}><Eye size={18} /></button>
                    <button type="button" aria-label={`Seguimiento de ${siembra.nombre}`} onClick={() => onSeguimiento(siembra)}><Route size={18} /></button>
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

function SiembraForm({
  modoEdicion,
  nombre,
  estado,
  lotes,
  usuarios,
  form,
  insumoForm,
  insumos,
  documentos,
  saving,
  error,
  onFieldChange,
  onInsumoFieldChange,
  onGuardar,
  onAgregarInsumo,
  onEliminarInsumo,
  onSubirDocumento,
  onDescargarDocumento,
  onEliminarDocumento,
  onBack
}) {
  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{modoEdicion ? 'Editar Siembra' : 'Registrar Siembra'}</h1>
          <p>{modoEdicion ? nombre : 'El nombre se asigna automaticamente al guardar (SIEM - 0001, SIEM - 0002...).'}</p>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">
            Nombre
            <input readOnly value={modoEdicion ? nombre : ''} placeholder="Se asigna automaticamente al guardar" />
          </label>
          <label className="field">
            Fecha de Inicio <b>*</b>
            <input type="date" required value={form.fechaInicio} onChange={(e) => onFieldChange('fechaInicio', e.target.value)} />
          </label>
          <label className="field">
            Fecha de Fin <b>*</b>
            <input type="date" required value={form.fechaFin} onChange={(e) => onFieldChange('fechaFin', e.target.value)} />
          </label>
          <label className="field">
            Campaña
            <input value={form.campaniaNombre} onChange={(e) => onFieldChange('campaniaNombre', e.target.value)} placeholder="Opcional" />
          </label>
          <label className="field">
            Lote <b>*</b>
            <select required value={form.loteId} onChange={(e) => onFieldChange('loteId', e.target.value)}>
              <option value="">Seleccionar</option>
              {lotes.map((lote) => (
                <option key={lote.loteId} value={lote.loteId}>{lote.nombre}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Cant. Hectareas (del Lote)
            <input readOnly value={form.cantidadHectareasLote || ''} placeholder="Se completa al elegir el Lote" />
          </label>
          <label className="field">
            Producto <b>*</b>
            <input required value={form.producto} onChange={(e) => onFieldChange('producto', e.target.value)} />
          </label>
          <label className="field">
            Empresa
            <input value={form.empresa} onChange={(e) => onFieldChange('empresa', e.target.value)} />
          </label>
          {modoEdicion && (
            <label className="field">
              Estado
              <input readOnly value={estado} />
            </label>
          )}
        </div>

        <div className="create-grid" style={{ marginTop: 16 }}>
          <label className="field">
            Variedad de Semilla
            <input value={form.variedadSemilla} onChange={(e) => onFieldChange('variedadSemilla', e.target.value)} />
          </label>
          <label className="field">
            PMG (g)
            <input type="number" step="0.01" value={form.pmg} onChange={(e) => onFieldChange('pmg', e.target.value)} />
          </label>
          <label className="field">
            Densidad de Siembra (semillas/ha)
            <input type="number" step="0.01" value={form.densidadSiembra} onChange={(e) => onFieldChange('densidadSiembra', e.target.value)} />
          </label>
          <label className="field">
            Profundidad (cm)
            <input type="number" step="0.01" value={form.profundidad} onChange={(e) => onFieldChange('profundidad', e.target.value)} />
          </label>
          <label className="field">
            Cant. Hectareas Trabajadas
            <input type="number" step="0.01" value={form.cantidadHectareasTrabajadas} onChange={(e) => onFieldChange('cantidadHectareasTrabajadas', e.target.value)} />
          </label>
          <label className="field">
            Cantidad de Semillas
            <input type="number" step="0.01" value={form.cantidadSemillas} onChange={(e) => onFieldChange('cantidadSemillas', e.target.value)} />
            <span style={{ fontSize: 12, color: '#6b7280' }}>Se calcula sola (Densidad x Hectareas), editable</span>
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
        </div>
      </div>

      <h2>Pre-Siembra</h2>
      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">
            Fecha de Muestreo
            <input type="date" value={form.fechaMuestreo} onChange={(e) => onFieldChange('fechaMuestreo', e.target.value)} />
          </label>
          <label className="field">
            Fecha de Analisis
            <input type="date" value={form.fechaAnalisis} onChange={(e) => onFieldChange('fechaAnalisis', e.target.value)} />
          </label>
          <label className="field">
            Cantidad de Muestras
            <input type="number" value={form.cantidadMuestras} onChange={(e) => onFieldChange('cantidadMuestras', e.target.value)} />
          </label>
          <label className="field">
            Producto Antecesor
            <input value={form.productoAntecesor} onChange={(e) => onFieldChange('productoAntecesor', e.target.value)} />
          </label>
        </div>
        <label className="field" style={{ marginTop: 16 }}>
          Observaciones
          <input value={form.observacionesPreSiembra} onChange={(e) => onFieldChange('observacionesPreSiembra', e.target.value)} />
        </label>
      </div>

      <h2>Insumos/Agroquimicos</h2>
      <div className="create-form-card dashboard-card">
        <form onSubmit={onAgregarInsumo}>
          <div className="create-grid">
            <label className="field">
              Fecha de aplicacion <b>*</b>
              <input type="date" value={insumoForm.fechaAplicacion} onChange={(e) => onInsumoFieldChange('fechaAplicacion', e.target.value)} />
            </label>
            <label className="field">
              Marca <b>*</b>
              <input value={insumoForm.marca} onChange={(e) => onInsumoFieldChange('marca', e.target.value)} />
            </label>
            <label className="field">
              Tipo <b>*</b>
              <select value={insumoForm.tipo} onChange={(e) => onInsumoFieldChange('tipo', e.target.value)}>
                <option value="">Seleccionar</option>
                {TIPOS_INSUMO.map((tipo) => (
                  <option key={tipo} value={tipo}>{tipo}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Variedad
              <input value={insumoForm.variedad} onChange={(e) => onInsumoFieldChange('variedad', e.target.value)} />
            </label>
            <label className="field">
              Cantidad Aplicada <b>*</b>
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
              <tr key={insumo.siembraInsumoId ?? insumo.tempId}>
                <td>{insumo.fechaAplicacion || '-'}</td>
                <td>{insumo.marca || '-'}</td>
                <td>{insumo.tipo || '-'}</td>
                <td>{insumo.variedad || '-'}</td>
                <td>{insumo.cantidadAplicada ?? '-'}</td>
                <td className="actions-cell">
                  <button type="button" aria-label="Eliminar insumo" onClick={() => onEliminarInsumo(insumo)}>
                    <Trash2 size={18} />
                  </button>
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
                <tr key={doc.siembraDocumentoId ?? doc.tempId}>
                  <td>{doc.nombreArchivo}</td>
                  <td>{doc.fechaCarga ? formatFecha(doc.fechaCarga) : 'Pendiente de guardar'}</td>
                  <td>{doc.cargadoPor || '-'}</td>
                  <td className="actions-cell">
                    {doc.siembraDocumentoId && (
                      <button type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>
                    )}
                    <button type="button" aria-label="Eliminar" onClick={() => onEliminarDocumento(doc)}><Trash2 size={18} /></button>
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
          <label className="field">Fecha de Fin<input readOnly value={formatFecha(siembra.fechaFin)} /></label>
          <label className="field">Campaña<input readOnly value={siembra.campaniaNombre || '-'} /></label>
          <label className="field">Lote<input readOnly value={siembra.loteNombre} /></label>
          <label className="field">Producto<input readOnly value={siembra.producto} /></label>
          <label className="field">Empresa<input readOnly value={siembra.empresa || '-'} /></label>
          <label className="field">Estado<input readOnly value={siembra.estado} /></label>
        </div>
        <div className="create-grid" style={{ marginTop: 16 }}>
          <label className="field">Variedad de Semilla<input readOnly value={siembra.variedadSemilla || '-'} /></label>
          <label className="field">PMG (g)<input readOnly value={siembra.pmg ?? '-'} /></label>
          <label className="field">Densidad de Siembra<input readOnly value={siembra.densidadSiembra ?? '-'} /></label>
          <label className="field">Profundidad (cm)<input readOnly value={siembra.profundidad ?? '-'} /></label>
          <label className="field">Cant. Hectareas Trabajadas<input readOnly value={siembra.cantidadHectareasTrabajadas ?? '-'} /></label>
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
          <label className="field">Producto Antecesor<input readOnly value={siembra.productoAntecesor || '-'} /></label>
        </div>
        <label className="field" style={{ marginTop: 16 }}>
          Observaciones
          <input readOnly value={siembra.observacionesPreSiembra || '-'} />
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
              <tr key={insumo.siembraInsumoId}>
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
              <tr key={doc.siembraDocumentoId}>
                <td>{doc.nombreArchivo}</td>
                <td>{formatFecha(doc.fechaCarga)}</td>
                <td>{doc.cargadoPor || '-'}</td>
                <td className="actions-cell">
                  <button type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>
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

function SeguimientoMapa({ puntos, pendiente, onPick, readOnly }) {
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

    if (!initialFitDoneRef.current && todosLosPuntos.length > 0) {
      initialFitDoneRef.current = true;
      window.setTimeout(() => {
        if (!mapRef.current) return;
        mapRef.current.invalidateSize();
        if (todosLosPuntos.length === 1) {
          mapRef.current.setView(todosLosPuntos[0], 16, { animate: false });
          return;
        }
        const bounds = L.latLngBounds(todosLosPuntos);
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds.pad(0.25), { animate: false, maxZoom: 17 });
        }
      }, 120);
    }
  }, [puntos, pendiente]);

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

function SeguimientoLive({
  siembra,
  seguimientos,
  seguimientoForm,
  editingSeguimientoId,
  activeSeguimientoId,
  insumoForm,
  insumos,
  documentos,
  saving,
  error,
  onFieldChange,
  onPickPunto,
  onGuardar,
  onEditar,
  onCancelarEdicion,
  onEliminar,
  onFinalizar,
  onInsumoFieldChange,
  onAgregarInsumo,
  onEliminarInsumo,
  onSubirDocumento,
  onDescargarDocumento,
  onEliminarDocumento,
  onBack
}) {
  if (!siembra) return null;

  const puntosExistentes = seguimientos
    .filter((s) => s.latitud != null && s.longitud != null && s.siembraSeguimientoId !== editingSeguimientoId)
    .slice()
    .reverse()
    .map((s) => ({ lat: Number(s.latitud), lng: Number(s.longitud) }));

  const puntoPendiente = seguimientoForm.latitud !== '' && seguimientoForm.longitud !== ''
    ? { lat: Number(seguimientoForm.latitud), lng: Number(seguimientoForm.longitud) }
    : null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Seguimiento {siembra.nombre}</h1>
          <p>{siembra.loteNombre} - {siembra.producto}</p>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="create-form-card dashboard-card">
        <SeguimientoMapa puntos={puntosExistentes} pendiente={puntoPendiente} onPick={onPickPunto} readOnly={false} />

        <form onSubmit={onGuardar}>
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
          <div className="form-actions">
            <button className="green-button" type="submit">{editingSeguimientoId ? 'Actualizar' : 'Agregar'}</button>
            {editingSeguimientoId && (
              <button className="back-button" type="button" onClick={onCancelarEdicion}>Cancelar edicion</button>
            )}
          </div>
        </form>
      </div>

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
              <tr key={s.siembraSeguimientoId} style={s.siembraSeguimientoId === activeSeguimientoId ? { background: '#eef7ee' } : undefined}>
                <td>{formatFecha(s.fecha)}</td>
                <td>{s.longitud ?? '-'}</td>
                <td>{s.latitud ?? '-'}</td>
                <td>{s.incidencia || '-'}</td>
                <td>{s.perdidaEconomica === null || s.perdidaEconomica === undefined ? '-' : s.perdidaEconomica ? 'Si' : 'No'}</td>
                <td>{s.aplicacionAgroquimicos === null || s.aplicacionAgroquimicos === undefined ? '-' : s.aplicacionAgroquimicos ? 'Si' : 'No'}</td>
                <td>{s.observaciones}</td>
                <td className="actions-cell">
                  <button type="button" aria-label="Eliminar recorrida" onClick={() => onEliminar(s)}><Trash2 size={18} /></button>
                  <button type="button" aria-label="Editar recorrida" onClick={() => onEditar(s)}><Edit size={18} /></button>
                </td>
              </tr>
            ))}
            {seguimientos.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center' }}>Todavia no hay recorridas registradas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Insumos/Agroquimicos</h2>
      {!activeSeguimientoId && (
        <p style={{ color: '#6b7280', fontSize: 13 }}>Agrega o edita una recorrida arriba para poder cargarle insumos.</p>
      )}
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
            <button className="green-button" type="submit" disabled={!activeSeguimientoId}>Agregar</button>
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
              <tr key={insumo.seguimientoInsumoId}>
                <td>{insumo.fechaAplicacion || '-'}</td>
                <td>{insumo.marca || '-'}</td>
                <td>{insumo.tipo || '-'}</td>
                <td>{insumo.variedad || '-'}</td>
                <td>{insumo.cantidadAplicada ?? '-'}</td>
                <td className="actions-cell">
                  <button type="button" aria-label="Eliminar insumo" onClick={() => onEliminarInsumo(insumo)}><Trash2 size={18} /></button>
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
        <input type="file" disabled={!activeSeguimientoId} onChange={(e) => onSubirDocumento(e.target.files?.[0])} />
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
                <tr key={doc.seguimientoDocumentoId}>
                  <td>{doc.nombreArchivo}</td>
                  <td>{formatFecha(doc.fechaCarga)}</td>
                  <td>{doc.cargadoPor || '-'}</td>
                  <td className="actions-cell">
                    <button type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>
                    <button type="button" aria-label="Eliminar" onClick={() => onEliminarDocumento(doc)}><Trash2 size={18} /></button>
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
        <button className="green-button" type="button" onClick={onBack}>Guardar</button>
        <button className="green-button" type="button" onClick={onFinalizar}>Finalizar Seguimiento</button>
        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
      </div>
    </section>
  );
}

function SeguimientoHistorial({ siembra, seguimientos, onVerDetalle, onBack }) {
  if (!siembra) return null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Historial {siembra.nombre}</h1>
          <p>{siembra.loteNombre} - {siembra.producto}</p>
        </div>
      </div>

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
                  <button type="button" aria-label="Ver detalle" onClick={() => onVerDetalle(s)}><Eye size={18} /></button>
                </td>
              </tr>
            ))}
            {seguimientos.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center' }}>Sin recorridas registradas.</td></tr>
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

function SeguimientoDetalle({ siembra, seguimiento, insumos, documentos, onDescargarDocumento, onBack }) {
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
            <SeguimientoMapa puntos={punto} pendiente={null} onPick={() => {}} readOnly />
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
                  <button type="button" aria-label="Descargar" onClick={() => onDescargarDocumento(doc)}><Download size={18} /></button>
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
