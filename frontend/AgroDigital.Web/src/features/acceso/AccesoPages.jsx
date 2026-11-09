import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Eye, EyeOff, KeyRound, LogIn, LogOut, LockKeyhole, PlusCircle, ShieldCheck, Trash2, User, UserPlus, Users, Warehouse } from 'lucide-react';
import agroDigitalLogo from '../../assets/agrodigital-logo.png';
import sidebarLandscapeExpanded from '../../assets/sidebar-landscape-expanded.png';
import { formatPersonName } from '../../shared/utils/personName.js';
import { getPasswordRequirements } from '../../shared/utils/passwordRequirements.js';
import PasswordRequirements from '../../shared/components/PasswordRequirements.jsx';

function LoginPage({ onLogin, error, notice, onJoin }) {
  const [credentials, setCredentials] = useState({ usuario: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

  function submitLogin(event) {
    event.preventDefault();
    onLogin(credentials);
  }

  return (
    <section className="auth-page">
      <div className="auth-hero-card">
        <img src={agroDigitalLogo} alt="AgroDigital" className="auth-logo" />
        <div>
          <span className="auth-kicker">Gestión agrícola inteligente</span>
          <h1>Ingresá a AgroDigital</h1>
          <p>Administrá cuentas, empresas y operaciones desde un entorno seguro y centralizado.</p>
        </div>
        <div className="auth-hero-visual" aria-hidden="true">
          <img src={sidebarLandscapeExpanded} alt="" />
        </div>
      </div>

      <form className="login-card" onSubmit={submitLogin}>
        <div className="login-card-header">
          <span className="login-icon">
            <ShieldCheck size={28} />
          </span>
          <div>
            <strong>Acceso al sistema</strong>
            <span>Usá tus credenciales para continuar.</span>
          </div>
        </div>

        <label className="auth-field">
          <span>Usuario</span>
          <div>
            <User size={20} />
            <input
              type="text"
              data-text-case="preserve"
              value={credentials.usuario}
              onChange={(event) => setCredentials((current) => ({ ...current, usuario: event.target.value }))}
              autoComplete="username"
              placeholder="Ingresá tu usuario"
            />
          </div>
        </label>

        <label className="auth-field">
          <span>Contraseña</span>
          <div>
            <LockKeyhole size={20} />
            <input
              type={showPassword ? 'text' : 'password'}
              data-text-case="preserve"
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              autoComplete="current-password"
              placeholder="Ingresá tu contraseña"
            />
            <button
              className="password-visibility-button"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </label>

        {notice && !error && <p className="auth-success" role="status">{notice}</p>}
        {error && <p className="auth-error">{error}</p>}

        <button className="primary-auth-button" type="submit">
          <LogIn size={21} />
          Ingresar
        </button>

        <button className="join-team-link" type="button" onClick={onJoin}>
          Unirse a grupo
        </button>
      </form>
    </section>
  );
}

function JoinTeamPage({ initialValues = null, error, status, onSubmit, onBack }) {
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    correoElectronico: initialValues?.correoElectronico ?? '',
    password: '',
    repetirPassword: '',
    grupoGestionCodigo: initialValues?.grupoGestionCodigo ?? '',
    otp: initialValues?.otp ?? ''
  });
  const invitedByLink = Boolean(initialValues?.grupoGestionCodigo && initialValues?.otp);
  // Si la persona ya tiene cuenta en AgroDigital (por ejemplo, en otra empresa o grupo),
  // solo confirma su correo y contraseña actual: no vuelve a cargar sus datos.
  const [existingAccount, setExistingAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const passwordRequirements = useMemo(() => getPasswordRequirements(form.password), [form.password]);
  const passwordIsStrong = passwordRequirements.every((requirement) => requirement.valid);
  const passwordsMatch = form.password.length > 0 && form.password === form.repetirPassword;

  function updateField(field, value) {
    const nextValue = field === 'nombre' || field === 'apellido'
      ? formatPersonName(value)
      : value;
    setForm((current) => ({ ...current, [field]: nextValue }));
  }

  function submitJoinRequest(event) {
    event.preventDefault();
    const base = {
      ...form,
      grupoGestionCodigo: form.grupoGestionCodigo.trim().toUpperCase(),
      otp: form.otp.trim().toUpperCase(),
      usuarioExistente: existingAccount
    };
    onSubmit(existingAccount
      ? { ...base, nombre: '', apellido: '', telefono: '', repetirPassword: '' }
      : base);
  }

  const commonFieldsReady = form.correoElectronico.trim()
    && form.grupoGestionCodigo.trim()
    && form.otp.trim();
  const canSubmit = existingAccount
    ? commonFieldsReady && form.password.length > 0
    : commonFieldsReady
      && form.nombre.trim()
      && form.apellido.trim()
      && form.telefono.trim()
      && passwordIsStrong
      && passwordsMatch;

  return (
    <section className="auth-page join-auth-page">
      <div className="auth-hero-card join-hero-card">
        <img src={agroDigitalLogo} alt="AgroDigital" className="auth-logo" />
        <div>
          <span className="auth-kicker">Alta segura al grupo de gestión</span>
          <h1>Unite a un grupo de gestión</h1>
          <p>Ingresá tus datos, el código del grupo y la OTP que te compartió el gerente. Si todo coincide, se genera una solicitud pendiente de aprobación.</p>
        </div>
        <div className="join-flow-card">
          <span><KeyRound size={22} /></span>
          <strong>Código + OTP de un solo uso</strong>
          <p>La OTP vence a los 7 días y queda consumida al enviar la solicitud.</p>
        </div>
        <div className="auth-hero-visual" aria-hidden="true">
          <img src={sidebarLandscapeExpanded} alt="" />
        </div>
      </div>

      {status ? (
        <section className="login-card join-card join-success-card">
          <span className="join-success-icon">
            <CheckCircle2 size={44} />
          </span>
          <div>
            <strong>Solicitud enviada correctamente</strong>
            <p>{status}</p>
          </div>
          <div className="join-success-detail">
            <Users size={20} />
            <span>El gerente va a revisar tus datos y definir tus permisos por empresa.</span>
          </div>
          <button className="primary-auth-button" type="button" onClick={onBack}>
            <LogIn size={21} />
            Volver al login
          </button>
        </section>
      ) : (
      <form className="login-card join-card" onSubmit={submitJoinRequest}>
        <div className="login-card-header">
          <span className="login-icon">
            <UserPlus size={28} />
          </span>
          <div>
            <strong>Solicitud de acceso</strong>
            <span>El gerente define después tus permisos por empresa.</span>
          </div>
        </div>

        {invitedByLink && (
          <p className="join-invite-notice" role="status">
            <CheckCircle2 size={18} />
            <span>
              Llegaste desde una invitación: el código del grupo y la OTP ya están cargados.
              {initialValues?.correoElectronico ? ' Usá el correo en el que la recibiste.' : ''}
            </span>
          </p>
        )}

        <div className="invite-tabs join-account-tabs" role="tablist" aria-label="Tipo de cuenta">
          <button type="button" role="tab" aria-selected={!existingAccount} className={!existingAccount ? 'active' : ''} onClick={() => setExistingAccount(false)}>
            <UserPlus size={16} /> Soy nuevo
          </button>
          <button type="button" role="tab" aria-selected={existingAccount} className={existingAccount ? 'active' : ''} onClick={() => setExistingAccount(true)}>
            <User size={16} /> Ya tengo cuenta en AgroDigital
          </button>
        </div>

        {existingAccount && (
          <p className="join-invite-notice" role="status">
            <CheckCircle2 size={18} />
            <span>Ingresá el correo y la contraseña con los que ya entrás a AgroDigital. Usamos los datos de tu cuenta para la solicitud.</span>
          </p>
        )}

        {existingAccount ? (
          <div className="join-form-grid">
            <label className="auth-field">
              <span>Correo electrónico *</span>
              <div>
                <User size={20} />
                <input type="email" value={form.correoElectronico} onChange={(event) => updateField('correoElectronico', event.target.value)} placeholder="juan.perez@correo.com" autoComplete="username" required />
              </div>
            </label>
            <label className="auth-field manager-password-field">
              <span>Contraseña actual *</span>
              <div>
                <LockKeyhole size={20} />
                <input type={showPassword ? 'text' : 'password'} data-text-case="preserve" value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="current-password" placeholder="Tu contraseña de AgroDigital" required />
                <button className="password-visibility-button" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </label>
          </div>
        ) : (
        <div className="join-form-grid">
          <label className="auth-field">
            <span>Nombre *</span>
            <div>
              <User size={20} />
              <input value={form.nombre} onChange={(event) => updateField('nombre', event.target.value)} placeholder="Ej: Juan" required />
            </div>
          </label>
          <label className="auth-field">
            <span>Apellido *</span>
            <div>
              <User size={20} />
              <input value={form.apellido} onChange={(event) => updateField('apellido', event.target.value)} placeholder="Ej: Pérez" required />
            </div>
          </label>
          <label className="auth-field">
            <span>Teléfono *</span>
            <div>
              <User size={20} />
              <input value={form.telefono} onChange={(event) => updateField('telefono', event.target.value)} placeholder="Ej: 3512345678" required />
            </div>
          </label>
          <label className="auth-field">
            <span>Correo electrónico *</span>
            <div>
              <User size={20} />
              <input type="email" value={form.correoElectronico} onChange={(event) => updateField('correoElectronico', event.target.value)} placeholder="juan.perez@correo.com" required />
            </div>
          </label>
        </div>
        )}

        <div className="join-form-grid">
          <label className="auth-field">
            <span>Código del grupo *</span>
            <div>
              <Users size={20} />
              <input data-text-case="upper" value={form.grupoGestionCodigo} onChange={(event) => updateField('grupoGestionCodigo', event.target.value.toUpperCase())} placeholder="GG-WDUAWXZA" required />
            </div>
          </label>
          <label className="auth-field">
            <span>Clave OTP *</span>
            <div>
              <KeyRound size={20} />
              <input data-text-case="upper" value={form.otp} onChange={(event) => updateField('otp', event.target.value.toUpperCase())} placeholder="OTP-ABCD-1234" required />
            </div>
          </label>
        </div>

        {!existingAccount && (
        <>
        <div className="join-form-grid">
          <label className="auth-field manager-password-field">
            <span>Contraseña *</span>
            <div>
              <LockKeyhole size={20} />
              <input type={showPassword ? 'text' : 'password'} data-text-case="preserve" value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="new-password" placeholder="Mínimo 8 caracteres" required />
              <button className="password-visibility-button" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </label>
          <label className="auth-field manager-password-field">
            <span>Repetir contraseña *</span>
            <div>
              <LockKeyhole size={20} />
              <input type={showRepeatPassword ? 'text' : 'password'} data-text-case="preserve" value={form.repetirPassword} onChange={(event) => updateField('repetirPassword', event.target.value)} autoComplete="new-password" placeholder="Repetí la contraseña" required />
              <button className="password-visibility-button" type="button" onClick={() => setShowRepeatPassword((current) => !current)} aria-label={showRepeatPassword ? 'Ocultar repetición de contraseña' : 'Mostrar repetición de contraseña'}>
                {showRepeatPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </label>
        </div>

        <PasswordRequirements requirements={passwordRequirements} passwordsMatch={passwordsMatch} repeatTouched={form.repetirPassword.length > 0} />
        </>
        )}

        {error && <p className="auth-error">{error}</p>}
        {status && <p className="auth-success">{status}</p>}

        <button className="primary-auth-button" type="submit" disabled={!canSubmit}>
          <UserPlus size={21} />
          Enviar solicitud
        </button>

        <button className="join-team-link" type="button" onClick={onBack}>
          Volver al login
        </button>
      </form>
      )}
    </section>
  );
}

function ManagerWelcomePage({ managerName, onContinue, onLogout }) {
  const displayName = managerName?.trim() || 'Gerente';

  return (
    <section className="manager-welcome-page">
      <div className="manager-welcome-card">
        <header className="manager-welcome-topbar">
          <img src={agroDigitalLogo} alt="AgroDigital" />
          <button className="admin-logout" type="button" onClick={onLogout}>
            <LogOut size={19} />
            Salir
          </button>
        </header>

        <div className="manager-welcome-content">
          <div className="manager-welcome-copy">
            <span className="manager-welcome-kicker">Primer ingreso</span>
            <span className="manager-welcome-name">Hola, {displayName}</span>
            <h1>Bienvenido a AgroDigital</h1>
            <p>
              Estás a un paso de activar tu espacio de gestión. En el próximo paso vas a confirmar tus datos,
              definir tu contraseña definitiva y cargar tus primeras empresas.
            </p>

            <div className="manager-welcome-actions">
              <button className="primary-admin-button manager-welcome-cta" type="button" onClick={onContinue}>
                <CheckCircle2 size={21} />
                Continuar al registro
              </button>
            </div>
          </div>

          <aside className="manager-welcome-panel" aria-label="Resumen de activación">
            <div className="manager-welcome-badge">
              <ShieldCheck size={34} />
              <span>Acceso seguro</span>
            </div>
            <div className="manager-welcome-steps">
              <span>
                <KeyRound size={20} />
                Contraseña definitiva
              </span>
              <span>
                <Building2 size={20} />
                Grupo de gestión
              </span>
              <span>
                <Warehouse size={20} />
                Empresas iniciales
              </span>
            </div>
          </aside>
        </div>

        <div className="manager-welcome-visual" aria-hidden="true">
          <img src={sidebarLandscapeExpanded} alt="" />
        </div>
      </div>
    </section>
  );
}

function ManagerRegistrationPage({ initialName, initialEmail = '', error, onSubmit, onLogout }) {
  const [form, setForm] = useState({
    nombre: initialName?.split(' ')[0] ?? '',
    apellido: '',
    telefono: '',
    correoElectronico: initialEmail ?? '',
    password: '',
    repetirPassword: '',
    empresas: ['']
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const passwordRequirements = useMemo(() => getPasswordRequirements(form.password), [form.password]);
  const passwordIsStrong = passwordRequirements.every((requirement) => requirement.valid);
  const passwordsMatch = form.password.length > 0 && form.password === form.repetirPassword;

  function updateField(field, value) {
    const nextValue = field === 'nombre' || field === 'apellido'
      ? formatPersonName(value)
      : value;
    setForm((current) => ({ ...current, [field]: nextValue }));
  }

  function updateCompany(index, value) {
    setForm((current) => ({
      ...current,
      empresas: current.empresas.map((empresa, currentIndex) => currentIndex === index ? value : empresa)
    }));
  }

  function addCompany() {
    setForm((current) => ({ ...current, empresas: [...current.empresas, ''] }));
  }

  function removeCompany(index) {
    setForm((current) => ({
      ...current,
      empresas: current.empresas.length === 1
        ? ['']
        : current.empresas.filter((_, currentIndex) => currentIndex !== index)
    }));
  }

  function submitRegistration(event) {
    event.preventDefault();
    onSubmit({
      ...form,
      empresas: form.empresas.map((empresa) => empresa.trim()).filter(Boolean)
    });
  }

  const canSubmit = form.nombre.trim()
    && form.apellido.trim()
    && form.telefono.trim()
    && form.correoElectronico.trim()
    && passwordIsStrong
    && passwordsMatch
    && form.empresas.some((empresa) => empresa.trim());

  return (
    <section className="manager-registration-page">
      <header className="manager-registration-header">
        <div className="admin-brand">
          <img src={agroDigitalLogo} alt="AgroDigital" />
          <div>
            <span>Primer ingreso</span>
            <strong>Completá tu cuenta gerente</strong>
          </div>
        </div>
        <button className="admin-logout" type="button" onClick={onLogout}>
          <LogOut size={19} />
          Salir
        </button>
      </header>

      <div className="manager-registration-layout">
        <section className="manager-registration-card">
          <div className="admin-card-heading">
            <span>
              <ShieldCheck size={25} />
            </span>
            <div>
              <h1>Activá tu acceso a AgroDigital</h1>
              <p>Cargá tus datos reales, definí tu contraseña y registrá tus primeras empresas.</p>
            </div>
          </div>

          <form className="manager-registration-form" onSubmit={submitRegistration}>
            <div className="manager-form-grid">
              <label className="admin-field">
                <span>Nombre *</span>
                <input value={form.nombre} onChange={(event) => updateField('nombre', event.target.value)} placeholder="Ej: Juan" required />
              </label>
              <label className="admin-field">
                <span>Apellido *</span>
                <input value={form.apellido} onChange={(event) => updateField('apellido', event.target.value)} placeholder="Ej: Pérez" required />
              </label>
              <label className="admin-field">
                <span>Teléfono *</span>
                <input value={form.telefono} onChange={(event) => updateField('telefono', event.target.value)} placeholder="Ej: 3512345678" required />
              </label>
              <label className="admin-field">
                <span>Correo electrónico *</span>
                <input type="email" value={form.correoElectronico} onChange={(event) => updateField('correoElectronico', event.target.value)} placeholder="Ej: gerente@empresa.com" required />
              </label>
            </div>

            <div className="manager-form-grid">
              <label className="auth-field manager-password-field">
                <span>Contraseña nueva *</span>
                <div>
                  <LockKeyhole size={20} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    data-text-case="preserve"
                    value={form.password}
                    onChange={(event) => updateField('password', event.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    required
                  />
                  <button className="password-visibility-button" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </label>
              <label className="auth-field manager-password-field">
                <span>Repetir contraseña *</span>
                <div>
                  <LockKeyhole size={20} />
                  <input
                    type={showRepeatPassword ? 'text' : 'password'}
                    data-text-case="preserve"
                    value={form.repetirPassword}
                    onChange={(event) => updateField('repetirPassword', event.target.value)}
                    placeholder="Repetí la contraseña"
                    autoComplete="new-password"
                    required
                  />
                  <button className="password-visibility-button" type="button" onClick={() => setShowRepeatPassword((current) => !current)} aria-label={showRepeatPassword ? 'Ocultar repetición de contraseña' : 'Mostrar repetición de contraseña'}>
                    {showRepeatPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </label>
            </div>


            <PasswordRequirements requirements={passwordRequirements} passwordsMatch={passwordsMatch} repeatTouched={form.repetirPassword.length > 0} />
            <section className="companies-card">
              <div className="companies-title">
                <div>
                  <strong>Empresas iniciales</strong>
                  <span>Luego vas a poder agregar más desde el módulo Usuarios.</span>
                </div>
                <button type="button" onClick={addCompany}>
                  <PlusCircle size={18} />
                  Agregar
                </button>
              </div>

              <div className="companies-list">
                {form.empresas.map((empresa, index) => (
                  <label className="admin-field company-field" key={index}>
                    <span>Empresa {index + 1} *</span>
                    <div>
                      <input value={empresa} onChange={(event) => updateCompany(index, event.target.value)} placeholder="Ej: Agro Los Cóndores" />
                      <button type="button" onClick={() => removeCompany(index)} aria-label={`Quitar empresa ${index + 1}`}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            {error && <p className="auth-error">{error}</p>}

            <button className="primary-admin-button manager-submit-button" type="submit" disabled={!canSubmit}>
              <CheckCircle2 size={21} />
              Completar registro
            </button>
          </form>
        </section>

        <aside className="manager-registration-aside">
          <div className="registration-step-card">
            <KeyRound size={29} />
            <strong>Tu acceso temporal queda cerrado</strong>
            <span>Desde ahora vas a ingresar con tu correo electrónico y la contraseña que definas acá.</span>
          </div>
          <div className="registration-step-card">
            <Users size={29} />
            <strong>Se crea tu grupo de gestión</strong>
            <span>Ese grupo tendrá un código propio para invitar empleados con OTP en la próxima etapa.</span>
          </div>
          <div className="registration-step-card">
            <Warehouse size={29} />
            <strong>Empresas separadas</strong>
            <span>Cada lote, campaña y operación futura quedará asociado a una empresa seleccionada.</span>
          </div>
        </aside>
      </div>
    </section>
  );
}

export { LoginPage, JoinTeamPage, ManagerWelcomePage, ManagerRegistrationPage };
