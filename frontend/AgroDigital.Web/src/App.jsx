import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import agroDigitalCompactLogo from './assets/agrodigital-compact-logo.png';
import agroDigitalLogo from './assets/agrodigital-logo.png';
import agroBotMascot from './assets/agrobot-mascot.png';
import profileCardLandscape from './assets/profile-card-landscape.png';
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
import { LoteCreate, LoteDetailEdit } from './features/lotes/LoteEditor.jsx';
import { ARGENTINA_ZONES } from './features/lotes/loteCatalogos.js';
import { formatDate } from './shared/utils/formatDate.js';
import LotesList from './features/lotes/LotesList.jsx';
import { normalizeSearchText } from './shared/utils/normalizeSearchText.js';
import { EnableLoteWithSiembrasConfirmation, EnableLoteConfirmation, EnableLoteWithActiveCampaignConfirmation, LoteOverlapConflictModal, ActiveCampaignLoteModal } from './features/lotes/LoteModals.jsx';
import SummaryCard from './shared/components/SummaryCard.jsx';
import { emptyForm, polygonAreaSquareMeters, formFromLote, lotePayloadFromForm, hasLoteFormChanges } from './features/lotes/loteUtils.js';
import { LayoutDashboard, MessageCircle, Send, XCircle } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  Ban,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Compass,
  Copy,
  Edit,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GripVertical,
  Handshake,
  Home,
  KeyRound,
  Leaf,
  Lightbulb,
  LogIn,
  LogOut,
  LockKeyhole,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minimize2,
  MousePointerClick,
  PlusCircle,
  RotateCcw,
  Route,
  Search,
  Settings,
  Save,
  Mail,
  Phone,
  Sparkles,
  Sprout,
  ShieldCheck,
  Tractor,
  Trash2,
  Wand2,
  User,
  UserPlus,
  Users,
  Warehouse,
  Accessibility
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';
const GEOREF_API_BASE_URL = 'https://apis.datos.gob.ar/georef/api';
function formatPersonName(value) {
  return value
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s'-])([a-záéíóúñ])/g, (_, separator, letter) => `${separator}${letter.toLocaleUpperCase('es-AR')}`);
}

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

