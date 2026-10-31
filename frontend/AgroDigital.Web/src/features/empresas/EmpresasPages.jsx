import { useState } from 'react';
import { Building2, CheckCircle2, Edit, EyeOff, Home, LoaderCircle, PlusCircle, ShieldCheck, Trash2, User, Users } from 'lucide-react';
import { formatRole } from '../../shared/utils/roles.js';
import SummaryCard from '../../shared/components/SummaryCard.jsx';

function MyCompaniesPage({ acceso, error }) {
  const grupos = acceso?.grupos ?? [];
  const empresas = grupos.flatMap((grupo) => grupo.empresas.map((empresa) => ({ ...empresa, grupo })));
  const principal = empresas.find((empresa) => empresa.esPrincipal) ?? empresas[0];

  return (
    <section className="content-panel manager-users-panel">
      <div className="page-heading">
        <div>
          <h1>Empresas</h1>
          <p>Consultá las empresas en las que tenés acceso. Las empresas las administra el Gerente de tu grupo.</p>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}

      <div className="summary-grid users-summary-grid">
        <SummaryCard icon={<Building2 size={30} />} label="Empresas asignadas" value={empresas.length} helper="Empresas en las que tenés acceso" />
        <SummaryCard icon={<Building2 size={30} />} label="Empresa principal" value={principal?.nombre ?? 'Sin empresa'} helper={principal ? `Tu rol: ${formatRole(principal.rol)}` : 'Todavía no tenés empresas asignadas'} />
        <SummaryCard icon={<Users size={30} />} label="Grupo de gestión" value={grupos[0]?.codigo ?? 'Sin grupo'} helper={grupos[0] ? `Gerente: ${grupos[0].gerente}` : 'Todavía no pertenecés a un grupo'} />
      </div>

      <section className="dashboard-card users-card my-access-card">
        <div className="card-heading">
          <div className="card-heading-icon"><Building2 size={18} /></div>
          <div>
            <h2>Tus empresas</h2>
            <p>Solo consulta: para sumar, editar o deshabilitar empresas, contactá al Gerente.</p>
          </div>
          <span className="points-count">{empresas.length} {empresas.length === 1 ? 'empresa' : 'empresas'}</span>
        </div>

        {empresas.length === 0 ? (
          <div className="users-inline-empty">
            <Building2 size={42} />
            <strong>Todavía no tenés empresas asignadas.</strong>
            <span>Cuando el Gerente te dé acceso a una empresa, vas a verla acá.</span>
          </div>
        ) : (
          <div className="my-companies-list">
            {empresas.map((empresa) => (
              <article className="my-company-row" key={empresa.empresaId}>
                <span className="my-company-icon"><Building2 size={20} /></span>
                <div className="my-company-main">
                  <strong>{empresa.nombre}</strong>
                  <small>Grupo {empresa.grupo.codigo} · Gerente: {empresa.grupo.gerente}</small>
                </div>
                <div className="my-company-tags">
                  <em className="role-chip">{formatRole(empresa.rol)}</em>
                  {empresa.esPrincipal && <small className="my-access-principal">Principal</small>}
                  <em className="company-active">Activa</em>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

/**
 * Usuarios para quien NO es Gerente: solo consulta.
 *  - Todos ven "Mi acceso": grupo, gerente, empresas y su rol en cada una.
 *  - El Encargado ademas ve el equipo de las empresas donde es Encargado, sin acciones.
 */

function ManagerTeamsPage({ context, error, status, savingAction, teamUsers = {}, loadingTeamUsers, onCreateTeam, onUpdateTeam, onToggleTeamStatus, onSetPrincipalTeam, onLoadTeamUsers }) {
  const empresas = context?.empresas ?? [];
  const [teamName, setTeamName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const activeTeams = empresas.filter((empresa) => empresa.activo);
  const disabledTeams = empresas.filter((empresa) => !empresa.activo);
  const principal = empresas.find((empresa) => empresa.esPrincipal);

  function submitCreate(event) {
    event.preventDefault();
    const nombre = teamName.trim();
    if (!nombre) return;
    onCreateTeam(nombre);
    setTeamName('');
  }

  function startEdit(empresa) {
    setEditingId(empresa.empresaId);
    setEditingName(empresa.nombre);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName('');
  }

  function submitEdit(event) {
    event.preventDefault();
    const nombre = editingName.trim();
    if (!editingId || !nombre) return;
    onUpdateTeam(editingId, nombre);
    cancelEdit();
  }

  function toggleTeamUsers(empresaId) {
    setExpandedTeamId((current) => {
      const next = current === empresaId ? null : empresaId;
      if (next && !teamUsers[next]) onLoadTeamUsers(next);
      return next;
    });
  }

  return (
    <section className="content-panel manager-users-panel manager-teams-panel">
      <div className="page-heading">
        <div>
          <h1>Empresas</h1>
          <p>Administrá las empresas del grupo de gestión sin perder trazabilidad histórica.</p>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {status && <p className="auth-success">{status}</p>}

      <div className="summary-grid users-summary-grid">
        <SummaryCard icon={<Building2 size={30} />} label="Empresas registradas" value={empresas.length} helper="Total dentro del grupo de gestión" />
        <SummaryCard icon={<CheckCircle2 size={30} />} label="Empresas activas" value={activeTeams.length} helper="Disponibles para operar y asignar usuarios" />
        <SummaryCard icon={<Building2 size={30} />} label="Empresa principal" value={principal?.nombre ?? 'Sin definir'} helper="Contexto operativo inicial del gerente" />
      </div>

      <div className="manager-teams-grid">
        <section className="dashboard-card users-card team-form-card">
          <div className="card-heading">
            <div className="card-heading-icon"><PlusCircle size={18} /></div>
            <div>
              <h2>Crear empresa</h2>
              <p>Agregá una empresa para separar lotes, campañas y usuarios.</p>
            </div>
          </div>
          <form className="team-create-form" onSubmit={submitCreate}>
            <label className="admin-field">
              <span>Nombre de la empresa *</span>
              <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Ej: Agro Los Cóndores" />
            </label>
            <button className="green-button wide" type="submit" disabled={savingAction === 'create' || !teamName.trim()}>
              {savingAction === 'create' ? <LoaderCircle className="spin-icon" size={18} /> : <PlusCircle size={18} />}
              <span>{savingAction === 'create' ? 'Creando...' : 'Agregar empresa'}</span>
            </button>
          </form>
        </section>

        <section className="dashboard-card users-card team-guidance-card">
          <div className="card-heading">
            <div className="card-heading-icon"><ShieldCheck size={18} /></div>
            <div>
              <h2>Baja lógica</h2>
              <p>Deshabilitar conserva el historial y evita romper trazabilidad de operaciones ya registradas.</p>
            </div>
          </div>
          <div className="team-guidance-list">
            <span><CheckCircle2 size={18} /> La empresa activa puede recibir lotes y usuarios.</span>
            <span><EyeOff size={18} /> La empresa deshabilitada queda fuera de uso operativo.</span>
            <span><Home size={18} /> El principal define el contexto base del gerente.</span>
          </div>
        </section>
      </div>

      <section className="dashboard-card users-card teams-list-card">
        <div className="card-heading">
          <div className="card-heading-icon"><Building2 size={18} /></div>
          <div>
            <h2>Listado de empresas</h2>
            <p>Editá nombres, cambiá la empresa principal o deshabilitá sin borrar registros.</p>
          </div>
          <span className="points-count">{disabledTeams.length} deshabilitados</span>
        </div>

        {empresas.length === 0 ? (
          <div className="pending-users-empty-row teams-empty-row">
            <Building2 size={52} strokeWidth={1.8} />
            <strong>Aún no hay empresas cargadas</strong>
            <span>Creá la primera empresa para empezar a separar la operación.</span>
          </div>
        ) : (
          <div className="teams-table-shell">
            {empresas.map((empresa) => {
              const isEditing = editingId === empresa.empresaId;
              const toggleAction = empresa.activo ? 'deshabilitar' : 'habilitar';
              return (
                <article className={'team-row ' + (!empresa.activo ? 'team-row-disabled' : '')} key={empresa.empresaId}>
                  <span className="team-row-icon"><Building2 size={22} /></span>
                  <div className="team-row-main">
                    {isEditing ? (
                      <form className="team-edit-form" onSubmit={submitEdit}>
                        <input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus />
                        <button type="submit" disabled={savingAction === 'edit-' + empresa.empresaId || !editingName.trim()}>
                          {savingAction === 'edit-' + empresa.empresaId ? <LoaderCircle className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                          Guardar
                        </button>
                        <button type="button" onClick={cancelEdit}>Cancelar</button>
                      </form>
                    ) : (
                      <>
                        <strong>{empresa.nombre}</strong>
                        <small>{empresa.esPrincipal ? 'Empresa principal del grupo' : 'Empresa asociada'}</small>
                      </>
                    )}
                  </div>
                  <div className="team-row-badges">
                    <em className={empresa.activo ? 'company-active' : 'company-disabled'}>{empresa.activo ? 'Activo' : 'Deshabilitado'}</em>
                    {empresa.esPrincipal && <em className="team-main-badge">Principal</em>}
                  </div>
                  <div className="team-row-actions">
                    {!isEditing && (
                      <button className="team-action-button" type="button" onClick={() => startEdit(empresa)}>
                        <Edit size={16} />
                        Editar
                      </button>
                    )}
                    <button className="team-action-button" type="button" onClick={() => toggleTeamUsers(empresa.empresaId)}>
                      {loadingTeamUsers === String(empresa.empresaId) ? <LoaderCircle className="spin-icon" size={16} /> : <Users size={16} />}
                      {expandedTeamId === empresa.empresaId ? 'Ocultar usuarios' : 'Ver usuarios'}
                    </button>
                    {!empresa.esPrincipal && empresa.activo && (
                      <button className="team-action-button" type="button" onClick={() => onSetPrincipalTeam(empresa.empresaId)} disabled={savingAction === 'principal-' + empresa.empresaId}>
                        {savingAction === 'principal-' + empresa.empresaId ? <LoaderCircle className="spin-icon" size={16} /> : <Home size={16} />}
                        Principal
                      </button>
                    )}
                    <button className={'team-action-button ' + (empresa.activo ? 'team-danger-action' : 'team-enable-action')} type="button" onClick={() => onToggleTeamStatus(empresa)} disabled={savingAction === toggleAction + '-' + empresa.empresaId}>
                      {savingAction === toggleAction + '-' + empresa.empresaId ? <LoaderCircle className="spin-icon" size={16} /> : empresa.activo ? <Trash2 size={16} /> : <CheckCircle2 size={16} />}
                      {empresa.activo ? 'Deshabilitar' : 'Habilitar'}
                    </button>
                  </div>
                  {expandedTeamId === empresa.empresaId && (
                    <TeamUsersPanel users={teamUsers[empresa.empresaId] ?? []} loading={loadingTeamUsers === String(empresa.empresaId)} />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function TeamUsersPanel({ users, loading }) {
  if (loading) {
    return (
      <div className="team-users-panel">
        <span className="team-users-loading"><LoaderCircle className="spin-icon" size={18} /> Cargando usuarios de la empresa...</span>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="team-users-panel team-users-panel-empty">
        <Users size={34} />
        <strong>Esta empresa todavía no tiene usuarios vinculados</strong>
      </div>
    );
  }

  return (
    <div className="team-users-panel">
      {users.map((user) => {
        const teamRole = user.empresas?.[0]?.rol ?? user.rolGeneral;
        const accessActive = user.activo && (user.empresas?.[0]?.activo ?? true);
        const fullName = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.correoElectronico;

        return (
          <article className="team-user-item" key={user.usuarioId}>
            <span className="team-user-avatar"><User size={19} /></span>
            <div>
              <strong>{fullName}</strong>
              <small>{user.correoElectronico}</small>
            </div>
            <em className="role-chip">{formatRole(teamRole)}</em>
            <span className={accessActive ? 'company-active' : 'company-disabled'}>{accessActive ? 'Habilitado' : 'Deshabilitado'}</span>
          </article>
        );
      })}
    </div>
  );
}

export { MyCompaniesPage, ManagerTeamsPage };
