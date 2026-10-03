import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Gauge } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit,
  Eye,
  FileText,
  Filter,
  LayoutGrid,
  List,
  LoaderCircle,
  MapPin,
  Package,
  SlidersHorizontal,
  PlusCircle,
  RotateCcw,
  Search,
  Thermometer,
  Droplet,
  Trash2,
  Warehouse,
  Wheat
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';

const emptySiloForm = {
  loteId: '',
  nombre: '',
  tipoSilo: 'Chapa',
  capacidadMax: '',
  grano: '',
  granoOtro: '',
  cantidadGranoAlmacenado: '',
  pais: 'Argentina',
  provincia: '',
  ciudad: '',
  latitud: '',
  longitud: '',
  diametroM: '',
  alturaM: '',
  tieneAireacion: '',
  tieneTermometria: '',
  largoM: '',
  diametroBolsonPies: '',
  fechaEmbolsado: '',
  fechaVencimientoEstimada: '',
  identificacionEnLote: ''
};

const TIPOS_PLAGA = ['Roedores', 'Insectos', 'Hongos'];

const TIPOS_INSUMO = [
  'Herbicidas', 'Insecticidas', 'Fungicidas', 'Acaricidas',
  'Nematicidas', 'Raticidas', 'Bactericidas', 'Molusquicidas'
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getEmptyControlForm() {
  return {
    fecha: todayIso(),
    humedadGrano: '',
    temperatura: '',
    estadoGrano: 'Bueno',
    roturaBolsa: 'No',
    observaciones: '',
    fechaProximoControl: '',
    proximoManual: false
  };
}

const emptyIncidenciaForm = {
  presenciaPlagas: 'No',
  tipoPlaga: TIPOS_PLAGA[0],
  observaciones: ''
};

const emptyInsumoForm = {
  aplicarInsumo: 'No',
  fechaAplicacion: '',
  marca: '',
  tipo: '',
  cantidadAplicada: ''
};

function normalizeSearchText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function ocupacionSeveridad(porcentaje) {
  if (porcentaje >= 90) return 'alta';
  if (porcentaje >= 60) return 'media';
  return 'baja';
}

let tempIdSeq = 0;
function nextTempId() {
  tempIdSeq += 1;
  return `tmp-${tempIdSeq}`;
}

export default function Silos({ session, lotes, parentFilters = null, selectedEmpresaId = '', selectedEmpresaName = '' }) {
  const [view, setView] = useState('list');
  const [silos, setSilos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedSilo, setSelectedSilo] = useState(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [fichaVersion, setFichaVersion] = useState(0);
  const [form, setForm] = useState(emptySiloForm);

  const [controles, setControles] = useState([]);
  const [controlForm, setControlForm] = useState(getEmptyControlForm);
  const [incidenciaForm, setIncidenciaForm] = useState(emptyIncidenciaForm);
  const [insumoForm, setInsumoForm] = useState(emptyInsumoForm);
  const [incidencias, setIncidencias] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [controlSaving, setControlSaving] = useState(false);

  // null mientras se esta creando un control nuevo (todavia sin ID);
  // con valor cuando se esta editando o viendo el detalle de un control existente.
  const [activeControlId, setActiveControlId] = useState(null);
  const [controlDetalle, setControlDetalle] = useState(null);

  function authHeaders(extra = {}) {
    return session?.token ? { ...extra, Authorization: `Bearer ${session.token}` } : extra;
  }

  async function loadSilos() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/silos`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      setSilos(await response.json());
    } catch (err) {
      setError(`No se pudieron cargar los silos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSilos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToList() {
    setView('list');
    setSelectedSilo(null);
    setError('');
    loadSilos();
  }

  function startCreate() {
    setForm(emptySiloForm);
    setError('');
    setView('create');
  }

  function openSilo(silo, mode) {
    const siNo = (valor) => (valor === true ? 'Si' : valor === false ? 'No' : '');
    const texto = (valor) => (valor === null || valor === undefined ? '' : String(valor));
    setSelectedSilo(silo);
    setForm({
      ...emptySiloForm,
      loteId: silo.loteId ?? '',
      nombre: silo.nombre,
      tipoSilo: silo.tipoSilo,
      capacidadMax: silo.capacidadMax,
      cantidadGranoAlmacenado: silo.cantidadGranoAlmacenado,
      pais: silo.pais,
      provincia: silo.provincia,
      ciudad: silo.ciudad,
      latitud: silo.latitud ?? '',
      longitud: silo.longitud ?? '',
      diametroM: texto(silo.diametroM),
      alturaM: texto(silo.alturaM),
      tieneAireacion: siNo(silo.tieneAireacion),
      tieneTermometria: siNo(silo.tieneTermometria),
      largoM: texto(silo.largoM),
      diametroBolsonPies: silo.diametroBolsonPies != null ? String(Number(silo.diametroBolsonPies)) : '',
      fechaEmbolsado: silo.fechaEmbolsado ? String(silo.fechaEmbolsado).slice(0, 10) : '',
      fechaVencimientoEstimada: silo.fechaVencimientoEstimada ? String(silo.fechaVencimientoEstimada).slice(0, 10) : '',
      identificacionEnLote: silo.identificacionEnLote ?? ''
    });
    setError('');
    setView(mode);
  }

  // Datos del formulario que comparten alta y edicion (los del otro tipo de silo los descarta el back).
  function datosFormulario() {
    return {
      loteId: form.loteId ? Number(form.loteId) : null,
      nombre: form.nombre.trim(),
      tipoSilo: form.tipoSilo,
      capacidadMax: Number(form.capacidadMax),
      pais: form.pais || 'Argentina',
      provincia: form.provincia,
      ciudad: form.ciudad,
      latitud: numeroONull(form.latitud),
      longitud: numeroONull(form.longitud),
      diametroM: numeroONull(form.diametroM),
      alturaM: numeroONull(form.alturaM),
      tieneAireacion: siNoONull(form.tieneAireacion),
      tieneTermometria: siNoONull(form.tieneTermometria),
      largoM: numeroONull(form.largoM),
      diametroBolsonPies: numeroONull(form.diametroBolsonPies),
      fechaEmbolsado: form.fechaEmbolsado || null,
      fechaVencimientoEstimada: form.fechaVencimientoEstimada || null,
      identificacionEnLote: form.identificacionEnLote.trim() || null
    };
  }

  async function cambiarEstado(estado) {
    setCambiandoEstado(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/estado`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ estado })
      });
      if (!response.ok) throw new Error(await response.text());
      const actualizado = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}`, { headers: authHeaders() });
      if (actualizado.ok) setSelectedSilo(await actualizado.json());
      setFichaVersion((actual) => actual + 1);
      loadSilos();
    } catch (err) {
      setError(`No se pudo cambiar el estado: ${err.message}`);
    } finally {
      setCambiandoEstado(false);
    }
  }

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      // Al cambiar de lote, el punto marcado deja de ser valido.
      if (field === 'loteId' && String(value) !== String(current.loteId)) {
        next.latitud = '';
        next.longitud = '';
      }
      if (field === 'loteId' && value) {
        const lote = lotes.find((l) => String(l.loteId) === String(value));
        if (lote) {
          next.pais = lote.pais;
          next.provincia = lote.provincia;
          next.ciudad = lote.ciudad;
        }
      }
      return next;
    });
  }

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/silos`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...datosFormulario(),
          empresaId: selectedEmpresaId ? Number(selectedEmpresaId) : null,
          producto: Number(form.cantidadGranoAlmacenado) > 0
            ? (form.grano === 'Otro' ? form.granoOtro.trim() : form.grano) || null
            : null,
          cantidadGranoAlmacenado: Number(form.cantidadGranoAlmacenado) > 0 ? Number(form.cantidadGranoAlmacenado) : null
        })
      });
      if (!response.ok) throw new Error(await response.text());
      goToList();
    } catch (err) {
      setError(`No se pudo registrar el silo: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(datosFormulario())
      });
      if (!response.ok) throw new Error(await response.text());
      goToList();
    } catch (err) {
      setError(`No se pudo guardar el silo: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  // ---------- Historial / Controles ----------

  async function loadControles(siloId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/silos/${siloId}/controles`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      setControles(await response.json());
    } catch (err) {
      setError(`No se pudieron cargar los controles: ${err.message}`);
    }
  }

  function openHistorial(silo) {
    setSelectedSilo(silo);
    setError('');
    loadControles(silo.siloId);
    setView('historial');
  }

  function backToHistorial() {
    setView('historial');
    setError('');
    if (selectedSilo) loadControles(selectedSilo.siloId);
  }

  async function loadControlSubItems(siloId, controlId) {
    try {
      const [incRes, insRes, docRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/silos/${siloId}/controles/${controlId}/incidencias`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/api/silos/${siloId}/controles/${controlId}/insumos`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/api/silos/${siloId}/controles/${controlId}/documentos`, { headers: authHeaders() })
      ]);
      setIncidencias(incRes.ok ? await incRes.json() : []);
      setInsumos(insRes.ok ? await insRes.json() : []);
      setDocumentos(docRes.ok ? await docRes.json() : []);
    } catch (err) {
      setError(`No se pudo cargar la informacion del control: ${err.message}`);
    }
  }

  function openCrearControl(silo) {
    setSelectedSilo(silo);
    setActiveControlId(null);
    setControlForm(getEmptyControlForm());
    setIncidenciaForm(emptyIncidenciaForm);
    setInsumoForm(emptyInsumoForm);
    setIncidencias([]);
    setInsumos([]);
    setDocumentos([]);
    setError('');
    setView('controlForm');
  }

  async function openEditarControl(silo, control) {
    setSelectedSilo(silo);
    setActiveControlId(control.siloControlId);
    setControlForm({
      fecha: control.fecha ? control.fecha.slice(0, 10) : todayIso(),
      humedadGrano: control.humedadGrano,
      temperatura: control.temperatura,
      estadoGrano: control.estadoGrano,
      roturaBolsa: control.roturaBolsa ? 'Si' : 'No',
      observaciones: control.observaciones ?? '',
      fechaProximoControl: control.fechaProximoControl ? String(control.fechaProximoControl).slice(0, 10) : '',
      proximoManual: Boolean(control.fechaProximoControl)
    });
    setIncidenciaForm(emptyIncidenciaForm);
    setInsumoForm(emptyInsumoForm);
    setError('');
    await loadControlSubItems(silo.siloId, control.siloControlId);
    setView('controlForm');
  }

  async function openDetalleControl(silo, control) {
    setSelectedSilo(silo);
    setActiveControlId(control.siloControlId);
    setControlDetalle(control);
    setError('');
    await loadControlSubItems(silo.siloId, control.siloControlId);
    setView('controlDetalle');
  }

  async function handleGuardarControl() {
    setControlSaving(true);
    setError('');
    try {
      const body = {
        fecha: controlForm.fecha ? new Date(`${controlForm.fecha}T00:00:00`).toISOString() : null,
        humedadGrano: Number(controlForm.humedadGrano),
        temperatura: Number(controlForm.temperatura),
        estadoGrano: controlForm.estadoGrano,
        roturaBolsa: selectedSilo.tipoSilo === 'Bolson' ? controlForm.roturaBolsa === 'Si' : null,
        observaciones: controlForm.observaciones || null,
        // Si queda vacio, el back usa la fecha sugerida por el evaluador.
        fechaProximoControl: controlForm.fechaProximoControl || null
      };

      if (activeControlId) {
        const response = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${activeControlId}`, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(await response.text());
        backToHistorial();
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`al crear el control base: ${await response.text()}`);
      const nuevoControl = await response.json();
      const controlId = nuevoControl.siloControlId;
      if (!controlId) throw new Error(`el control se creo pero la respuesta no trajo siloControlId: ${JSON.stringify(nuevoControl)}`);

      for (const incidencia of incidencias) {
        const res = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${controlId}/incidencias`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ tipoPlaga: incidencia.tipoPlaga, observaciones: incidencia.observaciones })
        });
        if (!res.ok) throw new Error(`al agregar la incidencia "${incidencia.tipoPlaga}" (status ${res.status}): ${await res.text()}`);
      }

      for (const insumo of insumos) {
        const res = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${controlId}/insumos`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            fechaAplicacion: insumo.fechaAplicacion || null,
            marca: insumo.marca || null,
            tipo: insumo.tipo || null,
            cantidadAplicada: insumo.cantidadAplicada === '' ? null : Number(insumo.cantidadAplicada)
          })
        });
        if (!res.ok) throw new Error(`al agregar el insumo "${insumo.marca}" (status ${res.status}): ${await res.text()}`);
      }

      for (const documento of documentos) {
        const formData = new FormData();
        formData.append('archivo', documento.file);
        const res = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${controlId}/documentos`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData
        });
        if (!res.ok) throw new Error(`al subir el documento "${documento.nombreArchivo}" (status ${res.status}): ${await res.text()}`);
      }

      backToHistorial();
    } catch (err) {
      setError(`No se pudo guardar el control: ${err.message}`);
    } finally {
      setControlSaving(false);
    }
  }

  async function handleEliminarControl(control) {
    try {
      await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${control.siloControlId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      await loadControles(selectedSilo.siloId);
    } catch (err) {
      setError(`No se pudo eliminar el control: ${err.message}`);
    }
  }

  async function handleAgregarIncidencia(event) {
    event.preventDefault();
    if (activeControlId) {
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${activeControlId}/incidencias`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ tipoPlaga: incidenciaForm.tipoPlaga, observaciones: incidenciaForm.observaciones })
        });
        if (!response.ok) throw new Error(await response.text());
        setIncidenciaForm({ ...emptyIncidenciaForm, presenciaPlagas: incidenciaForm.presenciaPlagas });
        await loadControlSubItems(selectedSilo.siloId, activeControlId);
      } catch (err) {
        setError(`No se pudo agregar la incidencia: ${err.message}`);
      }
      return;
    }

    setIncidencias((current) => [
      ...current,
      { tempId: nextTempId(), tipoPlaga: incidenciaForm.tipoPlaga, observaciones: incidenciaForm.observaciones }
    ]);
    setIncidenciaForm({ ...emptyIncidenciaForm, presenciaPlagas: incidenciaForm.presenciaPlagas });
  }

  async function handleEliminarIncidencia(incidencia) {
    if (activeControlId) {
      try {
        await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${activeControlId}/incidencias/${incidencia.siloControlIncidenciaId}`, {
          method: 'DELETE',
          headers: authHeaders()
        });
        await loadControlSubItems(selectedSilo.siloId, activeControlId);
      } catch (err) {
        setError(`No se pudo eliminar la incidencia: ${err.message}`);
      }
      return;
    }

    setIncidencias((current) => current.filter((i) => i.tempId !== incidencia.tempId));
  }

  async function handleAgregarInsumo(event) {
    event.preventDefault();
    if (activeControlId) {
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${activeControlId}/insumos`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            fechaAplicacion: insumoForm.fechaAplicacion || null,
            marca: insumoForm.marca || null,
            tipo: insumoForm.tipo || null,
            cantidadAplicada: insumoForm.cantidadAplicada === '' ? null : Number(insumoForm.cantidadAplicada)
          })
        });
        if (!response.ok) throw new Error(await response.text());
        setInsumoForm({ ...emptyInsumoForm, aplicarInsumo: insumoForm.aplicarInsumo });
        await loadControlSubItems(selectedSilo.siloId, activeControlId);
      } catch (err) {
        setError(`No se pudo agregar el insumo: ${err.message}`);
      }
      return;
    }

    setInsumos((current) => [
      ...current,
      {
        tempId: nextTempId(),
        fechaAplicacion: insumoForm.fechaAplicacion,
        marca: insumoForm.marca,
        tipo: insumoForm.tipo,
        cantidadAplicada: insumoForm.cantidadAplicada
      }
    ]);
    setInsumoForm({ ...emptyInsumoForm, aplicarInsumo: insumoForm.aplicarInsumo });
  }

  async function handleEliminarInsumo(insumo) {
    if (activeControlId) {
      try {
        await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${activeControlId}/insumos/${insumo.siloControlInsumoId}`, {
          method: 'DELETE',
          headers: authHeaders()
        });
        await loadControlSubItems(selectedSilo.siloId, activeControlId);
      } catch (err) {
        setError(`No se pudo eliminar el insumo: ${err.message}`);
      }
      return;
    }

    setInsumos((current) => current.filter((i) => i.tempId !== insumo.tempId));
  }

  async function handleSubirDocumento(file) {
    if (!file) return;

    if (activeControlId) {
      try {
        const formData = new FormData();
        formData.append('archivo', file);
        const response = await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${activeControlId}/documentos`, {
          method: 'POST',
          headers: authHeaders(),
          body: formData
        });
        if (!response.ok) throw new Error(await response.text());
        await loadControlSubItems(selectedSilo.siloId, activeControlId);
      } catch (err) {
        setError(`No se pudo subir el archivo: ${err.message}`);
      }
      return;
    }

    setDocumentos((current) => [...current, { tempId: nextTempId(), file, nombreArchivo: file.name }]);
  }

  async function handleEliminarDocumento(documento) {
    if (activeControlId) {
      try {
        await fetch(`${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${activeControlId}/documentos/${documento.siloDocumentoId}`, {
          method: 'DELETE',
          headers: authHeaders()
        });
        await loadControlSubItems(selectedSilo.siloId, activeControlId);
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
        `${API_BASE_URL}/api/silos/${selectedSilo.siloId}/controles/${activeControlId}/documentos/${documento.siloDocumentoId}/descargar`,
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
      <SiloWizard
        key={view}
        mode={view}
        form={form}
        silo={selectedSilo}
        lotes={lotes}
        empresaNombre={selectedEmpresaName}
        saving={saving}
        error={error}
        onFieldChange={updateField}
        onCancel={view === 'create' ? goToList : () => { setError(''); setView('detail'); }}
        onSubmit={view === 'create' ? handleCreate : handleUpdate}
      />
    );
  }

  if (view === 'detail') {
    return (
      <SiloFicha
        silo={selectedSilo}
        lotes={lotes}
        authHeaders={authHeaders}
        version={fichaVersion}
        error={error}
        cambiandoEstado={cambiandoEstado}
        onVolver={goToList}
        onEditar={() => openSilo(selectedSilo, 'edit')}
        onControles={() => openHistorial(selectedSilo)}
        onCambiarEstado={cambiarEstado}
      />
    );
  }

  if (view === 'parametros') {
    return (
      <SiloParametros
        empresaId={selectedEmpresaId}
        empresaNombre={selectedEmpresaName}
        authHeaders={authHeaders}
        onVolver={goToList}
      />
    );
  }

  if (view === 'historial') {
    return (
      <SiloHistorialList
        silo={selectedSilo}
        controles={controles}
        error={error}
        onNuevoControl={() => openCrearControl(selectedSilo)}
        onVer={(control) => openDetalleControl(selectedSilo, control)}
        onEditar={(control) => openEditarControl(selectedSilo, control)}
        onEliminar={handleEliminarControl}
        onBack={goToList}
      />
    );
  }

  if (view === 'controlForm') {
    return (
      <SiloControlForm
        silo={selectedSilo}
        modoEdicion={Boolean(activeControlId)}
        controlId={activeControlId}
        authHeaders={authHeaders}
        controlForm={controlForm}
        incidenciaForm={incidenciaForm}
        insumoForm={insumoForm}
        incidencias={incidencias}
        insumos={insumos}
        documentos={documentos}
        saving={controlSaving}
        error={error}
        onControlFieldChange={(field, value) => setControlForm((current) => ({ ...current, [field]: value }))}
        onIncidenciaFieldChange={(field, value) => setIncidenciaForm((current) => ({ ...current, [field]: value }))}
        onInsumoFieldChange={(field, value) => setInsumoForm((current) => ({ ...current, [field]: value }))}
        onGuardarControl={handleGuardarControl}
        onAgregarIncidencia={handleAgregarIncidencia}
        onEliminarIncidencia={handleEliminarIncidencia}
        onAgregarInsumo={handleAgregarInsumo}
        onEliminarInsumo={handleEliminarInsumo}
        onSubirDocumento={handleSubirDocumento}
        onDescargarDocumento={handleDescargarDocumento}
        onEliminarDocumento={handleEliminarDocumento}
        onBack={backToHistorial}
      />
    );
  }

  if (view === 'controlDetalle') {
    return (
      <SiloControlDetalle
        silo={selectedSilo}
        control={controlDetalle}
        incidencias={incidencias}
        insumos={insumos}
        documentos={documentos}
        onDescargarDocumento={handleDescargarDocumento}
        onBack={backToHistorial}
      />
    );
  }

  return (
    <SilosList
      silos={selectedEmpresaId ? silos.filter((silo) => String(silo.empresaId) === String(selectedEmpresaId)) : silos}
      parentFilters={parentFilters}
      loading={loading}
      error={error}
      onAdd={startCreate}
      onView={(silo) => openSilo(silo, 'detail')}
      onEdit={(silo) => openSilo(silo, 'edit')}
      onControl={openHistorial}
      onParametros={() => { setError(''); setView('parametros'); }}
    />
  );
}

