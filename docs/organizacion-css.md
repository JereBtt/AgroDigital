# Línea base para organizar los estilos del frontend

Fecha: 31/10/2026. Rama: `organizacion-frontend-segunda-capa`. Punto de partida: `adf32ff856bda8fb08a0667a76028ed1f8e70f7d`.

`src/main.jsx` importa `src/styles.css`. Vite también incorpora al CSS final las hojas importadas por componentes. La línea base se obtuvo con `npm run build` desde `frontend/AgroDigital.Web`, sin cambios de estilos.

| Archivo | Tamaño | SHA-256 |
| --- | ---: | --- |
| `src/styles.css` | 259.618 bytes; 11.981 líneas | `692BBD78929A03C67B560C0F1A3E5EB7556AD1015807FEA9B54BA33CC79365EA` |
| `dist/assets/index-QRaE5sgT.css` | 247.103 bytes | `CB3EF9628D051B32220C08335ABC0C1C1019A49DA65846B1BFF0770891C48FCD` |

La compilación terminó correctamente. Vite informó el aviso ya existente de un chunk JavaScript mayor a 500 kB. `dist/` es salida generada y no se versiona como referencia; el commit de partida permite reconstruirla.

## Comprobación de cada extracción

1. Mantener el orden original de las reglas y de las hojas importadas. No cambiar valores ni eliminar reglas durante un traslado.
2. Ejecutar `npm run build` y calcular el SHA-256 del CSS resultante con `Get-FileHash dist/assets/index-*.css -Algorithm SHA256`.
3. Si la huella coincide con la línea base, el CSS generado es idéntico. Si difiere, comparar el contenido compilado y revisar la cascada antes de continuar.
4. Comprobar visualmente las pantallas afectadas en ancho de escritorio y móvil, incluidos menús, formularios, tablas, mapas y modales.

El recorrido visual previo al primer traslado queda pendiente de ejecución con una sesión funcional del sistema. En particular, conviene revisar Acceso/Perfil, Lotes, Campañas, Siembras/Cosechas, Silos/Almacenamiento/Distribución y las pantallas de estadísticas e IA.
