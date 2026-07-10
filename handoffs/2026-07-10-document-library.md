# Handoff — Document Library feature (Phase 1)

**Date:** 2026-07-10
**Feature:** Per-container document tracking + a "Library" dashboard for JLZ Container Intelligence.
**Status:** Phase 1 — steps 1 & 2 done and committed. Steps 3 & 4 remain.

---

## What this feature is (one line)

Track, per container, which trade documents are on file (Purchase Order, BL, Invoice,
Packing List, Temp Recorders, NIC, Phyto, Quality Report, Stowage Plan, Receiving Sheet,
Work Order, Profitability, Cost Allocations) — surfaced **two ways**: inside each module
(contextual) and in a central **Library** tab (fleet-wide status dashboard).

## Approved mockup (the design source of truth)

Interactive mockup v7 (approved by Juan): **https://claude.ai/code/artifact/33695ccc-6242-4152-a5fa-9a036d5a4531**
Local copy of the mockup HTML: `scratchpad/library_mockup.html` (in the session scratchpad;
if gone, the Artifact URL is authoritative). It shows: 3-layer Library (health tiles →
"needs attention" cards → matrix/cards switch with filters), severity left-stripe, and the
per-module document section with a lifecycle stepper (Ordered → In Transit → Arrived → Closed).

## Locked decisions (do NOT re-open)

1. **Attach mechanism = paste a Google Drive link** (Option A). No file upload into the app
   (would bloat localStorage) and no Drive-API folder-listing yet (Option C = a Phase-2+ dream).
2. **Quality is its own new top-level tab** (Juan: "lo vamos a ir construyendo"). Procurement
   docs live in the Orders module; Operations docs in the Operations module.
3. **Local-only (localStorage) for v1** — same as History today. Cross-device sync via the
   Google Apps Script backend is deferred (a Code.gs change).
4. **Reuse existing parsers** — the 5 docs the app already parses (Quality Report, Receiving
   Sheet, Work Order, Profitability, Cost Allocations) derive "on file" from the container
   snapshot; do NOT rebuild them. The other 8 use the new Drive-link store.
5. **Sea and Air** are a filter dimension in the Library but this is document *status*
   (operational), so mixing them here does not violate the "never average sea+air" rule.
6. **Close/waive semantics:** the operator can **close** a container's documents even if
   incomplete; remaining missing docs show as **N/A**. A closed container drops off the
   "incomplete" radar but keeps its record (who/when + count waived).

## What's built & committed

- `58f0850` — (pre-feature) externalized the Market Intel data blob to `market_data.js` +
  `.gitignore`. **Deploy note:** the app is now TWO files — always publish
  `JLZ_Container_Intelligence.html` **and** `market_data.js` together.
- `6f845d3` — **Step 1: data layer.** In the main `<script>`, right after `saveOrders`:
  - `DOC_CATALOG` — 13 doc types with `{key,label,stage(proc|qual|ops),source(link|parsed),signal?}`.
  - Store `jlz_container_docs` keyed by PO: `{ [po]: { docs:{ [type]:{onFile,waived,driveLink,uploadedAt,uploadedBy} }, closed:{at,by}|null } }`.
  - Helpers: `getContainerDocs/saveContainerDocs/attachDoc(po,type,link,user)/waiveDoc/detachDoc/closeContainer/reopenContainer`.
  - `containerDocStatus(po, snap, arrived)` → `{closed, docs:[{key,label,stage,source,state,driveLink,uploadedAt,uploadedBy}]}`,
    `state ∈ on | missing | pending | waived` (pending = ops doc, container not yet arrived).
- `c9b9661` — **Step 2: Quality tab.** New `tab-quality` (nav button under Operations),
  registered in `switchTab` (ids array + render dispatch). `renderQuality()` +
  handlers `qAttach/qWaive/qDetach/qOpen/qClose/qReopen` (right after `containerDocStatus`).
  Scoped CSS lives inside the `#tab-quality` markup (global stylesheet untouched). Shows the
  active container's 5 quality docs; Quality Report auto-detects from the parser snapshot.
- `619e852` — **Step 3: Library tab (DONE, verified).** New `library` tab (nav button first in
  the **Analytics** sidebar section, `tb-library`/`tab-library`, registered in `switchTab`).
  `renderLibrary()` + `lib*` helpers live right after `qReopen`. Renders the approved mockup v7
  3-layer view: health tiles → needs-attention cards → all-containers **matrix/cards** with 8
  filters (search/product/supplier/month/year/mode/stage/status). `libBuildRows()` merges real
  containers from `jlz_container_history` (arrived, carries parsed snapshot) + `jlz_orders_pipeline`
  (transit / arrived-not-saved; `Cancelled` skipped; history wins on dedup), each via
  `containerDocStatus`. **Product** is derived from the app's own `PRODUCTS` supplier→commodity
  map (`libSupplierProduct`); suppliers under >1 product (e.g. Crown Pacific) resolve to blank —
  we don't guess the commodity. **Mode** for arrived containers comes from `findOrderForPo()`
  (default sea; ground supported). Closed containers count missing/pending as N/A and leave the
  attention radar. All CSS scoped under `.lib-root`; the `card`/`chip`/`legend` families that
  collide with the global stylesheet use a `lib-` prefix. Verified via JavaScriptCore syntax
  check + browser smoke test with synthetic data (tiles/sort/filters/cards/closed/empty all pass).
  Screenshot confirmed against the mockup.

