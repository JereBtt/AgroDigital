const ROLE_LABELS = {
  Gerente: 'Gerente',
  Encargado: 'Encargado',
  EmpleadoCampo: 'Empleado de campo',
  EmpleadoAdministrativo: 'Empleado administrativo'
};

function formatRole(value) {
  return ROLE_LABELS[value] ?? value ?? '-';
}

export { formatRole };
