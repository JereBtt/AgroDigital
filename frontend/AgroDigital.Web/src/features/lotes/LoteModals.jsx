import { createPortal } from 'react-dom';
import { AlertTriangle, Ban, CalendarDays, CheckCircle2, FileText, LoaderCircle, PlusCircle, RotateCcw, Sprout } from 'lucide-react';

function EnableLoteWithSiembrasConfirmation({ lote, contexto, saving, onCancel, onRestore, onNewSowing }) {
  const fechaSiniestro = contexto.fechaSiniestro?.slice(0, 10).split('-').reverse().join('/');
  const motivo = [contexto.motivo, contexto.siniestro, fechaSiniestro, contexto.detalle].filter(Boolean).join(' · ');
  const ultimaEtapa = [contexto.ultimaSiembraNombre, contexto.ultimaSiembraTipo, contexto.ultimoCultivo].filter(Boolean).join(' · ');
  return createPortal(
    <div className="confirmation-modal-backdrop" role="presentation">
      <section className="confirmation-modal enable-lote-history-modal" role="dialog" aria-modal="true" aria-labelledby="enable-history-title" aria-describedby="enable-history-description">
        <span className="confirmation-modal-icon confirmation-modal-icon-success" aria-hidden="true"><Sprout size={28} /></span>
        <div>
          <h2 id="enable-history-title">Habilitar {lote.nombre}</h2>
          <p id="enable-history-description">La baja se registró por <strong>{motivo || 'un motivo anterior'}</strong>. Elegí cómo querés continuar.</p>
        </div>
        {ultimaEtapa && <div className="enable-lote-history-current"><span>Última etapa antes de la baja</span><strong>{ultimaEtapa}</strong></div>}
        {!contexto.campaniaActiva && <p className="enable-lote-history-notice">La campaña terminó: no se puede revertir la baja ni iniciar otra siembra en ella.</p>}
        {contexto.campaniaActiva && !contexto.puedeRestaurar && <p className="enable-lote-history-notice">Esta baja anterior no conserva los datos necesarios para restaurar exactamente el seguimiento. Podés conservar las siembras como historial y empezar una nueva.</p>}
        <div className="enable-lote-history-actions">
          <button className="enable-lote-history-option" type="button" onClick={onRestore} disabled={saving || !contexto.puedeRestaurar}>
            <RotateCcw size={20} aria-hidden="true" /><span><strong>Habilitar lote y sus siembras</strong><small>Recupera la siembra, sus resiembras y la última etapa activa.</small></span>
          </button>
          <button className="enable-lote-history-option" type="button" onClick={onNewSowing} disabled={saving || !contexto.campaniaActiva}>
            <Sprout size={20} aria-hidden="true" /><span><strong>Habilitar lote para nuevas siembras</strong><small>Conserva las etapas anteriores como historial y permite comenzar otra siembra.</small></span>
          </button>
          <div className="enable-lote-history-footer"><button className="confirmation-cancel-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button></div>
        </div>
      </section>
    </div>, document.body
  );
}

