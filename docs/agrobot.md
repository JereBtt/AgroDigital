# AgroBot

AgroBot abre desde la burbuja flotante un panel lateral derecho dentro de AgroDigital. Cerrar el panel deja la burbuja y conserva la conversación únicamente en memoria durante la sesión del navegador. Al salir, recargar o reiniciar la aplicación no se persiste historial. Al cambiar de empresa, el contexto visible se borra.

## Backend y seguridad

`POST /api/agrobot/consultar` exige token válido y una empresa activa a la que el usuario tenga acceso. `PermisosService` resuelve el rol **en esa empresa**. Todos los cuatro roles operativos pueden usar AgroBot; Admin conserva su acceso interno. Para preguntas puntuales, el servidor admite solo un conjunto acotado de consultas fijas y parametrizadas de `ReporteriaRepository`; `EmpresaId` lo fija el servidor tras autorizarlo. El modelo no ejecuta SQL ni recibe datos de otras empresas. No se ofrecen consultas agregadas de Estadísticas a empleados.

Una primera llamada a OpenAI clasifica la pregunta como ayuda, dato puntual, conocimiento general o análisis. Para un dato, el backend ejecuta la consulta autorizada y envía a la segunda llamada solo hasta ocho filas. Si no hay filas, responde sin pedir al modelo que complete información faltante. La ayuda usa un catálogo estructurado de módulos, rutas y acciones según rol. `IAgroBotDocumentSource` es el punto de extensión para búsqueda documental futura; la implementación actual no consulta el Manual ni envía documentos completos. El sistema real prevalece sobre ese material complementario.

Las preguntas que requieren análisis o comparaciones internos se derivan a Reportería IA con un prompt copiable. Gerente, Encargado y Admin pueden abrir Reportería IA desde el panel con ese prompt precargado en una consulta nueva, para revisarlo antes de enviarlo; para empleados se indica que necesitan compartir el prompt con un rol autorizado. Las preguntas generales quedan rotuladas como conocimiento no registrado. Las respuestas agronómicas no deben prescribir dosis o mezclas para un lote sin contexto suficiente.

El modelo se configura con `AgroBot:Modelo` (predeterminado `gpt-6-luna`) y reutiliza `OpenAI:ApiKey` del backend. Las llamadas usan `store=false`. No se crea ninguna tabla nueva.

## Verificación

Compilar backend y frontend y ejecutar `dotnet run --project backend/AgroDigital.Api.SmokeTests/AgroDigital.Api.SmokeTests.csproj`. La prueba simula OpenAI y la lectura SQL; verifica pregunta puntual con empresa fija, ayuda según rol, conocimiento general y derivación de un empleado. Probar además apertura y cierre del panel, Escape, tamaño móvil, cambio de empresa y que la conversación se pierde al recargar. Comprobar `401` sin token, `404` para empresa ajena y acceso por rol real en una instancia de prueba. La interfaz no debe persistir mensajes en `localStorage` ni `sessionStorage`.
