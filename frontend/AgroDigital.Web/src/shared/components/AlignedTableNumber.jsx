export default function AlignedTableNumber({ value, unit = '', maximumFractionDigits = 2 }) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';

  const [integer, fraction] = number.toLocaleString('es-AR', { maximumFractionDigits }).split(',');
  return <span className="aligned-table-number">
    <span className="aligned-table-number-integer">{integer}</span>
    <span className="aligned-table-number-fraction">{fraction ? `,${fraction}` : ''}</span>
    <span className="aligned-table-number-unit">{unit}</span>
  </span>;
}
