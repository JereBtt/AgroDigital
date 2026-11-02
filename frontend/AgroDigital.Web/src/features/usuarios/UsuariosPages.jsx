import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, XCircle, AlertTriangle, Building2, CheckCircle2, ChevronDown, ClipboardList, Copy, Edit, Eye, EyeOff, KeyRound, LoaderCircle, RotateCcw, Search, Mail, Phone, ShieldCheck, Trash2, User, UserPlus, Users, Warehouse } from 'lucide-react';
import { formatRole } from '../../shared/utils/roles.js';
import { formatDate } from '../../shared/utils/formatDate.js';
import { normalizeSearchText } from '../../shared/utils/normalizeSearchText.js';
import SummaryCard from '../../shared/components/SummaryCard.jsx';

function ManagerUsersPage({
  context, error, generatedOtp, copiedKey, loadingOtp, onGenerateOtp, onCopy,
  requests = [], users = [], userSaving, actionStatus, onApproveRequest, onResolveRequest, onToggleUserStatus,
  invitations = [], invitationSaving = '', invitationResult = null, invitationError = '',
  onCreateInvitation, onResendInvitation, onCancelInvitation,
  selectedEmpresaId = '', onSelectEmpresa, onUpdateUserAccess
}) {
  const [invitationTab, setInvitationTab] = useState('correo');
  const empresas = context?.empresas ?? [];
  const empresasActivas = empresas.filter((empresa) => empresa.activo);
  // Empresa de trabajo de la pantalla: la elegida en el selector (compartido con el resto del sistema)
  // o, si no hay una valida, la principal.
  const empresaSeleccionada = empresasActivas.find((empresa) => String(empresa.empresaId) === String(selectedEmpresaId))
    ?? empresasActivas.find((empresa) => empresa.esPrincipal)
    ?? empresasActivas[0]
    ?? null;
  const empresaSeleccionadaId = empresaSeleccionada ? String(empresaSeleccionada.empresaId) : '';
  const invitacionesEmpresa = invitations.filter((inv) => !inv.empresaId || String(inv.empresaId) === empresaSeleccionadaId);
  const otpEmpresa = generatedOtp && (!generatedOtp.empresaId || String(generatedOtp.empresaId) === empresaSeleccionadaId)
    ? generatedOtp
    : null;
  const [alcanceUsuarios, setAlcanceUsuarios] = useState('empresa');
  const usersEmpresa = empresaSeleccionada && alcanceUsuarios === 'empresa'
    ? users.filter((user) => (user.empresas ?? []).some((empresa) => String(empresa.empresaId) === empresaSeleccionadaId))
    : users;
  const [userFilters, setUserFilters] = useState({
    search: '',
    estado: 'todos',
    desde: '',
    hasta: ''
  });
  const principal = empresas.find((empresa) => empresa.esPrincipal);
  const solicitudesPendientes = requests.length;
  const usuariosHabilitados = usersEmpresa.filter((user) => user.activo).length;
  const usuariosDeshabilitados = usersEmpresa.filter((user) => !user.activo).length;
  const filteredUsers = usersEmpresa.filter((user) => {
    const search = normalizeSearchText(userFilters.search.trim());
    const userDate = user.fechaAlta ? new Date(user.fechaAlta) : null;
    const fromDate = userFilters.desde ? new Date(`${userFilters.desde}T00:00:00`) : null;
    const toDate = userFilters.hasta ? new Date(`${userFilters.hasta}T23:59:59`) : null;
    const matchesSearch = !search || normalizeSearchText([
      user.nombre,
      user.apellido,
      user.correoElectronico,
      user.telefono,
      formatRole(user.rolGeneral),
      ...(user.empresas ?? []).flatMap((empresa) => [empresa.empresaNombre, formatRole(empresa.rol)])
    ].filter(Boolean).join(' ')).includes(search);
    const matchesState = userFilters.estado === 'todos'
      || (userFilters.estado === 'habilitados' && user.activo)
      || (userFilters.estado === 'deshabilitados' && !user.activo);
    const matchesFrom = !fromDate || (userDate && userDate >= fromDate);
    const matchesTo = !toDate || (userDate && userDate <= toDate);

    return matchesSearch && matchesState && matchesFrom && matchesTo;
  });
  const otpExpiration = generatedOtp?.fechaVencimiento
    ? new Date(generatedOtp.fechaVencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  return (
    <section className="content-panel manager-users-panel">
      <div className="page-heading">
        <div>
          <h1>Usuarios</h1>
          <p>Gestioná accesos, solicitudes y empresas vinculadas a tu grupo de gestión.</p>
        </div>
        {empresasActivas.length > 0 && (
          <label className="users-company-selector">
            <span><Building2 size={16} /> Empresa</span>
            <select
              value={empresaSeleccionadaId}
              onChange={(event) => onSelectEmpresa?.(event.target.value)}
              aria-label="Empresa para invitar y gestionar usuarios"
            >
              {empresasActivas.map((empresa) => (
                <option key={empresa.empresaId} value={empresa.empresaId}>
                  {empresa.nombre}{empresa.esPrincipal ? ' (principal)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <p className="auth-error">{error}</p>}
      {actionStatus && <p className="auth-success">{actionStatus}</p>}

      <div className="summary-grid users-summary-grid">
        <SummaryCard icon={<Users size={30} />} label="Grupo de gestión" value={context?.grupoGestionCodigo ?? 'Sin código'} helper="Código que se comparte junto a una OTP" />
        <SummaryCard
          icon={<Warehouse size={30} />}
          label="Empresa seleccionada"
          value={empresaSeleccionada?.nombre ?? 'Sin empresa'}
          helper={empresaSeleccionada?.esPrincipal ? 'Empresa principal del grupo' : `Principal: ${principal?.nombre ?? 'sin definir'}`}
        />
        <SummaryCard icon={<ClipboardList size={30} />} label="Solicitudes pendientes" value={solicitudesPendientes} helper="Altas esperando aprobación" />
      </div>

      <div className="manager-users-grid">
        <EmployeeInvitationCard
          context={context}
          empresa={empresaSeleccionada}
          tab={invitationTab}
          onTabChange={setInvitationTab}
          invitations={invitacionesEmpresa}
          saving={invitationSaving}
          result={invitationResult}
          error={invitationError}
          generatedOtp={otpEmpresa}
          loadingOtp={loadingOtp}
          copiedKey={copiedKey}
          onCopy={onCopy}
          onGenerateOtp={() => onGenerateOtp(empresaSeleccionada?.empresaId ?? null)}
          onCreate={onCreateInvitation}
          onResend={onResendInvitation}
          onCancel={onCancelInvitation}
        />

        <section className="dashboard-card users-card">
          <div className="card-heading">
            <div className="card-heading-icon"><Building2 size={18} /></div>
            <div>
              <h2>Empresas disponibles</h2>
              <p>Elegí una empresa para invitar personas y ver sus usuarios. Al aprobar podés sumar más empresas.</p>
            </div>
          </div>
          {empresas.length === 0 ? (
            <div className="users-inline-empty">
              <Building2 size={42} />
              <strong>No hay empresas cargadas.</strong>
              <span>Agregalos desde la gestión de usuarios para separar la operación.</span>
            </div>
          ) : (
            <div className="company-access-list">
              {empresas.map((empresa) => {
                const isSelected = String(empresa.empresaId) === empresaSeleccionadaId;
                const usuariosEnEmpresa = users.filter((user) => (user.empresas ?? []).some((item) => item.empresaId === empresa.empresaId && item.activo)).length;
                return (
                  <button
                    className={`company-access-item ${isSelected ? 'company-access-item-selected' : ''}`}
                    key={empresa.empresaId}
                    type="button"
                    onClick={() => empresa.activo && onSelectEmpresa?.(String(empresa.empresaId))}
                    disabled={!empresa.activo}
                    aria-pressed={isSelected}
                  >
                    <span><Building2 size={18} /></span>
                    <div>
                      <strong>{empresa.nombre}</strong>
                      <small>
                        {empresa.esPrincipal ? 'Empresa principal' : 'Empresa asociada'}
                        {` · ${usuariosEnEmpresa} ${usuariosEnEmpresa === 1 ? 'usuario' : 'usuarios'}`}
                      </small>
                    </div>
                    <em className={empresa.activo ? 'company-active' : 'company-disabled'}>
                      {!empresa.activo ? 'Deshabilitada' : isSelected ? 'Seleccionada' : 'Activa'}
                    </em>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-card users-card pending-users-card">
        <div className="card-heading">
          <div className="card-heading-icon"><UserPlus size={18} /></div>
          <div>
            <h2>Usuarios pendientes de aprobación</h2>
            <p>Cuando un empleado use el código y la OTP, su solicitud aparecerá acá para asignar rol por empresa.</p>
          </div>
          <span className="points-count">{solicitudesPendientes} pendientes</span>
        </div>
        <div className="pending-users-table-shell">
          {requests.length === 0 ? (
            <div className="pending-users-empty-row">
              <Users size={52} strokeWidth={1.8} />
              <strong>Aún no hay solicitudes pendientes</strong>
              <span>Las nuevas solicitudes aparecerán en esta tabla para aprobar o rechazar.</span>
            </div>
          ) : (
            <div className="pending-request-list">
              {requests.map((request) => (
                <PendingUserRequestCard key={request.solicitudUsuarioId} request={request} empresas={empresasActivas} onApprove={onApproveRequest} onResolve={onResolveRequest} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="dashboard-card users-card approved-users-card">
        <div className="card-heading">
          <div className="card-heading-icon"><Users size={18} /></div>
          <div>
            <h2>{alcanceUsuarios === 'empresa' && empresaSeleccionada ? `Usuarios de ${empresaSeleccionada.nombre}` : 'Usuarios del grupo'}</h2>
            <p>
              {alcanceUsuarios === 'empresa'
                ? 'Usuarios con acceso a la empresa seleccionada.'
                : 'Todos los usuarios de tu grupo de gestión, con sus accesos por empresa y rol.'}
              {' Con "Editar accesos" podés sumarlos a otras empresas o cambiar su rol.'}
            </p>
          </div>
          <span className="points-count">{usuariosHabilitados} habilitados · {usuariosDeshabilitados} deshabilitados</span>
        </div>

        <div className="approved-users-filters">
          <label className="filter-search-field">
            <Search size={18} />
            <input
              data-text-case="preserve"
              value={userFilters.search}
              onChange={(event) => setUserFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Buscar por nombre, correo, empresa o rol..."
            />
          </label>
          <label className="approved-filter-field">
            <span>Ver</span>
            <select value={alcanceUsuarios} onChange={(event) => setAlcanceUsuarios(event.target.value)}>
              <option value="empresa">Empresa seleccionada</option>
              <option value="grupo">Todo el grupo</option>
            </select>
          </label>
          <label className="approved-filter-field">
            <span>Estado</span>
            <select value={userFilters.estado} onChange={(event) => setUserFilters((current) => ({ ...current, estado: event.target.value }))}>
              <option value="todos">Todos</option>
              <option value="habilitados">Habilitados</option>
              <option value="deshabilitados">Deshabilitados</option>
            </select>
          </label>
          <label className="approved-filter-field">
            <span>Desde</span>
            <input type="date" value={userFilters.desde} onChange={(event) => setUserFilters((current) => ({ ...current, desde: event.target.value }))} />
          </label>
          <label className="approved-filter-field">
            <span>Hasta</span>
            <input type="date" value={userFilters.hasta} onChange={(event) => setUserFilters((current) => ({ ...current, hasta: event.target.value }))} />
          </label>
          <button className="clear-users-filters-button" type="button" onClick={() => setUserFilters({ search: '', estado: 'todos', desde: '', hasta: '' })}>
            <RotateCcw size={17} />
            Limpiar
          </button>
        </div>

        {usersEmpresa.length === 0 ? (
          <div className="pending-users-empty-row approved-users-empty-row">
            <Users size={52} strokeWidth={1.8} />
            <strong>{users.length === 0 ? 'Aún no hay usuarios aprobados' : `Todavía no hay usuarios en ${empresaSeleccionada?.nombre ?? 'esta empresa'}`}</strong>
            <span>
              {users.length === 0
                ? 'Cuando apruebes una solicitud, el usuario aparecerá en esta tabla.'
                : 'Invitá a alguien nuevo, o elegí "Todo el grupo" y usá "Editar accesos" para sumar a un usuario existente.'}
            </span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="pending-users-empty-row approved-users-empty-row">
            <Search size={52} strokeWidth={1.8} />
            <strong>No hay usuarios para esos filtros</strong>
            <span>Ajustá la búsqueda, el estado o el rango de fechas para ver más resultados.</span>
          </div>
        ) : (
          <div className="approved-users-table">
            {filteredUsers.map((user) => (
              <ApprovedUserRow
                key={user.usuarioId}
                user={user}
                saving={userSaving}
                onToggleStatus={onToggleUserStatus}
                empresas={empresasActivas}
                onUpdateAccess={onUpdateUserAccess}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function ApprovedUserRow({ user, saving, onToggleStatus, readOnly = false, empresas = [], onUpdateAccess }) {
  const fullName = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.correoElectronico;
  const action = user.activo ? 'deshabilitar' : 'habilitar';
  const isSaving = saving === `${action}-${user.usuarioId}`;
  const [editingAccess, setEditingAccess] = useState(false);
  const canEditAccess = !readOnly && user.activo && typeof onUpdateAccess === 'function' && empresas.length > 0;

  return (
    <article className={`approved-user-row ${!user.activo ? 'approved-user-row-disabled' : ''}`}>
      <span className="approved-user-avatar"><User size={23} /></span>
      <div className="approved-user-main">
        <strong>{fullName}</strong>
        <small><Mail size={14} /> {user.correoElectronico}</small>
        <small><Phone size={14} /> {user.telefono || 'Sin teléfono'}</small>
      </div>
      {user.tieneRolGeneral ? (
        <div className="approved-user-meta">
          <span className="approved-user-label">Rol general</span>
          <em className="role-chip">{formatRole(user.rolGeneral)}</em>
        </div>
      ) : (
        <div className="approved-user-meta approved-user-meta-empty">
          <span className="approved-user-label">Rol por empresa</span>
        </div>
      )}
      <div className="approved-user-teams">
        {(user.empresas ?? []).map((empresa) => (
          <span className={`team-role-pill ${empresa.activo ? '' : 'team-role-pill-disabled'}`} key={empresa.empresaId}>
            <Building2 size={14} />
            <strong>{empresa.empresaNombre}</strong>
            <em>{formatRole(empresa.rol)}</em>
          </span>
        ))}
      </div>
      <div className="approved-user-status-actions">
        <em className={user.activo ? 'company-active' : 'company-disabled'}>{user.activo ? 'Habilitado' : 'Deshabilitado'}</em>
        {canEditAccess && !editingAccess && (
          <button className="team-action-button" type="button" onClick={() => setEditingAccess(true)} disabled={Boolean(saving)}>
            <Edit size={16} />
            Editar accesos
          </button>
        )}
        {!readOnly && <button
          className={'team-action-button ' + (user.activo ? 'team-danger-action' : 'team-enable-action')}
          type="button"
          onClick={() => onToggleStatus(user)}
          disabled={isSaving}
        >
          {isSaving ? <LoaderCircle className="spin-icon" size={16} /> : user.activo ? <Trash2 size={16} /> : <CheckCircle2 size={16} />}
          {user.activo ? 'Deshabilitar' : 'Habilitar'}
        </button>}
      </div>
      {canEditAccess && editingAccess && (
        <UserAccessEditor
          user={user}
          empresas={empresas}
          saving={saving === `accesos-${user.usuarioId}`}
          onCancel={() => setEditingAccess(false)}
          onSave={async (payload) => {
            const ok = await onUpdateAccess(user, payload);
            if (ok) setEditingAccess(false);
          }}
        />
      )}
    </article>
  );
}

/** Edita las empresas (y el rol en cada una) de un usuario que ya pertenece al grupo. */
function UserAccessEditor({ user, empresas, saving, onCancel, onSave }) {
  const accesosActuales = Object.fromEntries((user.empresas ?? [])
    .filter((empresa) => empresa.activo)
    .map((empresa) => [empresa.empresaId, empresa.rol]));
  const rolPorDefecto = user.rolGeneral && ROLE_OPTIONS.some((role) => role.value === user.rolGeneral) ? user.rolGeneral : 'EmpleadoCampo';
  const [selected, setSelected] = useState(() => Object.fromEntries(empresas.map((empresa) => [empresa.empresaId, Boolean(accesosActuales[empresa.empresaId])])));
  const [roles, setRoles] = useState(() => Object.fromEntries(empresas.map((empresa) => [empresa.empresaId, accesosActuales[empresa.empresaId] ?? rolPorDefecto])));

  const payload = empresas
    .filter((empresa) => selected[empresa.empresaId])
    .map((empresa) => ({ empresaId: empresa.empresaId, rol: roles[empresa.empresaId] ?? rolPorDefecto }));
  const hasChanges = empresas.some((empresa) => {
    const tenia = Boolean(accesosActuales[empresa.empresaId]);
    const tiene = Boolean(selected[empresa.empresaId]);
    return tenia !== tiene || (tiene && accesosActuales[empresa.empresaId] !== roles[empresa.empresaId]);
  });
  const canSave = payload.length > 0 && hasChanges && !saving;

  return (
    <div className="user-access-editor">
      <div className="user-access-editor-heading">
        <strong>Accesos por empresa</strong>
        <small>Marcá las empresas a las que puede ingresar y su rol en cada una.</small>
      </div>
      <div className="company-role-grid">
        {empresas.map((empresa) => {
          const companySelected = Boolean(selected[empresa.empresaId]);
          return (
            <div className={`company-role-item ${companySelected ? '' : 'company-role-item-disabled'}`} key={empresa.empresaId}>
              <label>
                <input
                  type="checkbox"
                  checked={companySelected}
                  onChange={(event) => setSelected((current) => ({ ...current, [empresa.empresaId]: event.target.checked }))}
                />
                <span>{empresa.nombre}</span>
              </label>
              <RoleDropdown
                value={roles[empresa.empresaId] ?? rolPorDefecto}
                onChange={(nextRole) => setRoles((current) => ({ ...current, [empresa.empresaId]: nextRole }))}
                disabled={!companySelected}
                ariaLabel={`Seleccionar rol de ${user.nombre ?? 'usuario'} para ${empresa.nombre}`}
              />
            </div>
          );
        })}
      </div>
      {payload.length === 0 && (
        <small className="user-access-editor-warning">Seleccioná al menos una empresa. Para quitarle todo el acceso, deshabilitá al usuario.</small>
      )}
      <div className="user-access-editor-actions">
        <button className="approve-request-button" type="button" onClick={() => onSave({ empresas: payload })} disabled={!canSave}>
          {saving ? <LoaderCircle className="spin-icon" size={18} /> : <CheckCircle2 size={18} />}
          {saving ? 'Guardando...' : 'Guardar accesos'}
        </button>
        <button className="team-action-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button>
      </div>
    </div>
  );
}

/**
 * Empresas para quien NO es Gerente: solo consulta de las empresas en las que tiene acceso.
 * Crear, editar, deshabilitar o cambiar la principal es exclusivo del Gerente (la API lo valida).
 */

function MyAccessUsersPage({ acceso, equipo = [], error }) {
  const [search, setSearch] = useState('');
  const grupos = acceso?.grupos ?? [];
  const empresas = grupos.flatMap((grupo) => grupo.empresas);
  const principal = empresas.find((empresa) => empresa.esPrincipal) ?? empresas[0];
  const texto = normalizeSearchText(search.trim());
  const equipoFiltrado = equipo.filter((user) => !texto || normalizeSearchText([
    user.nombre, user.apellido, user.correoElectronico, formatRole(user.rolGeneral),
    ...(user.empresas ?? []).flatMap((empresa) => [empresa.empresaNombre, formatRole(empresa.rol)])
  ].filter(Boolean).join(' ')).includes(texto));

  return (
    <section className="content-panel manager-users-panel">
      <div className="page-heading">
        <div>
          <h1>Usuarios</h1>
          <p>
            {acceso?.puedeVerEquipo
              ? 'Consultá tu acceso y el equipo de tus empresas. Los accesos los gestiona el Gerente.'
              : 'Consultá tu acceso a AgroDigital. Los accesos los gestiona el Gerente de tu grupo.'}
          </p>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div className="summary-grid users-summary-grid">
        <SummaryCard
          icon={<Users size={30} />}
          label="Grupo de gestión"
          value={grupos[0]?.codigo ?? 'Sin grupo'}
          helper={grupos.length > 1 ? `y ${grupos.length - 1} grupo(s) más` : grupos[0] ? `Gerente: ${grupos[0].gerente}` : 'Todavía no pertenecés a un grupo'}
        />
        <SummaryCard icon={<Building2 size={30} />} label="Empresa principal" value={principal?.nombre ?? 'Sin empresa'} helper={principal ? `Tu rol: ${formatRole(principal.rol)}` : 'Todavía no tenés empresas asignadas'} />
        <SummaryCard icon={<ShieldCheck size={30} />} label="Empresas asignadas" value={empresas.length} helper="Empresas en las que tenés acceso" />
      </div>

      <section className="dashboard-card users-card my-access-card">
        <div className="card-heading">
          <div className="card-heading-icon"><ShieldCheck size={18} /></div>
          <div>
            <h2>Mi acceso</h2>
            <p>Tu rol puede ser distinto en cada empresa. Si necesitás un cambio, pedíselo al Gerente.</p>
          </div>
        </div>

        {grupos.length === 0 ? (
          <div className="users-inline-empty">
            <Building2 size={42} />
            <strong>Todavía no tenés empresas asignadas.</strong>
            <span>Cuando el Gerente apruebe tu acceso, vas a verlas acá.</span>
          </div>
        ) : grupos.map((grupo) => (
          <div className="my-access-group" key={grupo.grupoGestionId}>
            <div className="my-access-block">
              <small className="my-access-label">Tus empresas y tu rol</small>
              <div className="my-access-companies">
                {grupo.empresas.map((empresa) => (
                  <span className="team-role-pill" key={empresa.empresaId}>
                    <Building2 size={14} />
                    <strong>{empresa.nombre}</strong>
                    <em>{formatRole(empresa.rol)}</em>
                    {empresa.esPrincipal && <small className="my-access-principal">Principal</small>}
                  </span>
                ))}
              </div>
            </div>
            <div className="my-access-contact">
              <span className="approved-user-avatar"><User size={20} /></span>
              <div>
                <small className="my-access-label">Tu gerente</small>
                <strong>{grupo.gerente}</strong>
                <span className="my-access-contact-text">
                  Gestiona los accesos de {grupo.empresas.map((empresa) => empresa.nombre).join(', ')}.
                  {grupo.gerenteCorreo ? ' Escribile si necesitás un cambio:' : ''}
                </span>
                {grupo.gerenteCorreo && (
                  <a href={`mailto:${grupo.gerenteCorreo}`}><Mail size={14} /> {grupo.gerenteCorreo}</a>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>

      {acceso?.puedeVerEquipo && (
        <section className="dashboard-card users-card approved-users-card">
          <div className="card-heading">
            <div className="card-heading-icon"><Users size={18} /></div>
            <div>
              <h2>Equipo de tus empresas</h2>
              <p>Solo consulta: invitar, aprobar o deshabilitar usuarios lo hace el Gerente.</p>
            </div>
            <span className="points-count">{equipo.length} {equipo.length === 1 ? 'persona' : 'personas'}</span>
          </div>

          <div className="approved-users-filters">
            <label className="filter-search-field">
              <Search size={18} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre, correo, empresa o rol"
                aria-label="Buscar en el equipo"
              />
            </label>
          </div>

          {equipoFiltrado.length === 0 ? (
            <div className="pending-users-empty-row approved-users-empty-row">
              <Users size={34} />
              <strong>{equipo.length === 0 ? 'Todavía no hay otras personas en tus empresas' : 'No hay resultados para esa búsqueda'}</strong>
            </div>
          ) : (
            <div className="approved-users-table">
              {equipoFiltrado.map((user) => (
                <ApprovedUserRow key={user.usuarioId} user={user} readOnly />
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}

const ROLE_OPTIONS = [
  { value: 'Encargado', label: 'Encargado' },
  { value: 'EmpleadoCampo', label: 'Empleado de campo' },
  { value: 'EmpleadoAdministrativo', label: 'Empleado administrativo' }
];

function RoleDropdown({ value, onChange, disabled = false, ariaLabel = 'Seleccionar rol' }) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const wrapperRef = useRef(null);
  const selectedRole = ROLE_OPTIONS.find((role) => role.value === value) ?? ROLE_OPTIONS[0];

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);
  useEffect(() => {
    if (!open || !wrapperRef.current) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const estimatedMenuHeight = 154;
    const availableBelow = window.innerHeight - rect.bottom;
    const availableAbove = rect.top;
    setOpenUpward(availableBelow < estimatedMenuHeight && availableAbove > availableBelow);
  }, [open]);

  function chooseRole(roleValue) {
    onChange(roleValue);
    setOpen(false);
  }

  return (
    <div className={`role-dropdown ${open ? 'role-dropdown-open' : ''} ${openUpward ? 'role-dropdown-up' : ''} ${disabled ? 'role-dropdown-disabled' : ''}`} ref={wrapperRef}>
      <button
        className="role-dropdown-button"
        type="button"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span>{selectedRole.label}</span>
        <ChevronDown size={18} />
      </button>
      {open && !disabled && (
        <div className="role-dropdown-menu" role="listbox" aria-label={ariaLabel}>
          {ROLE_OPTIONS.map((role) => (
            <button
              className={`role-dropdown-option ${role.value === value ? 'role-dropdown-option-selected' : ''}`}
              type="button"
              key={role.value}
              role="option"
              aria-selected={role.value === value}
              onClick={() => chooseRole(role.value)}
            >
              {role.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingUserRequestCard({ request, empresas, onApprove, onResolve }) {
  // Si la solicitud viene de una invitacion para una empresa puntual, esa empresa llega preseleccionada.
  const empresaInvitada = empresas.find((empresa) => empresa.empresaId === request.empresaId) ?? null;
  const [accesoATodas, setAccesoATodas] = useState(() => !empresaInvitada);
  const [rolGeneral, setRolGeneral] = useState('EmpleadoCampo');
  const [selectedCompanies, setSelectedCompanies] = useState(() => Object.fromEntries(empresas.map((empresa) => [empresa.empresaId, empresaInvitada ? empresa.empresaId === empresaInvitada.empresaId : true])));
  const [companyRoles, setCompanyRoles] = useState(() => Object.fromEntries(empresas.map((empresa) => [empresa.empresaId, 'EmpleadoCampo'])));

  useEffect(() => {
    setSelectedCompanies((current) => Object.fromEntries(empresas.map((empresa) => [empresa.empresaId, current[empresa.empresaId] ?? !request.empresaId])));
    setCompanyRoles((current) => Object.fromEntries(empresas.map((empresa) => [empresa.empresaId, current[empresa.empresaId] ?? 'EmpleadoCampo'])));
  }, [empresas]);

  const selectedPayload = empresas
    .filter((empresa) => selectedCompanies[empresa.empresaId])
    .map((empresa) => ({ empresaId: empresa.empresaId, rol: companyRoles[empresa.empresaId] ?? rolGeneral }));
  const canApprove = accesoATodas || selectedPayload.length > 0;

  function approveRequest() {
    onApprove(request.solicitudUsuarioId, {
      rolGeneral,
      accesoATodas,
      empresas: accesoATodas ? [] : selectedPayload
    });
  }

  return (
    <article className="pending-request-card">
      <div className="pending-request-person">
        <span className="pending-request-avatar"><User size={25} /></span>
        <div>
          <strong>{request.nombre} {request.apellido}</strong>
          <small>{request.correoElectronico}</small>
          <small>{request.telefono} · Solicitó el {formatDate(request.fechaCreacion)}</small>
          {request.empresaNombre && (
            <span className="pending-request-company"><Building2 size={14} /> Invitado a {request.empresaNombre}</span>
          )}
        </div>
      </div>

      <div className="pending-request-access">
        <div className="request-access-topline">
          <label className="admin-field compact-role-field">
            <span>Rol general *</span>
            <RoleDropdown value={rolGeneral} onChange={setRolGeneral} disabled={!accesoATodas} ariaLabel="Seleccionar rol general" />
          </label>
          <label className="access-scope-toggle">
            <input type="checkbox" checked={accesoATodas} onChange={(event) => setAccesoATodas(event.target.checked)} />
            <span>Acceso a todas las empresas</span>
          </label>
        </div>

        {!accesoATodas && (
          <div className="company-role-grid">
            {empresas.map((empresa) => {
              const companySelected = Boolean(selectedCompanies[empresa.empresaId]);

              return (
              <div className={`company-role-item ${companySelected ? '' : 'company-role-item-disabled'}`} key={empresa.empresaId}>
                <label>
                  <input type="checkbox" checked={companySelected} onChange={(event) => setSelectedCompanies((current) => ({ ...current, [empresa.empresaId]: event.target.checked }))} />
                  <span>{empresa.nombre}</span>
                </label>
                <RoleDropdown value={companyRoles[empresa.empresaId] ?? rolGeneral} onChange={(nextRole) => setCompanyRoles((current) => ({ ...current, [empresa.empresaId]: nextRole }))} disabled={!companySelected} ariaLabel={`Seleccionar rol para ${empresa.nombre}`} />
              </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pending-request-actions">
        <button className="approve-request-button" type="button" onClick={approveRequest} disabled={!canApprove}>
          <CheckCircle2 size={18} />
          Aprobar
        </button>
        <button className="reject-request-button" type="button" onClick={() => onResolve(request.solicitudUsuarioId, 'rechazar')}>
          <Trash2 size={18} />
          Rechazar
        </button>
      </div>
    </article>
  );
}
const INVITACION_CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Enlace que abre "Solicitar acceso" con el codigo y la OTP (y el correo) precargados. */
function buildJoinLink(codigo, otp, correo = '') {
  const params = new URLSearchParams({ unirse: codigo, otp });
  if (correo) params.set('correo', correo);
  return `${window.location.origin}/?${params.toString()}`;
}

/** Mensaje listo para pegar en WhatsApp u otro medio. */
function buildInvitationMessage({ codigo, otp, correo = '', vence = null }) {
  const venceTexto = vence
    ? new Date(vence).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  return [
    '¡Hola! Te invito a sumarte a nuestro equipo en AgroDigital.',
    '',
    `1. Entrá a este enlace: ${buildJoinLink(codigo, otp, correo)}`,
    '2. Completá tus datos y enviá la solicitud. Después la apruebo y te asigno un rol.',
    '',
    'Si preferís cargarlos a mano, en "Solicitar acceso":',
    `Código de grupo: ${codigo}`,
    `OTP: ${otp}`,
    correo ? `Usá este correo: ${correo}` : null,
    venceTexto ? `Es de un solo uso y vence el ${venceTexto}.` : 'Es de un solo uso.'
  ].filter((linea) => linea !== null).join('\n');
}

function ShareInvitationActions({ message, copiedKey, onCopy }) {
  return (
    <div className="invite-share-actions">
      <button className={`invite-share-button ${copiedKey === message ? 'invite-share-button-copied' : ''}`} type="button" onClick={() => onCopy(message)}>
        {copiedKey === message ? <CheckCircle2 size={16} /> : <Copy size={16} />}
        {copiedKey === message ? 'Mensaje copiado' : 'Copiar mensaje'}
      </button>
      <a className="invite-share-button" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
        <MessageCircle size={16} />
        Compartir por WhatsApp
      </a>
    </div>
  );
}

function EmployeeInvitationCard({
  context, empresa = null, tab, onTabChange, invitations, saving, result, error,
  generatedOtp, loadingOtp, copiedKey, onCopy, onGenerateOtp, onCreate, onResend, onCancel
}) {
  const [form, setForm] = useState({ correoElectronico: '', nombre: '' });
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const codigo = context?.grupoGestionCodigo ?? '';
  const correo = form.correoElectronico.trim();
  const correoInvalido = correo.length > 0 && !INVITACION_CORREO_REGEX.test(correo);
  const creating = saving === 'crear';
  const canSend = Boolean(codigo) && INVITACION_CORREO_REGEX.test(correo) && !creating;

  async function submit(event) {
    event.preventDefault();
    if (!canSend) return;
    const ok = await onCreate({ correoElectronico: correo, nombre: form.nombre.trim() || null, empresaId: empresa?.empresaId ?? null });
    if (ok) setForm({ correoElectronico: '', nombre: '' });
  }

  async function confirmCancel(id) {
    const ok = await onCancel(id);
    if (ok) setConfirmCancelId(null);
  }

  const fallbackMessage = result && !result.envio?.enviado
    ? buildInvitationMessage({ codigo: result.grupoGestionCodigo, otp: result.otp, correo: result.invitacion?.correoElectronico, vence: result.invitacion?.fechaVencimiento })
    : '';
  const manualMessage = generatedOtp
    ? buildInvitationMessage({ codigo: generatedOtp.grupoGestionCodigo ?? codigo, otp: generatedOtp.otp, vence: generatedOtp.fechaVencimiento })
    : '';

  return (
    <section className="dashboard-card users-card invitation-card">
      <div className="card-heading">
        <div className="card-heading-icon"><KeyRound size={18} /></div>
        <div>
          <h2>Invitación segura</h2>
          <p>Invitá a una persona por correo o compartí el código manualmente.</p>
        </div>
      </div>

      {empresa && (
        <p className="invite-company-banner">
          <Building2 size={16} />
          <span>Invitando a <strong>{empresa.nombre}</strong>. Cambiá la empresa desde el selector de arriba.</span>
        </p>
      )}

      <div className="invite-tabs" role="tablist" aria-label="Forma de invitar">
        <button type="button" role="tab" aria-selected={tab === 'correo'} className={tab === 'correo' ? 'active' : ''} onClick={() => onTabChange('correo')}>
          <Mail size={16} /> Por correo
        </button>
        <button type="button" role="tab" aria-selected={tab === 'manual'} className={tab === 'manual' ? 'active' : ''} onClick={() => onTabChange('manual')}>
          <Copy size={16} /> Compartir manualmente
        </button>
      </div>

      {tab === 'correo' ? (
        <div className="invite-panel" role="tabpanel">
          <form className="invite-form" onSubmit={submit}>
            <label className="invite-field">
              <span>Correo electrónico *</span>
              <input
                id="invitacion-correo"
                type="email"
                value={form.correoElectronico}
                onChange={(event) => setForm((current) => ({ ...current, correoElectronico: event.target.value }))}
                placeholder="juan.perez@correo.com"
                aria-invalid={correoInvalido}
                autoComplete="off"
              />
            </label>
            <label className="invite-field">
              <span>Nombre (opcional)</span>
              <input
                type="text"
                value={form.nombre}
                onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))}
                placeholder="Para saludarlo en el correo"
                maxLength={150}
              />
            </label>
            <p className={`invite-help ${correoInvalido ? 'invite-help-error' : ''}`}>
              {correoInvalido
                ? 'Revisá el formato del correo (ej: nombre@empresa.com).'
                : 'Le llega el código del grupo y una OTP que solo sirve con este correo. Vence en 7 días.'}
            </p>
            <button className="green-button invite-send-button" type="submit" disabled={!canSend}>
              {creating ? <LoaderCircle className="spin-icon" size={18} /> : <Send size={18} />}
              <span>{creating ? 'Enviando...' : 'Enviar invitación'}</span>
            </button>
          </form>

          {error && <p className="auth-error">{error}</p>}

          {result?.envio && (
            <div className={`invite-result ${result.envio.enviado ? 'invite-result-ok' : 'invite-result-error'}`} role="status">
              <p>
                {result.envio.enviado ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <span>{result.envio.mensaje}</span>
              </p>
              {!result.envio.enviado && (
                <>
                  <small>Compartí este mensaje por otro medio. La OTP no se vuelve a mostrar.</small>
                  <ShareInvitationActions message={fallbackMessage} copiedKey={copiedKey} onCopy={onCopy} />
                </>
              )}
            </div>
          )}

          <div className="invite-list-heading">
            <strong>Invitaciones enviadas</strong>
            <span>{invitations.length}</span>
          </div>

          {invitations.length === 0 ? (
            <p className="invite-empty">Todavía no hay invitaciones pendientes.</p>
          ) : (
            <ul className="invite-list">
              {invitations.map((inv) => {
                const vencida = inv.estado === 'Vencida';
                const chip = vencida ? 'vencida' : inv.estadoEnvio === 'Error' ? 'error' : inv.estadoEnvio === 'Enviado' ? 'ok' : 'pendiente';
                const chipText = vencida ? 'Vencida' : inv.estadoEnvio === 'Error' ? 'No se pudo enviar' : inv.estadoEnvio === 'Enviado' ? 'Enviada' : 'Sin enviar';
                const vence = new Date(inv.fechaVencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                const resending = saving === `reenviar-${inv.id}`;
                const cancelling = saving === `cancelar-${inv.id}`;

                return (
                  <li key={inv.id}>
                    <div className="invite-item-main">
                      <strong>{inv.nombre || inv.correoElectronico}</strong>
                      {inv.nombre && <small>{inv.correoElectronico}</small>}
                      {!inv.empresaId && <small>Sin empresa asignada (se elige al aprobar)</small>}
                      <small>
                        {vencida ? `Venció el ${vence}` : `Vence el ${vence}`}
                        {inv.cantidadEnvios > 1 ? ` · ${inv.cantidadEnvios} envíos` : ''}
                      </small>
                    </div>
                    <span className={`invite-chip invite-chip-${chip}`}>{chipText}</span>
                    {confirmCancelId === inv.id ? (
                      <div className="invite-item-actions">
                        <span className="invite-confirm-text">¿Cancelar?</span>
                        <button type="button" className="invite-action invite-action-danger" onClick={() => confirmCancel(inv.id)} disabled={cancelling}>
                          {cancelling ? <LoaderCircle className="spin-icon" size={14} /> : null} Sí
                        </button>
                        <button type="button" className="invite-action" onClick={() => setConfirmCancelId(null)} disabled={cancelling}>No</button>
                      </div>
                    ) : (
                      <div className="invite-item-actions">
                        <button type="button" className="invite-action" onClick={() => onResend(inv.id)} disabled={Boolean(saving)}>
                          {resending ? <LoaderCircle className="spin-icon" size={14} /> : <RotateCcw size={14} />}
                          {resending ? 'Enviando...' : 'Reenviar'}
                        </button>
                        <button type="button" className="invite-action invite-action-danger" onClick={() => setConfirmCancelId(inv.id)} disabled={Boolean(saving)}>
                          <XCircle size={14} /> Cancelar
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="invite-panel" role="tabpanel">
          <div className="otp-preview-card">
            <div className="otp-value-row">
              <div>
                <span>Código de grupo</span>
                <strong>{codigo || 'Se carga al completar registro'}</strong>
              </div>
              <button className={`otp-copy-button ${copiedKey === codigo ? 'copy-button-copied' : ''}`} type="button" onClick={() => onCopy(codigo)} disabled={!codigo} aria-label="Copiar código de grupo">
                {copiedKey === codigo ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              </button>
            </div>

            {generatedOtp ? (
              <div className="otp-generated-box">
                <OtpSecretCredential value={generatedOtp.otp} copied={copiedKey === generatedOtp.otp} onCopy={onCopy} />
                <p>
                  Vence el {new Date(generatedOtp.fechaVencimiento).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}.
                  Es de un solo uso y no está asociada a ningún correo: compartila solo con la persona que querés sumar.
                </p>
                <ShareInvitationActions message={manualMessage} copiedKey={copiedKey} onCopy={onCopy} />
              </div>
            ) : (
              <p>Generá una OTP para compartirla por WhatsApp u otro medio. Vence a los 7 días y solo puede usarse una vez.</p>
            )}
          </div>
          <button className="invite-generate-button" type="button" onClick={onGenerateOtp} disabled={loadingOtp || !codigo}>
            {loadingOtp ? <LoaderCircle className="spin-icon" size={16} /> : <KeyRound size={16} />}
            {loadingOtp ? 'Generando...' : generatedOtp ? 'Generar otra OTP' : 'Generar OTP'}
          </button>
        </div>
      )}
    </section>
  );
}

function OtpSecretCredential({ value, copied, onCopy }) {
  const [isVisible, setIsVisible] = useState(false);
  const displayValue = isVisible ? value : '••••••••••••';

  function revealCredential() {
    setIsVisible(true);
  }

  function hideCredential() {
    setIsVisible(false);
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
    <div className={`otp-secret-credential ${isVisible ? 'otp-secret-credential-visible' : ''} ${copied ? 'otp-secret-credential-copied' : ''}`}>
      <span>Clave OTP</span>
      <div className="otp-secret-control">
        <strong>{displayValue}</strong>
        <div className="otp-secret-actions">
          <button
            type="button"
            onPointerDown={revealCredential}
            onPointerUp={hideCredential}
            onPointerLeave={hideCredential}
            onPointerCancel={hideCredential}
            onKeyDown={handleRevealKeyDown}
            onKeyUp={handleRevealKeyUp}
            onBlur={hideCredential}
            aria-label="Mantener presionado para ver la clave OTP"
            aria-pressed={isVisible}
          >
            {isVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <button type="button" className={copied ? 'copy-button-copied' : ''} onClick={() => onCopy(value)} aria-label="Copiar clave OTP">
            {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
          </button>
        </div>
      </div>
      {copied && <em>Copiado</em>}
    </div>
  );
}

export { ManagerUsersPage, MyAccessUsersPage };
