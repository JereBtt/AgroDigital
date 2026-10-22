# AgroDigital.Api

API REST de AgroDigital desarrollada con ASP.NET Core Web API.

## Ejecutar

```powershell
dotnet run
```

## Envío de correos

La API envía correos en tres casos: cuando el administrador invita a un gerente,
cuando un gerente invita a un empleado y cuando una solicitud genera un aviso.

La configuración está en la sección `Email`. Por defecto, `appsettings.json` apunta a
**smtp4dev** (`localhost:2525`), un buzón de prueba que no entrega nada a nadie. Para
mandar correos reales no se cambia código: se cargan los datos de la cuenta con
*user-secrets*, que quedan solo en la computadora de cada uno y nunca se suben al repo.

### Usar la cuenta de Gmail del proyecto

Cuenta remitente: `agrodigital.notificaciones@gmail.com`.

1. Pedir la **contraseña de aplicación** (16 letras) por mensaje privado, o crear una propia
   desde https://myaccount.google.com/apppasswords con la cuenta del proyecto (requiere
   tener activada la verificación en dos pasos).
2. Desde la carpeta `backend\AgroDigital.Api`, ejecutar:

   ```powershell
   dotnet user-secrets set "Email:Host" "smtp.gmail.com"
   dotnet user-secrets set "Email:Port" "587"
   dotnet user-secrets set "Email:UsarSsl" "true"
   dotnet user-secrets set "Email:Usuario" "agrodigital.notificaciones@gmail.com"
   dotnet user-secrets set "Email:Password" "CONTRASENA_DE_16_LETRAS_SIN_ESPACIOS"
   dotnet user-secrets set "Email:RemitenteCorreo" "agrodigital.notificaciones@gmail.com"
   ```

3. Reiniciar la API (`Ctrl + C` y `dotnet run`).

Para volver a smtp4dev: `dotnet user-secrets remove "Email:Host"` (y el resto de las claves
`Email:*`), o `dotnet user-secrets list` para ver qué está cargado.

### Si algo falla

- Los errores de envío aparecen en la consola de la API como aviso amarillo
  *"No se pudo enviar el correo..."*. La invitación se guarda igual; se puede reenviar.
- **Timeout al autenticar**: suele ser un antivirus con "escudo de correo" o un corte
  pasajero. Probar de nuevo y, si sigue, revisar el antivirus.
- **Error 535 / credenciales inválidas**: la contraseña de aplicación tiene espacios o
  fue revocada. Cargarla de nuevo, todo junto.
- Los primeros correos pueden caer en **Spam**: marcarlos como "No es spam".
- **Nunca** poner la contraseña en `appsettings.json` ni en capturas de pantalla.

### Enlaces de los correos

Los enlaces se arman con `Email:UrlAplicacion` (por defecto `http://localhost:5173`), así
que solo funcionan en la computadora donde corre la app. Al desplegar en un hosting,
cambiar ese valor por la dirección pública del frontend.

## Endpoints iniciales

- `GET /api/lotes`
- `GET /api/lotes/{loteId}`
- `POST /api/lotes`
- `PUT /api/lotes/{loteId}`

No se implementa eliminacion fisica de lotes porque el Manual de Usuario indica que los lotes forman parte de la trazabilidad historica de las campanias.