// Tablero de silos (rediseno, paso 1): tarjetas resumen, filtros, alertas y
// vista en tarjetas o en tabla. Los silos ya llegan filtrados por la empresa elegida.

const DIAS_AVISO_VENCIMIENTO_BOLSON = 30;

const ESTADOS_SILO = {
  Vacio: { texto: 'Vacío', tono: 'gris' },
  'Con grano': { texto: 'Con grano', tono: 'verde' },
  'En mantenimiento': { texto: 'En mantenimiento', tono: 'azul' },
  'Dado de baja': { texto: 'Dado de baja', tono: 'gris' }
};

function formatKg(value) {
  return `${Number(value ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })} kg`;
}

function formatFecha(value) {
  if (!value) return '-';
  const [anio, mes, dia] = String(value).slice(0, 10).split('-');
  return dia && mes && anio ? `${dia}/${mes}/${anio}` : value;
}

function diasHasta(fechaIso) {
  const hoy = new Date(`${todayIso()}T00:00:00`);
  const fecha = new Date(`${String(fechaIso).slice(0, 10)}T00:00:00`);
  return Math.round((fecha - hoy) / 86400000);
}

// Alertas del silo, de la mas grave a la menos grave.
function alertasDeSilo(silo) {
  const alertas = [];
  if (silo.estadoOperativo === 'Dado de baja') return alertas;

  if (silo.ultimoControlResultado === 'Critico') alertas.push({ tono: 'rojo', texto: 'Último control crítico', corto: 'Control crítico' });
  if (silo.fechaProximoControl && diasHasta(silo.fechaProximoControl) < 0) {
    alertas.push({ tono: 'rojo', texto: `Control vencido (${formatFecha(silo.fechaProximoControl)})`, corto: 'Control vencido' });
  }
  if (silo.tipoSilo === 'Bolson' && silo.fechaVencimientoEstimada) {
    const dias = diasHasta(silo.fechaVencimientoEstimada);
    if (dias < 0) alertas.push({ tono: 'rojo', texto: `Bolsón vencido (${formatFecha(silo.fechaVencimientoEstimada)})`, corto: 'Bolsón vencido' });
    else if (dias <= DIAS_AVISO_VENCIMIENTO_BOLSON) alertas.push({ tono: 'ambar', texto: `Bolsón vence en ${dias} días`, corto: `Vence en ${dias} días` });
  }
  if (silo.ultimoControlResultado === 'Atencion') alertas.push({ tono: 'ambar', texto: 'Atención en el último control', corto: 'Atención' });

  return alertas.sort((a, b) => (a.tono === b.tono ? 0 : a.tono === 'rojo' ? -1 : 1));
}

// "maiz", "Maiz" y "Maíz" son el mismo grano: se agrupan y se muestra la primera forma encontrada.
function granosUnicos(valores) {
  const vistos = new Map();
  valores.filter(Boolean).forEach((valor) => {
    const clave = normalizeSearchText(String(valor).trim());
    if (!vistos.has(clave)) vistos.set(clave, String(valor).trim());
  });
  return [...vistos.values()];
}

function mismoGrano(a, b) {
  return normalizeSearchText(String(a ?? '').trim()) === normalizeSearchText(String(b ?? '').trim());
}

// 0,2 % no es 0 %: con poco grano se muestra "< 1 %" para que no parezca vacio.
function formatoPorcentaje(porcentaje) {
  const valor = Number(porcentaje) || 0;
  if (valor <= 0) return '0 %';
  if (valor < 1) return '< 1 %';
  return `${Math.round(valor)} %`;
}

function colorOcupacion(porcentaje) {
  if (porcentaje >= 90) return '#c0392b';
  if (porcentaje >= 60) return '#d99a1e';
  return '#18883b';
}

