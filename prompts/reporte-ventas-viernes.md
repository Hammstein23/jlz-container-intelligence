# Reporte de ventas semanal — runbook (cierre de viernes)

> **Qué es:** el reporte comercial semanal para el dueño/CEO. Responde de un vistazo **"¿vamos bien o mal?"**.
> **Cadencia:** los **viernes al cierre (EOD)**, con la semana ya despachada. Mid-semana: on-demand. Diario NO
> (las decisiones son de horizonte semanal).
> **Cómo se corre:** una sesión nueva de Claude Code ejecuta este archivo entero.
>
> **Precondiciones (si falta algo, PARÁ y avisá a Juan — nunca inventes un número):**
> 1. Claude Code abierto · 2. **Chrome logueado en `erp.wholesaleware.com`** (si aparece la página pública
>    con "Log In", la sesión cayó → pedir re-login; no puedo loguear yo) · 3. **Gmail (juan@jlzproduce.com)** conectado.
>    Ojo: la sesión de WholesaleWare **tiene timeout corto y se cae seguido** — reconfirmar login entre bloques largos.

---

## SALIDA
Un **artifact HTML ejecutivo, en inglés** (es deliverable; la conversación con Juan es en español).
Look sobrio y profesional: **sin emojis**, titulares en serif, paleta apagada, ▲▬▼ como notación, semáforos.
Referencia visual: el último `scratchpad/reporte-ventas-wkNN.html`. Secciones, en este orden:

1. **Masthead** — "JLZ Produce · Weekly Sales Review" + "Week NN — Sales Close" + período + "as of Friday…".
2. **Bottom line** — 1–2 frases con el **veredicto honesto** (incluida la trampa "revenue arriba / margen abajo" si aplica).
3. **Scorecard** — 5 filas, cada una con semáforo 🟢/🟡/🔴 + veredicto de una palabra:
   **Revenue · Margen · Pricing power · Concentración · Pipeline**. Este ES el resumen — **NO** hacer un
   "executive summary" en prosa aparte (redundante).
4. **Headline figures** — Booked / Allocated / Invoiced.
5. **Weekly trend** — 10 semanas, base *booked*, barras + línea de promedio, semana en curso marcada.
6. **Forward pipeline** — semanas futuras, por orden con producto + supply flag.
7. **Price movement vs last time** — por cliente, ▲▬▼ / NEW + nota de margen.
8. **Revenue by account** — tabla de concentración con % share.
9. **Detail by product and customer** — con **precio de venta por cliente**, orígenes/pesos separados.
10. **Footer** — definitions, conventions, sources, in-development.

---

## REGLAS DE DATOS — nunca violar (negocio, no negociable)
- **FUENTE ÚNICA por semana. NUNCA mezclar/sumar dos fuentes para la misma semana** (duplica). Clave = **Order No**.
- **Semana en curso + detalle + forward + recientes (Wk actual y ~2–3 atrás): WholesaleWare LIVE.** El Excel
  sub-cuenta las semanas recientes (corta en su fecha de bajada) → esas NO salen del Excel.
- **El Excel de Sales By Account es SOLO para: histórico asentado (tendencia vieja), precio-vs-última-vez, y margen.**
  Nunca se cruza con la semana en curso.
- **Base *booked*** para la tendencia (allocated + invoiced cuentan igual; lo allocated se vende, cancelaciones ~nulas).
  No usar "facturado a hoy" (el lag castiga a las semanas recientes).
- **Orígenes nunca se mezclan** (Perú / Hawaiian-USA / Fiji separados). **Pesos nunca se suman** como cajas crudas
  (5/10/30 Lb distintos; se puede mostrar equiv-30lb pero no sumar). **30 lb = constante.**
- Precio en el reporte = **precio de VENTA** (no FOB). Excluir no-producto (ej. *Che Che Plastics* = empaque) y CANCELED.

## GOTCHAS (aprendidos, ahorran horas)
- **Race del SPA:** la orden vuelve con `$0 / Cart(0)` si leés rápido → **esperar 5s** tras navegar; si igual vuelve
  en blanco, **releer con 7s**. Batchear con `browser_batch` (navigate→wait→get_page_text, grupos de ~4).
- **FOB vs Price:** la lectura a veces agarra la col FOB (costo) en vez de Price (venta). **Reconciliar cada orden:**
  `Σ(cajas×price)+extra charges = Order Total`. Si no cuadra, precio de venta = `(total−charges)/cajas` (1 línea) o
  leer la col Subtotal (multi-línea).
- **Status vocabulary:** NEW → PICKING → SHIPPED → INVOICED (+ CANCELED). Allocated = NEW+PICKING · Ejecutado = SHIPPED+INVOICED.
- **URL de fecha se ignora/clampa** en sesión fresca → usar el **date-picker de la UI** o los presets
  ("Past 30 Days", "Next 30 Days"). Paginación: usar `find`("pagination page 2/3/4") y click por ref.
- **Excel:** parsear con Python stdlib (`zipfile`+`xml.etree`), NO hace falta openpyxl; strings vienen inline.

---

## PASOS

### 1 · Semana en curso — detalle (WholesaleWare live)
- Sales Orders, Status = All, fulfillment = la **semana en curso** (lunes–domingo). Leer todas las páginas.
- Por cada orden (excepto CANCELED / no-producto): navegar a `…/#/sales-order/<id>`, **wait 5s**, `get_page_text`.
  Extraer por línea: **Item** (producto+peso+origen) · Origin · Order Qty (cajas) · Price · y a nivel orden
  Total/Extra Charges/Status/Fulfillment. **Reconciliar precio** (ver gotcha).
- Clasificar Allocated vs Ejecutado. Guardar la data cruda en scratchpad a medida (por si se corta la sesión).

