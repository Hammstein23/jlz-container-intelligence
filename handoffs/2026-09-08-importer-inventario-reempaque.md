# Handoff — Importer del Inventory Report + la fila de REEMPAQUE

**Fecha:** 2026-09-08 · **Ejecutado por:** Opus 5 en Claude Code.
**Sesión origen:** `8a3e4813` (larga: auditoría de seguridad → /lunes → importer → auditoría adversarial).

## Estado

- **Commiteado** en `d1a83c1` y anteriores: el importer completo (`invr*` + modal `#invr-modal`),
  el parser (`invmParseInventoryReport`), el plan de escritura (`invmInvReportPlan`), la fila de
  reempaque, `tests/repack-guard.py` y el runbook `.claude/commands/lunes.md` reescrito.
- **SIN commitear** (44 líneas, 3 archivos): `invmCanonSku` (SKU case-insensitive) + el freno de
  cero generalizado a todos los productos + sus tests.
- **Suite verde:** 383 checks (demanda) + 42 (runbook) + 4 guardianes python.
- **NO desplegado.** Juan todavía no corrió el importer en la app real ni una vez.

## Lo que se arregló (el hallazgo grande)

El store de ginger-Perú (`jlz_bp_inv_v2`) está keyeado por **orden de compra**. El número de un
W-lot lleva el **PO de MANUFACTURA** (`W2939A|2674126`), que por construcción **nunca está en
Orders** — la intersección entre POs de W-lots y de lotes reales es vacía, verificado.

Se perdían **1.189 de 3.213 cajas (37% del bruto)** mientras el committed que esos mismos W-lots
sirven **sí** se restaba. Libre 1.057 cuando eran 2.246. Era la causa real del "ginger 1.165"
(el diagnóstico anterior de "cargar el neto" estaba MAL). **Venía pasando todos los lunes.**

Arreglo: fila de reempaque `rows['W:'+lote] = {cases, repack:{lot,po,received,costCase,supplier}}`.
`bpInvLot` la lee sin orden; `invmCompute` solo descarta si no hay orden **ni** reempaque.
Ver [[monday-routine-redesign]] en memoria para el detalle completo.

## Pendiente — en orden

1. **Desplegar y probar en la app real.** Cmd+Shift+R, Inventory → `Import Inventory Report` →
   el XLS del día. **El número que valida todo: ginger bruto ~3.213, libre ~2.246.** Si sigue
   mostrando ~1.057, el deploy no entró.
2. **Rotar el token del backend.** Quedó en el chat cuando Juan pegó el Apps Script. Pegar
   `backend/Code.gs`, correr `jlzRotateToken()`, desplegar. Es la única exposición real abierta.
3. **BUG ABIERTO, diagnosticado y sin arreglar — `nowcastProductModel` (~línea 15896).**
   Garlic y shallots no muestran las semanas 36 y 37 en el build-up ni las promedian.
   Causa: el committed de esos productos es de cuentas **order-driven**, que se excluyen del
   promedio a propósito; al quedar `cbw` vacío la función hace `return m` **antes** de calcular
   `partial`, y deja inalcanzable la rama `prelim` (`else if(part>0)`), que existe justo para
   recuperar semanas con ventas facturadas y sin órdenes reservadas.
   Confirmado con datos vivos: garlic promedia hasta `2026-08-24`, `partialWeek` = null,
   `nowcastWeeks` = {}, y tiene committed solo en `2026-09-07` (210 cs).
   **Arreglo propuesto:** mover las dos salidas tempranas para después de calcular `partial` y
   dejar solo `if(!incWeeks.length) return m;`.
   **Decisión pendiente de Juan:** el arreglo simple incluiría la semana de corte aunque esté
   incompleta, lo que **bajaría** el run-rate (dirección peligrosa: comprar de menos). La variante
   segura solo la incluye si la semana ya está cerrada. Juan todavía no eligió.
4. **Sol-ti: 700 cs committed = 22% del stock.** El runbook frena el paso por encima del 10%.
   Confirmar con Michael si esa mercadería sigue en cámara o ya se despachó sin facturar (ya pasó
   el 2026-09-03 con 1.000 cs).
5. Menores: el lote `2674085-0001` de garlic en −70 que solo existe en el Sales Desk (para Michael);
   subir `xlsx` 0.18.5 → 0.20.x; decidir si se fija la CSP al deployment de Apps Script.

## Cosas del método que conviene no repetir

- **Mis tests daban verde con el bug** porque generaba órdenes sintéticas para *todos* los POs del
  archivo, W-lots incluidos. Circular. El test que vale usa solo POs de **compra** reales.
- **La auditoría adversarial (86 agentes × 2 corridas) fue el 13% del costo de la sesión.** El 87%
  fue releer la conversación: 3.730 llamadas con 458k de contexto de mediana. La palanca de costo
  no es cuántos agentes se lanzan — es cuánto dura la sesión.
