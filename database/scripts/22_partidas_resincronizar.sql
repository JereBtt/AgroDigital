/*
    Almacenamiento - resincronizar partidas FIFO (paso previo al rediseno de movimientos).

    Por que hace falta:
      Entre el script 21 y la version nueva de AlmacenamientoRepository, los
      ingresos y egresos se registraron con el codigo anterior, que no conocia
      las partidas (por ejemplo, el alta de un silo con grano inicial). En esos
      silos la suma de partidas no coincide con el stock, y un egreso con el
      codigo nuevo fallaria con "Las partidas del silo no alcanzan".

    Que hace:
      Para cada silo donde SUM(KgRestantes) de sus partidas <> CantidadGranoAlmacenado,
      borra sus partidas y las vuelve a generar con la misma logica FIFO del
      script 21: el stock actual corresponde a los ingresos mas recientes.

    Seguridad:
      - Solo toca silos donde las partidas no cuadran.
      - NO toca silos que ya tengan consumos registrados (esos consumos solo los
        genera el codigo nuevo, y ahi las partidas ya son la fuente de verdad).
      - Idempotente: si todo cuadra, no hace nada.

    Correr UNA VEZ, antes o justo despues de reemplazar AlmacenamientoRepository.cs.
*/

USE AgroDigital;
GO

SET QUOTED_IDENTIFIER ON;
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @SilosAReconstruir TABLE (SiloId INT PRIMARY KEY);

INSERT INTO @SilosAReconstruir (SiloId)
SELECT s.SiloId
FROM dbo.Silos AS s
LEFT JOIN (
    SELECT SiloId, SUM(KgRestantes) AS Kg
    FROM dbo.AlmacenamientoPartidas
    GROUP BY SiloId
) AS p ON p.SiloId = s.SiloId
WHERE ISNULL(p.Kg, 0) <> s.CantidadGranoAlmacenado
  AND NOT EXISTS (
        SELECT 1
        FROM dbo.AlmacenamientoPartidaConsumos AS c
        INNER JOIN dbo.AlmacenamientoPartidas AS px ON px.PartidaId = c.PartidaId
        WHERE px.SiloId = s.SiloId
  );

-- Silos que se van a reconstruir (para revisar).
SELECT N'Se reconstruyen las partidas' AS Accion, s.SiloId, s.Nombre, s.CantidadGranoAlmacenado AS StockSilo
FROM dbo.Silos AS s
INNER JOIN @SilosAReconstruir AS r ON r.SiloId = s.SiloId;

DELETE p
FROM dbo.AlmacenamientoPartidas AS p
INNER JOIN @SilosAReconstruir AS r ON r.SiloId = p.SiloId;

-- Una partida por ingreso; los kg restantes se asignan a los ingresos mas recientes (FIFO).
;WITH Ingresos AS
(
    SELECT a.AlmacenamientoId,
           a.SiloId,
           COALESCE(a.EmpresaId, s.EmpresaId) AS EmpresaId,
           a.CosechaId,
           a.CampaniaId,
           COALESCE(a.Producto, s.Producto) AS Producto,
           a.Fecha,
           a.Cantidad,
           s.CantidadGranoAlmacenado AS StockSilo,
           SUM(a.Cantidad) OVER (
               PARTITION BY a.SiloId
               ORDER BY a.Fecha DESC, a.AlmacenamientoId DESC
               ROWS UNBOUNDED PRECEDING
           ) AS Acumulado
    FROM dbo.Almacenamientos AS a
    INNER JOIN dbo.Silos AS s ON s.SiloId = a.SiloId
    INNER JOIN @SilosAReconstruir AS r ON r.SiloId = a.SiloId
    WHERE a.TipoMovimiento = N'Ingreso'
)
INSERT INTO dbo.AlmacenamientoPartidas
    (EmpresaId, SiloId, IngresoAlmacenamientoId, CosechaId, CampaniaId, Producto, FechaIngreso, KgIniciales, KgRestantes)
SELECT i.EmpresaId, i.SiloId, i.AlmacenamientoId, i.CosechaId, i.CampaniaId, i.Producto, i.Fecha, i.Cantidad,
       CASE
           WHEN i.Acumulado <= i.StockSilo THEN i.Cantidad
           WHEN i.Acumulado - i.Cantidad < i.StockSilo THEN i.StockSilo - (i.Acumulado - i.Cantidad)
           ELSE 0
       END
FROM Ingresos AS i;

-- Si el stock supera la suma de ingresos registrados, la diferencia queda como partida inicial.
INSERT INTO dbo.AlmacenamientoPartidas
    (EmpresaId, SiloId, IngresoAlmacenamientoId, Producto, FechaIngreso, KgIniciales, KgRestantes)
SELECT s.EmpresaId, s.SiloId, NULL, s.Producto, CAST(s.FechaCreacion AS DATE),
       s.CantidadGranoAlmacenado - ISNULL(t.TotalIngresos, 0),
       s.CantidadGranoAlmacenado - ISNULL(t.TotalIngresos, 0)
FROM dbo.Silos AS s
INNER JOIN @SilosAReconstruir AS r ON r.SiloId = s.SiloId
LEFT JOIN (
    SELECT SiloId, SUM(Cantidad) AS TotalIngresos
    FROM dbo.Almacenamientos
    WHERE TipoMovimiento = N'Ingreso'
    GROUP BY SiloId
) AS t ON t.SiloId = s.SiloId
WHERE s.CantidadGranoAlmacenado > ISNULL(t.TotalIngresos, 0);

COMMIT TRANSACTION;
GO

-- Verificacion: tiene que volver vacia.
SELECT N'Partidas no cuadran' AS Revisar, s.SiloId, s.Nombre,
       s.CantidadGranoAlmacenado AS StockSilo, ISNULL(p.Kg, 0) AS KgEnPartidas
FROM dbo.Silos AS s
LEFT JOIN (
    SELECT SiloId, SUM(KgRestantes) AS Kg
    FROM dbo.AlmacenamientoPartidas
    GROUP BY SiloId
) AS p ON p.SiloId = s.SiloId
WHERE ISNULL(p.Kg, 0) <> s.CantidadGranoAlmacenado;
GO
