import { useMemo, useRef, useEffect, useState } from 'react';
import { Ban, CheckCircle2, ChevronDown, Edit, GripVertical, Leaf, Lightbulb, Map as MapIcon, MousePointerClick, Route, Sprout, Trash2 } from 'lucide-react';
import { provinces, commonGrains } from './loteCatalogos.js';
import { getPreviousCampaignOptions, hasLoteFormChanges, moveArrayItem } from './loteUtils.js';
import { formatDate } from '../../shared/utils/formatDate.js';
import { normalizeSearchText } from '../../shared/utils/normalizeSearchText.js';
import useCoordinateDrag from './useCoordinateDrag.js';
import PolygonMap from './PolygonMap.jsx';
import EmptyState from './EmptyState.jsx';
import CultivoChip from './CultivoChip.jsx';

function LoteCreate({
  form,
  areaHa,
  areaM2,
  saving,
  fieldErrors = {},
  zones,
  zonesLoading,
  zoneMapTarget,
  onCancel,
  onSubmit,
  onFieldChange,
  onCoordinatesChange,
  onMapExpandedChange
}) {
  function deleteCoordinate(indexToDelete) {
    const updatedPoints = form.coordenadas.filter((_, index) => index !== indexToDelete);
    onCoordinatesChange(updatedPoints, form.cerrado && updatedPoints.length >= 3);
  }

  function moveCoordinate(fromIndex, toIndex) {
    const updatedPoints = moveArrayItem(form.coordenadas, fromIndex, toIndex);
    onCoordinatesChange(updatedPoints, form.cerrado && updatedPoints.length >= 3);
  }

  const coordinateDrag = useCoordinateDrag({ onMove: moveCoordinate });
  const canRegister = Boolean(
    form.nombre.trim()
    && form.pais.trim()
    && form.provincia.trim()
    && form.ciudad.trim()
    && form.condicion.trim()
    && form.cultivoAnterior.trim()
    && form.cultivoAnteriorCampania.trim()
    && form.coordenadas.length >= 3
    && form.cerrado
    && areaHa > 0
    && areaM2 > 0
  );

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Registrar Lote</h1>
          <p>Define la informacion general y marca el poligono del lote en el mapa.</p>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="create-form-card dashboard-card">
          <div className="create-grid">
          <RequiredInput label="Nombre del lote" value={form.nombre} onChange={(value) => onFieldChange('nombre', value)} error={fieldErrors.nombre} />
          <SearchableDropdown label="Pais" value={form.pais} onChange={(value) => onFieldChange('pais', value)} options={['Argentina']} error={fieldErrors.pais} />
          <SearchableDropdown label="Provincia" value={form.provincia} onChange={(value) => onFieldChange('provincia', value)} options={provinces} error={fieldErrors.provincia} />
          <SearchableDropdown
            label="Zona"
            value={form.ciudad}
            onChange={(value) => onFieldChange('ciudad', value)}
            options={zones}
            placeholder="Buscar ciudad, pueblo o zona"
            loading={zonesLoading}
            error={fieldErrors.ciudad}
          />
          <SearchableDropdown label="Condicion" value={form.condicion} onChange={(value) => onFieldChange('condicion', value)} options={['Propio', 'Alquilado']} searchable={false} error={fieldErrors.condicion} />
          <GrainSelector
            label="Cultivo anterior"
            value={form.cultivoAnterior}
            onChange={(value) => onFieldChange('cultivoAnterior', value)}
            error={fieldErrors.cultivoAnterior}
          />
          <PreviousCampaignSelector
            value={form.cultivoAnteriorCampania}
            onChange={(value) => onFieldChange('cultivoAnteriorCampania', value)}
            error={fieldErrors.cultivoAnteriorCampania}
          />
          </div>
        </div>

        <div className="lote-editor-grid">
          <section className="map-card dashboard-card">
            <div className="card-heading">
              <div className="card-heading-icon">
                <MapIcon size={18} />
              </div>
              <div>
                <h2>Mapa del lote</h2>
                <p>Marca los vertices del poligono en el mapa.</p>
              </div>
            </div>

            <PolygonMap
              points={form.coordenadas}
              closed={form.cerrado}
              areaHa={areaHa}
              areaM2={areaM2}
              onChange={onCoordinatesChange}
              onExpandedChange={onMapExpandedChange}
              mapTarget={zoneMapTarget}
            />

            <div className="area-grid">
              <label>
                Hectareas calculadas
                <input value={areaHa ? `${areaHa.toFixed(4)} ha` : ''} readOnly />
              </label>
              <label>
                Superficie total calculada
                <input value={areaM2 ? `${areaM2.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m2` : ''} readOnly />
              </label>
            </div>
            {fieldErrors.coordenadas && <small className="field-error map-field-error">{fieldErrors.coordenadas}</small>}

            <div className="form-actions">
              <button className="green-button wide" disabled={saving || !canRegister} type="submit">
                <CheckCircle2 size={18} />
                <span>{saving ? 'Registrando...' : 'Registrar'}</span>
              </button>
              <button className="clear-button wide" type="button" onClick={onCancel}>
                <span>Cancelar</span>
              </button>
            </div>
          </section>

          <section className="points-card dashboard-card">
            <div className="card-heading points-card-heading">
              <div className="card-heading-icon">
                <Leaf size={18} />
              </div>
              <div>
                <h2>Puntos marcados</h2>
                <p>Coordenadas de los vertices del poligono.</p>
              </div>
              <span className="points-count">{form.coordenadas.length} puntos</span>
            </div>

            {form.coordenadas.length === 0 ? (
              <MapTutorial />
            ) : (
              <>
                <div className="scroll-area" {...coordinateDrag.containerProps}>
                  {form.coordenadas.map((point, index) => (
                    <div
                      className={`corner-card corner-card-draggable ${coordinateDrag.dropIndex === index && coordinateDrag.draggingIndex !== index ? 'coordinate-drop-target' : ''} ${coordinateDrag.draggingIndex === index ? 'coordinate-dragging' : ''}`}
                      key={`${point.lat}-${point.lng}-${index}`}
                      {...coordinateDrag.getItemProps(index)}
                    >
                      <div className="corner-card-header">
                        <GripVertical className="drag-handle" size={18} />
                        <span className="point-number">{index + 1}</span>
                        <strong>Esquina {index + 1}</strong>
                        <button type="button" onClick={() => deleteCoordinate(index)} aria-label={`Eliminar esquina ${index + 1}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="corner-grid">
                        <label>
                          Latitud
                          <input value={point.lat.toFixed(6)} readOnly />
                        </label>
                        <label>
                          Longitud
                          <input value={point.lng.toFixed(6)} readOnly />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="map-note">
                  <CheckCircle2 size={17} />
                  <span>Hace clic en el mapa para agregar vertices. Se recomienda marcar el lote en sentido horario o antihorario.</span>
                </div>
              </>
            )}
          </section>
        </div>
      </form>
    </section>
  );
}

function LoteDetailEdit({
  mode,
  lote,
  form,
  areaHa,
  areaM2,
  saving,
  fieldErrors = {},
  zones,
  zonesLoading,
  zoneMapTarget,
  onBack,
  onEdit,
  onSubmit,
  onFieldChange,
  onCoordinatesChange,
  onMapExpandedChange
}) {
  const isDetail = mode === 'detail';

  function deleteCoordinate(indexToDelete) {
    const updatedPoints = form.coordenadas.filter((_, index) => index !== indexToDelete);
    onCoordinatesChange(updatedPoints, form.cerrado && updatedPoints.length >= 3);
  }

  function moveCoordinate(fromIndex, toIndex) {
    if (isDetail) return;
    const updatedPoints = moveArrayItem(form.coordenadas, fromIndex, toIndex);
    onCoordinatesChange(updatedPoints, form.cerrado && updatedPoints.length >= 3);
  }

  const coordinateDrag = useCoordinateDrag({ disabled: isDetail, onMove: moveCoordinate });
  const hasChanges = useMemo(
    () => hasLoteFormChanges(lote, form, areaHa, areaM2),
    [lote, form, areaHa, areaM2]
  );

  if (!lote) {
    return (
      <section className="content-panel">
        <EmptyState
          icon={<Leaf size={96} strokeWidth={1.8} />}
          title="No hay un lote seleccionado"
          description="Volve al listado y elegi un lote para ver su detalle o editarlo."
          actionLabel="Volver a lotes"
          actionIcon={<ChevronDown size={18} />}
          onAction={onBack}
          variant="compact"
        />
      </section>
    );
  }

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading detail-heading">
        <div>
          <h1>{isDetail ? `Detalle ${form.nombre}` : `Editar ${form.nombre}`}</h1>
          <p>{isDetail ? 'Consulta la informacion general, superficie y vertices registrados para este lote.' : 'Actualiza la informacion general y ajusta el poligono del lote en el mapa.'}</p>
        </div>
        {isDetail && (
          <button className="green-button add-lote-button" type="button" onClick={onEdit}>
            <Edit size={18} />
            <span>Editar lote</span>
          </button>
        )}
      </div>

      <form onSubmit={onSubmit}>
        <div className="create-form-card dashboard-card detail-form-card">
          <div className="create-grid">
            {isDetail ? (
              <>
                <ReadOnlyField label="Nombre del lote" value={form.nombre} />
                <ReadOnlyField label="Pais" value={form.pais} />
                <ReadOnlyField label="Provincia" value={form.provincia} />
                <ReadOnlyField label="Zona" value={form.ciudad} />
                <ReadOnlyField label="Condicion" value={form.condicion} />
                <ReadOnlyField label="Cultivo actual" value={lote.cultivoActual || '-'} />
                <ReadOnlyField label="Estado cultivo" value={lote.estadoCultivo || '-'} />
              </>
            ) : (
              <>
                <RequiredInput label="Nombre del lote" value={form.nombre} onChange={(value) => onFieldChange('nombre', value)} error={fieldErrors.nombre} />
                <SearchableDropdown label="Pais" value={form.pais} onChange={(value) => onFieldChange('pais', value)} options={['Argentina']} error={fieldErrors.pais} />
                <SearchableDropdown label="Provincia" value={form.provincia} onChange={(value) => onFieldChange('provincia', value)} options={provinces} error={fieldErrors.provincia} />
                <SearchableDropdown
                  label="Zona"
                  value={form.ciudad}
                  onChange={(value) => onFieldChange('ciudad', value)}
                  options={zones}
                  placeholder="Buscar ciudad, pueblo o zona"
                  loading={zonesLoading}
                  error={fieldErrors.ciudad}
                />
                <SearchableDropdown label="Condicion" value={form.condicion} onChange={(value) => onFieldChange('condicion', value)} options={['Propio', 'Alquilado']} searchable={false} error={fieldErrors.condicion} />
                <GrainSelector
                  label="Cultivo anterior"
                  value={form.cultivoAnterior}
                  onChange={(value) => onFieldChange('cultivoAnterior', value)}
                  error={fieldErrors.cultivoAnterior}
                />
                <PreviousCampaignSelector
                  value={form.cultivoAnteriorCampania}
                  onChange={(value) => onFieldChange('cultivoAnteriorCampania', value)}
                  error={fieldErrors.cultivoAnteriorCampania}
                />
              </>
            )}
          </div>
        </div>

        {isDetail && <LoteCultivosHistory historial={lote.historialCultivos ?? []} />}
        {isDetail && (lote.historialDeshabilitaciones?.length ?? 0) > 0 && (
          <section className="lote-history-card dashboard-card">
            <div className="card-heading"><div className="card-heading-icon"><Ban size={18} /></div><div>
              <h2>Historial de deshabilitaciones</h2>
              <p>Bajas del lote, de sus planificaciones y motivos para omitir Verano.</p>
            </div></div>
            <div className="table-shell table-shell-inner"><table className="lotes-table"><thead><tr><th>Fecha</th><th>Alcance</th><th>Ciclo</th><th>Motivo</th><th>Detalle</th><th>Siniestro</th></tr></thead><tbody>
              {lote.historialDeshabilitaciones.map((item) => <tr key={item.registroId}>
                <td>{formatDate(item.fechaCreacion)}</td>
                <td>{item.tipoRegistro === 'Planificación' ? `Planificación de ${item.producto}` : item.tipoRegistro === 'Omisión de Verano' ? 'Sin planificación de Verano' : item.tipoRegistro === 'Siembra' ? 'Siembra' : 'Lote completo'}</td>
                <td>{item.cicloEstacional || 'Todos'}</td>
                <td>{item.motivo}</td><td>{item.detalle || '—'}</td>
                <td>{item.siniestro ? `${item.siniestro} · ${formatDate(item.fechaSiniestro)}` : '—'}</td>
              </tr>)}
            </tbody></table></div>
          </section>
        )}

        <div className="lote-editor-grid">
          <section className="map-card dashboard-card">
            <div className="card-heading">
              <div className="card-heading-icon">
                <MapIcon size={18} />
              </div>
              <div>
                <h2>Mapa del lote</h2>
                <p>{isDetail ? 'Visualiza el poligono registrado del lote.' : 'Move vertices o agrega nuevas esquinas si necesitas corregir el lote.'}</p>
              </div>
            </div>

            <PolygonMap
              points={form.coordenadas}
              closed={form.cerrado}
              areaHa={areaHa}
              areaM2={areaM2}
              onChange={onCoordinatesChange}
              onExpandedChange={onMapExpandedChange}
              readOnly={isDetail}
              mapTarget={isDetail ? null : zoneMapTarget}
            />

            <div className="area-grid">
              <label>
                Hectareas calculadas
                <input value={areaHa ? `${areaHa.toFixed(4)} ha` : ''} readOnly />
              </label>
              <label>
                Superficie total calculada
                <input value={areaM2 ? `${areaM2.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m2` : ''} readOnly />
              </label>
            </div>
            {!isDetail && fieldErrors.coordenadas && <small className="field-error map-field-error">{fieldErrors.coordenadas}</small>}

            <div className="form-actions">
              {isDetail ? (
                <button className="back-button detail-back-button" type="button" onClick={onBack}>
                  <ChevronDown size={17} />
                  <span>Volver</span>
                </button>
              ) : (
                <>
                  <button className="green-button wide" disabled={saving || !hasChanges} type="submit">
                    <CheckCircle2 size={18} />
                    <span>{saving ? 'Guardando...' : 'Guardar cambios'}</span>
                  </button>
                  <button className="clear-button wide" type="button" onClick={onBack}>
                    <span>Cancelar</span>
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="points-card dashboard-card">
            <div className="card-heading points-card-heading">
              <div className="card-heading-icon">
                <Leaf size={18} />
              </div>
              <div>
                <h2>Puntos marcados</h2>
                <p>Coordenadas de los vertices del poligono.</p>
              </div>
              <span className="points-count">{form.coordenadas.length} puntos</span>
            </div>

            {form.coordenadas.length === 0 ? (
              <MapTutorial />
            ) : (
              <>
                <div className="scroll-area" {...coordinateDrag.containerProps}>
                  {form.coordenadas.map((point, index) => (
                    <div
                      className={`corner-card ${isDetail ? '' : 'corner-card-draggable'} ${coordinateDrag.dropIndex === index && coordinateDrag.draggingIndex !== index ? 'coordinate-drop-target' : ''} ${coordinateDrag.draggingIndex === index ? 'coordinate-dragging' : ''}`}
                      key={`${point.lat}-${point.lng}-${index}`}
                      {...coordinateDrag.getItemProps(index)}
                    >
                      <div className="corner-card-header">
                        {!isDetail && <GripVertical className="drag-handle" size={18} />}
                        <span className="point-number">{index + 1}</span>
                        <strong>Esquina {index + 1}</strong>
                        {!isDetail && (
                          <button type="button" onClick={() => deleteCoordinate(index)} aria-label={`Eliminar esquina ${index + 1}`}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="corner-grid">
                        <label>
                          Latitud
                          <input value={point.lat.toFixed(6)} readOnly />
                        </label>
                        <label>
                          Longitud
                          <input value={point.lng.toFixed(6)} readOnly />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="map-note">
                  <CheckCircle2 size={17} />
                  <span>{isDetail ? 'Estos puntos forman el perimetro registrado del lote.' : 'Hace clic en el mapa para agregar vertices. Se recomienda marcar el lote en sentido horario o antihorario.'}</span>
                </div>
              </>
            )}
          </section>
        </div>
      </form>
    </section>
  );
}

function MapTutorial() {
  return (
    <div className="map-tutorial">
      <div className="tutorial-title">
        <span>
          <MapIcon size={26} />
        </span>
        <strong>Delimita tu lote en el mapa</strong>
      </div>
      <p>Sigue estos pasos para dibujar el perimetro de tu lote:</p>
      <div className="tutorial-steps">
        <div className="tutorial-step">
          <span>1</span>
          <MousePointerClick className="tutorial-step-icon" size={27} />
          <div>
            <strong>Haz clic en el mapa para colocar el primer punto.</strong>
            <p>Ese sera el inicio del perimetro.</p>
          </div>
        </div>
        <div className="tutorial-step">
          <span>2</span>
          <Route className="tutorial-step-icon" size={27} />
          <div>
            <strong>Continua haciendo clic en cada esquina del lote.</strong>
            <p>Los puntos se uniran con lineas y podras moverlos si hace falta.</p>
          </div>
        </div>
        <div className="tutorial-step">
          <span>3</span>
          <CheckCircle2 className="tutorial-step-icon" size={27} />
          <div>
            <strong>Haz clic en el primer punto para cerrar el lote.</strong>
            <p>El area se calculara automaticamente.</p>
          </div>
        </div>
      </div>
      <div className="tutorial-tip">
        <Lightbulb size={22} />
        <div>
          <strong>Consejo util</strong>
          <p>Puedes acercar o alejar el mapa con los botones + y - para ubicar mejor tu lote.</p>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <label className="field read-only-field">
      <span>{label}</span>
      <input value={value} readOnly />
    </label>
  );
}

function FieldError({ message }) {
  return message ? <small className="field-error">{message}</small> : null;
}

function RequiredInput({ label, value, onChange, error }) {
  return (
    <label className={`field ${error ? 'field-with-error' : ''}`}>
      <span>{label} <b>*</b></span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required />
      <FieldError message={error} />
    </label>
  );
}

function RequiredSelect({ label, value, onChange, options, error }) {
  return (
    <label className={`field ${error ? 'field-with-error' : ''}`}>
      <span>{label} <b>*</b></span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
      <FieldError message={error} />
    </label>
  );
}

function GrainSelector({ label, value, onChange, error }) {
  const initialSelected = commonGrains.includes(value) ? value : value ? 'Otro' : '';
  const [selectedGrain, setSelectedGrain] = useState(initialSelected);
  const [customValue, setCustomValue] = useState(initialSelected === 'Otro' ? value : '');

  useEffect(() => {
    if (!value || commonGrains.includes(value)) {
      setSelectedGrain(value || '');
      setCustomValue('');
    } else {
      setSelectedGrain('Otro');
      setCustomValue(value);
    }
  }, [value]);

  function handleSelect(nextValue) {
    setSelectedGrain(nextValue);
    if (nextValue === 'Otro') {
      onChange(customValue);
      return;
    }

    onChange(nextValue);
  }

  function handleCustomChange(nextValue) {
    const limitedValue = nextValue.slice(0, 10);
    setCustomValue(limitedValue);
    onChange(limitedValue);
  }

  return (
    <label className={`field ${error ? 'field-with-error' : ''}`}>
      <span>{label} <b>*</b></span>
      <select value={selectedGrain} onChange={(event) => handleSelect(event.target.value)} required>
        <option value="">Seleccionar</option>
        {commonGrains.map((grain) => <option key={grain} value={grain}>{grain}</option>)}
      </select>
      {selectedGrain === 'Otro' && (
        <input
          value={customValue}
          maxLength={10}
          onChange={(event) => handleCustomChange(event.target.value)}
          placeholder="Otro grano"
          required
        />
      )}
      <FieldError message={error} />
    </label>
  );
}

function PreviousCampaignSelector({ value, onChange, error }) {
  const options = useMemo(() => getPreviousCampaignOptions(), []);

  return (
    <label className={`field ${error ? 'field-with-error' : ''}`}>
      <span>Campaña del cultivo anterior <b>*</b></span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Seleccionar</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <FieldError message={error} />
    </label>
  );
}

function LoteCultivosHistory({ historial }) {
  return (
    <section className="lote-history-card dashboard-card">
      <div className="card-heading">
        <div className="card-heading-icon">
          <Sprout size={18} />
        </div>
        <div>
          <h2>Historial de cultivos</h2>
          <p>Cultivos registrados por campaña, del mas reciente al mas antiguo.</p>
        </div>
      </div>
      <div className="table-shell table-shell-inner">
        <table className="lotes-table">
          <thead>
            <tr>
              <th>Campaña</th>
              <th>Cultivo</th>
              <th>Fecha de Inicio</th>
              <th>Fecha de Fin</th>
              <th>Estado cultivo</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((item, index) => (
              <tr key={`${item.campania}-${item.cultivo}-${index}`}>
                <td>{item.campania}</td>
                <td><CultivoChip value={item.cultivo} estado={item.estadoCultivo} /></td>
                <td>{formatDate(item.fechaInicio)}</td>
                <td>{formatDate(item.fechaFin)}</td>
                <td><CultivoChip value={item.estadoCultivo} estado={item.estadoCultivo} /></td>
              </tr>
            ))}
            {historial.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center' }}>Todavia no hay cultivos registrados por campaña.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SearchableDropdown({ label, value, onChange, options, placeholder = 'Buscar...', loading = false, searchable = true, error }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef(null);
  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const normalizedQuery = normalizeSearchText(query.trim());
    if (!normalizedQuery) return options;
    return options.filter((option) => normalizeSearchText(option).includes(normalizedQuery));
  }, [options, query, searchable]);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  function chooseOption(option) {
    onChange(option);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className={`field dropdown-field ${error ? 'field-with-error' : ''}`} ref={wrapperRef}>
      <span>{label} <b>*</b></span>
      <button className="dropdown-button" type="button" onClick={() => setOpen((current) => !current)}>
        <span>{value || `Seleccionar ${label.toLowerCase()}`}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="dropdown-menu">
          {searchable && (
            <input
              className="dropdown-search"
              data-text-case="preserve"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              autoFocus
            />
          )}
          <div className="dropdown-options">
            {loading && (
              <p className="dropdown-empty">Cargando localidades...</p>
            )}
            {!loading && filteredOptions.length === 0 && (
              <p className="dropdown-empty">Sin resultados.</p>
            )}
            {!loading && filteredOptions.map((option) => (
              <button
                className={`dropdown-option ${option === value ? 'dropdown-option-selected' : ''}`}
                type="button"
                key={option}
                onClick={() => chooseOption(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
      <FieldError message={error} />
    </div>
  );
}

export { LoteCreate, LoteDetailEdit };
