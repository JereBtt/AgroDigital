import { useState } from 'react';

export default function useProfile({ session, setSession, authHeaders, apiBaseUrl }) {
  const API_BASE_URL = apiBaseUrl;
  const [userProfile, setUserProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profilePasswordSaving, setProfilePasswordSaving] = useState(false);
  const [profilePasswordError, setProfilePasswordError] = useState('');

  async function loadUserProfile() {
    if (!session?.token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/perfil`, {
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setUserProfile(data);
      setProfileError('');
    } catch (error) {
      setUserProfile(null);
      setProfileError(error.message.replace(/^"|"$/g, '') || 'No se pudo cargar el perfil.');
    }
  }

  async function handleUpdateProfile(profileForm) {
    if (!session?.token) return;

    setProfileSaving(true);
    setProfileError('');
    setProfileStatus('');
    setProfilePasswordError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/perfil`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(profileForm)
      });

      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setUserProfile(data.perfil);
      if (data.login) {
        setSession((current) => current ? {
          ...current,
          name: data.login.nombre,
          role: data.login.rol,
          token: data.login.token,
          usuario: data.login.usuario
        } : current);
      }
      setProfileStatus('Perfil actualizado correctamente.');
    } catch (error) {
      setProfileError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar el perfil.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangeProfilePassword(passwordForm) {
    if (!session?.token) return;

    setProfilePasswordSaving(true);
    setProfileError('');
    setProfileStatus('');
    setProfilePasswordError('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/perfil/password`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(passwordForm)
      });

      if (!response.ok) throw new Error(await response.text());

      setProfileStatus('Contrasenia actualizada correctamente.');
      return true;
    } catch (error) {
      const message = error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar la contrasenia.';
      if (message.toLocaleLowerCase('es-AR').includes('contrasenia actual')) {
        setProfilePasswordError(message);
      } else {
        setProfileError(message);
      }
      return false;
    } finally {
      setProfilePasswordSaving(false);
    }
  }
  function resetProfile() {
    setUserProfile(null);
    setProfileError('');
    setProfileStatus('');
    setProfileSaving(false);
  }

  return {
    userProfile, profileError, profileStatus, profileSaving,
    profilePasswordSaving, profilePasswordError, setUserProfile,
    setProfilePasswordError, loadUserProfile, handleUpdateProfile,
    handleChangeProfilePassword, resetProfile
  };
}