function getPasswordRequirements(password) {
  return [
    { id: 'length', label: 'Al menos 8 caracteres', valid: password.length >= 8 },
    { id: 'uppercase', label: 'Una letra mayúscula', valid: /[A-ZÁÉÍÓÚÑ]/.test(password) },
    { id: 'lowercase', label: 'Una letra minúscula', valid: /[a-záéíóúñ]/.test(password) },
    { id: 'number', label: 'Un número', valid: /\d/.test(password) },
    { id: 'symbol', label: 'Un símbolo (!, #, $, etc.)', valid: /[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(password) }
  ];
}
const ROLE_LABELS = {
  Gerente: 'Gerente',
  Encargado: 'Encargado',
  EmpleadoCampo: 'Empleado de campo',
  EmpleadoAdministrativo: 'Empleado administrativo'
};

function formatRole(value) {
  return ROLE_LABELS[value] ?? value ?? '-';
}

function adminAccountFromApi(account, passwordTemporal = null) {
  return {
    id: account.id,
    responsable: account.responsable,
    usuario: account.usuario,
    passwordTemporal,
    estado: account.estado,
    grupoGestion: account.grupoGestion,
    fechaCreacion: formatDate(account.fechaCreacion),
    fechaVencimiento: formatDate(account.fechaVencimiento),
    correoElectronico: account.correoElectronico ?? '',
    estadoEnvio: account.estadoEnvio ?? '',
    fechaUltimoEnvio: account.fechaUltimoEnvio
      ? new Date(account.fechaUltimoEnvio).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '',
    cantidadEnvios: account.cantidadEnvios ?? 0
  };
}

function App() {
  const [session, setSession] = useState(null);
  const [loginError, setLoginError] = useState('');
  const [authView, setAuthView] = useState('login');
  const [joinRequestStatus, setJoinRequestStatus] = useState('');
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [lastGeneratedAccount, setLastGeneratedAccount] = useState(null);
  const [adminError, setAdminError] = useState('');
  const [adminEnvio, setAdminEnvio] = useState(null);
  const [adminResendingId, setAdminResendingId] = useState(null);
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
  const [userProfile, setUserProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profilePasswordSaving, setProfilePasswordSaving] = useState(false);
  const [profilePasswordError, setProfilePasswordError] = useState('');
  const [showManagerWelcome, setShowManagerWelcome] = useState(true);
  const userMenuRef = useRef(null);

  const areaM2 = useMemo(() => polygonAreaSquareMeters(form.coordenadas), [form.coordenadas]);
  const areaHa = areaM2 / 10000;
  const empresasDisponibles = useMemo(
    () => (session?.role === 'Gerente' ? managerContext?.empresas ?? [] : misEmpresas).filter((empresa) => empresa.activo),
    [managerContext, misEmpresas, session?.role]
  );

  // Rol del usuario en la empresa seleccionada (puede ser distinto en cada empresa) y permisos
  // de la matriz de roles. La API valida lo mismo: aca solo se ocultan los botones que no corresponden.
  const rolEmpresaActual = useMemo(() => {
    if (session?.role === 'Admin' || session?.role === 'Gerente') return session.role;
    const empresa = misEmpresas.find((item) => String(item.empresaId) === String(selectedParentEmpresaId));
    return empresa?.rol ?? session?.role ?? '';
  }, [session?.role, misEmpresas, selectedParentEmpresaId]);

  const permisosRol = useMemo(() => ({
    rol: rolEmpresaActual,
    estructura: ['Admin', 'Gerente', 'Encargado'].includes(rolEmpresaActual),
    registroCampo: ['Admin', 'Gerente', 'Encargado', 'EmpleadoCampo'].includes(rolEmpresaActual),
    movimientoGrano: ['Admin', 'Gerente', 'Encargado', 'EmpleadoAdministrativo'].includes(rolEmpresaActual)
  }), [rolEmpresaActual]);
  const selectedParentEmpresa = useMemo(
    () => empresasDisponibles.find((empresa) => String(empresa.empresaId) === String(selectedParentEmpresaId)) ?? null,
    [empresasDisponibles, selectedParentEmpresaId]
  );
  const campaniasDisponibles = useMemo(() => {
    const unique = new Map();
    parentCampanias.forEach((item) => {
      if (!item?.campaniaId || unique.has(item.campaniaId)) return;
      unique.set(item.campaniaId, item);
    });

    return [...unique.values()]
      .filter((campania) => !selectedParentEmpresaId || String(campania.empresaId) === String(selectedParentEmpresaId))
      .sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));
  }, [parentCampanias, selectedParentEmpresaId]);
  const selectedParentCampania = useMemo(
    () => campaniasDisponibles.find((campania) => String(campania.campaniaId) === String(selectedParentCampaniaId)) ?? null,
    [campaniasDisponibles, selectedParentCampaniaId]
  );
  const selectedParentCampaniaCombinaciones = useMemo(
    () => parentCampanias.filter((campania) => String(campania.campaniaId) === String(selectedParentCampaniaId)),
    [parentCampanias, selectedParentCampaniaId]
  );
  const empresaDestinoNuevoLoteId = useMemo(() => (
    selectedParentEmpresaId || (empresasDisponibles.find((empresa) => empresa.esPrincipal)?.empresaId
      ?? empresasDisponibles[0]?.empresaId
      ?? '')
  ), [empresasDisponibles, selectedParentEmpresaId]);
  const activeCampaignsByEmpresa = useMemo(() => {
    const campaigns = new Map();
    const today = new Date();
    const currentStartYear = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
    const currentPeriod = `${currentStartYear}-${currentStartYear + 1}`;

    parentCampanias
      .forEach((item) => {
        if (!item?.campaniaId) return;
        const current = campaigns.get(item.campaniaId) ?? {
          campaniaId: item.campaniaId,
          empresaId: item.empresaId,
          nombre: item.campaniaNombre,
          periodo: item.periodo,
          fechaInicio: item.fechaInicio,
          combinaciones: []
        };
        current.combinaciones.push(item);
        campaigns.set(item.campaniaId, current);
      });

    return [...campaigns.values()]
      .filter((campania) => campania.periodo === currentPeriod && campania.combinaciones.some((item) => item.estado !== 'Finalizado' && lotes.some((lote) => String(lote.loteId) === String(item.loteId) && lote.activo)))
      .reduce((result, campania) => {
        const existing = result.get(String(campania.empresaId));
        if (!existing || new Date(campania.fechaInicio) > new Date(existing.fechaInicio)) {
          result.set(String(campania.empresaId), campania);
        }
        return result;
      }, new Map());
  }, [parentCampanias, lotes]);
  const activeCampaignForNewLote = useMemo(() => (
    activeCampaignsByEmpresa.get(String(empresaDestinoNuevoLoteId)) ?? null
  ), [activeCampaignsByEmpresa, empresaDestinoNuevoLoteId]);
  const parentFilteredLotes = useMemo(() => (
    selectedParentEmpresaId
      ? lotes.filter((lote) => String(lote.empresaId) === String(selectedParentEmpresaId))
      : lotes
  ), [lotes, selectedParentEmpresaId]);

  function authHeaders(extraHeaders = {}) {
    return session?.token
      ? { ...extraHeaders, Authorization: `Bearer ${session.token}` }
      : extraHeaders;
  }

  function handleSidebarToggle() {
    setSidebarCollapsed((current) => !current);
  }


  async function loadUserProfile() {
    if (!session?.token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/perfil`, {
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setUserProfile(data);
      setProfileError('');
    } catch (error) {
      setUserProfile(null);
      setProfileError(error.message.replace(/^"|"$/g, '') || 'No se pudo cargar el perfil.');
    }
  }

  async function handleUpdateProfile(profileForm) {
    if (!session?.token) return;

    setProfileSaving(true);
    setProfileError('');
    setProfileStatus('');
    setProfilePasswordError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/perfil`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(profileForm)
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setUserProfile(data.perfil);
      if (data.login) {
        setSession((current) => current ? {
          ...current,
          name: data.login.nombre,
          role: data.login.rol,
          token: data.login.token,
          usuario: data.login.usuario
        } : current);
      }
      setProfileStatus('Perfil actualizado correctamente.');
    } catch (error) {
      setProfileError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar el perfil.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangeProfilePassword(passwordForm) {
    if (!session?.token) return;

    setProfilePasswordSaving(true);
    setProfileError('');
    setProfileStatus('');
    setProfilePasswordError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/perfil/password`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(passwordForm)
      });

      if (!response.ok) throw new Error(await response.text());

      setProfileStatus('Contrasenia actualizada correctamente.');
      return true;
    } catch (error) {
      const message = error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar la contrasenia.';
      if (message.toLocaleLowerCase('es-AR').includes('contrasenia actual')) {
        setProfilePasswordError(message);
      } else {
        setProfileError(message);
      }
      return false;
    } finally {
      setProfilePasswordSaving(false);
    }
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

  async function loadAdminAccounts(token) {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/cuentas-gerente`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setAdminAccounts(data.map((account) => adminAccountFromApi(account)));
      setAdminError('');
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudieron cargar los accesos.');
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

  async function handleCreateAdminAccount(accountForm) {
    if (!session?.token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/cuentas-gerente`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify(accountForm)
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      const account = adminAccountFromApi(data.cuenta, data.passwordTemporal);
      setAdminAccounts((current) => [account, ...current]);
      setLastGeneratedAccount(account);
      setAdminEnvio(data.envio ?? null);
      setAdminError('');
      return true;
    } catch (error) {
      setAdminEnvio(null);
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudo crear el acceso.');
      return false;
    }
  }

  async function handleResendAdminInvitation(accountId) {
    if (!session?.token) return;

    setAdminResendingId(accountId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/cuentas-gerente/${accountId}/reenviar-invitacion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` }
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      const updatedAccount = adminAccountFromApi(data.cuenta);
      setAdminAccounts((current) =>
        current.map((item) =>
          item.id === updatedAccount.id
            ? { ...updatedAccount, passwordTemporal: item.passwordTemporal ?? null }
            : item
        )
      );
      setLastGeneratedAccount((current) =>
        current?.id === updatedAccount.id
          ? { ...updatedAccount, passwordTemporal: current.passwordTemporal ?? null }
          : current
      );
      setAdminEnvio(data.envio ?? null);
      setAdminError('');
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudo reenviar la invitación.');
    } finally {
      setAdminResendingId(null);
    }
  }

  async function handleRegenerateAdminPassword(accountId) {
    if (!session?.token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/cuentas-gerente/${accountId}/regenerar-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` }
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      const account = adminAccountFromApi(data.cuenta, data.passwordTemporal);
      setAdminAccounts((current) => current.map((item) => (item.id === account.id ? account : item)));
      setLastGeneratedAccount(account);
      setAdminError('');
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudo regenerar la contraseña.');
    }
  }

  async function handleUpdateAdminResponsible(accountId, responsable, correoElectronico = '') {
    if (!session?.token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/cuentas-gerente/${accountId}/responsable`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({ responsable, correoElectronico: correoElectronico.trim() || null })
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      const updatedAccount = adminAccountFromApi(data);

      setAdminAccounts((current) =>
        current.map((item) =>
          item.id === updatedAccount.id
            ? { ...updatedAccount, passwordTemporal: item.passwordTemporal ?? null }
            : item
        )
      );
      setLastGeneratedAccount((current) =>
        current?.id === updatedAccount.id
          ? { ...updatedAccount, passwordTemporal: current.passwordTemporal ?? null }
          : current
      );
      setAdminError('');
      return true;
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar el responsable.');
      return false;
    }
  }

  async function handleToggleAdminAccountStatus(account) {
    if (!session?.token) return;

    const isDisabled = account.estado === 'Deshabilitado';
    const action = isDisabled ? 'habilitar' : 'deshabilitar';

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/cuentas-gerente/${account.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` }
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      const updatedAccount = adminAccountFromApi(data);

      setAdminAccounts((current) =>
        current.map((item) =>
          item.id === updatedAccount.id
            ? { ...updatedAccount, passwordTemporal: action === 'deshabilitar' ? null : item.passwordTemporal ?? null }
            : item
        )
      );
      setLastGeneratedAccount((current) => {
        if (current?.id !== updatedAccount.id) return current;
        return action === 'deshabilitar'
          ? null
          : { ...updatedAccount, passwordTemporal: current.passwordTemporal ?? null };
      });
      setAdminError('');
      return true;
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || `No se pudo ${isDisabled ? 'habilitar' : 'deshabilitar'} el acceso.`);
      return false;
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
    setAdminError('');
    setAdminAccounts([]);
    setLastGeneratedAccount(null);
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
    setUserProfile(null);
    setProfileError('');
    setProfileStatus('');
    setProfileSaving(false);
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

function FloatingWidgets({ accessibilityOpen, textSize, onToggleAccessibility, onCloseAccessibility, onSelectTextSize, botOpen, botEnabled, onOpenBot }) {
  return (
    <div className="floating-widgets" aria-label="Accesos rapidos flotantes">
      <AccessibilityControl
        open={accessibilityOpen}
        textSize={textSize}
        onToggle={onToggleAccessibility}
        onClose={onCloseAccessibility}
        onSelectSize={onSelectTextSize}
      />
      {!botOpen && <button className="bot-button" type="button" aria-label={botEnabled ? 'Abrir AgroBot' : 'Iniciá sesión para usar AgroBot'} aria-expanded={false} disabled={!botEnabled} onClick={onOpenBot}>
        <img src={agroBotMascot} alt="" aria-hidden="true" />
      </button>}
    </div>
  );
}

function LoginPage({ onLogin, error, onJoin }) {
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
    onSubmit({
      ...form,
      grupoGestionCodigo: form.grupoGestionCodigo.trim().toUpperCase(),
      otp: form.otp.trim().toUpperCase()
    });
  }

  const canSubmit = form.nombre.trim()
    && form.apellido.trim()
    && form.telefono.trim()
    && form.correoElectronico.trim()
    && form.grupoGestionCodigo.trim()
    && form.otp.trim()
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


function PasswordRequirements({ requirements, passwordsMatch, repeatTouched }) {
  return (
    <section className="password-requirements" aria-label="Requisitos de contraseña segura">
      <div className="password-requirements-title">
        <ShieldCheck size={18} />
        <strong>Contraseña segura</strong>
      </div>
      <div className="password-requirements-grid">
        {requirements.map((requirement) => (
          <span className={requirement.valid ? 'password-rule password-rule-valid' : 'password-rule'} key={requirement.id}>
            <CheckCircle2 size={16} />
            {requirement.label}
          </span>
        ))}
        <span className={passwordsMatch ? 'password-rule password-rule-valid' : 'password-rule'}>
          <CheckCircle2 size={16} />
          {repeatTouched ? 'Las contraseñas coinciden' : 'Repetir la misma contraseña'}
        </span>
      </div>
    </section>
  );
}
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

function AccessibilityControl({ open, textSize, onToggle, onClose, onSelectSize }) {
  const widgetRef = useRef(null);
  const options = [
    { value: 'small', label: 'A', helper: 'Chica' },
    { value: 'medium', label: 'A', helper: 'Media' },
    { value: 'large', label: 'A', helper: 'Grande' }
  ];

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutsideClick(event) {
      if (!widgetRef.current?.contains(event.target)) {
        onClose();
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose, open]);

  return (
    <div className={`accessibility-widget ${open ? 'accessibility-widget-open' : ''}`} ref={widgetRef}>
      {open && (
        <section className="accessibility-panel" aria-label="Opciones de accesibilidad">
          <div>
            <strong>Accesibilidad</strong>
            <span>Tamaño de texto</span>
          </div>
          <div className="text-size-options">
            {options.map((option) => (
              <button
                className={`text-size-button text-size-button-${option.value} ${textSize === option.value ? 'text-size-button-active' : ''}`}
                type="button"
                key={option.value}
                onClick={() => {
                  onSelectSize(option.value);
                  onClose();
                }}
                aria-pressed={textSize === option.value}
              >
                <span>{option.label}</span>
                <small>{option.helper}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      <button className="accessibility-button" type="button" onClick={onToggle} aria-label="Abrir opciones de accesibilidad">
        <Accessibility size={27} />
      </button>
    </div>
  );
}


function ManagerUsersPage({
  context, error, generatedOtp, copiedKey, loadingOtp, onGenerateOtp, onCopy,
  requests = [], users = [], userSaving, actionStatus, onApproveRequest, onResolveRequest, onToggleUserStatus,
  invitations = [], invitationSaving = '', invitationResult = null, invitationError = '',
  onCreateInvitation, onResendInvitation, onCancelInvitation
}) {
  const [invitationTab, setInvitationTab] = useState('correo');
  const empresas = context?.empresas ?? [];
  const [userFilters, setUserFilters] = useState({
    search: '',
    estado: 'todos',
    desde: '',
    hasta: ''
  });
  const principal = empresas.find((empresa) => empresa.esPrincipal);
  const solicitudesPendientes = requests.length;
  const usuariosHabilitados = users.filter((user) => user.activo).length;
  const usuariosDeshabilitados = users.filter((user) => !user.activo).length;
  const filteredUsers = users.filter((user) => {
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
        <button
          className="green-button add-lote-button"
          type="button"
          onClick={() => {
            setInvitationTab('correo');
            document.getElementById('invitacion-correo')?.focus();
          }}
          disabled={!context?.grupoGestionCodigo}
        >
          <UserPlus size={18} />
          <span>Invitar empleado</span>
        </button>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {actionStatus && <p className="auth-success">{actionStatus}</p>}

      <div className="summary-grid users-summary-grid">
        <SummaryCard icon={<Users size={30} />} label="Grupo de gestión" value={context?.grupoGestionCodigo ?? 'Sin código'} helper="Código que se comparte junto a una OTP" />
        <SummaryCard icon={<Warehouse size={30} />} label="Empresa principal" value={principal?.nombre ?? 'Sin empresa'} helper="Contexto operativo seleccionado" />
        <SummaryCard icon={<ClipboardList size={30} />} label="Solicitudes pendientes" value={solicitudesPendientes} helper="Altas esperando aprobación" />
      </div>

      <div className="manager-users-grid">
        <EmployeeInvitationCard
          context={context}
          tab={invitationTab}
          onTabChange={setInvitationTab}
          invitations={invitations}
          saving={invitationSaving}
          result={invitationResult}
          error={invitationError}
          generatedOtp={generatedOtp}
          loadingOtp={loadingOtp}
          copiedKey={copiedKey}
          onCopy={onCopy}
          onGenerateOtp={onGenerateOtp}
          onCreate={onCreateInvitation}
          onResend={onResendInvitation}
          onCancel={onCancelInvitation}
        />

        <section className="dashboard-card users-card">
          <div className="card-heading">
            <div className="card-heading-icon"><Building2 size={18} /></div>
            <div>
              <h2>Empresas disponibles</h2>
              <p>Al aprobar una solicitud vas a poder asignar acceso a todas o a empresas puntuales.</p>
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
              {empresas.map((empresa) => (
                <article className="company-access-item" key={empresa.empresaId}>
                  <span><Building2 size={18} /></span>
                  <div>
                    <strong>{empresa.nombre}</strong>
                    <small>{empresa.esPrincipal ? 'Empresa principal' : 'Empresa asociada'}</small>
                  </div>
                  <em className={empresa.activo ? 'company-active' : 'company-disabled'}>{empresa.activo ? 'Activa' : 'Deshabilitada'}</em>
                </article>
              ))}
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
                <PendingUserRequestCard key={request.solicitudUsuarioId} request={request} empresas={empresas} onApprove={onApproveRequest} onResolve={onResolveRequest} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="dashboard-card users-card approved-users-card">
        <div className="card-heading">
          <div className="card-heading-icon"><Users size={18} /></div>
          <div>
            <h2>Usuarios del grupo</h2>
            <p>Usuarios aprobados o deshabilitados, con sus accesos por empresa y rol.</p>
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

        {users.length === 0 ? (
          <div className="pending-users-empty-row approved-users-empty-row">
            <Users size={52} strokeWidth={1.8} />
            <strong>Aún no hay usuarios aprobados</strong>
            <span>Cuando apruebes una solicitud, el usuario aparecerá en esta tabla.</span>
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
              <ApprovedUserRow key={user.usuarioId} user={user} saving={userSaving} onToggleStatus={onToggleUserStatus} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function ApprovedUserRow({ user, saving, onToggleStatus, readOnly = false }) {
  const fullName = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.correoElectronico;
  const action = user.activo ? 'deshabilitar' : 'habilitar';
  const isSaving = saving === `${action}-${user.usuarioId}`;

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
    </article>
  );
}

/**
 * Empresas para quien NO es Gerente: solo consulta de las empresas en las que tiene acceso.
 * Crear, editar, deshabilitar o cambiar la principal es exclusivo del Gerente (la API lo valida).
 */
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
  const [accesoATodas, setAccesoATodas] = useState(true);
  const [rolGeneral, setRolGeneral] = useState('EmpleadoCampo');
  const [selectedCompanies, setSelectedCompanies] = useState(() => Object.fromEntries(empresas.map((empresa) => [empresa.empresaId, true])));
  const [companyRoles, setCompanyRoles] = useState(() => Object.fromEntries(empresas.map((empresa) => [empresa.empresaId, 'EmpleadoCampo'])));

  useEffect(() => {
    setSelectedCompanies((current) => Object.fromEntries(empresas.map((empresa) => [empresa.empresaId, current[empresa.empresaId] ?? true])));
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
  context, tab, onTabChange, invitations, saving, result, error,
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
    const ok = await onCreate({ correoElectronico: correo, nombre: form.nombre.trim() || null });
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
function ParentFiltersBar({ children }) {
  return <div className="parent-filters-bar">{children}</div>;
}

function ParentSearchSelect({ label, value, options, placeholder, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const text = normalizeSearchText(query.trim());
    return text
      ? options.filter((option) => normalizeSearchText(option.label).includes(text))
      : options;
  }, [options, query]);

  useEffect(() => {
    function close(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="parent-filter-select" ref={containerRef}>
      <span>{label}</span>
      <button type="button" onClick={() => setOpen((current) => !current)}>
        <strong>{selectedOption?.label || placeholder}</strong>
        <ChevronDown size={17} />
      </button>
      {open && (
        <div className="parent-filter-popover">
          <label className="search-field parent-filter-search">
            <Search size={18} />
            <input data-text-case="preserve" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar ${label.toLowerCase()}...`} autoFocus />
          </label>
          <div className="parent-filter-options">
            {filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={option.value === value ? 'parent-filter-option-active' : ''}
                onClick={() => {
                  onChange(option.value);
                  setQuery('');
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
            {filteredOptions.length === 0 && <em>No hay coincidencias.</em>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;




























