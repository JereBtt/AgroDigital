import { formatDate } from '../../shared/utils/formatDate.js';

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

export { adminAccountFromApi };
