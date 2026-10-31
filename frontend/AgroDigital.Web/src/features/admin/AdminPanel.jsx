import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Ban, CheckCircle2, Copy, Edit, Eye, EyeOff, KeyRound, LogOut, LockKeyhole, LoaderCircle, PlusCircle, Mail, UserPlus, Users } from 'lucide-react';
import agroDigitalLogo from '../../assets/agrodigital-logo.png';

const ADMIN_CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AdminPanel({
  accounts,
  lastGeneratedAccount,
  error,
  envio = null,
  resendingId = null,
  copiedKey,
  onCreateAccount,
  onResendInvitation,
  onRegeneratePassword,
  onUpdateResponsible,
  onToggleAccountStatus,
  onCopy,
  onLogout,
  onOpenDemo
}) {
  const [accountForm, setAccountForm] = useState({ responsable: '', correoElectronico: '' });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editingResponsible, setEditingResponsible] = useState('');
  const [editingEmail, setEditingEmail] = useState('');
  const [pendingAccountStatus, setPendingAccountStatus] = useState(null);
  const [updatingAccountStatus, setUpdatingAccountStatus] = useState(false);

  const formEmail = accountForm.correoElectronico.trim();
  const formEmailInvalid = formEmail.length > 0 && !ADMIN_CORREO_REGEX.test(formEmail);
  const canCreateAccount = accountForm.responsable.trim() && ADMIN_CORREO_REGEX.test(formEmail) && !creatingAccount;
  const editingEmailValue = editingEmail.trim();
  const canSaveEdit = editingResponsible.trim() && (!editingEmailValue || ADMIN_CORREO_REGEX.test(editingEmailValue));

  async function submitAccount(event) {
    event.preventDefault();
    if (!canCreateAccount) return;

    setCreatingAccount(true);
    const created = await onCreateAccount({
      responsable: accountForm.responsable.trim(),
      correoElectronico: formEmail
    });
    setCreatingAccount(false);

    // Si el alta falla (ej. correo repetido) se conservan los datos para corregirlos.
    if (created) setAccountForm({ responsable: '', correoElectronico: '' });
  }

  function startResponsibleEdit(account) {
    setEditingAccountId(account.id);
    setEditingResponsible(account.responsable);
    setEditingEmail(account.correoElectronico ?? '');
  }

  function cancelResponsibleEdit() {
    setEditingAccountId(null);
    setEditingResponsible('');
    setEditingEmail('');
  }

  async function saveResponsibleEdit(accountId) {
    if (!canSaveEdit) return;

    const saved = await onUpdateResponsible(accountId, editingResponsible.trim(), editingEmailValue);
    if (saved) cancelResponsibleEdit();
  }

  async function confirmAccountStatus() {
    if (!pendingAccountStatus || updatingAccountStatus) return;

    setUpdatingAccountStatus(true);
    const updated = await onToggleAccountStatus(pendingAccountStatus);
    setUpdatingAccountStatus(false);
    if (updated) setPendingAccountStatus(null);
  }

  const pendingAccounts = accounts.filter((account) => account.estado === 'Pendiente de primer ingreso').length;

  return (
    <section className="admin-page">
      <header className="admin-header">
        <div className="admin-brand">
          <img src={agroDigitalLogo} alt="AgroDigital" />
          <div>
            <span>Panel interno</span>
            <strong>Administración AgroDigital</strong>
          </div>
        </div>
        <div className="admin-actions">
          <button className="secondary-admin-button" type="button" onClick={onOpenDemo}>
            Ver sistema operativo
          </button>
          <button className="admin-logout" type="button" onClick={onLogout}>
            <LogOut size={19} />
            Salir
          </button>
        </div>
      </header>

      <div className="admin-title">
        <div>
          <h1>Accesos iniciales de AgroDigital</h1>
          <p>Invitá a cada responsable por correo: recibe un enlace para activar su cuenta y completar su registro.</p>
        </div>
        <span className="admin-secure-pill">
          <CheckCircle2 size={17} />
          Sesión admin activa
        </span>
      </div>

      <div className="admin-summary-grid">
        <AdminSummaryCard icon={<UserPlus size={31} />} label="Accesos creados" value={accounts.length} helper="Credenciales gerente generadas" />
        <AdminSummaryCard icon={<KeyRound size={31} />} label="Primer ingreso pendiente" value={pendingAccounts} helper="Credenciales de un solo inicio" />
        <AdminSummaryCard icon={<Users size={31} />} label="Registro gerente" value="Código" helper="El grupo se genera al completar datos" />
      </div>

      <div className="admin-workspace">
        <form className="admin-form-card" onSubmit={submitAccount}>
          <div className="admin-card-heading">
            <span>
              <UserPlus size={24} />
            </span>
            <div>
              <h2>Crear cuenta gerente</h2>
              <p>Ingresá el responsable y su correo: le enviamos un enlace para activar su cuenta.</p>
            </div>
          </div>

          <label className="admin-field">
            <span>Responsable inicial *</span>
            <input
              type="text"
              value={accountForm.responsable}
              onChange={(event) => setAccountForm((current) => ({ ...current, responsable: event.target.value }))}
              placeholder="Ej: Juan Pérez"
            />
          </label>

          <label className="admin-field">
            <span>Correo electrónico *</span>
            <input
              type="email"
              value={accountForm.correoElectronico}
              onChange={(event) => setAccountForm((current) => ({ ...current, correoElectronico: event.target.value }))}
              placeholder="Ej: juan@empresa.com"
              aria-invalid={formEmailInvalid}
              aria-describedby="admin-correo-ayuda"
              autoComplete="off"
            />
          </label>
          <p id="admin-correo-ayuda" className={`admin-field-help ${formEmailInvalid ? 'admin-field-help-error' : ''}`}>
            {formEmailInvalid ? 'Revisá el formato del correo (ej: nombre@empresa.com).' : 'A este correo le llega el enlace de activación. Vence en 7 días.'}
          </p>

          <button className="primary-admin-button" type="submit" disabled={!canCreateAccount}>
            {creatingAccount ? <LoaderCircle className="spin" size={21} /> : <PlusCircle size={21} />}
            {creatingAccount ? 'Enviando invitación...' : 'Crear y enviar invitación'}
          </button>
          {envio && (
            <p className={`admin-envio ${envio.enviado ? 'admin-envio-ok' : 'admin-envio-error'}`} role="status">
              {envio.enviado ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <span>{envio.mensaje}</span>
            </p>
          )}
          {error && <p className="auth-error admin-inline-error">{error}</p>}
        </form>

        <section className="generated-card">
          <div className="admin-card-heading">
            <span>
              <KeyRound size={24} />
            </span>
            <div>
              <h2>Credenciales de respaldo</h2>
              <p>Si el correo no llega, compartí estos datos con el gerente para su primer ingreso.</p>
            </div>
          </div>

          {lastGeneratedAccount ? (
            <div className="credential-list">
              <CredentialRow label="Usuario" value={lastGeneratedAccount.usuario} onCopy={onCopy} copied={copiedKey === lastGeneratedAccount.usuario} />
              <CredentialRow label="Contraseña temporal" value={lastGeneratedAccount.passwordTemporal} onCopy={onCopy} copied={copiedKey === lastGeneratedAccount.passwordTemporal} secret />
              <p className="credential-warning">
                Copiá la contraseña ahora: por seguridad se guarda solo su hash y no se puede recuperar al recargar.
              </p>
              <p className="credential-warning">
                El código de grupo de gestion se generara cuando el gerente complete su registro y cargue sus empresas.
              </p>
            </div>
          ) : (
            <div className="generated-empty">
              <KeyRound size={42} />
              <strong>Aún no generaste accesos</strong>
              <span>Cargá el responsable inicial para crear la primera credencial gerente.</span>
            </div>
          )}
        </section>
      </div>

      <section className="admin-table-card">
        <div className="admin-table-title">
          <h2>Listado de cuentas</h2>
          <span>{accounts.length} registros</span>
        </div>

        {accounts.length === 0 ? (
          <div className="admin-empty-state">
            <UserPlus size={54} />
            <strong>No hay accesos gerente creados.</strong>
            <span>Generá una credencial inicial para que el responsable complete su registro.</span>
          </div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Responsable</th>
                  <th>Invitación</th>
                  <th>Usuario inicial</th>
                  <th>Contraseña temporal</th>
                  <th>Grupo de gestión</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      {editingAccountId === account.id ? (
                        <div className="admin-edit-inline">
                          <input
                            value={editingResponsible}
                            onChange={(event) => setEditingResponsible(event.target.value)}
                            aria-label="Responsable"
                            autoFocus
                          />
                          {account.estado === 'Pendiente de primer ingreso' && (
                            <input
                              type="email"
                              value={editingEmail}
                              onChange={(event) => setEditingEmail(event.target.value)}
                              aria-label="Correo electrónico"
                              placeholder="Correo electrónico"
                            />
                          )}
                          <div>
                            <button type="button" onClick={() => saveResponsibleEdit(account.id)} disabled={!canSaveEdit}>
                              Guardar
                            </button>
                            <button type="button" onClick={cancelResponsibleEdit}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <strong className="admin-responsible-name">{account.responsable}</strong>
                          {account.correoElectronico && <small className="admin-responsible-email">{account.correoElectronico}</small>}
                        </>
                      )}
                    </td>
                    <td>
                      <AdminInvitationCell
                        account={account}
                        resending={resendingId === account.id}
                        onResend={() => onResendInvitation(account.id)}
                      />
                    </td>
                    <td>
                      <InlineCredential value={account.usuario} onCopy={onCopy} label="usuario inicial" copied={copiedKey === account.usuario} />
                    </td>
                    <td>
                      {account.estado === 'Pendiente de primer ingreso' ? (
                        account.passwordTemporal ? (
                          <InlineCredential
                            value={account.passwordTemporal}
                            onCopy={onCopy}
                            label="contraseña temporal"
                            copied={copiedKey === account.passwordTemporal}
                            secret
                          />
                        ) : (
                          <button className="regenerate-password-button" type="button" onClick={() => onRegeneratePassword(account.id)}>
                            <KeyRound size={15} />
                            Regenerar
                          </button>
                        )
                      ) : (
                        <span className="credential-hidden">Oculta</span>
                      )}
                    </td>
                    <td>{account.grupoGestion}</td>
                    <td>
                      <span className={`admin-status-chip ${account.estado === 'Deshabilitado' ? 'admin-status-chip-disabled' : ''}`}>
                        {account.estado}
                      </span>
                    </td>
                    <td>{account.fechaCreacion}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="admin-action-button" type="button" onClick={() => startResponsibleEdit(account)}>
                          <Edit size={15} />
                          Editar
                        </button>
                        <button
                          className={`admin-action-button ${account.estado === 'Deshabilitado' ? 'admin-action-button-enable' : 'admin-action-button-danger'}`}
                          type="button"
                          onClick={() => setPendingAccountStatus(account)}
                        >
                          {account.estado === 'Deshabilitado' ? <CheckCircle2 size={15} /> : <LockKeyhole size={15} />}
                          {account.estado === 'Deshabilitado' ? 'Habilitar' : 'Deshabilitar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {pendingAccountStatus && (
        <AdminAccountStatusConfirmation
          account={pendingAccountStatus}
          saving={updatingAccountStatus}
          onCancel={() => setPendingAccountStatus(null)}
          onConfirm={confirmAccountStatus}
        />
      )}
    </section>
  );
}

function AdminInvitationCell({ account, resending, onResend }) {
  const pending = account.estado === 'Pendiente de primer ingreso';

  if (!account.correoElectronico) {
    return (
      <div className="admin-invite">
        <span className="admin-invite-chip admin-invite-sin-correo">Sin correo</span>
        {pending && <small>Editá el acceso para cargarlo.</small>}
      </div>
    );
  }

  if (!pending) {
    return (
      <div className="admin-invite">
        <span className="admin-invite-chip admin-invite-ok">{account.estado === 'Usado' ? 'Activada' : 'Cerrada'}</span>
      </div>
    );
  }

  const estado = account.estadoEnvio || 'Pendiente';
  const chip = { Enviado: 'admin-invite-ok', Error: 'admin-invite-error' }[estado] ?? 'admin-invite-pendiente';
  const texto = { Enviado: 'Enviada', Error: 'No se pudo enviar' }[estado] ?? 'Sin enviar';

  return (
    <div className="admin-invite">
      <span className={`admin-invite-chip ${chip}`}>{texto}</span>
      {account.fechaUltimoEnvio && (
        <small>
          {account.fechaUltimoEnvio}
          {account.cantidadEnvios > 1 ? ` · ${account.cantidadEnvios} envíos` : ''}
        </small>
      )}
      <button className="regenerate-password-button" type="button" onClick={onResend} disabled={resending}>
        {resending ? <LoaderCircle className="spin" size={15} /> : <Mail size={15} />}
        {resending ? 'Enviando...' : 'Reenviar'}
      </button>
    </div>
  );
}

function AdminAccountStatusConfirmation({ account, saving, onCancel, onConfirm }) {
  const enabling = account.estado === 'Deshabilitado';
  const action = enabling ? 'habilitar' : 'deshabilitar';

  return createPortal(
    <div className="confirmation-modal-backdrop" role="presentation">
      <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="admin-account-status-title" aria-describedby="admin-account-status-description">
        <span className={`confirmation-modal-icon ${enabling ? 'confirmation-modal-icon-success' : ''}`} aria-hidden="true">
          {enabling ? <CheckCircle2 size={28} /> : <Ban size={28} />}
        </span>
        <div>
          <h2 id="admin-account-status-title">¿{enabling ? 'Habilitar' : 'Deshabilitar'} cuenta?</h2>
          <p id="admin-account-status-description">
            {enabling ? <>Vas a habilitar la cuenta de <strong>{account.responsable}</strong>. El responsable podrá volver a ingresar al sistema.</> : <>Vas a deshabilitar la cuenta de <strong>{account.responsable}</strong>. Se bloqueará su acceso, pero se conservará su historial.</>}
          </p>
        </div>
        <div className="confirmation-modal-actions">
          <button className="confirmation-cancel-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className={enabling ? 'confirmation-success-button' : 'confirmation-danger-button'} type="button" onClick={onConfirm} disabled={saving} autoFocus>
            {saving ? <LoaderCircle className="spin" size={18} /> : enabling ? <CheckCircle2 size={18} /> : <Ban size={18} />}
            {saving ? `${enabling ? 'Habilitando' : 'Deshabilitando'}...` : `Sí, ${action}`}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function AdminSummaryCard({ icon, label, value, helper }) {
  return (
    <article className="admin-summary-card">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{helper}</p>
      </div>
    </article>
  );
}

function InlineCredential({ value, onCopy, label, copied = false, secret = false }) {
  const [isVisible, setIsVisible] = useState(!secret);
  const displayValue = secret && !isVisible ? '••••••••••••' : value;

  function revealCredential() {
    if (secret) {
      setIsVisible(true);
    }
  }

  function hideCredential() {
    if (secret) {
      setIsVisible(false);
    }
  }

  function handleRevealKeyDown(event) {
    if (event.key === ' ' || event.key === 'Enter') {
      revealCredential();
    }
  }

  function handleRevealKeyUp(event) {
    if (event.key === ' ' || event.key === 'Enter') {
      hideCredential();
    }
  }

  return (
    <span className={`inline-credential ${secret ? 'inline-credential-secret' : ''} ${isVisible ? 'inline-credential-visible' : ''}`}>
      <strong>{displayValue}</strong>
      {secret && (
        <button
          type="button"
          className="inline-credential-reveal"
          onPointerDown={revealCredential}
          onPointerUp={hideCredential}
          onPointerLeave={hideCredential}
          onPointerCancel={hideCredential}
          onKeyDown={handleRevealKeyDown}
          onKeyUp={handleRevealKeyUp}
          onBlur={hideCredential}
          aria-label="Mantener presionado para ver la contraseña temporal"
          aria-pressed={isVisible}
        >
          {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
      <button type="button" className={`inline-credential-copy ${copied ? 'copy-button-copied' : ''}`} onClick={() => onCopy(value)} aria-label={`Copiar ${label}`}>
        {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
      </button>
    </span>
  );
}

function CredentialRow({ label, value, onCopy, copied = false, secret = false }) {
  const [isVisible, setIsVisible] = useState(!secret);
  const displayValue = secret && !isVisible ? '••••••••••••' : value;

  function revealCredential() {
    if (secret) {
      setIsVisible(true);
    }
  }

  function hideCredential() {
    if (secret) {
      setIsVisible(false);
    }
  }

  function handleRevealKeyDown(event) {
    if (event.key === ' ' || event.key === 'Enter') {
      revealCredential();
    }
  }

  function handleRevealKeyUp(event) {
    if (event.key === ' ' || event.key === 'Enter') {
      hideCredential();
    }
  }

  return (
    <div className={`credential-row ${secret ? 'credential-row-secret' : ''} ${isVisible ? 'credential-row-visible' : ''} ${copied ? 'credential-row-copied' : ''}`}>
      <div>
        <span>{label}</span>
        <strong>{displayValue}</strong>
      </div>
      <div className="credential-row-actions">
        {secret && (
          <button
            type="button"
            onPointerDown={revealCredential}
            onPointerUp={hideCredential}
            onPointerLeave={hideCredential}
            onPointerCancel={hideCredential}
            onKeyDown={handleRevealKeyDown}
            onKeyUp={handleRevealKeyUp}
            onBlur={hideCredential}
            aria-label="Mantener presionado para ver la contraseña temporal"
            aria-pressed={isVisible}
          >
            {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
        <button type="button" className={copied ? 'copy-button-copied' : ''} onClick={() => onCopy(value)} aria-label={`Copiar ${label}`}>
          {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
        </button>
      </div>
      {copied && <em className="credential-copy-feedback">Copiado</em>}
    </div>
  );
}

export default AdminPanel;
