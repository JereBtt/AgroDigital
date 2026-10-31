import { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, ChevronDown, Eye, FileText, Filter, Handshake, Home, Leaf, LoaderCircle, Map as MapIcon, PlusCircle, RotateCcw, Search, Sprout, Tractor, Edit } from 'lucide-react';
import AlignedTableNumber from '../../shared/components/AlignedTableNumber.jsx';
import SummaryCard from '../../shared/components/SummaryCard.jsx';
import { normalizeSearchText } from '../../shared/utils/normalizeSearchText.js';
import { formatHectares } from './loteUtils.js';
import { downloadLotesReport } from './lotePdf.js';
import { ExportLotesConfirmation } from './LoteModals.jsx';
import CultivoChip from './CultivoChip.jsx';
import EmptyState from './EmptyState.jsx';

function LotesList({ permisos = { estructura: true }, lotes, loading, parentFilters, onAdd, onView, onEdit, onToggleStatus, statusSaving, activeCampaignEmpresaIds }) {
  const [query, setQuery] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('habilitados');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [selectedLoteIds, setSelectedLoteIds] = useState([]);
  const [exportConfirmationOpen, setExportConfirmationOpen] = useState(false);

  const provinceOptions = useMemo(() => [...new Set(lotes.map((lote) => lote.provincia).filter(Boolean))], [lotes]);
  const zoneOptions = useMemo(() => [...new Set(lotes.map((lote) => lote.ciudad).filter(Boolean))], [lotes]);
  const statusFilteredLotes = useMemo(() => lotes.filter((lote) => (
    statusFilter === 'habilitados' ? lote.activo : !lote.activo
  )), [lotes, statusFilter]);
  const filteredLotes = useMemo(() => statusFilteredLotes.filter((lote) => {
    const createdAt = lote.fechaCreacion ? new Date(lote.fechaCreacion) : null;
    const fromDate = dateFromFilter ? new Date(`${dateFromFilter}T00:00:00`) : null;
    const toDate = dateToFilter ? new Date(`${dateToFilter}T23:59:59`) : null;
    const matchesQuery = normalizeSearchText(lote.nombre).includes(normalizeSearchText(query.trim()));
    const matchesCondition = !conditionFilter || lote.condicion === conditionFilter;
    const matchesZone = !zoneFilter || lote.ciudad === zoneFilter;
    const matchesProvince = !provinceFilter || lote.provincia === provinceFilter;
    const matchesDateFrom = !fromDate || (createdAt && createdAt >= fromDate);
    const matchesDateTo = !toDate || (createdAt && createdAt <= toDate);
    return matchesQuery && matchesCondition && matchesZone && matchesProvince && matchesDateFrom && matchesDateTo;
  }), [conditionFilter, dateFromFilter, dateToFilter, provinceFilter, query, statusFilteredLotes, zoneFilter]);
  const summary = useMemo(() => ({
    total: filteredLotes.length,
    hectareasTotales: filteredLotes
      .reduce((sum, lote) => sum + Number(lote.hectareas ?? 0), 0),
    hectareasPropias: filteredLotes
      .filter((lote) => lote.condicion === 'Propio')
      .reduce((sum, lote) => sum + Number(lote.hectareas ?? 0), 0),
    hectareasAlquiladas: filteredLotes
      .filter((lote) => lote.condicion === 'Alquilado')
      .reduce((sum, lote) => sum + Number(lote.hectareas ?? 0), 0)
  }), [filteredLotes]);
  const selectedLotes = useMemo(() => lotes.filter((lote) => selectedLoteIds.includes(lote.loteId)), [lotes, selectedLoteIds]);
  const allVisibleSelected = filteredLotes.length > 0 && filteredLotes.every((lote) => selectedLoteIds.includes(lote.loteId));

  useEffect(() => {
    setSelectedLoteIds((current) => current.filter((loteId) => lotes.some((lote) => lote.loteId === loteId)));
  }, [lotes]);

  function toggleLoteSelection(loteId) {
    setSelectedLoteIds((current) => current.includes(loteId)
      ? current.filter((selectedId) => selectedId !== loteId)
      : [...current, loteId]);
  }

  function toggleVisibleLotesSelection() {
    const visibleIds = filteredLotes.map((lote) => lote.loteId);
    setSelectedLoteIds((current) => allVisibleSelected
      ? current.filter((loteId) => !visibleIds.includes(loteId))
      : [...new Set([...current, ...visibleIds])]);
  }

  function confirmExport() {
    downloadLotesReport(selectedLotes);
    setExportConfirmationOpen(false);
  }

  function clearFilters() {
    setQuery('');
    setConditionFilter('');
    setZoneFilter('');
    setProvinceFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setStatusFilter('habilitados');
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Lotes</h1>
          <p>Gestiona y consulta todos los lotes de tu operacion.</p>
        </div>
        <div className="lotes-heading-actions">
          <button className="export-lotes-button" type="button" disabled={selectedLotes.length === 0} onClick={() => setExportConfirmationOpen(true)}>
            <FileText size={18} />
            <span>Exportar PDF{selectedLotes.length > 0 ? ` (${selectedLotes.length})` : ''}</span>
          </button>
          <>{permisos.estructura && (<button className="green-button add-lote-button" type="button" onClick={onAdd}>
            <PlusCircle size={18} />
            <span>Registrar lote</span>
          </button>)}</>
        </div>
      </div>
      {parentFilters}

      <div className="summary-grid summary-grid-four">
        <SummaryCard icon={<MapIcon size={30} />} label="Total de lotes" value={summary.total} helper="Lotes registrados en el sistema" />
        <SummaryCard icon={<Sprout size={30} />} label="Hectareas totales" value={`${formatHectares(summary.hectareasTotales)} ha`} helper="Superficie total de los lotes filtrados" />
        <SummaryCard icon={<Home size={30} />} label="Hectareas propias" value={`${formatHectares(summary.hectareasPropias)} ha`} helper="Superficie total con condicion propio" />
        <SummaryCard icon={<Handshake size={30} />} label="Hectareas alquiladas" value={`${formatHectares(summary.hectareasAlquiladas)} ha`} helper="Superficie total con condicion alquilado" />
      </div>

      <div className="filters-card lotes-filters">
        <div className="status-segmented" role="group" aria-label="Estado de lotes">
          <button
            className={statusFilter === 'habilitados' ? 'status-segmented-active' : ''}
            type="button"
            onClick={() => setStatusFilter('habilitados')}
          >
            Habilitados
          </button>
          <button
            className={statusFilter === 'deshabilitados' ? 'status-segmented-active' : ''}
            type="button"
            onClick={() => setStatusFilter('deshabilitados')}
          >
            Deshabilitados
          </button>
        </div>
        <label className="search-field">
          <Search size={21} />
          <input data-text-case="preserve" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre de lote..." />
        </label>
        <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)}>
          <option value="">Condicion</option>
          <option value="Propio">Propio</option>
          <option value="Alquilado">Alquilado</option>
        </select>
        <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
          <option value="">Zona</option>
          {zoneOptions.map((zone) => <option key={zone}>{zone}</option>)}
        </select>
        <select value={provinceFilter} onChange={(event) => setProvinceFilter(event.target.value)}>
          <option value="">Provincia</option>
          {provinceOptions.map((province) => <option key={province}>{province}</option>)}
        </select>
        <button className="soft-filter-button" type="button" onClick={() => setShowMoreFilters((current) => !current)}>
          <Filter size={17} />
          <span>Mas filtros</span>
        </button>
        <button className="clear-button" type="button" onClick={clearFilters}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
        {showMoreFilters && (
          <div className="extra-filters-row">
            <label>
              <span>Desde</span>
              <input type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} />
            </label>
            <label>
              <span>Hasta</span>
              <input type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} />
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <div className="table-shell dashboard-card">
          <div className="loading-state">
            <LoaderCircle className="spin" size={24} />
            <span>Cargando lotes...</span>
          </div>
        </div>
      ) : lotes.length === 0 ? (
        <EmptyState
          icon={<Tractor size={104} strokeWidth={1.8} />}
          title="Aun no tenes lotes registrados..."
          description="Registra tus lotes y comenza a operar con AgroDigital."
          actionLabel={permisos.estructura ? 'Registrar lote' : undefined}
          onAction={onAdd}
        />
      ) : filteredLotes.length === 0 ? (
        <EmptyState
          icon={<Search size={92} strokeWidth={1.8} />}
          title={statusFilteredLotes.length === 0 ? `No hay lotes ${statusFilter}` : 'No encontramos lotes con esos filtros'}
          description={statusFilteredLotes.length === 0 && statusFilter === 'habilitados'
            ? 'Los lotes deshabilitados se encuentran en la pestaña Deshabilitados.'
            : 'Proba limpiar la busqueda para volver a ver los registros disponibles.'}
          actionLabel={statusFilteredLotes.length === 0 && statusFilter === 'habilitados' ? 'Ver deshabilitados' : 'Limpiar'}
          actionIcon={statusFilteredLotes.length === 0 && statusFilter === 'habilitados' ? <Eye size={18} /> : <RotateCcw size={18} />}
          onAction={statusFilteredLotes.length === 0 && statusFilter === 'habilitados' ? () => setStatusFilter('deshabilitados') : clearFilters}
          variant="compact"
        />
      ) : (
        <>
          <div className="table-shell dashboard-card">
            <table className="lotes-table">
              <thead>
                <tr>
                  <th className="check-cell">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleLotesSelection} aria-label="Seleccionar todos los lotes visibles" />
                  </th>
                  <th></th>
                  <th>Nombre</th>
                  <th>Provincia</th>
                  <th>Zona</th>
                  <th>Condicion</th>
                  <th>Cultivo</th>
                  <th>Estado cultivo</th>
                  <th>Hectareas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredLotes.map((lote) => (
                  <tr key={lote.loteId}>
                    <td className="check-cell">
                      <input type="checkbox" checked={selectedLoteIds.includes(lote.loteId)} onChange={() => toggleLoteSelection(lote.loteId)} aria-label={`Seleccionar ${lote.nombre}`} />
                    </td>
                    <td className="lote-icon-cell">
                      <span className="lote-row-icon"><Leaf size={22} /></span>
                    </td>
                    <td>{lote.nombre}{!lote.activo && <span className="lote-disabled-reason">{lote.historialDeshabilitaciones?.find((item) => item.tipoRegistro === 'Lote')?.motivo || 'Deshabilitado'}</span>}</td>
                    <td>{lote.provincia}</td>
                    <td>{lote.ciudad}</td>
                    <td>
                      <span className={`condition-chip ${lote.condicion === 'Alquilado' ? 'condition-chip-rented' : ''}`}>
                        {lote.condicion === 'Alquilado' ? <Handshake size={14} /> : <Home size={14} />}
                        {lote.condicion}
                      </span>
                    </td>
                    <td><CultivoChip value={lote.cultivoActual || lote.cultivoAnterior || '-'} estado={lote.estadoCultivo} /></td>
                    <td><CultivoChip value={lote.estadoCultivo || 'Sin cultivo'} estado={lote.estadoCultivo} /></td>
                    <td className="aligned-table-number-cell"><AlignedTableNumber value={lote.hectareas} unit="ha" /></td>
                    <td className="actions-cell lote-actions-cell">
                      <div className="actions-cell-content">
                      <button className="table-action-tooltip" data-tooltip="Ver detalle" type="button" aria-label={`Ver ${lote.nombre}`} onClick={() => onView(lote)}><Eye size={18} /></button>
                      <>{permisos.estructura && (<button className="table-action-tooltip" data-tooltip="Editar" type="button" aria-label={`Editar ${lote.nombre}`} onClick={() => onEdit(lote)}><Edit size={18} /></button>)}</>
                      <>{permisos.estructura && (<button
                        className={`table-action-tooltip status-action-button ${lote.activo ? 'status-action-disable' : 'status-action-enable'}`}
                        data-tooltip={lote.activo && activeCampaignEmpresaIds?.has(String(lote.empresaId)) ? 'Desde Campañas' : lote.activo ? 'Deshabilitar' : 'Habilitar'}
                        type="button"
                        aria-label={`${lote.activo ? 'Deshabilitar' : 'Habilitar'} ${lote.nombre}`}
                        disabled={(lote.activo && activeCampaignEmpresaIds?.has(String(lote.empresaId))) || statusSaving === `deshabilitar-${lote.loteId}` || statusSaving === `habilitar-${lote.loteId}`}
                        onClick={() => onToggleStatus(lote)}
                      >
                        {statusSaving === `deshabilitar-${lote.loteId}` || statusSaving === `habilitar-${lote.loteId}`
                          ? <LoaderCircle className="spin" size={18} />
                          : lote.activo ? <Ban size={18} /> : <CheckCircle2 size={18} />}
                        <span>{lote.activo ? 'Deshabilitar' : 'Habilitar'}</span>
                      </button>)}</>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="list-footer dashboard-card">
            <button className="back-button" type="button">
              <ChevronDown size={17} />
              <span>Volver</span>
            </button>
            <span>Mostrando 1 a {filteredLotes.length} de {statusFilteredLotes.length} lotes {statusFilter === 'habilitados' ? 'habilitados' : 'deshabilitados'}</span>
            <div className="pagination">
              <button type="button" disabled>{'<'}</button>
              <strong>1</strong>
              <button type="button" disabled>{'>'}</button>
            </div>
          </div>
        </>
      )}
      {exportConfirmationOpen && (
        <ExportLotesConfirmation
          lotes={selectedLotes}
          onCancel={() => setExportConfirmationOpen(false)}
          onConfirm={confirmExport}
        />
      )}
    </section>
  );
}

export default LotesList;
