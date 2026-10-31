import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import agroDigitalCompactLogo from './assets/agrodigital-compact-logo.png';
import agroDigitalLogo from './assets/agrodigital-logo.png';
import sidebarLandscapeCollapsed from './assets/sidebar-landscape-collapsed.png';
import sidebarLandscapeExpanded from './assets/sidebar-landscape-expanded.png';
import Silos from './features/silos/Silos';
import Campanias from './features/campanias/Campanias';
import Siembras from './features/siembras/Siembras';
import Cosechas from './features/cosechas/Cosechas';
import Almacenamiento from './features/almacenamiento/Almacenamiento';
import DisableLoteModal from './shared/components/DisableLoteModal';
import Distribucion from './features/distribucion/Distribucion';
import Estadisticas from './features/estadisticas/Estadisticas';
import ReporteriaIA from './features/reporteria-ia/ReporteriaIA';
import AgroBot from './features/agrobot/AgroBot';
import Inicio from './features/inicio/Inicio';
import { FloatingWidgets, ParentFiltersBar, ParentSearchSelect } from './shared/components/AppControls.jsx';
import useWorkspaceContext from './shared/hooks/useWorkspaceContext.js';
import useProfile from './features/perfil/useProfile.js';
import useAdminAccounts from './features/admin/useAdminAccounts.js';
import { ManagerUsersPage, MyAccessUsersPage } from './features/usuarios/UsuariosPages.jsx';
import { MyCompaniesPage, ManagerTeamsPage } from './features/empresas/EmpresasPages.jsx';
import AdminPanel from './features/admin/AdminPanel.jsx';
import { formatPersonName } from './shared/utils/personName.js';
import { UserProfileMenu, ProfilePage } from './features/perfil/PerfilPages.jsx';
import { LoginPage, JoinTeamPage, ManagerWelcomePage, ManagerRegistrationPage } from './features/acceso/AccesoPages.jsx';
import { LoteCreate, LoteDetailEdit } from './features/lotes/LoteEditor.jsx';
import { ARGENTINA_ZONES } from './features/lotes/loteCatalogos.js';
import LotesList from './features/lotes/LotesList.jsx';
import { normalizeSearchText } from './shared/utils/normalizeSearchText.js';
import { EnableLoteWithSiembrasConfirmation, EnableLoteConfirmation, EnableLoteWithActiveCampaignConfirmation, LoteOverlapConflictModal, ActiveCampaignLoteModal } from './features/lotes/LoteModals.jsx';
import { emptyForm, polygonAreaSquareMeters, formFromLote, lotePayloadFromForm, hasLoteFormChanges } from './features/lotes/loteUtils.js';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Compass,
  Home,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Sparkles,
  Sprout,
  Tractor,
  Users,
  Warehouse,
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const GEOREF_API_BASE_URL = 'https://apis.datos.gob.ar/georef/api';
function formatInitialUppercase(value) {
  if (!value) return value;
  return value.slice(0, 1).toLocaleUpperCase('es-AR') + value.slice(1);
}

function handleTextCaseCapture(event) {
  const target = event.target;
  const isTextInput = target instanceof HTMLInputElement && target.type === 'text';
  const isTextArea = target instanceof HTMLTextAreaElement;

  if ((!isTextInput && !isTextArea) || target.dataset.textCase === 'preserve') return;

  const formatted = target.dataset.textCase === 'upper'
    ? target.value.toLocaleUpperCase('es-AR')
    : formatInitialUppercase(target.value);

  if (formatted === target.value) return;

  const selectionStart = target.selectionStart;
  const selectionEnd = target.selectionEnd;
  target.value = formatted;

  if (selectionStart !== null && selectionEnd !== null) {
    target.setSelectionRange(selectionStart, selectionEnd);
  }
}

