/**
 * JLZ Container Intelligence — Apps Script backend (FULL multi-user sync)
 *
 * Handles every action the HTML tool sends:
 *   POST  upsertContainer / appendContainer / deleteContainer
 *         replaceOrders / replaceSales / replaceDemand / appendForecast / setSetting
 *   GET   listContainers / listOrders / listSales / listSettings
 *         listDemand / listForecasts / listMeta
 *
 * READS support JSONP (?callback=...). Apps Script sends no CORS headers, so a
 * normal cross-origin fetch() from GitHub Pages can't read the response. JSONP
 * (loaded via a script element) bypasses CORS — the HTML now uses it.
 *
 * MULTI-USER FRESHNESS: every mutating POST stamps a per-dataset {updatedAt,
 * updatedBy} pair on the Meta sheet (updatedAt = epoch millis). Before writing,
 * the client GETs listMeta and refuses to overwrite if the server is newer than
 * the data it loaded and the last writer was someone else. The POST body now
 * carries `user` (email); it is optional and defaults to '' so older clients
 * keep working.
 *
 * ── SECURITY ────────────────────────────────────────────────────────────────
 *   1) TOKEN GATE — every request (read AND write) must carry the secret token
 *      or it is rejected. The token is NOT stored in the public HTML source; it
 *      lives only in each user's browser and is sent on every request. This
 *      closes the open-endpoint hole (anyone who reads the public page used to
 *      be able to read/write the Sheet directly).
 *   2) VALIDATION — only allow-listed actions are accepted.
 *   3) AUDIT LOG — every authorized write, and every REJECTED/error, is recorded
 *      on an "AuditLog" tab. DENIED (bad/missing token) requests are NOT written
 *      to the Sheet — they only go to the execution log (see guard_). Otherwise
 *      an anonymous flood of tokenless requests could grow the Sheet without
 *      bound and burn the daily quota (self-DoS).
 *   4) FORMULA-INJECTION GUARD — every value written to a cell is passed through
 *      sheetSafe_(): a text value starting with = + - @ (or tab/CR) is prefixed
 *      with a single quote so Sheets stores it as literal text, never a live
 *      formula. The web client already does this too; this is the second layer.
 *   5) TOKEN NOT IN SOURCE — the real token lives ONLY in Script Properties
 *      (set by jlzRotateToken). The constant below is a non-secret sentinel; if
 *      Script Properties is empty the backend fails CLOSED (denies everything)
 *      rather than accepting a token that would be sitting in this file.
 *
 * Deploy: Implementar → Gestionar implementaciones → Editar (lápiz)
 *         → Versión: Nueva versión → Implementar   (keeps the same /exec URL)
 *         Ejecutar como: Yo · Acceso: Cualquier usuario (Anyone, even anonymous)
 */

const CONTAINERS_SHEET = 'Containers';
const COSTS_SHEET      = 'Cost Breakdown';
const ORDERS_SHEET     = 'Orders';
const CHANGES_SHEET    = 'Order Changes';
const SALES_SHEET      = 'Sales';
const SETTINGS_SHEET   = 'Settings';
const META_SHEET       = 'Meta';        // per-dataset {updatedAt, updatedBy}
const DEMAND_SHEET     = 'Demand';       // derived Peru-ginger weekly demand by customer
const FORECASTS_SHEET  = 'Forecasts';    // append-only forecast snapshots (accuracy log)
const AUDIT_SHEET      = 'AuditLog';     // security + change audit trail

const BRAND = '#0d5026';

// ── SECURITY CONFIG ─────────────────────────────────────────────────────────
// NON-SECRET SENTINEL. The real token lives in Script Properties (key API_TOKEN),
// set by jlzRotateToken(). This constant is never a working token: getActiveToken_
// treats it as "not configured" and the backend then denies every request. So a
// leaked copy of this source can never be used to reach the Sheet. To (re)enable
// the backend after pasting this file, run jlzRotateToken() once — it stores a
// fresh token in Script Properties and emails it to you.
const API_TOKEN = 'ROTATE-ME-RUN-jlzRotateToken';

// Every action the front end is allowed to call. If you add a feature later,
// add its action name here or it WILL be blocked.
const ALLOWED_ACTIONS = [
  // reads
  'listContainers', 'listOrders', 'listSales', 'listSettings',
  'listDemand', 'listForecasts', 'listMeta',
  // writes
  'upsertContainer', 'appendContainer', 'deleteContainer',
  'replaceOrders', 'replaceSales', 'replaceDemand',
  'appendForecast', 'setSetting',
  // token health-check used by the web app
  'verifyToken',
];