// Silo de chapa: silueta vertical. Bolson: bolsa horizontal. Se llena segun la ocupacion.
function SiloGlyph({ tipo, porcentaje }) {
  const pct = Math.max(0, Math.min(100, Number(porcentaje) || 0));
  const color = pct === 0 ? '#c9d5cc' : colorOcupacion(pct);

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

function EstadoSiloChip({ estado }) {
  const info = ESTADOS_SILO[estado] ?? { texto: estado || 'Sin estado', tono: 'gris' };
  return <span className={`silo-chip silo-chip-${info.tono}`}>{info.texto}</span>;
}

function SilosList({ silos, parentFilters = null, loading, error, onAdd, onView, onEdit, onControl, onParametros }) {
  const [query, setQuery] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [productoFilter, setGranoFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [vista, setVista] = useState('tarjetas');

  function ubicacionDe(silo) {
    return silo.loteNombre ?? [silo.ciudad, silo.provincia].filter(Boolean).join(', ');
  }

  const productoOptions = useMemo(
    () => granosUnicos(silos.map((silo) => silo.producto)),
    [silos]
  );

  const conAlertas = useMemo(
    () => silos.map((silo) => ({ silo, alertas: alertasDeSilo(silo) })),
    [silos]
  );

  // Tarjetas resumen: los silos dados de baja no cuentan capacidad.
  const resumen = useMemo(() => {
    const operativos = silos.filter((silo) => silo.estadoOperativo !== 'Dado de baja');
    const capacidad = operativos.reduce((total, silo) => total + Number(silo.capacidadMax || 0), 0);
    const stock = operativos.reduce((total, silo) => total + Number(silo.cantidadGranoAlmacenado || 0), 0);
    const chapa = operativos.filter((silo) => silo.tipoSilo !== 'Bolson').length;
    const alertas = conAlertas.filter(({ alertas: lista }) => lista.length > 0);
    return {
      cantidad: operativos.length,
      chapa,
      bolsones: operativos.length - chapa,
      capacidad,
      stock,
      granos: granosUnicos(operativos.filter((s) => Number(s.cantidadGranoAlmacenado) > 0).map((s) => s.producto)),
      ocupacion: capacidad > 0 ? Math.round((stock / capacidad) * 100) : 0,
      alertas: alertas.length,
      alertasRojas: alertas.filter(({ alertas: lista }) => lista[0].tono === 'rojo').length
    };
  }, [silos, conAlertas]);

  const filtered = useMemo(() => conAlertas.filter(({ silo, alertas }) => {
    const texto = normalizeSearchText(query.trim());
    const camposBusqueda = [
      silo.nombre,
      silo.codigo,
      silo.tipoSilo,
      silo.producto,
      ubicacionDe(silo),
      ESTADOS_SILO[silo.estadoOperativo]?.texto
    ];
    const matchesQuery = !texto || camposBusqueda.some((campo) => normalizeSearchText(campo ?? '').includes(texto));
    const matchesTipo = !tipoFilter || silo.tipoSilo === tipoFilter;
    const matchesGrano = !productoFilter || mismoGrano(silo.producto, productoFilter);
    const matchesEstado = estadoFilter
      ? silo.estadoOperativo === estadoFilter
      : silo.estadoOperativo !== 'Dado de baja';
    const matchesAlerta = !soloAlertas || alertas.length > 0;
    return matchesQuery && matchesTipo && matchesGrano && matchesEstado && matchesAlerta;
  }), [conAlertas, query, tipoFilter, productoFilter, estadoFilter, soloAlertas]);

  function clearFilters() {
    setQuery('');
    setTipoFilter('');
    setGranoFilter('');
    setEstadoFilter('');
    setSoloAlertas(false);
  }

  function renderAcciones(silo) {
    return (
      <>
        <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label={`Ver ${silo.nombre}`} onClick={() => onView(silo)}><Eye size={18} /></button>
        <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar ${silo.nombre}`} onClick={() => onEdit(silo)}><Edit size={18} /></button>
        <button className="table-action-tooltip" data-tooltip="Control" type="button" aria-label={`Control de ${silo.nombre}`} onClick={() => onControl(silo)}><ClipboardControlIcon /></button>
      </>
    );
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Silos</h1>
          <p>Infraestructura de almacenamiento y estado del grano guardado.</p>
        </div>
        <div className="silo-heading-actions">
          {onParametros && (
            <button className="back-button" type="button" onClick={onParametros}>
              <SlidersHorizontal size={17} />
              <span>Parámetros</span>
            </button>
          )}
          <button className="green-button add-lote-button" type="button" onClick={onAdd}>
            <PlusCircle size={18} />
            <span>Registrar silo</span>
          </button>
        </div>
      </div>

      {parentFilters}

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      {!loading && silos.length > 0 && (
        <div className="summary-grid summary-grid-four">
          <article className="summary-card">
            <div className="summary-icon"><Warehouse size={28} /></div>
            <div><span>Capacidad total</span><strong>{formatKg(resumen.capacidad)}</strong></div>
            <p>{resumen.cantidad} {resumen.cantidad === 1 ? 'silo' : 'silos'} · {resumen.chapa} chapa, {resumen.bolsones} {resumen.bolsones === 1 ? 'bolsón' : 'bolsones'}</p>
          </article>
          <article className="summary-card">
            <div className="summary-icon"><Wheat size={28} /></div>
            <div><span>Stock almacenado</span><strong>{formatKg(resumen.stock)}</strong></div>
            <p>{resumen.granos.length ? resumen.granos.join(', ') : 'Sin grano almacenado'}</p>
          </article>
          <article className="summary-card">
            <div className="summary-icon"><Gauge size={28} /></div>
            <div><span>Ocupación general</span><strong>{resumen.ocupacion} %</strong></div>
            <p>{formatKg(Math.max(0, resumen.capacidad - resumen.stock))} libres</p>
          </article>
          <article className={`summary-card ${resumen.alertas > 0 ? 'summary-card-alerta' : ''}`}>
            <div className="summary-icon"><AlertTriangle size={28} /></div>
            <div><span>Silos con alerta</span><strong>{resumen.alertas}</strong></div>
            <p>{resumen.alertas === 0 ? 'Todo en orden' : `${resumen.alertasRojas} ${resumen.alertasRojas === 1 ? 'urgente' : 'urgentes'} · ${resumen.alertas - resumen.alertasRojas} para revisar`}</p>
          </article>
        </div>
      )}

      <div className="filters-card silo-filters">
        <label className="search-field">
          <Search size={21} />
          <input data-text-case="preserve" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar silo, código o grano..." />
        </label>
        <select value={tipoFilter} onChange={(event) => setTipoFilter(event.target.value)} aria-label="Filtrar por tipo">
          <option value="">Tipo</option>
          <option value="Chapa">Chapa</option>
          <option value="Bolson">Bolsón</option>
        </select>
        <select value={productoFilter} onChange={(event) => setGranoFilter(event.target.value)} aria-label="Filtrar por grano">
          <option value="">Grano</option>
          {productoOptions.map((producto) => <option key={producto} value={producto}>{producto}</option>)}
        </select>
        <select value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)} aria-label="Filtrar por estado">
          <option value="">Estado</option>
          {Object.entries(ESTADOS_SILO).map(([valor, info]) => <option key={valor} value={valor}>{info.texto}</option>)}
        </select>
        <button
          type="button"
          className={`silo-alert-toggle ${soloAlertas ? 'active' : ''}`}
          aria-pressed={soloAlertas}
          onClick={() => setSoloAlertas((actual) => !actual)}
        >
          <AlertTriangle size={17} />
          <span>Con alerta ({resumen.alertas})</span>
        </button>
        <div className="silo-view-toggle" role="group" aria-label="Vista">
          <button type="button" aria-label="Vista en tarjetas" aria-pressed={vista === 'tarjetas'} className={vista === 'tarjetas' ? 'active' : ''} onClick={() => setVista('tarjetas')}><LayoutGrid size={17} /></button>
          <button type="button" aria-label="Vista en tabla" aria-pressed={vista === 'tabla'} className={vista === 'tabla' ? 'active' : ''} onClick={() => setVista('tabla')}><List size={17} /></button>
        </div>
        <button className="clear-button" type="button" onClick={clearFilters}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
      </div>

      {loading ? (
        <div className="table-shell dashboard-card">
          <div className="loading-state">
            <LoaderCircle className="spin" size={24} />
            <span>Cargando silos...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Warehouse size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>{silos.length === 0 ? 'Aún no tenés silos registrados' : 'Ningún silo coincide con los filtros'}</h2>
            <p>{silos.length === 0 ? 'Registrá tus silos para llevar el control de su ocupación.' : 'Probá limpiando los filtros.'}</p>
          </div>
          {silos.length === 0 ? (
            <button className="green-button empty-state-action" type="button" onClick={onAdd}>
              <PlusCircle size={18} />
              <span>Registrar silo</span>
            </button>
          ) : (
            <button className="back-button empty-state-action" type="button" onClick={clearFilters}>Limpiar filtros</button>
          )}
        </section>
      ) : vista === 'tarjetas' ? (
        <div className="silo-grid">
          {filtered.map(({ silo, alertas }) => {
            const pct = Number(silo.nivelOcupacionPorcentaje) || 0;
            const principal = alertas[0];
            return (
              <article key={silo.siloId} className={`silo-card ${principal ? `silo-card-${principal.tono}` : ''}`}>
                <header className="silo-card-header">
                  <div>
                    <small>{[silo.codigo, silo.tipoSilo === 'Bolson' ? 'Bolsón' : 'Chapa'].filter(Boolean).join(' · ')}</small>
                    <h2>{silo.nombre}</h2>
                  </div>
                  <EstadoSiloChip estado={silo.estadoOperativo} />
                </header>
                <div className="silo-card-body">
                  <SiloGlyph tipo={silo.tipoSilo} porcentaje={pct} />
                  <div>
                    <strong className="silo-card-pct">{formatoPorcentaje(pct)}</strong>
                    <span className="silo-card-kg">{formatKg(silo.cantidadGranoAlmacenado)} / {formatKg(silo.capacidadMax)}</span>
                    <span className="silo-card-grano">{silo.producto || (Number(silo.cantidadGranoAlmacenado) > 0 ? 'Grano sin indicar' : 'Sin grano')}</span>
                  </div>
                </div>
                <div className="silo-card-meta">
                  <span><MapPin size={14} />{ubicacionDe(silo)}</span>
                  <span>{silo.diasAntiguedadPromedio != null ? `${silo.diasAntiguedadPromedio} días` : '—'}</span>
                </div>
                <footer className="silo-card-footer">
                  <span className={`silo-card-alerta ${principal ? `tono-${principal.tono}` : ''}`}>
                    {principal
                      ? principal.texto
                      : silo.ultimoControlFecha ? `Control ${formatFecha(silo.ultimoControlFecha)}` : 'Sin controles'}
                  </span>
                  <div className="actions-cell">{renderAcciones(silo)}</div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="table-shell dashboard-card silo-table-scroll">
          <table className="lotes-table">
            <thead>
              <tr>
                <th>Silo</th>
                <th>Estado</th>
                <th>Grano</th>
                <th style={{ textAlign: 'right' }}>Almacenado</th>
                <th>Ocupación</th>
                <th style={{ textAlign: 'right' }}>Antigüedad</th>
                <th>Ubicación</th>
                <th>Alerta</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ silo, alertas }) => (
                <tr key={silo.siloId}>
                  <td>
                    <strong>{silo.nombre}</strong>
                    <div className="silo-sub">{[silo.codigo, silo.tipoSilo === 'Bolson' ? 'Bolsón' : 'Chapa'].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td><EstadoSiloChip estado={silo.estadoOperativo} /></td>
                  <td>{silo.producto || '-'}</td>
                  <td style={{ textAlign: 'right' }}>{formatKg(silo.cantidadGranoAlmacenado)}</td>
                  <td>
                    <span className={`ocupacion-chip ocupacion-${ocupacionSeveridad(silo.nivelOcupacionPorcentaje)}`}>
                      {silo.nivelOcupacionPorcentaje}%
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{silo.diasAntiguedadPromedio != null ? `${silo.diasAntiguedadPromedio} días` : '-'}</td>
                  <td>{ubicacionDe(silo)}</td>
                  <td>{alertas[0] ? <span className={`silo-chip silo-chip-${alertas[0].tono}`} title={alertas[0].texto}>{alertas[0].corto}</span> : <span className="silo-sub">-</span>}</td>
                  <td className="actions-cell">{renderAcciones(silo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ClipboardControlIcon() {
  return <FileText size={18} />;
}

const ARGENTINA_ZONES = {
  'Buenos Aires': ['Azul', 'Bahia Blanca', 'Balcarce', 'Bragado', 'Chacabuco', 'Junin', 'Mar del Plata', 'Pergamino', 'Tandil', 'Tres Arroyos'],
  'Catamarca': ['Andalgala', 'Belen', 'Fiambala', 'San Fernando del Valle de Catamarca', 'Santa Maria', 'Tinogasta'],
  'Chaco': ['Charata', 'General Pinedo', 'Juan Jose Castelli', 'Las Brenas', 'Presidencia Roque Saenz Pena', 'Resistencia'],
  'Chubut': ['Comodoro Rivadavia', 'Esquel', 'Gaiman', 'Puerto Madryn', 'Rawson', 'Trelew'],
  'Ciudad Autonoma de Buenos Aires': ['Ciudad Autonoma de Buenos Aires'],
  'Cordoba': ['Alta Gracia', 'Bell Ville', 'Cordoba', 'Jesus Maria', 'La Falda', 'Los Condores', 'Marcos Juarez', 'Panaholma', 'Rio Cuarto', 'Rio Tercero', 'Villa Maria'],
  'Corrientes': ['Bella Vista', 'Corrientes', 'Curuzu Cuatia', 'Goya', 'Mercedes', 'Paso de los Libres'],
  'Entre Rios': ['Chajari', 'Concordia', 'Gualeguaychu', 'Parana', 'Victoria', 'Villaguay'],
  'Formosa': ['Clorinda', 'El Colorado', 'Formosa', 'Ingeniero Juarez', 'Las Lomitas', 'Pirane'],
  'Jujuy': ['Humahuaca', 'La Quiaca', 'Libertador General San Martin', 'Palpala', 'San Salvador de Jujuy', 'Tilcara'],
  'La Pampa': ['General Acha', 'General Pico', 'Realico', 'Santa Rosa', 'Toay', 'Victorica'],
  'La Rioja': ['Aimogasta', 'Chamical', 'Chilecito', 'La Rioja', 'Villa Union'],
  'Mendoza': ['General Alvear', 'Godoy Cruz', 'Malargue', 'Mendoza', 'San Rafael', 'Tunuyan'],
  'Misiones': ['Eldorado', 'Leandro N. Alem', 'Obera', 'Posadas', 'Puerto Iguazu', 'San Vicente'],
  'Neuquen': ['Centenario', 'Chos Malal', 'Cutral Co', 'Neuquen', 'San Martin de los Andes', 'Zapala'],
  'Rio Negro': ['Bariloche', 'Cipolletti', 'General Roca', 'Rio Colorado', 'Viedma', 'Villa Regina'],
  'Salta': ['Cafayate', 'Metan', 'Oran', 'Rosario de la Frontera', 'Salta', 'Tartagal'],
  'San Juan': ['Caucete', 'Jachal', 'Rawson', 'San Juan', 'San Martin', 'Valle Fertil'],
  'San Luis': ['La Punta', 'La Toma', 'Merlo', 'San Luis', 'Villa Mercedes'],
  'Santa Cruz': ['Caleta Olivia', 'El Calafate', 'Gobernador Gregores', 'Pico Truncado', 'Rio Gallegos'],
  'Santa Fe': ['Arroyo Seco', 'Casilda', 'Rafaela', 'Reconquista', 'Rosario', 'Santa Fe', 'Venado Tuerto'],
  'Santiago del Estero': ['Anatuya', 'Bandera', 'Frias', 'La Banda', 'Quimili', 'Santiago del Estero'],
  'Tierra del Fuego': ['Rio Grande', 'Tolhuin', 'Ushuaia'],
  'Tucuman': ['Aguilares', 'Concepcion', 'Famailla', 'San Miguel de Tucuman', 'Tafi Viejo', 'Yerba Buena']
};
const PROVINCIAS = Object.keys(ARGENTINA_ZONES);
const GEOREF_API_BASE_URL = 'https://apis.datos.gob.ar/georef/api';

// ===========================================================================
// Registrar / editar silo: wizard de 4 pasos (rediseno, paso 2)
// ===========================================================================

const GRANOS_SILO = ['Soja', 'Maiz', 'Sorgo', 'Trigo', 'Girasol', 'Otro'];
const DIAMETROS_BOLSON_PIES = ['6', '9', '10'];
const PASOS_WIZARD = ['Datos generales', 'Características', 'Ubicación', 'Grano inicial y revisión'];
const CENTRO_ARGENTINA = [-34.6, -63.6];

function numeroONull(valor) {
  return valor === '' || valor === null || valor === undefined ? null : Number(valor);
}

function siNoONull(valor) {
  if (valor === 'Si') return true;
  if (valor === 'No') return false;
  return null;
}

function siNoTexto(valor) {
  if (valor === true) return 'Sí';
  if (valor === false) return 'No';
  return 'Sin dato';
}

// Misma logica que el back (GeoUtils): ray casting sobre las esquinas del lote.
function puntoDentroDelLote(latitud, longitud, coordenadas = []) {
  const vertices = [...coordenadas].sort((a, b) => a.orden - b.orden);
  if (vertices.length < 3) return true;
  let dentro = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const actual = vertices[i];
    const previo = vertices[j];
    const intersecta = ((actual.latitud > latitud) !== (previo.latitud > latitud))
      && (longitud < ((previo.longitud - actual.longitud) * (latitud - actual.latitud)) / (previo.latitud - actual.latitud) + actual.longitud);
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

// Valida un paso del wizard. Devuelve el mensaje de error o null.
function validarPasoSilo(paso, form, { isCreate, lote, stockActual }) {
  if (paso === 1) {
    if (!String(form.nombre || '').trim()) return 'El nombre es obligatorio.';
    if (String(form.nombre).trim().length > 100) return 'El nombre admite hasta 100 caracteres.';
    if (!(Number(form.capacidadMax) > 0)) return 'La capacidad máxima debe ser mayor a cero.';
    if (!isCreate && Number(form.capacidadMax) < stockActual) {
      return `La capacidad no puede ser menor al grano que ya tiene el silo (${formatKg(stockActual)}).`;
    }
  }

  if (paso === 2) {
    if (form.tipoSilo === 'Chapa') {
      if (form.diametroM !== '' && !(Number(form.diametroM) > 0)) return 'El diámetro debe ser mayor a cero.';
      if (form.alturaM !== '' && !(Number(form.alturaM) > 0)) return 'La altura debe ser mayor a cero.';
    } else {
      if (!(Number(form.largoM) > 0)) return 'El largo del bolsón es obligatorio y debe ser mayor a cero.';
      if (!form.diametroBolsonPies) return 'Elegí el diámetro del bolsón.';
      if (!form.fechaEmbolsado) return 'La fecha de embolsado es obligatoria.';
      if (form.fechaEmbolsado > todayIso()) return 'La fecha de embolsado no puede ser posterior a hoy.';
      if (form.fechaVencimientoEstimada && form.fechaVencimientoEstimada < form.fechaEmbolsado) {
        return 'El vencimiento estimado no puede ser anterior al embolsado.';
      }
    }
  }

  if (paso === 3) {
    if (!form.loteId && !(String(form.provincia || '').trim() && String(form.ciudad || '').trim())) {
      return 'Elegí un lote o completá provincia y ciudad.';
    }
    if (lote && form.latitud !== '' && form.longitud !== ''
      && !puntoDentroDelLote(Number(form.latitud), Number(form.longitud), lote.coordenadas)) {
      return `El punto del silo tiene que estar dentro del lote ${lote.nombre}.`;
    }
  }

  if (paso === 4 && isCreate) {
    const cantidad = Number(form.cantidadGranoAlmacenado) || 0;
    if (cantidad < 0) return 'La cantidad de grano no puede ser negativa.';
    if (cantidad > 0) {
      const grano = form.grano === 'Otro' ? form.granoOtro : form.grano;
      if (!String(grano || '').trim()) return 'Indicá qué grano tiene el silo.';
      if (cantidad > Number(form.capacidadMax)) return 'El grano inicial no puede superar la capacidad máxima.';
    }
  }

  return null;
}

// Mapa satelital para marcar el punto del silo. Si hay lote, muestra su poligono.
function SiloPointMap({ lote, latitud, longitud, readOnly = false, onChange }) {
  const nodoRef = useRef(null);
  const mapaRef = useRef(null);
  const capaRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!nodoRef.current || mapaRef.current) return undefined;

    const mapa = L.map(nodoRef.current, { center: CENTRO_ARGENTINA, zoom: 5, minZoom: 4, maxZoom: 19 });
    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 17, attribution: 'Tiles © Esri' });
    satelite.addTo(mapa);
    L.control.layers({ 'Satélite': satelite, 'Calles y límites': calles }, {}, { position: 'topright' }).addTo(mapa);

    capaRef.current = L.layerGroup().addTo(mapa);
    mapa.on('click', (evento) => {
      if (readOnly) return;
      onChangeRef.current?.(
        Number(evento.latlng.lat.toFixed(6)),
        Number(evento.latlng.lng.toFixed(6))
      );
    });

    mapaRef.current = mapa;
    // El contenedor puede montarse oculto o con animacion: recalcular tamaño.
    setTimeout(() => mapa.invalidateSize(), 150);

    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
  }, [readOnly]);

  // Poligono del lote: al cambiar de lote, se encuadra.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    const esquinas = [...(lote?.coordenadas ?? [])].sort((a, b) => a.orden - b.orden).map((c) => [c.latitud, c.longitud]);
    if (esquinas.length >= 3) {
      mapa.fitBounds(L.latLngBounds(esquinas), { padding: [24, 24], maxZoom: 17 });
    } else if (latitud !== '' && longitud !== '' && latitud != null) {
      mapa.setView([Number(latitud), Number(longitud)], 16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote?.loteId]);

  // Dibuja poligono y punto del silo.
  useEffect(() => {
    const capa = capaRef.current;
    if (!capa) return;
    capa.clearLayers();

    const esquinas = [...(lote?.coordenadas ?? [])].sort((a, b) => a.orden - b.orden).map((c) => [c.latitud, c.longitud]);
    if (esquinas.length >= 3) {
      L.polygon(esquinas, { color: '#df3b30', weight: 2, fillColor: '#1c8c3a', fillOpacity: 0.18 }).addTo(capa);
    }

    if (latitud !== '' && longitud !== '' && latitud != null && longitud != null) {
      L.marker([Number(latitud), Number(longitud)], {
        icon: L.divIcon({ className: 'silo-pin', html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 26] })
      }).addTo(capa);
    }
  }, [lote, latitud, longitud]);

  return <div ref={nodoRef} className="silo-map" role="application" aria-label="Mapa para ubicar el silo" />;
}

function SiloStepper({ paso, maximo, onIr }) {
  return (
    <ol className="silo-stepper">
      {PASOS_WIZARD.map((nombre, indice) => {
        const numero = indice + 1;
        const estado = numero < paso ? 'hecho' : numero === paso ? 'actual' : 'pendiente';
        const navegable = numero <= maximo && numero !== paso;
        return (
          <li key={nombre} className={`silo-step silo-step-${estado}`}>
            <button type="button" disabled={!navegable} onClick={() => onIr(numero)} aria-current={numero === paso ? 'step' : undefined}>
              <span className="silo-step-num">{estado === 'hecho' ? '✓' : numero}</span>
              <span className="silo-step-label">{nombre}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function SiloWizard({ mode, form, silo, lotes = [], empresaNombre = '', saving, error, onFieldChange, onCancel, onSubmit }) {
  const isCreate = mode === 'create';
  const [paso, setPaso] = useState(1);
  const [maximo, setMaximo] = useState(isCreate ? 1 : 4);
  const [errorPaso, setErrorPaso] = useState('');
  const [availableZones, setAvailableZones] = useState([]);

  const lote = form.loteId ? lotes.find((l) => String(l.loteId) === String(form.loteId)) : null;
  const stockActual = Number(silo?.cantidadGranoAlmacenado) || 0;
  const ubicacionManual = !lote;

  // Localidades de la provincia (misma fuente que antes: Georef, con respaldo local).
  useEffect(() => {
    if (!ubicacionManual || !form.provincia) {
      setAvailableZones([]);
      return undefined;
    }
    let ignore = false;
    async function loadZones() {
      try {
        const params = new URLSearchParams({ provincia: form.provincia, campos: 'nombre', max: '5000', orden: 'nombre' });
        const response = await fetch(`${GEOREF_API_BASE_URL}/localidades?${params.toString()}`);
        if (!response.ok) throw new Error('Georef no disponible');
        const data = await response.json();
        const names = [...new Set((data.localidades ?? []).map((zone) => zone.nombre).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'es'));
        if (names.length === 0) throw new Error('Sin localidades');
        if (!ignore) setAvailableZones(names);
      } catch {
        if (!ignore) setAvailableZones(ARGENTINA_ZONES[form.provincia] ?? []);
      }
    }
    loadZones();
    return () => { ignore = true; };
  }, [form.provincia, ubicacionManual]);

  // Apenas se corrige un dato, el mensaje de error del paso deja de mostrarse.
  function cambiar(campo, valor) {
    setErrorPaso('');
    onFieldChange(campo, valor);
  }

  function irA(numero) {
    setErrorPaso('');
    setPaso(numero);
  }

  function siguiente() {
    const mensaje = validarPasoSilo(paso, form, { isCreate, lote, stockActual });
    if (mensaje) {
      setErrorPaso(mensaje);
      return;
    }
    setErrorPaso('');
    const proximo = Math.min(4, paso + 1);
    setPaso(proximo);
    setMaximo((actual) => Math.max(actual, proximo));
  }

  function enviar(event) {
    event.preventDefault();
    if (paso < 4) {
      siguiente();
      return;
    }
    for (let numero = 1; numero <= 4; numero += 1) {
      const mensaje = validarPasoSilo(numero, form, { isCreate, lote, stockActual });
      if (mensaje) {
        setErrorPaso(mensaje);
        setPaso(numero);
        return;
      }
    }
    setErrorPaso('');
    onSubmit(event);
  }

  const cantidadInicial = Number(form.cantidadGranoAlmacenado) || 0;
  const granoElegido = form.grano === 'Otro' ? form.granoOtro : form.grano;
  const ocupacionPreview = Number(form.capacidadMax) > 0
    ? Math.min(100, ((isCreate ? cantidadInicial : stockActual) / Number(form.capacidadMax)) * 100)
    : 0;

  const fila = (etiqueta, valor) => (
    <div><dt>{etiqueta}</dt><dd>{valor || '-'}</dd></div>
  );

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{isCreate ? 'Registrar silo' : `Editar ${silo?.nombre ?? 'silo'}`}</h1>
          <p>{isCreate ? 'Cuatro pasos. Cada paso se valida antes de avanzar.' : 'Modificá los datos del silo. El grano lo mantiene Almacenamiento.'}</p>
        </div>
      </div>

      <div className="silo-context">
        <Warehouse size={18} />
        <span>{isCreate ? 'Registrando en' : 'Empresa'}</span>
        <strong>{empresaNombre || 'Empresa seleccionada'}</strong>
        <small>Para cambiar de empresa, volvé al listado.</small>
      </div>

      <div className="dashboard-card silo-wizard-card">
        <SiloStepper paso={paso} maximo={maximo} onIr={irA} />
      </div>

      {(errorPaso || error) && <p className="silo-form-error" role="alert">{errorPaso || error}</p>}

      <form onSubmit={enviar} noValidate>
        <div className="silo-wizard-layout">
          <div className="dashboard-card silo-wizard-card">
            {paso === 1 && (
              <>
                <h2>Datos generales</h2>
                <div className="silo-type-grid" role="radiogroup" aria-label="Tipo de silo">
                  {[
                    { valor: 'Chapa', titulo: 'Silo de chapa', ayuda: 'Estructura fija, conservación prolongada' },
                    { valor: 'Bolson', titulo: 'Silo bolsa (bolsón)', ayuda: 'Armado en el lote, uso temporal' }
                  ].map((opcion) => (
                    <button
                      key={opcion.valor}
                      type="button"
                      role="radio"
                      aria-checked={form.tipoSilo === opcion.valor}
                      className={`silo-type-option ${form.tipoSilo === opcion.valor ? 'selected' : ''}`}
                      onClick={() => cambiar('tipoSilo', opcion.valor)}
                    >
                      <Warehouse size={26} />
                      <span><strong>{opcion.titulo}</strong><small>{opcion.ayuda}</small></span>
                    </button>
                  ))}
                </div>
                <div className="create-grid">
                  <label className="field">
                    Código
                    <input value={isCreate ? 'Se asigna al registrar' : (silo?.codigo || '-')} readOnly disabled />
                  </label>
                  <label className="field">
                    <span className="field-label">Nombre <b>*</b></span>
                    <input value={form.nombre} maxLength={100} onChange={(e) => cambiar('nombre', e.target.value)} />
                    <small className="silo-hint">Único dentro de la empresa.</small>
                  </label>
                  <label className="field">
                    <span className="field-label">Capacidad máxima (kg) <b>*</b></span>
                    <input type="number" min="0" step="any" value={form.capacidadMax} onChange={(e) => cambiar('capacidadMax', e.target.value)} />
                    {!isCreate && stockActual > 0 && <small className="silo-hint">No puede ser menor a {formatKg(stockActual)} (grano actual).</small>}
                  </label>
                </div>
              </>
            )}

            {paso === 2 && (
              <>
                <h2>{form.tipoSilo === 'Bolson' ? 'Características del bolsón' : 'Características del silo de chapa'}</h2>
                {form.tipoSilo === 'Chapa' ? (
                  <div className="create-grid">
                    <label className="field">
                      Diámetro (m)
                      <input type="number" min="0" step="0.01" value={form.diametroM} onChange={(e) => cambiar('diametroM', e.target.value)} placeholder="Opcional" />
                    </label>
                    <label className="field">
                      Altura (m)
                      <input type="number" min="0" step="0.01" value={form.alturaM} onChange={(e) => cambiar('alturaM', e.target.value)} placeholder="Opcional" />
                    </label>
                    <label className="field">
                      Aireación
                      <select value={form.tieneAireacion} onChange={(e) => cambiar('tieneAireacion', e.target.value)}>
                        <option value="">Sin dato</option>
                        <option value="Si">Sí</option>
                        <option value="No">No</option>
                      </select>
                    </label>
                    <label className="field">
                      Termometría
                      <select value={form.tieneTermometria} onChange={(e) => cambiar('tieneTermometria', e.target.value)}>
                        <option value="">Sin dato</option>
                        <option value="Si">Sí</option>
                        <option value="No">No</option>
                      </select>
                    </label>
                  </div>
                ) : (
                  <div className="create-grid">
                    <label className="field">
                      <span className="field-label">Largo (m) <b>*</b></span>
                      <input type="number" min="0" step="0.1" value={form.largoM} onChange={(e) => cambiar('largoM', e.target.value)} />
                    </label>
                    <label className="field">
                      <span className="field-label">Diámetro <b>*</b></span>
                      <select value={form.diametroBolsonPies} onChange={(e) => cambiar('diametroBolsonPies', e.target.value)}>
                        <option value="">Seleccionar</option>
                        {DIAMETROS_BOLSON_PIES.map((d) => <option key={d} value={d}>{d} pies</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">Fecha de embolsado <b>*</b></span>
                      <input type="date" max={todayIso()} value={form.fechaEmbolsado} onChange={(e) => cambiar('fechaEmbolsado', e.target.value)} />
                    </label>
                    <label className="field">
                      Vencimiento estimado
                      <input type="date" min={form.fechaEmbolsado || undefined} value={form.fechaVencimientoEstimada} onChange={(e) => cambiar('fechaVencimientoEstimada', e.target.value)} />
                      <small className="silo-hint">Según el fabricante. Al acercarse, el silo muestra alerta.</small>
                    </label>
                    <label className="field field-wide">
                      Identificación en el lote
                      <input maxLength={120} value={form.identificacionEnLote} onChange={(e) => cambiar('identificacionEnLote', e.target.value)} placeholder="Ej.: cabecera norte (opcional)" />
                    </label>
                  </div>
                )}
              </>
            )}

            {paso === 3 && (
              <>
                <h2>Ubicación</h2>
                <div className="create-grid">
                  <label className="field">
                    ¿Está en un lote?
                    <select value={form.loteId ?? ''} onChange={(e) => cambiar('loteId', e.target.value)}>
                      <option value="">No, planta de acopio u otro lugar</option>
                      {lotes.map((l) => <option key={l.loteId} value={l.loteId}>{l.nombre}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Provincia {ubicacionManual && <b>*</b>}</span>
                    <select value={form.provincia} disabled={!ubicacionManual} onChange={(e) => cambiar('provincia', e.target.value)}>
                      <option value="">Seleccionar</option>
                      {(ubicacionManual ? PROVINCIAS : [form.provincia].filter(Boolean)).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Ciudad {ubicacionManual && <b>*</b>}</span>
                    <select value={form.ciudad} disabled={!ubicacionManual} onChange={(e) => cambiar('ciudad', e.target.value)}>
                      <option value="">Seleccionar</option>
                      {(ubicacionManual ? availableZones : [form.ciudad].filter(Boolean)).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                </div>
                <div className="silo-map-heading">
                  <div>
                    <strong>Punto del silo</strong>
                    <small>{lote ? `Tocá el mapa para ubicarlo dentro de ${lote.nombre}.` : 'Opcional: tocá el mapa para marcar dónde está.'}</small>
                  </div>
                  {form.latitud !== '' && (
                    <button type="button" className="back-button" onClick={() => { cambiar('latitud', ''); cambiar('longitud', ''); }}>
                      Quitar punto
                    </button>
                  )}
                </div>
                <SiloPointMap
                  lote={lote}
                  latitud={form.latitud}
                  longitud={form.longitud}
                  onChange={(lat, lng) => { cambiar('latitud', lat); cambiar('longitud', lng); }}
                />
                {form.latitud !== '' && (
                  <p className="silo-hint">Latitud {form.latitud} · Longitud {form.longitud}</p>
                )}
              </>
            )}

            {paso === 4 && (
              <>
                <h2>{isCreate ? 'Grano inicial' : 'Grano del silo'}</h2>
                {isCreate ? (
                  <>
                    <p className="silo-hint">Solo si el silo ya tiene grano al registrarlo. Se carga como un ingreso en Almacenamiento.</p>
                    <div className="create-grid">
                      <label className="field">
                        Cantidad de grano (kg)
                        <input type="number" min="0" step="any" value={form.cantidadGranoAlmacenado} onChange={(e) => cambiar('cantidadGranoAlmacenado', e.target.value)} placeholder="Vacío si arranca sin grano" />
                      </label>
                      <label className="field">
                        <span className="field-label">Grano {cantidadInicial > 0 && <b>*</b>}</span>
                        <select value={form.grano} disabled={cantidadInicial <= 0} onChange={(e) => cambiar('grano', e.target.value)}>
                          <option value="">Seleccionar</option>
                          {GRANOS_SILO.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </label>
                      {form.grano === 'Otro' && cantidadInicial > 0 && (
                        <label className="field">
                          <span className="field-label">Otro grano <b>*</b></span>
                          <input maxLength={10} value={form.granoOtro} onChange={(e) => cambiar('granoOtro', e.target.value.slice(0, 10))} placeholder="Máx. 10 caracteres" />
                        </label>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="silo-hint">
                    {stockActual > 0
                      ? `Tiene ${formatKg(stockActual)} de ${silo?.producto || 'grano sin indicar'}. El grano cambia con los movimientos de Almacenamiento.`
                      : 'Está vacío. El grano se carga con un ingreso en Almacenamiento.'}
                  </p>
                )}

                <h2 style={{ marginTop: 22 }}>Revisión</h2>
                <dl className="silo-kv">
                  {fila('Nombre', form.nombre)}
                  {fila('Tipo', form.tipoSilo === 'Bolson' ? 'Bolsón' : 'Chapa')}
                  {fila('Capacidad', formatKg(form.capacidadMax))}
                  {form.tipoSilo === 'Chapa'
                    ? fila('Dimensiones', [form.diametroM && `Ø ${form.diametroM} m`, form.alturaM && `${form.alturaM} m de alto`].filter(Boolean).join(' · '))
                    : fila('Bolsón', [form.largoM && `${form.largoM} m`, form.diametroBolsonPies && `${form.diametroBolsonPies} pies`, form.fechaEmbolsado && `embolsado ${formatFecha(form.fechaEmbolsado)}`].filter(Boolean).join(' · '))}
                  {fila('Ubicación', lote ? lote.nombre : [form.ciudad, form.provincia].filter(Boolean).join(', '))}
                  {fila('Punto en el mapa', form.latitud !== '' ? 'Marcado' : 'Sin marcar')}
                  {isCreate && fila('Grano inicial', cantidadInicial > 0 ? `${formatKg(cantidadInicial)} de ${granoElegido}` : 'Arranca vacío')}
                </dl>
              </>
            )}
          </div>

          <aside className="dashboard-card silo-wizard-card silo-wizard-side">
            <h2>Así queda</h2>
            <div className="silo-side-glyph">
              <SiloGlyph tipo={form.tipoSilo} porcentaje={ocupacionPreview} />
              <div>
                <strong>{formatoPorcentaje(ocupacionPreview)}</strong>
                <span>{formatKg(isCreate ? cantidadInicial : stockActual)} de {formatKg(form.capacidadMax)}</span>
              </div>
            </div>
            <p className="silo-hint">{form.nombre || 'Sin nombre'} · {form.tipoSilo === 'Bolson' ? 'Bolsón' : 'Chapa'}</p>
          </aside>
        </div>

        <div className="form-actions silo-wizard-actions">
          <button className="back-button" type="button" onClick={onCancel}>Cancelar</button>
          <div>
            {paso > 1 && <button className="back-button" type="button" onClick={() => irA(paso - 1)}>Anterior</button>}
            {paso < 4 ? (
              <button className="green-button" type="submit">Siguiente: {PASOS_WIZARD[paso]}</button>
            ) : (
              <button className="green-button" type="submit" disabled={saving}>
                {saving ? 'Guardando...' : isCreate ? 'Registrar silo' : 'Guardar cambios'}
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}

// ===========================================================================
// Ficha del silo (rediseno, paso 3): Resumen, Movimientos y Controles.
// Reemplaza al detalle simple. Datos de GET /api/silos/{id}/ficha.
// ===========================================================================

const RESULTADO_CONTROL = {
  Normal: { texto: 'Normal', tono: 'verde' },
  Atencion: { texto: 'Atención', tono: 'ambar' },
  Critico: { texto: 'Crítico', tono: 'rojo' }
};

const ORIGEN_MOVIMIENTO = { Manual: 'Manual', AltaSilo: 'Alta de silo', Distribucion: 'Distribución', Transferencia: 'Transferencia' };

function fechaCorta(valor) {
  const [anio, mes, dia] = String(valor ?? '').slice(0, 10).split('-');
  return dia && mes ? `${dia}/${mes}` : '';
}

// Medidor circular de ocupacion.
function OcupacionGauge({ porcentaje, kg, capacidad }) {
  const pct = Math.max(0, Math.min(100, Number(porcentaje) || 0));
  const radio = 80;
  const circunferencia = 2 * Math.PI * radio;
  const lleno = pct > 0 ? Math.max((circunferencia * pct) / 100, 6) : 0;
  return (
    <svg className="silo-gauge" viewBox="0 0 200 200" role="img" aria-label={`Ocupación ${formatoPorcentaje(pct)}`}>
      <circle cx="100" cy="100" r={radio} fill="none" stroke="#e6eee8" strokeWidth="16" />
      {lleno > 0 && (
        <circle
          cx="100" cy="100" r={radio} fill="none" stroke={colorOcupacion(pct)} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${lleno} ${circunferencia}`} transform="rotate(-90 100 100)"
        />
      )}
      <text x="100" y="98" textAnchor="middle" className="silo-gauge-pct">{formatoPorcentaje(pct)}</text>
      <text x="100" y="124" textAnchor="middle" className="silo-gauge-sub">{Number(kg ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })} / {formatKg(capacidad)}</text>
    </svg>
  );
}