function App() {
  const [session, setSession] = useState(null);
  const {
    adminAccounts, lastGeneratedAccount, adminError, adminEnvio, adminResendingId,
    loadAdminAccounts, handleCreateAdminAccount, handleResendAdminInvitation,
    handleRegenerateAdminPassword, handleUpdateAdminResponsible,
    handleToggleAdminAccountStatus, resetAdminAccounts
  } = useAdminAccounts({ session, apiBaseUrl: API_BASE_URL });
  const [loginError, setLoginError] = useState('');
  const [authView, setAuthView] = useState('login');
  const [joinRequestStatus, setJoinRequestStatus] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [activeModule, setActiveModule] = useState('inicio');
  const [managerContext, setManagerContext] = useState(null);
  // Empresas del usuario cuando no es Gerente (el Gerente las toma de managerContext).
  const [misEmpresas, setMisEmpresas] = useState([]);
  const [managerContextError, setManagerContextError] = useState('');
  const [managerRequests, setManagerRequests] = useState([]);
  const [managerRequestsError, setManagerRequestsError] = useState('');
  const [managerUsers, setManagerUsers] = useState([]);
  const [managerUsersError, setManagerUsersError] = useState('');
  const [managerUserSaving, setManagerUserSaving] = useState('');
  const [managerTeamUsers, setManagerTeamUsers] = useState({});
  const [managerTeamUsersLoading, setManagerTeamUsersLoading] = useState('');
  const [managerActionStatus, setManagerActionStatus] = useState('');
  const [managerTeamStatus, setManagerTeamStatus] = useState('');
  const [managerTeamError, setManagerTeamError] = useState('');
  const [managerTeamSaving, setManagerTeamSaving] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState(null);
  const [otpError, setOtpError] = useState('');
  const [managerInvitations, setManagerInvitations] = useState([]);
  const [invitationSaving, setInvitationSaving] = useState('');
  const [invitationResult, setInvitationResult] = useState(null);
  const [invitationError, setInvitationError] = useState('');
  const [joinPrefill, setJoinPrefill] = useState(null);
  const [miAcceso, setMiAcceso] = useState(null);
  const [equipoUsuarios, setEquipoUsuarios] = useState([]);
  const [equipoError, setEquipoError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [view, setView] = useState('list');
  const [lotes, setLotes] = useState([]);
  const [parentCampanias, setParentCampanias] = useState([]);
  const [selectedParentEmpresaId, setSelectedParentEmpresaId] = useState(() => localStorage.getItem('agrodigital.parentEmpresaId') || '');
  const [selectedParentCampaniaId, setSelectedParentCampaniaId] = useState(() => localStorage.getItem('agrodigital.parentCampaniaId') || '');
  const [selectedParentCicloEstacional, setSelectedParentCicloEstacional] = useState('Verano');
  const [selectedLote, setSelectedLote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loteStatusSaving, setLoteStatusSaving] = useState('');
  const [lotePendingDisable, setLotePendingDisable] = useState(null);
  const [loteNewDisableReason, setLoteNewDisableReason] = useState(false);
  const [lotePendingEnable, setLotePendingEnable] = useState(null);
  const [loteActiveCampaignPrompt, setLoteActiveCampaignPrompt] = useState(null);
  const [loteOverlapConflict, setLoteOverlapConflict] = useState('');
  const [campaignEditRequestId, setCampaignEditRequestId] = useState('');
  const [siembraRegistrationRequest, setSiembraRegistrationRequest] = useState(null);
  const [pendingCampaignReactivation, setPendingCampaignReactivation] = useState(null);
  const [pendingNewCampaignLot, setPendingNewCampaignLot] = useState(null);
  const [status, setStatus] = useState('Conectando...');
  const [form, setForm] = useState(emptyForm);
  const [loteFieldErrors, setLoteFieldErrors] = useState({});
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [agroBotOpen, setAgroBotOpen] = useState(false);
  const [reporteriaPromptPendiente, setReporteriaPromptPendiente] = useState(null);
  const [textSize, setTextSize] = useState('small');
  const [availableZones, setAvailableZones] = useState(ARGENTINA_ZONES[emptyForm.provincia] ?? []);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zoneMapTarget, setZoneMapTarget] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showManagerWelcome, setShowManagerWelcome] = useState(true);
  const {
    userProfile, profileError, profileStatus, profileSaving,
    profilePasswordSaving, profilePasswordError, setUserProfile,
    setProfilePasswordError, loadUserProfile, handleUpdateProfile,
    handleChangeProfilePassword, resetProfile
  } = useProfile({ session, setSession, authHeaders, apiBaseUrl: API_BASE_URL });
  const userMenuRef = useRef(null);

  const areaM2 = useMemo(() => polygonAreaSquareMeters(form.coordenadas), [form.coordenadas]);
  const areaHa = areaM2 / 10000;
  const {
    empresasDisponibles, rolEmpresaActual, permisosRol, selectedParentEmpresa,
    campaniasDisponibles, selectedParentCampania, selectedParentCampaniaCombinaciones,
    empresaDestinoNuevoLoteId, activeCampaignsByEmpresa, activeCampaignForNewLote,
    parentFilteredLotes
  } = useWorkspaceContext({
    session, managerContext, misEmpresas, selectedParentEmpresaId,
    parentCampanias, selectedParentCampaniaId, lotes
  });
  function authHeaders(extraHeaders = {}) {
    return session?.token
      ? { ...extraHeaders, Authorization: `Bearer ${session.token}` }
      : extraHeaders;
  }

  function handleSidebarToggle() {
    setSidebarCollapsed((current) => !current);
  }


  async function loadLotes() {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/lotes`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = await response.json();
      setLotes(data);
      setStatus('API conectada');
    } catch (error) {
      setStatus(`Sin conexion: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadParentCampanias() {
    if (!session?.token || session.type !== 'manager-demo') {
      setParentCampanias([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/campanias`, { headers: authHeaders() });
      if (!response.ok) throw new Error(`API ${response.status}`);
      setParentCampanias(await response.json());
    } catch {
      setParentCampanias([]);
    }
  }


  // Usuarios para roles que no son Gerente: su propio acceso y, si es Encargado, el equipo (solo consulta).
  async function loadMiAcceso() {
    if (!session?.token || session.role === 'Gerente' || session.role === 'Admin') {
      setMiAcceso(null);
      setEquipoUsuarios([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/equipo/mi-acceso`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await response.text());
      const acceso = await response.json();
      setMiAcceso(acceso);
      setEquipoError('');

      if (acceso.puedeVerEquipo) {
        const equipo = await fetch(`${API_BASE_URL}/api/equipo/usuarios`, { headers: authHeaders() });
        if (!equipo.ok) throw new Error(await equipo.text());
        setEquipoUsuarios(await equipo.json());
      } else {
        setEquipoUsuarios([]);
      }
    } catch (error) {
      setEquipoError(error.message.replace(/^"|"$/g, '') || 'No se pudo cargar tu acceso.');
    }
  }

  async function loadManagerInvitations() {
    if (!session?.token || session.role !== 'Gerente') {
      setManagerInvitations([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/invitaciones`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await response.text());
      setManagerInvitations(await response.json());
    } catch (error) {
      setManagerInvitations([]);
      setInvitationError(error.message.replace(/^"|"$/g, '') || 'No se pudieron cargar las invitaciones.');
    }
  }

  // Invitar por correo: crea la invitacion (OTP asociada al correo) y envia el mail.
  async function handleCreateInvitation(invitationForm) {
    if (!session?.token) return false;

    setInvitationSaving('crear');
    setInvitationError('');
    setInvitationResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/invitaciones`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(invitationForm)
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setInvitationResult(data);
      await loadManagerInvitations();
      return true;
    } catch (error) {
      setInvitationError(error.message.replace(/^"|"$/g, '') || 'No se pudo enviar la invitación.');
      return false;
    } finally {
      setInvitationSaving('');
    }
  }

  async function handleResendInvitation(invitationId) {
    if (!session?.token) return;

    setInvitationSaving(`reenviar-${invitationId}`);
    setInvitationError('');
    setInvitationResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/invitaciones/${invitationId}/reenviar`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      setInvitationResult(await response.json());
      await loadManagerInvitations();
    } catch (error) {
      setInvitationError(error.message.replace(/^"|"$/g, '') || 'No se pudo reenviar la invitación.');
    } finally {
      setInvitationSaving('');
    }
  }

  async function handleCancelInvitation(invitationId) {
    if (!session?.token) return false;

    setInvitationSaving(`cancelar-${invitationId}`);
    setInvitationError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/invitaciones/${invitationId}/cancelar`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      setInvitationResult((current) => (current?.invitacion?.id === invitationId ? null : current));
      await loadManagerInvitations();
      return true;
    } catch (error) {
      setInvitationError(error.message.replace(/^"|"$/g, '') || 'No se pudo cancelar la invitación.');
      return false;
    } finally {
      setInvitationSaving('');
    }
  }

  async function loadManagerRequests() {
    if (!session?.token || session.role !== 'Gerente') {
      setManagerRequests([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/solicitudes`, {
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setManagerRequests(data);
      setManagerRequestsError('');
    } catch (error) {
      setManagerRequests([]);
      setManagerRequestsError(error.message.replace(/^"|"$/g, '') || 'No se pudieron cargar las solicitudes.');
    }
  }

  async function loadManagerUsers() {
    if (!session?.token || session.role !== 'Gerente') {
      setManagerUsers([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/usuarios`, {
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setManagerUsers(data);
      setManagerUsersError('');
    } catch (error) {
      setManagerUsers([]);
      setManagerUsersError(error.message.replace(/^"|"$/g, '') || 'No se pudieron cargar los usuarios del grupo.');
    }
  }

  async function loadManagerTeamUsers(empresaId) {
    if (!session?.token || !empresaId) return;

    setManagerTeamUsersLoading(String(empresaId));
    setManagerTeamError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/empresas/${empresaId}/usuarios`, {
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setManagerTeamUsers((current) => ({ ...current, [empresaId]: data }));
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudieron cargar los usuarios de la empresa.');
    } finally {
      setManagerTeamUsersLoading('');
    }
  }

  // Encargado, empleados y Admin: sus empresas salen de UsuarioEmpresas.
  async function loadMisEmpresas() {
    if (!session?.token || session.role === 'Gerente') {
      setMisEmpresas([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/usuarios/mis-empresas`, {
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());
      setMisEmpresas(await response.json());
    } catch {
      setMisEmpresas([]);
    }
  }

  async function loadManagerContext() {
    if (!session?.token || session.role !== 'Gerente') {
      setManagerContext(null);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/contexto`, {
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setManagerContext(data);
      setManagerContextError('');
    } catch (error) {
      setManagerContext(null);
      setManagerUsers([]);
      setManagerContextError(error.message.replace(/^"|"$/g, '') || 'No se pudo cargar el contexto del gerente.');
    }
  }
  async function handleGenerateOtp() {
    if (!session?.token) return;

    setOtpLoading(true);
    setOtpError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/otp`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setGeneratedOtp(data);
      await loadManagerContext();
      await loadManagerRequests();
    } catch (error) {
      setOtpError(error.message.replace(/^"|"$/g, '') || 'No se pudo generar la OTP.');
    } finally {
      setOtpLoading(false);
    }
  }

  useEffect(() => {
    if (!session?.token || session.type === 'admin' || session.type === 'manager-onboarding') {
      setUserProfile(null);
      setProfileMenuOpen(false);
      return;
    }

    loadUserProfile();
  }, [session?.token, session?.type]);

  useEffect(() => {
    function closeProfileMenu(event) {
      if (!userMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    }

    function closeProfileMenuOnEscape(event) {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', closeProfileMenu);
    document.addEventListener('keydown', closeProfileMenuOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeProfileMenu);
      document.removeEventListener('keydown', closeProfileMenuOnEscape);
    };
  }, []);

  useEffect(() => {
    if (session?.type !== 'manager-demo') {
      setLoading(false);
      setParentCampanias([]);
      return;
    }

    loadLotes();
    loadParentCampanias();
  }, [session?.type, session?.token]);

  const previousActiveModule = useRef(activeModule);
  useEffect(() => {
    if (activeModule === 'lotes' && previousActiveModule.current !== 'lotes' && session?.type === 'manager-demo') {
      loadLotes();
    }
    previousActiveModule.current = activeModule;
  }, [activeModule, session?.type]);

  useEffect(() => {
    if (empresasDisponibles.length === 0) {
      setSelectedParentEmpresaId('');
      return;
    }

    const currentStillValid = empresasDisponibles.some((empresa) => String(empresa.empresaId) === String(selectedParentEmpresaId));
    if (currentStillValid) return;

    const principal = empresasDisponibles.find((empresa) => empresa.esPrincipal) ?? empresasDisponibles[0];
    setSelectedParentEmpresaId(String(principal.empresaId));
  }, [empresasDisponibles, selectedParentEmpresaId]);

  useEffect(() => {
    if (selectedParentEmpresaId) {
      localStorage.setItem('agrodigital.parentEmpresaId', selectedParentEmpresaId);
    } else {
      localStorage.removeItem('agrodigital.parentEmpresaId');
    }
  }, [selectedParentEmpresaId]);

  useEffect(() => {
    if (campaniasDisponibles.length === 0) {
      setSelectedParentCampaniaId('');
      return;
    }

    const currentStillValid = campaniasDisponibles.some((campania) => String(campania.campaniaId) === String(selectedParentCampaniaId));
    if (currentStillValid) return;

    const enCurso = campaniasDisponibles.find((campania) => campania.estado === 'En curso');
    const fallback = enCurso ?? campaniasDisponibles[0];
    setSelectedParentCampaniaId(String(fallback.campaniaId));
  }, [campaniasDisponibles, selectedParentCampaniaId]);

  useEffect(() => {
    if (selectedParentCampaniaId) {
      localStorage.setItem('agrodigital.parentCampaniaId', selectedParentCampaniaId);
    } else {
      localStorage.removeItem('agrodigital.parentCampaniaId');
    }
  }, [selectedParentCampaniaId]);

  useEffect(() => {
    document.body.classList.toggle('agro-sidebar-collapsed', sidebarCollapsed);
    return () => document.body.classList.remove('agro-sidebar-collapsed');
  }, [sidebarCollapsed]);

  useEffect(() => {
    const textScaleBySize = {
      small: '1',
      medium: '1.12',
      large: '1.24'
    };

    document.body.style.setProperty('--text-scale', textScaleBySize[textSize] ?? '1');
    document.body.dataset.textSize = textSize;
    return () => {
      document.body.style.removeProperty('--text-scale');
      delete document.body.dataset.textSize;
    };
  }, [textSize]);

  useEffect(() => {
    if (session?.type === 'manager-demo') {
      loadManagerContext();
      loadMisEmpresas();
      loadManagerRequests();
      loadManagerUsers();
      loadManagerInvitations();
      loadMiAcceso();
    }
  }, [session?.type, session?.token, session?.role]);
  useEffect(() => {
    if (session?.type === 'admin') {
      loadAdminAccounts(session.token);
    }
  }, [session?.type, session?.token]);

  useEffect(() => {
    let ignore = false;

    async function loadZonesByProvince() {
      if (!form.provincia) {
        setAvailableZones([]);
        return;
      }

      setZonesLoading(true);

      try {
        const params = new URLSearchParams({
          provincia: form.provincia,
          campos: 'nombre',
          max: '5000',
          orden: 'nombre'
        });
        const response = await fetch(`${GEOREF_API_BASE_URL}/localidades?${params.toString()}`);
        if (!response.ok) throw new Error(`Georef ${response.status}`);

        const data = await response.json();
        const names = [...new Set((data.localidades ?? []).map((zone) => zone.nombre).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b, 'es')
        );

        if (names.length === 0) throw new Error('Sin localidades');
        if (ignore) return;

        setAvailableZones(names);
        setForm((current) => {
          if (current.provincia !== form.provincia || names.includes(current.ciudad)) {
            return current;
          }

          return { ...current, ciudad: names[0] };
        });
      } catch {
        const fallbackZones = ARGENTINA_ZONES[form.provincia] ?? [];
        if (ignore) return;

        setAvailableZones(fallbackZones);
        setForm((current) => {
          if (current.provincia !== form.provincia || fallbackZones.includes(current.ciudad)) {
            return current;
          }

          return { ...current, ciudad: fallbackZones[0] ?? '' };
        });
      } finally {
        if (!ignore) {
          setZonesLoading(false);
        }
      }
    }

    loadZonesByProvince();

    return () => {
      ignore = true;
    };
  }, [form.provincia]);

  useEffect(() => {
    let ignore = false;

    async function loadZoneMapTarget() {
      if (!form.provincia || !form.ciudad) {
        setZoneMapTarget(null);
        return;
      }

      try {
        const params = new URLSearchParams({
          provincia: form.provincia,
          nombre: form.ciudad,
          campos: 'nombre,centroide',
          max: '10'
        });
        const response = await fetch(`${GEOREF_API_BASE_URL}/localidades?${params.toString()}`);
        if (!response.ok) throw new Error(`Georef ${response.status}`);

        const data = await response.json();
        const locality = (data.localidades ?? []).find((item) =>
          normalizeSearchText(item.nombre ?? '') === normalizeSearchText(form.ciudad)
        ) ?? data.localidades?.[0];
        const latitude = Number(locality?.centroide?.lat);
        const longitude = Number(locality?.centroide?.lon);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error('La localidad no tiene centroide');
        }

        if (!ignore) {
          setZoneMapTarget({
            latitude,
            longitude,
            label: `${form.ciudad}, ${form.provincia}`
          });
        }
      } catch {
        if (!ignore) setZoneMapTarget(null);
      }
    }

    loadZoneMapTarget();

    return () => {
      ignore = true;
    };
  }, [form.ciudad, form.provincia]);

  function updateField(field, value) {
    setLoteFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });

    setForm((current) => {
      if (field === 'provincia') {
        return { ...current, provincia: value, ciudad: '' };
      }
      if (field === 'nombre') {
        return { ...current, nombre: formatPersonName(value) };
      }

      return { ...current, [field]: value };
    });
  }

  const setCoordinates = useCallback((coordenadas, cerrado = false) => {
    setLoteFieldErrors((current) => {
      if (!current.coordenadas) return current;
      const next = { ...current };
      delete next.coordenadas;
      return next;
    });

    setForm((current) => ({
      ...current,
      coordenadas,
      cerrado
    }));
  }, []);

  function goToInicio() {
    if (pendingNewCampaignLot && activeModule === 'campanias') {
      setStatus('Asociá el lote nuevo a la campaña o deshabilitalo antes de salir.');
      return;
    }
    setActiveModule('inicio');
    setView('list');
    setSelectedLote(null);
    setIsMapExpanded(false);
    setProfileMenuOpen(false);
  }

  function goToList() {
    if (pendingNewCampaignLot && activeModule === 'campanias') {
      setStatus('Asociá el lote nuevo a la campaña o deshabilitalo antes de salir.');
      return;
    }
    setPendingCampaignReactivation(null);
    setActiveModule('lotes');
    setView('list');
    setSelectedLote(null);
    setIsMapExpanded(false);
    setLoteFieldErrors({});
  }

  function startCreate() {
    setActiveModule('lotes');
    setForm(emptyForm);
    setSelectedLote(null);
    setLoteFieldErrors({});
    setView('create');
  }

  function openLote(lote, nextView) {
    setActiveModule('lotes');
    setSelectedLote(lote);
    setForm(formFromLote(lote));
    setLoteFieldErrors({});
    setView(nextView);
  }

  function validarFormularioLote() {
    const errores = {};

    if (!form.nombre.trim()) errores.nombre = 'Ingresa el nombre del lote.';
    if (!form.pais.trim()) errores.pais = 'Selecciona el pais.';
    if (!form.provincia.trim()) errores.provincia = 'Selecciona la provincia.';
    if (!form.ciudad.trim()) errores.ciudad = 'Selecciona la zona.';
    if (!form.condicion.trim()) errores.condicion = 'Selecciona la condicion del lote.';
    if (!form.cultivoAnterior.trim()) errores.cultivoAnterior = 'Selecciona el cultivo anterior.';
    if (!form.cultivoAnteriorCampania.trim()) errores.cultivoAnteriorCampania = 'Selecciona la campaña del cultivo anterior.';

    if (form.coordenadas.length < 3) {
      errores.coordenadas = 'Marca al menos tres puntos para definir el lote.';
    } else if (!form.cerrado) {
      errores.coordenadas = 'Cerra el poligono del lote antes de registrar.';
    } else if (!Number.isFinite(Number(areaHa)) || !Number.isFinite(Number(areaM2)) || Number(areaHa) <= 0 || Number(areaM2) <= 0) {
      errores.coordenadas = 'El poligono debe tener una superficie mayor a cero.';
    }

    setLoteFieldErrors(errores);
    return Object.keys(errores).length === 0;
  }

  async function validarRestriccionesRemotasLote(excluirLoteId = null) {
    const query = excluirLoteId ? `?excluirLoteId=${excluirLoteId}` : '';

    try {
      const response = await fetch(`${API_BASE_URL}/api/lotes/validar-registro${query}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(lotePayloadFromForm(form, areaHa, areaM2, excluirLoteId ? selectedLote?.empresaId : empresaDestinoNuevoLoteId))
      });

      if (response.ok) return true;

      const message = (await response.text()).replace(/^"|"$/g, '');
      if (message.toLowerCase().includes('se superpone')) {
        setLoteOverlapConflict(message);
      } else if (message.toLowerCase().includes('ya existe') && message.toLowerCase().includes('lote')) {
        setLoteFieldErrors({ nombre: message });
      } else {
        setStatus(`No se pudo validar el lote: ${message}`);
      }
      return false;
    } catch (error) {
      setStatus(`No se pudo validar el lote: ${error.message}`);
      return false;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!validarFormularioLote()) return;
    if (!await validarRestriccionesRemotasLote()) return;

    if (activeCampaignForNewLote) {
      setLoteActiveCampaignPrompt(activeCampaignForNewLote);
      return;
    }

    await saveNewLote();
  }

  async function saveNewLote({ disableAfterRegister = false, deshabilitacion = null, editCampaignId = null } = {}) {

    setSaving(true);
    setLoteFieldErrors({});
    setStatus('Guardando lote...');
    const payload = {
      ...lotePayloadFromForm(form, areaHa, areaM2, empresaDestinoNuevoLoteId),
      registrarDeshabilitado: disableAfterRegister,
      deshabilitacion
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/lotes`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(await response.text());
      const createdLote = await response.json();

      setForm(emptyForm);
      await loadLotes();
      setLoteActiveCampaignPrompt(null);
      setLoteNewDisableReason(false);

      if (editCampaignId) {
        setPendingNewCampaignLot({ loteId: createdLote.loteId, campaniaId: Number(editCampaignId) });
        setSelectedLote(null);
        setLoteFieldErrors({});
        setSelectedParentEmpresaId(String(loteActiveCampaignPrompt?.empresaId ?? empresaDestinoNuevoLoteId));
        setCampaignEditRequestId(String(editCampaignId));
        setActiveModule('campanias');
        setProfileMenuOpen(false);
        setIsMapExpanded(false);
        setStatus('Lote registrado. Agregalo a la campaña activa o deshabilitalo antes de salir.');
        return true;
      }

      goToList();
      setStatus(disableAfterRegister ? 'Lote registrado y deshabilitado correctamente.' : 'Lote registrado correctamente');
      return true;
    } catch (error) {
      const message = error.message.replace(/^"|"$/g, '');
      if (message.toLowerCase().includes('se superpone')) {
        setLoteActiveCampaignPrompt(null);
        setLoteOverlapConflict(message);
        setStatus('API conectada');
      } else if (message.toLowerCase().includes('ya existe') && message.toLowerCase().includes('lote')) {
        setLoteFieldErrors({ nombre: message });
        setStatus('API conectada');
      } else {
        setStatus(`No se pudo guardar: ${message}`);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event) {
    event.preventDefault();

    if (!selectedLote) {
      setStatus('Selecciona un lote para editar.');
      return;
    }

    if (!validarFormularioLote()) return;
    if (!await validarRestriccionesRemotasLote(selectedLote.loteId)) return;

    if (!hasLoteFormChanges(selectedLote, form, areaHa, areaM2)) {
      setStatus('No hay cambios para guardar.');
      return;
    }

    setSaving(true);
    setLoteFieldErrors({});
    setStatus('Guardando cambios del lote...');

    try {
      const response = await fetch(`${API_BASE_URL}/api/lotes/${selectedLote.loteId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(lotePayloadFromForm(form, areaHa, areaM2))
      });

      if (!response.ok) throw new Error(await response.text());

      goToList();
      await loadLotes();
      setStatus('Lote actualizado correctamente');
    } catch (error) {
      const message = error.message.replace(/^"|"$/g, '');
      if (message.toLowerCase().includes('se superpone')) {
        setLoteOverlapConflict(message);
        setStatus('API conectada');
      } else if (message.toLowerCase().includes('ya existe') && message.toLowerCase().includes('lote')) {
        setLoteFieldErrors({ nombre: message });
        setStatus('API conectada');
      } else {
        setStatus(`No se pudo actualizar: ${message}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleLoteStatus(lote, deshabilitacion = null, modoHabilitacion = null) {
    if (!session?.token || !lote) return false;

    const action = lote.activo ? 'deshabilitar' : 'habilitar';
    setLoteStatusSaving(`${action}-${lote.loteId}`);
    setStatus(`${lote.activo ? 'Deshabilitando' : 'Habilitando'} lote...`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/lotes/${lote.loteId}/${action}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(lote.activo ? deshabilitacion : { modo: modoHabilitacion })
      });

      if (!response.ok) throw new Error(await response.text());

      await loadLotes();
      setStatus(lote.activo ? 'Lote deshabilitado correctamente' : 'Lote habilitado correctamente');
      return true;
    } catch (error) {
      setStatus(`No se pudo actualizar el lote: ${error.message.replace(/^"|"$/g, '')}`);
      return false;
    } finally {
      setLoteStatusSaving('');
    }
  }

  async function requestToggleLoteStatus(lote) {
    if (lote?.activo) {
      if (activeCampaignsByEmpresa.has(String(lote.empresaId))) return;
      setLotePendingDisable(lote);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/lotes/${lote.loteId}/habilitacion`, { headers: authHeaders() });
      if (!response.ok) throw new Error(await response.text());
      const contexto = await response.json();
      const campaign = contexto.campaniaActiva
        ? activeCampaignsByEmpresa.get(String(lote.empresaId)) ?? { campaniaId: contexto.campaniaId, empresaId: lote.empresaId, nombre: contexto.campaniaNombre }
        : null;
      setLotePendingEnable({ lote, contexto, campaign });
    } catch (error) {
      setStatus(`No se pudo consultar la habilitación: ${error.message}`);
    }
  }

  async function confirmDisableLote(deshabilitacion) {
    if (!lotePendingDisable) return;

    if (await handleToggleLoteStatus(lotePendingDisable, deshabilitacion)) {
      setLotePendingDisable(null);
    } else {
      throw new Error('No se pudo deshabilitar el lote. Revisá el mensaje de la página.');
    }
  }

  async function confirmEnableLote() {
    if (!lotePendingEnable) return;

    if (await handleToggleLoteStatus(lotePendingEnable.lote)) {
      setLotePendingEnable(null);
    }
  }

  async function restoreLoteAndSiembras() {
    if (!lotePendingEnable) return;
    if (await handleToggleLoteStatus(lotePendingEnable.lote, null, 'Restaurar')) setLotePendingEnable(null);
  }

  async function enableLoteAndAddToCampaign() {
    if (!lotePendingEnable?.campaign) return;

    const { lote, campaign } = lotePendingEnable;
    setPendingCampaignReactivation({ loteId: lote.loteId, modo: lotePendingEnable.contexto?.tieneSiembras ? 'Nuevas' : null });
    setLotePendingEnable(null);
    setSelectedParentEmpresaId(String(campaign.empresaId));
    setCampaignEditRequestId(String(campaign.campaniaId));
    setActiveModule('campanias');
    setProfileMenuOpen(false);
    setStatus('Agregá el lote a la campaña. Se habilitará al guardar; si cancelás, conservará su baja.');
  }

  function navigateModule(nextModule) {
    if (pendingNewCampaignLot && activeModule === 'campanias' && nextModule !== 'campanias') {
      setStatus('Asociá el lote nuevo a la campaña o deshabilitalo antes de salir.');
      return false;
    }
    if (nextModule !== 'campanias') setPendingCampaignReactivation(null);
    if (nextModule !== 'siembras') setSiembraRegistrationRequest(null);
    setActiveModule(nextModule);
    return true;
  }

  function abrirReporteriaDesdeAgroBot(prompt) {
    if (!permisosRol.estructura || !selectedParentEmpresaId || !prompt?.trim()) return;
    if (!navigateModule('reporteria-ia')) return;
    setReporteriaPromptPendiente({ id: Date.now(), empresaId: String(selectedParentEmpresaId), texto: prompt });
    setAgroBotOpen(false);
  }


  async function handleCreateTeam(nombre) {
    if (!session?.token) return;
    setManagerTeamStatus('');
    setManagerTeamError('');
    setManagerTeamSaving('create');

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/empresas`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ nombre })
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerTeamStatus(data.mensaje ?? 'Empresa creada correctamente.');
      setManagerTeamUsers({});
      await loadManagerContext();
      await loadManagerRequests();
      await loadManagerUsers();
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudo crear la empresa.');
    } finally {
      setManagerTeamSaving('');
    }
  }

  async function handleUpdateTeam(empresaId, nombre) {
    if (!session?.token) return;
    setManagerTeamStatus('');
    setManagerTeamError('');
    setManagerTeamSaving(`edit-${empresaId}`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/empresas/${empresaId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ nombre })
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerTeamStatus(data.mensaje ?? 'Empresa actualizada correctamente.');
      setManagerTeamUsers({});
      await loadManagerContext();
      await loadManagerRequests();
      await loadManagerUsers();
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar la empresa.');
    } finally {
      setManagerTeamSaving('');
    }
  }

  async function handleToggleTeamStatus(empresa) {
    if (!session?.token || !empresa) return;
    const action = empresa.activo ? 'deshabilitar' : 'habilitar';
    setManagerTeamStatus('');
    setManagerTeamError('');
    setManagerTeamSaving(`${action}-${empresa.empresaId}`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/empresas/${empresa.empresaId}/${action}`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerTeamStatus(data.mensaje ?? 'Empresa actualizada correctamente.');
      setManagerTeamUsers({});
      await loadManagerContext();
      await loadManagerRequests();
      await loadManagerUsers();
      await loadLotes();
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar la empresa.');
    } finally {
      setManagerTeamSaving('');
    }
  }

  async function handleSetPrincipalTeam(empresaId) {
    if (!session?.token) return;
    setManagerTeamStatus('');
    setManagerTeamError('');
    setManagerTeamSaving(`principal-${empresaId}`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/empresas/${empresaId}/principal`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerTeamStatus(data.mensaje ?? 'Empresa principal actualizada.');
      await loadManagerContext();
      await loadManagerUsers();
      await loadLotes();
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudo marcar la empresa como principal.');
    } finally {
      setManagerTeamSaving('');
    }
  }

  async function handleJoinTeamRequest(joinForm) {
    setLoginError('');
    setJoinRequestStatus('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/solicitar-union-grupo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(joinForm)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'No se pudo enviar la solicitud.');
      }

      const data = await response.json();
      setJoinRequestStatus(data.mensaje ?? 'Solicitud enviada. El gerente debe aprobar tu acceso.');
    } catch (error) {
      setLoginError(error.message.replace(/^"|"$/g, ''));
    }
  }

  async function handleApproveUserRequest(solicitudId, approval) {
    if (!session?.token) return;
    setManagerActionStatus('');
    setManagerRequestsError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/solicitudes/${solicitudId}/aprobar`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(approval)
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerActionStatus(data.mensaje ?? 'Solicitud aprobada correctamente.');
      setManagerTeamUsers({});
      await loadManagerContext();
      await loadManagerRequests();
      await loadManagerUsers();
    } catch (error) {
      setManagerRequestsError(error.message.replace(/^"|"$/g, '') || 'No se pudo aprobar la solicitud.');
    }
  }

  async function handleResolveUserRequest(solicitudId, action) {
    if (!session?.token) return;
    setManagerActionStatus('');
    setManagerRequestsError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/solicitudes/${solicitudId}/${action}`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerActionStatus(data.mensaje ?? 'Solicitud actualizada.');
      await loadManagerContext();
      await loadManagerRequests();
    } catch (error) {
      setManagerRequestsError(error.message.replace(/^"|"$/g, '') || 'No se pudo resolver la solicitud.');
    }
  }

  async function handleToggleManagerUserStatus(user) {
    if (!session?.token || !user) return;
    const action = user.activo ? 'deshabilitar' : 'habilitar';
    setManagerActionStatus('');
    setManagerUsersError('');
    setManagerUserSaving(`${action}-${user.usuarioId}`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/usuarios/${user.usuarioId}/${action}`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setManagerActionStatus(data.mensaje ?? 'Usuario actualizado correctamente.');
      setManagerTeamUsers({});
      await loadManagerUsers();
      await loadManagerContext();
    } catch (error) {
      setManagerUsersError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar el usuario.');
    } finally {
      setManagerUserSaving('');
    }
  }

  async function handleLogin({ usuario, password }) {
    setLoginError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ usuario, password })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Usuario o contraseña incorrectos.');
      }

      const data = await response.json();
      const sessionType = data.rol === 'Admin'
        ? 'admin'
        : data.debeCompletarRegistro
          ? 'manager-onboarding'
          : 'manager-demo';
      setActiveModule('inicio');
      setAuthView('login');
      setJoinRequestStatus('');
      setShowManagerWelcome(sessionType === 'manager-onboarding');
      setSession({ type: sessionType, name: data.nombre, role: data.rol, token: data.token, usuario: data.usuario });
    } catch (error) {
      setLoginError(error.message.replace(/^"|"$/g, ''));
    }
  }

  // Enlace de invitacion de empleado: http://.../?unirse=CODIGO&otp=OTP&correo=...
  // Abre "Solicitar acceso" con los datos precargados y los quita de la URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codigo = params.get('unirse');
    if (!codigo) return;

    setJoinPrefill({
      grupoGestionCodigo: codigo.trim().toUpperCase(),
      otp: (params.get('otp') ?? '').trim().toUpperCase(),
      correoElectronico: (params.get('correo') ?? '').trim().toLowerCase()
    });
    setAuthView('join');

    ['unirse', 'otp', 'correo'].forEach((clave) => params.delete(clave));
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);

  // Enlace del correo de invitacion: http://.../?activar=TOKEN
  // Se lee una sola vez al abrir la app y se quita de la URL (no queda en el historial).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('activar');
    if (!token) return;

    params.delete('activar');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    handleActivateManagerAccount(token);
  }, []);

  async function handleActivateManagerAccount(token) {
    setLoginError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/activar-gerente`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'El enlace de activación no es válido o ya venció.');
      }

      const data = await response.json();
      const sessionType = data.debeCompletarRegistro ? 'manager-onboarding' : 'manager-demo';
      setActiveModule('inicio');
      setAuthView('login');
      setJoinRequestStatus('');
      setShowManagerWelcome(sessionType === 'manager-onboarding');
      setSession({
        type: sessionType,
        name: data.nombre,
        role: data.rol,
        token: data.token,
        usuario: data.usuario,
        correo: data.correoElectronico ?? ''
      });
    } catch (error) {
      setLoginError(error.message.replace(/^"|"$/g, '') || 'El enlace de activación no es válido o ya venció.');
    }
  }

  async function handleCompleteManagerRegistration(registrationForm) {
    if (!session?.token) return;

    setLoginError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/completar-registro-gerente`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify(registrationForm)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'No se pudo completar el registro.');
      }

      const data = await response.json();
      setActiveModule('inicio');
      setSession({ type: 'manager-demo', name: data.nombre, role: data.rol, token: data.token, usuario: data.usuario });
    } catch (error) {
      setLoginError(error.message.replace(/^"|"$/g, ''));
    }
  }

  async function handleCopy(value) {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    setCopiedKey(value);
    window.setTimeout(() => setCopiedKey((current) => (current === value ? '' : current)), 1400);
  }

  function handleLogout() {
    setAgroBotOpen(false);
    setReporteriaPromptPendiente(null);
    setSession(null);
    setLoginError('');
    resetAdminAccounts();
    setCopiedKey('');
    setActiveModule('lotes');
    setManagerContext(null);
    setManagerContextError('');
    setManagerRequests([]);
    setManagerRequestsError('');
    setManagerUsers([]);
    setManagerUsersError('');
    setManagerUserSaving('');
    setManagerTeamUsers({});
    setManagerTeamUsersLoading('');
    setManagerActionStatus('');
    setManagerTeamStatus('');
    setManagerTeamError('');
    setManagerTeamSaving('');
    setGeneratedOtp(null);
    setOtpError('');
    setOtpLoading(false);
    setProfileMenuOpen(false);
    resetProfile();
    setShowManagerWelcome(true);
    setView('list');
    setSelectedLote(null);
    setIsMapExpanded(false);
  }

  const parentFiltersForEmpresa = (
    <ParentFiltersBar>
      <ParentSearchSelect
        label="Empresa"
        value={selectedParentEmpresaId}
        options={empresasDisponibles.map((empresa) => ({ value: String(empresa.empresaId), label: empresa.nombre }))}
        placeholder="Seleccionar empresa"
        onChange={setSelectedParentEmpresaId}
      />
    </ParentFiltersBar>
  );

  const parentFiltersForEmpresaCampania = (
    <ParentFiltersBar>
      <ParentSearchSelect
        label="Empresa"
        value={selectedParentEmpresaId}
        options={empresasDisponibles.map((empresa) => ({ value: String(empresa.empresaId), label: empresa.nombre }))}
        placeholder="Seleccionar empresa"
        onChange={setSelectedParentEmpresaId}
      />
      <ParentSearchSelect
        label="Campaña"
        value={selectedParentCampaniaId}
        options={campaniasDisponibles.map((campania) => ({ value: String(campania.campaniaId), label: campania.campaniaNombre }))}
        placeholder="Seleccionar campaña"
        onChange={setSelectedParentCampaniaId}
      />
    </ParentFiltersBar>
  );

  const parentFiltersForEmpresaCampaniaCiclo = (
    <ParentFiltersBar>
      <ParentSearchSelect
        label="Empresa"
        value={selectedParentEmpresaId}
        options={empresasDisponibles.map((empresa) => ({ value: String(empresa.empresaId), label: empresa.nombre }))}
        placeholder="Seleccionar empresa"
        onChange={setSelectedParentEmpresaId}
      />
      <ParentSearchSelect
        label="Campaña"
        value={selectedParentCampaniaId}
        options={campaniasDisponibles.map((campania) => ({ value: String(campania.campaniaId), label: campania.campaniaNombre }))}
        placeholder="Seleccionar campaña"
        onChange={setSelectedParentCampaniaId}
      />
      <ParentSearchSelect
        label="Ciclo estacional"
        value={selectedParentCicloEstacional}
        options={[{ value: 'Verano', label: 'Verano' }, { value: 'Invierno', label: 'Invierno' }]}
        placeholder="Seleccionar ciclo"
        onChange={setSelectedParentCicloEstacional}
      />
    </ParentFiltersBar>
  );

  const currentCrumb = activeModule === 'profile' ? 'Perfil' : activeModule === 'users' ? 'Usuarios' : activeModule === 'teams' ? 'Empresas' : {
    create: 'Registrar lote',
    detail: selectedLote ? `Detalle ${selectedLote.nombre}` : 'Detalle lote',
    edit: selectedLote ? `Editar ${selectedLote.nombre}` : 'Editar lote'
  }[view];

  const floatingWidgets = (
    <FloatingWidgets
      accessibilityOpen={accessibilityOpen}
      textSize={textSize}
      onToggleAccessibility={() => setAccessibilityOpen((current) => !current)}
      onCloseAccessibility={() => setAccessibilityOpen(false)}
      onSelectTextSize={setTextSize}
      botOpen={agroBotOpen}
      botEnabled={Boolean(session?.token)}
      onOpenBot={() => { if (session?.token) { setAgroBotOpen(true); setAccessibilityOpen(false); } }}
    />
  );

  if (!session) {
    return (
      <main className={`auth-shell text-size-${textSize}`} onChangeCapture={handleTextCaseCapture}>
        {authView === 'join' ? (
          <JoinTeamPage
            initialValues={joinPrefill}
            error={loginError}
            status={joinRequestStatus}
            onSubmit={handleJoinTeamRequest}
            onBack={() => {
              setAuthView('login');
              setLoginError('');
              setJoinRequestStatus('');
            }}
          />
        ) : (
          <LoginPage
            onLogin={handleLogin}
            error={loginError}
            onJoin={() => {
              setAuthView('join');
              setLoginError('');
              setJoinRequestStatus('');
            }}
          />
        )}
        {floatingWidgets}
      </main>
    );
  }

  if (session.type === 'manager-onboarding') {
    return (
      <main className={`auth-shell text-size-${textSize}`} onChangeCapture={handleTextCaseCapture}>
        {showManagerWelcome ? (
          <ManagerWelcomePage
            managerName={session.name}
            onContinue={() => setShowManagerWelcome(false)}
            onLogout={handleLogout}
          />
        ) : (
          <ManagerRegistrationPage
            initialName={session.name}
            initialEmail={session.correo}
            error={loginError}
            onSubmit={handleCompleteManagerRegistration}
            onLogout={handleLogout}
          />
        )}
        {floatingWidgets}
      </main>
    );
  }

  if (session.type === 'admin') {
    return (
      <main className={`admin-shell text-size-${textSize}`} onChangeCapture={handleTextCaseCapture}>
        <AdminPanel
          accounts={adminAccounts}
          lastGeneratedAccount={lastGeneratedAccount}
          error={adminError}
          envio={adminEnvio}
          resendingId={adminResendingId}
          onCreateAccount={handleCreateAdminAccount}
          onResendInvitation={handleResendAdminInvitation}
          onRegeneratePassword={handleRegenerateAdminPassword}
          onUpdateResponsible={handleUpdateAdminResponsible}
          onToggleAccountStatus={handleToggleAdminAccountStatus}
          onCopy={handleCopy}
          copiedKey={copiedKey}
          onLogout={handleLogout}
          onOpenDemo={() => {
            setActiveModule('inicio');
            setSession({ type: 'manager-demo', name: session.name || 'Admin AgroDigital', role: 'Admin', token: session.token, usuario: session.usuario });
          }}
        />
        {floatingWidgets}
      </main>
    );
  }

  return (
    <main className={`app-frame ${sidebarCollapsed ? 'sidebar-collapsed' : ''} text-size-${textSize}`} onChangeCapture={handleTextCaseCapture}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img src={agroDigitalLogo} alt="AgroDigital" />
          </div>
          <div className="sidebar-compact-brand">
            <img src={agroDigitalCompactLogo} alt="AgroDigital" />
          </div>
          <span className="menu-label">Menú</span>
        </div>
        <button className="sidebar-toggle" type="button" aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Contraer menu lateral'} onClick={handleSidebarToggle}>
          <ChevronDown size={22} />
        </button>
        <nav className="nav-icons" aria-label="Modulos principales">
          <button className={`nav-item ${activeModule === 'inicio' ? 'nav-item-active' : ''}`} type="button" onClick={goToInicio}>
            <LayoutDashboard size={23} />
            <span>Inicio</span>
          </button>
          <button className={`nav-item ${activeModule === 'users' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('users'); setView('list'); setIsMapExpanded(false); setProfileMenuOpen(false); }}>
            <Users size={23} />
            <span>Usuarios</span>
          </button>
          <button className={`nav-item ${activeModule === 'teams' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('teams'); setView('list'); setIsMapExpanded(false); setProfileMenuOpen(false); }}>
            <Building2 size={23} />
            <span>Empresas</span>
          </button>
          <button className={`nav-item ${activeModule === 'lotes' ? 'nav-item-active' : ''}`} type="button" onClick={goToList}>
            <Compass size={23} />
            <span>Lotes</span>
          </button>
          <button className={`nav-item ${activeModule === 'campanias' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('campanias'); setProfileMenuOpen(false); setIsMapExpanded(false); }}>
            <CalendarDays size={23} />
            <span>Campañas</span>
          </button>
          <button className={`nav-item ${activeModule === 'siembras' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('siembras'); setProfileMenuOpen(false); setIsMapExpanded(false); }}>
            <Sprout size={23} />
            <span>Siembras</span>
          </button>
          <button className={`nav-item ${activeModule === 'cosechas' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('cosechas'); setProfileMenuOpen(false); setIsMapExpanded(false); }}>
            <MapIcon size={23} />
            <span>Cosechas</span>
          </button>
                    <button className={`nav-item ${activeModule === 'silos' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('silos'); setProfileMenuOpen(false); setIsMapExpanded(false); }}>
            <Warehouse size={23} />
            <span>Silos</span>
          </button>
          <button className={`nav-item ${activeModule === 'almacenamiento' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('almacenamiento'); setProfileMenuOpen(false); setIsMapExpanded(false); }}>
            <Home size={23} />
            <span>Almacenamiento</span>
          </button>
          <button className={`nav-item ${activeModule === 'distribucion' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('distribucion'); setProfileMenuOpen(false); setIsMapExpanded(false); }}>
            <Tractor size={23} />
            <span>Distribución</span>
          </button>
          <button className={`nav-item ${activeModule === 'estadisticas' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('estadisticas'); setProfileMenuOpen(false); setIsMapExpanded(false); }}>
            <BarChart3 size={23} />
            <span>Estadísticas</span>
          </button>
          {permisosRol.estructura && <button className={`nav-item ${activeModule === 'reporteria-ia' ? 'nav-item-active' : ''}`} type="button" onClick={() => { navigateModule('reporteria-ia'); setProfileMenuOpen(false); setIsMapExpanded(false); }}>
            <Sparkles size={23} />
            <span>Reportería IA</span>
          </button>}
        </nav>
        <div className="sidebar-landscape" aria-hidden="true">
          <img className="sidebar-landscape-expanded-image" src={sidebarLandscapeExpanded} alt="" />
          <img className="sidebar-landscape-collapsed-image" src={sidebarLandscapeCollapsed} alt="" />
        </div>
        <button className="logout-button" type="button" onClick={handleLogout}>
          <LogOut size={20} />
          <span>Cerrar sesion</span>
        </button>
      </aside>

      <section className="screen">
        <header className="top-header">
          <div className="breadcrumb">
            <img className="header-logo" src={agroDigitalLogo} alt="AgroDigital" />
            <button className="breadcrumb-home" type="button" aria-label="Inicio" onClick={goToInicio}>
              <Home size={17} />
            </button>
            <button className="breadcrumb-link" type="button" onClick={activeModule === 'lotes' ? goToList : undefined}>
                          {activeModule === 'inicio' ? 'Inicio' : activeModule === 'profile' ? 'Perfil' : activeModule === 'users' ? 'Usuarios' : activeModule === 'teams' ? 'Empresas' : activeModule === 'campanias' ? 'Campañas' : activeModule === 'silos' ? 'Silos' : activeModule === 'siembras' ? 'Siembras' : activeModule === 'cosechas' ? 'Cosechas' : activeModule === 'almacenamiento' ? 'Almacenamiento' : activeModule === 'distribucion' ? 'Distribución' : activeModule === 'estadisticas' ? 'Estadísticas' : activeModule === 'reporteria-ia' ? 'Reportería IA' : 'Lotes'}
            </button>
            {false && activeModule === 'users' && (
              <>
                <span className="breadcrumb-separator">/</span>
                <span className="breadcrumb-current">Usuarios</span>
              </>
            )}
            {activeModule === 'lotes' && view !== 'list' && (
              <>
                <span className="breadcrumb-separator">/</span>
                <span className="breadcrumb-current">{currentCrumb}</span>
              </>
            )}
          </div>
          <div className="header-actions">
            <div className="status-pill">
              <CheckCircle2 size={15} />
              <span>{status}</span>
            </div>
            {(() => {
              // Campanita: para el Gerente, solicitudes de acceso pendientes de aprobar.
              const pendientes = session?.role === 'Gerente' ? managerRequests.length : 0;
              const etiqueta = pendientes === 0
                ? 'Notificaciones: no hay novedades'
                : `Notificaciones: ${pendientes} ${pendientes === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'} de aprobación`;
              return (
                <button
                  className="icon-button notification-bell"
                  type="button"
                  aria-label={etiqueta}
                  title={etiqueta.replace('Notificaciones: ', '')}
                  onClick={() => {
                    if (pendientes === 0) return;
                    setActiveModule('users');
                    setView('list');
                    setIsMapExpanded(false);
                    setProfileMenuOpen(false);
                  }}
                >
                  <Bell size={18} />
                  {pendientes > 0 && <span className="notification-badge">{pendientes > 9 ? '9+' : pendientes}</span>}
                </button>
              );
            })()}
            <UserProfileMenu
              session={session}
              profile={userProfile}
              open={profileMenuOpen}
              menuRef={userMenuRef}
              onToggle={() => setProfileMenuOpen((current) => !current)}
              onOpenProfile={() => {
                navigateModule('profile');
                setView('list');
                setIsMapExpanded(false);
                setProfileMenuOpen(false);
                if (!userProfile) loadUserProfile();
              }}
              onLogout={handleLogout}
              managerContext={managerContext}
            />
          </div>
        </header>

        {activeModule === 'profile' ? (
          <ProfilePage
            profile={userProfile}
            session={session}
            error={profileError}
            status={profileStatus}
            saving={profileSaving}
            passwordSaving={profilePasswordSaving}
            passwordError={profilePasswordError}
            onSave={handleUpdateProfile}
            onChangePassword={handleChangeProfilePassword}
            onClearPasswordError={() => setProfilePasswordError('')}
            onReload={loadUserProfile}
            onBack={goToList}
            managerContext={managerContext}
          />
        ) : activeModule === 'users' && session.role !== 'Gerente' ? (
          <MyAccessUsersPage acceso={miAcceso} equipo={equipoUsuarios} error={equipoError} />
        ) : activeModule === 'users' ? (
          <ManagerUsersPage
            context={managerContext}
            error={managerContextError || managerRequestsError || managerUsersError || otpError}
            generatedOtp={generatedOtp}
            copiedKey={copiedKey}
            loadingOtp={otpLoading}
            onGenerateOtp={handleGenerateOtp}
            onCopy={handleCopy}
            requests={managerRequests}
            users={managerUsers}
            userSaving={managerUserSaving}
            actionStatus={managerActionStatus}
            onApproveRequest={handleApproveUserRequest}
            onResolveRequest={handleResolveUserRequest}
            onToggleUserStatus={handleToggleManagerUserStatus}
            invitations={managerInvitations}
            invitationSaving={invitationSaving}
            invitationResult={invitationResult}
            invitationError={invitationError}
            onCreateInvitation={handleCreateInvitation}
            onResendInvitation={handleResendInvitation}
            onCancelInvitation={handleCancelInvitation}
          />
        ) : activeModule === 'teams' && session.role !== 'Gerente' ? (
          <MyCompaniesPage acceso={miAcceso} error={equipoError} />
        ) : activeModule === 'teams' ? (
          <ManagerTeamsPage
            context={managerContext}
            error={managerContextError || managerTeamError}
            status={managerTeamStatus}
            savingAction={managerTeamSaving}
            teamUsers={managerTeamUsers}
            loadingTeamUsers={managerTeamUsersLoading}
            onCreateTeam={handleCreateTeam}
            onUpdateTeam={handleUpdateTeam}
            onToggleTeamStatus={handleToggleTeamStatus}
            onSetPrincipalTeam={handleSetPrincipalTeam}
            onLoadTeamUsers={loadManagerTeamUsers}
          />
        ) : activeModule === 'inicio' ? (
          <Inicio
            session={session}
            parentFilters={parentFiltersForEmpresaCampania}
            selectedEmpresaId={selectedParentEmpresaId}
            selectedCampaniaId={selectedParentCampania ? selectedParentCampaniaId : ''}
            lotes={parentFilteredLotes}
            onRegistrarLote={startCreate}
            onNavigate={(modulo) => {
              if (modulo === 'lotes') {
                goToList();
                return;
              }
              navigateModule(modulo);
              setView('list');
              setProfileMenuOpen(false);
              setIsMapExpanded(false);
            }}
          />
        ) : activeModule === 'silos' ? (
          <Silos
            permisos={permisosRol}
            session={session}
            lotes={parentFilteredLotes}
            parentFilters={parentFiltersForEmpresa}
            selectedEmpresaId={selectedParentEmpresaId}
            selectedEmpresaName={selectedParentEmpresa?.nombre || ''}
          />
        ) : activeModule === 'campanias' ? (
          <Campanias
            permisos={permisosRol}
            session={session}
            lotes={parentFilteredLotes}
            parentFilters={parentFiltersForEmpresa}
            selectedEmpresaId={selectedParentEmpresaId}
            onLotesChanged={loadLotes}
            onCampaniasChanged={loadParentCampanias}
            requestedEditCampaniaId={campaignEditRequestId}
            onCampaignEditRequestHandled={() => setCampaignEditRequestId('')}
            pendingReactivation={pendingCampaignReactivation}
            onPendingReactivationDone={() => setPendingCampaignReactivation(null)}
            pendingNewCampaignLot={pendingNewCampaignLot}
            onPendingNewCampaignLotResolved={() => setPendingNewCampaignLot(null)}
            onRegisterSiembra={(plan) => {
              if (plan.empresaId) setSelectedParentEmpresaId(String(plan.empresaId));
              setSelectedParentCampaniaId(String(plan.campaniaId));
              setSiembraRegistrationRequest(plan);
              setActiveModule('siembras');
              setProfileMenuOpen(false);
              setIsMapExpanded(false);
            }}
          />
        ) : activeModule === 'siembras' ? (
          <Siembras
            permisos={permisosRol}
            session={session}
            lotes={parentFilteredLotes}
            parentFilters={parentFiltersForEmpresaCampaniaCiclo}
            selectedCampania={selectedParentCampania}
            selectedCampaniaCombinaciones={selectedParentCampaniaCombinaciones}
            selectedCicloEstacional={selectedParentCicloEstacional}
            selectedEmpresaName={selectedParentEmpresa?.nombre || ''}
            selectedCampaniaName={selectedParentCampania?.campaniaNombre || ''}
            registrationRequest={siembraRegistrationRequest}
            onRegistrationRequestHandled={() => setSiembraRegistrationRequest(null)}
            onLotesChanged={loadLotes}
            onCampaniasChanged={loadParentCampanias}
          />
        ) : activeModule === 'cosechas' ? (
          <Cosechas
            permisos={permisosRol}
            session={session}
            lotes={parentFilteredLotes}
            parentFilters={parentFiltersForEmpresaCampaniaCiclo}
            selectedEmpresaId={selectedParentEmpresaId}
            selectedEmpresaName={selectedParentEmpresa?.nombre || ''}
            selectedCampaniaName={selectedParentCampania?.campaniaNombre || ''}
            selectedCicloEstacional={selectedParentCicloEstacional}
            onLotesChanged={loadLotes}
            onCampaniasChanged={loadParentCampanias}
          />
        ) : activeModule === 'almacenamiento' ? (
          <Almacenamiento
            permisos={permisosRol}
            session={session}
            parentFilters={parentFiltersForEmpresa}
            selectedEmpresaId={selectedParentEmpresaId}
            selectedEmpresaName={selectedParentEmpresa?.nombre || ''}
          />
        ) : activeModule === 'estadisticas' ? (
          <Estadisticas
            session={session}
            parentFilters={parentFiltersForEmpresa}
            selectedEmpresaId={selectedParentEmpresaId}
          />
        ) : activeModule === 'reporteria-ia' ? (
          <ReporteriaIA
            session={session}
            parentFilters={parentFiltersForEmpresa}
            selectedEmpresaId={selectedParentEmpresaId}
            selectedEmpresaName={selectedParentEmpresa?.nombre || ''}
            puedeVer={permisosRol.estructura}
            promptInicial={reporteriaPromptPendiente}
            onPromptInicialConsumido={(id) => setReporteriaPromptPendiente((actual) => actual?.id === id ? null : actual)}
          />
        ) : activeModule === 'distribucion' ? (
          <Distribucion
            permisos={permisosRol}
            session={session}
            parentFilters={parentFiltersForEmpresa}
            selectedEmpresaId={selectedParentEmpresaId}
            selectedEmpresaName={selectedParentEmpresa?.nombre || ''}
          />
        ) : view === 'list' ? (
          <LotesList
            permisos={permisosRol}
            lotes={parentFilteredLotes}
            loading={loading}
            parentFilters={parentFiltersForEmpresa}
            onAdd={startCreate}
            onView={(lote) => openLote(lote, 'detail')}
            onEdit={(lote) => openLote(lote, 'edit')}
            onToggleStatus={requestToggleLoteStatus}
            statusSaving={loteStatusSaving}
            activeCampaignEmpresaIds={new Set(activeCampaignsByEmpresa.keys())}
          />
        ) : view === 'create' ? (
          <LoteCreate
            form={form}
            areaHa={areaHa}
            areaM2={areaM2}
            saving={saving}
            fieldErrors={loteFieldErrors}
            zones={availableZones}
            zonesLoading={zonesLoading}
            zoneMapTarget={zoneMapTarget}
            onCancel={goToList}
            onSubmit={handleSubmit}
            onFieldChange={updateField}
            onCoordinatesChange={setCoordinates}
            onMapExpandedChange={setIsMapExpanded}
          />
        ) : (
          <LoteDetailEdit
            mode={view}
            lote={selectedLote}
            form={form}
            areaHa={areaHa}
            areaM2={areaM2}
            saving={saving}
            fieldErrors={loteFieldErrors}
            zones={availableZones}
            zonesLoading={zonesLoading}
            zoneMapTarget={zoneMapTarget}
            onBack={goToList}
            onEdit={() => setView('edit')}
            onSubmit={handleUpdate}
            onFieldChange={updateField}
            onCoordinatesChange={setCoordinates}
            onMapExpandedChange={setIsMapExpanded}
          />
        )}

      </section>

      {floatingWidgets}
      <AgroBot
        open={agroBotOpen}
        onClose={() => setAgroBotOpen(false)}
        session={session}
        empresaId={selectedParentEmpresaId}
        empresaNombre={selectedParentEmpresa?.nombre}
        onOpenReporteria={permisosRol.estructura ? abrirReporteriaDesdeAgroBot : null}
      />
      {lotePendingDisable && (
        <DisableLoteModal
          lote={lotePendingDisable}
          saving={loteStatusSaving === `deshabilitar-${lotePendingDisable.loteId}`}
          onCancel={() => setLotePendingDisable(null)}
          onConfirm={confirmDisableLote}
          checkBlock={async (lote) => {
            const response = await fetch(`${API_BASE_URL}/api/lotes/${lote.loteId}/deshabilitacion`, { headers: authHeaders() });
            if (!response.ok) throw new Error(await response.text());
            return await response.json();
          }}
        />
      )}
      {lotePendingEnable && (
        lotePendingEnable.contexto?.tieneSiembras ? (
          <EnableLoteWithSiembrasConfirmation
            lote={lotePendingEnable.lote}
            contexto={lotePendingEnable.contexto}
            saving={loteStatusSaving === `habilitar-${lotePendingEnable.lote.loteId}`}
            onCancel={() => setLotePendingEnable(null)}
            onRestore={restoreLoteAndSiembras}
            onNewSowing={enableLoteAndAddToCampaign}
          />
        ) : lotePendingEnable.campaign ? (
          <EnableLoteWithActiveCampaignConfirmation
            lote={lotePendingEnable.lote}
            campaign={lotePendingEnable.campaign}
            saving={loteStatusSaving === `habilitar-${lotePendingEnable.lote.loteId}`}
            onCancel={() => setLotePendingEnable(null)}
            onAddToCampaign={enableLoteAndAddToCampaign}
          />
        ) : (
          <EnableLoteConfirmation
            lote={lotePendingEnable.lote}
            saving={loteStatusSaving === `habilitar-${lotePendingEnable.lote.loteId}`}
            onCancel={() => setLotePendingEnable(null)}
            onConfirm={confirmEnableLote}
          />
        )
      )}
      {loteActiveCampaignPrompt && (
        <ActiveCampaignLoteModal
          campaign={loteActiveCampaignPrompt}
          saving={saving}
          onCancel={() => setLoteActiveCampaignPrompt(null)}
          onRegisterAndDisable={() => setLoteNewDisableReason(true)}
          onAddToCampaign={() => saveNewLote({ editCampaignId: loteActiveCampaignPrompt.campaniaId })}
        />
      )}
      {loteNewDisableReason && (
        <DisableLoteModal
          allowRecentlyRented
          campaignPeriod={loteActiveCampaignPrompt?.periodo}
          lote={{ nombre: form.nombre }}
          saving={saving}
          onCancel={() => setLoteNewDisableReason(false)}
          onConfirm={async (deshabilitacion) => {
            if (!await saveNewLote({ disableAfterRegister: true, deshabilitacion }))
              throw new Error('No se pudo registrar el lote. Revisá el mensaje de la página.');
          }}
        />
      )}
      {loteOverlapConflict && (
        <LoteOverlapConflictModal
          message={loteOverlapConflict}
          onClose={() => setLoteOverlapConflict('')}
        />
      )}
    </main>
  );
}


export default App;




