function EnableLoteConfirmation({ lote, saving, onCancel, onConfirm }) {
  return createPortal(
    <div className="confirmation-modal-backdrop" role="presentation">
      <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="enable-lote-title" aria-describedby="enable-lote-description">
        <span className="confirmation-modal-icon confirmation-modal-icon-success" aria-hidden="true"><CheckCircle2 size={28} /></span>
        <div>
          <h2 id="enable-lote-title">¿Habilitar lote?</h2>
          <p id="enable-lote-description">Vas a habilitar <strong>{lote.nombre}</strong>. El lote volverá a estar disponible para registrar nuevas operaciones.</p>
        </div>
        <div className="confirmation-modal-actions">
          <button className="confirmation-cancel-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="confirmation-success-button" type="button" onClick={onConfirm} disabled={saving} autoFocus>
            {saving ? <LoaderCircle className="spin" size={18} /> : <CheckCircle2 size={18} />}
            {saving ? 'Habilitando...' : 'Sí, habilitar'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function EnableLoteWithActiveCampaignConfirmation({ lote, campaign, saving, onCancel, onAddToCampaign }) {
  return createPortal(
    <div className="confirmation-modal-backdrop" role="presentation">
      <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="enable-lote-campaign-title" aria-describedby="enable-lote-campaign-description">
        <span className="confirmation-modal-icon" aria-hidden="true"><CalendarDays size={28} /></span>
        <div>
          <h2 id="enable-lote-campaign-title">Hay una campaña activa</h2>
          <p id="enable-lote-campaign-description">Para habilitar <strong>{lote.nombre}</strong>, primero tenés que incorporarlo a la campaña <strong>{campaign.nombre}</strong>. Así el lote no queda disponible fuera de la campaña en curso.</p>
        </div>
        <div className="confirmation-modal-actions">
          <button className="confirmation-cancel-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="confirmation-success-button" type="button" onClick={onAddToCampaign} disabled={saving} autoFocus>
            {saving ? <LoaderCircle className="spin" size={18} /> : <PlusCircle size={18} />}
            {saving ? 'Habilitando...' : 'Agregar a la campaña'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function LoteOverlapConflictModal({ message, onClose }) {
  return createPortal(
    <div className="confirmation-modal-backdrop" role="presentation">
      <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="lote-overlap-title" aria-describedby="lote-overlap-description">
        <span className="confirmation-modal-icon confirmation-modal-icon-danger" aria-hidden="true"><AlertTriangle size={28} /></span>
        <div>
          <h2 id="lote-overlap-title">El lote ya está registrado</h2>
          <p id="lote-overlap-description">{message}</p>
        </div>
        <div className="confirmation-modal-actions">
          <button className="confirmation-success-button" type="button" onClick={onClose} autoFocus>
            Entendido
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function ActiveCampaignLoteModal({ campaign, saving, onCancel, onRegisterAndDisable, onAddToCampaign }) {
  return createPortal(
    <div className="confirmation-modal-backdrop" role="presentation">
      <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="active-campaign-lote-title" aria-describedby="active-campaign-lote-description">
        <span className="confirmation-modal-icon" aria-hidden="true"><CalendarDays size={28} /></span>
        <div>
          <h2 id="active-campaign-lote-title">Hay una campaña activa</h2>
          <p id="active-campaign-lote-description">La campaña <strong>{campaign.nombre}</strong> todavía tiene lotes sin cosecha finalizada. Todo lote nuevo debe agregarse a esa campaña o quedar deshabilitado hasta incorporarlo más adelante.</p>
        </div>
        <div className="confirmation-modal-actions confirmation-modal-actions-wrap">
          <button className="confirmation-cancel-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="confirmation-danger-button" type="button" onClick={onRegisterAndDisable} disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={18} /> : <Ban size={18} />}
            {saving ? 'Registrando...' : 'Registrar y deshabilitar'}
          </button>
          <button className="confirmation-success-button" type="button" onClick={onAddToCampaign} disabled={saving} autoFocus>
            {saving ? <LoaderCircle className="spin" size={18} /> : <PlusCircle size={18} />}
            {saving ? 'Registrando...' : 'Añadir a la campaña'}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function ExportLotesConfirmation({ lotes, onCancel, onConfirm }) {
  return createPortal(
    <div className="confirmation-modal-backdrop" role="presentation">
      <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="export-lotes-title" aria-describedby="export-lotes-description">
        <span className="confirmation-modal-icon confirmation-modal-icon-success" aria-hidden="true"><FileText size={28} /></span>
        <div>
          <h2 id="export-lotes-title">¿Exportar lotes a PDF?</h2>
          <p id="export-lotes-description">Se generará un reporte con los datos de {lotes.length} lote{lotes.length === 1 ? '' : 's'} seleccionado{lotes.length === 1 ? '' : 's'}.</p>
        </div>
        <div className="confirmation-modal-actions">
          <button className="confirmation-cancel-button" type="button" onClick={onCancel}>Cancelar</button>
          <button className="confirmation-success-button" type="button" onClick={onConfirm} autoFocus>
            <FileText size={18} />
            Exportar PDF
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

export { EnableLoteWithSiembrasConfirmation, EnableLoteConfirmation, EnableLoteWithActiveCampaignConfirmation, LoteOverlapConflictModal, ActiveCampaignLoteModal, ExportLotesConfirmation };