### 2 · Tendencia 10 semanas (base booked)
- **Semanas viejas ya asentadas** → del Excel: `Σ Net Sales (col AM)` por **semana-de-fulfillment (lunes)**, Type=`Sale`.
  Verificar completitud mirando el `maxFulfill` por semana; si corta antes del domingo, está incompleta.
- **Semana en curso + las ~2–3 recientes** → **live de WholesaleWare** ("Past 30 Days", sumar Order Total por semana,
  excluir CANCELED). Una fuente por semana, sin blend.
- Graficar: barra por semana + línea de promedio de las asentadas; marcar la semana en curso (sólida — se vende).

### 3 · Forward pipeline (futuro)
- WholesaleWare, filtro **"Next 30 Days"**, Status=All. Órdenes con fulfillment **después** de la semana en curso.
- Por orden: Customer · fulfillment · Order Total. **Drillear las grandes** (Sol-ti u otras que muevan supply) para
  sacar PRODUCTO+cajas. **Supply flag:** volúmenes forward vs run-rate (ej. 700 cs turmeric ≈ 4× el run-rate → "confirmar inbound en Buy Planner").
- Cruzar con Gmail (confirmations recientes de `wholesaleware@grubmarket.com`) para no perder ninguna nueva.
- Va SIEMPRE separado del total de la semana y de la tendencia (no se suma).

### 4 · Price vs last time + Margen (del Excel — histórico)
Parsear el `Sales By Account Report-*.xlsx`. Columnas clave: A `Type` (solo `Sale`) · C `Item` · D `Customer` ·
H `Target Fullfillment Date` (MM/DD/YYYY) · V `Billable Units` · **W `Billable Delivered Price`** (precio/caja) ·
**AG `Billable FOB Price`** · **AM `Net Sales`** · **AN `Net Profit`** · **AP `Net Margin %`**.
- **Precio vs última vez:** por cada (Customer, Item) de esta semana, buscar la compra **más reciente antes del lunes**
  → ▲ subió / ▬ igual / ▼ bajó (con delta) · **NEW** si no hay previa. Nota de margen para SKUs finos.
- **Margen (el número del CEO):** `Σ Net Profit / Σ Net Sales` sobre ventana reciente asentada (~6–8 sem), overall
  **y por producto** (Sub Category col B). **Tendencia:** últimas 4 sem vs 4 previas (¿sube o baja?). Ojo:
  líneas "Freight/Uncategorized" dan 100% (inflan) → reportar por-producto para el número limpio.

### 4.9 · Alimentar Container Intelligence (committed orders) — el motivo original
El objetivo de todo esto era mejorar la **proyección de compra del jengibre peruano**. El feed viejo del app
(importar el reporte "Order vs Picked") está acotado por status → se pierde las futuras no-pickeadas (ej. Sol-ti
700 cs Wk34). El **forward book live** (Pasos 1+3) SÍ las tiene. Entonces:
- De TODAS las órdenes de **Ginger Perú 30Lb** abiertas/no-facturadas (semana en curso + forward), generar un **.xlsx**
  con header EXACTO: `SKU | Fulfillment Date | Order No | Order qty | Customer Name`, con `SKU=OG-GIN-30Lbs-PR`,
  Fulfillment Date en MM/DD/YYYY, Order qty = cajas. (Solo Perú 30Lb; el importador filtra el resto.)
- Generar el xlsx con Python stdlib (`zipfile`, inline strings — sin openpyxl). Smoke-test simulando `parseOpenOrders`
  (SKU filter · `iso<=fulfilledMax` anti-double-count · dedupe Order No|SKU · qty>0) antes de entregar.
- Juan lo importa en **Demand tab → panel "Committed orders" → import**. El app filtra por su `_dmModel.dataMax`
  (lo ya facturado sale solo → sin doble conteo). Referencia de código: `parseOpenOrders`/`dmcImportFile` (~L11489/L22097).
- **No se toca el app** — es solo generar el archivo que el importador ya sabe leer.

### 5 · Scorecard + Bottom line (el veredicto)
Con lo de arriba, armar los 5 semáforos y la frase de bottom line. Ser honesto: "revenue arriba pero margen abajo"
es un 🔴 en Margen aunque el top line sea 🟢. Concentración empeora si una cuenta (Sol-ti) domina semana + forward.

### 6 · Armar, publicar, avisar
Ensamblar el HTML (en inglés, tokens de diseño ejecutivos, sin emojis), publicar como **artifact** (mismo formato del
último wkNN), y resumirle a Juan en español los 2–3 hallazgos clave + el veredicto. Cerrar con qué no se pudo leer
o quedó excluido.

---

## NOTAS TÉCNICAS
- **Chrome tools** (claude-in-chrome): si están deferred, cargar en 1 sola llamada con
  `ToolSearch "select:mcp__claude-in-chrome__tabs_context_mcp,…navigate,…computer,…get_page_text,…browser_batch,…find,…read_network_requests"`.
- **Gmail** (mcp__…__search_threads/get_thread): confirmations = subject "JLZ Produce Sales Confirmation #<order>". Los PDF son imagen escaneada (extraer imagen y leer visual).
- **Menú Actions de Sales Orders NO exporta** a Excel (solo Print PDF / QBO / Import) — por eso se lee en vivo. Si algún
  día WholesaleWare habilita un export/API de "todas las órdenes con detalle", reemplazar el Paso 1/3 por eso
  (pregunta abierta con Guillaume, soporte WholesaleWare).
- **In development** (cuando Juan lo pida): dispatch schedule con follow-up flags · account momentum (quién se enfría,
  del Excel) · semáforo "vs meta" (necesita una meta semanal de Juan).
