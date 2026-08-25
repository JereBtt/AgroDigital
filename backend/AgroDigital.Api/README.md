# AgroDigital.Api

API REST de AgroDigital desarrollada con ASP.NET Core Web API.

## Ejecutar

```powershell
dotnet run
```

## Endpoints iniciales

- `GET /api/lotes`
- `GET /api/lotes/{loteId}`
- `POST /api/lotes`
- `PUT /api/lotes/{loteId}`

No se implementa eliminacion fisica de lotes porque el Manual de Usuario indica que los lotes forman parte de la trazabilidad historica de las campanias.

