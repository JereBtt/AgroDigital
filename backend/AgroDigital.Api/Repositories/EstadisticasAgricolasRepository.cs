using AgroDigital.Api.Services;
using Microsoft.Data.SqlClient;
using System.Text;

namespace AgroDigital.Api.Repositories;

public partial class EstadisticasRepository
{
    // Proyección de lectura por empresa. No une recorridas a las cosechas: eso
    // multiplicaría los kg y las hectáreas al existir varios eventos por siembra.
    public async Task<string> ObtenerAgricolasAsync(int empresaId, int usuarioId, bool esAdmin)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync();
        await DistribucionAcceso.ExigirRolAsync(connection, null, usuarioId, esAdmin, empresaId, RolesEstadisticas, MensajeRol);
        const string sql = """
            SELECT
              JSON_QUERY((SELECT l.LoteId AS id, l.Nombre AS nombre, l.Ciudad AS zona,
                l.Provincia AS provincia, l.SuperficieTotal / 10000.0 AS superficie, l.Hectareas AS cultivables,
                (SELECT AVG(c.Latitud) FROM dbo.LoteCoordenadas c WHERE c.LoteId=l.LoteId) AS latitud,
                (SELECT AVG(c.Longitud) FROM dbo.LoteCoordenadas c WHERE c.LoteId=l.LoteId) AS longitud
                FROM dbo.Lotes l WHERE l.EmpresaId=@EmpresaId FOR JSON PATH)) AS lotes,
              JSON_QUERY((SELECT s.SiembraId AS id, s.Nombre AS nombre, s.LoteId AS loteId,
                LEFT(LTRIM(s.CampaniaNombre),9) AS campania, s.CicloEstacional AS ciclo,
                s.Producto AS grano, s.TipoImplantacion AS epoca, s.CicloCultivo AS cicloCultivo,
                s.VariedadSemilla AS variedad, s.TipoRegistro AS tipo,
                s.SiembraOriginalId AS anteriorId, s.CantidadHectareasTrabajadas AS ha,
                s.FechaInicio AS inicio, s.FechaFin AS finTentativo, s.FechaFinReal AS finReal,
                s.JustificacionDesvioFin AS motivoDesvio,
                s.HectareasHora AS haHora, s.EstadoSiembra AS estado,
                CAST(CASE WHEN s.DeshabilitacionId IS NULL THEN 0 ELSE 1 END AS bit) AS deshabilitada,
                d.Motivo AS motivoBaja, d.Siniestro AS siniestroBaja
                FROM dbo.Siembras s JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                LEFT JOIN dbo.LoteDeshabilitaciones d ON d.LoteDeshabilitacionId=s.DeshabilitacionId
                WHERE l.EmpresaId=@EmpresaId FOR JSON PATH)) AS siembras,
              JSON_QUERY((SELECT c.CosechaId AS id, c.Nombre AS nombre, c.SiembraId AS siembraId,
                c.LoteId AS loteId, LEFT(LTRIM(c.CampaniaNombre),9) AS campania,
                s.CicloEstacional AS ciclo, c.Producto AS grano, s.TipoImplantacion AS epoca,
                s.CicloCultivo AS cicloCultivo, s.VariedadSemilla AS variedad,
                c.CantidadGranoCosechado AS kg, c.CantidadHectareasTrabajadas AS ha,
                c.RindeSecoKgHa AS rindeSeco, c.HectareasHora AS haHora,
                c.FechaInicio AS inicio, c.FechaFin AS finTentativo, c.FechaFinReal AS finReal,
                c.JustificacionDesvioFin AS motivoDesvio,
                c.Estado AS estado
                FROM dbo.Cosechas c JOIN dbo.Lotes l ON l.LoteId=c.LoteId
                LEFT JOIN dbo.Siembras s ON s.SiembraId=c.SiembraId
                WHERE l.EmpresaId=@EmpresaId AND (c.EmpresaId=@EmpresaId OR c.EmpresaId IS NULL)
                FOR JSON PATH)) AS cosechas,
              JSON_QUERY((SELECT r.SiembraSeguimientoId AS id, r.SiembraId AS siembraId,
                r.Fecha AS fecha, r.Siniestro AS siniestro, r.Alcance AS alcance,
                r.Cultivo AS cultivo, r.EsResiembra AS automatico
                FROM dbo.SiembraSeguimientos r JOIN dbo.Siembras s ON s.SiembraId=r.SiembraId
                JOIN dbo.Lotes l ON l.LoteId=s.LoteId
                WHERE l.EmpresaId=@EmpresaId AND r.TipoRegistro=N'Siniestro' FOR JSON PATH)) AS siniestros,
              JSON_QUERY((SELECT cc.LoteId AS loteId, LEFT(LTRIM(c.Nombre),9) AS campania,
                cc.CicloEstacional AS ciclo, cc.Producto AS grano
                FROM dbo.CampaniaCombinaciones cc JOIN dbo.Campanias c ON c.CampaniaId=cc.CampaniaId
                JOIN dbo.Lotes l ON l.LoteId=cc.LoteId
                WHERE l.EmpresaId=@EmpresaId FOR JSON PATH)) AS planes
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
            """;
        await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@EmpresaId", empresaId);
        await using var reader = await command.ExecuteReaderAsync();
        var json = new StringBuilder();
        while (await reader.ReadAsync()) json.Append(reader.GetString(0));
        return json.ToString();
    }
}
