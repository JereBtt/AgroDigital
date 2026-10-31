# Despliegue de demostración en SmarterASP

Esta guía publica el frontend React y la API ASP.NET Core bajo el mismo sitio HTTPS. El navegador usa rutas relativas (`/api/...`), de modo que no depende de puertos locales ni de CORS entre dos dominios.

## Requisitos confirmados

- Plan Windows con ASP.NET Core 9 y SQL Server 2019, 2022 o posterior.
- Una base SQL Server creada desde el panel de SmarterASP.
- Un usuario SQL de aplicación con derechos `dbo` sobre esa base para aplicar la instalación inicial y las migraciones necesarias.
- Una carpeta persistente y escribible para los documentos. Durante la prueba se puede utilizar `App_Data`; probar una carga, reiniciar/publicar otra versión y comprobar la descarga antes de compartir el enlace.

## Preparar base y datos de demostración

1. Respaldar la base local antes de cualquier operación.
2. Crear la base en SmarterASP y elegir SQL Server 2019 o posterior.
3. Migrar la base actual mediante las herramientas de backup/restore que habilite el panel, o ejecutar la secuencia de scripts aprobada sobre una base vacía. No volver a ejecutar scripts incrementales contra una copia ya actualizada.
4. Comprobar el inicio de sesión con un usuario de demostración y verificar que los módulos nuevos tengan sus tablas, incluyendo `34_reporteria_ia.sql`.

> La API actual también comprueba y agrega algunas columnas, restricciones y catálogos de compatibilidad al arrancar. Por eso, durante esta demostración el usuario SQL de la aplicación necesita permisos de modificación de esquema (`dbo`). No se debe retirar ese permiso sin antes convertir esas comprobaciones en una migración administrada.

## Secretos y configuración

1. El paquete contiene únicamente `appsettings.Production.example.json`, que es una plantilla sin secretos. En SmarterASP cargar los valores reales como variables de entorno del Application Pool (Panel de control > Advance > Pool Manager > Actions > Environment Variables); no incluir `appsettings.Production.json` en `artifacts/smarterasp`, FTP, Web Deploy ni un ZIP de publicación.
2. Completar la cadena `ConnectionStrings:AgroDigital` con el usuario SQL entregado por el hosting. No usar autenticación integrada ni `sa`.
3. Generar una `Auth:SigningKey` aleatoria, larga y permanente. Si cambia, se invalidan las sesiones activas.
4. Indicar `Email:UrlAplicacion` con la URL HTTPS final. En la prueba gratuita, verificar SMTP externo antes de demostrar altas que envíen correos.
5. Configurar `OpenAI:ApiKey` solo si se demostrará Reportería IA o AgroBot. Sin la clave, los módulos conservan sus permisos e historial, pero no pueden responder consultas de IA.
6. Definir `Storage:DocumentsPath`. Puede ser una ruta absoluta habilitada por el hosting; si no existe, `App_Data` conserva el comportamiento actual.

## Generar el paquete

Desde la raíz del repositorio, ejecutar:

```powershell
.\scripts\preparar-publicacion-smarterasp.ps1
```

El script compila React con `VITE_API_BASE_URL` vacío, publica la API en modo `Release` y copia los archivos estáticos a `artifacts/smarterasp/wwwroot`. El resultado incluye el `web.config` generado por ASP.NET Core para IIS. Por seguridad, solo puede limpiar exactamente esa carpeta (rechaza otras rutas y enlaces) y ejecuta una validación previa a la subida: API, `web.config`, entrada compilada del frontend y plantilla de producción. También falla si detecta `appsettings.Production.json` dentro del paquete.

Para crear la configuración con la contraseña SQL sin escribirla en Git ni en la consola, ejecutar luego:

```powershell
.\scripts\configurar-publicacion-smarterasp.ps1 `
  -SiteUrl "https://URL-HTTPS-DEL-SITIO" `
  -SqlServer "SERVIDOR_SQL" `
  -Database "BASE_DE_DATOS" `
  -SqlUser "USUARIO_SQL"
```

El script pide la contraseña de la base de forma oculta y genera una configuración privada en `artifacts/smarterasp.private/appsettings.Production.json`, fuera del paquete. Usarla solo como referencia para cargar los mismos valores como variables de entorno del Application Pool de SmarterASP. Durante la primera demostración deja Correo y OpenAI sin configurar: no usar flujos que envíen invitaciones por correo y no demostrar IA hasta cargar las credenciales reales.

