import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import agroDigitalCompactLogo from './assets/agrodigital-compact-logo.png';
import agroDigitalLogo from './assets/agrodigital-logo.png';
import profileCardLandscape from './assets/profile-card-landscape.png';
import sidebarLandscapeCollapsed from './assets/sidebar-landscape-collapsed.png';
import sidebarLandscapeExpanded from './assets/sidebar-landscape-expanded.png';
import Silos from './Silos';
import {
  BarChart3,
  Bell,
  Bot,
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
  MoreVertical,
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
const defaultCenter = [-32.0025, -64.0055];

const ARGENTINA_ZONES = {
  'Buenos Aires': ['Azul', 'Bahia Blanca', 'Balcarce', 'Bragado', 'Chacabuco', 'Junin', 'Mar del Plata', 'Pergamino', 'Tandil', 'Tres Arroyos'],
  'Catamarca': ['Andalgala', 'Belen', 'Fiambala', 'San Fernando del Valle de Catamarca', 'Santa Maria', 'Tinogasta'],
  'Chaco': ['Charata', 'General Pinedo', 'Juan Jose Castelli', 'Las Brenas', 'Presidencia Roque Saenz Pena', 'Resistencia'],
  'Chubut': ['Comodoro Rivadavia', 'Esquel', 'Gaiman', 'Puerto Madryn', 'Rawson', 'Trelew'],
  'Ciudad Autonoma de Buenos Aires': ['Ciudad Autonoma de Buenos Aires'],
  'Cordoba': ['Alta Gracia', 'Bell Ville', 'Cordoba', 'Jesus Maria', 'La Falda', 'Los Condores', 'Marcos Juarez', 'Panaholma', 'Rio Cuarto', 'Rio Tercero', 'Villa Maria'],
  'Corrientes': ['Bella Vista', 'Corrientes', 'Curuzu Cuatia', 'Goya', 'Mercedes', 'Paso de los Libres'],
  'Entre Rios': ['Chajari', 'Concordia', 'Gualeguaychu', 'Parana', 'Victoria', 'Villaguay'],
  'Formosa': ['Clorinda', 'El Colorado', 'Formosa', 'Ingeniero Juarez', 'Las Lomitas', 'Pirane'],
  'Jujuy': ['Humahuaca', 'La Quiaca', 'Libertador General San Martin', 'Palpala', 'San Salvador de Jujuy', 'Tilcara'],
  'La Pampa': ['General Acha', 'General Pico', 'Realico', 'Santa Rosa', 'Toay', 'Victorica'],
  'La Rioja': ['Aimogasta', 'Chamical', 'Chilecito', 'La Rioja', 'Villa Union'],
  'Mendoza': ['General Alvear', 'Godoy Cruz', 'Malargue', 'Mendoza', 'San Rafael', 'Tunuyan'],
  'Misiones': ['Eldorado', 'Leandro N. Alem', 'Obera', 'Posadas', 'Puerto Iguazu', 'San Vicente'],
  'Neuquen': ['Centenario', 'Chos Malal', 'Cutral Co', 'Neuquen', 'San Martin de los Andes', 'Zapala'],
  'Rio Negro': ['Bariloche', 'Cipolletti', 'General Roca', 'Rio Colorado', 'Viedma', 'Villa Regina'],
  'Salta': ['Cafayate', 'Metan', 'Oran', 'Rosario de la Frontera', 'Salta', 'Tartagal'],
  'San Juan': ['Caucete', 'Jachal', 'Rawson', 'San Juan', 'San Martin', 'Valle Fertil'],
  'San Luis': ['La Punta', 'La Toma', 'Merlo', 'San Luis', 'Villa Mercedes'],
  'Santa Cruz': ['Caleta Olivia', 'El Calafate', 'Gobernador Gregores', 'Pico Truncado', 'Rio Gallegos'],
  'Santa Fe': ['Arroyo Seco', 'Casilda', 'Rafaela', 'Reconquista', 'Rosario', 'Santa Fe', 'Venado Tuerto'],
  'Santiago del Estero': ['Anatuya', 'Bandera', 'Frias', 'La Banda', 'Quimili', 'Santiago del Estero'],
  'Tierra del Fuego': ['Rio Grande', 'Tolhuin', 'Ushuaia'],
  'Tucuman': ['Aguilares', 'Concepcion', 'Famailla', 'San Miguel de Tucuman', 'Tafi Viejo', 'Yerba Buena']
};

const provinces = Object.keys(ARGENTINA_ZONES);

const emptyForm = {
  nombre: '',
  pais: 'Argentina',
  provincia: 'Cordoba',
  ciudad: 'Los Condores',
  condicion: 'Propio',
  coordenadas: [],
  cerrado: false
};

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function polygonAreaSquareMeters(points) {
  if (points.length < 3) return 0;

  const earthRadius = 6378137;
  const originLat = (points.reduce((sum, point) => sum + point.lat, 0) / points.length * Math.PI) / 180;
  const projected = points.map((point) => ({
    x: earthRadius * (point.lng * Math.PI / 180) * Math.cos(originLat),
    y: earthRadius * (point.lat * Math.PI / 180)
  }));

  const doubleArea = projected.reduce((sum, point, index) => {
    const next = projected[(index + 1) % projected.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);

  return Math.abs(doubleArea / 2);
}

function normalizeSearchText(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}


function formatPersonName(value) {
  return value
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s'-])([a-záéíóúñ])/g, (_, separator, letter) => `${separator}${letter.toLocaleUpperCase('es-AR')}`);
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
function formatHectares(value) {
  return Number(value).toLocaleString('es-AR', {
    maximumFractionDigits: 2
  });
}

function formFromLote(lote) {
  return {
    nombre: lote?.nombre ?? '',
    pais: lote?.pais ?? 'Argentina',
    provincia: lote?.provincia ?? emptyForm.provincia,
    ciudad: lote?.ciudad ?? '',
    condicion: lote?.condicion ?? 'Propio',
    coordenadas: (lote?.coordenadas ?? [])
      .slice()
      .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
      .map((point) => ({
        lat: Number(point.latitud),
        lng: Number(point.longitud)
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    cerrado: (lote?.coordenadas ?? []).length >= 3
  };
}

function lotePayloadFromForm(form, areaHa, areaM2) {
  return {
    nombre: form.nombre,
    pais: form.pais,
    provincia: form.provincia,
    ciudad: form.ciudad,
    condicion: form.condicion,
    hectareas: Number(areaHa.toFixed(4)),
    superficieTotal: Number(areaM2.toFixed(4)),
    coordenadas: form.coordenadas.map((point, index) => ({
      orden: index + 1,
      latitud: Number(point.lat.toFixed(6)),
      longitud: Number(point.lng.toFixed(6))
    }))
  };
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('es-AR');
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
    fechaVencimiento: formatDate(account.fechaVencimiento)
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
  const [copiedKey, setCopiedKey] = useState('');
  const [activeModule, setActiveModule] = useState('lotes');
  const [managerContext, setManagerContext] = useState(null);
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
  const [otpLoading, setOtpLoading] = useState(false);
  const [view, setView] = useState('list');
  const [lotes, setLotes] = useState([]);
  const [selectedLote, setSelectedLote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('Conectando...');
  const [form, setForm] = useState(emptyForm);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [textSize, setTextSize] = useState('small');
  const [availableZones, setAvailableZones] = useState(ARGENTINA_ZONES[emptyForm.provincia] ?? []);
  const [zonesLoading, setZonesLoading] = useState(false);
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
      const response = await fetch(`${API_BASE_URL}/api/manager/equipos/${empresaId}/usuarios`, {
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setManagerTeamUsers((current) => ({ ...current, [empresaId]: data }));
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudieron cargar los usuarios del equipo.');
    } finally {
      setManagerTeamUsersLoading('');
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
      return;
    }

    loadLotes();
  }, [session?.type, session?.token]);


  useEffect(() => {
    if (session?.type === 'manager-demo') {
      loadManagerContext();
      loadManagerRequests();
      loadManagerUsers();
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

  function updateField(field, value) {
    setForm((current) => {
      if (field === 'provincia') {
        return { ...current, provincia: value, ciudad: '' };
      }

      return { ...current, [field]: value };
    });
  }

  const setCoordinates = useCallback((coordenadas, cerrado = false) => {
    setForm((current) => ({
      ...current,
      coordenadas,
      cerrado
    }));
  }, []);

  function goToList() {
    setActiveModule('lotes');
    setView('list');
    setSelectedLote(null);
    setIsMapExpanded(false);
  }

  function startCreate() {
    setActiveModule('lotes');
    setForm(emptyForm);
    setSelectedLote(null);
    setView('create');
  }

  function openLote(lote, nextView) {
    setActiveModule('lotes');
    setSelectedLote(lote);
    setForm(formFromLote(lote));
    setView(nextView);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (form.coordenadas.length < 3 || !form.cerrado) {
      setStatus('Cerra el poligono del lote antes de registrar.');
      return;
    }

    setSaving(true);
    setStatus('Guardando lote...');
    const payload = lotePayloadFromForm(form, areaHa, areaM2);

    try {
      const response = await fetch(`${API_BASE_URL}/api/lotes`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(await response.text());

      setForm(emptyForm);
      goToList();
      await loadLotes();
      setStatus('Lote registrado correctamente');
    } catch (error) {
      setStatus(`No se pudo guardar: ${error.message}`);
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

    if (form.coordenadas.length < 3 || !form.cerrado) {
      setStatus('Cerra el poligono del lote antes de guardar.');
      return;
    }

    setSaving(true);
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
      setStatus(`No se pudo actualizar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }


  async function handleCreateTeam(nombre) {
    if (!session?.token) return;
    setManagerTeamStatus('');
    setManagerTeamError('');
    setManagerTeamSaving('create');

    try {
      const response = await fetch(`${API_BASE_URL}/api/manager/equipos`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ nombre })
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerTeamStatus(data.mensaje ?? 'Equipo creado correctamente.');
      setManagerTeamUsers({});
      await loadManagerContext();
      await loadManagerRequests();
      await loadManagerUsers();
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudo crear el equipo.');
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
      const response = await fetch(`${API_BASE_URL}/api/manager/equipos/${empresaId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ nombre })
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerTeamStatus(data.mensaje ?? 'Equipo actualizado correctamente.');
      setManagerTeamUsers({});
      await loadManagerContext();
      await loadManagerRequests();
      await loadManagerUsers();
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar el equipo.');
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
      const response = await fetch(`${API_BASE_URL}/api/manager/equipos/${empresa.empresaId}/${action}`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerTeamStatus(data.mensaje ?? 'Equipo actualizado correctamente.');
      setManagerTeamUsers({});
      await loadManagerContext();
      await loadManagerRequests();
      await loadManagerUsers();
      await loadLotes();
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar el equipo.');
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
      const response = await fetch(`${API_BASE_URL}/api/manager/equipos/${empresaId}/principal`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setManagerTeamStatus(data.mensaje ?? 'Equipo principal actualizado.');
      await loadManagerContext();
      await loadManagerUsers();
      await loadLotes();
    } catch (error) {
      setManagerTeamError(error.message.replace(/^"|"$/g, '') || 'No se pudo marcar el equipo como principal.');
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
      setActiveModule('lotes');
      setAuthView('login');
      setJoinRequestStatus('');
      setShowManagerWelcome(sessionType === 'manager-onboarding');
      setSession({ type: sessionType, name: data.nombre, role: data.rol, token: data.token, usuario: data.usuario });
    } catch (error) {
      setLoginError(error.message.replace(/^"|"$/g, ''));
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
      setActiveModule('lotes');
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
      setAdminError('');
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudo crear el acceso.');
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

  async function handleUpdateAdminResponsible(accountId, responsable) {
    if (!session?.token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/cuentas-gerente/${accountId}/responsable`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({ responsable })
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
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar el responsable.');
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
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || `No se pudo ${isDisabled ? 'habilitar' : 'deshabilitar'} el acceso.`);
    }
  }

  async function handleCopy(value) {
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    setCopiedKey(value);
    window.setTimeout(() => setCopiedKey((current) => (current === value ? '' : current)), 1400);
  }

  function handleLogout() {
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

  const currentCrumb = activeModule === 'profile' ? 'Perfil' : activeModule === 'users' ? 'Usuarios' : activeModule === 'teams' ? 'Equipos' : {
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
    />
  );

  if (!session) {
    return (
      <main className={`auth-shell text-size-${textSize}`}>
        {authView === 'join' ? (
          <JoinTeamPage
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
      <main className={`auth-shell text-size-${textSize}`}>
        {showManagerWelcome ? (
          <ManagerWelcomePage
            managerName={session.name}
            onContinue={() => setShowManagerWelcome(false)}
            onLogout={handleLogout}
          />
        ) : (
          <ManagerRegistrationPage
            initialName={session.name}
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
      <main className={`admin-shell text-size-${textSize}`}>
        <AdminPanel
          accounts={adminAccounts}
          lastGeneratedAccount={lastGeneratedAccount}
          error={adminError}
          onCreateAccount={handleCreateAdminAccount}
          onRegeneratePassword={handleRegenerateAdminPassword}
          onUpdateResponsible={handleUpdateAdminResponsible}
          onToggleAccountStatus={handleToggleAdminAccountStatus}
          onCopy={handleCopy}
          copiedKey={copiedKey}
          onLogout={handleLogout}
          onOpenDemo={() => {
            setActiveModule('lotes');
            setSession({ type: 'manager-demo', name: session.name || 'Admin AgroDigital', role: 'Admin', token: session.token, usuario: session.usuario });
          }}
        />
        {floatingWidgets}
      </main>
    );
  }

  return (
    <main className={`app-frame ${sidebarCollapsed ? 'sidebar-collapsed' : ''} text-size-${textSize}`}>
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
          <button className={`nav-item ${activeModule === 'users' ? 'nav-item-active' : ''}`} type="button" onClick={() => { setActiveModule('users'); setView('list'); setIsMapExpanded(false); setProfileMenuOpen(false); }}>
            <Users size={23} />
            <span>Usuarios</span>
          </button>
          <button className={`nav-item ${activeModule === 'teams' ? 'nav-item-active' : ''}`} type="button" onClick={() => { setActiveModule('teams'); setView('list'); setIsMapExpanded(false); setProfileMenuOpen(false); }}>
            <Building2 size={23} />
            <span>Equipos</span>
          </button>
          <button className={`nav-item ${activeModule === 'lotes' ? 'nav-item-active' : ''}`} type="button" onClick={goToList}>
            <Compass size={23} />
            <span>Lotes</span>
          </button>
          <button className="nav-item" type="button">
            <CalendarDays size={23} />
            <span>Campañas</span>
          </button>
          <button className="nav-item" type="button">
            <Sprout size={23} />
            <span>Siembras</span>
          </button>
          <button className="nav-item" type="button">
            <MapIcon size={23} />
            <span>Cosechas</span>
          </button>
                    <button className={`nav-item ${activeModule === 'silos' ? 'nav-item-active' : ''}`} type="button" onClick={() => { setActiveModule('silos'); setProfileMenuOpen(false); setIsMapExpanded(false); }}>
            <Warehouse size={23} />
            <span>Silos</span>
          </button>
          <button className="nav-item" type="button">
            <Home size={23} />
            <span>Almacenamiento</span>
          </button>
          <button className="nav-item" type="button">
            <Tractor size={23} />
            <span>Distribución</span>
          </button>
          <button className="nav-item" type="button">
            <BarChart3 size={23} />
            <span>Estadísticas</span>
          </button>
          <button className="nav-item" type="button">
            <Sparkles size={23} />
            <span>Reportería IA</span>
          </button>
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
            <button className="breadcrumb-home" type="button" aria-label="Inicio" onClick={goToList}>
              <Home size={17} />
            </button>
            <button className="breadcrumb-link" type="button" onClick={activeModule === 'lotes' ? goToList : undefined}>
                          {activeModule === 'profile' ? 'Perfil' : activeModule === 'users' ? 'Usuarios' : activeModule === 'teams' ? 'Equipos' : activeModule === 'silos' ? 'Silos' : 'Lotes'}
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
            <button className="icon-button" type="button" aria-label="Notificaciones">
              <Bell size={18} />
            </button>
            <UserProfileMenu
              session={session}
              profile={userProfile}
              open={profileMenuOpen}
              menuRef={userMenuRef}
              onToggle={() => setProfileMenuOpen((current) => !current)}
              onOpenProfile={() => {
                setActiveModule('profile');
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
          />
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
        ) : activeModule === 'silos' ? (
          <Silos session={session} lotes={lotes} />
        ) : view === 'list' ? (
          <LotesList
            lotes={lotes}
            loading={loading}
            onAdd={startCreate}
            onView={(lote) => openLote(lote, 'detail')}
            onEdit={(lote) => openLote(lote, 'edit')}
          />
        ) : view === 'create' ? (
          <LoteCreate
            form={form}
            areaHa={areaHa}
            areaM2={areaM2}
            saving={saving}
            zones={availableZones}
            zonesLoading={zonesLoading}
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
            zones={availableZones}
            zonesLoading={zonesLoading}
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

function FloatingWidgets({ accessibilityOpen, textSize, onToggleAccessibility, onCloseAccessibility, onSelectTextSize }) {
  return (
    <div className="floating-widgets" aria-label="Accesos rapidos flotantes">
      <AccessibilityControl
        open={accessibilityOpen}
        textSize={textSize}
        onToggle={onToggleAccessibility}
        onClose={onCloseAccessibility}
        onSelectSize={onSelectTextSize}
      />
      <button className="bot-button" type="button" aria-label="AgroBot">
        <Bot size={27} />
      </button>
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
          <p>Administrá cuentas, equipos y operaciones desde un entorno seguro y centralizado.</p>
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

function JoinTeamPage({ error, status, onSubmit, onBack }) {
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    correoElectronico: '',
    password: '',
    repetirPassword: '',
    grupoGestionCodigo: '',
    otp: ''
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
            <span>El gerente va a revisar tus datos y definir tus permisos por equipo.</span>
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
            <span>El gerente define después tus permisos por equipo.</span>
          </div>
        </div>

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
              <input value={form.grupoGestionCodigo} onChange={(event) => updateField('grupoGestionCodigo', event.target.value.toUpperCase())} placeholder="GG-WDUAWXZA" required />
            </div>
          </label>
          <label className="auth-field">
            <span>Clave OTP *</span>
            <div>
              <KeyRound size={20} />
              <input value={form.otp} onChange={(event) => updateField('otp', event.target.value.toUpperCase())} placeholder="OTP-ABCD-1234" required />
            </div>
          </label>
        </div>

        <div className="join-form-grid">
          <label className="auth-field manager-password-field">
            <span>Contraseña *</span>
            <div>
              <LockKeyhole size={20} />
              <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete="new-password" placeholder="Mínimo 8 caracteres" required />
              <button className="password-visibility-button" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </label>
          <label className="auth-field manager-password-field">
            <span>Repetir contraseña *</span>
            <div>
              <LockKeyhole size={20} />
              <input type={showRepeatPassword ? 'text' : 'password'} value={form.repetirPassword} onChange={(event) => updateField('repetirPassword', event.target.value)} autoComplete="new-password" placeholder="Repetí la contraseña" required />
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
              definir tu contraseña definitiva y cargar tus primeros equipos o empresas.
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

function ManagerRegistrationPage({ initialName, error, onSubmit, onLogout }) {
  const [form, setForm] = useState({
    nombre: initialName?.split(' ')[0] ?? '',
    apellido: '',
    telefono: '',
    correoElectronico: '',
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
              <p>Cargá tus datos reales, definí tu contraseña y registrá tus primeros equipos o empresas.</p>
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
                  <strong>Empresas o equipos iniciales</strong>
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
                    <span>Equipo {index + 1} *</span>
                    <div>
                      <input value={empresa} onChange={(event) => updateCompany(index, event.target.value)} placeholder="Ej: Agro Los Cóndores" />
                      <button type="button" onClick={() => removeCompany(index)} aria-label={`Quitar equipo ${index + 1}`}>
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
function AdminPanel({
  accounts,
  lastGeneratedAccount,
  error,
  copiedKey,
  onCreateAccount,
  onRegeneratePassword,
  onUpdateResponsible,
  onToggleAccountStatus,
  onCopy,
  onLogout,
  onOpenDemo
}) {
  const [accountForm, setAccountForm] = useState({ responsable: '' });
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [editingResponsible, setEditingResponsible] = useState('');

  function submitAccount(event) {
    event.preventDefault();
    if (!accountForm.responsable.trim()) return;

    onCreateAccount(accountForm);
    setAccountForm({ responsable: '' });
  }

  function startResponsibleEdit(account) {
    setEditingAccountId(account.id);
    setEditingResponsible(account.responsable);
  }

  function cancelResponsibleEdit() {
    setEditingAccountId(null);
    setEditingResponsible('');
  }

  function saveResponsibleEdit(accountId) {
    const responsable = editingResponsible.trim();
    if (!responsable) return;

    onUpdateResponsible(accountId, responsable);
    cancelResponsibleEdit();
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
          <p>Creá credenciales de unico ingreso para responsables que luego completaran su registro.</p>
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
              <p>Ingresá el responsable inicial para generar usuario y contraseña temporal.</p>
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

          <button className="primary-admin-button" type="submit" disabled={!accountForm.responsable.trim()}>
            <PlusCircle size={21} />
            Generar acceso
          </button>
          {error && <p className="auth-error admin-inline-error">{error}</p>}
        </form>

        <section className="generated-card">
          <div className="admin-card-heading">
            <span>
              <KeyRound size={24} />
            </span>
            <div>
              <h2>Credenciales generadas</h2>
              <p>Estos datos se entregan al gerente para su primer ingreso.</p>
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
                El código de grupo de gestion se generara cuando el gerente complete su registro y cargue sus equipos/empresas.
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
                            autoFocus
                          />
                          <div>
                            <button type="button" onClick={() => saveResponsibleEdit(account.id)} disabled={!editingResponsible.trim()}>
                              Guardar
                            </button>
                            <button type="button" onClick={cancelResponsibleEdit}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <strong className="admin-responsible-name">{account.responsable}</strong>
                      )}
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
                          onClick={() => onToggleAccountStatus(account)}
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
    </section>
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


function ManagerUsersPage({ context, error, generatedOtp, copiedKey, loadingOtp, onGenerateOtp, onCopy, requests = [], users = [], userSaving, actionStatus, onApproveRequest, onResolveRequest, onToggleUserStatus }) {
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
      ...(user.equipos ?? []).flatMap((team) => [team.empresaNombre, formatRole(team.rol)])
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
          <p>Gestioná accesos, solicitudes y equipos vinculados a tu grupo de gestión.</p>
        </div>
        <button className="green-button add-lote-button" type="button" onClick={onGenerateOtp} disabled={loadingOtp || !context?.grupoGestionCodigo}>
          {loadingOtp ? <LoaderCircle className="spin-icon" size={18} /> : <KeyRound size={18} />}
          <span>{loadingOtp ? 'Generando...' : 'Generar OTP'}</span>
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
        <section className="dashboard-card users-card invitation-card">
          <div className="card-heading">
            <div className="card-heading-icon"><KeyRound size={18} /></div>
            <div>
              <h2>Invitación segura</h2>
              <p>El empleado se une con el código del grupo y una OTP de un solo uso.</p>
            </div>
          </div>
          <div className="otp-preview-card">
            <div className="otp-value-row">
              <div>
                <span>Código de grupo</span>
                <strong>{context?.grupoGestionCodigo ?? 'Se carga al completar registro'}</strong>
              </div>
              <button className={`otp-copy-button ${copiedKey === context?.grupoGestionCodigo ? 'copy-button-copied' : ''}`} type="button" onClick={() => onCopy(context?.grupoGestionCodigo)} disabled={!context?.grupoGestionCodigo} aria-label="Copiar código de grupo">
                {copiedKey === context?.grupoGestionCodigo ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              </button>
            </div>

            {generatedOtp ? (
              <div className="otp-generated-box">
                <OtpSecretCredential value={generatedOtp.otp} copied={copiedKey === generatedOtp.otp} onCopy={onCopy} />
                <p>Vence el {otpExpiration}. Es de un solo uso y se guarda protegida en la base de datos.</p>
              </div>
            ) : (
              <p>Generá una OTP cuando quieras invitar a un empleado. Se vence a los 7 días y solo puede usarse una vez.</p>
            )}
          </div>
        </section>

        <section className="dashboard-card users-card">
          <div className="card-heading">
            <div className="card-heading-icon"><Building2 size={18} /></div>
            <div>
              <h2>Equipos disponibles</h2>
              <p>Al aprobar una solicitud vas a poder asignar acceso a todos o a equipos puntuales.</p>
            </div>
          </div>
          {empresas.length === 0 ? (
            <div className="users-inline-empty">
              <Building2 size={42} />
              <strong>No hay equipos cargados.</strong>
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
            <p>Cuando un empleado use el código y la OTP, su solicitud aparecerá acá para asignar rol por equipo.</p>
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
            <p>Usuarios aprobados o deshabilitados, con sus accesos por equipo y rol.</p>
          </div>
          <span className="points-count">{usuariosHabilitados} habilitados · {usuariosDeshabilitados} deshabilitados</span>
        </div>

        <div className="approved-users-filters">
          <label className="filter-search-field">
            <Search size={18} />
            <input
              value={userFilters.search}
              onChange={(event) => setUserFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Buscar por nombre, correo, equipo o rol..."
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

function ApprovedUserRow({ user, saving, onToggleStatus }) {
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
          <span className="approved-user-label">Rol por equipo</span>
        </div>
      )}
      <div className="approved-user-teams">
        {(user.equipos ?? []).map((team) => (
          <span className={`team-role-pill ${team.activo ? '' : 'team-role-pill-disabled'}`} key={team.empresaId}>
            <Building2 size={14} />
            <strong>{team.empresaNombre}</strong>
            <em>{formatRole(team.rol)}</em>
          </span>
        ))}
      </div>
      <div className="approved-user-status-actions">
        <em className={user.activo ? 'company-active' : 'company-disabled'}>{user.activo ? 'Habilitado' : 'Deshabilitado'}</em>
        <button
          className={'team-action-button ' + (user.activo ? 'team-danger-action' : 'team-enable-action')}
          type="button"
          onClick={() => onToggleStatus(user)}
          disabled={isSaving}
        >
          {isSaving ? <LoaderCircle className="spin-icon" size={16} /> : user.activo ? <Trash2 size={16} /> : <CheckCircle2 size={16} />}
          {user.activo ? 'Deshabilitar' : 'Habilitar'}
        </button>
      </div>
    </article>
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
          <h1>Equipos</h1>
          <p>Administrá los equipos o empresas del grupo de gestión sin perder trazabilidad histórica.</p>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}
      {status && <p className="auth-success">{status}</p>}

      <div className="summary-grid users-summary-grid">
        <SummaryCard icon={<Building2 size={30} />} label="Equipos registrados" value={empresas.length} helper="Total dentro del grupo de gestión" />
        <SummaryCard icon={<CheckCircle2 size={30} />} label="Equipos activos" value={activeTeams.length} helper="Disponibles para operar y asignar usuarios" />
        <SummaryCard icon={<Building2 size={30} />} label="Equipo principal" value={principal?.nombre ?? 'Sin definir'} helper="Contexto operativo inicial del gerente" />
      </div>

      <div className="manager-teams-grid">
        <section className="dashboard-card users-card team-form-card">
          <div className="card-heading">
            <div className="card-heading-icon"><PlusCircle size={18} /></div>
            <div>
              <h2>Crear equipo</h2>
              <p>Agregá una empresa/equipo para separar lotes, campañas y usuarios.</p>
            </div>
          </div>
          <form className="team-create-form" onSubmit={submitCreate}>
            <label className="admin-field">
              <span>Nombre del equipo *</span>
              <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Ej: Agro Los Cóndores" />
            </label>
            <button className="green-button wide" type="submit" disabled={savingAction === 'create' || !teamName.trim()}>
              {savingAction === 'create' ? <LoaderCircle className="spin-icon" size={18} /> : <PlusCircle size={18} />}
              <span>{savingAction === 'create' ? 'Creando...' : 'Agregar equipo'}</span>
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
            <span><CheckCircle2 size={18} /> El equipo activo puede recibir lotes y usuarios.</span>
            <span><EyeOff size={18} /> El equipo deshabilitado queda fuera de uso operativo.</span>
            <span><Home size={18} /> El principal define el contexto base del gerente.</span>
          </div>
        </section>
      </div>

      <section className="dashboard-card users-card teams-list-card">
        <div className="card-heading">
          <div className="card-heading-icon"><Building2 size={18} /></div>
          <div>
            <h2>Listado de equipos</h2>
            <p>Editá nombres, cambiá el equipo principal o deshabilitá sin borrar registros.</p>
          </div>
          <span className="points-count">{disabledTeams.length} deshabilitados</span>
        </div>

        {empresas.length === 0 ? (
          <div className="pending-users-empty-row teams-empty-row">
            <Building2 size={52} strokeWidth={1.8} />
            <strong>Aún no hay equipos cargados</strong>
            <span>Creá el primer equipo para empezar a separar la operación por empresa.</span>
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
                        <small>{empresa.esPrincipal ? 'Equipo principal del grupo' : 'Equipo asociado'}</small>
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
        <span className="team-users-loading"><LoaderCircle className="spin-icon" size={18} /> Cargando usuarios del equipo...</span>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="team-users-panel team-users-panel-empty">
        <Users size={34} />
        <strong>Este equipo todavía no tiene usuarios vinculados</strong>
      </div>
    );
  }

  return (
    <div className="team-users-panel">
      {users.map((user) => {
        const teamRole = user.equipos?.[0]?.rol ?? user.rolGeneral;
        const accessActive = user.activo && (user.equipos?.[0]?.activo ?? true);
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
            <span>Acceso a todos los equipos</span>
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
function LotesList({ lotes, loading, onAdd, onView, onEdit }) {
  const [query, setQuery] = useState('');
  const [conditionFilter, setConditionFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');

  const provinceOptions = useMemo(() => [...new Set(lotes.map((lote) => lote.provincia).filter(Boolean))], [lotes]);
  const zoneOptions = useMemo(() => [...new Set(lotes.map((lote) => lote.ciudad).filter(Boolean))], [lotes]);
  const summary = useMemo(() => ({
    total: lotes.length,
    hectareasPropias: lotes
      .filter((lote) => lote.condicion === 'Propio')
      .reduce((sum, lote) => sum + Number(lote.hectareas ?? 0), 0),
    hectareasAlquiladas: lotes
      .filter((lote) => lote.condicion === 'Alquilado')
      .reduce((sum, lote) => sum + Number(lote.hectareas ?? 0), 0)
  }), [lotes]);
  const filteredLotes = useMemo(() => lotes.filter((lote) => {
    const matchesQuery = normalizeSearchText(lote.nombre).includes(normalizeSearchText(query.trim()));
    const matchesCondition = !conditionFilter || lote.condicion === conditionFilter;
    const matchesZone = !zoneFilter || lote.ciudad === zoneFilter;
    const matchesProvince = !provinceFilter || lote.provincia === provinceFilter;
    return matchesQuery && matchesCondition && matchesZone && matchesProvince;
  }), [conditionFilter, lotes, provinceFilter, query, zoneFilter]);

  function clearFilters() {
    setQuery('');
    setConditionFilter('');
    setZoneFilter('');
    setProvinceFilter('');
  }

  return (
    <section className="content-panel list-panel">
      <div className="page-heading">
        <div>
          <h1>Lotes</h1>
          <p>Gestiona y consulta todos los lotes de tu operacion.</p>
        </div>
        <button className="green-button add-lote-button" type="button" onClick={onAdd}>
          <PlusCircle size={18} />
          <span>Registrar lote</span>
        </button>
      </div>

      <div className="summary-grid">
        <SummaryCard icon={<MapIcon size={30} />} label="Total de lotes" value={summary.total} helper="Lotes registrados en el sistema" />
        <SummaryCard icon={<Home size={30} />} label="Hectareas propias" value={`${formatHectares(summary.hectareasPropias)} ha`} helper="Superficie total con condicion propio" />
        <SummaryCard icon={<Handshake size={30} />} label="Hectareas alquiladas" value={`${formatHectares(summary.hectareasAlquiladas)} ha`} helper="Superficie total con condicion alquilado" />
      </div>

      <div className="filters-card">
        <label className="search-field">
          <Search size={21} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre de lote..." />
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
        <button className="soft-filter-button" type="button">
          <Filter size={17} />
          <span>Mas filtros</span>
        </button>
        <button className="clear-button" type="button" onClick={clearFilters}>
          <RotateCcw size={17} />
          <span>Limpiar</span>
        </button>
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
          actionLabel="Registrar lote"
          onAction={onAdd}
        />
      ) : filteredLotes.length === 0 ? (
        <EmptyState
          icon={<Search size={92} strokeWidth={1.8} />}
          title="No encontramos lotes con esos filtros"
          description="Proba limpiar la busqueda para volver a ver los registros disponibles."
          actionLabel="Limpiar filtros"
          actionIcon={<RotateCcw size={18} />}
          onAction={clearFilters}
          variant="compact"
        />
      ) : (
        <>
          <div className="table-shell dashboard-card">
            <table className="lotes-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Nombre</th>
                  <th>Pais</th>
                  <th>Provincia</th>
                  <th>Zona</th>
                  <th>Condicion</th>
                  <th>Hectareas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredLotes.map((lote) => (
                  <tr key={lote.loteId}>
                    <td className="lote-icon-cell">
                      <span className="lote-row-icon"><Leaf size={22} /></span>
                    </td>
                    <td>{lote.nombre}</td>
                    <td>{lote.pais}</td>
                    <td>{lote.provincia}</td>
                    <td>{lote.ciudad}</td>
                    <td>
                      <span className={`condition-chip ${lote.condicion === 'Alquilado' ? 'condition-chip-rented' : ''}`}>
                        {lote.condicion === 'Alquilado' ? <Handshake size={14} /> : <Home size={14} />}
                        {lote.condicion}
                      </span>
                    </td>
                    <td>{Number(lote.hectareas).toLocaleString('es-AR', { maximumFractionDigits: 2 })} ha</td>
                    <td className="actions-cell">
                      <button type="button" aria-label={`Ver ${lote.nombre}`} onClick={() => onView(lote)}><Eye size={18} /></button>
                      <button type="button" aria-label={`Editar ${lote.nombre}`} onClick={() => onEdit(lote)}><Edit size={18} /></button>
                      <button type="button" aria-label={`Mas acciones para ${lote.nombre}`}><MoreVertical size={18} /></button>
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
            <span>Mostrando 1 a {filteredLotes.length} de {lotes.length} lotes</span>
            <div className="pagination">
              <button type="button" disabled>{'<'}</button>
              <strong>1</strong>
              <button type="button" disabled>{'>'}</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ icon, label, value, helper }) {
  return (
    <article className="summary-card">
      <div className="summary-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <p>{helper}</p>
    </article>
  );
}

function EmptyState({ icon, title, description, actionLabel, actionIcon, onAction, variant = 'default' }) {
  return (
    <section className={`empty-state dashboard-card empty-state-${variant}`}>
      <div className="empty-state-icon">
        {icon}
      </div>
      <div className="empty-state-copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel && (
        <button className="green-button empty-state-action" type="button" onClick={onAction}>
          {actionIcon ?? <PlusCircle size={18} />}
          <span>{actionLabel}</span>
        </button>
      )}
    </section>
  );
}

function LoteCreate({
  form,
  areaHa,
  areaM2,
  saving,
  zones,
  zonesLoading,
  onCancel,
  onSubmit,
  onFieldChange,
  onCoordinatesChange,
  onMapExpandedChange
}) {
  function deleteCoordinate(indexToDelete) {
    const updatedPoints = form.coordenadas.filter((_, index) => index !== indexToDelete);
    onCoordinatesChange(updatedPoints, form.cerrado && updatedPoints.length >= 3);
  }

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading">
        <div>
          <h1>Registrar Lote</h1>
          <p>Define la informacion general y marca el poligono del lote en el mapa.</p>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        <div className="create-form-card dashboard-card">
          <div className="create-grid">
          <RequiredInput label="Nombre del lote" value={form.nombre} onChange={(value) => onFieldChange('nombre', value)} />
          <SearchableDropdown label="Pais" value={form.pais} onChange={(value) => onFieldChange('pais', value)} options={['Argentina']} />
          <SearchableDropdown label="Provincia" value={form.provincia} onChange={(value) => onFieldChange('provincia', value)} options={provinces} />
          <SearchableDropdown
            label="Zona"
            value={form.ciudad}
            onChange={(value) => onFieldChange('ciudad', value)}
            options={zones}
            placeholder="Buscar ciudad, pueblo o zona"
            loading={zonesLoading}
          />
          <SearchableDropdown label="Condicion" value={form.condicion} onChange={(value) => onFieldChange('condicion', value)} options={['Propio', 'Alquilado']} searchable={false} />
          </div>
        </div>

        <div className="lote-editor-grid">
          <section className="map-card dashboard-card">
            <div className="card-heading">
              <div className="card-heading-icon">
                <MapIcon size={18} />
              </div>
              <div>
                <h2>Mapa del lote</h2>
                <p>Marca los vertices del poligono en el mapa.</p>
              </div>
            </div>

            <PolygonMap
              points={form.coordenadas}
              closed={form.cerrado}
              areaHa={areaHa}
              areaM2={areaM2}
              onChange={onCoordinatesChange}
              onExpandedChange={onMapExpandedChange}
            />

            <div className="area-grid">
              <label>
                Hectareas calculadas
                <input value={areaHa ? `${areaHa.toFixed(4)} ha` : ''} readOnly />
              </label>
              <label>
                Superficie total calculada
                <input value={areaM2 ? `${areaM2.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m2` : ''} readOnly />
              </label>
            </div>

            <div className="form-actions">
              <button className="green-button wide" disabled={saving} type="submit">
                <CheckCircle2 size={18} />
                <span>{saving ? 'Registrando...' : 'Registrar'}</span>
              </button>
              <button className="clear-button wide" type="button" onClick={onCancel}>
                <span>Cancelar</span>
              </button>
            </div>
          </section>

          <section className="points-card dashboard-card">
            <div className="card-heading points-card-heading">
              <div className="card-heading-icon">
                <Leaf size={18} />
              </div>
              <div>
                <h2>Puntos marcados</h2>
                <p>Coordenadas de los vertices del poligono.</p>
              </div>
              <span className="points-count">{form.coordenadas.length} puntos</span>
            </div>

            {form.coordenadas.length === 0 ? (
              <MapTutorial />
            ) : (
              <>
                <div className="scroll-area">
                  {form.coordenadas.map((point, index) => (
                    <div className="corner-card" key={`${point.lat}-${point.lng}-${index}`}>
                      <div className="corner-card-header">
                        <span className="point-number">{index + 1}</span>
                        <strong>Esquina {index + 1}</strong>
                        <button type="button" onClick={() => deleteCoordinate(index)} aria-label={`Eliminar esquina ${index + 1}`}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="corner-grid">
                        <label>
                          Latitud
                          <input value={point.lat.toFixed(6)} readOnly />
                        </label>
                        <label>
                          Longitud
                          <input value={point.lng.toFixed(6)} readOnly />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="map-note">
                  <CheckCircle2 size={17} />
                  <span>Hace clic en el mapa para agregar vertices. Se recomienda marcar el lote en sentido horario o antihorario.</span>
                </div>
              </>
            )}
          </section>
        </div>
      </form>
    </section>
  );
}

function LoteDetailEdit({
  mode,
  lote,
  form,
  areaHa,
  areaM2,
  saving,
  zones,
  zonesLoading,
  onBack,
  onEdit,
  onSubmit,
  onFieldChange,
  onCoordinatesChange,
  onMapExpandedChange
}) {
  const isDetail = mode === 'detail';

  function deleteCoordinate(indexToDelete) {
    const updatedPoints = form.coordenadas.filter((_, index) => index !== indexToDelete);
    onCoordinatesChange(updatedPoints, form.cerrado && updatedPoints.length >= 3);
  }

  if (!lote) {
    return (
      <section className="content-panel">
        <EmptyState
          icon={<Leaf size={96} strokeWidth={1.8} />}
          title="No hay un lote seleccionado"
          description="Volve al listado y elegi un lote para ver su detalle o editarlo."
          actionLabel="Volver a lotes"
          actionIcon={<ChevronDown size={18} />}
          onAction={onBack}
          variant="compact"
        />
      </section>
    );
  }

  return (
    <section className="content-panel create-panel">
      <div className="page-heading create-heading detail-heading">
        <div>
          <h1>{isDetail ? `Detalle ${form.nombre}` : `Editar ${form.nombre}`}</h1>
          <p>{isDetail ? 'Consulta la informacion general, superficie y vertices registrados para este lote.' : 'Actualiza la informacion general y ajusta el poligono del lote en el mapa.'}</p>
        </div>
        {isDetail && (
          <button className="green-button add-lote-button" type="button" onClick={onEdit}>
            <Edit size={18} />
            <span>Editar lote</span>
          </button>
        )}
      </div>

      <form onSubmit={onSubmit}>
        <div className="create-form-card dashboard-card detail-form-card">
          <div className="create-grid">
            {isDetail ? (
              <>
                <ReadOnlyField label="Nombre del lote" value={form.nombre} />
                <ReadOnlyField label="Pais" value={form.pais} />
                <ReadOnlyField label="Provincia" value={form.provincia} />
                <ReadOnlyField label="Zona" value={form.ciudad} />
                <ReadOnlyField label="Condicion" value={form.condicion} />
              </>
            ) : (
              <>
                <RequiredInput label="Nombre del lote" value={form.nombre} onChange={(value) => onFieldChange('nombre', value)} />
                <SearchableDropdown label="Pais" value={form.pais} onChange={(value) => onFieldChange('pais', value)} options={['Argentina']} />
                <SearchableDropdown label="Provincia" value={form.provincia} onChange={(value) => onFieldChange('provincia', value)} options={provinces} />
                <SearchableDropdown
                  label="Zona"
                  value={form.ciudad}
                  onChange={(value) => onFieldChange('ciudad', value)}
                  options={zones}
                  placeholder="Buscar ciudad, pueblo o zona"
                  loading={zonesLoading}
                />
                <SearchableDropdown label="Condicion" value={form.condicion} onChange={(value) => onFieldChange('condicion', value)} options={['Propio', 'Alquilado']} searchable={false} />
              </>
            )}
          </div>
        </div>

        <div className="lote-editor-grid">
          <section className="map-card dashboard-card">
            <div className="card-heading">
              <div className="card-heading-icon">
                <MapIcon size={18} />
              </div>
              <div>
                <h2>Mapa del lote</h2>
                <p>{isDetail ? 'Visualiza el poligono registrado del lote.' : 'Move vertices o agrega nuevas esquinas si necesitas corregir el lote.'}</p>
              </div>
            </div>

            <PolygonMap
              points={form.coordenadas}
              closed={form.cerrado}
              areaHa={areaHa}
              areaM2={areaM2}
              onChange={onCoordinatesChange}
              onExpandedChange={onMapExpandedChange}
              readOnly={isDetail}
            />

            <div className="area-grid">
              <label>
                Hectareas calculadas
                <input value={areaHa ? `${areaHa.toFixed(4)} ha` : ''} readOnly />
              </label>
              <label>
                Superficie total calculada
                <input value={areaM2 ? `${areaM2.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m2` : ''} readOnly />
              </label>
            </div>

            <div className="form-actions">
              {isDetail ? (
                <button className="back-button detail-back-button" type="button" onClick={onBack}>
                  <ChevronDown size={17} />
                  <span>Volver</span>
                </button>
              ) : (
                <>
                  <button className="green-button wide" disabled={saving} type="submit">
                    <CheckCircle2 size={18} />
                    <span>{saving ? 'Guardando...' : 'Guardar cambios'}</span>
                  </button>
                  <button className="clear-button wide" type="button" onClick={onBack}>
                    <span>Cancelar</span>
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="points-card dashboard-card">
            <div className="card-heading points-card-heading">
              <div className="card-heading-icon">
                <Leaf size={18} />
              </div>
              <div>
                <h2>Puntos marcados</h2>
                <p>Coordenadas de los vertices del poligono.</p>
              </div>
              <span className="points-count">{form.coordenadas.length} puntos</span>
            </div>

            {form.coordenadas.length === 0 ? (
              <MapTutorial />
            ) : (
              <>
                <div className="scroll-area">
                  {form.coordenadas.map((point, index) => (
                    <div className="corner-card" key={`${point.lat}-${point.lng}-${index}`}>
                      <div className="corner-card-header">
                        <span className="point-number">{index + 1}</span>
                        <strong>Esquina {index + 1}</strong>
                        {!isDetail && (
                          <button type="button" onClick={() => deleteCoordinate(index)} aria-label={`Eliminar esquina ${index + 1}`}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="corner-grid">
                        <label>
                          Latitud
                          <input value={point.lat.toFixed(6)} readOnly />
                        </label>
                        <label>
                          Longitud
                          <input value={point.lng.toFixed(6)} readOnly />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="map-note">
                  <CheckCircle2 size={17} />
                  <span>{isDetail ? 'Estos puntos forman el perimetro registrado del lote.' : 'Hace clic en el mapa para agregar vertices. Se recomienda marcar el lote en sentido horario o antihorario.'}</span>
                </div>
              </>
            )}
          </section>
        </div>
      </form>
    </section>
  );
}

function MapTutorial() {
  return (
    <div className="map-tutorial">
      <div className="tutorial-title">
        <span>
          <MapIcon size={26} />
        </span>
        <strong>Delimita tu lote en el mapa</strong>
      </div>
      <p>Sigue estos pasos para dibujar el perimetro de tu lote:</p>
      <div className="tutorial-steps">
        <div className="tutorial-step">
          <span>1</span>
          <MousePointerClick className="tutorial-step-icon" size={27} />
          <div>
            <strong>Haz clic en el mapa para colocar el primer punto.</strong>
            <p>Ese sera el inicio del perimetro.</p>
          </div>
        </div>
        <div className="tutorial-step">
          <span>2</span>
          <Route className="tutorial-step-icon" size={27} />
          <div>
            <strong>Continua haciendo clic en cada esquina del lote.</strong>
            <p>Los puntos se uniran con lineas y podras moverlos si hace falta.</p>
          </div>
        </div>
        <div className="tutorial-step">
          <span>3</span>
          <CheckCircle2 className="tutorial-step-icon" size={27} />
          <div>
            <strong>Haz clic en el primer punto para cerrar el lote.</strong>
            <p>El area se calculara automaticamente.</p>
          </div>
        </div>
      </div>
      <div className="tutorial-tip">
        <Lightbulb size={22} />
        <div>
          <strong>Consejo util</strong>
          <p>Puedes acercar o alejar el mapa con los botones + y - para ubicar mejor tu lote.</p>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <label className="field read-only-field">
      <span>{label}</span>
      <input value={value} readOnly />
    </label>
  );
}

function RequiredInput({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label} <b>*</b></span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required />
    </label>
  );
}

function RequiredSelect({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label} <b>*</b></span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SearchableDropdown({ label, value, onChange, options, placeholder = 'Buscar...', loading = false, searchable = true }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef(null);
  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const normalizedQuery = normalizeSearchText(query.trim());
    if (!normalizedQuery) return options;
    return options.filter((option) => normalizeSearchText(option).includes(normalizedQuery));
  }, [options, query, searchable]);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  function chooseOption(option) {
    onChange(option);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="field dropdown-field" ref={wrapperRef}>
      <span>{label} <b>*</b></span>
      <button className="dropdown-button" type="button" onClick={() => setOpen((current) => !current)}>
        <span>{value || `Seleccionar ${label.toLowerCase()}`}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="dropdown-menu">
          {searchable && (
            <input
              className="dropdown-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              autoFocus
            />
          )}
          <div className="dropdown-options">
            {loading && (
              <p className="dropdown-empty">Cargando localidades...</p>
            )}
            {!loading && filteredOptions.length === 0 && (
              <p className="dropdown-empty">Sin resultados.</p>
            )}
            {!loading && filteredOptions.map((option) => (
              <button
                className={`dropdown-option ${option === value ? 'dropdown-option-selected' : ''}`}
                type="button"
                key={option}
                onClick={() => chooseOption(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PolygonMap({ points, closed, areaHa, areaM2, onChange, onExpandedChange, readOnly = false }) {
  const [expanded, setExpanded] = useState(false);
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(L.layerGroup());
  const baseLayersRef = useRef({});
  const pointsRef = useRef(points);
  const closedRef = useRef(closed);
  const readOnlyRef = useRef(readOnly);
  const initialFitDoneRef = useRef(false);

  useEffect(() => {
    pointsRef.current = points;
    closedRef.current = closed;
    readOnlyRef.current = readOnly;
    renderLayers();
    fitInitialBounds();
  }, [points, closed, readOnly]);

  useEffect(() => {
    onExpandedChange?.(expanded);
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    if (expanded) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }

    if (expanded && mapRef.current && baseLayersRef.current.calles) {
      const map = mapRef.current;
      Object.values(baseLayersRef.current).forEach((layer) => {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      });
      baseLayersRef.current.calles.addTo(map);
      map.setMaxZoom(22);
      map.invalidateSize();
    }

    setTimeout(() => mapRef.current?.invalidateSize(), 120);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [expanded, onExpandedChange]);

  useEffect(() => () => onExpandedChange?.(false), [onExpandedChange]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;

    const map = L.map(mapNodeRef.current, {
      center: defaultCenter,
      zoom: 16,
      minZoom: 4,
      maxZoom: 22,
      zoomControl: true,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 42
    });

    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: '© OpenStreetMap'
    });

    const sateliteLimpio = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 17,
      attribution: 'Tiles © Esri'
    });

    const sateliteConEtiquetas = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 17,
      attribution: 'Tiles © Esri'
    });

    const etiquetas = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 17,
      attribution: 'Labels © Esri'
    });

    const hibrido = L.layerGroup([sateliteConEtiquetas, etiquetas]).addTo(map);
    map.setMaxZoom(17);
    baseLayersRef.current = {
      calles,
      hibrido,
      sateliteLimpio
    };

    const baseLayers = {
      'Calles y limites': calles,
      'Satelite con nombres': hibrido,
      'Satelite limpio': sateliteLimpio
    };

    L.control.layers(baseLayers, {}, { position: 'topright', collapsed: false }).addTo(map);

    map.on('baselayerchange', (event) => {
      const isSatellite = event.name.includes('Satelite');
      map.setMaxZoom(isSatellite ? 17 : 22);
      if (isSatellite && map.getZoom() > 17) {
        map.setZoom(17);
      }
    });

    layerRef.current.addTo(map);
    map.on('click', (event) => {
      if (readOnlyRef.current) return;

      const currentPoints = pointsRef.current;
      if (closedRef.current) return;

      if (currentPoints.length >= 3 && distanceMeters(event.latlng, currentPoints[0]) < 18) {
        onChange(currentPoints, true);
        return;
      }

      onChange([...currentPoints, event.latlng], false);
    });

    mapRef.current = map;
    renderLayers();
    setTimeout(() => {
      map.invalidateSize();
      fitInitialBounds();
    }, 0);
    setTimeout(() => {
      map.invalidateSize();
      fitInitialBounds();
    }, 180);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onChange]);

  function renderLayers() {
    if (!mapRef.current) return;

    layerRef.current.clearLayers();

    if (points.length >= 2) {
      L.polyline(points, { color: '#df3b30', weight: 2, opacity: 0.95 }).addTo(layerRef.current);
    }

    if (closed && points.length >= 3) {
      L.polygon(points, {
        color: '#df3b30',
        weight: 2,
        fillColor: '#1c8c3a',
        fillOpacity: 0.18
      }).addTo(layerRef.current);
    }

    points.forEach((point, index) => {
      const marker = L.marker(point, {
        draggable: !readOnly,
        icon: L.divIcon({
          className: `corner-marker ${index === 0 ? 'corner-marker-first' : ''}`,
          html: `<span>${index + 1}</span>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      }).addTo(layerRef.current);

      marker.on('dragend', (event) => {
        if (readOnly) return;

        const movedPoint = event.target.getLatLng();
        const updatedPoints = points.map((currentPoint, currentIndex) =>
          currentIndex === index ? movedPoint : currentPoint
        );
        onChange(updatedPoints, closed);
      });

      if (!readOnly && index === 0 && points.length >= 3 && !closed) {
        marker.on('click', () => onChange(points, true));
        marker.bindTooltip('Cerrar lote', { permanent: false });
      }
    });

  }

  function fitInitialBounds() {
    if (!mapRef.current || initialFitDoneRef.current || pointsRef.current.length === 0) return;

    initialFitDoneRef.current = true;

    window.setTimeout(() => {
      if (!mapRef.current || pointsRef.current.length === 0) return;

      mapRef.current.invalidateSize();
      const bounds = L.latLngBounds(pointsRef.current);
      if (!bounds.isValid()) return;

      if (pointsRef.current.length === 1) {
        mapRef.current.setView(pointsRef.current[0], 17, { animate: false });
        return;
      }

      mapRef.current.fitBounds(bounds.pad(0.2), {
        animate: false,
        maxZoom: 17
      });
    }, 90);
  }

  function resetMap() {
    onChange([], false);
    initialFitDoneRef.current = false;
  }

  function deletePoint(indexToDelete) {
    const updatedPoints = points.filter((_, index) => index !== indexToDelete);
    onChange(updatedPoints, closed && updatedPoints.length >= 3);
  }

  return (
    <div className={`map-box ${expanded ? 'map-box-expanded' : ''} ${readOnly ? 'map-box-readonly' : ''}`}>
      <div ref={mapNodeRef} className="map-canvas" />
      <div className="map-help">
        <MapPin size={24} />
        <span>
          <strong>{readOnly ? 'Poligono del lote.' : closed ? 'Poligono cerrado.' : 'Marca las esquinas del lote.'}</strong>
          {readOnly ? ' Consulta los vertices registrados.' : closed ? ' Podes mover los puntos.' : ' Toca el primer punto para cerrar.'}
        </span>
      </div>
      <button className="map-expand" type="button" onClick={() => setExpanded((current) => !current)}>
        {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        <span>{expanded ? 'Contraer' : 'Expandir'}</span>
      </button>
      {!readOnly && (
        <button className="map-reset" type="button" onClick={resetMap}>
          <Wand2 size={17} />
          <span>Limpiar puntos</span>
        </button>
      )}
      {expanded && (
        <div className="expanded-coordinates">
          <div className="expanded-coordinates-header">
            <strong>Coordenadas</strong>
            <span>{points.length} puntos</span>
          </div>
          {closed && points.length >= 3 && (
            <div className="expanded-area">
              <div>
                <small>Hectareas</small>
                <strong>{areaHa.toFixed(4)}</strong>
              </div>
              <div>
                <small>Superficie</small>
                <strong>{areaM2.toFixed(2)} m2</strong>
              </div>
            </div>
          )}
          {points.length === 0 && (
            <p className="expanded-empty">Marca las esquinas del lote sobre el mapa.</p>
          )}
          <div className="expanded-coordinate-list">
            {points.map((point, index) => (
              <div className="expanded-coordinate-row" key={`${point.lat}-${point.lng}-${index}`}>
                <span className="point-number">{index + 1}</span>
                <div>
                  <small>Latitud</small>
                  <strong>{point.lat.toFixed(6)}</strong>
                </div>
                <div>
                  <small>Longitud</small>
                  <strong>{point.lng.toFixed(6)}</strong>
                </div>
                {!readOnly && (
                  <button type="button" onClick={() => deletePoint(index)} aria-label={`Eliminar punto ${index + 1}`}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;




























