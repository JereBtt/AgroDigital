# AgroDigital

Proyecto de tesis para digitalizar y centralizar la gestion de campanias agricolas.

## Estructura

- `backend/`: API y backend en C# / ASP.NET Core.
- `frontend/`: aplicacion web en React.
- `database/`: scripts SQL, documentacion y recursos de base de datos.
- `docs/`: documentacion tecnica y funcional versionada que corresponda.

## Base de datos

El script madre de creacion de base de datos se mantiene en:

- `database/scripts/00_master_create_database.sql`

Cada integrante debe configurar su propia instancia SQL Server local. La API lee la cadena de conexion desde `ConnectionStrings:AgroDigital`.

Recomendado para desarrollo local:

```powershell
dotnet user-secrets set "ConnectionStrings:AgroDigital" "Server=TU_SERVIDOR_SQL;Database=AgroDigital;Trusted_Connection=True;TrustServerCertificate=True;" --project backend/AgroDigital.Api/AgroDigital.Api.csproj
dotnet user-secrets set "Auth:SigningKey" "CAMBIAR-POR-UNA-CLAVE-LARGA-LOCAL" --project backend/AgroDigital.Api/AgroDigital.Api.csproj
```

No subir cadenas de conexion reales, usuarios, contrasenias ni claves de firma al repositorio.
