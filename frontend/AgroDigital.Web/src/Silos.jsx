import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit,
  Eye,
  FileText,
  Filter,
  LoaderCircle,
  PlusCircle,
  RotateCcw,
  Search,
  Trash2,
  Warehouse
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';

const emptySiloForm = {
  loteId: '',
  nombre: '',
  tipoSilo: 'Chapa',
  capacidadMax: '',
  producto: '',
  cantidadGranoAlmacenado: '',
  pais: 'Argentina',
  provincia: '',
  ciudad: '',
  activo: true
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
    observaciones: ''
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

export default function Silos({ session, lotes }) {
  const [view, setView] = useState('list');
  const [silos, setSilos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedSilo, setSelectedSilo] = useState(null);
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
    setSelectedSilo(silo);
    setForm({
      loteId: silo.loteId ?? '',
      nombre: silo.nombre,
      tipoSilo: silo.tipoSilo,
      capacidadMax: silo.capacidadMax,
      producto: silo.producto ?? '',
      cantidadGranoAlmacenado: silo.cantidadGranoAlmacenado,
      pais: silo.pais,
      provincia: silo.provincia,
      ciudad: silo.ciudad,
      activo: silo.activo
    });
    setError('');
    setView(mode);
  }

  function updateField(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value };
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
          loteId: form.loteId ? Number(form.loteId) : null,
          nombre: form.nombre,
          tipoSilo: form.tipoSilo,
          capacidadMax: Number(form.capacidadMax),
          producto: form.producto || null,
          cantidadGranoAlmacenado: form.cantidadGranoAlmacenado ? Number(form.cantidadGranoAlmacenado) : null,
          pais: form.pais,
          provincia: form.provincia,
          ciudad: form.ciudad
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
        body: JSON.stringify({
          loteId: form.loteId ? Number(form.loteId) : null,
          nombre: form.nombre,
          tipoSilo: form.tipoSilo,
          capacidadMax: Number(form.capacidadMax),
          producto: form.producto || null,
          pais: form.pais,
          provincia: form.provincia,
          ciudad: form.ciudad,
          activo: form.activo
        })
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
      observaciones: control.observaciones ?? ''
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
        observaciones: controlForm.observaciones || null
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

  if (view === 'create') {
    return (
      <SiloForm
        title="Registrar Silo"
        description="Completa los datos del silo. Producto y Cantidad de grano son opcionales."
        form={form}
        lotes={lotes}
        saving={saving}
        error={error}
        onFieldChange={updateField}
        onCancel={goToList}
        onSubmit={handleCreate}
        submitLabel="Registrar"
      />
    );
  }

  if (view === 'edit') {
    return (
      <SiloForm
        title={`Editar ${selectedSilo?.nombre ?? ''}`}
        description="Modifica los datos del silo."
        form={form}
        lotes={lotes}
        saving={saving}
        error={error}
        onFieldChange={updateField}
        onCancel={() => setView('detail')}
        onSubmit={handleUpdate}
        submitLabel="Guardar"
      />
    );
  }

  if (view === 'detail') {
    return (
      <SiloForm
        title={`Detalle ${selectedSilo?.nombre ?? ''}`}
        description="Informacion del silo en modo de solo lectura."
        form={form}
        lotes={lotes}
        readOnly
        onCancel={goToList}
        onEdit={() => setView('edit')}
        submitLabel="Editar"
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
      silos={silos}
      loading={loading}
      error={error}
      onAdd={startCreate}
      onView={(silo) => openSilo(silo, 'detail')}
      onEdit={(silo) => openSilo(silo, 'edit')}
      onControl={openHistorial}
    />
  );
}

function SilosList({ silos, loading, error, onAdd, onView, onEdit, onControl }) {
  const [query, setQuery] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [ubicacionFilter, setUbicacionFilter] = useState('');
  const [productoFilter, setProductoFilter] = useState('');

  function ubicacionDe(silo) {
    return silo.loteNombre ?? `${silo.pais}, ${silo.provincia}, ${silo.ciudad}`;
  }

  const ubicacionOptions = useMemo(
    () => [...new Set(silos.map((silo) => ubicacionDe(silo)).filter(Boolean))],
    [silos]
  );
  const productoOptions = useMemo(
    () => [...new Set(silos.map((silo) => silo.producto).filter(Boolean))],
    [silos]
  );

  const filtered = useMemo(() => silos.filter((silo) => {
    const texto = normalizeSearchText(query.trim());
    const camposBusqueda = [
      silo.nombre,
      silo.tipoSilo,
      silo.producto,
      String(silo.capacidadMax ?? ''),
      String(silo.cantidadGranoAlmacenado ?? ''),
      ubicacionDe(silo),
      silo.activo ? 'Activo' : 'Inactivo'
    ];
    const matchesQuery = !texto || camposBusqueda.some(
      (campo) => normalizeSearchText(campo ?? '').includes(texto)
    );
    const matchesTipo = !tipoFilter || silo.tipoSilo === tipoFilter;
    const matchesUbicacion = !ubicacionFilter || ubicacionDe(silo) === ubicacionFilter;
    const matchesProducto = !productoFilter || silo.producto === productoFilter;
    return matchesQuery && matchesTipo && matchesUbicacion && matchesProducto;
  }), [silos, query, tipoFilter, ubicacionFilter, productoFilter]);

  function clearFilters() {
    setQuery('');
    setTipoFilter('');
    setUbicacionFilter('');
    setProductoFilter('');
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Silos</h1>
          <p>Administra tus instalaciones de almacenamiento y su nivel de ocupacion.</p>
        </div>
        <button className="green-button add-lote-button" type="button" onClick={onAdd}>
          <PlusCircle size={18} />
          <span>Registrar silo</span>
        </button>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="filters-card">
        <label className="search-field">
          <Search size={21} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cualquier dato del silo..." />
        </label>
        <select value={tipoFilter} onChange={(event) => setTipoFilter(event.target.value)}>
          <option value="">Tipo</option>
          <option value="Chapa">Chapa</option>
          <option value="Bolson">Bolson</option>
        </select>
        <select value={ubicacionFilter} onChange={(event) => setUbicacionFilter(event.target.value)}>
          <option value="">Ubicacion</option>
          {ubicacionOptions.map((ubicacion) => <option key={ubicacion} value={ubicacion}>{ubicacion}</option>)}
        </select>
        <select value={productoFilter} onChange={(event) => setProductoFilter(event.target.value)}>
          <option value="">Producto</option>
          {productoOptions.map((producto) => <option key={producto} value={producto}>{producto}</option>)}
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
            <span>Cargando silos...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <section className="empty-state dashboard-card">
          <div className="empty-state-icon"><Warehouse size={92} strokeWidth={1.8} /></div>
          <div className="empty-state-copy">
            <h2>Aun no tenes silos registrados</h2>
            <p>Registra tus silos para llevar el control de su ocupacion.</p>
          </div>
          <button className="green-button empty-state-action" type="button" onClick={onAdd}>
            <PlusCircle size={18} />
            <span>Registrar silo</span>
          </button>
        </section>
      ) : (
        <div className="table-shell dashboard-card">
          <table className="lotes-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Capacidad Max</th>
                <th>Producto</th>
                <th>Grano almacenado</th>
                <th>Ocupacion</th>
                <th>Ubicacion</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((silo) => (
                <tr key={silo.siloId}>
                  <td>{silo.nombre}</td>
                  <td>{silo.tipoSilo === 'Bolson' ? 'Bolson' : 'Chapa'}</td>
                  <td>{Number(silo.capacidadMax).toLocaleString('es-AR')} kg</td>
                  <td>{silo.producto || '-'}</td>
                  <td>{Number(silo.cantidadGranoAlmacenado).toLocaleString('es-AR')} kg</td>
                  <td>
                    <span className={`ocupacion-chip ocupacion-${ocupacionSeveridad(silo.nivelOcupacionPorcentaje)}`}>
                      {silo.nivelOcupacionPorcentaje}%
                    </span>
                  </td>
                  <td>{silo.loteNombre ?? `${silo.pais}, ${silo.provincia}, ${silo.ciudad}`}</td>
                  <td className="actions-cell">
                    <button type="button" aria-label={`Ver ${silo.nombre}`} onClick={() => onView(silo)}><Eye size={18} /></button>
                    <button type="button" aria-label={`Editar ${silo.nombre}`} onClick={() => onEdit(silo)}><Edit size={18} /></button>
                    <button type="button" aria-label={`Control de ${silo.nombre}`} onClick={() => onControl(silo)}><ClipboardControlIcon /></button>
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

function SiloForm({
  title,
  description,
  form,
  lotes = [],
  saving,
  error,
  readOnly = false,
  onFieldChange,
  onCancel,
  onEdit,
  onSubmit,
  submitLabel
}) {
  const loteSeleccionado = form.loteId ? lotes.find((l) => String(l.loteId) === String(form.loteId)) : null;
  const ubicacionEditable = !readOnly && !loteSeleccionado;
  const [availableZones, setAvailableZones] = useState([]);

  useEffect(() => {
    if (!ubicacionEditable || !form.provincia) {
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
  }, [form.provincia, ubicacionEditable]);

  const provinciaOptions = ubicacionEditable ? PROVINCIAS : (form.provincia ? [form.provincia] : []);
  const ciudadOptions = ubicacionEditable ? availableZones : (form.ciudad ? [form.ciudad] : []);

  const content = (
    <div className="create-form-card dashboard-card">
      <div className="create-grid">
        <label className="field">
          Nombre <b>*</b>
          <input value={form.nombre} readOnly={readOnly} onChange={(e) => onFieldChange('nombre', e.target.value)} />
        </label>
        <label className="field">
          Tipo de Silo <b>*</b>
          <select value={form.tipoSilo} disabled={readOnly} onChange={(e) => onFieldChange('tipoSilo', e.target.value)}>
            <option value="Chapa">Chapa</option>
            <option value="Bolson">Bolson</option>
          </select>
        </label>
        <label className="field">
          Capacidad Max (kg) <b>*</b>
          <input type="number" min="0" value={form.capacidadMax} readOnly={readOnly} onChange={(e) => onFieldChange('capacidadMax', e.target.value)} />
        </label>
        <label className="field">
          Producto
          <input value={form.producto} readOnly={readOnly} onChange={(e) => onFieldChange('producto', e.target.value)} placeholder="Opcional" />
        </label>
        {!readOnly && (
          <label className="field">
            Cant. grano almacenado
            <input type="number" min="0" value={form.cantidadGranoAlmacenado} onChange={(e) => onFieldChange('cantidadGranoAlmacenado', e.target.value)} placeholder="Opcional" />
          </label>
        )}
      </div>

      <h2 style={{ marginTop: 24 }}>Ubicacion</h2>
      <p className="card-heading p" style={{ color: '#637168', fontWeight: 700, marginBottom: 12 }}>
        El silo se encuentra alojado en un lote?
      </p>
      <div className="create-grid">
        <label className="field">
          Lote
          <select value={form.loteId ?? ''} disabled={readOnly} onChange={(e) => onFieldChange('loteId', e.target.value)}>
            <option value="">Sin lote (ubicacion manual)</option>
            {lotes.map((lote) => (
              <option key={lote.loteId} value={lote.loteId}>{lote.nombre}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Pais
          <select value={form.pais || 'Argentina'} disabled={readOnly || !ubicacionEditable} onChange={(e) => onFieldChange('pais', e.target.value)}>
            <option value="Argentina">Argentina</option>
          </select>
        </label>
        <label className="field">
          Provincia
          <select value={form.provincia} disabled={readOnly || !ubicacionEditable} onChange={(e) => onFieldChange('provincia', e.target.value)}>
            <option value="">Seleccionar</option>
            {provinciaOptions.map((provincia) => <option key={provincia} value={provincia}>{provincia}</option>)}
          </select>
        </label>
        <label className="field">
          Ciudad
          <select value={form.ciudad} disabled={readOnly || !ubicacionEditable} onChange={(e) => onFieldChange('ciudad', e.target.value)}>
            <option value="">Seleccionar</option>
            {ciudadOptions.map((ciudad) => <option key={ciudad} value={ciudad}>{ciudad}</option>)}
          </select>
        </label>
      </div>

      {form.capacidadMax > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Nivel de Ocupacion</h2>
          <NivelOcupacionBar
            porcentaje={Math.min(100, Math.round(((Number(form.cantidadGranoAlmacenado) || 0) / Number(form.capacidadMax)) * 100))}
          />
        </>
      )}
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
          <p>{silo.nombre} - {silo.tipoSilo} - {silo.producto || 'Sin producto'}</p>
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
                  <button type="button" aria-label="Ver control" onClick={() => onVer(control)}><Eye size={18} /></button>
                  <button type="button" aria-label="Editar control" onClick={() => onEditar(control)}><Edit size={18} /></button>
                  <button type="button" aria-label="Eliminar control" onClick={() => onEliminar(control)}><Trash2 size={18} /></button>
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
  if (!silo) return null;

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>{modoEdicion ? 'Editar Control Silo' : 'Control Silo'}</h1>
          <p>{silo.nombre} - {silo.tipoSilo} - {silo.producto || 'Sin producto'}</p>
        </div>
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}

      <div className="create-form-card dashboard-card">
        <div className="create-grid">
          <label className="field">
            Fecha <b>*</b>
            <input type="date" required value={controlForm.fecha} onChange={(e) => onControlFieldChange('fecha', e.target.value)} />
          </label>
          <label className="field">
            Humedad Grano (%) <b>*</b>
            <input type="number" step="0.01" required value={controlForm.humedadGrano} onChange={(e) => onControlFieldChange('humedadGrano', e.target.value)} />
          </label>
          <label className="field">
            Temperatura (C) <b>*</b>
            <input type="number" step="0.01" required value={controlForm.temperatura} onChange={(e) => onControlFieldChange('temperatura', e.target.value)} />
          </label>
          <label className="field">
            Estado del grano <b>*</b>
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
        <label className="field" style={{ marginTop: 16 }}>
          Observaciones
          <input value={controlForm.observaciones} onChange={(e) => onControlFieldChange('observaciones', e.target.value)} />
        </label>
      </div>

      <h2>Incidencias</h2>
      <div className="create-form-card dashboard-card">
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
                Tipo de Plaga <b>*</b>
                <select required value={incidenciaForm.tipoPlaga} onChange={(e) => onIncidenciaFieldChange('tipoPlaga', e.target.value)}>
                  {TIPOS_PLAGA.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Observaciones <b>*</b>
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
                  <button type="button" aria-label="Eliminar incidencia" onClick={() => onEliminarIncidencia(incidencia)}>
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

      <h2>Insumos/Agroquimicos</h2>
      <div className="create-form-card dashboard-card">
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
                Cantidad Aplicada <b>*</b>
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
                  <button type="button" aria-label="Eliminar insumo" onClick={() => onEliminarInsumo(insumo)}>
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
          <p>{silo.nombre} - {silo.tipoSilo} - {silo.producto || 'Sin producto'}</p>
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
