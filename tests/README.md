# Tests del cálculo de demanda

Dos herramientas. **Las dos hacen falta** — no se reemplazan entre sí.

## 1. `./tests/run.sh` — antes de cada deploy

```bash
./tests/run.sh
```

Corre en segundos, sin navegador y sin datos. Levanta las funciones reales del HTML
(`extract.py` las saca por nombre) y las prueba con datos sintéticos. Si algo falla,
sale con código 1 y dice exactamente qué.

Cubre los invariantes que se rompieron el 2026-09-01:

- Las ventas de **lunes** caen en su propia semana (el bug más escondido: martes a
  domingo estaban bien, así que todo cuadraba y las semanas estaban corridas igual).
- La ventana del run-rate es **calendario-continua**: una semana sin ventas cuenta
  como cero, no desaparece.
- Una orden reservada para una **semana futura** no entra al historial.
- El volumen **order-driven** no se promedia; **direct-ship** y **otros orígenes** no
  entran a ningún agregado de stock.
- Un **override manual** de run-rate aplica en las tres ventanas y sobrevive al nowcast.
- En el build-up: **clientes + Other = TOTAL** en toda columna, y el desglose de "Other
  small accounts" suma exactamente esa fila.

Para probar que el harness sirve, corrélo contra una copia con un bug metido a mano:

```bash
./tests/run.sh /ruta/a/una/copia-rota.html
```

## 2. `tests/invariants-console.js` — contra datos reales

Con la app abierta y los datos cargados, pegá **esta línea** en la consola del navegador:

```js
fetch('tests/invariants-console.js').then(r=>r.text()).then(eval)
```

Lo trae del propio sitio, así que siempre corre la última versión y no hay que copiar
nada a mano. (Si la app está abierta como archivo local en vez de desde el sitio, el
`fetch` no va a funcionar: ahí sí, pegá el contenido del archivo entero.)

`run.sh` prueba que el modelo sea consistente **consigo mismo**, y eso no alcanza: el
bug de los lunes tenía las dos mitades del sistema de acuerdo, y las dos equivocadas.
Este script sale a comparar contra afuera, en tres niveles:

| Nivel | Compara | Detecta |
|---|---|---|
| 1 | modelo vs recálculo independiente de las filas crudas | errores de bucketing, filtro, origen, conversión lb→cajas |
| 2 | invariantes sobre los datos vivos | ventanas con saltos, filas que no explican el run-rate, cuentas internas coladas |
| 3 | filas crudas vs **WholesaleWare** | pérdida de filas al cargar el archivo — lo único que los otros dos no ven |

El nivel 3 es manual y es el más valioso: el script imprime los totales de libras por
semana con su rango de fechas; sacás el **Sales By Account Report** de WholesaleWare
para ese mismo rango y comparás el total. Si coinciden, el dato entró completo.

Cualquier fila con `dif_vs_crudo ≠ 0` o `saltos ≠ 0` es un bug.

## Por qué corren así

La app es un solo HTML sin build step, y `node` normalmente no está instalado en esta
máquina. `run.sh` usa `osascript -l JavaScript` (JavaScriptCore, viene con macOS), así
que no hay nada que instalar. Como `extract.py` lee el HTML real en cada corrida, los
tests no se pueden desincronizar del código de producción.

**Un `SyntaxError` es una falla real. Un `ReferenceError` de runtime probablemente
signifique que el código bajo prueba empezó a usar una función nueva** — agregala a
`stubs.js` o a la lista de `extract.py` en `run.sh`.
