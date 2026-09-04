// Minimum surface of the app that the extracted functions reach for, plus a tiny
// assertion helper. Everything here is a stand-in; the code under test is lifted
// verbatim from the HTML by extract.py.

var _FAIL = 0, _PASS = 0, _GROUP = '';
function group(name){ _GROUP = name; console.log('\n── ' + name + ' ' + Array(Math.max(2, 62 - name.length)).join('─')); }
function check(label, got, want){
  var ok = (String(got) === String(want));
  if (ok) { _PASS++; console.log('  ok   ' + label); }
  else    { _FAIL++; console.log('  FAIL ' + label + '\n         esperado: ' + want + '\n         obtenido: ' + got); }
  return ok;
}
function ok(label, cond){ return check(label, cond ? 'true' : 'false', 'true'); }
function summary(){
  console.log('\n' + (_FAIL ? '✗ ' + _FAIL + ' fallas' : '✓ todo pasa') + '  (' + _PASS + ' checks)');
  return _FAIL;
}

// ── App surface ────────────────────────────────────────────────────────────
var window = {}, localStorage = {};
var _out = '';
var document = { getElementById: function(){ return { set innerHTML(v){ _out = v; }, get innerHTML(){ return _out; } }; } };

var DM_CASE_LB = 30;
var CASE_LB = 30;
var productCaseLb = function(){ return CASE_LB; };
var productLabel = function(p){ return p; };
var dmEsc = function(s){ return String(s); };
var dmZoneLabel = function(){ return ''; };
var cxWeekNo = function(){ return 0; };
var coGet = function(){ return null; };

// Overridden per-scenario by the tests.
var COMMITTED = [];
var getCommitted = function(){ return COMMITTED; };
var _cmProd = function(c){ return c.prod; };
// Tercer estado de una orden: despachada pero sin facturar. Por defecto ninguna lo está.
var _cmShipped = function(c){ return !!(c && c.shipped); };
var _cmOriginFor = function(c){ return c.origin || ''; };
var invmCommittedByWeek = function(prod, origin, fromWk){
  var o = {};
  COMMITTED.forEach(function(c){
    if (c.prod !== prod || c.wk < fromWk) return;
    if (origin && origin !== 'all' && c.origin !== origin) return;
    o[c.wk] = (o[c.wk] || 0) + c.cases;
  });
  return o;
};
