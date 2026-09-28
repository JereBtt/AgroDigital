/*
    Modulo: Almacenamiento - agrega Producto como texto libre.

    Decision explicita durante el desarrollo: igual que Campania/Cosecha
    (ver 10_almacenamiento_campania_cosecha.sql), el modulo de Almacenamiento
    permite anotar a que Producto corresponde un movimiento sin depender del
    campo Producto que ya existe en dbo.Silos. Esto es necesario porque un
    mismo silo puede recibir mas de un producto a lo largo del tiempo y el
    movimiento debe poder dejar registrado cual corresponde a ese ingreso o
    egreso puntual. Por eso esta columna es texto libre y NULL, no FK.

    Cuando exista un catalogo formal de Productos, la migracion natural es:
    agregar ProductoId (INT NULL + FK), migrar los valores de texto que
    puedan matchear por nombre, y recien ahi evaluar si esta columna de
    texto se da de baja o se deja como respaldo historico.
*/

USE AgroDigital;
GO

IF COL_LENGTH(N'dbo.Almacenamientos', N'Producto') IS NULL
BEGIN
    ALTER TABLE dbo.Almacenamientos
    ADD Producto NVARCHAR(80) NULL;
END;
GO
