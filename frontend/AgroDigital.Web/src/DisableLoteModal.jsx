import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Info, LoaderCircle } from 'lucide-react';
import { SINIESTROS_RESIEMBRA } from './siniestros';

const motivos = ['Fin de alquiler', 'Siniestro', 'Otro motivo'];

export default function DisableLoteModal({ lote, saving, onCancel, onConfirm, checkBlock, allowRecentlyRented = false, allowRecentlyRentedWhenEligible = false, campaignPeriod = '', planningSelection = null, sowingSelection = null, otherCyclePlan = null, summerOmission = false }) {
  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [siniestro, setSiniestro] = useState('');
  const [fechaSiniestro, setFechaSiniestro] = useState('');
  const [bloqueo, setBloqueo] = useState('');
  const [checking, setChecking] = useState(Boolean(checkBlock));
  const [error, setError] = useState('');
  const [periodo, setPeriodo] = useState(campaignPeriod);
  const [eligibleRecentlyRented, setEligibleRecentlyRented] = useState(false);
  const [afectarOtroCiclo, setAfectarOtroCiclo] = useState(null);
  const otherCycleProtected = Boolean(planningSelection && otherCyclePlan && (otherCyclePlan.estado !== 'Pendiente' || otherCyclePlan.etapaActual !== 'Sin etapa'));
  const otherCycleChoiceAvailable = Boolean(otherCyclePlan && !otherCycleProtected);
  const periodoMatch = /^(\d{4})-(\d{4})$/.exec(periodo || '');
  const fechaMinima = periodoMatch ? `${periodoMatch[1]}-01-01` : undefined;
  const fechaMaxima = periodoMatch ? `${periodoMatch[2]}-12-31` : undefined;

  useEffect(() => {
    let active = true;
    if (!checkBlock) return undefined;
    setChecking(true);
    Promise.resolve(checkBlock(lote)).then((result) => {
      if (!active) return;
      setBloqueo(result?.bloqueo || '');
      setPeriodo(result?.periodo || '');
      setEligibleRecentlyRented(Boolean(result?.permiteAlquiladoRecientemente));
    }).catch((err) => {
      if (active) setBloqueo(err.message || 'No se pudo comprobar el estado del lote.');
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, [lote?.loteId]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if ((planningSelection || sowingSelection) && otherCycleChoiceAvailable && afectarOtroCiclo === null) {
      setError('Indicá si la baja afecta también al otro ciclo.');
      return;
    }
    if (motivo === 'Siniestro' && (!fechaMinima || fechaSiniestro < fechaMinima || fechaSiniestro > fechaMaxima)) {
      setError(periodoMatch
        ? `La fecha del siniestro debe estar entre el 01/01/${periodoMatch[1]} y el 31/12/${periodoMatch[2]}.`
        : 'No se pudo determinar el período de campaña para validar la fecha del siniestro.');
      return;
    }
    try {
      await onConfirm({
        motivo,
        detalle: motivo === 'Otro motivo' ? detalle.trim() : null,
        siniestro: motivo === 'Siniestro' ? siniestro : null,
        fechaSiniestro: motivo === 'Siniestro' ? fechaSiniestro : null,
        ...(planningSelection ? { afectarOtroCiclo: otherCycleChoiceAvailable ? afectarOtroCiclo : false } : {}),
        ...(sowingSelection ? { afectarInvierno: otherCyclePlan ? afectarOtroCiclo : false } : {})
      });
    } catch (err) {
      setError(err.message || 'No se pudo deshabilitar el lote.');
    }
  }

  return createPortal(
    <div className="confirmation-modal-backdrop lote-disable-backdrop" role="presentation">
      <form className="confirmation-modal lote-disable-modal" role="dialog" aria-modal="true" aria-labelledby="disable-lote-title" onSubmit={submit}>
        <span className="confirmation-modal-icon" aria-hidden="true">{summerOmission ? <Info size={27} /> : <Ban size={27} />}</span>
        <div>
          <h2 id="disable-lote-title">{summerOmission ? 'Motivo para omitir Verano' : planningSelection ? 'Motivo de baja de planificación' : sowingSelection ? 'Deshabilitar siembra' : 'Motivo de deshabilitación'}</h2>
          <p>{summerOmission ? <><strong>{lote?.nombre}</strong> tiene un cultivo de Invierno. Indicá por qué no se planifica en Verano; el lote seguirá habilitado.</> : planningSelection ? <>Retirá la planificación de <strong>{lote?.nombre}</strong> en {planningSelection.cicloEstacional?.toLowerCase()}. {otherCycleProtected ? `La planificación de ${otherCyclePlan.cicloEstacional?.toLowerCase()} ya se ejecutó y se conservará; el lote seguirá habilitado.` : otherCyclePlan ? 'Elegí si conserva el otro ciclo.' : 'El lote quedará deshabilitado.'} El motivo quedará registrado.</> : sowingSelection ? <>Se deshabilitará <strong>{sowingSelection.nombre}</strong> y sus resiembras. {otherCyclePlan ? 'Indicá si también afecta al cultivo de invierno.' : 'El lote quedará deshabilitado.'}</> : <>Indicá por qué se deshabilita <strong>{lote?.nombre || 'el lote nuevo'}</strong>. El motivo y su historial quedarán registrados.</>}</p>
        </div>
        {checking && <p>Comprobando el estado del lote...</p>}
        {bloqueo ? <div className="lote-disable-block" role="alert">{bloqueo}</div> : !checking && <>
          {(planningSelection || sowingSelection) && otherCycleChoiceAvailable && <fieldset className="lote-disable-options">
            <legend>¿La baja afecta también al ciclo de {otherCyclePlan.cicloEstacional?.toLowerCase()}?</legend>
            <label className={afectarOtroCiclo === false ? 'selected' : ''}>
              <input type="radio" name="afectar-otro-ciclo" checked={afectarOtroCiclo === false} onChange={() => setAfectarOtroCiclo(false)} />
              No, conservar {otherCyclePlan.producto} en {otherCyclePlan.cicloEstacional?.toLowerCase()}. El lote seguirá habilitado.
            </label>
            <label className={afectarOtroCiclo === true ? 'selected' : ''}>
              <input type="radio" name="afectar-otro-ciclo" checked={afectarOtroCiclo === true} onChange={() => setAfectarOtroCiclo(true)} />
              {sowingSelection ? 'Sí, retirar la planificación de invierno y deshabilitar el lote.' : 'Sí, retirar ambas planificaciones y deshabilitar el lote.'}
            </label>
          </fieldset>}
          <fieldset className="lote-disable-options">
            <legend>Motivo <b>*</b></legend>
            {(allowRecentlyRented || (allowRecentlyRentedWhenEligible && eligibleRecentlyRented) ? ['Alquilado recientemente', ...motivos] : motivos).map((item) => <label key={item} className={motivo === item ? 'selected' : ''}>
              <input type="radio" name="motivo-deshabilitacion" value={item} checked={motivo === item} onChange={() => { setMotivo(item); setError(''); }} />
              {item}
            </label>)}
          </fieldset>
          {motivo === 'Siniestro' && <div className="lote-disable-fields">
            <label className="field">
              <span className="field-label">Tipo de siniestro <b>*</b></span>
              <select required value={siniestro} onChange={(event) => setSiniestro(event.target.value)}>
                <option value="">Seleccionar</option>
                {SINIESTROS_RESIEMBRA.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Fecha del siniestro <b>*</b></span>
              <input required type="date" min={fechaMinima} max={fechaMaxima} value={fechaSiniestro} onChange={(event) => setFechaSiniestro(event.target.value)} />
            </label>
          </div>}
          {motivo === 'Otro motivo' && <label className="field">
            <span className="field-label">Detalle <b>*</b></span>
            <textarea required maxLength={500} value={detalle} onChange={(event) => setDetalle(event.target.value)} placeholder="Describí el motivo" />
          </label>}
        </>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="confirmation-modal-actions">
          <button className="confirmation-cancel-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          {!bloqueo && <button className={summerOmission ? 'green-button' : 'confirmation-danger-button'} type="submit" disabled={saving || checking || !motivo}>
            {saving ? <LoaderCircle className="spin" size={18} /> : summerOmission ? <Info size={18} /> : <Ban size={18} />}
            {saving ? 'Guardando...' : summerOmission ? 'Registrar motivo' : planningSelection && otherCyclePlan && (otherCycleProtected || afectarOtroCiclo === false) ? 'Retirar planificación' : sowingSelection ? 'Deshabilitar siembra' : 'Deshabilitar lote'}
          </button>}
        </div>
      </form>
    </div>, document.body
  );
}
