# Handoff — Reempaques, pausa de mercado y lotes viejos; cuenta modelada en el Simulator; Jamuve y compradores

**Fecha:** 2026-09-17 · **Ejecutado por:** Claude Opus 5 en Claude Code.
**Sesión origen:** `1f65ddda` (compradores de ginger en Gmail, alta de Jamuve en WholesaleWare, cuenta modelada en el Simulator). Los commits del 14 y 15/9 hasta `d11be74` son de la sesión `7892ce8b`, que no dejó handoff.

## Estado

- `main` en **`8a93c9f`**, árbol limpio, **igual a `origin/main`**.
- **Desplegado:** Pages sirve el HTML idéntico byte a byte a `8a93c9f` (curl + cmp, 17/9). Falta Cmd+Shift+R.
- Suite: **1.289 + 49 + 18 checks, exit 0** (17/9).
- Ramas remotas ya mergeadas, se pueden borrar: `audit-3-modos-tanda3`, `ginger-calendario`, `wlot-table`.
- `2026-09-14-auditoria-ginger-cody.md` quedó superado por este.

## Lo que se arregló / se decidió

- **`1224cb9` + `d1cdb2f` — las órdenes sin facturar retienen sus cajas** (`cmUnbilled`) → [[wlot-invoice-lag-monday]]. El 14/9 eran 846 cs de ginger contadas como libres: Available bajó de 2.835 a **1.989** y la orden por mar pasó de mié 30/9 a **mié 23/9**. Solo retiene si la orden tiene `lot` (import nuevo del Unshipped).
- **`d1024e1`, `b4ecd24`, `5273f2a` — Repack follow-up** dentro de la tabla "Repacked — River Road" → [[wlot-follow-up]]. Vocabulario de Juan: "Fulfillment" y "Fix in WholesaleWare".
- **`e454505` — un origen en cero no desaparece:** también entra el que tiene proveedor y ventas en 6 meses (volvió turmeric-Hawaii).
- **`d22d788`, `d2ce0c6` — "not available in the market"** por línea → [[market-pause-rule]]. Turmeric-Hawaii quedó marcado con fecha 15/9.
- **`d11be74` — lotes viejos:** proveedor >45 días, River Road >20 → [[old-lot-flags]]. **Verificado en vivo el 17/9** (Chrome de Juan, solo lectura, datos del 14/9): 4 lotes de proveedor (ginger Hawaii 1, turmeric Fiji 3) y 12 reempaques (ginger Perú 2, ginger Hawaii 2, turmeric Fiji 3, turmeric Hawaii 3, garlic 2), lo mismo que el mockup; turmeric·Fiji muestra el recuadro y 6 marcas.
- **`dc30e89` — cuenta modelada por escenario** → [[scenario-modeled-account]]. Si los escenarios de una cuenta suman una semana de su promedio, su run-rate se apaga desde su primer escenario en adelante (Sol-ti: −185 cs/sem). El Buy Planner no cambia.
- **`8a93c9f` — test frágil:** "el nuevo no" buscaba `/[45] days/`, que también matchea "84 days"; ahora compara los números.

**Decidido, no re-abrir:** la regla de 6 semanas y estimado de 4 de la pausa; los excluidos siguen marcados; el corte del escenario (una semana de promedio, solo hacia adelante). En la semana propia del escenario, una cuenta OD sigue reemplazando su promedio aunque el escenario sea chico: ya era así y Juan lo sabe.

**FALSO:** dije en el chat que el test de lotes viejos mostraba un lote de 4-5 días marcado. NO: las marcas reales eran 141, 84 y 91 días. La regla estaba bien; el test era el roto.

## Pendiente — en orden

1. **Orden de ginger por mar, antes del mié 23/9.** Con los datos del 14/9 la app daba esa fecha; rehacerla después del `/lunes` del 21/9.
   Valida: en Committed aparece "incl. N not invoiced". Si hay órdenes de semanas pasadas abiertas y no aparece, esas órdenes no tienen `lot`: re-importar el Unshipped.
   Si se usa el Simulator con embarques de Sol-ti, tiene que aparecer "modeled by scenario from W… · run-rate off (−185 cs/wk)".
