import { useState } from 'react';
import { adminAccountFromApi } from './adminAccount.js';

export default function useAdminAccounts({ session, apiBaseUrl }) {
  const API_BASE_URL = apiBaseUrl;
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [lastGeneratedAccount, setLastGeneratedAccount] = useState(null);
  const [adminError, setAdminError] = useState('');
  const [adminEnvio, setAdminEnvio] = useState(null);
  const [adminResendingId, setAdminResendingId] = useState(null);

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
      setAdminEnvio(data.envio ?? null);
      setAdminError('');
      return true;
    } catch (error) {
      setAdminEnvio(null);
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudo crear el acceso.');
      return false;
    }
  }

  async function handleResendAdminInvitation(accountId) {
    if (!session?.token) return;

    setAdminResendingId(accountId);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/cuentas-gerente/${accountId}/reenviar-invitacion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` }
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      const updatedAccount = adminAccountFromApi(data.cuenta);
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
      setAdminEnvio(data.envio ?? null);
      setAdminError('');
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudo reenviar la invitación.');
    } finally {
      setAdminResendingId(null);
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

  async function handleUpdateAdminResponsible(accountId, responsable, correoElectronico = '') {
    if (!session?.token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/cuentas-gerente/${accountId}/responsable`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        body: JSON.stringify({ responsable, correoElectronico: correoElectronico.trim() || null })
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
      return true;
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar el responsable.');
      return false;
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
      return true;
    } catch (error) {
      setAdminError(error.message.replace(/^"|"$/g, '') || `No se pudo ${isDisabled ? 'habilitar' : 'deshabilitar'} el acceso.`);
      return false;
    }
  }
  function resetAdminAccounts() {
    setAdminError('');
    setAdminAccounts([]);
    setLastGeneratedAccount(null);
  }

  return {
    adminAccounts, lastGeneratedAccount, adminError, adminEnvio, adminResendingId,
    loadAdminAccounts, handleCreateAdminAccount, handleResendAdminInvitation,
    handleRegenerateAdminPassword, handleUpdateAdminResponsible,
    handleToggleAdminAccountStatus, resetAdminAccounts
  };
}
