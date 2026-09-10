# vendor/ — las librerías, con su procedencia

Las librerías viven acá y no en un CDN: el HTML es público y la CSP es estricta, así que
un script de terceros cargado en caliente sería el agujero más grande de la app. Todo lo
que está en esta carpeta se sirve desde el mismo origen.

## Qué hay

| Archivo | Versión | Origen | SHA-512 |
|---|---|---|---|
| `xlsx.full.min.js` | **0.20.3** | `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` | `017ade0e6f…95a2ad00` |
| `chart.umd.min.js` | — | Chart.js | (sin registrar todavía) |
| `pdf.min.js`, `pdf.worker.min.js` | — | PDF.js | (sin registrar todavía) |

SHA-512 completo de `xlsx.full.min.js` (0.20.3):

```
017ade0e6fe6690b7df7e04a7ae57955463cc74c410193d7e8e61e9c74654701bf0b7e4f29c67b1905c84d347c65fddc2c77937f05432c430104f7fb95a2ad00
```

El de la versión anterior (0.18.5), por si hay que volver atrás:

```
af6da00a10e71af072964f74fb67bfc9caf7455ac38bc0c83a420636126529fbb240ce2d211008d3ad8c695f2c7e340a6151a338169904e03cef3f8885913d0c
```

## La excepción a la regla del CLAUDE.md — leer antes de actualizar

El CLAUDE.md dice: bajar la librería, **comparar su SHA-512 contra el que publica la
fuente**, y recién ahí commitear; y prohíbe explícitamente hashear lo descargado y confiar
en eso, porque eso certifica al atacante, no a vos.

**Con SheetJS esa regla no se puede cumplir al pie de la letra, y conviene saber por qué:**

- SheetJS **sacó el paquete de npm** después de 0.18.5 — que es, no por casualidad, la
  versión que estaba acá. La única distribución de 0.20.3 es `cdn.sheetjs.com`.
- Revisado el 2026-09-10: **no publican el hash del archivo en ningún lado** — ni en el
  índice del CDN ni en la página de instalación standalone.
- Al no haber segundo canal, lo único que autentica la descarga es el **TLS contra el
  dominio oficial**. Eso es lo que se usó, a conciencia, y queda escrito acá.

El SHA-512 de arriba no certifica nada por sí solo: sirve como **línea de base**. La
próxima vez que se toque este archivo, si el hash cambió sin que nadie lo haya actualizado
a propósito, eso sí es una señal.

Para las otras tres librerías la regla original sigue valiendo: Chart.js y PDF.js siguen
en npm y publican integridad, así que ahí sí hay contra qué comparar.

## Por qué se actualizó xlsx (2026-09-10)

0.18.5 arrastra dos problemas ya corregidos aguas arriba: prototype pollution (arreglado en
0.19.3) y un ReDoS (en 0.20.2). Los archivos que parsea la app vienen de WholesaleWare, así
que la exposición práctica era baja — pero el modelo de amenaza de esta app es literalmente
"un XSS y te roban el token del backend", y esta es la librería que toca todo archivo que
entra.

**Verificado antes de cambiarla**, parseando los tres archivos reales con las DOS versiones
y comparando campo por campo, con las opciones exactas de cada importador
(`{type:'array', cellDates:true}` para Inventory y Sales; `{type:'array'}` a secas para el
Unshipped, que lee las fechas como serial):

| Archivo | Filas | Diferencias |
|---|---|---|
| Inventory Report | 145 / 145 | solo `PO Notes` (2 filas): `\r\n` → `\n` |
| Sales By Account | 8.842 / 8.842 | solo `Lot Notes` (8 filas): `\r\n` → `\n` |
| Unshipped Sales Order | 74 / 74 | **ninguna** |

`PO Notes` y `Lot Notes` tienen **cero usos** en la app — son texto libre que no alimenta
ninguna lógica. O sea: no cambia un solo número.

Ojo con un detalle que apareció en la prueba: con `cellDates:true`, 0.18.5 devolvía las
fechas con **36 segundos de más** (12:00:36 en vez de 12:00:00) y 0.20.3 lo corrige. No
afecta al Unshipped porque ese importador no usa `cellDates` — pero si algún día se le
agrega, es un desfase menos del que preocuparse.
