---
description: Cierre del día — dejar el pipeline de órdenes de compra al día
---

# Cierre del día — órdenes de compra

Rutina corta, para correr al final del día. **No lleva archivos ni descargas**: el pipeline
se revisa contra sí mismo y contra el calendario. Debería tomar dos minutos.

El objetivo no es sincronizar —eso ya pasa solo— sino que el pipeline **refleje la realidad**:
las órdenes nuevas cargadas, y los estados y fechas puestos al día.

**Lo que NO hace falta hacer:** apretar ningún botón de sincronizar. Cada edición se manda a la
hoja de Google automáticamente, y al abrir la app se trae lo de la hoja. Si Juan carga una orden
desde otra máquina, aparece sola.

---

## Paso 1 — Preguntar qué pasó hoy

Una sola pregunta, abierta:

> ¿Se puso alguna orden nueva hoy, o cambió alguna que ya estaba (zarpó, llegó, se canceló,
> se movió la fecha)?

Si no pasó nada, saltá al Paso 2 igual — el chequeo encuentra cosas que se desactualizan solas.

Para cada orden **nueva**, lo mínimo para que entre al plan de compra:

| Campo | Por qué importa |
|---|---|
| **PO** | es la llave: el inventario del lunes matchea los lotes por número de PO |
| **Producto** | sin esto se asume ginger, y una orden de turmeric inflaría el plan de ginger |
| **Cases** | el volumen que el Buy Planner va a contar como que viene en camino |
| **Fecha de llegada** | **sin esto la orden no existe para el plan** — no la puede poner en ninguna semana |
| Proveedor, modo (sea/air), CIF, flete | para el costo puesto en almacén; no frenan el plan |

Si falta la fecha de llegada, sale de WholesaleWare → Purchase Orders (scheduled delivery date).
**No la inventes** — alimenta los días de almacenamiento y el FEFO. Si no aparece, cargá la orden
igual y dejala marcada como pendiente.

## Paso 2 — Correr el chequeo

Que Juan pegue esto en la consola:

```javascript
fetch('tests/orders-check.js?v='+Date.now()).then(r=>r.text()).then(eval)
```

Devuelve lo que se desactualiza solo, ordenado por gravedad:

- **Estado que se quedó atrás** — zarpó hace días y sigue en *Contracted*, o llegó y sigue
  *En tránsito*. Es lo más común: nadie vuelve a abrir una orden que ya salió.
- **Sin fecha de llegada** — el plan no la ve en ninguna semana.
- **Costos faltantes** — no frenan la compra, sí rompen el costo puesto en almacén.
- **POs duplicadas** — dos filas del mismo número inflan el pipeline al doble.
- **Lotes de inventario sin orden** — hay stock en cámara cuya orden no existe: sin costo ni
  trazabilidad. Suele ser una PO que nunca se cargó.

Y al final, **lo que llega en las próximas 3 semanas**.

## Paso 3 — Arreglar lo que salió

Los de gravedad **alta** se arreglan hoy; los demás pueden esperar, pero decilos.

Los cambios se hacen en la pestaña **Orders**, editando la orden. Cada guardado va solo a la hoja.

## Paso 4 — Cerrar

Tres o cuatro líneas, no más:

- qué se cargó o cambió hoy
- qué quedó pendiente y por qué
- qué llega esta semana y la que viene
- si algo de eso mueve la compra, decilo — si no, no lo menciones

---

## Cosas que conviene no olvidar

- **Una orden sin producto se cuenta como ginger.** Es back-compat deliberado (las órdenes viejas
  no tenían el campo), pero significa que una orden nueva de turmeric sin marcar **infla el plan
  de ginger**. Revisalo siempre en las nuevas.
- **Una PO que no está en Orders no se puede cargar como lote** el lunes. Si el chequeo muestra
  lotes sin orden, esa es la causa y se arregla acá.
- **`Cancelled` no se borra.** Cancelar mantiene el registro; borrar pierde la historia.
- **`localStorage` es por dispositivo**, pero las órdenes sí viajan por la hoja de Google. Lo que
  no viaja es el inventario ni el History.
- **Sheet sync "unauthorized / timed out"** en el primer pull del día = arranque en frío de Apps
  Script, no el token. Reintentá una vez.
- **Nunca pedirle a Juan que pegue el token de la API en el chat.**

## Ver también

- `.claude/commands/lunes.md` — la rutina semanal completa
- `tests/orders-check.js` — el chequeo que corre el Paso 2
