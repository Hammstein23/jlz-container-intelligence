# Handoff — Frente A (incomplete-week) + Frente B (committed orders + direct-ship)

**Date:** 2026-08-05 · **Executed by:** Opus 4.8 in Claude Code, from the pasted design handoff.
**File after this work:** `JLZ_Container_Intelligence.html` — **22,597 lines, md5 `5f6c96888e1e1c0e7177b0b261686561`**.

## Status
- **Frente A — DONE & PUSHED (live).** `5af824a`.
- **Frente B0–B3 — DONE, committed, NOT yet pushed** (3 commits: `4e0985e` B0, `4fb98d6` B1,
  `5022842` B2+B3). Push via GitHub Desktop.
- **B4** (Code.gs columns for cross-device sync of committed/directShip) — optional, deferred
  (needs the backend redeploy; local-first works today, like `pnlFinal`).
- **Frente C** (QC Document Audit) — untouched, still needs sample PDFs.

## Frente A — incomplete-week rule (`5af824a`)
The old rule required `dataMax` to reach a week's **Sunday**, but Sunday never has dispatches
(Sat 225 / Sun 0 in the real export), so the newest *complete* week was systematically dropped.
**The handoff's "strictly-later ISO week" (`>`) was proven equivalent to the old buggy rule**
(they differ only when dataMax lands on a Sunday, which never happens) — the real fix is
**same-or-later ISO week: `dmWeekKey(new Date(dataMax)) >= wk`** (Juan approved).
Applied at **5 sites**, not the 2 the handoff named — a grep sweep found 3 more computing sibling
run-rates that MUST stay in sync (Juan approved including them):
`dmBuildModel.reliableWeeks`, `renderDemand` chart `incomplete`, `dmClearanceScan` (`inc` +
disposal filter), `dmProductSeries.inc`. `dmWkEndISO` is now dead (left in place; safe to remove).

## Frente B — decisions & where things live
**Data model (B0, `4e0985e`, after `saveOrders` ~L11400):** two stores kept apart (handoff #1/#2).
- `jlz_committed_v1`: warehouse-committed `[{customer,wk,cases,type:'inv'}]`, wk = Monday
  `YYYY-MM-DD`. Helpers `getCommitted/saveCommitted/addCommitted/removeCommitted/committedInvForWeek`.
- `directShip:[{customer,cases}]` ON the order object (week = container ETA, not stored). Helpers
  `getDirectShip/addDirectShip/removeDirectShip/directShipTotal`.
- **Entry UI**: `renderCommittedPanel` → static `#dm-committed` host in the Demand tab (rendered at
  the tail of `renderDemand`). Customers are **data-driven** from `_dmModel.customers` (internal
  accounts filtered) — the app has NO customer constant. Weeks from `bpFutureWeeks`. `dmc-` CSS.

**Chart (B1, `4fb98d6`) — Option B (Juan chose): adapt, don't rebuild.** The production chart
(`dmComboSVG`) is single-series cases + a $/lb line, NOT per-customer, and there is **no customer
color map**. So committed = outlined bar, direct-ship = outlined + diagonal stripe stacked above,
+ forecast divider + run-rate line (`dmEffectiveRunRateLbs ÷ caseLb`). Per-customer detail lives in
the entry chips / netting table, not bar colors. `dmForwardWeeks()` builds future weeks;
`dmMondayISO()` is a TZ-safe Monday snap that aligns direct-ship (from ETA) with committed-inv
(weekStartISO). **Gated to `productFocus()==='ginger'`** (committed store isn't product-tagged).

**Buy plan + inventory (B2+B3, `5022842`):**
- Buy-plan weekly requirement = `max(committedInvForWeek(dmWeekKey(fw.weekStartDate)), weeklyDemand)`
  — never summed (renderBuyPlanner future loop ~L14523).
- direct-ship netted from container supply (projection ~L14525) and from the buy-plan FIFO aging
  denominator (`bpRenderFifo` ~L14641) — cross-dock never ages.
- Inventory free stock (`bpInvLot` ~L13852): netted from the **order-total fallback only**.
  **ASSUMPTION (flagged in code + confirm with Juan):** `rs.cases` (receiving sheet, hand-curated)
  already excludes cross-dock, so it is left as-is to avoid double-subtracting. `directShip` exposed
  on the lot; inventory FEFO shrink inherits the exclusion via `L.cases`.

## Not yet done / follow-ups
- **Deploy B0–B3**: push the 3 commits (Pages serves from `main`; publish HTML + `market_data.js`).
- **Validate with real data**: Juan to load the WholesaleWare export and confirm (a) Frente A keeps
  the newest complete week, (b) committed/direct bars + netting read right.
- **Inventory "direct-shipped" badge**: the field is exposed (`lot.directShip`); rendering a visible
  badge in the inventory table is a small remaining UI touch (not done — correctness is done).
- **B3 receiving-sheet assumption**: confirm rs.cases excludes cross-dock.
- **B4**: Code.gs columns for committed/directShip cross-device sync (with the pending Code.gs redeploy).

## Working notes
- Node absent → verify JS via `osascript -l JavaScript` with stubs; browser verify by DOM
  (`mcp__Claude_Browser__javascript_tool`), not screenshots (Juan's standing preference). Local serve:
  `scratchpad/serve/` + `serve.py` on :8899. `loadFromSheet` console errors are expected (no backend locally).
- Grep the 1.5MB file with `grep -v '^1460:'` (base64 blob); anchor ASCII (box-drawing chars break matching).
