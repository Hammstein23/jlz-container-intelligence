# Handoff — Auditoría de los 3 modos cerrada, calendario del contenedor de ginger y precorreo a Cody

**Fecha:** 2026-09-14 · **Ejecutado por:** Claude Opus 5 en Claude Code.
**Sesión origen:** `c402bbf0` (terminar la auditoría de los 3 modos de compra, aplicar todo, y lo que salió de revisar el Simulator).

## Estado

- `main` en **`f2ac4c5`**, árbol limpio, **igual a `origin/main`**.
- **Desplegado:** GitHub Pages sirve el HTML **idéntico byte por byte** a `f2ac4c5` (verificado con `curl` + `cmp`). Juan tiene que hacer Cmd+Shift+R.
- Suite: **1.086 + 49 + 18 checks, exit 0**.
- Quedan dos ramas remotas viejas y ya mergeadas: `origin/audit-3-modos-tanda3`, `origin/ginger-calendario`. Se pueden borrar.
- `handoffs/AUDITORIA-3-MODOS-estado.md` (882b6a1) **quedó superado** por este: la auditoría está cerrada.

## Lo que se arregló / se decidió

**Auditoría (82 hallazgos → 3 tandas + 2 decisiones).** Cada arreglo tiene un test que falla sin él (probado con mutantes):
- **Tanda 1** `c92c3ad..73d8895`: garlic/shallots perdían TODA llegada (origen de proveedor ≠ bucket del lote); las marcas made to order viajan al Sheet como setting `mtoMarks`; se preserva `downgraded`; Hawaii ≠ suministro de Perú; contenedores atrasados; FIFO y nowcast sin lo reempacado; etiquetas de Demand/Customers.
- **Tanda 2** `b4023b7..68688ad`: Simulator ↔ Buy Planner con el mismo horizonte, semana y colchón; lo cruzado en tránsito no resta stock libre (U24); la variabilidad no se infla con picos contra orden (U36); cobertura de ginger = libre ÷ salida.
- **Tanda 3** `19abc2d` + `8429e8b`: **U38**, el committed importado se convertía DOS VECES de pack (21 cajas de 10 lb → 7 → se contaban 2,33). **CLAUDE.md DECÍA LO CONTRARIO Y ESTABA MAL: el import YA guarda en la caja de compra.** Además: fechas de Home, merma en la proyección y modelo 'all'.
- `21abc4f` U07: el Simulator usa el colchón exacto (`ssCases`).
- `0f47e5a` U25: "ships from cooler" por orden y aviso ámbar cuando el committed cross-dock supera lo marcado. Una sola regla `_cmIsCrossDock` para los 7 lectores; el guardián la exige.

**Ginger-Perú por mar** (`7891fdf`, `c85f08f`, `e8ecf08`) → [[ginger-sea-calendar]]:
- Orden a más tardar el **miércoles**, entrega el **jueves**; el colchón se exige también el jueves antes de cada entrega.
- Todas las fechas (tarjeta, Home, tarjeta Sea, Simulator) salen de `bpSeaAnchor`.
- Las tablas muestran "Thu before delivery".

**Precorreo a Cody** (`f2ac4c5`): botón "Draft order email" en Buy Planner y Simulator. Cubre turmeric, garlic y shallots (ginger va solo de referencia). Tiene "Copy email" y "Save as PDF". No envía nada.

**Decidido, no re-abrir:**
- **U35** (`mtoByCustomer` sin origen) **no se hizo**: veredictos contradictorios (U46 refutado), latente, toca la función central de neteo. Re-abrir solo si un cliente compra el mismo producto de dos orígenes con marcas contra orden.
- **U25:** por defecto las órdenes de un cliente cross-dock NO restan stock. Restar por defecto sobre-compraba ~700 cs de turmeric, porque Sol-ti aparece en el Unshipped antes de marcar la PO.
- El calendario es **solo ginger-Perú** (pedido de Juan). El correo es **solo para los productos de Cody**.

## Pendiente — en orden

1. **`/lunes` con los reportes de hoy.** A las 10:30 lo más nuevo en Descargas era del 09-10.
   Números previos al update, para contrastar después:
   - shallots en camino **100**;
   - turmeric·Fiji en camino **150** (850 − 700 de Sol-ti), libre **174**, comprar **154**;
   - garlic en camino **0**, libre **424**;
   - marcas en el Sheet: **7 POs**.
2. **Orden de ginger — fecha límite miércoles 16/9.**
   - Simulator con las variables de Juan: sin fecha que proteja (piso inevitable). Orden **mié 16/9** → entrega **jue 29/10**, con ~1.550 cs el jueves (1,9 sem, colchón 2,1).
   - Buy Planner con datos reales: **mié 30/9 → jue 12/11**.
   - Demanda 812 cs/sem. Rehacer con el inventario nuevo.
3. **Lead time de mar: la app tiene 37 días, lo real son 36** (17/16/3). **[DECISIÓN DE JUAN]**
   - Con 36, la orden del 16/9 se entrega el jue 22/10, con ~2.360 cs ese jueves, y SÍ protege.
   - Con 37, la app pide un miércoles antes.
4. **Probar en navegador real** lo que no se pudo desde acá:
   - "Copy email" y "Save as PDF" del precorreo;
   - que "Thu before delivery" se lea bien;
   - botón "ships from cooler" y aviso en Demand → Committed orders.
5. **Máquina de Michael:** recargar. Debe recibir las 7 POs marcadas, y su run-rate de turmeric debe bajar (sale Sol-ti), como en la de Juan.
6. **Del handoff anterior, confirmar si siguen:**
   - órdenes vencidas sin facturar: 210 cs de garlic y 34 sacos de shallots, con entrega 09-10;
   - contenedor 2674160 a Arrived.
7. Borrar las ramas remotas `audit-3-modos-tanda3` y `ginger-calendario` (opcional).

**Espera a Juan:** el punto 3 (36 días), el punto 2 (cuándo ordenar) y, opcional, subir el nivel de servicio de 95% a 97% (colchón de ~2,1 a ~2,4 semanas).

## Cosas del método que conviene no repetir

- **Commits "Update" desde GitHub Desktop a mitad de trabajo** (pasó dos veces) → [[desktop-commits-mid-work]]. `git fetch` + `git log -1` antes de commitear; no reescribir lo pusheado.
- **Workflows:**
  - cada corrida gastó ~14M tokens y chocó con el límite de sesión;
  - un `agent()` que muere devuelve `null`, y el script lo contaba como voto refutador ("43 refutados" que eran 43 sin verificar); ahora es `sin-verificar` / `sin-parche`;
  - para colas chicas, hacerlo a mano sale una fracción.
- **Harness** → [[demand-test-harness]]:
  - `group()` solo restaura lo listado en `_PRISTINO_NOMBRES`; todo stub nuevo (incluidos `document`, `localStorage`, datos) va ahí;
  - las constantes top-level van en el `for _c in …` de `run.sh`;
  - `JLZ_HTML` se exporta;
  - un test clavado a un día de la semana falla sábados o lunes: calcular con la regla de la app.
- **Mutantes:** correr desde la carpeta del repo (`committed-guard.py` usa ruta relativa) y clasificar por FAIL del propio grupo, no por el exit code.
- **FALSO:** la memoria `committed-pack-units` atribuía al store un "21 cajas" que el import nunca guardó. Ya está corregida.
