import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, ChevronDown, ChevronLeft, Eye, EyeOff, LogOut, LockKeyhole, LoaderCircle, Settings, Save, Mail, Phone, ShieldCheck, User, Users } from 'lucide-react';
import profileCardLandscape from '../../assets/profile-card-landscape.png';
import { formatPersonName } from '../../shared/utils/personName.js';
import { getPasswordRequirements } from '../../shared/utils/passwordRequirements.js';
import PasswordRequirements from '../../shared/components/PasswordRequirements.jsx';

function UserProfileMenu({ session, profile, open, menuRef, onToggle, onOpenProfile, onLogout, managerContext }) {
  const fullName = profile
    ? [profile.nombre, profile.apellido].filter(Boolean).join(' ')
    : session?.name || session?.usuario || 'Usuario';
  const displayName = fullName.trim() || session?.usuario || 'Usuario';
  const initial = displayName.trim().charAt(0).toLocaleUpperCase('es-AR') || 'U';
  const email = profile?.correoElectronico || (session?.usuario?.includes('@') ? session.usuario : 'Correo sin cargar');
  const phone = profile?.telefono || 'Teléfono sin cargar';
  const role = profile?.rol || session?.role || 'Usuario';
  const groupCode = role === 'Gerente' ? managerContext?.grupoGestionCodigo : null;
  const organization = managerContext?.empresas?.find((empresa) => empresa.esPrincipal)?.nombre
    || managerContext?.empresas?.[0]?.nombre
    || 'AgroDigital S.A.';

  return (
    <div className="user-menu-wrapper" ref={menuRef}>
      <button className={`user-chip ${open ? 'user-chip-open' : ''}`} type="button" onClick={onToggle} aria-haspopup="menu" aria-expanded={open}>
        <span className="user-avatar">{initial}</span>
        <strong>{displayName}</strong>
        <ChevronDown size={15} />
      </button>

      {open && (
        <div className="profile-popover" role="menu">
          <div className="profile-popover-hero">
            <img src={profileCardLandscape} alt="" />
            <div className="profile-popover-hero-overlay" />
            <span className="profile-popover-avatar">{initial}</span>
            <div className="profile-popover-title">
              <strong>{displayName}</strong>
              <span>{role}</span>
              <em>Cuenta activa</em>
            </div>
          </div>

          <div className="profile-popover-section">
            <h3>Información personal</h3>
            <div className="profile-popover-data">
              <span><Mail size={16} /> <strong>{email}</strong></span>
              <span><Phone size={16} /> <strong>{phone}</strong></span>
              {groupCode && (
                <span className="profile-popover-stacked-row">
                  <Users size={16} />
                  <span>
                    <small>Grupo de gestión</small>
                    <strong>{groupCode}</strong>
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="profile-popover-section">
            <h3>Cuenta y organización</h3>
            <div className="profile-popover-data profile-popover-paired-data">
              <span><Building2 size={16} /> Organización <strong>{organization}</strong></span>
              <span><ShieldCheck size={16} /> Rol <strong>{role}</strong></span>
            </div>
          </div>

          <button className="profile-popover-action" type="button" onClick={onOpenProfile} role="menuitem">
            <Settings size={18} />
            Configuración del perfil
          </button>
          <button className="profile-popover-logout" type="button" onClick={onLogout} role="menuitem">
            <LogOut size={18} />
            Cerrar sesion
          </button>
        </div>
      )}
    </div>
  );
}

function ProfilePage({ profile, session, error, status, saving, passwordSaving, passwordError, onSave, onChangePassword, onClearPasswordError, onBack, managerContext }) {
  const initialForm = useMemo(() => ({
    nombre: profile?.nombre || session?.name?.split(' ')[0] || '',
    apellido: profile?.apellido || session?.name?.split(' ').slice(1).join(' ') || '',
    telefono: profile?.telefono || '',
    correoElectronico: profile?.correoElectronico || (session?.usuario?.includes('@') ? session.usuario : '')
  }), [profile, session]);
  const [form, setForm] = useState(initialForm);
  const [passwordForm, setPasswordForm] = useState({ passwordActual: '', passwordNueva: '', repetirPasswordNueva: '' });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPasswords, setShowNewPasswords] = useState(false);
  const passwordRequirements = useMemo(() => getPasswordRequirements(passwordForm.passwordNueva), [passwordForm.passwordNueva]);
  const passwordIsStrong = passwordRequirements.every((requirement) => requirement.valid);
  const passwordsMatch = passwordForm.passwordNueva.length > 0 && passwordForm.passwordNueva === passwordForm.repetirPasswordNueva;
  const passwordIsDifferent = passwordForm.passwordNueva.length > 0 && passwordForm.passwordNueva !== passwordForm.passwordActual;

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);


  function updateField(field, value) {
    const nextValue = field === 'nombre' || field === 'apellido'
      ? formatPersonName(value)
      : value;
    setForm((current) => ({ ...current, [field]: nextValue }));
  }

  function submitProfile(event) {
    event.preventDefault();
    onSave(form);
  }

  function updatePasswordField(field, value) {
    if (field === 'passwordActual' && passwordError) {
      onClearPasswordError();
    }
    setPasswordForm((current) => ({ ...current, [field]: value }));
  }

  async function submitPassword(event) {
    event.preventDefault();
    const updated = await onChangePassword(passwordForm);
    if (updated) {
      setPasswordForm({ passwordActual: '', passwordNueva: '', repetirPasswordNueva: '' });
    }
  }

  const displayName = [form.nombre, form.apellido].filter(Boolean).join(' ') || session?.name || 'Tu perfil';
  const groupCode = (profile?.rol || session?.role) === 'Gerente' ? managerContext?.grupoGestionCodigo : null;
  const profileHasChanges = form.nombre !== initialForm.nombre
    || form.apellido !== initialForm.apellido
    || form.telefono !== initialForm.telefono
    || form.correoElectronico !== initialForm.correoElectronico;
  const canSave = profileHasChanges && form.nombre.trim() && form.apellido.trim() && form.telefono.trim() && form.correoElectronico.trim();
  const canChangePassword = passwordForm.passwordActual.trim()
    && passwordIsStrong
    && passwordsMatch
    && passwordIsDifferent;

  return (
    <section className="content-panel profile-panel">
      <div className="page-heading profile-heading">
        <div>
          <h1>Configuración del perfil</h1>
          <p>Actualizá tus datos personales y de contacto dentro de AgroDigital.</p>
        </div>
        <button className="back-button" type="button" onClick={onBack}>
          <ChevronLeft size={18} />
          Volver
        </button>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {status && <p className="auth-success">{status}</p>}

      <div className="profile-grid">
        <section className="dashboard-card profile-summary-card">
          <span className="profile-page-avatar">{displayName.charAt(0).toLocaleUpperCase('es-AR') || 'U'}</span>
          <div>
            <h2>{displayName}</h2>
            <p>{profile?.rol || session?.role || 'Usuario'}</p>
          </div>
          <div className="profile-summary-list">
            <span><User size={18} /> Usuario: <strong>{profile?.usuario || session?.usuario || 'Sin cargar'}</strong></span>
            <span><Mail size={18} /> Correo: <strong>{form.correoElectronico || 'Sin cargar'}</strong></span>
            <span><Phone size={18} /> Teléfono: <strong>{form.telefono || 'Sin cargar'}</strong></span>
            {groupCode && <span><Users size={18} /> Grupo de gestión: <strong>{groupCode}</strong></span>}
          </div>
        </section>

        <form className="dashboard-card profile-form-card" onSubmit={submitProfile}>
          <div className="card-heading">
            <div className="card-heading-icon"><Settings size={18} /></div>
            <div>
              <h2>Datos del perfil</h2>
              <p>Estos datos se usan para identificarte en el sistema y en las solicitudes.</p>
            </div>
          </div>

          <div className="profile-form-grid">
            <label className="admin-field">
              <span>Nombre *</span>
              <input value={form.nombre} onChange={(event) => updateField('nombre', event.target.value)} placeholder="Ej: Juan" />
            </label>
            <label className="admin-field">
              <span>Apellido *</span>
              <input value={form.apellido} onChange={(event) => updateField('apellido', event.target.value)} placeholder="Ej: Pérez" />
            </label>
            <label className="admin-field">
              <span>Teléfono *</span>
              <input value={form.telefono} onChange={(event) => updateField('telefono', event.target.value)} placeholder="Ej: 3512345678" />
            </label>
            <label className="admin-field">
              <span>Correo electrónico *</span>
              <input type="email" value={form.correoElectronico} onChange={(event) => updateField('correoElectronico', event.target.value)} placeholder="Ej: juanperez@gmail.com" />
            </label>
          </div>

          <div className="profile-form-note">
            <ShieldCheck size={18} />
            <span>Si cambiás el correo, también cambia tu usuario de ingreso al sistema.</span>
          </div>

          <div className="form-actions">
            <button className="green-button" type="submit" disabled={saving || !canSave}>
              {saving ? <LoaderCircle className="spin-icon" size={18} /> : <Save size={18} />}
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button className="back-button" type="button" onClick={onBack}>Cancelar</button>
          </div>
        </form>

        <form className="dashboard-card profile-form-card profile-password-card" onSubmit={submitPassword}>
          <div className="card-heading">
            <div className="card-heading-icon"><LockKeyhole size={18} /></div>
            <div>
              <h2>Cambio de contraseña</h2>
              <p>Actualizá tu acceso usando tu contraseña actual y una nueva clave segura.</p>
            </div>
          </div>

          <div className="profile-form-grid profile-password-current-grid">
            <label className="admin-field manager-password-field">
              <span>Contraseña actual *</span>
              <div>
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  data-text-case="preserve"
                  value={passwordForm.passwordActual}
                  onChange={(event) => updatePasswordField('passwordActual', event.target.value)}
                  autoComplete="current-password"
                  placeholder="Ingresá tu contraseña actual"
                />
                <button className="password-visibility-button" type="button" onClick={() => setShowCurrentPassword((current) => !current)} aria-label={showCurrentPassword ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}>
                  {showCurrentPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {passwordError && <small className="profile-field-error">{passwordError}</small>}
            </label>
          </div>

          <div className="profile-password-new-section">
            <label className="admin-field manager-password-field">
              <span>Nueva contraseña *</span>
              <div>
                <input
                  type={showNewPasswords ? 'text' : 'password'}
                  data-text-case="preserve"
                  value={passwordForm.passwordNueva}
                  onChange={(event) => updatePasswordField('passwordNueva', event.target.value)}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                />
                <button className="password-visibility-button" type="button" onClick={() => setShowNewPasswords((current) => !current)} aria-label={showNewPasswords ? 'Ocultar contraseñas nuevas' : 'Mostrar contraseñas nuevas'}>
                  {showNewPasswords ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </label>
            <label className="admin-field manager-password-field">
              <span>Repetir nueva contraseña *</span>
              <div>
                <input
                  type={showNewPasswords ? 'text' : 'password'}
                  data-text-case="preserve"
                  value={passwordForm.repetirPasswordNueva}
                  onChange={(event) => updatePasswordField('repetirPasswordNueva', event.target.value)}
                  autoComplete="new-password"
                  placeholder="Repetí la nueva contraseña"
                />
              </div>
            </label>
          </div>

          <PasswordRequirements requirements={passwordRequirements} passwordsMatch={passwordsMatch} repeatTouched={passwordForm.repetirPasswordNueva.length > 0} />
          <span className={passwordIsDifferent ? 'password-rule password-rule-valid profile-password-different' : 'password-rule profile-password-different'}>
            <CheckCircle2 size={15} />
            Distinta a la contraseña actual
          </span>

          <div className="form-actions">
            <button className="green-button" type="submit" disabled={passwordSaving || !canChangePassword}>
              {passwordSaving ? <LoaderCircle className="spin-icon" size={18} /> : <LockKeyhole size={18} />}
              {passwordSaving ? 'Actualizando...' : 'Cambiar contraseña'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export { UserProfileMenu, ProfilePage };
