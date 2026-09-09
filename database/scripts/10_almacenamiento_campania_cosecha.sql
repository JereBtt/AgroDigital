/*
    Modulo: Almacenamiento - agrega Campania/Cosecha como texto libre.

    Decision explicita durante el desarrollo: los modulos Campania y Cosecha
    todavia no existen en este repositorio (ver 09_almacenamiento.sql). El
    usuario pidio poder anotar a que Campania/Cosecha corresponde un
    movimiento igual, sin esperar a que esos modulos existan. Por eso estas
    columnas son texto libre y NULL, no FK.

    Cuando el modulo Campania/Cosecha se implemente, la migracion natural es:
    agregar CampaniaId/CosechaId (INT NULL + FK), migrar los valores de texto
    que puedan matchear por nombre, y recien ahi evaluar si estas columnas de
    texto se dan de baja o se dejan como respaldo historico.
*/

USE AgroDigital;
GO

IF COL_LENGTH(N'dbo.Almacenamientos', N'Campania') IS NULL
BEGIN
    ALTER TABLE dbo.Almacenamientos
    ADD Campania NVARCHAR(60) NULL;
END;
GO

IF COL_LENGTH(N'dbo.Almacenamientos', N'Cosecha') IS NULL
BEGIN
    ALTER TABLE dbo.Almacenamientos
    ADD Cosecha NVARCHAR(60) NULL;
END;
GO
