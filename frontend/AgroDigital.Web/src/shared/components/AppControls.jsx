import { useEffect, useMemo, useRef, useState } from 'react';
import { Accessibility, ChevronDown, Search } from 'lucide-react';
import agroBotMascot from '../../assets/agrobot-mascot.png';
import { normalizeSearchText } from '../utils/normalizeSearchText.js';

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

export { FloatingWidgets, ParentFiltersBar, ParentSearchSelect };
