function CultivoChip({ value, estado }) {
  const state = estado || 'Sin cultivo';
  const className = [
    'cultivo-chip',
    state === 'Pendiente' ? 'cultivo-chip-pending' : '',
    state === 'Cultivado' ? 'cultivo-chip-active' : '',
    state === 'Cosechado' ? 'cultivo-chip-done' : '',
    state === 'Sin cultivo' ? 'cultivo-chip-empty' : ''
  ].filter(Boolean).join(' ');

  return <span className={className}>{value}</span>;
}

export default CultivoChip;