2. **`/lunes` del 21/9.** Paso 2: el Unshipped del 14/9 traía **846 cs** comprometidas en semanas ya pasadas. Paso 5: lotes viejos y Repack follow-up en el reporte.
3. **Dar de baja en WholesaleWare dos W-lots devueltos hace 8-9 meses:** turmeric HI 72 cs `W1832B1917641` y garlic 5 lb 50 cs `W1996A2031125`. Valida: no están en el Inventory Report del 21/9.
4. **Turmeric-Hawaii en pausa desde el 15/9 — la fecha está bien.** La última venta fue el **8/9** (4 cs a Whole Foods; antes, 40 cs el 28/8). Regla de Juan: la semana de la última venta es la última que cuenta; con el 15/9 cuenta la del 7/9 y desde la del 14/9 no.
   **[JUAN]** ¿en agosto tampoco hubo producto? Whole Foods compró en 4 de las 5 semanas del 6/7 al 7/8, y después solo el 28/8 y el 8/9. Si no hubo, la fecha pasa al 10/8 con "Change dates". Si queda el 15/9, los ceros del 10, 17 y 31/8 cuentan y, si vuelve hasta el 27/10 (6 semanas), el plan arranca con ~12 cs/sem. Al volver: fecha y estimado de arranque.
   Valida: compra 0 y la barra con la fecha elegida.
5. **Pedido 2674160** (turmeric·Fiji para Sol-ti): el proveedor confirmó entrega el **17/9** → pasarlo a Arrived. Valida: sale de "en camino" de turmeric·Fiji.
6. **Jamuve LLC (fuera del repo, WholesaleWare).** Cliente creado con contactos, dirección de pago y notas. Falta:
   - Payment Terms en **PACA 10**: quedó "Due on receipt" y con el usuario de Juan no hay dónde editarlo;
   - subir la solicitud a Documents: "An exception occurred on the server" dos veces, no se creó nada;
   - el Tax ID en Notes, que lo escribe Juan;
   - pedirle al cliente referencias comerciales y bancaria, contacto de recall, correos de AP y passing, y quién retira.
   Valida: la tarjeta dice PACA 10 y Documents lista "New Customer Form".
7. **Compradores con el paso en nuestra cancha (fuera del repo):** Generous Brands (muestras prometidas el 4/9), Farm on Central (cotización de semilla por aire prometida para la semana del 7/9), J's Kombucha (documentos de inocuidad pedidos el 29/4, sin respuesta), Fresh Fizz Sodas (sin respuesta desde el 29/5). Para seguir: Harvest Sensations, Rachel's Ginger Beer, State Garden, Charlie's Produce y Midwest Juicery (prensa jengibre fresco en su planta). Detalle en la sesión `1f65ddda`.
8. **Probar en navegador real:** del 14/9, "Copy email" / "Save as PDF", "Thu before delivery" y "ships from cooler"; nuevo, la línea "modeled by scenario" y el botón "keep run-rate".
9. **Máquina de Michael:** recargar. Valida: recibe las 7 POs marcadas y la pausa de turmeric-Hawaii (`marketPauses`), y su run-rate de turmeric baja.
10. Repack follow-up **fase 2** (historial de W-lots terminados): acordado, sin empezar.
11. Opcional: borrar las 3 ramas remotas mergeadas.

**Espera a Juan:**
- **Lead time de mar:** el código tiene 37 días y lo real son 36. Con 37 se ordena una semana antes (más stock, más conservador); con 36, una semana después, y la orden igual protege.
- **Cuándo ordenar ginger** (punto 1) y **si en agosto ya faltaba turmeric-Hawaii** (punto 4).
- **Filtro "30+ / 45+ days" de Inventory:** quedó al lado del recuadro de lotes viejos porque lo había pedido Juan y tiene tests (U28 y `lot-tables-guard.py`). Si le sobra, se saca.
- **Jamuve:** PACA 10 sin referencias o pago anticipado. El riesgo es de cobro, no de compra.
- **Los handoffs son públicos:** Pages sirve `handoffs/*.md` (HTTP 200). Decidir si se sacan de ahí.
- Opcional: nivel de servicio 95% → 97% (colchón de ~2,1 a ~2,4 semanas).

## Cosas del método que conviene no repetir

- **Handoffs públicos:** acá no van contactos, precios dados a prospectos, tax IDs ni datos bancarios.
- **Commit directo en `main`:** confié en la rama que decía el arranque (`old-lots`) y el repo ya estaba en `main`. Justo antes de commitear: `git branch --show-current`, `git fetch` y `git log -1` → [[desktop-commits-mid-work]].
- **Regex sobre números en los tests:** `/[45] days/` también matchea "84 days", y el día que da depende de la hora. Extraer el número y compararlo.
- **WholesaleWare desde Chrome** → [[wholesaleware-customer-setup]]. **Búsquedas en Gmail** → [[gmail-search-tips]].
