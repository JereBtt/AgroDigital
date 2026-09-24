using AgroDigital.Api.Repositories;
using AgroDigital.Api.Services;
using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendLocal", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddScoped<ILoteRepository, LoteRepository>();
builder.Services.AddScoped<ISiloRepository, SiloRepository>();
builder.Services.AddScoped<ICampaniaRepository, CampaniaRepository>();
builder.Services.AddScoped<IAlmacenamientoRepository, AlmacenamientoRepository>();
builder.Services.AddScoped<ISiembraRepository, SiembraRepository>();
builder.Services.AddScoped<ISeguimientoRepository, SeguimientoRepository>();
builder.Services.AddScoped<ICosechaRepository, CosechaRepository>();
builder.Services.AddScoped<IAuthRepository, AuthRepository>();
builder.Services.AddScoped<IAdminRepository, AdminRepository>();
builder.Services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
builder.Services.AddSingleton<IAuthTokenService, HmacAuthTokenService>();

var connectionString = builder.Configuration.GetConnectionString("AgroDigital");
if (!string.IsNullOrWhiteSpace(connectionString))
{
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync();
    await using var command = new SqlCommand("""
        IF COL_LENGTH(N'dbo.SiembraInsumos', N'MotivoAplicacion') IS NULL
        BEGIN
            ALTER TABLE dbo.SiembraInsumos ADD MotivoAplicacion NVARCHAR(40) NULL;
        END;

        IF COL_LENGTH(N'dbo.Siembras', N'CicloCultivo') IS NULL
        BEGIN
            ALTER TABLE dbo.Siembras ADD CicloCultivo NVARCHAR(20) NULL;
        END;

        IF COL_LENGTH(N'dbo.Siembras', N'TipoImplantacion') IS NULL
        BEGIN
            ALTER TABLE dbo.Siembras ADD TipoImplantacion NVARCHAR(20) NULL;
        END;

        IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_CicloCultivo' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
        BEGIN
            EXEC(N'ALTER TABLE dbo.Siembras
                ADD CONSTRAINT CK_Siembras_CicloCultivo CHECK (CicloCultivo IS NULL OR CicloCultivo IN (N''Corto'', N''Largo''));');
        END;

        IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Siembras_TipoImplantacion' AND parent_object_id = OBJECT_ID(N'dbo.Siembras'))
        BEGIN
            EXEC(N'ALTER TABLE dbo.Siembras
                ADD CONSTRAINT CK_Siembras_TipoImplantacion CHECK (TipoImplantacion IS NULL OR TipoImplantacion IN (N''Primera'', N''Segunda'', N''Temprano'', N''Tardío''));');
        END;

        IF OBJECT_ID(N'dbo.CatalogoValores', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.CatalogoValores
            (
                CatalogoValorId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                Tipo NVARCHAR(40) NOT NULL,
                Grano NVARCHAR(60) NOT NULL CONSTRAINT DF_CatalogoValores_Grano DEFAULT (N''),
                Nombre NVARCHAR(100) NOT NULL,
                FechaCreacion DATETIME2 NOT NULL CONSTRAINT DF_CatalogoValores_FechaCreacion DEFAULT (SYSDATETIME()),
                CONSTRAINT UQ_CatalogoValores_Tipo_Grano_Nombre UNIQUE (Tipo, Grano, Nombre)
            );
        END;

        INSERT INTO dbo.CatalogoValores (Tipo, Grano, Nombre)
        SELECT Fuente.Tipo, Fuente.Grano, Fuente.Nombre
        FROM (VALUES
            (N'MarcaAgroquimico', N'', N'ACA'),
            (N'MarcaAgroquimico', N'', N'ADAMA'),
            (N'MarcaAgroquimico', N'', N'BASF'),
            (N'MarcaAgroquimico', N'', N'Bayer'),
            (N'MarcaAgroquimico', N'', N'Corteva Agriscience'),
            (N'MarcaAgroquimico', N'', N'FMC'),
            (N'MarcaAgroquimico', N'', N'Monsanto'),
            (N'MarcaAgroquimico', N'', N'Sumitomo Chemical'),
            (N'MarcaAgroquimico', N'', N'Syngenta'),
            (N'MarcaAgroquimico', N'', N'UPL'),
            (N'DrogaAgroquimico', N'', N'2,4-D'),
            (N'DrogaAgroquimico', N'', N'Atrazina'),
            (N'DrogaAgroquimico', N'', N'Cletodim'),
            (N'DrogaAgroquimico', N'', N'Dicamba'),
            (N'DrogaAgroquimico', N'', N'Flumioxazina'),
            (N'DrogaAgroquimico', N'', N'Glifosato'),
            (N'DrogaAgroquimico', N'', N'Glufosinato de amonio'),
            (N'DrogaAgroquimico', N'', N'Haloxifop-P-metil'),
            (N'DrogaAgroquimico', N'', N'Metsulfuron-metil'),
            (N'DrogaAgroquimico', N'', N'Saflufenacil'),
            (N'VariedadSemilla', N'Soja', N'46I20'),
            (N'VariedadSemilla', N'Soja', N'50I17'),
            (N'VariedadSemilla', N'Maiz', N'ACA473'),
            (N'VariedadSemilla', N'Maiz', N'DOW226')
        ) AS Fuente(Tipo, Grano, Nombre)
        WHERE NOT EXISTS
        (
            SELECT 1 FROM dbo.CatalogoValores Destino
            WHERE Destino.Tipo = Fuente.Tipo AND Destino.Grano = Fuente.Grano AND Destino.Nombre = Fuente.Nombre
        );
        """, connection);
    await command.ExecuteNonQueryAsync();
}

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseCors("FrontendLocal");
app.UseAuthorization();
app.MapControllers();

app.Run();
