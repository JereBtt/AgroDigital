function getPasswordRequirements(password) {
  return [
    { id: 'length', label: 'Al menos 8 caracteres', valid: password.length >= 8 },
    { id: 'uppercase', label: 'Una letra mayúscula', valid: /[A-ZÁÉÍÓÚÑ]/.test(password) },
    { id: 'lowercase', label: 'Una letra minúscula', valid: /[a-záéíóúñ]/.test(password) },
    { id: 'number', label: 'Un número', valid: /\d/.test(password) },
    { id: 'symbol', label: 'Un símbolo (!, #, $, etc.)', valid: /[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]/.test(password) }
  ];
}

export { getPasswordRequirements };