// Grafico de lineas simple en SVG (sin librerias). puntos: [{ etiqueta, valor }].
function LineaChart({ titulo, unidad, series, referencia = null, alto = 200 }) {
  const ancho = 640;
  const margen = { izq: 46, der: 16, arr: 16, aba: 30 };
  // En kilos, el eje usa toneladas para que las etiquetas sean cortas (360.000 kg -> 360 t).
  const enKg = unidad.trim() === 'kg';
  const todos = series.flatMap((serie) => serie.puntos.map((p) => p.valor));
  if (referencia) todos.push(referencia.valor);
  if (todos.length === 0 || series.every((serie) => serie.puntos.length === 0)) {
    return <p className="silo-hint">Todavía no hay datos para graficar.</p>;
  }

  let minimo = Math.min(...todos);
  let maximo = Math.max(...todos);
  if (minimo === maximo) { minimo -= 1; maximo += 1; }
  const holgura = (maximo - minimo) * 0.12;
  minimo -= holgura;
  maximo += holgura;

  const cantidad = Math.max(...series.map((serie) => serie.puntos.length));
  const x = (i) => margen.izq + (cantidad === 1 ? (ancho - margen.izq - margen.der) / 2 : (i * (ancho - margen.izq - margen.der)) / (cantidad - 1));
  const y = (v) => margen.arr + ((maximo - v) * (alto - margen.arr - margen.aba)) / (maximo - minimo);
  const etiquetas = series[0].puntos.map((p) => p.etiqueta);
  const paso = Math.max(1, Math.ceil(etiquetas.length / 8));
  const marcas = [minimo + holgura, (minimo + maximo) / 2, maximo - holgura];
  const numero = (v) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 1 });
  const etiquetaEje = (v) => (enKg && Math.abs(maximo) >= 10000
    ? `${(v / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} t`
    : `${numero(v)}${unidad}`);
  // El margen izquierdo se adapta al largo de la etiqueta mas larga del eje.
  margen.izq = Math.max(46, Math.max(...marcas.map((v) => etiquetaEje(v).length)) * 6.6 + 12);

  return (
    <figure className="silo-chart">
      <figcaption>
        <strong>{titulo}</strong>
        <span className="silo-chart-legend">
          {series.map((serie) => <span key={serie.nombre}><i style={{ background: serie.color }} />{serie.nombre}</span>)}
          {referencia && <span><i className="silo-chart-ref" />{referencia.etiqueta}</span>}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={titulo}>
        {marcas.map((v) => (
          <g key={v}>
            <line x1={margen.izq} x2={ancho - margen.der} y1={y(v)} y2={y(v)} stroke="#e8f0ea" />
            <text x={margen.izq - 6} y={y(v) + 4} textAnchor="end" className="silo-chart-axis">{etiquetaEje(v)}</text>
          </g>
        ))}
        {referencia && (
          <line x1={margen.izq} x2={ancho - margen.der} y1={y(referencia.valor)} y2={y(referencia.valor)} stroke="#c0392b" strokeDasharray="6 5" strokeWidth="1.5" />
        )}
        {series.map((serie) => (
          <g key={serie.nombre}>
            <polyline
              fill="none" stroke={serie.color} strokeWidth="2.5" strokeLinejoin="round"
              points={serie.puntos.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ')}
            />
            {serie.puntos.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p.valor)} r="4" fill={serie.color}>
                <title>{`${p.etiqueta}: ${numero(p.valor)}${unidad}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {etiquetas.map((etiqueta, i) => (i % paso === 0 || i === etiquetas.length - 1) && (
          <text key={i} x={x(i)} y={alto - 8} textAnchor="middle" className="silo-chart-axis">{etiqueta}</text>
        ))}
      </svg>
    </figure>
  );
}

// Grafico combinado de humedad y temperatura (Resumen de la ficha). Cada linea usa su
// propia escala porque las unidades son distintas: la humedad se dibuja en la franja de
// arriba y la temperatura en la de abajo, asi no se cruzan y las etiquetas no se pisan.
function EvolucionControlesChart({ controles, umbral = null, grano = '' }) {
  const ancho = 640;
  const alto = 260;
  const margen = { izq: 34, der: 34, arr: 26, aba: 34 };
  if (!controles.length) return <p className="silo-hint">Todavía no hay controles registrados.</p>;

  const escala = (valores, extra = []) => {
    let minimo = Math.min(...valores, ...extra);
    let maximo = Math.max(...valores, ...extra);
    if (minimo === maximo) { minimo -= 1; maximo += 1; }
    const holgura = (maximo - minimo) * 0.25;
    return { minimo: minimo - holgura, maximo: maximo + holgura };
  };
  const humedades = controles.map((c) => Number(c.humedadGrano));
  const temperaturas = controles.map((c) => Number(c.temperatura));
  const eh = escala(humedades, umbral != null ? [umbral] : []);
  const et = escala(temperaturas);
  const x = (i) => margen.izq + (controles.length === 1 ? (ancho - margen.izq - margen.der) / 2 : (i * (ancho - margen.izq - margen.der)) / (controles.length - 1));
  const altoUtil = alto - margen.arr - margen.aba;
  const franjaHumedad = { desde: margen.arr + 8, hasta: margen.arr + altoUtil * 0.46 };
  const franjaTemperatura = { desde: margen.arr + altoUtil * 0.6, hasta: margen.arr + altoUtil - 12 };
  eh.franja = franjaHumedad;
  et.franja = franjaTemperatura;
  const y = (v, e) => e.franja.desde + ((e.maximo - v) * (e.franja.hasta - e.franja.desde)) / (e.maximo - e.minimo);
  const numero = (v) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const paso = Math.max(1, Math.ceil(controles.length / 8));

  return (
    <figure className="silo-chart">
      <figcaption>
        <span />
        <span className="silo-chart-legend">
          <span><i style={{ background: '#18883b' }} />Humedad</span>
          <span><i style={{ background: '#b25e09' }} />Temperatura</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Evolución de humedad y temperatura de los controles">
        <line x1={margen.izq} x2={ancho - margen.der} y1={alto - margen.aba} y2={alto - margen.aba} stroke="#e8f0ea" />
        {umbral != null && (
          <g>
            <line x1={margen.izq} x2={ancho - margen.der} y1={y(umbral, eh)} y2={y(umbral, eh)} stroke="#c0392b" strokeDasharray="6 5" strokeWidth="1.3" />
            <text x={margen.izq} y={y(umbral, eh) - 6} textAnchor="start" className="silo-chart-ref-label">
              Umbral {grano ? `${grano.toLowerCase()} ` : ''}{numero(umbral)} %
            </text>
          </g>
        )}
        <polyline fill="none" stroke="#18883b" strokeWidth="2.5" strokeLinejoin="round" points={controles.map((c, i) => `${x(i)},${y(Number(c.humedadGrano), eh)}`).join(' ')} />
        <polyline fill="none" stroke="#b25e09" strokeWidth="2.5" strokeLinejoin="round" points={controles.map((c, i) => `${x(i)},${y(Number(c.temperatura), et)}`).join(' ')} />
        {controles.map((c, i) => (
          <g key={c.siloControlId}>
            <circle cx={x(i)} cy={y(Number(c.humedadGrano), eh)} r="4.5" fill="#18883b" />
            <text x={x(i)} y={y(Number(c.humedadGrano), eh) - 10} textAnchor="middle" className="silo-chart-point silo-chart-point-hum">{numero(c.humedadGrano)} %</text>
            <circle cx={x(i)} cy={y(Number(c.temperatura), et)} r="4.5" fill="#b25e09" />
            <text x={x(i)} y={y(Number(c.temperatura), et) + 18} textAnchor="middle" className="silo-chart-point silo-chart-point-temp">{Number(c.temperatura).toLocaleString('es-AR')} °C</text>
            {(i % paso === 0 || i === controles.length - 1) && (
              <text x={x(i)} y={alto - 10} textAnchor="middle" className="silo-chart-axis">{fechaCorta(c.fecha)}</text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}

function codigoPartida(id) {
  return `P - ${String(id).padStart(4, '0')}`;
}

function SiloFicha({ silo, lotes = [], authHeaders, version = 0, error, cambiandoEstado, onVolver, onEditar, onControles, onCambiarEstado }) {
  const [tab, setTab] = useState('resumen');
  const [ficha, setFicha] = useState(null);
  const [parametro, setParametro] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [confirmar, setConfirmar] = useState(null);

  useEffect(() => {
    if (!silo?.siloId) return undefined;
    let ignorar = false;
    async function cargar() {
      setCargando(true);
      setErrorCarga('');
      try {
        const response = await fetch(`${API_BASE_URL}/api/silos/${silo.siloId}/ficha`, { headers: authHeaders() });
        if (!response.ok) throw new Error(await response.text() || `API ${response.status}`);
        const datos = await response.json();
        if (ignorar) return;
        setFicha(datos);

        // Umbral del ingeniero para el grano y tipo del silo (si existe), para los graficos.
        if (datos.silo?.empresaId && datos.silo?.producto) {
          const params = await fetch(`${API_BASE_URL}/api/grano-parametros?empresaId=${datos.silo.empresaId}`, { headers: authHeaders() });
          if (params.ok) {
            const lista = await params.json();
            const encontrado = lista.find((p) => p.tipoSilo === datos.silo.tipoSilo && mismoGrano(p.producto, datos.silo.producto));
            if (!ignorar) setParametro(encontrado ?? null);
          }
        } else if (!ignorar) {
          setParametro(null);
        }
      } catch (err) {
        if (!ignorar) setErrorCarga(`No se pudo cargar la ficha: ${err.message}`);
      } finally {
        if (!ignorar) setCargando(false);
      }
    }
    cargar();
    return () => { ignorar = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silo?.siloId, version]);

  async function descargar(documento) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/silos/${silo.siloId}/controles/${documento.siloControlId}/documentos/${documento.siloDocumentoId}/descargar`,
        { headers: authHeaders() }
      );
      if (!response.ok) throw new Error(await response.text() || `API ${response.status}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = documento.nombreArchivo;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorCarga(`No se pudo descargar el archivo: ${err.message}`);
    }
  }

  if (!silo) return null;

  const datos = ficha?.silo ?? silo;
  const lote = datos.loteId ? lotes.find((l) => String(l.loteId) === String(datos.loteId)) : null;
  const tieneGrano = Number(datos.cantidadGranoAlmacenado) > 0;
  const estado = datos.estadoOperativo;
  const partidas = ficha?.partidas ?? [];
  const controles = ficha?.controles ?? [];
  const movimientos = ficha?.movimientos ?? [];
  const documentos = ficha?.documentos ?? [];
  const alertas = alertasDeSilo(datos);
  const umbral = parametro ? Number(parametro.umbralHumedad) : null;
  const fila = (etiqueta, valor) => <div><dt>{etiqueta}</dt><dd>{valor || '-'}</dd></div>;
  const kgPartidas = partidas.reduce((total, p) => total + Number(p.kgRestantes || 0), 0);
  const ubicacion = [datos.loteNombre, lote?.ciudad ?? (!datos.loteNombre ? [datos.ciudad, datos.provincia].filter(Boolean).join(', ') : null)].filter(Boolean).join(' · ');
  const proximoVencido = datos.fechaProximoControl && diasHasta(datos.fechaProximoControl) < 0;

  const acciones = {
    'En mantenimiento': { titulo: 'Poner en mantenimiento', texto: 'El silo no va a poder recibir grano hasta que lo reactives.' },
    'Dado de baja': { titulo: 'Dar de baja', texto: 'El silo deja de estar operativo. Se conserva su historial.' },
    Activo: { titulo: 'Reactivar', texto: 'El silo vuelve a quedar Vacío o Con grano según su stock.' }
  };

  const movimientosCrono = [...movimientos].sort((a, b) => (String(a.fecha).localeCompare(String(b.fecha))) || a.almacenamientoId - b.almacenamientoId);
  const serieStock = movimientosCrono.map((m) => ({ etiqueta: fechaCorta(m.fecha), valor: Number(m.stockResultante) }));
  const serieHumedad = controles.map((c) => ({ etiqueta: fechaCorta(c.fecha), valor: Number(c.humedadGrano) }));
  const serieTemperatura = controles.map((c) => ({ etiqueta: fechaCorta(c.fecha), valor: Number(c.temperatura) }));

  const pestanias = [
    { id: 'resumen', texto: 'Resumen' },
    { id: 'movimientos', texto: `Movimientos (${movimientos.length})` },
    { id: 'controles', texto: `Controles (${controles.length})` },
    { id: 'documentacion', texto: `Documentación (${documentos.length})` }
  ];

  const titulo = (Icono, texto) => <h2 className="silo-card-title"><Icono size={19} />{texto}</h2>;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <div className="silo-ficha-chips">
            {datos.codigo && <span className="silo-chip silo-chip-gris">{datos.codigo}</span>}
            <EstadoSiloChip estado={estado} />
            {alertas[0] && <span className={`silo-chip silo-chip-${alertas[0].tono}`}>{alertas[0].texto}</span>}
          </div>
          <h1>{datos.nombre}</h1>
          <p>{[datos.tipoSilo === 'Bolson' ? 'Bolsón' : 'Silo de chapa', ubicacion].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="silo-ficha-acciones">
          <button className="back-button" type="button" onClick={onEditar}><Edit size={17} /> Editar</button>
          <button className="green-button" type="button" onClick={onControles}><ClipboardControlIcon /> Controles</button>
        </div>
      </div>

      {(error || errorCarga) && <p className="silo-form-error" role="alert">{error || errorCarga}</p>}

      <div className="silo-tabs" role="tablist" aria-label="Secciones de la ficha">
        {pestanias.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={tab === p.id} className={tab === p.id ? 'active' : ''} onClick={() => setTab(p.id)}>
            {p.texto}
          </button>
        ))}
      </div>

      {cargando && !ficha ? (
        <div className="table-shell dashboard-card">
          <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Cargando ficha...</span></div>
        </div>
      ) : tab === 'resumen' ? (
        <div className="silo-ficha-grid">
          <div className="silo-ficha-col">
            <div className="dashboard-card silo-wizard-card">
              {titulo(Warehouse, 'Ocupación')}
              <OcupacionGauge porcentaje={datos.nivelOcupacionPorcentaje} kg={datos.cantidadGranoAlmacenado} capacidad={datos.capacidadMax} />
              <dl className="silo-kv">
                {fila('Capacidad libre', formatKg(ficha?.capacidadLibre ?? Math.max(0, datos.capacidadMax - datos.cantidadGranoAlmacenado)))}
              </dl>
            </div>

            <div className="dashboard-card silo-wizard-card">
              {titulo(FileText, 'Datos del silo')}
              <dl className="silo-kv">
                {fila('Tipo', datos.tipoSilo === 'Bolson' ? 'Bolsón' : 'Chapa')}
                {fila('Grano', tieneGrano ? (datos.producto || 'Grano sin indicar') : 'Vacío')}
                {datos.tipoSilo === 'Chapa' ? (
                  <>
                    {fila('Dimensiones', [datos.diametroM && `Ø ${Number(datos.diametroM).toLocaleString('es-AR')} m`, datos.alturaM && `${Number(datos.alturaM).toLocaleString('es-AR')} m alto`].filter(Boolean).join(' · '))}
                    {fila('Aireación · Termometría', `${siNoTexto(datos.tieneAireacion)} · ${siNoTexto(datos.tieneTermometria)}`)}
                  </>
                ) : (
                  <>
                    {fila('Largo · Diámetro', [datos.largoM && `${Number(datos.largoM).toLocaleString('es-AR')} m`, datos.diametroBolsonPies && `${Number(datos.diametroBolsonPies)} pies`].filter(Boolean).join(' · '))}
                    {fila('Embolsado', formatFecha(datos.fechaEmbolsado))}
                    {fila('Vencimiento estimado', formatFecha(datos.fechaVencimientoEstimada))}
                    {fila('Identificación', datos.identificacionEnLote)}
                  </>
                )}
                {fila('Ubicación', ubicacion)}
                <div>
                  <dt>Próximo control</dt>
                  <dd>
                    {datos.fechaProximoControl
                      ? <span className={`silo-chip silo-chip-${proximoVencido ? 'rojo' : 'verde'}`}>{formatFecha(datos.fechaProximoControl)}</span>
                      : 'Sin programar'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="dashboard-card silo-wizard-card">
              {titulo(Activity, 'Estado del silo')}
              <p className="silo-hint">Vacío y Con grano se actualizan solos con Almacenamiento. Mantenimiento y baja los decidís vos.</p>
              <div className="silo-estado-acciones">
                {estado !== 'En mantenimiento' && estado !== 'Dado de baja' && (
                  <button type="button" className="back-button" onClick={() => setConfirmar('En mantenimiento')}>Poner en mantenimiento</button>
                )}
                {estado !== 'Dado de baja' && (
                  <button type="button" className="back-button" disabled={tieneGrano} title={tieneGrano ? 'Vacialo con un egreso antes de darlo de baja' : undefined} onClick={() => setConfirmar('Dado de baja')}>
                    Dar de baja
                  </button>
                )}
                {(estado === 'En mantenimiento' || estado === 'Dado de baja') && (
                  <button type="button" className="green-button" onClick={() => setConfirmar('Activo')}>Reactivar</button>
                )}
                {tieneGrano && estado !== 'Dado de baja' && <small className="silo-hint">Para darlo de baja tiene que estar vacío.</small>}
              </div>
              {confirmar && (
                <div className="silo-confirm" role="alertdialog" aria-labelledby="silo-confirm-title">
                  <strong id="silo-confirm-title">{acciones[confirmar].titulo}</strong>
                  <p>{acciones[confirmar].texto}</p>
                  <div>
                    <button type="button" className="green-button" disabled={cambiandoEstado} onClick={async () => { await onCambiarEstado(confirmar); setConfirmar(null); }}>
                      {cambiandoEstado ? 'Guardando...' : 'Confirmar'}
                    </button>
                    <button type="button" className="back-button" onClick={() => setConfirmar(null)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="silo-ficha-col">
            <div className="dashboard-card silo-wizard-card">
              {titulo(Package, 'Partidas de grano almacenado')}
              {partidas.length === 0 ? (
                <p className="silo-hint">{tieneGrano ? 'El grano de este silo no tiene partidas registradas. Revisá el reporte del script 21.' : 'El silo está vacío.'}</p>
              ) : (
                <>
                  <p className="silo-lead">
                    Los egresos consumen primero la partida más antigua.
                    {datos.diasAntiguedadPromedio != null && <> Antigüedad promedio ponderada: <b>{datos.diasAntiguedadPromedio} días</b>.</>}
                  </p>
                  <div className="silo-table-scroll">
                    <table className="silo-mini-table">
                      <thead>
                        <tr><th>Partida</th><th>Cosecha</th><th>Lote · Campaña</th><th>Ingreso</th><th className="num">Kg restantes</th><th className="num">Días</th></tr>
                      </thead>
                      <tbody>
                        {partidas.map((p) => (
                          <tr key={p.partidaId}>
                            <td>{codigoPartida(p.partidaId)}</td>
                            <td>{p.cosechaNombre ? <span className="silo-chip silo-chip-verde">{p.cosechaNombre}</span> : <span className="silo-hint">Sin cosecha</span>}</td>
                            <td>{[p.loteNombre, p.campaniaNombre].filter(Boolean).join(' · ') || '-'}</td>
                            <td>{formatFecha(p.fechaIngreso)}</td>
                            <td className="num">{Number(p.kgRestantes).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                            <td className="num">{p.diasAlmacenado}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {Math.round(kgPartidas) !== Math.round(Number(datos.cantidadGranoAlmacenado)) && (
                    <p className="silo-warning">Las partidas suman {formatKg(kgPartidas)} y el silo tiene {formatKg(datos.cantidadGranoAlmacenado)}. Conviene revisar sus movimientos.</p>
                  )}
                </>
              )}
            </div>

            <div className="dashboard-card silo-wizard-card">
              {titulo(Thermometer, 'Evolución de controles')}
              <EvolucionControlesChart controles={controles} umbral={umbral} grano={datos.producto} />
            </div>

            {datos.latitud != null && (
              <div className="dashboard-card silo-wizard-card">
                {titulo(MapPin, 'Ubicación en el mapa')}
                <SiloPointMap lote={lote} latitud={datos.latitud} longitud={datos.longitud} readOnly />
              </div>
            )}
          </div>
        </div>
      ) : tab === 'movimientos' ? (
        <div className="dashboard-card silo-wizard-card">
          <LineaChart titulo="Stock del silo en el tiempo" unidad=" kg" series={[{ nombre: 'Stock', color: '#18883b', puntos: serieStock }]} />
          {movimientos.length === 0 ? (
            <p className="silo-hint">Este silo todavía no tiene movimientos. Los ingresos y egresos se registran en Almacenamiento.</p>
          ) : (
            <div className="silo-table-scroll" style={{ marginTop: 16 }}>
              <table className="silo-mini-table">
                <thead>
                  <tr><th>Fecha</th><th>Tipo</th><th>Origen</th><th>Grano</th><th className="num">Cantidad</th><th className="num">Stock después</th><th>Campaña · Cosecha</th></tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.almacenamientoId}>
                      <td>{formatFecha(m.fecha)}</td>
                      <td><span className={`silo-chip silo-chip-${m.tipoMovimiento === 'Ingreso' ? 'verde' : 'rojo'}`}>{m.tipoMovimiento}</span></td>
                      <td>{ORIGEN_MOVIMIENTO[m.origen] ?? m.origen}</td>
                      <td>{m.producto || m.siloProducto || '-'}</td>
                      <td className="num">{formatKg(m.cantidad)}</td>
                      <td className="num">{formatKg(m.stockResultante)}</td>
                      <td>{[m.campania, m.cosecha].filter(Boolean).join(' · ') || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === 'controles' ? (
        <div className="dashboard-card silo-wizard-card">
          {controles.length === 0 ? (
            <p className="silo-hint">Todavía no hay controles registrados para este silo.</p>
          ) : (
            <>
              <div className="silo-charts">
                <LineaChart
                  titulo="Humedad del grano"
                  unidad=" %"
                  series={[{ nombre: 'Humedad', color: '#18883b', puntos: serieHumedad }]}
                  referencia={umbral != null ? { valor: umbral, etiqueta: `Umbral ${umbral.toLocaleString('es-AR')} %` } : null}
                />
                <LineaChart
                  titulo="Temperatura"
                  unidad=" °C"
                  series={[{ nombre: 'Temperatura', color: '#b25e09', puntos: serieTemperatura }]}
                />
              </div>
              {!parametro && datos.producto && (
                <p className="silo-hint">No hay parámetros cargados para {datos.producto} en silos de {datos.tipoSilo === 'Bolson' ? 'bolsón' : 'chapa'}: el gráfico no muestra umbral.</p>
              )}
              <div className="silo-table-scroll" style={{ marginTop: 16 }}>
                <table className="silo-mini-table">
                  <thead>
                    <tr><th>Fecha</th><th className="num">Humedad</th><th className="num">Temperatura</th><th>Estado del grano</th><th>Resultado</th></tr>
                  </thead>
                  <tbody>
                    {[...controles].reverse().map((c) => {
                      const resultado = RESULTADO_CONTROL[c.resultado];
                      return (
                        <tr key={c.siloControlId}>
                          <td>{formatFecha(c.fecha)}</td>
                          <td className="num">{Number(c.humedadGrano).toLocaleString('es-AR')} %</td>
                          <td className="num">{Number(c.temperatura).toLocaleString('es-AR')} °C</td>
                          <td>{c.estadoGrano}</td>
                          <td>{resultado ? <span className={`silo-chip silo-chip-${resultado.tono}`}>{resultado.texto}</span> : <span className="silo-hint">Sin evaluar</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="green-button" type="button" onClick={onControles}>Ver historial y registrar control</button>
          </div>
        </div>
      ) : (
        <div className="dashboard-card silo-wizard-card">
          {titulo(FileText, 'Documentación')}
          <p className="silo-hint">Archivos cargados en los controles del silo. Para agregar uno, abrí el control desde el historial.</p>
          {documentos.length === 0 ? (
            <p className="silo-hint" style={{ marginTop: 12 }}>Todavía no hay documentos cargados.</p>
          ) : (
            <div className="silo-table-scroll" style={{ marginTop: 12 }}>
              <table className="silo-mini-table">
                <thead>
                  <tr><th>Nombre</th><th>Control</th><th>Fecha de carga</th><th>Cargado por</th><th style={{ textAlign: 'center' }}>Descargar</th></tr>
                </thead>
                <tbody>
                  {documentos.map((d) => (
                    <tr key={d.siloDocumentoId}>
                      <td>{d.nombreArchivo}</td>
                      <td>{d.fechaControl ? formatFecha(d.fechaControl) : '-'}</td>
                      <td>{formatFecha(d.fechaCarga)}</td>
                      <td>{d.cargadoPor || '-'}</td>
                      <td className="actions-cell" style={{ justifyContent: 'center' }}>
                        <button className="table-action-tooltip" data-tooltip="Descargar" type="button" aria-label={`Descargar ${d.nombreArchivo}`} onClick={() => descargar(d)}>
                          <Download size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="form-actions">
        <button className="back-button" type="button" onClick={onVolver}>Volver</button>
      </div>
    </section>
  );
}

function useEvaluacionControl({ siloId, controlId, controlForm, esBolson, authHeaders }) {
  const [evaluacion, setEvaluacion] = useState(null);
  const [evaluando, setEvaluando] = useState(false);

  useEffect(() => {
    const humedad = controlForm.humedadGrano;
    const temperatura = controlForm.temperatura;
    if (!siloId || humedad === '' || temperatura === '' || Number.isNaN(Number(humedad)) || Number.isNaN(Number(temperatura))) {
      setEvaluacion(null);
      return undefined;
    }

    let cancelado = false;
    const espera = setTimeout(async () => {
      setEvaluando(true);
      try {
        const query = controlId ? `?controlId=${controlId}` : '';
        const response = await fetch(`${API_BASE_URL}/api/silos/${siloId}/controles/evaluar${query}`, {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            fecha: controlForm.fecha ? `${controlForm.fecha}T00:00:00` : null,
            humedadGrano: Number(humedad),
            temperatura: Number(temperatura),
            estadoGrano: controlForm.estadoGrano,
            roturaBolsa: esBolson ? controlForm.roturaBolsa === 'Si' : null
          })
        });
        if (!response.ok) throw new Error();
        const datos = await response.json();
        if (!cancelado) setEvaluacion(datos);
      } catch {
        if (!cancelado) setEvaluacion(null);
      } finally {
        if (!cancelado) setEvaluando(false);
      }
    }, 450);

    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siloId, controlId, controlForm.fecha, controlForm.humedadGrano, controlForm.temperatura, controlForm.estadoGrano, controlForm.roturaBolsa, esBolson]);

  return { evaluacion, evaluando };
}

function ResultadoControlPanel({ evaluacion, evaluando }) {
  if (!evaluacion) {
    return (
      <div className="control-resultado control-resultado-vacio">
        <strong>Resultado del control</strong>
        <p>{evaluando ? 'Evaluando...' : 'Cargá la humedad y la temperatura para ver el resultado.'}</p>
      </div>
    );
  }

  const info = RESULTADO_CONTROL[evaluacion.resultado] ?? RESULTADO_CONTROL.Normal;
  return (
    <div className={`control-resultado control-resultado-${info.tono}`} role="status" aria-live="polite">
      <div className="control-resultado-titulo">
        {info.tono === 'verde' ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
        <strong>Resultado: {info.texto}</strong>
        {evaluando && <LoaderCircle className="spin" size={16} />}
      </div>
      {evaluacion.motivos.length > 0 && (
        <ul className="control-motivos">
          {evaluacion.motivos.map((motivo) => {
            const texto = motivo.toLowerCase();
            const Icono = texto.includes('humedad') ? Droplet : texto.includes('temperatura') ? Thermometer : texto.includes('bolsa') ? AlertTriangle : Wheat;
            return <li key={motivo}><Icono size={16} aria-hidden="true" /><span>{motivo}</span></li>;
          })}
        </ul>
      )}
      {info.tono !== 'verde' && (
        <p className="control-habilitadas">Se habilitaron Incidencias e Insumos correctivos para registrar lo que se hizo.</p>
      )}
      {evaluacion.fechaProximoControlSugerida && (
        <p>
          Próximo control sugerido: <b>{formatFecha(evaluacion.fechaProximoControlSugerida)}</b>
          {evaluacion.frecuenciaControlDias && info.tono !== 'verde' ? ' (a la mitad de la frecuencia habitual por la alerta).' : '.'}
        </p>
      )}
    </div>
  );
}

// ===========================================================================
// Parametros de almacenamiento por grano (rediseno, paso 4)
// ===========================================================================

const emptyParametroForm = { grano: '', granoOtro: '', tipoSilo: 'Chapa', umbralHumedad: '', margenTemperaturaC: '', frecuenciaControlDias: '' };

function SiloParametros({ empresaId, empresaNombre, authHeaders, onVolver }) {
  const [parametros, setParametros] = useState([]);
  const [bases, setBases] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [form, setForm] = useState(emptyParametroForm);
  const [editandoId, setEditandoId] = useState(null);
  const [eliminarId, setEliminarId] = useState(null);

  async function cargar() {
    if (!empresaId) {
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const [respuestaParametros, respuestaBases] = await Promise.all([
        fetch(`${API_BASE_URL}/api/grano-parametros?empresaId=${empresaId}`, { headers: authHeaders() }),
        fetch(`${API_BASE_URL}/api/grano-parametros/bases`, { headers: authHeaders() })
      ]);
      if (!respuestaParametros.ok) throw new Error(await respuestaParametros.text() || `API ${respuestaParametros.status}`);
      setParametros(await respuestaParametros.json());
      setBases(respuestaBases.ok ? await respuestaBases.json() : []);
    } catch (err) {
      setError(`No se pudieron cargar los parámetros: ${err.message}`);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const granoElegido = form.grano === 'Otro' ? form.granoOtro.trim() : form.grano;
  const baseDelGrano = bases.find((b) => mismoGrano(b.producto, granoElegido));

  function cambiar(campo, valor) {
    setError('');
    setAviso('');
    setForm((actual) => ({ ...actual, [campo]: valor }));
  }

  function editar(parametro) {
    const conocido = GRANOS_SILO.find((g) => g !== 'Otro' && mismoGrano(g, parametro.producto));
    setEditandoId(parametro.granoParametroAlmacenamientoId);
    setForm({
      grano: conocido ?? 'Otro',
      granoOtro: conocido ? '' : parametro.producto,
      tipoSilo: parametro.tipoSilo,
      umbralHumedad: String(parametro.umbralHumedad),
      margenTemperaturaC: String(parametro.margenTemperaturaC),
      frecuenciaControlDias: String(parametro.frecuenciaControlDias)
    });
    setError('');
    setAviso('');
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(emptyParametroForm);
    setError('');
  }

  function validar() {
    if (!granoElegido) return 'Elegí el grano.';
    const umbral = Number(form.umbralHumedad);
    const margen = Number(form.margenTemperaturaC);
    const frecuencia = Number(form.frecuenciaControlDias);
    if (!(umbral > 0 && umbral < 100)) return 'El umbral de humedad debe estar entre 0 y 100 %.';
    if (!(margen > 0 && margen <= 50)) return 'El margen de temperatura debe ser mayor a 0 y hasta 50 °C.';
    if (!Number.isInteger(frecuencia) || frecuencia < 1 || frecuencia > 365) return 'La frecuencia debe ser un número entero de días entre 1 y 365.';
    return null;
  }

  async function guardar(event) {
    event.preventDefault();
    const mensaje = validar();
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/grano-parametros`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          empresaId: Number(empresaId),
          producto: granoElegido,
          tipoSilo: form.tipoSilo,
          umbralHumedad: Number(form.umbralHumedad),
          margenTemperaturaC: Number(form.margenTemperaturaC),
          frecuenciaControlDias: Number(form.frecuenciaControlDias)
        })
      });
      if (!response.ok) throw new Error(await response.text() || `API ${response.status}`);
      setAviso(`Parámetros de ${granoElegido} en silos de ${form.tipoSilo === 'Bolson' ? 'bolsón' : 'chapa'} guardados.`);
      setEditandoId(null);
      setForm(emptyParametroForm);
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id) {
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/grano-parametros/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (response.status === 404) throw new Error('No se pudo eliminar: no existe o no tenés permiso para modificar los parámetros de esta empresa.');
      if (!response.ok) throw new Error(await response.text() || `API ${response.status}`);
      setEliminarId(null);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  const numero = (v) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 });

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Parámetros de almacenamiento</h1>
          <p>Criterio del ingeniero agrónomo para evaluar los controles de silo, por grano y tipo de silo.</p>
        </div>
      </div>

      <div className="silo-context">
        <Warehouse size={18} />
        <span>Empresa</span>
        <strong>{empresaNombre || 'Sin empresa seleccionada'}</strong>
        <small>Solo el Gerente o el Encargado pueden modificarlos.</small>
      </div>

      {!empresaId ? (
        <p className="silo-hint">Elegí una empresa en el tablero de Silos para ver sus parámetros.</p>
      ) : (
        <div className="silo-wizard-layout">
          <div className="dashboard-card silo-wizard-card">
            <h2>Parámetros cargados</h2>
            {cargando ? (
              <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Cargando...</span></div>
            ) : parametros.length === 0 ? (
              <p className="silo-hint">Todavía no hay parámetros. Sin ellos, los controles solo evalúan el estado del grano y la rotura de bolsa.</p>
            ) : (
              <div className="silo-table-scroll">
                <table className="silo-mini-table">
                  <thead>
                    <tr>
                      <th>Grano</th><th>Tipo de silo</th><th className="num">Umbral humedad</th><th className="num">Margen temp.</th>
                      <th className="num">Frecuencia</th><th className="num">Base norma</th><th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parametros.map((p) => (
                      <tr key={p.granoParametroAlmacenamientoId} className={editandoId === p.granoParametroAlmacenamientoId ? 'silo-row-activa' : ''}>
                        <td>{p.producto}</td>
                        <td>{p.tipoSilo === 'Bolson' ? 'Bolsón' : 'Chapa'}</td>
                        <td className="num">{numero(p.umbralHumedad)} %</td>
                        <td className="num">{numero(p.margenTemperaturaC)} °C</td>
                        <td className="num">cada {p.frecuenciaControlDias} días</td>
                        <td className="num">{p.humedadBaseComercializacion != null ? `${numero(p.humedadBaseComercializacion)} %` : '-'}</td>
                        <td className="actions-cell">
                          <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar parámetros de ${p.producto}`} onClick={() => editar(p)}><Edit size={18} /></button>
                          <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label={`Eliminar parámetros de ${p.producto}`} onClick={() => setEliminarId(p.granoParametroAlmacenamientoId)}><Trash2 size={18} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {eliminarId && (
              <div className="silo-confirm" role="alertdialog" aria-labelledby="param-confirm-title">
                <strong id="param-confirm-title">Eliminar parámetros</strong>
                <p>Los controles nuevos de ese grano van a dejar de evaluar humedad y temperatura. Los controles ya guardados no cambian.</p>
                <div>
                  <button type="button" className="green-button" onClick={() => eliminar(eliminarId)}>Eliminar</button>
                  <button type="button" className="back-button" onClick={() => setEliminarId(null)}>Cancelar</button>
                </div>
              </div>
            )}

            <p className="silo-hint" style={{ marginTop: 14 }}>
              La <b>base de la norma</b> es la humedad de comercialización (Res. SAGyP 1075/94): indica cuánto descuenta el comprador, no cuándo el grano corre riesgo en el silo. Por eso se muestra solo como referencia.
            </p>
          </div>

          <aside className="dashboard-card silo-wizard-card silo-wizard-side">
            <h2>{editandoId ? 'Editar parámetros' : 'Cargar parámetros'}</h2>
            {error && <p className="silo-form-error" role="alert">{error}</p>}
            {aviso && <p className="silo-ok" role="status">{aviso}</p>}
            <form onSubmit={guardar} noValidate className="silo-param-form">
              <label className="field">
                <span className="field-label">Grano <b>*</b></span>
                <select value={form.grano} disabled={Boolean(editandoId)} onChange={(e) => cambiar('grano', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {GRANOS_SILO.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              {form.grano === 'Otro' && (
                <label className="field">
                  <span className="field-label">Otro grano <b>*</b></span>
                  <input maxLength={10} disabled={Boolean(editandoId)} value={form.granoOtro} onChange={(e) => cambiar('granoOtro', e.target.value.slice(0, 10))} />
                </label>
              )}
              <label className="field">
                <span className="field-label">Tipo de silo <b>*</b></span>
                <select value={form.tipoSilo} disabled={Boolean(editandoId)} onChange={(e) => cambiar('tipoSilo', e.target.value)}>
                  <option value="Chapa">Chapa</option>
                  <option value="Bolson">Bolsón</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Umbral de humedad (%) <b>*</b></span>
                <input type="number" min="0" max="100" step="0.1" value={form.umbralHumedad} onChange={(e) => cambiar('umbralHumedad', e.target.value)} />
                {baseDelGrano && <small className="silo-hint">Referencia: base de comercialización {numero(baseDelGrano.humedadBase)} %.</small>}
              </label>
              <label className="field">
                <span className="field-label">Margen de temperatura (°C) <b>*</b></span>
                <input type="number" min="0" max="50" step="0.5" value={form.margenTemperaturaC} onChange={(e) => cambiar('margenTemperaturaC', e.target.value)} />
                <small className="silo-hint">Suba máxima aceptada respecto del control anterior.</small>
              </label>
              <label className="field">
                <span className="field-label">Frecuencia de control (días) <b>*</b></span>
                <input type="number" min="1" max="365" step="1" value={form.frecuenciaControlDias} onChange={(e) => cambiar('frecuenciaControlDias', e.target.value)} />
                <small className="silo-hint">Con alerta, el próximo control se sugiere a la mitad.</small>
              </label>
              <div className="silo-param-actions">
                <button className="green-button" type="submit" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
                {editandoId && <button className="back-button" type="button" onClick={cancelarEdicion}>Cancelar</button>}
              </div>
            </form>
          </aside>
        </div>
      )}

      <div className="form-actions">
        <button className="back-button" type="button" onClick={onVolver}>Volver a Silos</button>
      </div>
    </section>
  );
}

function NivelOcupacionBar({ porcentaje }) {
  return (
    <div className={`ocupacion-bar-track ocupacion-${ocupacionSeveridad(porcentaje)}`}>
      <div className="ocupacion-bar-fill" style={{ height: `${porcentaje}%` }} />
      <span>{porcentaje}%</span>
    </div>
  );
}

function SiloHistorialList({ silo, controles, error, onNuevoControl, onVer, onEditar, onEliminar, onBack }) {
  if (!silo) return null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Historial Control Silo</h1>
          <p>{silo.nombre} - {silo.tipoSilo} - {silo.producto || 'Sin grano'}</p>
        </div>
        <button className="green-button" type="button" onClick={onNuevoControl}>Nuevo Control</button>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Humedad</th>
              <th>Temperatura</th>
              <th>Estado</th>
              <th>Plagas</th>
              <th>Insumos</th>
              <th>Rotura</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {controles.map((control) => (
              <tr key={control.siloControlId}>
                <td>{new Date(control.fecha).toLocaleDateString('es-AR')}</td>
                <td>{control.humedadGrano}%</td>
                <td>{control.temperatura} C</td>
                <td>{control.estadoGrano}</td>
                <td>{control.cantidadIncidencias > 0 ? 'Si' : 'No'}</td>
                <td>{control.cantidadInsumos > 0 ? 'Si' : 'No'}</td>
                <td>{control.roturaBolsa === null || control.roturaBolsa === undefined ? '-' : control.roturaBolsa ? 'Si' : 'No'}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label="Ver control" onClick={() => onVer(control)}><Eye size={18} /></button>
                  <button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label="Editar control" onClick={() => onEditar(control)}><Edit size={18} /></button>
                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar control" onClick={() => onEliminar(control)}><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
            {controles.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center' }}>Todavia no hay controles registrados.</td></tr>
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

function SiloControlForm({
  silo,
  modoEdicion,
  controlId = null,
  authHeaders,
  controlForm,
  incidenciaForm,
  insumoForm,
  incidencias,
  insumos,
  documentos,
  saving,
  error,
  onControlFieldChange,
  onIncidenciaFieldChange,
  onInsumoFieldChange,
  onGuardarControl,
  onAgregarIncidencia,
  onEliminarIncidencia,
  onAgregarInsumo,
  onEliminarInsumo,
  onSubirDocumento,
  onDescargarDocumento,
  onEliminarDocumento,
  onBack
}) {
  const esBolson = silo?.tipoSilo === 'Bolson';
  const { evaluacion, evaluando } = useEvaluacionControl({
    siloId: silo?.siloId, controlId, controlForm, esBolson, authHeaders
  });
  const sugerida = evaluacion?.fechaProximoControlSugerida ? String(evaluacion.fechaProximoControlSugerida).slice(0, 10) : '';
  const alerta = Boolean(evaluacion && evaluacion.resultado !== 'Normal');

  // Avisos debajo de cada campo: rango fuera de lo permitido (rojo) o alerta del evaluador (ambar).
  const humedad = controlForm.humedadGrano === '' ? null : Number(controlForm.humedadGrano);
  const temperatura = controlForm.temperatura === '' ? null : Number(controlForm.temperatura);
  const humedadFueraRango = humedad !== null && (humedad < 0 || humedad > 100);
  const temperaturaFueraRango = temperatura !== null && (temperatura < -30 || temperatura > 80);
  const umbralSuperado = !humedadFueraRango && humedad !== null && evaluacion?.umbralHumedad != null && humedad > Number(evaluacion.umbralHumedad);
  const subaTemperatura = !temperaturaFueraRango && temperatura !== null && evaluacion?.temperaturaAnterior != null
    ? temperatura - Number(evaluacion.temperaturaAnterior)
    : null;
  const subaExcede = subaTemperatura !== null && evaluacion?.margenTemperaturaC != null && subaTemperatura > Number(evaluacion.margenTemperaturaC);
  const numeroCorto = (v) => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 });

  // Mientras el usuario no elija otra fecha, el proximo control sigue a la sugerida.
  useEffect(() => {
    if (!controlForm.proximoManual && sugerida !== controlForm.fechaProximoControl) {
      onControlFieldChange('fechaProximoControl', sugerida);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugerida, controlForm.proximoManual]);

  if (!silo) return null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{modoEdicion ? 'Editar Control Silo' : 'Control Silo'}</h1>
          <p>{silo.nombre} - {silo.tipoSilo} - {silo.producto || 'Sin grano'}</p>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="create-form-card dashboard-card">
        <div className="control-layout">
        <div>
        <div className="create-grid">
          <label className="field">
            <span className="field-label">Fecha <b>*</b></span>
            <input type="date" required value={controlForm.fecha} onChange={(e) => onControlFieldChange('fecha', e.target.value)} />
            <small className="silo-hint">Se completa sola con la de hoy.</small>
          </label>
          <label className="field">
            <span className="field-label">Humedad del grano (%) <b>*</b></span>
            <input
              type="number" step="0.01" min="0" max="100" required
              className={humedadFueraRango ? 'input-error' : umbralSuperado ? 'input-alerta' : undefined}
              value={controlForm.humedadGrano}
              onChange={(e) => onControlFieldChange('humedadGrano', e.target.value)}
            />
            <small className="silo-hint"><span className="control-regla">Regla</span> · Entre 0 y 100.</small>
            {humedadFueraRango && <small className="control-aviso-error">Fuera de rango: tiene que estar entre 0 y 100 %.</small>}
            {umbralSuperado && <small className="control-aviso">Supera el umbral de almacenamiento ({numeroCorto(evaluacion.umbralHumedad)} %).</small>}
          </label>
          <label className="field">
            <span className="field-label">Temperatura (°C) <b>*</b></span>
            <input
              type="number" step="0.01" min="-30" max="80" required
              className={temperaturaFueraRango ? 'input-error' : subaExcede ? 'input-alerta' : undefined}
              value={controlForm.temperatura}
              onChange={(e) => onControlFieldChange('temperatura', e.target.value)}
            />
            <small className="silo-hint"><span className="control-regla">Regla</span> · Entre −30 y 80.</small>
            {temperaturaFueraRango && <small className="control-aviso-error">Fuera de rango: tiene que estar entre −30 y 80 °C.</small>}
            {subaExcede && <small className="control-aviso">+{numeroCorto(subaTemperatura)} °C vs. control anterior.</small>}
          </label>
          <label className="field">
            <span className="field-label">Estado del grano <b>*</b></span>
            <select value={controlForm.estadoGrano} onChange={(e) => onControlFieldChange('estadoGrano', e.target.value)}>
              <option value="Bueno">Bueno</option>
              <option value="Regular">Regular</option>
              <option value="Deteriorado">Deteriorado</option>
            </select>
          </label>
          {silo.tipoSilo === 'Bolson' && (
            <label className="field">
              Rotura de Bolsa
              <select value={controlForm.roturaBolsa} onChange={(e) => onControlFieldChange('roturaBolsa', e.target.value)}>
                <option value="No">No</option>
                <option value="Si">Si</option>
              </select>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Solo silos tipo Bolson</span>
            </label>
          )}
        </div>
        <div className="create-grid" style={{ marginTop: 16 }}>
          <label className="field">
            <span className="field-label">Próximo control</span>
            <input
              type="date"
              min={controlForm.fecha || undefined}
              value={controlForm.fechaProximoControl}
              onChange={(e) => { onControlFieldChange('fechaProximoControl', e.target.value); onControlFieldChange('proximoManual', true); }}
            />
            {controlForm.proximoManual && sugerida && sugerida !== controlForm.fechaProximoControl ? (
              <button type="button" className="control-link" onClick={() => onControlFieldChange('proximoManual', false)}>
                Usar la sugerida ({formatFecha(sugerida)})
              </button>
            ) : (
              <small className="silo-hint">{sugerida ? 'Sugerida según el resultado. Podés cambiarla.' : 'Sin frecuencia cargada para este grano: elegila vos (opcional).'}</small>
            )}
          </label>
        </div>
        <label className="field" style={{ marginTop: 16 }}>
          Observaciones
          <input value={controlForm.observaciones} onChange={(e) => onControlFieldChange('observaciones', e.target.value)} />
        </label>
        </div>
        <aside className="control-side">
          <ResultadoControlPanel evaluacion={evaluacion} evaluando={evaluando} />
        </aside>
        </div>
      </div>

      <h2 className={alerta ? 'control-seccion-titulo' : undefined}>
        Incidencias
        {alerta && <span className="control-sugerido">Sugerido por la alerta</span>}
      </h2>
      <div className={`create-form-card dashboard-card ${alerta ? 'control-seccion-destacada' : ''}`}>
        <label className="field">Presencia de Plagas?</label>
        <div className="radio-group" style={{ display: 'flex', gap: 24, margin: '8px 0 16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="presenciaPlagas"
              checked={incidenciaForm.presenciaPlagas === 'Si'}
              onChange={() => onIncidenciaFieldChange('presenciaPlagas', 'Si')}
            />
            Si
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="presenciaPlagas"
              checked={incidenciaForm.presenciaPlagas === 'No'}
              onChange={() => onIncidenciaFieldChange('presenciaPlagas', 'No')}
            />
            No
          </label>
        </div>

        {incidenciaForm.presenciaPlagas === 'Si' && (
          <form onSubmit={onAgregarIncidencia}>
            <div className="create-grid">
              <label className="field">
                <span className="field-label">Tipo de Plaga <b>*</b></span>
                <select required value={incidenciaForm.tipoPlaga} onChange={(e) => onIncidenciaFieldChange('tipoPlaga', e.target.value)}>
                  {TIPOS_PLAGA.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Observaciones <b>*</b></span>
                <input required value={incidenciaForm.observaciones} onChange={(e) => onIncidenciaFieldChange('observaciones', e.target.value)} />
              </label>
            </div>
            <div className="form-actions">
              <button className="green-button" type="submit">Agregar</button>
            </div>
          </form>
        )}
      </div>

      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Plagas</th>
              <th>Observaciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {incidencias.map((incidencia) => (
              <tr key={incidencia.siloControlIncidenciaId ?? incidencia.tempId}>
                <td>{incidencia.tipoPlaga}</td>
                <td>{incidencia.observaciones}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar incidencia" onClick={() => onEliminarIncidencia(incidencia)}>
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {incidencias.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center' }}>Sin incidencias cargadas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className={alerta ? 'control-seccion-titulo' : undefined}>
        Insumos/Agroquimicos
        {alerta && <span className="control-sugerido">Sugerido por la alerta</span>}
      </h2>
      <div className={`create-form-card dashboard-card ${alerta ? 'control-seccion-destacada' : ''}`}>
        <label className="field">Aplicacion de Insumos/Agroquimicos?</label>
        <div className="radio-group" style={{ display: 'flex', gap: 24, margin: '8px 0 16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="aplicarInsumo"
              checked={insumoForm.aplicarInsumo === 'Si'}
              onChange={() => onInsumoFieldChange('aplicarInsumo', 'Si')}
            />
            Si
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="radio"
              name="aplicarInsumo"
              checked={insumoForm.aplicarInsumo === 'No'}
              onChange={() => onInsumoFieldChange('aplicarInsumo', 'No')}
            />
            No
          </label>
        </div>

        {insumoForm.aplicarInsumo === 'Si' && (
          <form onSubmit={onAgregarInsumo}>
            <div className="create-grid">
              <label className="field">
                <span className="field-label">Fecha de aplicacion <b>*</b></span>
                <input type="date" value={insumoForm.fechaAplicacion} onChange={(e) => onInsumoFieldChange('fechaAplicacion', e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Marca <b>*</b></span>
                <input value={insumoForm.marca} onChange={(e) => onInsumoFieldChange('marca', e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Tipo <b>*</b></span>
                <select value={insumoForm.tipo} onChange={(e) => onInsumoFieldChange('tipo', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {TIPOS_INSUMO.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Cantidad Aplicada <b>*</b></span>
                <input type="number" step="0.01" value={insumoForm.cantidadAplicada} onChange={(e) => onInsumoFieldChange('cantidadAplicada', e.target.value)} />
              </label>
            </div>
            <div className="form-actions">
              <button className="green-button" type="submit">Agregar</button>
            </div>
          </form>
        )}
      </div>

      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha de aplicacion</th>
              <th>Marca</th>
              <th>Tipo</th>
              <th>Cantidad aplicada</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((insumo) => (
              <tr key={insumo.siloControlInsumoId ?? insumo.tempId}>
                <td>{insumo.fechaAplicacion || '-'}</td>
                <td>{insumo.marca || '-'}</td>
                <td>{insumo.tipo || '-'}</td>
                <td>{insumo.cantidadAplicada ?? '-'}</td>
                <td className="actions-cell">
                  <button className="table-action-tooltip" data-tooltip="Eliminar" type="button" aria-label="Eliminar insumo" onClick={() => onEliminarInsumo(insumo)}>
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {insumos.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin insumos cargados.</td></tr>
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
                <tr key={doc.siloDocumentoId ?? doc.tempId}>
                  <td>{doc.nombreArchivo}</td>
                  <td>{doc.fechaCarga ? new Date(doc.fechaCarga).toLocaleDateString('es-AR') : 'Pendiente de guardar'}</td>
                  <td>{doc.cargadoPor || '-'}</td>
                  <td className="actions-cell">
                    {doc.siloDocumentoId && (
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
        <button className="green-button" type="button" disabled={saving} onClick={onGuardarControl}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
      </div>
    </section>
  );
}

function SiloControlDetalle({ silo, control, incidencias, insumos, documentos, onDescargarDocumento, onBack }) {
  if (!silo || !control) return null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Historial Control Silo</h1>
          <p>{silo.nombre} - {silo.tipoSilo} - {silo.producto || 'Sin grano'}</p>
        </div>
      </div>

      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">
            Fecha
            <input readOnly value={new Date(control.fecha).toLocaleDateString('es-AR')} />
          </label>
          <label className="field">
            Humedad Grano
            <input readOnly value={`${control.humedadGrano}%`} />
          </label>
          <label className="field">
            Temperatura
            <input readOnly value={`${control.temperatura} C`} />
          </label>
          <label className="field">
            Estado del grano
            <input readOnly value={control.estadoGrano} />
          </label>
          {silo.tipoSilo === 'Bolson' && (
            <label className="field">
              Rotura de Bolsa?
              <input readOnly value={control.roturaBolsa ? 'Si' : 'No'} />
            </label>
          )}
        </div>
        <label className="field" style={{ marginTop: 16 }}>
          Observaciones
          <input readOnly value={control.observaciones || '-'} />
        </label>
      </div>

      <h2>Incidencias</h2>
      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Plagas</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {incidencias.map((incidencia) => (
              <tr key={incidencia.siloControlIncidenciaId}>
                <td>{incidencia.tipoPlaga}</td>
                <td>{incidencia.observaciones}</td>
              </tr>
            ))}
            {incidencias.length === 0 && (
              <tr><td colSpan={2} style={{ textAlign: 'center' }}>Sin incidencias cargadas.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Insumos/Agroquimicos</h2>
      <div className="table-shell dashboard-card">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Fecha de aplicacion</th>
              <th>Marca</th>
              <th>tipo</th>
              <th>Cantidad aplicada</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((insumo) => (
              <tr key={insumo.siloControlInsumoId}>
                <td>{insumo.fechaAplicacion || '-'}</td>
                <td>{insumo.marca || '-'}</td>
                <td>{insumo.tipo || '-'}</td>
                <td>{insumo.cantidadAplicada ?? '-'}</td>
              </tr>
            ))}
            {insumos.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin insumos cargados.</td></tr>
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
              <tr key={doc.siloDocumentoId}>
                <td>{doc.nombreArchivo}</td>
                <td>{new Date(doc.fechaCarga).toLocaleDateString('es-AR')}</td>
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
