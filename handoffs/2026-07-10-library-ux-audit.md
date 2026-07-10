# Handoff — Library/Docs UX audit & fixes (post-Phase-1)

**Date:** 2026-07-10 (same day Phase 1 shipped; see `2026-07-10-document-library.md` for the feature itself)
**Workflow (Juan's explicit preference):** Fable 5 does **architecture/audit/mockups only** — a
different model (Opus, the repo's usual executor) does the production edits. Do not have Fable
patch `JLZ_Container_Intelligence.html`.

## Audit findings (reproduced with 24 saved + 8 in-transit containers, zero docs attached)

1. **[Bug] TEMP shows "Missing · key" (red) for in-transit containers.** The temp recorder
   travels inside the container — its log cannot exist pre-arrival. Every in-transit container
   screamed red. → TEMP must be `pending` until arrival.
2. **[UX critical] "Needs attention" has no cap.** With a fresh install every container qualifies
   → 32 identical red cards, ~1,000px before the matrix. When everything is red, nothing is.
3. **[UX] Cards view ≡ Matrix** (same info, different shape). Juan: remove it. Matrix stays.
4. **[UX] Orders panel doc group opens expanded and rows are tall** (amber "Not on file yet"
   strip duplicates the MISSING pill).
5. **[Consistency] Spanish strings shipped in UI** (empty state, prompts, confirm, "Plano de
   estiba") — project rule is English UI.
6. **[Minor, noted only]** `containerDocStatus` re-parses the docs store per container per render.
   Fine under ~200 containers; memoize per render in Phase 2 if the fleet grows.

## Approved fixes — **LANDED in `006b05c`** (Opus executed, Fable reviewed diff + browser-verified)

- **F1 TEMP pending:** `DOC_CATALOG` TEMP entry gets `atArrival:true`; in `containerDocStatus`
  both pending conditions change `d.stage === 'ops'` → `(d.stage === 'ops' || d.atArrival)`.
  Quality tab unaffected (calls with `arrived=true`).
- **F2 Attention cap:** `libRenderAttention` sorts key-first then `ym` desc, renders max 6 +
  one `+N more need attention →` card (`libViewAllAttention()`: set `lib-f-stat=incomplete`,
  `libRenderList()`, scroll `.matrix-scroll` into view). Each card gets a ghost
  `🔒 Close` button → `libCloseFromCard(po)`: confirm → `closeContainer(po, docUser())` →
  `renderLibrary()`.
- **F3 Remove Cards view:** drop the `subsw` toggle + `lib-cardsWrap` markup, `LIB_SUB`,
  `libSetSub`, `libRenderCards`, the `.subsw`/`.gal`/`.gcard*` CSS; `libRenderList` always
  renders the matrix. Keep `libNeedText`/`libDonut`/`.att-need` (attention cards use them).
- **F4 Compact rows + collapsed group:** doc-section meta strip renders **only** when
  `state==='on'` (in both `docSectionHTML` and `renderQuality`). `docSectionHTML` gains optional
  `opts` 5th param; `{noHead:true}` skips the "X of Y on file" line. Orders panel: group title
  becomes `Procurement documents · N/4` (computed via `containerDocStatus`), passes `noHead`,
  and defaults **collapsed** (`procdocs: true` in `_orderPanelCollapsed` init + undefined-guard
  before the `grp()` call).
- **F5 English UI strings:** empty state → "Load a container (in **Arrival**) to see and attach
  its quality documents."; prompts → "Paste the Google Drive link for this document (X):";
  confirm → "Close documents for X? Missing documents will be marked N/A."; `Q_SUB.STOW` →
  "Load layout inside the container". Comments may stay Spanish.

## Quality tab redesign — **DONE** (`e9b879a`, mockup v8 approved by Juan 2026-07-10)

Landed exactly as specced below: `qBuildRecord()` renders the Container record card
(header + stepper + KPIs/ETA) into a new `#q-record` mount above `#q-head` in `renderQuality`.
Thresholds reused from the app (mold `MOLD_THRESH`, days `INS_AGE_CRIT`, shrink vs
`PRODUCTS[k].shrinkPct`). CSS scoped under `.qdocs` (`.qr-` prefix). Verified by DOM.

### Original spec (kept for reference)

**Mockup v8 (interactive):** https://claude.ai/code/artifact/f5e80300-c950-4292-ae3f-ff0377cc4442
Local copy: session scratchpad `quality_mockup_v8.html` (Artifact URL is authoritative).

Architecture once approved:
- **Card 1 "Container record"** above the docs list in `#tab-quality`: PO + description
  (product via the Library's `libSupplierProduct` supplier→product map; supplier+mode via
  `findOrderForPo(po)`, fallback History record) + vendor ref if present.
- **Stepper** Ordered → In Transit → Arrived → Docs closed. Stage derivation: linked order's
  `status` (`Contracted`→ordered-done only, `In Transit`→transit-cur, `Arrived`→arrived-cur);
  if no order but a History snapshot exists → arrived; `closed` flag from the doc store →
  Docs closed. Reuse mockup's marker/line classes (scoped under `#tab-quality`, `qm-` prefix
  is free — verify with grep before use).
- **KPI row (arrived only):** Mold ← `snap.moldPct` · Shrink ← `(lbsIn−lbsOut)/lbsIn` ·
  Days in warehouse ← `snap.days`. Thresholds in the mockup are illustrative — reuse the app's
  existing thresholds where they exist (grep the Results/History modules) rather than inventing
  new ones. In-transit: replace KPIs with an ETA line from the linked order.
- **Compact rows + English** (F4/F5 cover the docs list itself).
- Cross-link note to Library (mockup bottom card).

## Verification protocol (executor + reviewer)

1. `grep -o '<div'|wc -l` == `grep -o '</div>'|wc -l`.
2. No Node on this machine — syntax-check edited JS regions via
   `osascript -l JavaScript` with `window/document/localStorage` stubs prepended (runtime
   ReferenceErrors OK, SyntaxErrors not).
3. Browser smoke (serve from scratchpad `serve/`, reveal shell by removing `app-locked` class,
   never enter credentials): volume scenario (24 hist + 8 transit, no docs) must show ≤6
   attention cards + "+N more"; in-transit rows must NOT be red for TEMP; numeric-PO history
   record (po as Number) must render (regression, fixed in `55103a5`); Orders panel group
   collapsed with count; all UI strings English.
4. Small commits per theme; Fable reviews the diff before committing.

## Deploy reminder

Pages serves from `main`; push = deploy. Publish `JLZ_Container_Intelligence.html` +
`market_data.js` together (the .js hasn't changed since `6929ecf`). Push happens from
GitHub Desktop (git CLI here has no GitHub credentials).
