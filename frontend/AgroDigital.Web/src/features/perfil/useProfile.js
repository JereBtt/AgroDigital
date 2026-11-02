import { useEffect, useState } from 'react';

const PROFILE_PHOTO_MAX_SIDE = 512;
const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Reduce la imagen antes de subirla para no guardar fotos de varios MB.
async function resizeProfilePhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PROFILE_PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

export default function useProfile({ session, setSession, authHeaders, apiBaseUrl, onRequireRelogin }) {
  const API_BASE_URL = apiBaseUrl;
  const [userProfile, setUserProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profilePasswordSaving, setProfilePasswordSaving] = useState(false);
  const [profilePasswordError, setProfilePasswordError] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [profilePhotoSaving, setProfilePhotoSaving] = useState(false);
  const [profilePhotoError, setProfilePhotoError] = useState('');
  const hasProfilePhoto = Boolean(userProfile?.tieneFoto);

  useEffect(() => {
    if (!session?.token || !hasProfilePhoto) {
      setProfilePhotoUrl('');
      return undefined;
    }

    let objectUrl = '';
    let ignore = false;

    async function loadProfilePhoto() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/perfil/foto`, {
          headers: authHeaders(),
          cache: 'no-store'
        });
        if (!response.ok) throw new Error();
        const blob = await response.blob();
        if (ignore) return;
        objectUrl = URL.createObjectURL(blob);
        setProfilePhotoUrl(objectUrl);
      } catch {
        if (!ignore) setProfilePhotoUrl('');
      }
    }

    loadProfilePhoto();

    return () => {
      ignore = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // userProfile se reemplaza en cada alta/baja de foto, lo que fuerza la recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, hasProfilePhoto, userProfile]);

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
      if (data.requiereReingreso) {
        onRequireRelogin?.(data.mensaje || 'Tu correo se actualizó. Iniciá sesión nuevamente con tu nuevo usuario.');
        return;
      }
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

      setProfileStatus('Contraseña actualizada correctamente.');
      return true;
    } catch (error) {
      const message = error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar la contraseña.';
      if (message.toLocaleLowerCase('es-AR').includes('contraseña actual')) {
        setProfilePasswordError(message);
      } else {
        setProfileError(message);
      }
      return false;
    } finally {
      setProfilePasswordSaving(false);
    }
  }
  async function handleUploadProfilePhoto(file) {
    if (!session?.token || !file) return false;

    setProfilePhotoError('');
    setProfileStatus('');

    if (!PROFILE_PHOTO_TYPES.includes(file.type)) {
      setProfilePhotoError('Formato no permitido. Usá una imagen JPG, PNG o WEBP.');
      return false;
    }

    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setProfilePhotoError('La foto de perfil no puede superar los 5 MB.');
      return false;
    }

    setProfilePhotoSaving(true);

    try {
      const image = await resizeProfilePhoto(file);
      const formData = new FormData();
      formData.append('archivo', image, image === file ? file.name : 'foto-perfil.jpg');

      const response = await fetch(`${API_BASE_URL}/api/auth/perfil/foto`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      if (!response.ok) throw new Error(await response.text());

      setUserProfile(await response.json());
      setProfileStatus('Foto de perfil actualizada correctamente.');
      return true;
    } catch (error) {
      setProfilePhotoError(error.message.replace(/^"|"$/g, '') || 'No se pudo actualizar la foto de perfil.');
      return false;
    } finally {
      setProfilePhotoSaving(false);
    }
  }

  async function handleDeleteProfilePhoto() {
    if (!session?.token) return false;

    setProfilePhotoSaving(true);
    setProfilePhotoError('');
    setProfileStatus('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/perfil/foto`, {
        method: 'DELETE',
        headers: authHeaders()
      });

      if (!response.ok) throw new Error(await response.text());

      setUserProfile(await response.json());
      setProfileStatus('Foto de perfil eliminada.');
      return true;
    } catch (error) {
      setProfilePhotoError(error.message.replace(/^"|"$/g, '') || 'No se pudo eliminar la foto de perfil.');
      return false;
    } finally {
      setProfilePhotoSaving(false);
    }
  }

  function resetProfile() {
    setUserProfile(null);
    setProfileError('');
    setProfileStatus('');
    setProfileSaving(false);
    setProfilePhotoUrl('');
    setProfilePhotoError('');
    setProfilePhotoSaving(false);
  }

  return {
    userProfile, profileError, profileStatus, profileSaving,
    profilePasswordSaving, profilePasswordError, setUserProfile,
    setProfilePasswordError, loadUserProfile, handleUpdateProfile,
    handleChangeProfilePassword, resetProfile,
    profilePhotoUrl, profilePhotoSaving, profilePhotoError,
    handleUploadProfilePhoto, handleDeleteProfilePhoto
  };
}
