/*
  Utilidades compartidas por la Pantalla Principal (Inicio.jsx) y su Agenda (InicioAgenda.jsx).
*/

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export const numero = (valor, decimales = 0) =>
  Number(valor ?? 0).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

export const toneladas = (kg) => {
  const t = Number(kg ?? 0) / 1000;
  return t.toLocaleString('es-AR', { maximumFractionDigits: Math.abs(t) >= 10 ? 0 : 1 });
};

/** Las fechas DateOnly llegan como "2026-10-03": se leen como fecha local. */
export function fechaLocal(valor) {
  if (!valor) return null;
  const [y, m, d] = String(valor).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fechaCorta(valor) {
  const f = fechaLocal(valor);
  return f ? f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '-';
}

export function haceDias(valor) {
  const f = fechaLocal(valor);
  if (!f) return '';
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy - f) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

export function saludo() {
  const hora = new Date().getHours();
  if (hora < 13) return 'Buen día';
  if (hora < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export async function leerError(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (typeof data === 'string') return data;
    return data?.title || text;
  } catch {
    return text || `Error ${response.status}`;
  }
}

// ---------------------------------------------------------------------------
// Evento de agenda (tarjeta "Próximos 7 días" y panel de Agenda)
// ---------------------------------------------------------------------------

export function EventoAgenda({ evento, onNavigate, compacto = false, mostrarTipo = false }) {
  const fecha = fechaLocal(evento.fecha);
  const esHoy = evento.diasDesdeHoy === 0;
  const clase = evento.grupo === 'Vencidos' ? 'vencido' : esHoy ? 'hoy' : '';
  const dia = esHoy ? 'Hoy' : fecha.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
  const tipoTexto = { Silo: 'Control de silo', Siembra: 'Siembra', Cosecha: 'Cosecha', Distribucion: 'Distribución' }[evento.tipo] ?? evento.tipo;

  return (
    <li className="ini-evento">
      <span className={`ini-dia ${clase}`}>
        <small>{dia}</small>
        <strong>{fecha.getDate()}</strong>
      </span>
      <div className="ini-evento-texto">
        {mostrarTipo && <span className={`ini-tipo ini-tipo-${evento.tipo.toLowerCase()}`}>{tipoTexto}</span>}
        <strong>{evento.titulo}</strong>
        <small>
          {evento.grupo === 'Vencidos' && `Venció ${haceDias(evento.fecha)} · `}
          {evento.grupo === 'EnTransito' && `Salió ${haceDias(evento.fecha)} · `}
          {evento.detalle}
        </small>
      </div>
      {!compacto && (
        <button className="ini-boton-ver" type="button" onClick={() => onNavigate?.(evento.modulo)}>Ver</button>
      )}
    </li>
  );
}
