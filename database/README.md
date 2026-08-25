# Base de datos - AgroDigital

Esta carpeta contiene los scripts y notas de la base de datos relacional de AgroDigital.

## Script madre

- `scripts/00_master_create_database.sql`

Este archivo debe conservar la creacion completa de la base de datos. A medida que se agreguen nuevos modulos, el script madre debe actualizarse para poder reconstruir la estructura completa desde cero.

## Primer alcance

El primer modulo modelado es Lotes, tomando como referencia funcional el Manual de Usuario:

- Nombre.
- Pais.
- Provincia.
- Ciudad.
- Condicion: Propio o Alquilado.
- Hectareas.
- Superficie total.
- Coordenadas de las esquinas del lote marcadas en el mapa.