## Integration points already located (save yourself the search)

- **Tabs:** `switchTab(t)` (~line 1185) — `ids` array + a render-dispatch `try` block. Each tab
  is `tab-{id}` (content) + `tb-{id}` (nav button). Nav markup ~line 2410 (Operations section).
- **Active container PO:** `document.getElementById('poId').value`. Snapshot: `currentSnapshot()`
  (~9540) — returns `{po,boxes,priceLb,avgKg,lbsIn,lbsOut,netSales,netProfit,allocBills,...}`.
- **Logged-in user email:** `authUserEmail()` (~16111).
- **Existing-parser "on file" signals** (from the snapshot `s`):
  - Quality Report: `s.avgKg||s.defPct||s.moldPct` · Receiving Sheet: `s.boxes||s.priceLb`
  - Work Order: `s.lbsIn||s.lbsOut` · Profitability: `s.netSales||s.netProfit`
  - Cost Allocations: `s.allocBills && s.allocBills.length` (see also `markDz` ~14709).
- **Stores:** `jlz_orders_pipeline` (in-transit; `getOrders/saveOrders` ~11130) ·
  `jlz_container_history` (arrived containers) · per-container `driveFolder` field exists but is
  hidden in the UI (~2756) — reusable later for Option C.

## Next steps

- **Step 3 — Library tab: DONE** (`619e852`, see "What's built" above).
- **Step 4 — Procurement & Operations doc sections + polish:** add the same doc-section pattern
  as the Quality tab into the Orders module (PO/BL/INV/PL) and Operations module (RS/WO/PROF/CA),
  reusing `containerDocStatus` filtered by stage. Apply the visual polish (severity stripe,
  lifecycle stepper) already in the mockup.

## Later (out of Phase-1 scope)

- **Phase 2:** parse the new docs (Temp Recorders XLS/PDF, etc.) to extract data — but the app
  parses in-browser with PDF.js (no LLM tokens). Temp recorders come multi-format/multi-vendor
  (Locustraxx XLS, GEO PDF) — build one parser per real sample; ask Juan for sample PDFs.
- **Sync to the Sheet backend** (Code.gs) so documents sync across devices (Juan + Michael).
- **Option C:** list a container's Drive folder and tick files instead of pasting links.

## How to work on this repo (verification without Node)

- **Node is NOT installed** on this machine — `node --check` can't run. Verify by loading the
  real app in a browser and smoke-testing: the app's Google-Drive path can't be served by the
  sandboxed preview server, so **copy `JLZ_Container_Intelligence.html` + `market_data.js` to
  `scratchpad/serve/` and serve from there** (`.claude/launch.json` runs `scratchpad/serve.py`;
  `.claude/` is gitignored). Then `preview_start` → navigate to the file → drive the new globals
  via `preview_eval` (functions are global even behind the login gate).
- **The app renders its UI only after login** — you cannot screenshot the logged-in tabs without
  credentials (do not enter credentials). Verify via `preview_eval` on the DOM/functions instead.
- **Do a `<div>` balance check** after any markup edit: `grep -o '<div' file | wc -l` vs `</div>`.
- Mojibake (garbled accents/emoji) in the LOCAL preview is a charset quirk of the python server
  only — the real app and published Artifacts render UTF-8 fine.

## Env gotchas

- **The Google Drive MCP connector is authenticated as `jj.zevallos.r@gmail.com`** (Juan's old
  account), NOT `juan@jlzproduce.com`. So it can't see files in the jlzproduce Drive. To read a
  container's real PDFs, either share them with `jj.zevallos.r@gmail.com`, or reconnect the Drive
  connector to `juan@jlzproduce.com` (a settings step only Juan can do).
- Blob warning still applies: `market_data.js` holds a ~560 KB Veritrade data blob (`var MI_SEED`).
  Exclude it from greps. The giant inline blob is no longer in the HTML (externalized).

## How Juan works

Spanish conversation, English code/UI. Approvals: "dale / implementemos / procedamos" = full
go-ahead. Blocking questions in ONE batch before building. Honest trade-offs; never invent.
Non-technical founders (Juan + Michael) — every screen must be self-explanatory (design criterion #1).