## Subir y verificar

1. Ejecutar, si se desea verificar de forma independiente, `./scripts/validar-publicacion-smarterasp.ps1`. Debe finalizar con la aprobación antes de continuar.
2. Publicar únicamente el contenido de `artifacts/smarterasp` mediante Web Deploy o FTP, según indique el panel. No comprimir ni subir `artifacts/smarterasp.private`.
3. En el Panel de control > Advance > Pool Manager > Actions > Environment Variables, cargar las variables del apartado siguiente. No subir el archivo JSON privado.
4. Reiniciar la aplicación desde el panel si fuera necesario.
5. Abrir la URL HTTPS asignada por SmarterASP y comprobar directamente: login, selección de empresa, Lotes, Campañas, Siembras, Cosechas, Silos, Almacenamiento, Distribución, Estadísticas, adjuntos, Reportería IA y AgroBot. El acceso desde la máquina de demostración se realiza únicamente con esa URL; no se instala ni ejecuta la aplicación en ella.
6. Probar desde una red externa. Crear una cuenta de demostración separada para el profesor; no compartir la cuenta interna `Admin`.
7. Antes de cada nueva publicación, descargar backup de base y documentos.

## Problemas esperables

- **La interfaz carga pero las llamadas fallan:** confirmar que el frontend se compiló mediante el script y que la cadena de conexión de producción está disponible.
- **Los documentos no se conservan:** cambiar `Storage:DocumentsPath` a una carpeta persistente/escribible del hosting y volver a probar carga, reinicio y descarga.
- **Reportería IA o AgroBot responden que falta configuración:** cargar `OpenAI:ApiKey` solo en el backend y reiniciar la aplicación.

### Habilitar Reportería IA y AgroBot

Con el paquete ya preparado para SmarterASP, ejecutar:

```powershell
.\scripts\configurar-openai-smarterasp.ps1
```

El script solicita la clave de OpenAI de forma oculta, conserva la conexión SQL, CORS y la clave de sesión existentes, y actualiza únicamente la configuración privada fuera del paquete. Cargar luego ese valor como `OpenAI__ApiKey` en las variables de entorno del Application Pool; nunca pasar la clave por parámetros, guardarla en un `.env` del frontend, agregarla a Git ni compartir el archivo.

### Habilitar mensajería por correo

Con el paquete y la configuración privada ya creados, ejecutar:

```powershell
.\scripts\configurar-correo-smarterasp.ps1
```

El script pide de manera oculta la contraseña de aplicación SMTP y añade la sección `Email` a la configuración privada. Para la cuenta del proyecto utiliza Gmail con STARTTLS (`smtp.gmail.com`, puerto `587`) y completa la URL pública a partir de `Cors:AllowedOrigins`. Si se usa otro proveedor SMTP, indicar sus datos no secretos como parámetros. La contraseña no debe formar parte del paquete, Git ni el frontend.

### Variables de entorno que se cargan en SmarterASP

ASP.NET Core interpreta `__` (doble guion bajo) como niveles de configuración. Crear estas variables en el Application Pool, con los valores del archivo privado generado. Las que contienen secretos se cargan directamente en el panel, sin copiarlas a chat, Git ni archivos del paquete:

| Sección | Variables |
| --- | --- |
| Base, sesión y sitio | `ConnectionStrings__AgroDigital`, `Auth__SigningKey`, `Cors__AllowedOrigins__0`, `Storage__DocumentsPath` |
| Correo | `Email__Host`, `Email__Port`, `Email__UsarSsl`, `Email__Usuario`, `Email__Password`, `Email__RemitenteNombre`, `Email__RemitenteCorreo`, `Email__UrlAplicacion` |
| IA | `OpenAI__ApiKey`, `ReporteriaIA__ModeloSimple`, `ReporteriaIA__ModeloAnalisis`, `AgroBot__Modelo` |

Después de guardar las variables, reciclar o reiniciar la aplicación desde el panel antes de probar. Las variables del Application Pool tienen prioridad sobre los valores de `appsettings.json` y quedan disponibles para todos los equipos que ingresen por la URL pública.
- **Enlaces de invitación apuntan a localhost:** corregir `Email:UrlAplicacion`.