// Column order MUST match the arrays the HTML builds (pushOrdersToSheet, etc.)
const ORDER_HEADERS = ['JLZ PO','Status','Mode','Supplier','Incoterm','Contract #',
  'Container #','JBJ Lot #','Cases','Net weight (lb)','CIF price/case','Freight (USD)',
  'CIF total','Order date','ETD estimated','ETD actual','ETA estimated','ETA actual',
  'Arrival estimated','Arrival actual','Port of discharge','Observations','Timestamp'];
const ORDER_FIELDS = ['jlzPo','status','mode','supplier','incoterm','contractNo',
  'containerNo','jbjLotNo','cases','netWeightLb','cifPriceCase','freightUsd',
  'cifTotal','orderDate','etdEstimated','etdActual','etaEstimated','etaActual',
  'arrivalEstimated','arrivalActual','portOfDischarge','observations','timestamp'];

const CHANGE_HEADERS = ['Timestamp','PO','Field','Old value','New value','Reason','Note'];
const CHANGE_FIELDS  = ['timestamp','po','field','oldValue','newValue','reason','note'];

const SALES_HEADERS = ['Week','Year','Week #','Cases','Sales','Orders'];
const SALES_FIELDS  = ['week','year','weekNum','cases','sales','orders'];

// Demand: long format, one row per (ISO week, customer). Lbs of Peru organic
// ginger sold. The HTML re-derives this from the WholesaleWare export each
// Monday and replaces the whole sheet (replaceDemand).
const DEMAND_HEADERS = ['Week','Customer','Lbs'];
const DEMAND_FIELDS  = ['week','customer','lbs'];

// Forecasts: APPEND-ONLY. One row per forecast snapshot. Never overwritten —
// this is what lets us score forecast vs actual over time.
const FORECAST_HEADERS = ['Made on','Horizon (wk)','Forecast lbs','Service level','Model','Note'];
const FORECAST_FIELDS  = ['madeOn','horizonWk','forecastLbs','serviceLevel','model','note'];

const KV_HEADERS = ['Key','Value'];   // shared layout for Settings + Meta

