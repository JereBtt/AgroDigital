import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, X } from 'lucide-react';
import { EventoAgenda, fechaLocal, leerError } from './inicioUtils';

/*
  Agenda de la Pantalla Principal (panel lateral, solo lectura).
  GET /api/inicio/agenda?empresaId=&campaniaId=&dias=7|30
  Grupos: Vencidos, En transito y luego una seccion por semana (lunes a domingo).
*/

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';

const TIPOS = [
  { id: 'todos', texto: 'Todos' },
  { id: 'Silo', texto: 'Silos' },
  { id: 'Siembra', texto: 'Siembra' },
  { id: 'Cosecha', texto: 'Cosecha' },
  { id: 'Distribucion', texto: 'Distribución' }
];

function inicioSemana(fecha) {
  const d = new Date(fecha);
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia);
  d.setHours(0, 0, 0, 0);
  return d;
}

const corta = (d) => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }).replace('.', '');

function agrupar(eventos) {
  const grupos = [];
  const vencidos = eventos.filter((e) => e.grupo === 'Vencidos');
  const transito = eventos.filter((e) => e.grupo === 'EnTransito');
  const proximos = eventos.filter((e) => e.grupo === 'Proximos');

  if (vencidos.length) grupos.push({ id: 'vencidos', titulo: 'Vencidos', sub: 'Pendientes de días anteriores', alerta: true, eventos: vencidos });
  if (transito.length) grupos.push({ id: 'transito', titulo: 'En tránsito', sub: 'Camiones sin llegada registrada', eventos: transito });

  const semanaActual = inicioSemana(new Date()).getTime();
  const porSemana = new Map();
  proximos.forEach((e) => {
    const clave = inicioSemana(fechaLocal(e.fecha)).getTime();
    if (!porSemana.has(clave)) porSemana.set(clave, []);
    porSemana.get(clave).push(e);
  });

  [...porSemana.keys()].sort((a, b) => a - b).forEach((clave) => {
    const desde = new Date(clave);
    const hasta = new Date(clave);
    hasta.setDate(hasta.getDate() + 6);
    const semanas = Math.round((clave - semanaActual) / (7 * 86400000));
    const titulo = semanas === 0 ? 'Esta semana' : semanas === 1 ? 'Próxima semana' : `Semana del ${corta(desde)}`;
    grupos.push({ id: String(clave), titulo, sub: `${corta(desde)} – ${corta(hasta)}`, eventos: porSemana.get(clave) });
  });

  return grupos;
}

export default function InicioAgenda({ abierta, onCerrar, headers, empresaId, campaniaId, campaniaNombre, onNavigate }) {
  const [dias, setDias] = useState(30);
  const [tipo, setTipo] = useState('todos');
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const cerrarRef = useRef(null);

  useEffect(() => {
    if (!abierta || !empresaId) return undefined;
    let vigente = true;
    const query = new URLSearchParams({ empresaId, dias: String(dias) });
    if (campaniaId) query.set('campaniaId', campaniaId);

    setCargando(true);
    setError('');
    fetch(`${API_BASE_URL}/api/inicio/agenda?${query}`, { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error(await leerError(r));
        return r.json();
      })
      .then((data) => { if (vigente) setEventos(data?.eventos ?? []); })
      .catch((e) => { if (vigente) setError(e.message || 'No se pudo cargar la agenda.'); })
      .finally(() => { if (vigente) setCargando(false); });

    return () => { vigente = false; };
  }, [abierta, empresaId, campaniaId, dias, headers]);

  // Foco en "Cerrar" al abrir y cierre con Escape.
  useEffect(() => {
    if (!abierta) return undefined;
    cerrarRef.current?.focus();
    const alPresionar = (e) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [abierta, onCerrar]);

  const filtrados = useMemo(() => eventos.filter((e) => tipo === 'todos' || e.tipo === tipo), [eventos, tipo]);
  const grupos = useMemo(() => agrupar(filtrados), [filtrados]);

  if (!abierta) return null;

  function irA(modulo) {
    onCerrar();
    onNavigate?.(modulo);
  }

  // Se dibuja sobre el <body> con un portal: dentro de .content-panel (z-index: 1)
  // el panel quedaria por debajo del encabezado de la app (.top-header, z-index: 10).
  return createPortal(
    <div className="ini-agenda-capa">
      <button className="ini-agenda-fondo" type="button" aria-label="Cerrar agenda" tabIndex={-1} onClick={onCerrar} />
      <aside className="ini-agenda" role="dialog" aria-modal="true" aria-labelledby="ini-agenda-panel-titulo">
        <header className="ini-agenda-cabecera">
          <div className="ini-agenda-titulo">
            <div>
              <h2 id="ini-agenda-panel-titulo">Agenda</h2>
              <p>{campaniaNombre ? `${campaniaNombre} · ` : ''}desde hoy</p>
            </div>
            <button ref={cerrarRef} className="ini-agenda-cerrar" type="button" aria-label="Cerrar agenda" onClick={onCerrar}>
              <X size={18} />
            </button>
          </div>

          <div className="ini-agenda-controles">
            <div className="ini-segmento" role="group" aria-label="Rango de días">
              {[7, 30].map((d) => (
                <button key={d} type="button" className={dias === d ? 'activo' : ''} aria-pressed={dias === d} onClick={() => setDias(d)}>
                  {d} días
                </button>
              ))}
            </div>
            <span className="ini-ayuda">{filtrados.length} {filtrados.length === 1 ? 'evento' : 'eventos'}</span>
          </div>

          <div className="ini-chips" role="group" aria-label="Filtrar por tipo">
            {TIPOS.map((t) => (
              <button key={t.id} type="button" className={tipo === t.id ? 'activo' : ''} aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
                {t.texto}
              </button>
            ))}
          </div>
        </header>

        <div className="ini-agenda-cuerpo">
          {cargando && <p className="ini-vacio"><LoaderCircle className="spin-icon" size={18} /> Cargando agenda…</p>}
          {!cargando && error && <p className="ini-error" role="alert">{error}</p>}
          {!cargando && !error && grupos.length === 0 && (
            <p className="ini-vacio">No hay eventos de este tipo en el período elegido.</p>
          )}
          {!cargando && !error && grupos.map((g) => (
            <section key={g.id} className="ini-agenda-grupo">
              <div className="ini-agenda-grupo-titulo">
                <h3 className={g.alerta ? 'alerta' : ''}>{g.titulo}</h3>
                <span>{g.sub}</span>
              </div>
              <ul className="ini-eventos">
                {g.eventos.map((ev) => (
                  <EventoAgenda key={`${ev.subtipo}-${ev.referenciaId}-${ev.fecha}`} evento={ev} onNavigate={irA} mostrarTipo />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    </div>,
    document.body
  );
}
