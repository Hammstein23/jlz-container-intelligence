# Auditoría de los 3 modos de compra — estado al 2026-09-11 (PAUSADA)

Workflow `wf_c90da917-300`. Reanudar con:

```
Workflow({scriptPath: "/Users/juanjose/.claude/projects/-Users-juanjose-Library-CloudStorage-GoogleDrive-juan-jlzproduce-com-Mi-unidad-GitHub-jlz-container-intelligence/workflows/scripts/audit-three-buy-modes-wf_c90da917-300.js", resumeFromRunId: "wf_c90da917-300"})
```

NO editar el script: cualquier cambio invalida el hash y tira los 109 resultados cacheados.

## Avance

- 8 buscadores → **82 hallazgos crudos** (todos cacheados, no se re-corren)
- **101 de 246 veredictos** emitidos → faltan 145 + la síntesis
- 34 hallazgos con al menos un voto; 32 con votación completa

## CONFIRMADOS (17) — >=2 de 3 refutadores no pudieron tumbarlo

### [4-0] Origin-bucket filter silently drops EVERY garlic and shallots arrival
`JLZ_Container_Intelligence.html:16675`
- **Número mal:** incomingCases = 0 instead of the full container; Suggested order over-buys by that container
- **Escenario:** `invmProductArrivals` drops an order when `_oo !== origin && _invmKnownOrigin(p,_oo)`. But `_invmKnownOrigin` (16478-16484) treats any string in `PRODUCTS[p].suppliers[].origin` as 'known' — and that supplier map is exactly where `_ordOrigin` (11898) derives the origin from when the order has no explicit `origin` field. No code path ever writes `origin` onto an order (the new-order template at 13575-13594 has no such field, and the Sheet sync doesn't carry the column), so the derived value is ALWAYS a supplier-map origin. For garlic the supplier origin is 'California (Gilroy)' while the lot bucket is 'California'; for shallots it is 'AZ / CA' vs 'California'. Executed the real logic: garlic order (supplier 'Christopher Ranch') -> derived 'California (Gilroy)' -> dropped from the 'California' bucket = true; shallots order (supplier 'Peri and Sons') -> derived 'AZ / CA' -> dropped = true. Concretely: the 227-cs Christopher Ranch garlic PO in Contracted/In Transit contributes 0 to `incomingCases` (16323-16324), 0 to `posCases`, 0 to `invmRunway`'s `incoming`/`runwayWks` (17451/17453), and draws no arrival bar in the 13-week projection (16902). `orderCases` = ceil((targetWks*weeklyLbs − posLbs)/caseLb) therefore asks Juan to buy the whole container a second time, and the verdict can read 'Urgent' for a product whose container lands in 3 days. The guard only rescues an origin that is NEITHER a lot origin NOR a supplier origin (the hand-typed 'Nevada' case the comment at 16670-16672 describes), which is the one case that cannot occur through the UI. Note the asymmetry: lots are matched leniently by substring (`invmOriginMatch`, 15219-15225) while orders are matched by strict equality here.

### [3-0] directShip[] and its viaWarehouse flag never reach the Google Sheet — every made-to-order mark is device-local
`Code.gs:84`
- **Número mal:** On a second device: cross-dock cases counted as arriving free stock (e.g. +700 cs turmeric), and made-to-order customers left in the run-rate
- **Escenario:** ORDER_HEADERS (Code.gs:84) and ORDER_FIELDS (Code.gs:89) are 25 columns ending in Product/Origin — there is no directShip column. pushOrdersToSheet (JLZ_Container_Intelligence.html:21694-21721) builds exactly those 25 values and never serializes o.directShip. The round trip only survives because pullOrdersFromSheet lists 'directShip' in LOCAL_ONLY_ORDER_FIELDS (html:21909) and copies it back off the LOCAL copy of the same PO (html:21915). That works on the machine that made the mark and nowhere else. Concrete failure: Juan marks turmeric PO X as 700 cs cross-dock for Sol-ti on his laptop. Michael opens the app; pullOrdersFromSheet(true) fires at startup (html:22392), his localByPo has no directShip for PO X, so nothing is restored. On Michael's machine directShipTotal('X')=0, so invmProductArrivals (html:16683-16684) adds the full 850 cs to arrivals instead of 150 — the exact bug the comment there says was fixed (coverage 9.7 wk vs 3.0 real) — while mtoByCustomer returns {} so mtoNetModel/mtoNetRows/mtoCasesPerWeek leave Sol-ti's ~700 cs in the run-rate. The two errors point in opposite directions and do not cancel: a one-time phantom arrival plus a permanently inflated weekly run-rate. Same for the viaWarehouse bit, so even a device that somehow had the array would not know cross-dock from repacked-here. This is the single largest gap in the module: the fact that decides arrivals, run-rate, demand and free stock for 8 marked POs lives only in one browser's localStorage.

### [3-0] Startup auto-pull silently destroys order.downgraded — conventional containers rejoin the organic stock
`JLZ_Container_Intelligence.html:21909`
- **Número mal:** A downgraded container's cases are added back into organic on-hand/coverage and into the sea/air profitability aggregates
- **Escenario:** ordToggleDowngraded (html:13251-13263) writes downgraded / downgradedDate / downgradedReason onto the order and pushes. Those three fields exist in neither ORDER_HEADERS/ORDER_FIELDS (backend/Code.gs:84,89) nor LOCAL_ONLY_ORDER_FIELDS (html:21909). readSheet_ (Code.gs:395-402) builds each order object from ORDER_FIELDS only, so the pulled object has no downgraded key, the preservation loop at html:21915 never sees it, and saveOrders(orders) at html:21934 overwrites the local copy. pullOrdersFromSheet(true) runs unconditionally 1 s after every app open (html:22392), so the flag survives exactly until the next reload. Concrete failure: Juan flags PO Y as downgraded (APHIS fumigation, lost organic cert). invmCompute puts it in distressedLots and removes it from the organic lot list (html:15008,15015-15016) and the Orders row shows the 'Downgraded' chip (html:12923). Next morning the app reloads, the auto-pull wipes the flag, and PO Y's cases silently re-enter organic on-hand and FEFO coverage, and the History S1/S3 sea/air aggregates that filter `!x.downgraded` (html:10911-10912, 11002-11003, 11043-11044, 11111-11112) start including it. Nothing on screen reports the loss.

### [3-0] On turmeric/garlic/shallots the Demand tab's \"Add committed order\" button silently does nothing after cross-
`:None`
- **Número mal:** —
- **Escenario:** —

### [3-0] \"This week\" panel is dead: dmWeekStatus() throws on an undeclared `_ds`
`:None`
- **Número mal:** —
- **Escenario:** —

### [3-0] Customer Intelligence tags repacked-here accounts \"DIRECT-SHIP\"
`:None`
- **Número mal:** —
- **Escenario:** —

### [3-0] Empty state tells the user to click a button removed on 2026-09-04
`JLZ_Container_Intelligence.html:28259`
- **Número mal:** instruction points at a control that does not exist
- **Escenario:** "None. Use the <i>not stock demand</i> button on a customer row to mark one." The button was retired — the code's own comment 30 lines earlier (28062-28066) says so: "El botón 'not stock demand' se retiró el 2026-09-04... Ahora el hecho vive en la ORDEN ('Bought for', panel de Orders)". `grep -n "not stock demand"` returns only this string and that comment; there is no handler. A non-technical user following it hunts the customer rows for a button that is not there, and never finds the two real paths (Orders → "Bought for", 13843; Demand → Committed → "Cross-dock from port", 27717). Worse, the comment at 28064-28065 records that acting on a stale prompt like this already caused harm once ("garlic·Whole Foods se activó siguiendo un aviso desactualizado").

### [3-0] Demand \"Made to order\" summary double-counts products with more than one origin
`:None`
- **Número mal:** —
- **Escenario:** —

### [3-0] \"Add committed order\" silently does nothing on non-ginger products when the sticky ship-mode is cross-dock
`:None`
- **Número mal:** —
- **Escenario:** —

### [3-0] Per-product past-weeks table counts cross-dock cases as arrivals
`JLZ_Container_Intelligence.html:16974`
- **Número mal:** arrCases 850 instead of 150; every reconstructed weekly Start/End before that week is 700 cs too low
- **Escenario:** Inside `invmProjectionHTML` the history block sums `parseFloat(o.cases)` with no `directShipTotal` netting, while the forward table in the SAME function gets its arrivals from `invmProductArrivals` (16683-16684), which does net cross-dock, and the ginger twin of this exact block does net it (18969). Turmeric-Fiji PO of 850 cs with 700 cs marked for Sol-ti: the forward table shows +150 and the past-weeks table, once that PO flips to Arrived, shows +850 for the same container. Worse, `arrCases` drives the backward stock walk at 16981 (`_w.start=_hcursor+_w.out-_w.arrCases`), so every historical week before that arrival is reconstructed 700 cs lower than it was — the 'Start/End' column shows a stock level that never existed, and it is the column Juan cross-checks against WholesaleWare.

### [3-0] Ginger-Peru Buy Planner's forward pipeline has no origin filter
`JLZ_Container_Intelligence.html:14792`  · LATENTE
- **Número mal:** arrivalCases inflated by the whole Hawaii container; the same cases are also counted again in the Hawaii view
- **Escenario:** `bpGetPipelineByWeek` filters only `_ordProd(o)==='ginger'` and status. The full planner it feeds is explicitly ginger-PERU (renderBuyPlanner 18611-18621 sends BP_ORIGIN==='Hawaii' to a separate view, and the planner's own past-weeks block at 18962-18967 drops non-Peru containers with the comment 'a Hawaii container must never show as supply here'). `PRODUCTS.ginger` has Crown Pacific LLC / origin Hawaii (25849) and the inventory seed carries a ginger-Hawaii lot (15232), so an Orders row for ginger from Crown Pacific is a supported state. When one exists in Contracted/In Transit, its cases are added to `arrivalCases` (18885-18886) against a stock base that contains only ginger-Peru lots — understating the buy — while the same order is ALSO counted by `invmProductArrivals('ginger','Hawaii')` in the Hawaii view. Latent only because no such order is on file today; the forward table and the history table of the same planner already disagree by construction.

### [3-0] Overdue containers count as 'already on the way' but never land in any projection
`JLZ_Container_Intelligence.html:17451`
- **Número mal:** the position KPI credits the container's cases; the week-by-week table credits 0 — two different 'how much to buy' on the same screen
- **Escenario:** `invmProductArrivals` keys an order by the week of its ETA (16685-16687), including ETAs already in the past for an order still Contracted/In Transit. `invmRunway` then walks weeks from `new Date()` forward (17432-17436), so a past-week key is never read — but `incoming` (17451) and `runwayWks` (17453) sum ALL keys of `arr`, and so does `incomingCases` in `invmProductStats` (16324), which drives `posCases`, `coverPosWks`, `orderCases` and `status`. Result on one card: the headline says 'X free + 1,320 already on the way = N weeks of supply' (17860) while the bar chart underneath never receives those 1,320 cases and `firstShort`/the reorder verdict are computed without them. Same asymmetry in `invmProjectionHTML`, which deliberately folds overdue COMMITTED into the current week (16904, 'overdue/backlog folds into now') but never folds overdue ARRIVALS — overdue demand counts, overdue supply doesn't. The ginger Buy Planner and the Simulator are worse: `bpFutureWeeks` also starts at the current ISO week (14722-14729), so a late Peru container drops out of `arrivalCases` entirely (18873, 18885) with no compensating figure anywhere in the planner. ETA slippage is routine here — the app tracks `etaChangeHistory` and drift precisely because of it.

### [3-0] Simulator's arrivals are not origin-filtered either
`JLZ_Container_Intelligence.html:23851`  · LATENTE
- **Número mal:** Simulator arrivalCases inflated by the Hawaii container, so the Simulator and the Buy Planner can only agree by both being wrong the same way
- **Escenario:** `const activeOrders = orders.filter(o => _ordProd(o) === 'ginger' && (status Contracted|In Transit))` — no origin test, yet renderSimulator routes SIM_ORIGIN==='Hawaii' to a separate product view at 23834-23838, so this branch IS the ginger-Peru simulator. `activeOrders` feeds `arrivalsByWeek` (23570-23577) and therefore `arrivalCases` (23650). Same ginger-Hawaii container as finding #4 lands in the Peru projection here too. The two projections claim to mirror each other week for week (23647), which they would — both over-counting.

### [3-0] Arrival cell shows net cases but its sub-line shows gross cases and gross days-in-warehouse
`JLZ_Container_Intelligence.html:19052`
- **Número mal:** sub-line '(850cs · ~8d in WH)' under a cell that reads '+150'; days-in-WH overstated ~5.7x for that container
- **Escenario:** `arrivalsTxt` maps `a.cases` — the raw order total straight out of `bpGetPipelineByWeek` (14810) — while the cell it is printed inside renders `r.arrivalCases`, which is net of cross-dock (18885-18886). It also feeds `daysInWh(a.cases)` (19039), so the label claims cross-dock cases will sit in the warehouse for days when they never enter it, and inflates the residence estimate for the cases that do. `simRenderProjection` has the identical defect at 23681-23683 (`a.label + ' (' + a.cases + ')'` under a cell showing `arrivalCases`). Same row, two answers for one container, and the larger of the two is the one a reader anchors on.

### [3-0] The nowcast re-injects \"repacked here\" committed into the run-rate after mtoNetRows stripped it
`:None`
- **Número mal:** —
- **Escenario:** —

### [2-1] The sync pill reports \"Synced\" after a Bought-for change that was never transmitted
`:None`
- **Número mal:** —
- **Escenario:** —

### [2-1] FIFO aging queue consumes 'repacked here' cases at the stock run-rate
`JLZ_Container_Intelligence.html:19135`  · LATENTE
- **Número mal:** every container behind a repacked-here lot has its sell-out week pushed back by (repacked cases / weeklyDemand), inflating its predicted days-in-WH and shrink $
- **Escenario:** `bpRenderFifo` builds its lot queue netting only `directShipTotal` (cross-dock), which is right for whether the cases arrive — but the queue is then walked at `Reff`, the stock run-rate (19143-19151), and 'repacked here' cases are by definition OUT of the run-rate: they ship out against their own order within days, not by draining the general-demand queue. So a 210-cs Whole Foods repacked-here block sits in front of the next container and delays its `soldWk` by 210/weeklyDemand weeks, raising that container's `days`, `shrink` and `lost` for stock it never actually blocked. `totalLost` and the shelf-life `breach` flag both come off this walk (19158-19161). Latent for the ginger-Peru planner today because no ginger order carries `viaWarehouse:true`; it bites the first time one does, and the mechanism is already live for garlic per the domain model.

## TUMBADOS (15) — no re-abrir sin evidencia nueva

- [0-3] Non-ginger made-to-order marks are drawn on the Demand chart but absent from the \"On file\" chip list that is
- [0-3] pullOrdersFromSheet's local-only preservation is dead code for product and origin — a blank Sheet cell always 
- [1-2] Read and write paths resolve a PO by different keys: getDirectShip matches contractNo/containerNo, addDirectSh
- [1-2] An earmark larger than the container is accepted and then silently clamped away
- [0-3] \"ships direct to the customer and never enters the warehouse\" is claimed for the made-to-order umbrella
- [0-3] Run-rate headline's made-to-order disclosure is dead code — `invmDirectShipCases` does not exist
- [1-2] Trend & price readout never shows its made-to-order reconciliation (same missing function)
- [1-2] Build-up \"Bought to order\" claims a whole account is out of the plan while only its marked cases were netted
- [0-3] Buy Planner stale-shipment banner is written entirely in Spanish
- [0-3] Simulator \"Arrivals timeline\" counts cross-dock cases as arriving; the projection below it does not
- [0-3] Spanish placeholder '(sin nombre)' in the Demand week panel
- [0-3] The entire Yield Intel view is in Spanish
- [1-2] Past-weeks arrivals use a strict origin match with no known-origin guard
- [0-3] Simulator's 'Active pipeline' KPI sums gross cases, contradicting its own projection
- [0-3] invmCommittedByWeek sums committed in the SOLD pack; the nowcast converts it with the BUY case weight

## VOTACIÓN PARCIAL (2)

- [0-2] Committed panel's \"On file\" list hides made-to-order entries for every product except ginger
- [2-0] Ginger's safety stock is sized on a demand series that still contains made-to-order

## Los 48 sin ningún voto

- On turmeric/garlic/shallots the Demand tab's "Add committed order" button silently does nothing after cross-dock was used on ginger  `:27764`
- Non-ginger made-to-order marks are drawn on the Demand chart but absent from the "On file" chip list that is supposed to explain it  `:27803`
- The sync pill reports "Synced" after a Bought-for change that was never transmitted  `:13667`
- "This week" panel is dead: dmWeekStatus() throws on an undeclared `_ds`  `:27183`
- "ships direct to the customer and never enters the warehouse" is claimed for the made-to-order umbrella  `:27212` LATENTE
- Customer Intelligence tags repacked-here accounts "DIRECT-SHIP"  `:28430`
- Build-up "Bought to order" claims a whole account is out of the plan while only its marked cases were netted  `:28249`
- Demand "Made to order" summary double-counts products with more than one origin  `:27449`
- Simulator "Arrivals timeline" counts cross-dock cases as arriving; the projection below it does not  `:23032`
- "Add committed order" silently does nothing on non-ginger products when the sticky ship-mode is cross-dock  `:27768`
- Committed panel's "On file" list hides made-to-order entries for every product except ginger  `:27803`
- Simulator projects 16 weeks, Buy Planner 12 — the Cover column and CRITICAL badge disagree week for week, and the Buy Planner's last row is always CRITICAL  `:23587`
- The Simulator's buy card cannot answer for a scenario whenever the Buy Planner is healthy: rec/protect/schedule are computed only inside the shortfall branch  `:19432`
- window._simDigest is never cleared, so the Simulator's buy card keeps showing a removed scenario's recommendation  `:23729`
- Simulator keys arrivals by calendar year instead of ISO week-year: a container landing in the New Year straddle week vanishes from the projection  `:23574` LATENTE
- peakStock is picked by a different rule on each side, so the shelf-life cap — and the recommended container count — can differ with no hypothetical loaded  `:23713` LATENTE
- 'Stock when the order lands' is located by ISO week number from a UTC date string in the Buy Planner and by timestamp in the Simulator — one week apart on evening renders  `:19603` LATENTE
- Simulator rebuilds the safety line from the rounded weeks figure instead of the exact safety stock, so LOW/OK badges disagree for weeks near the buffer  `:23560`
- _simDigest omits seaDeadline/airDeadline, which the shared buy card reads: the Simulator loses the air deadline, never shows the urgent red tone, and prints a different 'lands' date  `:23729`
- Without a demand model, a hypothetical sale for a cross-dock customer consumes free stock in the Simulator  `:23631` LATENTE
- Ginger-Peru plan and Simulator count Hawaii ginger containers as supply; only the Buy Planner's history block filters by origin  `:14792`
- Repacked-here committed is pooled into max(committed, run-rate), so its cases arrive and never leave  `:16905`
- The nowcast bakes repacked-here committed into the run-rate it was netted out of  `:15980`
- Cross-dock exclusion needs an already-ARRIVED marked container inside the demand window; in-transit cross-dock is counted as warehouse demand  `:15879` LATENTE
- Build-up column total includes repacked committed for accounts that have no row in the table  `:28058`
- This-week panel counts repacked committed as demand but hides it from the named committed list  `:27161`
- Buy-confidence panel tells you to buy against cross-dock committed and a run-rate that still contains made-to-order volume  `:28891`
- invmCommittedByWeek counts committed in the SOLD pack while committedInvForWeek converts to the buy pack  `:16765` LATENTE
- Nowcast re-averages per-customer rates with cross-dock committed the aggregate deliberately excluded  `:16076` LATENTE
- Forward chart stacks the same made-to-order cases as both committed and made-to-order volume  `:26975`
- Buy Planner "Available (free)" is the gross lb figure; its own sub-label shows the free case count  `:18630`
- Ginger Coverage KPI divides GROSS on-hand by weekly demand; every other product divides AVAILABLE  `:18856`
- "Available to sell" subtracts ALL future committed weeks, not the current week the KPI claims  `:16158`
- The projection consumes committed the KPI refuses to count: invmCommittedByWeek has no same-pack filter  `:16765`
- Cross-dock committed is only spared while the PO has ARRIVED and the customer has invoiced sales inside the demand window  `:15884` LATENTE
- A cross-dock customer's floor sales stop reducing free stock (whole-customer exclusion)  `:16159` LATENTE
- Demand pulse card's ginger-Peru "On hand" sums the raw store — downgraded (conventional) lots included  `:27416`
- Projection header prints On-hand − Shrink − Committed = Available, but Available never subtracts shrink  `:17053`
- Lot-table subtotals are age-filtered, but the line under them claims they reconcile to on-hand  `:17147`
- On-screen Monday instruction still says to build the inventory snippet excluding W-lots  `:17211`
- The nowcast re-injects "repacked here" committed into the run-rate after mtoNetRows stripped it  `:15980`
- invmProductModel returns an un-netted model for origin 'all', contradicting invmProductStats's "rrWin YA viene neto"  `:16126`
- Zone-1 cards net the run-rate on the product window but show "made to order" on a fixed 26-week window, once per origin  `:27412`
- Build-up panel hides repacked-here customers' rows while its column total still contains their committed  `:27865`
- dmWeekStatus throws ReferenceError on an undeclared `_ds`, so the "This week" panel silently never renders  `:27183`
- invmDirectShipCases is called in two places but never defined, so the made-to-order line is always hidden  `:26658`
- The run-rate panel nets with dmWindow(prod) but averages with dmWindow(prod, origin)  `:26644` LATENTE
- mtoByCustomer matches by product only, so one order's cases are netted out of every origin's run-rate  `:15866` LATENTE
- invmStockableWeekly nets made-to-order only in the arrival week, so a one-week invoice lag leaves the spike in the variability series  `:17351`
- dmEffectiveRunRateLbs subtracts a non-Peru ginger made-to-order order twice  `:26593` LATENTE
- Committed cases are pack-converted twice: the importer converts, then cmCasesInBuyPack converts again  `:11996`
- ginger-Peru Buy Planner counts Hawaii containers as incoming; the ginger-Hawaii view counts the same containers again  `:14792` LATENTE
- ginger-Hawaii committed is subtracted from ginger-Peru's free stock and from ginger-Hawaii's available — the same cases twice  `:18646` LATENTE
- Command Center 'Sea order by' still anchors to the stockout week while the Buy Planner card anchors to the protect date  `:19292`
- The 13-week projection runs on pre-shrink demand while the buy suggestion above it inflates demand by shrink  `:16883`
- 'Available to sell' is displayed with a shrink deduction the number does not contain  `:17246`
- Buy card's runway strip and the projection table below it start from two different stock figures  `:17423`
- Past-weeks 'containers received' in the product projection ignores cross-dock, so the reconstructed history is off by the cross-docked cases  `:16974`
- mtoByCustomer has no origin filter, so one origin's made-to-order pool is netted out of every origin's model  `:16136`
- Two different 'place the order by' dates rendered on the same product page  `:16946`

## Avisos para quien reanude

- Los buscadores leyeron el archivo a las **09:26**, antes del fix de `_ds` (commit 5598f58, 12:06).
  El hallazgo `dmWeekStatus/_ds` sale CONFIRMADO [3-0] pero **ya está arreglado** — verificar antes de tocar.
- Los primeros 66 veredictos son de esa misma foto vieja. Revisar que ninguno confirme algo ya corregido.
- Verificado a mano por Claude, al margen de los refutadores: `bpGetPipelineByWeek` no filtra origen;
  `invmDirectShipCases` se llama 2 veces y no existe; `mtoByCustomer` no tiene parámetro de origen;
  garlic/shallots: supplier origin 'California (Gilroy)' / 'AZ / CA' vs bucket 'California'.