// ────────────────────────────────────────────────────────────────────────────
// POST
// ────────────────────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const a = p.action;
    const user = p.user || '';   // email of the writer; optional for old clients

    // ── SECURITY GATE ──
    const blocked = guard_(a, p.token, user, e);
    if (blocked) return blocked;
    auditLog_(a, user, 'OK', writeDetails_(p));   // record the authorized write

    if (a === 'upsertContainer' || a === 'appendContainer') {
      writeContainer_(p, a === 'upsertContainer');
      stampMeta_('containers', user);
      return out_({ ok: true }, e);
    }
    if (a === 'deleteContainer') {
      deletePO_(CONTAINERS_SHEET, 'PO', p.po);
      deletePO_(COSTS_SHEET, 'PO', p.po);
      stampMeta_('containers', user);
      return out_({ ok: true }, e);
    }
    if (a === 'replaceOrders') {
      replaceSheet_(ORDERS_SHEET, ORDER_HEADERS, p.orderRows);
      replaceSheet_(CHANGES_SHEET, CHANGE_HEADERS, p.changeRows);
      stampMeta_('orders', user);
      return out_({ ok: true }, e);
    }
    if (a === 'replaceSales') {
      replaceSheet_(SALES_SHEET, SALES_HEADERS, p.salesRows);
      stampMeta_('sales', user);
      return out_({ ok: true }, e);
    }
    if (a === 'replaceDemand') {
      replaceSheet_(DEMAND_SHEET, DEMAND_HEADERS, p.demandRows);
      stampMeta_('demand', user);
      return out_({ ok: true }, e);
    }
    if (a === 'appendForecast') {
      appendForecast_(p.forecastRow);
      stampMeta_('forecasts', user);
      return out_({ ok: true }, e);
    }
    if (a === 'setSetting') {
      setSetting_(p.key, p.value);
      stampMeta_('settings', user);
      return out_({ ok: true }, e);
    }
    return out_({ ok: false, error: 'Unknown action: ' + a }, e);
  } catch (err) {
    try { auditLog_('?', '', 'ERROR', String(err)); } catch (e2) {}
    return out_({ ok: false, error: String(err) }, e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET  (all reads support JSONP via ?callback=)
// ────────────────────────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'listContainers';
    const token  = (e && e.parameter && e.parameter.token)  || '';
    const user   = (e && e.parameter && e.parameter.user)   || '';

    // ── SECURITY GATE ──
    const blocked = guard_(action, token, user, e);
    if (blocked) return blocked;

    if (action === 'verifyToken')    return out_({ ok: true }, e);
    if (action === 'listContainers') return out_({ containers: listContainers_() }, e);
    if (action === 'listOrders')     return out_(listOrders_(), e);
    if (action === 'listSales')      return out_({ sales: readSheet_(SALES_SHEET, SALES_FIELDS) }, e);
    if (action === 'listSettings')   return out_({ settings: listSettings_() }, e);
    if (action === 'listDemand')     return out_({ demand: readSheet_(DEMAND_SHEET, DEMAND_FIELDS) }, e);
    if (action === 'listForecasts')  return out_({ forecasts: readSheet_(FORECASTS_SHEET, FORECAST_FIELDS) }, e);
    if (action === 'listMeta')       return out_({ meta: readMeta_() }, e);

    return out_({ ok: false, error: 'Unknown action: ' + action }, e);
  } catch (err) {
    try { auditLog_('?', '', 'ERROR', String(err)); } catch (e2) {}
    return out_({ ok: false, error: String(err) }, e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Security helpers
// ────────────────────────────────────────────────────────────────────────────

// Returns a response object if the request must be BLOCKED, or null if allowed.
// Uses out_(…, e) so JSONP reads still receive a callback-wrapped error instead
// of hanging (a plain JSON body would make the client time out).
//
// IMPORTANT: a DENIED request (bad/missing token) is anonymous and untrusted, so
// it is NOT written to the AuditLog Sheet — only to the execution log (console).
// Writing a Sheet row per tokenless request would let anyone on the internet grow
// the Sheet without bound and exhaust the daily write quota. A REJECTED request
// (valid token, disallowed action) DID authenticate, so it is worth a Sheet row.
function guard_(action, token, user, e) {
  const active = getActiveToken_();
  if (!active || !token || token !== active) {
    try { console.log('DENIED action=' + action + ' user=' + (user || '') +
                      (active ? ' reason=badtoken' : ' reason=backend-not-configured')); } catch (e2) {}
    return out_({ ok: false, error: 'unauthorized' }, e);
  }
  if (ALLOWED_ACTIONS.indexOf(action) === -1) {
    auditLog_(action, user, 'REJECTED', 'action not allowed');
    return out_({ ok: false, error: 'unknown action: ' + action }, e);
  }
  return null; // allowed
}

// Append one line to the AuditLog tab. Never throws — logging must never break
// the actual operation. Values pass through sheetSafe_ so a crafted user/detail
// string starting with = can't plant a formula in the audit trail.
function auditLog_(action, user, status, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let s = ss.getSheetByName(AUDIT_SHEET);
    if (!s) {
      s = ss.insertSheet(AUDIT_SHEET);
      s.appendRow(['Timestamp', 'User', 'Action', 'Status', 'Details']);
      s.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground(BRAND).setFontColor('#fff');
      s.setFrozenRows(1);
    }
    s.appendRow([new Date(), sheetSafe_(user || '(unknown)'), sheetSafe_(action || ''),
                 sheetSafe_(status || ''), sheetSafe_(details || '')]);
  } catch (e) { /* swallow — auditing must never block the request */ }
}

// Short human description of a write, for the audit log Detail column.
function writeDetails_(p) {
  if (!p) return '';
  if (p.po) return 'PO ' + p.po;
  if (p.key !== undefined) return String(p.key) + ' = ' + String(p.value);
  if (p.orderRows)   return p.orderRows.length + ' order rows';
  if (p.salesRows)   return p.salesRows.length + ' sales rows';
  if (p.demandRows)  return p.demandRows.length + ' demand rows';
  if (p.forecastRow) return 'forecast snapshot';
  return '';
}


// ────────────────────────────────────────────────────────────────────────────
// On-demand token (stored in Script Properties — out of this source, rotatable
// WITHOUT re-deploy, delivered by email so it never travels through chat).
// ────────────────────────────────────────────────────────────────────────────

// The token the backend currently accepts. It lives ONLY in Script Properties.
// If nothing is stored (you never ran jlzRotateToken), this returns null and the
// backend fails CLOSED — it denies every request. That is deliberate: it means a
// working token is never sitting in this source file. Run jlzRotateToken() once
// to configure it.
function getActiveToken_() {
  const stored = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  return (stored && stored.length >= 16) ? stored : null;
}

// Who receives the token emails.
const TOKEN_RECIPIENTS = 'juan@jlzproduce.com,michael@jlzproduce.com';

// ▶ RUN THIS to rotate: generates a brand-new random token, stores it, and
//   emails it to both of you. The previous token stops working immediately.
//   Run it whenever you want a fresh token (e.g. if you suspect a leak), and
//   right after pasting this file for the first time (the backend denies every
//   request until a token is stored).
function jlzRotateToken() {
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); // 64 hex chars
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  try {
    auditLog_('rotateToken', (Session.getActiveUser().getEmail() || '(script)'), 'OK', 'token rotated');
  } catch (e) {}
  MailApp.sendEmail(
    TOKEN_RECIPIENTS,
    'JLZ Container Intelligence — nuevo token de seguridad',
    'Se generó un token de seguridad NUEVO para la app.\n\n' +
    'TOKEN:\n' + token + '\n\n' +
    'Para usarlo: abre la app, dale al boton/candado "Token", pega este valor y guarda.\n' +
    'El token anterior ya quedo invalido.\n\n' +
    '(Mensaje automatico del backend — no respondas a este correo.)'
  );
}

// ▶ RUN THIS to re-send the CURRENT token (without rotating) — useful if someone
//   loses it and you don't want to force everyone to re-enter a new one.
function jlzEmailCurrentToken() {
  const token = getActiveToken_();
  if (!token) {
    MailApp.sendEmail(
      TOKEN_RECIPIENTS,
      'JLZ Container Intelligence — token NO configurado',
      'El backend todavia no tiene un token configurado, asi que esta negando ' +
      'todas las solicitudes.\n\nCorre la funcion jlzRotateToken() una vez para ' +
      'generar y enviar uno nuevo.\n\n(Mensaje automatico del backend.)'
    );
    return;
  }
  MailApp.sendEmail(
    TOKEN_RECIPIENTS,
    'JLZ Container Intelligence — token actual',
    'Este es el token ACTUAL de la app (no se roto nada):\n\n' + token + '\n\n' +
    '(Mensaje automatico del backend.)'
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function out_(obj, e) {
  const body = JSON.stringify(obj);
  const cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Formula-injection guard ─────────────────────────────────────────────────
// A text value that begins with = + - @ (or a tab / carriage return) is treated
// by Google Sheets as a FORMULA when written with setValue/setValues. A crafted
// supplier/customer/note like =HYPERLINK("http://evil","pay") would then run when
// Juan or Michael open the Sheet. Prefixing a single quote forces Sheets to store
// it as literal text (the quote itself is a display marker and is NOT part of the
// stored value, so reads round-trip cleanly). Numbers/dates pass through untouched.
function sheetSafe_(v) {
  return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? ("'" + v) : v;
}
function sheetSafeRow_(row) {
  return Array.isArray(row) ? row.map(sheetSafe_) : row;
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  return s;
}

function ensureHeaders_(s, headers) {
  if (s.getLastRow() === 0) {
    s.appendRow(headers);
    s.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground(BRAND).setFontColor('#fff');
    s.setFrozenRows(1);
  }
}

function fmt_(v) {
  // Use duck-typing instead of instanceof Date — in Apps Script V8 runtime,
  // instanceof Date can return false for Sheets date cell values even when
  // the value IS a Date, causing JSON.stringify to emit full datetime strings
  // like "2026-06-17T05:00:00.000Z" instead of "2026-06-17".
  if (v && typeof v === 'object' && typeof v.getTime === 'function') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

// Replace the body of a sheet (keep header) with the given rows of arrays.
function replaceSheet_(name, headers, rows) {
  const s = sheet_(name);
  ensureHeaders_(s, headers);
  const last = s.getLastRow();
  if (last > 1) s.getRange(2, 1, last - 1, s.getLastColumn()).clearContent();
  if (rows && rows.length) {
    const norm = rows.map(r => {
      const out = [];
      for (let i = 0; i < headers.length; i++) {
        out.push(sheetSafe_(r[i] === undefined || r[i] === null ? '' : r[i]));
      }
      return out;
    });
    s.getRange(2, 1, norm.length, headers.length).setValues(norm);
  }
}

// Read a sheet body into an array of objects, mapping columns by position.
function readSheet_(name, fields) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName(name);
  if (!s || s.getLastRow() < 2) return [];
  const rows = s.getDataRange().getValues().slice(1);
  return rows
    .map(r => {
      const o = {};
      for (let i = 0; i < fields.length; i++) o[fields[i]] = fmt_(r[i]);
      return o;
    })
    .filter(o => Object.keys(o).some(k => o[k] !== '' && o[k] !== null && o[k] !== undefined));
}

function listOrders_() {
  return {
    orders:  readSheet_(ORDERS_SHEET, ORDER_FIELDS),
    changes: readSheet_(CHANGES_SHEET, CHANGE_FIELDS),
  };
}

// Generic key/value upsert (Settings, Meta). Matches on trimmed key. Both key and
// value pass through sheetSafe_ so a crafted setSetting can't plant a formula.
function kvUpsert_(sheetName, headers, key, value) {
  const s = sheet_(sheetName);
  ensureHeaders_(s, headers);
  const vals = s.getDataRange().getValues();
  for (let r = 1; r < vals.length; r++) {
    if (String(vals[r][0]).trim() === String(key).trim()) {
      s.getRange(r + 1, 2).setValue(sheetSafe_(value));
      return;
    }
  }
  s.appendRow([sheetSafe_(key), sheetSafe_(value)]);
}

function setSetting_(key, value) {
  kvUpsert_(SETTINGS_SHEET, KV_HEADERS, key, value);
}

function listSettings_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName(SETTINGS_SHEET);
  const out = {};
  if (!s || s.getLastRow() < 2) return out;
  const vals = s.getDataRange().getValues();
  for (let r = 1; r < vals.length; r++) {
    const k = String(vals[r][0]).trim();
    if (k) out[k] = fmt_(vals[r][1]);
  }
  return out;
}

// ── Multi-user freshness metadata ───────────────────────────────────────────
// updatedAt is stored as epoch millis (a plain number) so the client can do an
// unambiguous numeric comparison — no date/timezone coercion, no precision loss.
function stampMeta_(dataset, user) {
  kvUpsert_(META_SHEET, KV_HEADERS, dataset + ':updatedAt', Date.now());
  kvUpsert_(META_SHEET, KV_HEADERS, dataset + ':updatedBy', user || '');
}

function readMeta_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName(META_SHEET);
  const out = {};
  if (!s || s.getLastRow() < 2) return out;
  const vals = s.getDataRange().getValues();
  for (let r = 1; r < vals.length; r++) {
    const k = String(vals[r][0]).trim();
    if (k) out[k] = fmt_(vals[r][1]);
  }
  return out;
}

// ── Forecast snapshots (append-only) ────────────────────────────────────────
function appendForecast_(row) {
  const s = sheet_(FORECASTS_SHEET);
  ensureHeaders_(s, FORECAST_HEADERS);
  if (row && row.length) {
    const norm = [];
    for (let i = 0; i < FORECAST_HEADERS.length; i++) {
      norm.push(sheetSafe_(row[i] === undefined || row[i] === null ? '' : row[i]));
    }
    s.appendRow(norm);
  }
}

function deletePO_(sheetName, poHeader, po) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const s = ss.getSheetByName(sheetName);
  if (!s || s.getLastRow() < 2) return;
  const vals = s.getDataRange().getValues();
  const idx = vals[0].map(h => String(h).trim()).indexOf(poHeader);
  if (idx < 0) return;
  const target = String(po).trim();
  for (let r = vals.length - 1; r >= 1; r--) {
    if (String(vals[r][idx]).trim() === target) s.deleteRow(r + 1);
  }
}

// Write one container + its cost rows. When isUpsert, first remove any existing
// rows for that PO so re-saving replaces instead of duplicating. Client-supplied
// rows pass through sheetSafeRow_ so no cell can carry a live formula.
function writeContainer_(p, isUpsert) {
  const cSheet = sheet_(CONTAINERS_SHEET);
  if (cSheet.getLastRow() === 0 && p.containerHeaders) {
    cSheet.appendRow(p.containerHeaders);
    cSheet.getRange(1, 1, 1, p.containerHeaders.length)
      .setFontWeight('bold').setBackground(BRAND).setFontColor('#fff');
    cSheet.setFrozenRows(1);
  }
  if (isUpsert && p.po) deletePO_(CONTAINERS_SHEET, 'PO', p.po);
  if (p.containerRow) cSheet.appendRow(sheetSafeRow_(p.containerRow));

  const kSheet = sheet_(COSTS_SHEET);
  if (kSheet.getLastRow() === 0 && p.costHeaders) {
    kSheet.appendRow(p.costHeaders);
    kSheet.getRange(1, 1, 1, p.costHeaders.length)
      .setFontWeight('bold').setBackground(BRAND).setFontColor('#fff');
    kSheet.setFrozenRows(1);
  }
  if (isUpsert && p.po) deletePO_(COSTS_SHEET, 'PO', p.po);
  if (p.costRows && p.costRows.length) p.costRows.forEach(r => kSheet.appendRow(sheetSafeRow_(r)));
}

// Containers reader — maps by header name (robust to column reordering) and
// groups Cost Breakdown rows by PO. Preserves the original FIELD_MAP behaviour.
function listContainers_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cSheet = ss.getSheetByName(CONTAINERS_SHEET);
  if (!cSheet || cSheet.getLastRow() < 2) return [];

  const values  = cSheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const rows    = values.slice(1);

  const FIELD_MAP = {
    'Saved date': 'savedAt', 'PO': 'po', 'Lot #': 'lot', 'Vendor': 'vendor',
    'Season': 'season', 'Incoterm': 'incoterm', 'Arrival date': 'arrival',
    'Last WO date': 'lastWoDate', 'Days in warehouse': 'days', 'Lbs in': 'lbsIn',
    'Lbs out': 'lbsOut', 'Yield %': 'yieldPct', 'Cases': 'boxes',
    'Purchase price/lb': 'priceLb', 'Declared lbs/box': 'declKg',
    'Actual lbs/box (QC)': 'avgKg', 'Transit loss (lbs)': 'originLoss',
    'Weight claim ($)': 'weightClaim', 'Warehouse shrink (lbs)': 'whShrink',
    'Warehouse shrink %': 'whShrinkPct', 'Defect %': 'defPct', 'Mold %': 'moldPct',
    'Supplier credit calculated ($)': 'creditCalc',
    'Supplier credit agreed ($)': 'creditAgreed', 'Net sales': 'netSales',
    'WW total costs': 'totalCosts', 'Net profit': 'netProfit',
    'Net margin %': 'netMargin', 'Sale price/lb': 'salePriceLb',
    'True cost/lb': 'trueCostLb', 'Break-even/lb': 'bePerLb',
    // Local-only fields that previously did not survive a cross-device sync.
    // Adding them here lets pnlFinal / soldAsIs travel through Sheets so other
    // users no longer see closed P&Ls revert to "unclaimed".
    'P&L final': 'pnlFinal', 'Sold as-is': 'soldAsIs',
    'Sold as-is reason': 'soldAsIsReason',
    'Timestamp': 'timestamp',
  };

  const costsByPO = {};
  const kSheet = ss.getSheetByName(COSTS_SHEET);
  if (kSheet && kSheet.getLastRow() >= 2) {
    const kVals = kSheet.getDataRange().getValues();
    const kHdr  = kVals[0].map(h => String(h).trim());
    const poIdx = kHdr.indexOf('PO');
    const catIdx = kHdr.indexOf('Category');
    const amtIdx = kHdr.indexOf('Amount ($)');
    if (poIdx >= 0 && catIdx >= 0 && amtIdx >= 0) {
      kVals.slice(1).forEach(r => {
        const po = String(r[poIdx] || '').trim();
        const cat = String(r[catIdx] || '').trim();
        const amt = parseFloat(r[amtIdx]) || 0;
        if (!po || !cat) return;
        if (!costsByPO[po]) costsByPO[po] = {};
        costsByPO[po][cat] = (costsByPO[po][cat] || 0) + amt;
      });
    }
  }

  const byPO = {};
  rows.forEach(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const key = FIELD_MAP[h];
      if (!key) return;
      obj[key] = fmt_(row[i]);
    });
    const po = String(obj.po || '').trim();
    if (po) byPO[po] = obj; // last row wins
  });

  return Object.keys(byPO).map(po => {
    const c = byPO[po];
    if (costsByPO[po]) c.costs = costsByPO[po];
    return c;
  });
}
