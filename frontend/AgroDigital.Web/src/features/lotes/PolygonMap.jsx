import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { GripVertical, MapPin, Maximize2, Minimize2, PlusCircle, Trash2, Wand2 } from 'lucide-react';
import { defaultCenter } from './loteCatalogos.js';
import { distanceMeters, moveArrayItem } from './loteUtils.js';
import useCoordinateDrag from './useCoordinateDrag.js';

function PolygonMap({ points, closed, areaHa, areaM2, onChange, onExpandedChange, readOnly = false, mapTarget = null }) {
  const [expanded, setExpanded] = useState(false);
  const [addingPoints, setAddingPoints] = useState(false);
  const [mapNode, setMapNode] = useState(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const baseLayersRef = useRef({});
  const pointsRef = useRef(points);
  const closedRef = useRef(closed);
  const readOnlyRef = useRef(readOnly);
  const addingPointsRef = useRef(addingPoints);
  const initialFitDoneRef = useRef(false);
  const selectedBaseLayerRef = useRef('hibrido');
  const mapViewRef = useRef(null);
  const mapTargetRef = useRef(mapTarget);
  const lastMapTargetRef = useRef('');
  const coordinateDrag = useCoordinateDrag({ disabled: readOnly, onMove: movePoint });

  function focusMapOnTarget(animate = true) {
    const target = mapTargetRef.current;
    if (!mapRef.current || !target) return;

    const targetKey = `${target.latitude}:${target.longitude}`;
    if (lastMapTargetRef.current === targetKey) return;

    lastMapTargetRef.current = targetKey;
    mapRef.current.invalidateSize();
    mapRef.current.flyTo([target.latitude, target.longitude], 14, {
      animate,
      duration: animate ? 0.7 : 0
    });
  }

  useEffect(() => {
    mapTargetRef.current = mapTarget;
    focusMapOnTarget();
  }, [mapTarget]);

  useEffect(() => {
    pointsRef.current = points;
    closedRef.current = closed;
    readOnlyRef.current = readOnly;
    addingPointsRef.current = addingPoints;
    if (!closed || readOnly) {
      setAddingPoints(false);
    }
    renderLayers();
    fitInitialBounds();
  }, [points, closed, readOnly, addingPoints]);

  useEffect(() => {
    onExpandedChange?.(expanded);
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (expanded) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.body.classList.add('agro-map-expanded');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }

    if (expanded) {
      requestAnimationFrame(() => mapRef.current?.invalidateSize());
      setTimeout(() => mapRef.current?.invalidateSize(), 80);
      setTimeout(() => mapRef.current?.invalidateSize(), 240);
      setTimeout(() => mapRef.current?.invalidateSize(), 480);
    } else {
      setTimeout(() => mapRef.current?.invalidateSize(), 120);
    }

    return () => {
      document.body.classList.remove('agro-map-expanded');
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [expanded, onExpandedChange]);

  useEffect(() => () => onExpandedChange?.(false), [onExpandedChange]);

  useEffect(() => {
    if (!mapNode) return;

    layerRef.current = L.layerGroup();
    const savedView = mapViewRef.current;
    const map = L.map(mapNode, {
      center: savedView?.center ?? defaultCenter,
      zoom: savedView?.zoom ?? 16,
      minZoom: 4,
      maxZoom: 22,
      zoomControl: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 42
    });

    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap'
    });

    const sateliteLimpio = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 17,
      attribution: 'Tiles © Esri'
    });

    const sateliteConEtiquetas = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 17,
      attribution: 'Tiles © Esri'
    });

    const etiquetas = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 17,
      attribution: 'Labels © Esri'
    });

    const hibrido = L.layerGroup([sateliteConEtiquetas, etiquetas]);
    baseLayersRef.current = {
      calles,
      hibrido,
      sateliteLimpio
    };

    const baseLayers = {
      'Calles y limites': calles,
      'Satelite con nombres': hibrido,
      'Satelite limpio': sateliteLimpio
    };

    const selectedLayerKey = selectedBaseLayerRef.current;
    const selectedLayer = baseLayersRef.current[selectedLayerKey] ?? hibrido;
    selectedLayer.addTo(map);
    const selectedLayerIsSatellite = selectedLayerKey !== 'calles';
    map.setMaxZoom(selectedLayerIsSatellite ? 17 : 22);
    if (selectedLayerIsSatellite && map.getZoom() > 17) {
      map.setZoom(17, { animate: false });
    }

    L.control.layers(baseLayers, {}, { position: 'topright', collapsed: false }).addTo(map);

    map.on('baselayerchange', (event) => {
      selectedBaseLayerRef.current = event.name === 'Calles y limites'
        ? 'calles'
        : event.name === 'Satelite limpio'
          ? 'sateliteLimpio'
          : 'hibrido';
      const isSatellite = event.name.includes('Satelite');
      map.setMaxZoom(isSatellite ? 17 : 22);
      if (isSatellite && map.getZoom() > 17) {
        map.setZoom(17);
      }
    });

    layerRef.current.addTo(map);
    map.on('click', (event) => {
      if (readOnlyRef.current) return;

      const currentPoints = pointsRef.current;
      if (closedRef.current) {
        if (!addingPointsRef.current) return;
        onChange([...currentPoints, event.latlng], true);
        return;
      }

      if (currentPoints.length >= 3 && distanceMeters(event.latlng, currentPoints[0]) < 18) {
        onChange(currentPoints, true);
        return;
      }

      onChange([...currentPoints, event.latlng], false);
    });

    mapRef.current = map;
    renderLayers();
    focusMapOnTarget(false);
    setTimeout(() => {
      map.invalidateSize();
      fitInitialBounds();
    }, 0);
    setTimeout(() => {
      map.invalidateSize();
      fitInitialBounds();
    }, 180);

    return () => {
      const center = map.getCenter();
      mapViewRef.current = {
        center: [center.lat, center.lng],
        zoom: map.getZoom()
      };
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      baseLayersRef.current = {};
    };
  }, [expanded, mapNode, onChange]);

  function renderLayers() {
    if (!mapRef.current || !layerRef.current) return;

    layerRef.current.clearLayers();

    if (points.length >= 2) {
      L.polyline(points, { color: '#df3b30', weight: 2, opacity: 0.95 }).addTo(layerRef.current);
    }

    if (closed && points.length >= 3) {
      L.polygon(points, {
        color: '#df3b30',
        weight: 2,
        fillColor: '#1c8c3a',
        fillOpacity: 0.18
      }).addTo(layerRef.current);
    }

    points.forEach((point, index) => {
      const marker = L.marker(point, {
        draggable: !readOnly,
        icon: L.divIcon({
          className: `corner-marker ${index === 0 ? 'corner-marker-first' : ''}`,
          html: `<span>${index + 1}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      }).addTo(layerRef.current);

      marker.on('dragend', (event) => {
        if (readOnly) return;

        const movedPoint = event.target.getLatLng();
        const updatedPoints = points.map((currentPoint, currentIndex) =>
          currentIndex === index ? movedPoint : currentPoint
        );
        onChange(updatedPoints, closed);
      });

      if (!readOnly && index === 0 && points.length >= 3 && !closed) {
        marker.on('click', () => onChange(points, true));
        marker.bindTooltip('Cerrar lote', { permanent: false });
      }
    });

  }

  function fitInitialBounds() {
    if (!mapRef.current || initialFitDoneRef.current || pointsRef.current.length === 0) return;

    initialFitDoneRef.current = true;

    window.setTimeout(() => {
      if (!mapRef.current || pointsRef.current.length === 0) return;

      mapRef.current.invalidateSize();
      const bounds = L.latLngBounds(pointsRef.current);
      if (!bounds.isValid()) return;

      if (pointsRef.current.length === 1) {
        mapRef.current.setView(pointsRef.current[0], 17, { animate: false });
        return;
      }

      mapRef.current.fitBounds(bounds.pad(0.2), {
        animate: false,
        maxZoom: 17
      });
    }, 90);
  }

  function resetMap() {
    onChange([], false);
    initialFitDoneRef.current = false;
    setAddingPoints(false);
  }

  function deletePoint(indexToDelete) {
    const updatedPoints = points.filter((_, index) => index !== indexToDelete);
    const shouldStayClosed = closed && updatedPoints.length >= 3;
    onChange(updatedPoints, shouldStayClosed);
    if (!shouldStayClosed) {
      setAddingPoints(false);
    }
  }

  function movePoint(fromIndex, toIndex) {
    if (readOnly) return;
    const updatedPoints = moveArrayItem(points, fromIndex, toIndex);
    onChange(updatedPoints, closed && updatedPoints.length >= 3);
  }

  function toggleExpandedMap() {
    if (mapRef.current) {
      const center = mapRef.current.getCenter();
      mapViewRef.current = {
        center: [center.lat, center.lng],
        zoom: mapRef.current.getZoom()
      };
    }

    if (!expanded) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    setExpanded((current) => !current);
  }

  const mapContent = (
    <div className={`map-box ${expanded ? 'map-box-expanded' : ''} ${readOnly ? 'map-box-readonly' : ''}`}>
      <div ref={setMapNode} className="map-canvas" />
      <div className="map-help">
        <MapPin size={24} />
        <span>
          <strong>{readOnly ? 'Poligono del lote.' : closed ? 'Poligono cerrado.' : 'Marca las esquinas del lote.'}</strong>
          {readOnly ? ' Consulta los vertices registrados.' : closed ? (addingPoints ? ' Hace clic para sumar vertices.' : ' Podes mover los puntos.') : ' Toca el primer punto para cerrar.'}
        </span>
      </div>
      <button
        className="map-expand"
        type="button"
        onClick={toggleExpandedMap}
      >
        {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        <span>{expanded ? 'Contraer' : 'Expandir'}</span>
      </button>
      {!readOnly && (
        <div className="map-edit-actions">
          {closed && (
            <button
              className={`map-add-points ${addingPoints ? 'map-add-points-active' : ''}`}
              type="button"
              onClick={() => setAddingPoints((current) => !current)}
            >
              <PlusCircle size={17} />
              <span>{addingPoints ? 'Finalizar agregado' : 'Agregar puntos'}</span>
            </button>
          )}
          <button className="map-reset" type="button" onClick={resetMap}>
            <Wand2 size={17} />
            <span>Limpiar puntos</span>
          </button>
        </div>
      )}
      {expanded && (
        <div className="expanded-coordinates">
          <div className="expanded-coordinates-header">
            <strong>Coordenadas</strong>
            <span>{points.length} puntos</span>
          </div>
          {closed && points.length >= 3 && (
            <div className="expanded-area">
              <div>
                <small>Hectareas</small>
                <strong>{areaHa.toFixed(4)}</strong>
              </div>
              <div>
                <small>Superficie</small>
                <strong>{areaM2.toFixed(2)} m2</strong>
              </div>
            </div>
          )}
          {points.length === 0 && (
            <p className="expanded-empty">Marca las esquinas del lote sobre el mapa.</p>
          )}
          <div className="expanded-coordinate-list" {...coordinateDrag.containerProps}>
            {points.map((point, index) => (
              <div
                className={`expanded-coordinate-row ${readOnly ? '' : 'expanded-coordinate-row-draggable'} ${coordinateDrag.dropIndex === index && coordinateDrag.draggingIndex !== index ? 'coordinate-drop-target' : ''} ${coordinateDrag.draggingIndex === index ? 'coordinate-dragging' : ''}`}
                key={`${point.lat}-${point.lng}-${index}`}
                {...coordinateDrag.getItemProps(index)}
              >
                {!readOnly && <GripVertical className="drag-handle" size={16} />}
                <span className="point-number">{index + 1}</span>
                <div>
                  <small>Latitud</small>
                  <strong>{point.lat.toFixed(6)}</strong>
                </div>
                <div>
                  <small>Longitud</small>
                  <strong>{point.lng.toFixed(6)}</strong>
                </div>
                {!readOnly && (
                  <button type="button" onClick={() => deletePoint(index)} aria-label={`Eliminar punto ${index + 1}`}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return expanded ? createPortal(
    <>
      <div className="map-expanded-backdrop" />
      {mapContent}
    </>,
    document.body
  ) : mapContent;
}

export default PolygonMap;
