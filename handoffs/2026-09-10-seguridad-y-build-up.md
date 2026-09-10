# Handoff — Importer validado, build-up consistente y endurecimiento de seguridad

**Fecha:** 2026-09-10 · **Ejecutado por:** Opus 5 en Claude Code.
**Sesión origen:** `cb0fa774` (empezó validando el importer del handoff anterior y terminó en
rotación de token, CSP y procedencia de librerías).

## Estado

- **Todo commiteado hasta `2ef413b`**, árbol limpio, **en GitHub y desplegado**: md5 de lo servido
  por Pages = md5 local (`4418d5f9…`). Nueve commits, de `958f5a3` a `2ef413b`.
- **El backend también está al día.** Juan desplegó `backend/Code.gs` hoy — el que corría era más
  viejo que el repo. Verificado por sus dos firmas: un token inválido ahora responde en ~2 s con
  `{ok:false}` (antes no llamaba al callback y el cliente se colgaba) y ya no escribe filas `DENIED`
  en el AuditLog.
- **Suite: 466 checks, exit 0** (406 demanda + 42 runbook + 18 Inventory Report).

## Lo que se cerró

1. **Importer validado contra datos reales.** Con el parser de producción sobre el archivo del
   09.07: **ginger bruto 3.217, libre 2.250** (committed de la semana 2026-09-07 = 967, que es
   exactamente el número del handoff anterior). La fila de reempaque aporta 1.085 cs (33,7%); sin
   ella el bruto caería a 2.132. Quedó como test permanente: `tests/inv-report-check.py`.
2. **`nowcastProductModel`** (`b8cb40e`). Las dos salidas tempranas ya no se comen la rama `prelim`,
   así que garlic y shallots vuelven a mostrar W36/W37. **Decisión de Juan:** las semanas `prelim`
   se MUESTRAN pero **no promedian** — misma regla que la semana en curso. Verificado: el run-rate
   no se movió ni un lb (3000/3000 en el escenario de garlic).
3. **Build-up consistente** (`9e9b2b1`). La semana en curso siempre tiene columna, aunque esté en
   cero — antes garlic la perdía entera, con sus 210 cs reservadas adentro. Las `prelim` tienen
   marca propia (**○ hueco = no cuenta**) distinta del **● lleno** de las completadas, que sí
   promedian. Y la banda "last N wk" cuenta solo las semanas que de verdad promedian.
4. **Pipeline de órdenes al día.** Dos órdenes pasadas a `Arrived`: `2629655` (ginger, 975 cs) y
   `2667534` (shallots, 100 cs) — **1.075 cajas que se contaban dos veces**, como stock y como
   mercadería en camino. Verificado con push + pull contra la hoja. Script reutilizable:
   `tests/orders-arrived.js`.
5. **Token rotado** y verificado de ida y de vuelta. Ver [[security-model]].
6. **CSP fijada al deployment exacto de Apps Script** (`b561568`). Antes, con `script.google.com` a
   secas, un XSS podía mandar el token al `/exec` de cualquiera — es un dominio compartido y
   publicar ahí es gratis. Probado en navegador: nuestro `/exec` pasa, otro deployment queda
   bloqueado en `script-src-elem` y en `connect-src`.
7. **xlsx 0.18.5 → 0.20.3** (`fff74ef`) y **procedencia de las cuatro librerías** (`006c056`),
   ambas documentadas en `vendor/README.md`.
8. **Tests: cada grupo arranca con el entorno limpio** (`2ef413b`), con guardián propio.

## Diagnósticos míos que resultaron FALSOS — no re-usarlos

- **"`jsonpGet` se cuelga para siempre porque no tiene timeout": FALSO.** Tiene timeout de 45 s y
  un callback aleatorio por llamada. Lo que vi fue una pestaña en segundo plano con los timers
  estrangulados por Chrome.
- **"la pastilla verde salía de una respuesta JSONP cacheada": FALSO.** El callback aleatorio hace
  que la URL nunca se repita, así que no hay caché posible.
- **La causa real de los dos síntomas** era que el Apps Script desplegado era más viejo que el
  repo, y el repo ya traía los dos arreglos sin desplegar. El handoff anterior lo decía ("pegar
  `backend/Code.gs` y desplegar") y yo convencí a Juan de saltearlo. Ya está desplegado.

## Pendiente — en orden

1. **Correr `/lunes`.** Es la primera vez que el importer procesa archivos con xlsx 0.20.3. **El
   número que valida:** en el modal, ginger bruto **~3.217**; si muestra ~2.132, el deploy no entró.
   Comparé las dos versiones campo por campo contra los tres reportes del 09.07 y solo cambian
   `PO Notes` y `Lot Notes` (`\r\n` → `\n`), que tienen cero usos en la app.
2. **Michael: pegar el token.** Le llegaron **dos** mails con 19 s de diferencia y **solo sirve el
   segundo**. Hay que hacerlo en cada navegador. Instrucciones en inglés ya redactadas en el chat.
3. **Michael: tres respuestas** que ninguno de los dos puede contestar solo:
   - **Sol-ti, 700 cs de ginger** marcadas como committed sin despachar (22% del stock). Si ya
     salieron, están restando stock que no existe. Ya pasó igual el 2026-09-03 con 1.000 cs.
   - **PO 2667517** — garlic, 140 cs, llegada estimada el 04-sep y **sin lote físico** en el
     Inventory Report. ¿Llegó y no se recibió en WholesaleWare, o se atrasó? **No tocarla sin
     respuesta:** marcarla `Arrived` sin mercadería empuja a comprar de menos.
   - **Lote de garlic `2674085-0001` en −70**, que solo existe en el Sales Desk.

## Cosas del método que conviene no repetir

- **Un harness puede probar su propio andamio.** El test viejo del importer daba verde con el bug
  porque le fabricaba una orden a cada PO del archivo, W-lots incluidos — construía el mundo donde
  el bug no existe. Al armar datos sintéticos, preguntarse qué parte de la realidad se está
  inventando a favor del código.
- **El repo manda sobre el handoff, pero también hay que dudar del backend.** `backend/Code.gs`
  puede no ser lo que corre. La señal que lo delató: filas en el AuditLog con un texto que no
  existe en ningún lado del repo.
- **Verificar contra el servidor, no contra la UI.** La pastilla decía `Token ✓` mientras el
  backend rechazaba todo. El AuditLog era la verdad.
- **`pushOrdersToSheet` usa `no-cors`**: la respuesta es opaca y el código *asume* éxito. Para
  probar que una escritura entró, hay que traerla de vuelta con `pullOrdersFromSheet`.
