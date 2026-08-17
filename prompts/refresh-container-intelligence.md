# Refresh de datos — Container Intelligence (el ORDEN importa)

Cada vez que actualizás la demanda del app, seguí estos **2 pasos en este orden**.
Es lo que mantiene "lo facturado" y "lo committed" sin pisarse ni dejar semanas cojas.

## Regla de bolsillo
> **Excel primero, committed después. Siempre.**

---

## Paso 1 — Subir el Sales By Account fresco
- Bajá un **Sales By Account nuevo (de hoy)** de WholesaleWare.
- Subilo en el app → pestaña **Demand** (upload de ventas).
- Esto **avanza el `dataMax`** (la fecha hasta donde hay facturación real).
- **Efecto:** las semanas ya asentadas se llenan/completan con las ventas facturadas.
  (Ej.: Wk31 aparece completa recién cuando el Excel ya la tiene facturada.)

## Paso 2 — Re-importar el committed (SIEMPRE después del Paso 1)
- Bajá de WholesaleWare el **Unshipped Sales Order Report** (.xlsx/.csv) — el libro de órdenes abiertas.
- Demand → panel **"Committed orders"** → **import** → subilo **directo** (el app lo parsea nativo:
  detecta el formato anidado, hace forward-fill de la cabecera a las líneas, y filtra `SKU=OG-GIN-30Lbs-PR`).
  Ya no hace falta generar el `committed_ginger_open_orders_*.xlsx` a mano.
- El importador **re-filtra contra el nuevo `dataMax`** y **saca solo lo que ya se facturó** (y los strays viejos).
- **Efecto:** las órdenes abiertas/futuras quedan como committed; lo que cruzó a facturado se va solo → **sin doble conteo**.

---

## Por qué el orden importa
- **Excel = pasado facturado · Committed = futuro/abierto.** La frontera entre ambos es el `dataMax` del Excel.
- Subiendo el **Excel primero**, esa frontera avanza; **re-importando committed después**, se limpia solo lo que cruzó.
- Si re-importás committed **antes** de subir el Excel, filtra contra el `dataMax` viejo → una orden puede quedar
  contada dos veces hasta el próximo refresh.

## Cómo se ve una semana en curso (ej. Wk32)
No hace falta que esté todo facturado. La parte facturada entra por el Excel; el resto lo cubren los committed.
El Buy Planner usa un **modelo híbrido** por semana (reemplazó al viejo `max(committed, run-rate)`):
cuentas **order-driven** (lumpy, ej. Sol-ti) → su committed en las semanas que pidieron, y retoman su run-rate
más allá del último committed; cuentas **steady** → run-rate cada semana + solo el excedente committed por
encima. Igual: los committed cubren la semana en curso → se muestra **completa**, no a medias.
(Las cuentas quiet ahora se cubren por defecto; sacarlas es manual.)
