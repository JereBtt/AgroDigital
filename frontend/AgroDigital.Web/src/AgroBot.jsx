import { useEffect, useRef, useState } from 'react';
import { Copy, LoaderCircle, Send, X } from 'lucide-react';
import ReporteriaFormato from './ReporteriaFormato';
import agroBotMascot from './assets/agrobot-mascot.png';
import './agrobot.css';

const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5135';

async function leerError(response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text);
    return json.title || json.detail || (typeof json === 'string' ? json : text);
  } catch { return text || `Error ${response.status}`; }
}

export default function AgroBot({ open, onClose, session, empresaId, empresaNombre, onOpenReporteria }) {
  const [mensajes, setMensajes] = useState([]);
  const [pregunta, setPregunta] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const empresaRef = useRef(empresaId);
  empresaRef.current = empresaId;

  useEffect(() => {
    setMensajes([]);
    setPregunta('');
    setError('');
  }, [empresaId, session?.token]);

  useEffect(() => { if (open) bottomRef.current?.scrollIntoView({ block: 'nearest' }); }, [open, mensajes, loading]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  async function enviar(texto = pregunta) {
    const consulta = texto.trim();
    if (!consulta || loading || !empresaId || !session?.token) return;
    const empresaEnviada = empresaId;
    const history = mensajes.slice(-8).map(item => ({ rol: item.rol, contenido: item.contenido }));
    setMensajes(current => [...current, { rol: 'usuario', contenido: consulta }]);
    setPregunta('');
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/agrobot/consultar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresaId: Number(empresaId), pregunta: consulta, historia: history })
      });
      if (!response.ok) throw new Error(await leerError(response));
      const answer = await response.json();
      if (empresaRef.current !== empresaEnviada) return;
      setMensajes(current => [...current, {
        rol: 'asistente', contenido: answer.respuesta, origen: answer.origen,
        fuente: answer.fuente, promptReporteria: answer.promptReporteria
      }]);
    } catch (cause) {
      if (empresaRef.current === empresaEnviada) setError(cause.message);
    } finally { setLoading(false); }
  }

  async function copiarPrompt(prompt) {
    await navigator.clipboard.writeText(prompt);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <aside className={`agrobot-panel ${open ? 'agrobot-panel-open' : ''}`} aria-label="AgroBot" aria-hidden={!open} inert={!open ? '' : undefined}>
      <div className="agrobot-head">
        <span className="agrobot-mark"><img src={agroBotMascot} alt="" /></span>
        <div><strong>AgroBot</strong><small>Tu asistente en AgroDigital</small></div>
        <button type="button" className="agrobot-close" aria-label="Cerrar AgroBot" onClick={onClose}><X size={21} /></button>
      </div>
      <div className="agrobot-context"><span className="agrobot-live-dot" /> Consultando en <strong>{empresaNombre || 'la empresa seleccionada'}</strong></div>
      <div className="agrobot-messages" role="log" aria-live="polite">
        {mensajes.length === 0 && <div className="agrobot-welcome">
          <span className="agrobot-welcome-icon"><img src={agroBotMascot} alt="" /></span>
          <h2>¿En qué te ayudo?</h2>
          <p>Preguntame cómo usar AgroDigital, consultá un dato puntual o haceme una pregunta general.</p>
          <div className="agrobot-suggestions">
            {['¿Cómo registro una siembra?', '¿En qué zona está el lote Casa Norte?', '¿Qué es el rinde en kg/ha?'].map(text =>
              <button type="button" key={text} onClick={() => enviar(text)}>{text}</button>)}
          </div>
        </div>}
        {mensajes.map((item, index) => <div className={`agrobot-message agrobot-message-${item.rol}`} key={index}>
          {item.rol === 'asistente' && <span className="agrobot-avatar"><img src={agroBotMascot} alt="" /></span>}
          <div className="agrobot-bubble">
            {item.origen && <small className="agrobot-origin">{item.origen === 'sistema' ? 'Datos de AgroDigital' : item.origen === 'general' ? 'Conocimiento general' : item.origen === 'derivacion' ? 'Usar Reportería IA' : item.origen === 'no_disponible' ? 'Información no disponible' : 'Ayuda de AgroDigital'}</small>}
            <ReporteriaFormato contenido={item.contenido} />
            {item.fuente && <small className="agrobot-source">Fuente: {item.fuente.replaceAll('_', ' ')}</small>}
            {item.promptReporteria && <div className="agrobot-prompt">
              <strong>Prompt para Reportería IA</strong>
              <p>{item.promptReporteria}</p>
              <div><button type="button" onClick={() => copiarPrompt(item.promptReporteria)}><Copy size={15} />{copiado ? 'Copiado' : 'Copiar prompt'}</button>
                {onOpenReporteria && <button type="button" onClick={() => onOpenReporteria(item.promptReporteria)}>Abrir Reportería IA</button>}</div>
            </div>}
          </div>
        </div>)}
        {loading && <div className="agrobot-thinking"><LoaderCircle className="spin-icon" size={17} /> AgroBot está pensando…</div>}
        <div ref={bottomRef} />
      </div>
      {error && <p className="agrobot-error" role="alert">{error}</p>}
      <form className="agrobot-composer" onSubmit={event => { event.preventDefault(); enviar(); }}>
        <label htmlFor="agrobot-question">Tu consulta</label>
        <div><textarea ref={inputRef} id="agrobot-question" data-text-case="preserve" value={pregunta} maxLength={1000}
          placeholder="Escribí tu pregunta…" onChange={event => setPregunta(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); enviar(); } }} />
          <button type="submit" aria-label="Enviar consulta" disabled={loading || !pregunta.trim() || !empresaId}><Send size={19} /></button></div>
        <small>Enter para enviar · Shift + Enter para otra línea</small>
      </form>
    </aside>
  );
}
