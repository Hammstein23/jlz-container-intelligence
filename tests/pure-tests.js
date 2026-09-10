// Invariants of the demand model, checked against the REAL functions lifted out of

// Secciones de más abajo reemplazan `hybridSalesForWeek` por stubs; guardamos la REAL acá arriba
// (el archivo se concatena después de app.js) para poder probarla de verdad más adelante.
var HYBRID_REAL = hybridSalesForWeek;
// Grupos más abajo reemplazan bpInvState por un stub; hay que guardarse la de producción o el test
// de la migración terminaría probando el stub (ya pasó con hybridSalesForWeek).
var BPINVSTATE_REAL = bpInvState;

// JLZ_Container_Intelligence.html. Each group locks in a bug that was found and fixed
// on 2026-09-01, so a regression fails here instead of quietly changing a buy plan.

// Las secciones de abajo reemplazan varias funciones por stubs. Guardá acá las reales que
// hagan falta después, o se termina testeando el stub y no el código (ya pasó una vez).
var _realBpFutureWeeks = bpFutureWeeks;

// ═══ 1. Week bucketing ══════════════════════════════════════════════════════
// Was: a bare 'YYYY-MM-DD' parses as UTC midnight, which west of Greenwich resolves to
// the previous day, so every MONDAY sale landed in the previous week.
// ── Entorno limpio al empezar cada grupo ──────────────────────────────────────────────────────
// Los grupos reemplazan funciones reales por stubs para armar su escenario, y ninguno las
// restauraba. El resultado: el grupo N heredaba los stubs del N-1 sin enterarse. Ya mordió una vez
// — un `dmWeekKey` clavado en '2026-08-31' y un `invmCommittedByWeek` que devolvía {} hacían que un
// grupo nuevo midiera los stubs en vez del código, y los checks pasaban o fallaban por la razón
// equivocada. En vez de pedirle a cada autor que se acuerde de restaurar, `group()` lo hace solo:
// cada grupo arranca con las funciones REALES y se stubea lo que necesite justo después de llamarlo.
var _PRISTINO_NOMBRES = [
  'nowcastProductModel','dmWeekKey','dmBuildModel','dmEffectiveRunRateLbs','hybridSalesForWeek',
  'committedInvForWeek','invmCommittedByWeek','getCommitted','getOrders','saveOrders',
  'ooClassifySku','productCaseLb','productLabel','cxWeekNo','cxEsc','_cmProd','_cmShipped',
  '_cmOriginFor','_ordProd','bpInvState','bpFutureWeeks','bpTodayISO','invmProductStats',
  'invmProductArrivals','invmF','invmMoney','dmWindow','productFocus','dmRowOrigin','dmNormalizeOrigin','dmGlobalDataMax',
  'dmIsInternalAcct','dmWeekStatus','findOrderForPo','prodInvState','whatifArrivals','DM_ACCENT',
  'CASE_LB',
  // Los insumos del numero de compra. Sin esto el stub de un grupo se filtraba al siguiente:
  // `mtoCasesPerWeek` clavado en 0 hacia fallar seis checks de su propio grupo, tres grupos despues.
  'PRODUCTS','invmProductModel','invmRunRateLbs','invmStockableWeekly','prodInvFor',
  'prodCommittedTotal','mtoCasesPerWeek','dsWindow','_ordOrigin','directShipTotal','invmOriginsFor'
];
var _PRISTINO = {};
_PRISTINO_NOMBRES.forEach(function(n){ try { _PRISTINO[n] = eval(n); } catch (e) {} });
var _grupoSinLimpiar = group;
group = function(nombre){
  _PRISTINO_NOMBRES.forEach(function(n){
    if (!(n in _PRISTINO)) return;
    try { eval(n + ' = _PRISTINO[' + JSON.stringify(n) + ']'); } catch (e) {}
  });
  return _grupoSinLimpiar(nombre);
};

group('dmWeekKey — la semana a la que pertenece cada fecha');
var DAY = ['dom','lun','mar','mie','jue','vie','sab'];
[['2026-08-24','2026-08-24'],   // lunes → su propia semana
 ['2026-08-25','2026-08-24'],
 ['2026-08-30','2026-08-24'],   // domingo → cierra la semana
 ['2026-08-31','2026-08-31'],   // lunes → abre la siguiente
 ['2026-09-07','2026-09-07'],
 ['2026-01-05','2026-01-05'],   // lunes en cambio de año
 ['2025-03-05','2025-03-03']
].forEach(function(t){
  var d = new Date(t[0] + 'T12:00:00');
  check(t[0] + ' (' + DAY[d.getDay()] + ')', dmWeekKey(t[0]), t[1]);
});
check('acepta un Date, no solo string', dmWeekKey(new Date('2026-08-31T12:00:00')), '2026-08-31');
check('acepta string con hora', dmWeekKey('2026-08-31T00:00:00Z'), '2026-08-31');
ok('acepta la fecha de hoy', /^\d{4}-\d{2}-\d{2}$/.test(dmWeekKey(new Date())));

// ═══ 2. Nowcast ═════════════════════════════════════════════════════════════
group('nowcastProductModel — completar semanas con órdenes reservadas');
var WK = ['2026-07-27','2026-08-03','2026-08-10','2026-08-17','2026-08-24'];
var CUR = dmWeekKey(new Date());
COMMITTED = [
  { type:'inv', wk:'2026-08-24', customer:'WHOLE FOODS', cases:20, prod:'turmeric', origin:'Fiji' },
  { type:'inv', wk:'2026-08-24', customer:'MID GROCER',  cases:6,  prod:'turmeric', origin:'Fiji' },
  { type:'inv', wk:'2026-08-24', customer:'HAWAII ONLY', cases:24, prod:'turmeric', origin:'Hawaii' }, // otro origen
  { type:'inv', wk:'2026-08-24', customer:'LUMPY LLC',   cases:40, prod:'turmeric', origin:'Fiji' }    // order-driven
];
var wkCust = {};
WK.forEach(function(w, i){ wkCust[w] = { 'WHOLE FOODS':30*(20+i), 'MID GROCER':30*(9+(i%3)), 'TINY CO':30*(i%2) }; });
wkCust[WK[4]]['WHOLE FOODS'] = 30*5;          // W35 solo parcialmente facturada
var weekly = WK.map(function(w){
  var t = 0; Object.keys(wkCust[w]).forEach(function(c){ t += wkCust[w][c]; });
  return { week:w, lbs:t };
});
var BASE = {
  caseLb:30, wkCust:wkCust, weekly:weekly, weeklyReliable:weekly.slice(0,4), rateWeeks:WK.slice(0,4),
  customers:[
    { c:'WHOLE FOODS', rrCases:22,  rr6Cases:22,  rr3Cases:22,  sporadic:false, ovr:{} },
    { c:'MID GROCER',  rrCases:10,  rr6Cases:10,  rr3Cases:10,  sporadic:false, ovr:{} },
    { c:'TINY CO',     rrCases:0.5, rr6Cases:0.5, rr3Cases:0.5, sporadic:false, ovr:{} },
    { c:'PINNED CO',   rrCases:7,   rr6Cases:7,   rr3Cases:7,   sporadic:false, ovr:{rr:true} },
    { c:'LUMPY LLC',   rrCases:0,   rr6Cases:0,   rr3Cases:0,   sporadic:true,  ovr:{} }
  ]
};
var M = nowcastProductModel(BASE, 'turmeric', 'Fiji');
var by = {}; M.customers.forEach(function(c){ by[c.c] = c; });
var r1 = function(x){ return Math.round((x||0)*10)/10; };

ok('no se cuela otro origen',  M.customers.every(function(c){ return c.c !== 'HAWAII ONLY'; }));
check('order-driven no se infla con su orden', r1(by['LUMPY LLC'].rr3Cases), 0);
check('override manual sobrevive en 13wk', by['PINNED CO'].rrCases, 7);
check('override manual aplica en 6wk',     by['PINNED CO'].rr6Cases, 7);
check('override manual aplica en 3wk',     by['PINNED CO'].rr3Cases, 7);
ok('la semana en curso queda fuera del promedio', M.rateWeeks.indexOf(CUR) < 0);
// El punto de todo: las filas tienen que explicar el agregado.
var sum3 = 0; M.customers.forEach(function(c){ if(!c.sporadic) sum3 += c.rr3Cases; });
check('suma de run-rates por cliente = run-rate agregado', r1(M.runRate3/30), r1(sum3));

// ═══ 3. Semanas en cero ═════════════════════════════════════════════════════
// Was: the week list ends at the last week WITH sales, so a product that goes quiet and
// then books an order averaged only its good weeks (turmeric Hawaii: 30 vs a true 10).
group('nowcast — un producto que se calla');
COMMITTED = [
  { type:'inv', wk:'2026-08-24', customer:'ISLAND CO', cases:30, prod:'turmeric', origin:'Hawaii' },
  { type:'inv', wk:'2026-09-14', customer:'ISLAND CO', cases:99, prod:'turmeric', origin:'Hawaii' } // futura
];
var wkH = {}, wklyH = [];
['2026-07-13','2026-07-20','2026-07-27','2026-08-03'].forEach(function(w){
  wkH[w] = { 'ISLAND CO': 30*10 }; wklyH.push({ week:w, lbs:30*10 });
});
var H = nowcastProductModel(
  { caseLb:30, wkCust:wkH, weekly:wklyH, weeklyReliable:wklyH, rateWeeks:Object.keys(wkH).sort(),
    customers:[{ c:'ISLAND CO', rrCases:10, rr6Cases:10, rr3Cases:10, sporadic:false, ovr:{} }] },
  'turmeric', 'Hawaii');
var w3 = H.rateWeeks.slice(-3), skips = 0;
for (var i = 1; i < w3.length; i++){
  if (Math.round((new Date(w3[i]+'T12:00:00') - new Date(w3[i-1]+'T12:00:00'))/864e5) !== 7) skips++;
}
check('la ventana es calendario-continua', skips, 0);
check('las semanas sin ventas cuentan como cero: (0+0+30)/3', r1(H.runRate3/30), 10);
ok('una orden para una semana FUTURA no entra al historial', H.rateWeeks.indexOf('2026-09-14') < 0);

// ═══ 4. Build-up por cliente ════════════════════════════════════════════════
// Every visible column must add up to the TOTAL printed under it, and the accounts
// inside "Other small accounts" must add up to that row.
group('renderBuildupPanel — las columnas cuadran');
CASE_LB = 30;
var productFocus = function(){ return 'turmeric'; };
var dmWindow = function(){ return 6; };
var _dmOrigin = 'Fiji';
var _mtoSave0 = (typeof mtoByCustomer === 'function') ? mtoByCustomer : null;
mtoByCustomer = function(){ return { 'SOL-TI': 1 }; };
// (dmEffectiveRunRateLbs NO se stubea: turmeric no la llama, y ginger la necesita de verdad)
var PRODUCTS = { turmeric: { shrinkPct: 5 } };
var BWK = ['2026-07-20','2026-07-27','2026-08-03','2026-08-10','2026-08-17','2026-08-24'];
COMMITTED = [
  { type:'inv', wk:'2026-08-24', customer:'WHOLE FOODS', cases:20, prod:'turmeric', origin:'Fiji' },
  { type:'inv', wk:'2026-08-24', customer:'TINY CO',     cases:6,  prod:'turmeric', origin:'Fiji' },
  { type:'inv', wk:'2026-08-24', customer:'HAWAII ONLY', cases:24, prod:'turmeric', origin:'Hawaii' },
  { type:'inv', wk:'2026-08-24', customer:'LUMPY LLC',   cases:40, prod:'turmeric', origin:'Fiji' },
  { type:'inv', wk:'2026-09-07', customer:'WHOLE FOODS', cases:30, prod:'turmeric', origin:'Fiji' }
];
var bwkCust = {};
BWK.forEach(function(w, i){
  bwkCust[w] = { 'WHOLE FOODS':30*(20+i), 'MID GROCER':30*(9+(i%3)), 'TINY CO':30*(i%2),
                 'SOL-TI':30*50, 'LAPSED INC': (i < 2 ? 30*4 : 0) };
});
var _dmModel = {
  caseLb:30, rateWeeks:BWK, wkCust:bwkCust, nowcastWeeks:{ '2026-08-24':'now' },
  runRate13:30*32, runRate6:30*32, runRate3:30*32,
  customers:[
    { c:'WHOLE FOODS', rrCases:22,  rr6Cases:22,  rr3Cases:22,  sporadic:false },
    { c:'MID GROCER',  rrCases:10,  rr6Cases:10,  rr3Cases:10,  sporadic:false },
    { c:'TINY CO',     rrCases:0.5, rr6Cases:0.5, rr3Cases:0.5, sporadic:false },
    { c:'SOL-TI',      rrCases:50,  rr6Cases:50,  rr3Cases:50,  sporadic:false },
    { c:'LUMPY LLC',   rrCases:0,   rr6Cases:0,   rr3Cases:0,   sporadic:true  }
  ]
};
var _dmModelG = _dmModel;
var bpFutureWeeks = function(n){
  var out = [], d = new Date('2026-08-24T12:00:00');
  for (var i = 0; i < n; i++){ var x = new Date(d); x.setDate(x.getDate() + 7*i);
    out.push({ weekStartISO:dmISOLocal(x), weekNum:35 + i }); }
  return out;
};
var hybridSalesForWeek = function(){ return 32; };

renderBuildupPanel();
var HTML = _out;
function rowsOf(h){
  var out = [], re = /<tr([^>]*)>([\s\S]*?)<\/tr>/g, m;
  while ((m = re.exec(h))){
    var cls = (/class="([^"]*)"/.exec(m[1]) || ['',''])[1], cells = [], cre = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g, c;
    while ((c = cre.exec(m[2]))) cells.push(c[1].replace(/<[^>]*>/g,'').trim());
    out.push({ cls:cls, cells:cells });
  }
  return out;
}
var ROWS = rowsOf(HTML);
var hasCls = function(r,c){ return (' ' + r.cls + ' ').indexOf(' ' + c + ' ') > -1; };
var num = function(s){ var v = parseFloat(String(s).replace(/,/g,'')); return isNaN(v) ? 0 : v; };
var totRow = ROWS.filter(function(r){ return hasCls(r,'tot'); })[0];
var othRow = ROWS.filter(function(r){ return hasCls(r,'oth-sum'); })[0];
var detRows = ROWS.filter(function(r){ return hasCls(r,'oth-det'); });
var custRows = ROWS.filter(function(r){ return r.cls === '' && totRow && r.cells.length === totRow.cells.length; });

ok('la tabla se renderizó', !!totRow);
var badCol = 0, badDet = 0;
for (var ci = 1; totRow && ci < totRow.cells.length; ci++){
  var s = 0; custRows.forEach(function(r){ s += num(r.cells[ci]); });
  if (Math.abs(s + (othRow ? num(othRow.cells[ci]) : 0) - num(totRow.cells[ci])) > 0.5) badCol++;
  var ds = 0, any = false; detRows.forEach(function(r){ ds += num(r.cells[ci]); any = true; });
  if (any && othRow && num(othRow.cells[ci]) > 0 && Math.abs(ds - num(othRow.cells[ci])) > 0.5) badDet++;
}
check('clientes + Other = TOTAL en cada columna', badCol, 0);
check('el desglose suma exactamente el Other', badDet, 0);
ok('las cuentas chicas aparecen con nombre', detRows.length > 0);
// Direct-ship is deliberately listed BELOW the table (so it can be switched back on),
// so this must look at the table rows, not at the whole panel.
var inTable = custRows.concat(detRows).map(function(r){ return r.cells[0]; }).join(' | ');
ok('direct-ship (SOL-TI) fuera de las filas', inTable.indexOf('SOL-TI') < 0);
ok('direct-ship sí queda listado abajo, para poder revertirlo', /SOL-TI/.test(HTML));
ok('otro origen (HAWAII ONLY) fuera del panel entero', !/HAWAII ONLY/.test(HTML));



// ═══ 5. Build-up de GINGER — la otra rama ═══════════════════════════════════
// Ginger no usa el run-rate del modelo como base: usa dmEffectiveRunRateLbs(), que le resta
// las cuentas quiet sacadas a mano. Es una rama distinta (`isG`) del mismo panel, y hasta
// ahora ningún test la tocaba: todos corrían con turmeric.
group('renderBuildupPanel — rama de ginger');

CASE_LB = 30;
productFocus = function(){ return 'ginger'; };
dmWindow = function(){ return 6; };
_dmOrigin = 'All';

PRODUCTS = { ginger: { shrinkPct: 14 } };
COMMITTED = [];
var GWK = ['2026-07-13','2026-07-20','2026-07-27','2026-08-03','2026-08-10','2026-08-17'];
var gwk = {};
GWK.forEach(function(w){ gwk[w] = { 'BIG CO': 30*500, 'MID CO': 30*200, 'DORMIDA SA': 30*100 }; });
_dmModelG = {
  caseLb: 30, rateWeeks: GWK, wkCust: gwk, nowcastWeeks: {},
  runRate13: 30*800, runRate6: 30*800, runRate3: 30*800,
  customers: [
    { c:'BIG CO',     rrCases:500, rr6Cases:500, rr3Cases:500, sporadic:false },
    { c:'MID CO',     rrCases:200, rr6Cases:200, rr3Cases:200, sporadic:false },
    { c:'DORMIDA SA', rrCases:100, rr6Cases:100, rr3Cases:100, sporadic:false }
  ]
};
_dmModel = _dmModelG;
var qaModelG = function(){ return _dmModelG; };
var _quiet = [], _pct = {};
var qaQuietList = function(){ return _quiet; };
var qaPct = function(c){ return (_pct[c] != null) ? _pct[c] : 100; };
window._bpDigest = { salesDemand: 800, weeklyDemand: 800/0.86 };
bpFutureWeeks = function(n){
  var out = [], d = new Date('2026-08-17T12:00:00');
  for (var i = 0; i < n; i++){ var x = new Date(d); x.setDate(x.getDate() + 7*i);
    out.push({ weekStartISO:dmISOLocal(x), weekNum:34 + i }); }
  return out;
};
hybridSalesForWeek = function(iso, base){ return base; };

function gingerTable(){
  renderBuildupPanel();
  var R = rowsOf(_out);
  var tot = R.filter(function(r){ return hasCls(r,'tot'); })[0];
  var oth = R.filter(function(r){ return hasCls(r,'oth-sum'); })[0];
  var cus = R.filter(function(r){ return r.cls === '' && tot && r.cells.length === tot.cells.length; });
  return { tot:tot, oth:oth, cus:cus };
}

// Sin cuentas sacadas: la base del plan es el run-rate del modelo y todo tiene que cuadrar.
_quiet = []; _pct = {};
var G = gingerTable();
ok('la tabla de ginger se renderiza', !!G.tot);
check('el plan usa el run-rate del modelo', Math.round(dmEffectiveRunRateLbs()/30), 800);
var gBad = 0;
for (var gi = 1; G.tot && gi < G.tot.cells.length; gi++){
  var gs = 0; G.cus.forEach(function(r){ gs += num(r.cells[gi]); });
  if (Math.abs(gs + (G.oth ? num(G.oth.cells[gi]) : 0) - num(G.tot.cells[gi])) > 0.5) gBad++;
}
check('clientes + Other = TOTAL en cada columna', gBad, 0);

// Ahora se saca del plan una cuenta quiet: la base baja 100 cs. El TOTAL de la tabla dice
// ser "lo que usa el Buy Planner", así que tiene que bajar con ella.
_quiet = [{ c:'DORMIDA SA', rrLbs: 30*100 }]; _pct = { 'DORMIDA SA': 0 };
check('el plan resta la cuenta sacada', Math.round(dmEffectiveRunRateLbs()/30), 700);
var G2 = gingerTable();
var projIdx = G2.tot.cells.length - 1;              // una columna proyectada cualquiera
var g2rows = 0; G2.cus.forEach(function(r){ g2rows += num(r.cells[projIdx]); });
var g2oth = G2.oth ? num(G2.oth.cells[projIdx]) : 0;
check('el TOTAL proyectado sigue al plan (700), no al modelo (800)', num(G2.tot.cells[projIdx]), 700);
check('las filas + Other suman ese TOTAL', g2rows + g2oth, num(G2.tot.cells[projIdx]));


// ═══ 5b. Las cinco tablas se leen igual ═════════════════════════════════════
// Garlic no mostraba la semana en curso y ginger sí, con el mismo renderer: el bloque entero
// cuelga de `partialWeek`, que el modelo solo define si esa semana tiene facturación o committed
// no order-driven. Garlic no tenía ninguna de las dos y perdía la columna — con sus 210 cs
// reservadas adentro. Y las semanas `prelim` salían con el MISMO punto que las completadas,
// que significan lo contrario: una promedia y la otra se muestra justamente porque no.
group('Build-up · la semana en curso siempre está, y cada marca dice una cosa');
var _bw = function(off){ var d = new Date(); d.setDate(d.getDate() + off); return dmWeekKey(d); };
var CURB = _bw(0), PRELB = _bw(-7);
var _AVGW = [_bw(-28), _bw(-21), _bw(-14)];          // las tres que SÍ promedian
var _bwc = {}; _AVGW.concat([PRELB]).forEach(function(w){ _bwc[w] = { 'STEADY CO': 30*100 }; });
COMMITTED = [{ type:'inv', wk:CURB, customer:'LUMPY LLC', cases:217, prod:'ginger', origin:'' }];
_dmModelG = {
  caseLb:30, rateWeeks:_AVGW, wkCust:_bwc,
  nowcastWeeks:{}, prelimWeeks:[{ week:PRELB, lbs:30*40, prelim:true }],
  runRate13:30*100, runRate6:30*100, runRate3:30*100,
  customers:[
    { c:'STEADY CO', rrCases:100, rr6Cases:100, rr3Cases:100, sporadic:false },
    { c:'LUMPY LLC', rrCases:0,   rr6Cases:0,   rr3Cases:0,   sporadic:true  }
  ]
};
_dmModelG.nowcastWeeks[PRELB] = 'prelim';
_dmModel = _dmModelG;
renderBuildupPanel();
var HB = _out;
ok('la semana en curso tiene columna aunque no facture nada', /in progress/.test(HB));
// Anclado a la sub-columna "to ship": el número suelto también aparece en las proyectadas,
// así que buscarlo en toda la tabla pasaba incluso sin la columna nueva.
ok('…y ahí aparecen las cajas reservadas de la cuenta order-driven', /hp-b"[^>]*>[^<]*217/.test(HB));
ok('la semana a medias lleva marca hueca', HB.indexOf('<sup class="hc">\u25CB</sup>') >= 0);
ok('…y no el punto lleno de las completadas', HB.indexOf('<sup class="nc">\u25CF</sup>') < 0);
ok('…con su propia clase, no la de las completadas',
   HB.indexOf('hist-prelim') >= 0 && HB.indexOf('hist-now') < 0);
var _band = /ACTUAL &middot; last (\d+) wk/.exec(HB);
check('la banda cuenta SOLO las semanas que promedian', _band && _band[1], '3');
ok('…y avisa de las dos que no', /current week not averaged/.test(HB) && /half-invoiced, not averaged/.test(HB));
ok('la leyenda explica las tres marcas', /completed with orders/.test(HB) && /week in progress/.test(HB));

// ═══ 6. Fechas locales serializadas a UTC ═══════════════════════════════════
// toISOString() convierte a UTC primero, así que al oeste de Greenwich una fecha de la NOCHE
// avanza un día. Las llaves de semana del Buy Planner salían martes después de las ~7pm, y todo
// lookup por semana (el committed sobre todo) fallaba: órdenes reales desaparecían del plan.
group('dmISOLocal — la fecha local, sin pasar por UTC');
[[8,'2026-08-31'], [15,'2026-08-31'], [19,'2026-08-31'], [21,'2026-08-31'], [23,'2026-08-31'],
 [0,'2026-08-31'], [1,'2026-08-31']].forEach(function(t){
  check('lunes 31/08 a las ' + t[0] + ':00 local', dmISOLocal(new Date(2026, 7, 31, t[0], 30)), t[1]);
});
check('fin de año a la noche', dmISOLocal(new Date(2026, 11, 31, 23, 30)), '2026-12-31');
check('un Date inválido no rompe', dmISOLocal(new Date('nada')), '');
check('algo que no es Date tampoco', dmISOLocal('2026-08-31'), '');

group('bpFutureWeeks — las semanas que usa el plan');
var FW = _realBpFutureWeeks(8);   // la REAL, no el stub que dejó la sección de ginger
check('devuelve las 8 semanas pedidas', FW.length, 8);
var fwBad = 0, fwNotMon = 0;
FW.forEach(function(w){
  // La llave tiene que ser un lunes de verdad, y coincidir con la que produce dmWeekKey:
  // si no coinciden, el join contra el modelo y contra el committed falla en silencio.
  if (dmWeekKey(w.weekStartISO) !== w.weekStartISO) fwBad++;
  if (new Date(w.weekStartISO + 'T12:00:00').getDay() !== 1) fwNotMon++;
});
check('todas las llaves son lunes', fwNotMon, 0);
check('todas coinciden con dmWeekKey (el join no falla)', fwBad, 0);
var fwGap = 0;
for (var fi = 1; fi < FW.length; fi++){
  if (Math.round((new Date(FW[fi].weekStartISO+'T12:00:00') - new Date(FW[fi-1].weekStartISO+'T12:00:00'))/864e5) !== 7) fwGap++;
}
check('van de 7 en 7 días', fwGap, 0);
// Las tres de arriba solo fallan según la hora y la zona horaria. Ésta no: la llave de semana
// NUNCA debe salir de toISOString, y eso se puede afirmar leyendo la función.
ok('bpFutureWeeks no serializa la llave por UTC', !/\.toISOString\s*\(/.test(String(_realBpFutureWeeks)));


// ═══ 7. Semanas de cobertura ════════════════════════════════════════════════
// Detectado por Juan mirando el Simulator: la Wk 40 terminaba con 3.892 cs y mostraba 2,9w,
// mientras la Wk 41 terminaba con 2.987 y mostraba 3,3w. Más stock, menos cobertura.
// La causa: se dividía por la demanda de ESA misma semana (1.346 vs 905), no por lo que
// realmente queda por consumir. Con demanda despareja el número no significaba nada.
group('bpWeeksOfCover — cuánto dura lo que ya tengo');
var r2 = function(x){ return Math.round(x * 10) / 10; };

check('demanda pareja: 900 contra 300/semana', r2(bpWeeksOfCover(900, [300,300,300,300])), 3);
check('se corta a mitad de semana', r2(bpWeeksOfCover(800, [300,300,300])), r2(2 + 200/300));
check('sin stock no hay cobertura', bpWeeksOfCover(0, [300,300]), 0);
check('stock negativo tampoco', bpWeeksOfCover(-50, [300]), 0);
check('una semana sin demanda igual suma', r2(bpWeeksOfCover(300, [0, 300])), 2);
check('si sobrevive todo el horizonte, devuelve el horizonte', bpWeeksOfCover(99999, [300,300,300]), 3);
check('sin semanas por delante, 0', bpWeeksOfCover(500, []), 0);

// El caso real de la captura, con las demandas que efectivamente venían después.
var wk40 = bpWeeksOfCover(3892, [905,905,905,905,905]);
var wk41 = bpWeeksOfCover(2987, [905,905,905,905]);
check('Wk 40 (3.892 cs) ahora da 4,3w', r2(wk40), 4.3);
check('Wk 41 (2.987 cs) da 3,3w', r2(wk41), 3.3);
ok('MÁS stock da MÁS cobertura — que era el bug', wk40 > wk41);

// La propiedad general: con las mismas demandas por delante, más stock nunca puede cubrir menos.
var mono = true, prevC = -1;
[500, 1000, 2000, 3000, 5000].forEach(function(st){
  var c = bpWeeksOfCover(st, [800,600,900,700,800,600]);
  if (c < prevC) mono = false;
  prevC = c;
});
ok('la cobertura crece de forma monótona con el stock', mono);

// ════ El origen elegido manda ═══════════════════════════════════════════════
// Juan abrió Ginger → Hawaii y el build-up listaba los clientes de PERÚ: para ginger el modelo
// era siempre `_dmModelG` (todos los orígenes, el de producción del Buy Planner), ignorando el
// selector. La auditoría por producto no lo agarraba porque el par producto+ORIGEN nunca se probaba.
group('Build-up · respeta el origen elegido');

productFocus = function(){ return 'ginger'; };
dmWindow = function(){ return 13; };

dmEffectiveRunRateLbs = function(){ return 892 * 30; };
PRODUCTS = { ginger: { shrinkPct: 14 } };
var _mk = function(custs, wkCust, rr){ return { caseLb:30, runRate13:rr*30, runRate6:rr*30, runRate3:rr*30,
  rateWeeks:['2026-07-20','2026-07-27','2026-08-03','2026-08-10','2026-08-17','2026-08-24'],
  partialWeek:{week:'2026-08-31'}, nowcastWeeks:{}, wkCust:wkCust, customers:custs }; };
_dmModelG = _mk([{c:"Whole Foods Market",rrCases:371,rr6Cases:371,rr3Cases:371,sporadic:false},
                 {c:"Sol-ti",rrCases:233,rr6Cases:233,rr3Cases:233,sporadic:true}],
                {'2026-08-24':{"Whole Foods Market":371*30}}, 892);
_dmModel  = _mk([{c:"Kailani Farms",rrCases:8,rr6Cases:8,rr3Cases:8,sporadic:false}],
                {'2026-08-24':{"Kailani Farms":8*30}}, 8);
COMMITTED = [];
var _names = function(){ var o=[],re=/class="nm"[^>]*>([^<]+)</g,m;
  while((m=re.exec(_out))) if(m[1]!=='Other small accounts' && m[1]!=='Unattributed') o.push(m[1]);
  return o; };

_dmOrigin = 'Hawaii'; renderBuildupPanel();
var _haw = _names();
check('con Hawaii elegido se lista 1 cliente', _haw.length, 1);
check('y es el de Hawaii', _haw[0], 'Kailani Farms');
ok('NO se cuelan los clientes de Peru', _haw.indexOf('Whole Foods Market') < 0 && _haw.indexOf('Sol-ti') < 0);
ok('y el pie no promete el número del Buy Planner (ese es el modelo global)',
   !/what the Buy Planner uses/.test(_out));

_dmOrigin = ''; renderBuildupPanel();
var _all = _names();
ok('sin origen elegido vuelve al modelo de producción', _all.indexOf('Whole Foods Market') >= 0);
ok('y ahí sí es el número del Buy Planner', /what the Buy Planner uses/.test(_out));

// ════ Direct-ship nunca es demanda de stock ═════════════════════════════════
// Whole Foods despacha garlic de puerto al cliente. El caller lo saca de la base pero
// hybridSalesForWeek le volvía a sumar el committed → +82 cajas fantasma en "Other small accounts"
// y un "Buy 111" de producto que no pasa por cámara.
group('hybridSalesForWeek · direct-ship fuera de la demanda de stock');
hybridSalesForWeek = HYBRID_REAL;   // volver a la función real: arriba quedó stubbeada
var _mdl = { customers:[{c:'Whole Foods Market', rrCases:58, rr6Cases:37, rr3Cases:74, sporadic:true},
                        {c:"Albert's Organics", rrCases:31, rr6Cases:20, rr3Cases:18, sporadic:false}] };
COMMITTED = [{prod:'garlic', wk:'2026-09-07', customer:'Whole Foods Market', cases:140, type:'inv', origin:'California'}];
_cmProd = function(c){ return c.prod; };
dmWindow = function(){ return 6; };

// La marca sale de las ÓRDENES (mtoByCustomer), ya no de un flag por cliente.
mtoByCustomer = function(){ return { 'Whole Foods Market': 1 }; };
check('compra contra orden: su committed NO infla el plan', Math.round(hybridSalesForWeek('2026-09-07', 23, _mdl, 'garlic')), 23);
mtoByCustomer = function(){ return {}; };
check('sin contenedor marcado, la misma orden sí entra', Math.round(hybridSalesForWeek('2026-09-07', 23, _mdl, 'garlic')), 23 + (140 - 37));
ok('y usa la ventana activa (rr6=37), no rrCases de 13 semanas (58)',
   Math.round(hybridSalesForWeek('2026-09-07', 23, _mdl, 'garlic')) !== 23 + (140 - 58));
if(_mtoSave0) mtoByCustomer = _mtoSave0;

// ════ El nowcast tiene que respetar la ventana ══════════════════════════════
// `rrCases` se recalculaba con avgCust(c, _rw) sobre TODAS las semanas (184, desde 2023), no las 13
// de su agregado. Arreglar dmBuildModel no alcanzaba: el nowcast lo volvía a pisar. Efecto real:
// Christopher Ranch marcaba 229 cs/sem cuando en 13 semanas vendió 120 cajas en UNA semana (≈9).
group('nowcastProductModel · rrCases mide 13 semanas, no toda la historia');

var LONG = [];
for (var _i = 0; _i < 30; _i++){
  var _d = new Date(Date.UTC(2026, 1, 2) + _i * 7 * 86400000);
  LONG.push(_d.toISOString().slice(0, 10));
}
var _wc = {};
LONG.forEach(function(w){ _wc[w] = {}; });
_wc[LONG[5]]['OLD WHALE']   = 30 * 2000;   // vendió muchísimo, pero hace 25 semanas
_wc[LONG[20]]['RECENT LUMP'] = 30 * 120;   // 120 cajas en UNA semana, dentro de las últimas 13
var _wkly = LONG.map(function(w){
  var t = 0; Object.keys(_wc[w]).forEach(function(c){ t += _wc[w][c]; }); return { week:w, lbs:t };
});
var LONGBASE = { caseLb:30, wkCust:_wc, weekly:_wkly, weeklyReliable:_wkly, rateWeeks:LONG,
  customers:[ { c:'OLD WHALE', rrCases:999, rr26Cases:999, rr6Cases:0, rr3Cases:0, sporadic:false, ovr:{} } ] };
COMMITTED = [];
var NM = nowcastProductModel(LONGBASE, 'turmeric', 'Fiji');
ok('el nowcast no rompe con un historial largo', !!(NM && NM.customers && NM.customers.length === 1));

// Guard de código: el nowcast recalcula las tasas por cliente, y ahí volvía a perderse la ventana.
// Arreglar dmBuildModel no alcanzaba — esta segunda copia lo pisaba y Christopher Ranch seguía
// marcando 229 cs/sem con 120 cajas vendidas en UNA semana de 13. Se verifica sobre la fuente real
// porque el recálculo solo corre cuando hay semanas nowcasteadas, y eso no se puede forzar acá.
var _nsrc = String(nowcastProductModel);
ok('rrCases NO se promedia sobre toda la historia', !/avgCust\(c\.c,\s*_rw\)/.test(_nsrc));
ok('rrCases se mide sobre las últimas 13 semanas', /avgCust\(c\.c,\s*_rw\.slice\(-13\)\)/.test(_nsrc));
ok('existe la ventana de 26 y también se mide con slice', /_rw\.slice\(-26\)/.test(_nsrc));
ok('el override de 13 semanas también compara contra la ventana, no contra la vida entera',
   /_ov13\s*\+=[^;]*_rw\.slice\(-13\)/.test(_nsrc));

// ════ Quién es direct-ship depende del PRODUCTO ═════════════════════════════
// El par es cliente+producto: Sol-ti en turmeric, Whole Foods en garlic. La UI tenía "Sol-ti"
// hardcodeado en tres lugares, así que la pantalla de garlic decía "Sol-ti made to order" cuando
// las 74 cs/sem eran de Whole Foods. Un cliente leyendo eso saca la conclusión equivocada.
group('made to order · la etiqueta nombra a la cuenta real, no a Sol-ti');
// Se llamaba "direct-ship", pero eso significa "nunca toca el almacén" y la mitad de los casos sí
// entra a la cámara (el ajo de Whole Foods). Lo que define al concepto para el plan es que se compra
// CONTRA una orden confirmada, no la ruta física.

var _PAIRS = { turmeric:{ 'Sol-ti':1 }, garlic:{ 'Whole Foods Market':1 } };
mtoByCustomer = function(prod){ return _PAIRS[prod] || {}; };
var _MDL = { customers:[ {c:'Whole Foods Market'}, {c:'Sol-ti'}, {c:"Albert's Organics"} ] };

check('garlic nombra a Whole Foods', dsLabelFor('garlic', _MDL), 'Whole Foods Market made to order');
check('turmeric nombra a Sol-ti',    dsLabelFor('turmeric', _MDL), 'Sol-ti made to order');
check('un producto sin direct-ship no inventa un nombre', dsLabelFor('shallots', _MDL), 'made to order');
check('solo devuelve las cuentas del producto pedido', dsNamesFor('garlic', _MDL).join(','), 'Whole Foods Market');

_PAIRS.garlic['Sol-ti'] = 1;
check('con dos cuentas las nombra a las dos', dsLabelFor('garlic', _MDL), 'Whole Foods Market + Sol-ti made to order');
_PAIRS.garlic["Albert's Organics"] = 1;
check('con tres o más, cuenta en vez de enumerar', dsLabelFor('garlic', _MDL), '3 accounts direct-ship');
if(_mtoSave0) mtoByCustomer = _mtoSave0;

// ════ Un solo alcance para toda la app ══════════════════════════════════════
// Había cuatro orígenes independientes con tres centinelas para "sin filtro" ('All','all','') y tres
// productos aparte. Elegir turmeric-Hawaii en Demand dejaba Inventory en 'all': cuatro pantallas
// mirando cosas distintas a la vez.
group('jlzSyncScope · producto y origen compartidos');

PRODUCT_ACTIVE_LS='jlz_active_product'; ORIGIN_ACTIVE_LS='jlz_active_origin';
var _LS={}; localStorage = { setItem:function(k,v){ _LS[k]=v; }, getItem:function(k){ return _LS[k]||null; } };
INVM_PRODUCT='ginger'; BP_PRODUCT='ginger'; SIM_PRODUCT='ginger';
_dmOrigin='All'; INVM_ORIGIN='all'; BP_ORIGIN=''; SIM_ORIGIN='';

jlzSyncScope('turmeric','Hawaii');
check('el producto llega a Inventory', INVM_PRODUCT, 'turmeric');
check('y al Buy Planner',              BP_PRODUCT,   'turmeric');
check('y al Simulator',                SIM_PRODUCT,  'turmeric');
check('el origen llega a Demand',      _dmOrigin,    'Hawaii');
check('y a Inventory',                 INVM_ORIGIN,  'Hawaii');
check('y al Buy Planner',              BP_ORIGIN,    'Hawaii');
check('y al Simulator',                SIM_ORIGIN,   'Hawaii');
check('queda persistido', getActiveOrigin(), 'Hawaii');

// "sin filtro" tiene tres centinelas distintos: cada módulo recibe el suyo
jlzSyncScope(null, 'all');
check('sin filtro · Demand usa All',    _dmOrigin,   'All');
check('sin filtro · Inventory usa all', INVM_ORIGIN, 'all');
check('sin filtro · Buy Planner usa vacío', BP_ORIGIN, '');
check('sin filtro · queda vacío en storage', getActiveOrigin(), '');

// ════ Zona 1 · líneas producto+origen ═══════════════════════════════════════
// Antes eran 4 tarjetas por producto, con run-rate fijo en 13 semanas y CON direct-ship adentro:
// garlic mostraba 41 cs/wk cuando su demanda de stock eran 19. dmLineStats es una COMPOSICIÓN: elige
// las filas, la ventana y de qué store sale el stock. El modelo en sí ya se prueba más arriba, así que
// acá se stubbea para poder afirmar exactamente qué le llega y qué agregado se elige.
group('dmLineStats · qué filas, qué ventana, qué store');

DM_ACCENT={ginger:'#0d5026',garlic:'#b45309',shallots:'#7c3aed',turmeric:'#b42318'};
productLabel=function(p){ return p; };
productCaseLb=function(p){ return p==='shallots'?50:30; };
dmRowOrigin=function(r){ return r.oitem||''; };
var _netSave = (typeof mtoNetRows === 'function') ? mtoNetRows : null;
var _cpwSave = (typeof mtoCasesPerWeek === 'function') ? mtoCasesPerWeek : null;
mtoNetRows=function(rows){ return rows.filter(function(r){ return !(r && r.c==='Whole Foods Market' && r.prod==='garlic'); }); };
invmProductStats=function(p,o){ return {onHandCases:(p==='garlic'?48:0)}; };
bpInvState=function(){ return {rows:{A:{cases:2184}}}; };
nowcastProductModel=function(m){ return m; };   // solo para este grupo: group() la restaura en el siguiente

var _seen=null, _win=3;
dmWindow=function(){ return _win; };
// el modelo devuelve un agregado distinto por ventana, para poder afirmar cuál se eligió
dmBuildModel=function(rows,_a,cl,p){
  _seen={n:rows.length, custs:rows.map(function(r){return r.c;}).filter(function(v,i,a){return a.indexOf(v)===i;})};
  return { runRate3:30*cl, runRate6:60*cl, runRate13:130*cl, runRate26:260*cl,
           weeklyReliable:[{lbs:10*cl},{lbs:10*cl},{lbs:10*cl},{lbs:20*cl},{lbs:20*cl},{lbs:20*cl}] };
};
mtoCasesPerWeek=function(p,w){ return p==='garlic' ? 74 : 0; };

_dmRawAll=[];
for(var _w=0;_w<6;_w++){
  var _d=new Date(Date.UTC(2026,5,1)+_w*7*86400000).toISOString().slice(0,10);
  _dmRawAll.push({d:_d, prod:'garlic', oitem:'California', c:"Albert's Organics",  lbs:20*30, units:20, type:'Sale'});
  _dmRawAll.push({d:_d, prod:'garlic', oitem:'California', c:'Whole Foods Market', lbs:100*30, units:100, type:'Sale'});
  _dmRawAll.push({d:_d, prod:'ginger', oitem:'Peru',       c:"Albert's Organics",  lbs:800*30, units:800, type:'Sale'});
  _dmRawAll.push({d:_d, prod:'ginger', oitem:'Hawaii',     c:"Albert's Organics",  lbs:5*30,  units:5,   type:'Sale'});
}
dmGlobalDataMax=function(){ return '2026-07-20'; };

var _g=dmLineStats('garlic','California');
ok('al modelo solo le llegan las filas de stock — Whole Foods queda fuera',
   _seen.custs.length===1 && _seen.custs[0]==="Albert's Organics");
check('con ventana 3 toma runRate3', Math.round(_g.rr), 30);
check('el pass-through viene de mtoCasesPerWeek (dsWindow), no de la ventana del stock', _g.ds, 74);
check('cobertura = on hand / run-rate de stock', Math.round(_g.cover*10)/10, 1.6);

_win=6;  check('con ventana 6 toma runRate6',  Math.round(dmLineStats('garlic','California').rr), 60);
_win=26; check('con ventana 26 toma runRate26', Math.round(dmLineStats('garlic','California').rr), 260);
if(_mtoSave0) mtoByCustomer = _mtoSave0;
if(_netSave) mtoNetRows = _netSave;
if(_cpwSave) mtoCasesPerWeek = _cpwSave;
_win=3;

var _gp=dmLineStats('ginger','Peru');
check('ginger-Peru saca el stock de su propio store (bpInv)', _gp.onHand, 2184);
ok('las filas de Hawaii no entran en la línea de Peru', _seen.n===6);
var _gh=dmLineStats('ginger','Hawaii');
check('ginger-Hawaii usa el store product-aware', _gh.onHand, 0);
ok('sin direct-ship no hay nota', _gh.ds < 1);
check('los orígenes salen con el de más volumen primero', dmLineOrigins('ginger').join(','), 'Peru,Hawaii');

// ════ Trend & Price ════════════════════════════════════════════════════════
// El origen del PRODUCTO vive en `oitem` ("California"); la columna cruda `origin` es el país del
// EMBARQUE ("USA", "Argentina"). dmFocusRows comparaba contra la segunda, así que en garlic y
// shallots no coincidía ninguna de las 581/571 filas y el gráfico salía vacío. Con las tarjetas
// nuevas seleccionando siempre un origen, esto se rompía en cada uso.
group('dmFocusRows · resuelve el origen como el resto de la app');

productFocus=function(){ return 'garlic'; };
dmRowOrigin=function(r){ return (r.prod==='garlic'||r.prod==='shallots') ? 'California' : (r.oitem||''); };
dmNormalizeOrigin=function(o){ return { origin:o, mixed:(o==='MIXED') }; };
_dmRawAll=[
  {prod:'garlic', origin:'USA',       oitem:'California', lbs:600},
  {prod:'garlic', origin:'Argentina', oitem:'California', lbs:300},
  {prod:'garlic', origin:'MIXED',     oitem:'California', lbs:100},
  {prod:'ginger', origin:'Peru',      oitem:'Peru',       lbs:900}
];
_dmOrigin='California';
check('garlic·California ya no queda vacío', dmFocusRows().length, 2);
ok('la fila de origen mezclado sigue afuera', dmFocusRows().every(function(r){ return r.origin!=='MIXED'; }));
_dmOrigin='All';
check('con All entran las dos de garlic (la mezclada no)', dmFocusRows().length, 2);
_dmOrigin='Fiji';
check('un origen que no es el suyo no devuelve nada', dmFocusRows().length, 0);

// ── el gráfico tenía que decir algo al pasar el mouse ──
group('dmComboSVG · una columna de hover por semana');
cxWeekNo=function(){ return 28; };
var _svg=dmComboSVG([
  {week:'2026-07-06', cases:120, px:2.06, gs:7416, lbs:3600},
  {week:'2026-07-13', cases:90,  px:2.20, gs:5940, lbs:2700},
  {week:'2026-07-20', cases:40,  px:0,    gs:0,    lbs:0, inc:true}
], null);
// El <title> nativo de SVG NO se renderiza (probado con el mouse 3 s encima sin que apareciera nada),
// así que los datos van en atributos y los dibuja un tooltip propio.
ok('ya no usa el <title> nativo, que no se veía', !/<title>/.test(_svg));
check('hay una columna de hover por semana', (_svg.match(/class="dm-hit"/g)||[]).length, 3);
ok('cada columna lleva sus datos', /data-cs="120"/.test(_svg) && /data-px="2\.06"/.test(_svg));
ok('y el bruto de esa semana', /data-gs="7416"/.test(_svg));
ok('marca la semana en curso', /data-inc="1"/.test(_svg));
ok('una semana sin precio queda vacía, no inventa un valor', /data-px=""/.test(_svg));

// ── el año en el eje, solo cuando cambia ──
var _cross=dmComboSVG([
  {week:'2025-12-15', cases:10, px:2, gs:20, lbs:10},
  {week:'2025-12-22', cases:10, px:2, gs:20, lbs:10},
  {week:'2026-01-05', cases:10, px:2, gs:20, lbs:10}
], null);
check('el año aparece una vez por cada año presente', (_cross.match(/>20\d\d</g)||[]).length, 2);
ok('y son los dos años del rango', /">2025</.test(_cross) && /">2026</.test(_cross));
ok('dentro de un solo año no se repite', (_svg.match(/>20\d\d</g)||[]).length === 1);

// ── el año CENTRADO bajo su tramo, no colgado de la semana donde cambió ──
var _xOf=function(svg,yr){ var m=svg.match(new RegExp('<text x="([\\d.]+)"[^>]*>'+yr+'<')); return m?parseFloat(m[1]):null; };
ok('2025 queda a la izquierda de 2026', _xOf(_cross,'2025') < _xOf(_cross,'2026'));
// con un solo año, su etiqueta tiene que caer en el centro del área de datos (L=44, ancho=622)
var _uno=[]; for(var _k=0;_k<12;_k++) _uno.push({week:'2026-0'+((_k%9)+1)+'-01', cases:10, px:2, gs:20, lbs:10});
var _oneYr=dmComboSVG(_uno, null);
var _cxYr=_xOf(_oneYr,'2026'), _mid=44+(720-44-54)/2;
ok('con un solo año la etiqueta va centrada', Math.abs(_cxYr-_mid) < 20);

// ── guard: el tooltip se arma DESPUÉS de pintar el SVG ──
// Al revés, innerHTML borra el <div> del tooltip: el sombreado sigue andando (los listeners viven en
// el contenedor) pero no aparece ningún dato. Es justo el síntoma que reportó Juan.
var _rtp=String(dmRenderTrendPrice);
ok('dmWireChartTip se llama después de asignar innerHTML',
   _rtp.indexOf('dmWireChartTip') > _rtp.indexOf('ch.innerHTML'));
ok('y el handler busca el div por clase, no por closure', /querySelector\('\.dm-tip'\)/.test(String(dmWireChartTip)));

// ════ Trend & Price · una sola ventana ══════════════════════════════════════
// El selector propio de la zona (4/13/26/52) mezclaba la VENTANA (que promedia y alimenta el plan)
// con el SPAN del gráfico (cuánta historia se dibuja). Hacer zoom para mirar estacionalidad cambiaba
// cuántos contenedores comprar.
group('dmComboSVG · sombrea la ventana activa dentro del span fijo');
cxWeekNo=function(){ return 1; };
var _w=[]; for(var _i=0;_i<26;_i++) _w.push({week:'2026-0'+((_i%9)+1)+'-01', cases:100+_i, px:2, gs:200, lbs:100});
var _sv=dmComboSVG(_w, {winFrom:20, winTo:26});
ok('dibuja el sombreado de la ventana', /fill-opacity="0\.05"/.test(_sv));
check('y una columna de hover por cada una de las 26 semanas', (_sv.match(/class="dm-hit"/g)||[]).length, 26);
var _sv2=dmComboSVG(_w, null);
ok('sin ventana indicada no sombrea nada', !/fill-opacity="0\.05"/.test(_sv2));

// ════ Customers ════════════════════════════════════════════════════════════
// La columna "Run-rate" mostraba rrCases (13 semanas) siempre, ignorando la ventana del producto:
// en garlic (ventana 3) Whole Foods salía con 17 cs cuando su ventana real son 74. Y el sparkline
// traza LIBRAS mientras la columna dice cajas, así que el tooltip tiene que convertir.
group('Customers · sparkline en cajas y con tooltip');

cxEsc=function(x){ return String(x); };
cxWeekNo=function(){ return 30; };
var _sp=cxSpark([3600, 7200, 0], ['2026-07-06','2026-07-13','2026-07-20'], 30, 'Albert\'s');
check('una zona de hover por punto', (_sp.match(/class="cx-hit"/g)||[]).length, 3);
ok('convierte libras a cajas: 3.600 lb / 30 = 120', /data-cs="120"/.test(_sp));
ok('y 7.200 lb = 240 cajas', /data-cs="240"/.test(_sp));
ok('lleva el cliente, para saber de quién es la línea', /data-cust="Albert's"/.test(_sp));
ok('una semana sin ventas queda en 0, no se omite', /data-cs="0"/.test(_sp));

// sin las semanas no puede etiquetar: no inventa hover
var _spNo=cxSpark([3600,7200,0], null, 30, 'X');
ok('sin las semanas no dibuja zonas de hover', !/cx-hit/.test(_spNo));

// guards de la lista y del tooltip
var _lst=String(cxRenderList);
ok('la columna Run-rate usa la ventana activa, no rrCases fijo', /_cxRr\(c\)/.test(_lst) && /_cxKey/.test(_lst));
ok('y el encabezado dice qué ventana está mostrando', /_cxWin\+'w<\/span>/.test(_lst));
ok('las cuentas direct-ship quedan marcadas en la lista', /DIRECT-SHIP/.test(_lst));
ok('el tooltip busca su div por clase, no por closure', /querySelector\('\.cx-tip'\)/.test(String(cxWireSparkTip)));

// ════ Customers · qué estoy mirando y qué significa ════════════════════════
// Había que volver a Demand para saber de qué producto eran estos clientes, y "order-driven" /
// "weekly run-rate" no estaban explicados en ningún lado visible.
group('Customers · alcance visible y términos explicados');

var _rc=String(renderCustomers);
ok('muestra el producto que se está mirando', /cx-scope/.test(_rc) && /_cxMeta\.label/.test(_rc));
ok('y el origen, o dice que son todos', /_cxO\?/.test(_rc) && /all origins/.test(_rc));
ok('y con qué ventana está midiendo el run-rate', /_cxW\+'-week window/.test(_rc));

var _oc=String(cxOverrideCard);
ok('explica order-driven con la regla real (35% de las semanas)', /35%/.test(_oc));
ok('dice por qué no se promedia una cuenta grumosa', /smear/.test(_oc));
ok('explica steady y que nunca cuenta dos veces', /exceeds/.test(_oc) && /never both/.test(_oc));
ok('explica que el run-rate es promedio de CALENDARIO', /calendar/.test(_oc) && /counts as zero/.test(_oc));
ok('y que la ventana la manda el producto', /_coWin/.test(_oc));
ok('dice para qué sirve un override manual', /just signed/.test(_oc) && /weekly rate/.test(_oc));

// ════ Una orden despachada no es demanda por delante ═══════════════════════
// El flag `shipped` sacaba la orden del STOCK pero no de la DEMANDA: el plan partía de un inventario
// que ya la excluía y encima se la restaba otra vez como demanda de la semana. Sol-ti, 1.000 cs
// entregadas el 1-sep: la demanda de la semana daba 1.658 en vez de 892 y pedía 4 contenedores.
group('dmWeekPace · la semana comercial son seis días');
// 2026: 31-ago lun · 3-sep jue · 5-sep sáb · 6-sep dom
check('lunes: nada cerrado, toda la semana por delante', dmWeekPace(new Date(2026,7,31)).done, 0);
check('lunes deja 6 días por delante',                   dmWeekPace(new Date(2026,7,31)).ahead, 6);
check('jueves: tres días cerrados',                      dmWeekPace(new Date(2026,8,3)).done, 3);
check('jueves deja media semana',        Math.round(dmWeekPace(new Date(2026,8,3)).aheadPct*100), 50);
check('sábado: solo queda el propio sábado',             dmWeekPace(new Date(2026,8,5)).ahead, 1);
check('domingo: la semana está cerrada',                 dmWeekPace(new Date(2026,8,6)).ahead, 0);
check('el día en curso NUNCA cuenta como cumplido — erra a comprar de más',
      dmWeekPace(new Date(2026,8,3)).done < 4, true);

group('dmWeekPace · por qué SEIS días y no cinco');
// Reparto acumulado real, medido sobre 26 semanas (mar–ago 2026), % facturado al cierre de cada día.
// Shallots queda afuera a propósito: 6 órdenes en 4 semanas no es un perfil, es ruido.
var PERFIL = {
  ginger:   [12, 37, 52, 67, 99, 100],
  turmeric: [26, 43, 67, 86, 99, 100],
  garlic:   [26, 28, 53, 73, 97, 100]
};
// En el día D nuestra regla dice que falta (6-(D-1))/6. Lo real que falta es 100 menos lo acumulado
// hasta el día ANTERIOR. Positivo = decimos que falta más de lo que falta = conservador = seguro.
function peorDesvio(dias){
  var peor = 99;
  Object.keys(PERFIL).forEach(function(p){
    for(var D=1; D<=6; D++){
      var real  = 100 - (D === 1 ? 0 : PERFIL[p][D-2]);
      var ours  = Math.max(0, (dias - (D-1))) / dias * 100;
      peor = Math.min(peor, ours - real);
    }
  });
  return peor;
}
check('con 6 días nunca se pone optimista por más de 7 puntos', peorDesvio(6) >= -7, true);
check('con 5 días (lun-vie) sí — por eso se descartó',          peorDesvio(5) >= -7, false);
check('y la constante del código es 6',                          DM_SELL_DAYS, 6);

group('La semana en curso se abre en TRES estados que suman el total');
// Antes eran dos columnas: invoiced / not invoiced. Pero "not invoiced" mezclaba lo que sigue en la
// cámara con lo que ya salió — y esa es justo la diferencia que decide si hay que comprar. El cuadro
// decía 1.150 mientras el plan usaba 150, sin nada que explicara la resta.
(function(){
  // misma aritmética que histCell
  function celda(tot, booked, shipped){
    var b = booked || 0, sh = Math.min(b, shipped || 0), toShip = Math.max(0, b - sh);
    return { invoiced: Math.max(0, tot - b), shipped: sh, toShip: toShip, total: tot };
  }
  var c = celda(1241, 1150, 1000);            // el caso real de ginger, semana 36
  check('facturado',                 c.invoiced, 91);
  check('despachado sin facturar',   c.shipped, 1000);
  check('todavía por sacar',         c.toShip, 150);
  check('y las tres suman el total', c.invoiced + c.shipped + c.toShip, c.total);
  ok('lo por sacar es lo que el plan tiene que cubrir', c.toShip === 150);

  var d = celda(200, 50, 0);                  // nada despachado: se comporta como antes
  check('sin despachos, "to ship" es todo lo comprometido', d.toShip, 50);
  check('y la columna shipped queda en cero',               d.shipped, 0);
  check('sigue sumando',                                    d.invoiced + d.shipped + d.toShip, d.total);

  var e = celda(100, 30, 999);                // marca inconsistente: no puede exceder lo comprometido
  check('lo despachado nunca supera lo comprometido', e.shipped, 30);
  check('y no deja negativos',                        e.toShip, 0);
  check('el total sigue cerrando',                    e.invoiced + e.shipped + e.toShip, e.total);
})();

group('_sheetSafe · formula injection no llega al Google Sheet');
// Un Excel malicioso con un proveedor "=HYPERLINK(...)" se escribiría como fórmula viva en el Sheet
// compartido y se ejecutaría cuando Juan o Michael lo abren. Se prefija con ' lo que empieza peligroso.
function _sheetSafe(v){ return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? ("'" + v) : v; }
function _sheetSafeRows(rows){ return Array.isArray(rows) ? rows.map(function(r){ return Array.isArray(r) ? r.map(_sheetSafe) : _sheetSafe(r); }) : rows; }
check('una fórmula HYPERLINK queda neutralizada', _sheetSafe('=HYPERLINK("http://evil","x")'), "'=HYPERLINK(\"http://evil\",\"x\")");
check('un + al inicio también', _sheetSafe('+cmd'), "'+cmd");
check('un @ también (Excel DDE)', _sheetSafe('@SUM(A1)'), "'@SUM(A1)");
check('un - al inicio también',  _sheetSafe('-2+3'), "'-2+3");
check('un nombre normal no se toca', _sheetSafe('Añawi'), 'Añawi');
check('un número no se toca (no es string)', _sheetSafe(975), 975);
check('una fecha texto normal pasa', _sheetSafe('2026-09-04'), '2026-09-04');
var r = _sheetSafeRows([['=A1', 'ok', 5], ['normal', '@x', 10]]);
ok('recorre filas y celdas', r[0][0] === "'=A1" && r[1][1] === "'@x" && r[0][1] === 'ok' && r[0][2] === 5);
ok('no revienta con algo que no es array', _sheetSafeRows('x') === 'x');

group('_ordSanitize · XSS almacenado no entra por los campos de orden');
// Un pentest (2026-09-04) confirmó XSS almacenado: un proveedor con <img onerror> ejecutaba en 6
// pantallas y robaba el token del backend de cualquier usuario. Escapar cada render era whack-a-mole;
// la defensa está en la entrada: los campos estructurados nunca son HTML, así que se les quita < > ".
var _ORD_HTML_SAFE = ['supplier','containerNo','contractNo','portOfDischarge','jbjLotNo','jlzPo','incoterm'];
function _ordSanitize(o){
  if(!o || typeof o !== 'object') return o;
  _ORD_HTML_SAFE.forEach(function(k){
    if(typeof o[k] === 'string' && /[<>"]/.test(o[k])) o[k] = o[k].replace(/[<>"]/g, '');
  });
  return o;
}
var _ev = _ordSanitize({ supplier:'<img src=x onerror="steal()">', containerNo:'a"><script>b', jlzPo:'PO<b>1' });
ok('el <img onerror> del proveedor queda inerte', _ev.supplier.indexOf('<') < 0 && _ev.supplier.indexOf('>') < 0);
ok('y el break-out de atributo del contenedor también', _ev.containerNo.indexOf('"') < 0 && _ev.containerNo.indexOf('<') < 0);
ok('el PO tampoco puede llevar etiquetas', _ev.jlzPo.indexOf('<') < 0);
check('un proveedor legítimo con & no se rompe',
      _ordSanitize({ supplier:'Peri & Sons Farms' }).supplier, 'Peri & Sons Farms');
check('un contenedor normal pasa intacto',
      _ordSanitize({ containerNo:'W2881A2637576' }).containerNo, 'W2881A2637576');
ok('no revienta con una orden nula', _ordSanitize(null) === null);
ok('observations NO está en la lista — es texto libre, se escapa en el render',
   _ORD_HTML_SAFE.indexOf('observations') < 0);

group('dmcNormalizeUnshipped · el reporte dice si la orden ya salió');
// El Unshipped Report trae una columna Status (PICKING / SHIPPED) que se estaba ignorando: una orden
// ya despachada entraba como si siguiera en la cámara y había que marcarla a mano. En el archivo del
// 3-sep-2026, 21 de 76 filas decían SHIPPED — entre ellas las 1.000 cajas de Sol-ti.
(function(){
  var FILAS = [
    // cabecera de orden, después sus líneas (así exporta WholesaleWare)
    { 'Order #':'2430854', 'Fulfillment Date':'9/1/2026', 'Customer':'Sol-ti', 'Status':'SHIPPED' },
    { 'SKU':'OG-GIN-30Lbs-PR', 'Total Billable Qty':1000 },
    { 'Order #':'2430900', 'Fulfillment Date':'9/4/2026', 'Customer':"Albert's Organics", 'Status':'PICKING' },
    { 'SKU':'OG-GIN-30Lbs-PR', 'Total Billable Qty':42 },
    { 'SKU':'OG-TUR-5Lbs-PR-FJ', 'Total Billable Qty':12 }
  ];
  var n = dmcNormalizeUnshipped(FILAS);
  check('sale una fila por línea de producto', n.length, 3);
  check('el estado baja desde la cabecera',    n[0].Status, 'SHIPPED');
  check('y el cliente también',                n[0]['Customer Name'], 'Sol-ti');
  check('la orden siguiente lleva SU estado',  n[1].Status, 'PICKING');
  ok('las dos líneas de una misma orden comparten estado', n[1].Status === n[2].Status);
  check('y su cliente',                        n[2]['Customer Name'], "Albert's Organics");

  // si una exportación pusiera el estado en la línea, esa manda
  var n2 = dmcNormalizeUnshipped([
    { 'Order #':'1', 'Fulfillment Date':'9/1/2026', 'Customer':'X', 'Status':'PICKING' },
    { 'SKU':'OG-GIN-30Lbs-PR', 'Total Billable Qty':5, 'Status':'SHIPPED' }
  ]);
  check('el estado de la línea gana sobre el de la cabecera', n2[0].Status, 'SHIPPED');

  // sin columna Status (formatos viejos) no se marca nada
  var n3 = dmcNormalizeUnshipped([
    { 'Order #':'1', 'Fulfillment Date':'9/1/2026', 'Customer':'X' },
    { 'SKU':'OG-GIN-30Lbs-PR', 'Total Billable Qty':5 }
  ]);
  check('sin columna Status no inventa un estado', n3[0].Status, '');
})();

group('cmCasesInBuyPack · una caja de 5 lb no es una caja de 30');
// El committed viene en la caja que se VENDIÓ; el run-rate y el plan trabajan en la que se COMPRA.
// Compararlos directo infla siempre, porque los packs chicos tienen más cajas por libra. Convertir por
// PESO es lo correcto acá: toda la mercadería entra en el pack grande y se reempaca, así que una venta
// de 5 lb consume el granel igual.
productCaseLb = function(p){ return (p === 'shallots') ? 50 : 30; };
ooClassifySku = function(sku){ var m = String(sku||'').match(/(\d+)\s*Lbs?/i);
                               return m ? { packLbs: parseInt(m[1],10) } : null; };

check('una caja de 30 lb es una caja',
      cmCasesInBuyPack({ cases:8, sku:'OG-TUR-30Lbs-PR-FJ' }, 'turmeric'), 8);
check('seis de 5 lb son una de 30',
      cmCasesInBuyPack({ cases:6, sku:'OG-TUR-5Lbs-PR-FJ' }, 'turmeric'), 1);
check('tres de 10 lb son una de 30',
      cmCasesInBuyPack({ cases:3, sku:'OG-TUR-10Lbs-PR-FJ' }, 'turmeric'), 1);
// el caso real: Earl's tenía 21 cajas de 10 lb, que son 7 de 30 — no 21
check('el caso de Earl’s: 21 de 10 lb = 7 de 30',
      cmCasesInBuyPack({ cases:21, sku:'OG-TUR-10Lbs-PR-FJ' }, 'turmeric'), 7);
check('shallots compra en sacos de 50: 20 lb es 0,4',
      Math.round(cmCasesInBuyPack({ cases:1, sku:'OG-SHA-20lbs-LG' }, 'shallots') * 100) / 100, 0.4);
check('sin SKU legible se asume ya en el pack de compra (carga manual)',
      cmCasesInBuyPack({ cases:12 }, 'turmeric'), 12);
check('cero cajas es cero',        cmCasesInBuyPack({ cases:0, sku:'OG-TUR-5Lbs' }, 'turmeric'), 0);
check('una entrada rota no rompe', cmCasesInBuyPack(null, 'turmeric'), 0);

group('hybridSalesForWeek · el committed se compara en la MISMA unidad que el run-rate');
// Sin convertir, Earl's (21 cajas de 10 lb, run-rate 11) parecía estar comprando el doble de lo normal
// y el modelo le sumaba 10 cajas de demanda que no existían.
hybridSalesForWeek = HYBRID_REAL;
_cmShipped = function(c){ return !!(c && c.shipped); };
_cmProd    = function(c){ return c.prod; };
_cmOriginFor = function(){ return ''; };
dmWindow   = function(){ return 3; };

var _mE = { customers:[{ c:"Earl's", rrCases:11, rr3Cases:11 }] };
COMMITTED = [{ type:'inv', wk:'2026-08-31', customer:"Earl's", cases:21,
               prod:'turmeric', sku:'OG-TUR-10Lbs-PR-FJ' }];
check('21 cajas de 10 lb no inflan un run-rate de 11',
      Math.round(hybridSalesForWeek('2026-08-31', 88, _mE, 'turmeric')), 88);
COMMITTED[0].sku = 'OG-TUR-30Lbs-PR-FJ';
ok('pero 21 cajas de 30 lb sí, porque ahí sí superan su promedio',
   Math.round(hybridSalesForWeek('2026-08-31', 88, _mE, 'turmeric')) > 88);

group('cmPlanEntries · el único filtro de las despachadas');
(function(){
  var real = getCommitted;
  getCommitted = function(){ return [
    { orderNo:'A', type:'inv', wk:'2026-08-31', cases:100, customer:'X' },
    { orderNo:'B', type:'inv', wk:'2026-08-31', cases:900, customer:'Y', shipped:true }
  ]; };
  var plan = cmPlanEntries();
  check('saca las despachadas', plan.length, 1);
  check('y deja las pendientes', plan[0].orderNo, 'A');
  check('el store completo sigue intacto para las vistas de volumen', getCommitted().length, 2);
  getCommitted = function(){ return null; };
  check('un store vacío no lo hace explotar', cmPlanEntries().length, 0);
  getCommitted = real;
})();

group('hybridSalesForWeek · las despachadas no vuelven a restar');
hybridSalesForWeek = HYBRID_REAL;
_cmShipped = function(c){ return !!(c && c.shipped); };
_cmProd = function(c){ return c.prod; };
dmWindow = function(){ return 6; };

var _md = { customers:[{c:'Sol-ti', rrCases:233, rr6Cases:233, rr3Cases:233, sporadic:true}] };

COMMITTED = [{type:'inv', wk:'2026-08-31', customer:'Sol-ti', cases:1000, prod:'ginger'}];
check('sin marcar, la orden entra a la demanda de su semana',
      Math.round(hybridSalesForWeek('2026-08-31', 892, _md, 'ginger')), 892 + (1000-233));

COMMITTED[0].shipped = true;
check('marcada como despachada, ya no suma', Math.round(hybridSalesForWeek('2026-08-31', 892, _md, 'ginger')), 892);
ok('y la entrada sigue en el store, para que el build-up la muestre como volumen',
   getCommitted().length === 1 && getCommitted()[0].cases === 1000);

group('mtoDetectCandidates · propone, no marca');
// Encuentra las compras contra orden en el historial para no tener que marcarlas de memoria.
// El filtro que de verdad importa es el de cuentas "a saltos": sin él, la coincidencia exacta dispara
// cada vez que una PO de rutina cae la semana que un cliente habitual compró algo parecido — en
// cúrcuma proponía 17 candidatos cuando solo 5 eran reales.
(function(){
  var HOY = new Date(2026, 8, 4);
  var iso = function(n){ var d = new Date(HOY.getTime() - n*7*86400000); return d.toISOString().slice(0,10); };
  dmWeekKey = function(d){ var x=new Date(d); var g=(x.getDay()+6)%7; x.setDate(x.getDate()-g);
    return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
  productCaseLb = function(){ return 30; };
  dmIsInternalAcct = function(c){ return c === 'Compost'; };
  _ordProd = function(o){ return o.product || 'ginger'; };

  // rutina del producto: POs de 100. Sol-ti compra a saltos; Albert's todas las semanas.
  var ORD = [
    { jlzPo:'RUT1', product:'turmeric', status:'Arrived', arrivalActual:iso(2),  cases:100 },
    { jlzPo:'RUT2', product:'turmeric', status:'Arrived', arrivalActual:iso(4),  cases:100 },
    { jlzPo:'RUT3', product:'turmeric', status:'Arrived', arrivalActual:iso(6),  cases:100 },
    { jlzPo:'BIG',  product:'turmeric', status:'Arrived', arrivalActual:iso(3),  cases:700 },
    { jlzPo:'YA',   product:'turmeric', status:'Arrived', arrivalActual:iso(5),  cases:700,
      directShip:[{customer:'Sol-ti', cases:700}] },
    { jlzPo:'CANC', product:'turmeric', status:'Cancelled', arrivalActual:iso(3), cases:700 }
  ];
  var VENTAS = [];
  // Albert's compra 100 cs TODAS las semanas → habitual, se abastece de stock
  for(var i=0;i<26;i++) VENTAS.push({ prod:'turmeric', c:"Albert's", d:iso(i), lbs:100*30 });
  // Sol-ti compra 700 solo dos veces
  VENTAS.push({ prod:'turmeric', c:'Sol-ti', d:iso(3), lbs:700*30 });
  VENTAS.push({ prod:'turmeric', c:'Sol-ti', d:iso(5), lbs:700*30 });
  getOrders = function(){ return ORD; };
  _dmRawAll = VENTAS;

  var c = mtoDetectCandidates('turmeric', 26);
  check('propone un solo candidato', c.length, 1);
  check('y es la PO grande', c[0].po, 'BIG');
  check('atribuida a la cuenta que compra a saltos', c[0].customer, 'Sol-ti');
  check('con la señal más fuerte', c[0].signal, 'exact+outsized');
  ok('las POs de rutina NO se proponen, aunque calcen con Albert’s',
     c.every(function(x){ return String(x.po).indexOf('RUT') < 0; }));
  ok('la ya marcada no se vuelve a proponer', c.every(function(x){ return x.po !== 'YA'; }));
  ok('la cancelada tampoco',                  c.every(function(x){ return x.po !== 'CANC'; }));
  ok('dice en cuántas semanas compró esa cuenta', c[0].weeksBought === 2 && c[0].ofWeeks === 26);
  check('no marca nada por su cuenta',
        (ORD.filter(function(o){ return Array.isArray(o.directShip) && o.directShip.length; })).length, 1);
})();

group('mtoNetRows · descontar en las FILAS, para que la aritmética de pantalla cierre');
// El panel de Run-rate muestra su propia cuenta: (764 + 99 + 101) ÷ 3 = 321. Si el descuento se aplica
// al final, esa cuenta deja de dar el número de arriba y el panel se contradice solo. Descontando en
// las filas de venta, las barras por semana, la lista de clientes y el titular salen todos del mismo
// modelo ya neto.
(function(){
  var HOY = new Date(2026, 8, 4);
  var W = function(n){ return new Date(HOY.getTime() - n*7*86400000).toISOString().slice(0,10); };
  getOrders = function(){ return [
    { jlzPo:'P', product:'turmeric', status:'Arrived', arrivalActual:W(3),
      directShip:[{ customer:'Sol-ti', cases:700 }] }
  ]; };
  _ordProd = function(o){ return o.product; };
  
  productCaseLb = function(){ return 30; };
  dmWeekKey = function(d){ var x=new Date(d); var g=(x.getDay()+6)%7; x.setDate(x.getDate()-g);
    return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };

  var ROWS = [
    { prod:'turmeric', c:'Sol-ti',   d:W(3), lbs:700*30 },      // la venta contra orden
    { prod:'turmeric', c:'Sol-ti',   d:W(8), lbs:100*30 },      // otra suya, más vieja
    { prod:'turmeric', c:"Albert's", d:W(1), lbs:88*30 },
    { prod:'turmeric', c:"Albert's", d:W(2), lbs:88*30 }
  ];
  _dmRawAll = ROWS;

  var net = mtoNetRows(ROWS, 'turmeric', 26);
  var lbsDe = function(rs, c){ return rs.filter(function(r){ return r.c===c; })
                                        .reduce(function(a,r){ return a+(+r.lbs||0); }, 0); };
  check('a Sol-ti se le descuentan exactamente las 700 marcadas',
        Math.round((lbsDe(ROWS,'Sol-ti') - lbsDe(net,'Sol-ti'))/30), 700);
  check('le queda lo que NO fue contra orden', Math.round(lbsDe(net,'Sol-ti')/30), 100);
  check('los demás clientes no se tocan',      Math.round(lbsDe(net,"Albert's")/30), 176);
  ok('la fila consumida entera desaparece',    net.filter(function(r){ return r.c==='Sol-ti'; }).length === 1);
  ok('sin órdenes marcadas devuelve las filas tal cual',
     mtoNetRows(ROWS, 'garlic', 26).length === ROWS.length);
  // el techo también aplica acá: no puede descontar más de lo vendido
  _dmRawAll = [{ prod:'turmeric', c:'Sol-ti', d:W(3), lbs:200*30 }];
  var chico = mtoNetRows(_dmRawAll, 'turmeric', 26);
  check('nunca deja libras negativas', chico.reduce(function(a,r){ return a+(+r.lbs||0); }, 0), 0);
})();

group('El descuento se resta UNA vez: en la fila y en el total, no en ambos por separado');
// Si el total se calcula con las tasas crudas del modelo y las filas van netas, los dos números miden
// cosas distintas: Sol-ti mostraba 162 cs/wk en su fila mientras el total decía 88, y la diferencia no
// se podía explicar mirando la tabla. Peor: para una cuenta order-driven, hybridSalesForWeek resta su
// run-rate otra vez, así que el total se hundía a cero.
(function(){
  hybridSalesForWeek = HYBRID_REAL;
  _cmShipped = function(c){ return !!(c && c.shipped); };
  _cmProd    = function(c){ return c.prod; };
  _cmOriginFor = function(){ return ''; };
  dmWindow   = function(){ return 3; };
  
  COMMITTED  = [];
  // Con una orden reservada en su horizonte, hybridSalesForWeek entra en la rama order-driven y
  // reemplaza el promedio del cliente por su committed — restando su run-rate. Ahí es donde el modelo
  // crudo resta por segunda vez lo que la base ya tenía descontado.
  COMMITTED = [{ type:'inv', wk:'2026-09-07', customer:'Sol-ti', cases:10, prod:'ginger' }];

  var CRUDO = { customers:[
    { c:'Sol-ti',    rrCases:162, rr3Cases:162, sporadic:true },
    { c:"Albert's",  rrCases:88,  rr3Cases:88 }
  ] };
  var MTO = { 'Sol-ti': 162 };                       // todo lo suyo es contra orden

  // el modelo neteado, igual que lo arma el build-up
  var NETO = { customers: CRUDO.customers.map(function(c){
    if(!(MTO[c.c] > 0)) return c;
    var n = {}; for(var k in c) n[k] = c[k];
    ['rrCases','rr3Cases','rr6Cases','rr26Cases'].forEach(function(k){
      if(n[k] != null) n[k] = Math.max(0, n[k] - MTO[c.c]); });
    return n;
  }) };

  check('la fila de Sol-ti queda en cero: no necesita stock', NETO.customers[0].rr3Cases, 0);
  check('y la del cliente de stock no se toca',               NETO.customers[1].rr3Cases, 88);

  // base ya neta (88) contra el modelo neto → el total es el negocio de stock, no cero
  var conNeto  = Math.round(hybridSalesForWeek('2026-08-31', 88, NETO,  'ginger'));
  var conCrudo = Math.round(hybridSalesForWeek('2026-08-31', 88, CRUDO, 'ginger'));
  check('con el modelo neto, el total es el negocio de stock', conNeto, 88);
  ok('con el modelo crudo se restaría de nuevo y se hundiría', conCrudo < conNeto);
  ok('esa doble resta llevaba el total a cero',                conCrudo === 0);
})();

group('invmStockableWeekly · la demanda que de verdad sale de cámara');
// De acá salen la variabilidad (cv -> safety -> cuánto comprar) y el backtest de ventanas. Tiene que
// ser LIBRE DE VENTANA: el neteo del modelo mira los contenedores llegados dentro de la ventana
// activa, así que la misma semana salía netada o cruda según la ventana elegida. Turmeric: 744 cs
// con ventana 6 y 44 con ventana 13, siendo el mismo hecho. Eso inflaba el cv a 1,748 y hacía pedir
// 175 cajas de un producto cubierto.
(function(){
  var semana = function(n){ var d=new Date(); d.setDate(d.getDate()-n*7); return dmWeekKey(d); };
  var poner = function(rows, orders){
    localStorage.getItem = function(k){ return k==='jlz_demand_raw' ? JSON.stringify(rows) : null; };
    getOrders = function(){ return orders||[]; };
  };
  productCaseLb = function(){ return 30; };
  dmIsInternalAccount = function(c){ return String(c||'').toLowerCase()==='jlz'; };
  invmOriginMatch = function(){ return true; };

  var ROWS = [
    { prod:'turmeric', c:'Acme',   d:semana(3), lbs:50*30, type:'Sale' },
    { prod:'turmeric', c:'Sol-ti', d:semana(2), lbs:700*30, type:'Sale' },   // el bulto contra orden
    { prod:'turmeric', c:'Acme',   d:semana(2), lbs:44*30, type:'Sale' },
    { prod:'turmeric', c:'Acme',   d:semana(1), lbs:60*30, type:'Sale' }
  ];
  var ORD = [{ jlzPo:'C1', product:'turmeric', status:'Arrived', arrivalActual:semana(2),
               directShip:[{customer:'Sol-ti', cases:700}] }];

  var S = invmStockableWeekly('turmeric','all');
  var byWk = {}; S.forEach(function(x){ byWk[x.wk] = x.lbs/30; });
  poner(ROWS, ORD);
  S = invmStockableWeekly('turmeric','all'); byWk = {}; S.forEach(function(x){ byWk[x.wk]=x.lbs/30; });

  check('la semana del bulto queda solo con la venta de cámara', Math.round(byWk[semana(2)]), 44);
  check('las otras semanas no se tocan', Math.round(byWk[semana(3)]), 50);
  check('ni la más reciente', Math.round(byWk[semana(1)]), 60);

  // Sin la marca en la orden, el bulto ensucia la serie — que es el síntoma de no haberla marcado.
  poner(ROWS, []);
  var sinMarca = {}; invmStockableWeekly('turmeric','all').forEach(function(x){ sinMarca[x.wk]=x.lbs/30; });
  check('sin contenedor marcado el bulto entra entero', Math.round(sinMarca[semana(2)]), 744);

  // El tope es por cliente: nunca resta más de lo que ese cliente compró esa semana.
  poner([{ prod:'turmeric', c:'Sol-ti', d:semana(2), lbs:100*30, type:'Sale' }], ORD);
  var tope = invmStockableWeekly('turmeric','all');
  check('no deja libras negativas', tope.length?Math.round(tope[0].lbs):0, 0);

  // ── Una semana SIN ventas también es demanda ─────────────────────────────────────────────────
  // Devolver solo las semanas con filas saltea los ceros y la serie deja de ser calendario: las
  // "últimas 26" abarcaban 54 semanas reales en shallots, y el cv salía la mitad del verdadero —
  // justo el número que dimensiona el safety.
  poner([{ prod:'turmeric', c:'Acme', d:semana(5), lbs:50*30, type:'Sale' },
         { prod:'turmeric', c:'Acme', d:semana(1), lbs:70*30, type:'Sale' }], []);
  var hueco = invmStockableWeekly('turmeric','all');
  check('rellena las semanas sin ventas', hueco.length, 5);
  check('la primera es la más vieja con ventas', Math.round(hueco[0].lbs/30), 50);
  check('las del medio quedan en cero', hueco[1].lbs + hueco[2].lbs + hueco[3].lbs, 0);
  check('y la última es la que tuvo ventas', Math.round(hueco[4].lbs/30), 70);
  ok('las semanas son consecutivas', (function(){
    for (var i = 1; i < hueco.length; i++) {
      var a = new Date(hueco[i-1].wk + 'T12:00:00'), b = new Date(hueco[i].wk + 'T12:00:00');
      if (Math.round((b - a) / 86400000) !== 7) return false;
    }
    return true;
  })());

  // No inventa semanas ANTES de la primera venta: la historia arranca cuando arranca el producto.
  ok('no rellena hacia atrás', hueco[0].wk === semana(5));

  // La semana en curso está incompleta: no puede medir comportamiento.
  poner([{ prod:'turmeric', c:'Acme', d:dmWeekKey(new Date()), lbs:10*30, type:'Sale' },
         { prod:'turmeric', c:'Acme', d:semana(1), lbs:60*30, type:'Sale' }], []);
  var sinHoy = invmStockableWeekly('turmeric','all');
  check('deja afuera la semana en curso', sinHoy.length, 1);

  // Las cuentas internas no son demanda de clientes.
  poner([{ prod:'turmeric', c:'JLZ',  d:semana(1), lbs:99*30, type:'Sale' },
         { prod:'turmeric', c:'Acme', d:semana(1), lbs:60*30, type:'Sale' }], []);
  check('excluye las cuentas internas', Math.round(invmStockableWeekly('turmeric','all')[0].lbs/30), 60);
})();

group('Una sola base: físico contra físico, vendible contra vendible');
// La familia de errores de esta sesión, escrita como regla. Hay DOS unidades en juego y cada cuenta
// tiene que quedarse en una: cajas FÍSICAS (lo que sale de cámara, vendido + merma) o cajas
// VENDIBLES (lo que se factura). Mezclarlas descuenta o infla la merma sin que nada dé error.
(function(){
  var stock = 2983, vendidas = 736, merma = 0.1218;      // ~12% efectiva
  var fisicas = vendidas / (1 - merma);                   // 838 cs/sem que salen de cámara

  // Cobertura: el stock físico se vacía al ritmo físico.
  var buena = stock / fisicas, mala = stock / vendidas;
  check('cobertura correcta (físico ÷ físico)', Math.round(buena*100)/100, 3.56);
  check('la mezcla daba 4,05', Math.round(mala*100)/100, 4.05);
  ok('mezclar sobreestima ~14%', Math.round((mala/buena-1)*100) === 14);

  // Contenedores: la proyección suma el BRUTO, así que la necesidad se divide por el bruto.
  var bruto = 1320, vendible = bruto*(1-merma), necesita = 2549;
  ok('dividir por vendible pide más contenedores', (necesita/vendible) > (necesita/bruto));
  check('1 contenedor en semanas (físico ÷ físico)', Math.round(bruto/fisicas*100)/100, 1.58);
  check('y en vendibles ÷ vendidas da lo mismo', Math.round(vendible/vendidas*100)/100, 1.58);
  ok('pero la mezcla da menos que las dos', (vendible/fisicas) < (bruto/fisicas) && (vendible/fisicas) < (vendible/vendidas));

  // Días en cámara: misma regla, y encima realimenta la merma.
  var dias0 = (stock/vendidas)*7, diasOk = (stock/fisicas)*7;
  ok('los días con base vendible salen más largos', dias0 > diasOk);
  ok('y por eso inflan la merma estimada, que infla la demanda',
     (dias0 - diasOk) > 3);

  // La regla, en una línea: numerador y denominador de la misma unidad.
  var mismaUnidad = function(num, den){ return num.unit === den.unit; };
  ok('físico ÷ físico', mismaUnidad({unit:'fis'},{unit:'fis'}));
  ok('vendible ÷ vendible', mismaUnidad({unit:'ven'},{unit:'ven'}));
  ok('físico ÷ vendible NO', !mismaUnidad({unit:'fis'},{unit:'ven'}));
})();

group('El techo de vida útil manda sobre el order-up-to');
// La regla que faltaba, escrita como aritmética pura para poder fijarla: nunca sugerir más
// contenedores de los que entran antes del muro de la vida útil, y no redondear una fracción chica
// a un contenedor entero. El Buy Planner se contradecía dos líneas abajo — "comprá 3" arriba y
// "solo cabe 1" abajo — y su propia recomendación admitía 8,7 semanas contra un techo de 8.
(function(){
  // Misma aritmética que aplica renderBuyPlanner.
  var decidir = function(netNeeded, perCont, grossPerCont, shelfWks, weeklyDemand, peakStock){
    var cap  = Math.max(0, Math.floor((shelfWks*weeklyDemand - peakStock)/Math.max(1,grossPerCont)));
    var raw  = netNeeded / Math.max(1, perCont);
    var frac = raw - Math.floor(raw);
    var want = Math.max(1, (raw>=1 && frac<=0.25) ? Math.floor(raw) : Math.ceil(raw));
    var cont = Math.max(1, Math.min(want, cap));
    return { cap:cap, raw:raw, want:want, cont:cont,
             cappedBy:(cont<want)?'shelf':((want<Math.ceil(raw))?'round':null) };
  };

  // ── La merma se descuenta UNA vez ────────────────────────────────────────────────────────────
  // La proyección corre en cajas FÍSICAS: suma el bruto de la orden y resta una demanda ya inflada
  // por merma. Dividir esa necesidad por las cajas VENDIBLES del contenedor la descontaba dos veces
  // y sobreestimaba los contenedores ~9%. Un contenedor aporta 1.320 al stock, no 1.214.
  var gross = 1320, net = 1214, necesita = 2549;
  ok('dividir por vendibles pide mas contenedores que dividir por fisicas',
     (necesita/net) > (necesita/gross));
  check('con vendibles daba 2,10', Math.round(necesita/net*100)/100, 2.1);
  check('con fisicas da 1,93',     Math.round(necesita/gross*100)/100, 1.93);

  // El caso real de ginger: 2.549 necesarias, 1.320 fisicas por contenedor, techo 8 semanas.
  var g = decidir(2549, 1320, 1320, 8, 838, 4442);
  ok('sin arreglo habría pedido 3', Math.ceil(2549/1214) === 3);
  check('1,93 redondea para arriba', g.want, 2);
  check('y el techo lo baja a 1', g.cont, 1);
  check('y dice que fue el techo', g.cappedBy, 'shelf');

  // Una fracción grande sí justifica el contenedor extra.
  var h = decidir(2000, 1214, 1320, 8, 838, 0);
  check('1,65 contenedores redondea para arriba', h.want, 2);
  ok('y no lo reporta como recorte', h.cappedBy !== 'round');

  // Una fracción chica redondea para abajo y lo dice.
  var i = decidir(2450, 1214, 1320, 8, 838, 0);
  check('2,02 redondea para abajo', i.want, 2);
  check('y lo declara', i.cappedBy, 'round');

  // Con espacio de sobra el techo no interfiere: manda el redondeo.
  var j = decidir(3700, 1214, 1320, 8, 838, 0);
  check('3,05 contenedores redondea para abajo', j.want, 3);
  check('y el techo (5) no lo toca', j.cont, 3);

  // Una necesidad que cae justo no recorta nada.
  var jj = decidir(3642, 1214, 1320, 8, 838, 0);
  check('3,00 exactos son 3', jj.cont, 3);
  check('sin recorte que reportar', jj.cappedBy, null);

  // Techo tocado: nunca baja de 1, porque la respuesta es saltear un embarque y eso se dice aparte.
  var k = decidir(3000, 1214, 1320, 8, 838, 9000);
  check('con el techo ya pasado el cap es 0', k.cap, 0);
  check('pero no recomienda 0', k.cont, 1);

  // Nunca puede sugerir más de lo que entra bajo el techo.
  [[2549,4442],[3700,3000],[1500,5000]].forEach(function(c){
    var r = decidir(c[0], 1214, 1320, 8, 838, c[1]);
    ok('nunca supera el techo (necesita '+c[0]+', pico '+c[1]+')', r.cap===0 || r.cont<=r.cap);
  });
})();

group('invmRunway · lo que ya tenés viniendo, que es lo que frena una compra de más');
// La pregunta que evita comprar cinco contenedores de golpe no es "cuánto me falta" sino "cuánto ya
// tengo en el agua". El pico de cobertura es el número que decide: si ya pasa la vida útil, lo que
// agregues se liquida — y eso costó $22.457 en ginger.
(function(){
  var HOY = dmWeekKey(new Date());
  var wk = function(n){ var d=new Date(); d.setDate(d.getDate()+n*7); return dmWeekKey(d); };
  PRODUCTS = { ginger:{ label:'Ginger', caseLb:30, shelfWks:8 } };
  invmProductStats = function(){ return { caseLb:30, availCases:1000, weeklyCasesBuy:100 }; };

  // Sin nada en camino: la pista es stock / demanda.
  invmProductArrivals = function(){ return {}; };
  var R = invmRunway('ginger','all',12);
  check('la pista sale del stock y la demanda', Math.round(R.runwayWks), 10);
  check('y arranca donde arranca el stock', R.start, 1000);
  ok('se queda sin stock dentro del horizonte', R.dipWeek !== null);
  ok('sin llegadas el pico es la cobertura de hoy', Math.round(R.peak) === 9);

  // Con contenedores en camino: el pico sube y puede pasar la vida útil.
  invmProductArrivals = function(){ var o={}; o[wk(2)]=1300; o[wk(4)]=1300; o[wk(6)]=1300; return o; };
  var R2 = invmRunway('ginger','all',12);
  check('cuenta lo que ya viene', R2.incoming, 3900);
  check('y lo suma a la pista', Math.round(R2.runwayWks), 49);
  ok('el pico ahora pasa la vida útil', R2.overShelf === true && R2.peak > 8);
  ok('y dice en qué semana pica', !!R2.peakWk);
  ok('ya no se queda sin stock', R2.dipWeek === null);

  // Las semanas de llegada quedan marcadas, que es de dónde viene el pico.
  var conLlegada = R2.rows.filter(function(r){ return r.arrived > 0; });
  check('marca las semanas con llegada', conLlegada.length, 3);

  // ── El Buy Planner estima con historial; el Simulator simula ──────────────────────────────────
  // Cada uno muestra lo que sabe. Sin el flag, la sugerencia vivía DENTRO del Simulator ignorando
  // sus propios datos: había una venta de 700 cs a Sol-ti cargada para la semana 39 y ninguna
  // pantalla de compra la veía. Los hipotéticos se SUMAN a lo que el modelo ya espera.
  invmProductArrivals = function(){ return {}; };
  whatifArrivals = function(){ var o={}; o[wk(3)]=1320; return o; };
  simActiveHypoSales = function(){ return [{ customer:'Sol-ti', wk:wk(2), cases:700 }]; };

  var sinEsc = invmRunway('ginger','all',12);
  check('sin escenarios ignora los hipotéticos', sinEsc.incoming, 0);
  ok('y no los marca', sinEsc.whatif === false);

  var conEsc = invmRunway('ginger','all',12,{whatif:true});
  check('con escenarios suma la llegada hipotética', conEsc.incoming, 1320);
  check('y la reporta aparte', conEsc.hypoIn, 1320);
  check('la venta hipotética también', conEsc.hypoOut, 700);
  ok('la venta hipotética consume stock en SU semana',
     conEsc.rows[2].hypoSale === 700 && conEsc.rows[1].hypoSale === 0);
  ok('y deja menos stock que sin escenarios en esa semana',
     conEsc.rows[2].stock < sinEsc.rows[2].stock);
  ok('la llegada hipotética entra en su semana', conEsc.rows[3].arrived === 1320);

  // Las ventas hipotéticas son del Simulator de ginger: no se cuelan en otro producto.
  invmProductStats = function(){ return { caseLb:30, availCases:1000, weeklyCasesBuy:100 }; };
  var otro = invmRunway('turmeric','all',12,{whatif:true});
  check('no aplica las ventas hipotéticas de ginger a otro producto', otro.hypoOut, 0);

  whatifArrivals = function(){ return {}; };
  simActiveHypoSales = function(){ return []; };

  // Sin demanda no hay pista que calcular.
  invmProductStats = function(){ return { caseLb:30, availCases:1000, weeklyCasesBuy:0 }; };
  check('sin demanda no proyecta', invmRunway('ginger','all',12), null);
})();

group('invmLumpyConcentration · una cuenta grande que compra a saltos');
// Sol-ti es ~30% del ginger y compra cada dos semanas. Un promedio semanal la describe mal: la mitad
// de las semanas aporta 0. Su hueco de ocho semanas (8-jun a 27-jul) arrastró el trimestre como si
// el mercado se hubiera caído, y volvió en agosto con el mismo ritmo.
(function(){
  var wkAtras = function(n){ var d=new Date(); d.setDate(d.getDate()-n*7); return dmWeekKey(d); };
  var ROWS = [];
  for (var i = 26; i >= 1; i--) {
    ROWS.push({ prod:'ginger', c:'Chicos', d:wkAtras(i), lbs:300*30, type:'Sale' });   // todas las semanas
    if (i % 2 === 0) ROWS.push({ prod:'ginger', c:'Sol-ti', d:wkAtras(i), lbs:700*30, type:'Sale' });
  }
  localStorage.getItem = function(k){ return k==='jlz_demand_raw' ? JSON.stringify(ROWS) : null; };
  getOrders = function(){ return []; };
  productCaseLb = function(){ return 30; };
  dmIsInternalAccount = function(){ return false; };
  invmOriginMatch = function(){ return true; };

  var L = invmLumpyConcentration('ginger','all',26);
  ok('encuentra la cuenta a saltos', !!L);
  check('y es la correcta', L.customer, 'Sol-ti');
  ok('con su peso real', Math.round(L.share*100) === 54);
  ok('dice cada cuánto compra', Math.round(L.everyWks) === 2);
  ok('y de a cuánto', Math.round(L.avgLot) === 700);

  // Un cliente que compra todas las semanas NO es a saltos, por grande que sea.
  ROWS.length = 0;
  for (var j = 26; j >= 1; j--) ROWS.push({ prod:'ginger', c:'Grande', d:wkAtras(j), lbs:900*30, type:'Sale' });
  check('comprar siempre no es comprar a saltos', invmLumpyConcentration('ginger','all',26), null);

  // Una cuenta chica a saltos no distorsiona nada: se ignora.
  ROWS.length = 0;
  for (var q = 26; q >= 1; q--) {
    ROWS.push({ prod:'ginger', c:'Chicos', d:wkAtras(q), lbs:900*30, type:'Sale' });
    if (q % 4 === 0) ROWS.push({ prod:'ginger', c:'Mini', d:wkAtras(q), lbs:50*30, type:'Sale' });
  }
  check('una cuenta chica no se reporta', invmLumpyConcentration('ginger','all',26), null);
})();

group('invmDemandTrend · hacia dónde va la demanda, y qué costó no verlo');
// A propósito NO rankea ventanas por costo: ese ranking se da vuelta con el régimen (en caída ganan
// las cortas, en subida las largas), así que en pantalla se leería como regla y engañaría en cuanto
// la tendencia cambie. La tendencia sí es estable, y es la que explica el problema: mientras la
// demanda baje, CUALQUIER promedio hacia atrás pide de más. Ginger cayó 42% y se liquidó el 18%
// del volumen por $22.457.
(function(){
  var lunes = function(n){ var d=new Date(); d.setDate(d.getDate()-n*7); return dmWeekKey(d); };
  var serie = function(vals){                   // vals[0] = la semana más vieja
    return vals.map(function(cs,i){
      return { prod:'ginger', c:'Acme', d:lunes(vals.length-i), lbs:cs*30, type:'Sale' }; });
  };
  var poner = function(vals){
    localStorage.getItem = function(k){ return k==='jlz_demand_raw' ? JSON.stringify(serie(vals)) : null; };
    getOrders = function(){ return []; };
  };
  productCaseLb = function(){ return 30; };
  dmIsInternalAccount = function(){ return false; };
  invmOriginMatch = function(){ return true; };
  dmClearanceScan = function(){ return { liqWeeks:4, casesDumped:7687, liqLoss:-22457, cleanRunRate:810 }; };

  // Caída sostenida: el caso ginger.
  var baja = []; for(var i=0;i<26;i++) baja.push(1540);
  for(var j=0;j<26;j++) baja.push(896);
  poner(baja);
  var T = invmDemandTrend('ginger','all');
  ok('detecta la caída', T && T.dir === 'down');
  ok('y la declara material', T.material === true);
  check('con los dos niveles', Math.round(T.first), 1540);
  check('y el más reciente', Math.round(T.second), 896);
  ok('el porcentaje es el que se ve en pantalla', Math.round(T.pct) === -42);
  ok('parte el año en cuatro para mostrar la forma', T.quarters.length === 4);
  ok('trae el costo realizado de liquidar', T.clearance && T.clearance.cases === 7687);
  ok('y qué parte del volumen fue', Math.round(T.clearance.pctVol) === 18);

  // Subida: el mismo criterio al revés.
  var sube = []; for(var k=0;k<26;k++) sube.push(500);
  for(var l=0;l<26;l++) sube.push(900);
  poner(sube);
  var T2 = invmDemandTrend('ginger','all');
  ok('detecta la subida', T2.dir === 'up' && T2.material === true);

  // Un movimiento chico no es señal: se calla.
  var plano = []; for(var m=0;m<26;m++) plano.push(500);
  for(var q=0;q<26;q++) plano.push(545);            // +9%
  poner(plano);
  var T3 = invmDemandTrend('ginger','all');
  ok('un 9% no lo declara tendencia', T3 && T3.material === false && T3.dir === 'flat');

  // ── La estacionalidad no puede leerse como tendencia ─────────────────────────────────────────
  // Partir el año al medio es una trampa: un producto que vende más en invierno mostraría una caída
  // todos los años sin que nada haya cambiado. Con dos años de historia se compara contra las MISMAS
  // semanas del año pasado, que es lo que de verdad aísla el cambio.
  var estacional = [];
  for(var y=0; y<2; y++){                        // dos años idénticos: alto medio año, bajo el otro
    for(var w1=0; w1<26; w1++) estacional.push(1000);
    for(var w2=0; w2<26; w2++) estacional.push(400);
  }
  poner(estacional);
  var TS = invmDemandTrend('ginger','all');
  check('compara contra el año pasado cuando puede', TS.basis, 'yoy');
  ok('y no confunde la estación con una caída', TS.material === false);

  // Una caída real sí se ve, aun con el mismo patrón estacional debajo.
  var realCaida = [];
  for(var a1=0; a1<26; a1++) realCaida.push(1000);
  for(var a2=0; a2<26; a2++) realCaida.push(400);
  for(var b1=0; b1<26; b1++) realCaida.push(500);
  for(var b2=0; b2<26; b2++) realCaida.push(200);
  poner(realCaida);
  var TR = invmDemandTrend('ginger','all');
  check('una caída real sigue saliendo', TR.dir, 'down');
  ok('medida contra el año pasado, no contra el semestre', TR.basis === 'yoy' && Math.round(TR.yoy.pct) === -50);

  // Sin historia no opina.
  poner([100,100,100,100]);
  check('con poca historia no dice nada', invmDemandTrend('ginger','all'), null);
})();

group('invmWindowFit · qué ventana viene explicando mejor la venta');
// No es opinión: backtest. Cada ventana predice semana a semana y gana el menor error. Lo que hace
// válido el test es que la serie sea LIBRE DE VENTANA — si se puntea contra la serie que el modelo
// netea usando la ventana ACTIVA, la verdad cambia según la ventana evaluada y el test se muerde
// la cola. Acá cada semana se netea por el contenedor que llegó ESA semana.
(function(){
  var DIA = 86400000;
  var lunes = function(n){                       // el lunes de hace n semanas
    var d = new Date(); d.setDate(d.getDate() - n*7);
    return dmWeekKey(d);
  };
  var filas = function(serie, cust){             // serie[0] = la semana más vieja
    var out = [];
    serie.forEach(function(cs, i){
      var n = serie.length - i;                  // semanas hacia atrás
      out.push({ prod:'garlic', c:cust||'Acme', d:lunes(n), lbs:cs*30, type:'Sale' });
    });
    return out;
  };
  var poner = function(rows, orders){
    localStorage.getItem = function(k){ return k==='jlz_demand_raw' ? JSON.stringify(rows) : null; };
    getOrders = function(){ return orders||[]; };
  };
  productCaseLb = function(){ return 30; };
  dmIsInternalAccount = function(){ return false; };
  invmOriginMatch = function(){ return true; };

  // ── Un escalón reciente: la ventana corta lo sigue, la larga se queda atrás ──
  var plano = []; for(var i=0;i<40;i++) plano.push(100);
  var salto = plano.concat([300,300,300,300,300,300,300,300]);
  poner(filas(salto));
  var f = invmWindowFit('garlic','all');
  ok('devuelve un resultado', !!f);
  check('con un escalón reciente gana la ventana más corta', f.best, 3);
  ok('y lo declara claro', f.clear === true);
  ok('reporta el error como % de la venta típica', f.pct != null);
  // El puntaje dice CUÁL; esto dice POR QUÉ, que es lo que se puede discutir.
  ok('explica que la venta subió de escalón', f.why && f.why.kind === 'up');
  ok('y lo respalda con los dos niveles', f.why.recent > f.why.prior);

  // Un escalón hacia abajo se explica al revés.
  var caida = []; for(var c=0;c<40;c++) caida.push(300);
  poner(filas(caida.concat([100,100,100,100,100,100,100,100])));
  var fd = invmWindowFit('garlic','all');
  ok('y una caída también, con el mismo criterio', fd.why && fd.why.kind === 'down' && fd.why.recent < fd.why.prior);

  // ── Serie estable: la ventana larga promedia mejor el ruido ──
  var estable = []; for(var j=0;j<48;j++) estable.push(100 + ((j%2)?6:-6));
  poner(filas(estable));
  var f2 = invmWindowFit('garlic','all');
  ok('en una serie estable no elige la más corta', f2.best !== 3);
  ok('y el error es chico contra la venta', f2.pct < 20);
  ok('y la razón es que promedia el ruido, no que siga un cambio',
     !f2.why || f2.why.kind === 'steady');

  // ── Demasiado errático: ninguna ventana explica nada, y hay que admitirlo ──
  var loco = []; for(var k=0;k<48;k++) loco.push(k%3===0 ? 400 : 5);
  poner(filas(loco));
  var f3 = invmWindowFit('garlic','all');
  ok('marca la serie como demasiado errática', f3.noisy === true);
  ok('porque el error supera el 60% de la venta', f3.pct > 60);

  // ── La serie es libre de ventana: el contra-orden se netea en SU semana de llegada ──
  var conSolti = []; for(var q=0;q<44;q++) conSolti.push(100);
  var rows = filas(conSolti);
  rows.push({ prod:'garlic', c:'Sol-ti', d:lunes(2), lbs:700*30, type:'Sale' });   // bulto contra orden
  poner(rows, [{ jlzPo:'X', product:'garlic', status:'Arrived', arrivalActual:lunes(2),
                 directShip:[{customer:'Sol-ti', cases:700}] }]);
  var conNeteo = invmWindowFit('garlic','all');
  poner(rows, []);                                                                // el mismo bulto, sin marcar
  var sinNeteo = invmWindowFit('garlic','all');
  ok('el bulto contra-orden marcado no ensucia el ajuste',
     conNeteo.pct < sinNeteo.pct);
  ok('y sin marcar sí lo ensucia, que es el sintoma de no haberla marcado',
     sinNeteo.pct > 20);

  // ── Historia corta: no se inventa un veredicto ──
  poner(filas([100,100,100,100]));
  check('con poca historia no opina', invmWindowFit('garlic','all'), null);
})();

group('invmBuySuggestion · cuánto comprar, cuándo ordenar, cuándo llega');
// Tres respuestas y nada más. Lo que la hace correcta o no es de dónde saca los insumos: disponible
// NETO de committed y de excluidos, lo que ya viene en camino, y el lead time del proveedor de ESE
// origen — no el del producto en general (turmeric tiene Fiji a 10d y Kailani a 14d).
(function(){
  var DIA = 86400000;
  var hoy = new Date();
  var iso = function(n){ return dmISOLocal(new Date(hoy.getTime() + n*DIA)); };

  PRODUCTS = { turmeric:{ label:'Turmeric', caseLb:30, shrinkPct:0, suppliers:[
    { name:'Sbimal LLC', origin:'Fiji',   mode:'air', leadDays:10 },
    { name:'Kailani',    origin:'Hawaii', mode:'air', leadDays:14 } ] } };

  // `incomingCases` viene de invmProductStats: la sugerencia ya no llama a invmProductArrivals por
  // su cuenta (con el origen crudo daba un "en camino" distinto al del panel, para la misma tarjeta).
  var STATS = { p:'turmeric', label:'Turmeric', caseLb:30, shrinkPct:0, origin:'Fiji',
                availCases:200, incomingCases:100, excludedCases:23, leadWks:10/7, safetyWks:2, targetWks:10/7+2, win:3 };
  invmProductStats  = function(){ return STATS; };
  invmProductModel  = function(){ return { caseLb:30, runRate3:100*30, runRate6:50*30, runRate13:200*30, runRate26:null }; };
  invmProductArrivals = function(){ return { 'w1':100 }; };

  var g = invmBuySuggestion('turmeric','Fiji');
  ok('devuelve algo', !!g);
  check('usa el lead time del proveedor de ESE origen, no el más lento', g.leadDays, 10);
  check('y lo nombra, que es la justificación', g.supplier, 'Sbimal LLC');
  // oferta 200 disponibles + 100 en camino = 300 · demanda 100/sem -> 3 semanas de cobertura
  check('cobertura = (disponible + en camino) / demanda', Math.round(g.cover*10)/10, 3);
  check('comprar = lo que falta para el target', g.buy, Math.ceil((10/7+2)*100 - 300));
  // corrida = 3 - 2 de seguridad = 1 semana = 7 días; menos 10 de lead -> 3 días TARDE
  check('la fecha límite descuenta el lead time', g.offset, -3);
  check('y queda expresada como fecha', g.orderBy, iso(-3));
  check('la llegada es hoy + lead time', g.arrives, iso(10));
  check('reporta los excluidos aparte, no los suma al disponible', g.excluded, 23);

  // El rango entre ventanas es el punto: la misma pregunta, distinta respuesta.
  var w = {}; g.others.forEach(function(o){ w[o.win] = o; });
  ok('muestra las otras ventanas', !!w[6] && !!w[13]);
  ok('con ventas más flojas (6wk) la fecha se corre para adelante', w[6].orderBy > g.orderBy);
  ok('con ventas más fuertes (13wk) se adelanta', w[13].orderBy < g.orderBy);
  ok('y no ofrece una ventana sin datos', !w[26]);

  // Cubierto: nada que ordenar.
  STATS.availCases = 5000;
  check('con stock de sobra no manda comprar nada', invmBuySuggestion('turmeric','Fiji').buy, 0);
  STATS.availCases = 200;

  // ── El sustento tiene que CERRAR con la decisión ─────────────────────────────────────────────
  // La pantalla muestra la cuenta paso a paso. Si esos pasos no reconstruyen el número de cajas,
  // el desglose es decorativo y peor que no tenerlo: da confianza sin respaldarla.
  var gs = invmBuySuggestion('turmeric','Fiji'), S = gs.steps;
  ok('expone cada eslabón de la cuenta', !!S);
  check('lo vendido por semana sale del run-rate y el peso de caja', Math.round(S.rrCases*100)/100, Math.round(S.rrLbs/30*100)/100);
  check('lo que sale de cámara es lo vendido más la merma', Math.round(S.rrCases*S.infl*1000)/1000, Math.round(gs.demand*1000)/1000);
  check('la oferta es lo libre más lo que ya viene', S.supply, gs.avail + gs.incoming);
  check('el objetivo es lead más seguridad', Math.round(S.targetWks*1000)/1000, Math.round((S.leadWks+S.safetyWks)*1000)/1000);
  check('lo necesario es objetivo por demanda', Math.round(S.needed*100)/100, Math.round(S.targetWks*gs.demand*100)/100);
  check('y la compra es exactamente lo que falta', gs.buy, Math.max(0, Math.ceil(S.needed - S.supply)));

  // El mismo cierre cuando la respuesta es NO comprar: el desglose tiene que mostrar el sobrante.
  STATS.availCases = 5000;
  var gc = invmBuySuggestion('turmeric','Fiji');
  check('con stock de sobra la compra es 0', gc.buy, 0);
  ok('y el desglose muestra que sobra, no que falta', gc.steps.supply > gc.steps.needed);
  STATS.availCases = 200;

  // Sin demanda no hay sugerencia que dar.
  invmProductModel = function(){ return { caseLb:30, runRate3:0, runRate6:0, runRate13:0, runRate26:0 }; };
  check('sin demanda no inventa una recomendación', invmBuySuggestion('turmeric','Fiji'), null);
})();

group('El numero de compra es UNO solo · el panel y la sugerencia no pueden discrepar');
// Auditoria de los numeros de compra. Habia dos caminos hasta "cuantas cajas comprar" —el KPI
// "Suggested order" del panel de Inventory (s.orderCases) y la tarjeta "Buy N cases" del Simulator
// (invmBuySuggestion)— y no coincidian: uno ignoraba lo que ya venia navegando, y leian el run-rate
// por vias distintas. Aca corre invmProductStats DE VERDAD; lo unico stubbeado son los datos de
// entrada, que es lo que en produccion sale del store y del modelo.
(function(){
  var STORE = { turmeric:{ serviceLevel:95, demandOverride:null, shrinkPct:0, lots:[
      { lot:'A', origin:'Fiji', supplier:'Sbimal LLC', cases:200, avgCost:70, received:'2026-08-20', sku:'OG-TUR-30LBS-PR-FJ' } ] } };
  PRODUCTS = { turmeric:{ label:'Turmeric', caseLb:30, shrinkPct:0, suppliers:[
      { name:'Sbimal LLC', origin:'Fiji', mode:'air', leadDays:10 } ] } };
  prodInvFor          = function(p){ return STORE[p]; };
  dmWindow            = function(){ return 3; };
  prodCommittedTotal  = function(){ return 40; };
  mtoCasesPerWeek     = function(){ return 0; };
  dsWindow            = function(){ return 26; };
  stockSnapRecord     = function(){};
  invmProductArrivals = function(){ return { 'w1':100 }; };
  // Serie pareja: desviacion 0 -> cv 0 -> safety 0 -> target = lead. Deja la cuenta a la vista.
  invmStockableWeekly = function(){ return [{wk:'a',lbs:9000},{wk:'b',lbs:9000},{wk:'c',lbs:9000}]; };
  // runRateN a proposito MUY distinto del promedio de weeklyReliable: es la unica forma de ver si
  // alguien vuelve a leer la serie cruda, que no lleva el delta de los clientes pineados a mano.
  invmProductModel    = function(){ return { caseLb:30, runRate3:300*30, runRate6:200*30,
      runRate13:100*30, runRate26:100*30, weeklyReliable:[{lbs:30},{lbs:30},{lbs:30}] }; };

  var s = invmProductStats('turmeric','Fiji');
  check('disponible = fisico menos committed', s.availCases, 160);
  check('y lo que ya viene navegando se cuenta aparte', s.incomingCases, 100);
  check('posicion = libre + en camino', s.posCases, 260);
  check('el run-rate es el de la ventana activa, con los pins puestos', s.weeklyLbs, 300*30);
  check('sin merma, lo que sale de camara es lo vendido', s.weeklyCasesBuy, 300);
  check('serie pareja -> sin variabilidad -> sin colchon', Math.round(s.safetyWks*1000)/1000, 0);
  check('objetivo = lead time', Math.round(s.targetWks*10000)/10000, Math.round(10/7*10000)/10000);

  // ── Lo que se compra se descuenta de lo que ya se compro ──────────────────────────────────────
  var esperado = Math.ceil(((10/7)*9000 - 260*30)/30);
  check('la orden sugerida netea lo que ya viene', s.orderCases, esperado);
  invmProductArrivals = function(){ return {}; };
  var sin = invmProductStats('turmeric','Fiji');
  check('sin nada en camino hay que comprar exactamente 100 cajas mas', sin.orderCases - s.orderCases, 100);
  invmProductArrivals = function(){ return { 'w1':100 }; };

  // ── Y el otro camino tiene que dar el MISMO numero ────────────────────────────────────────────
  var g = invmBuySuggestion('turmeric','Fiji');
  check('la sugerencia compra lo mismo que el panel', g.buy, s.orderCases);
  check('y sobre la misma demanda semanal', Math.round(g.demand*1000)/1000, Math.round(s.weeklyCasesBuy*1000)/1000);
  check('sobre la misma oferta', g.avail + g.incoming, s.posCases);
  check('y el mismo objetivo', Math.round(g.targetWks*10000)/10000, Math.round(s.targetWks*10000)/10000);

  // ── El numero escrito a mano manda, y manda en los dos lados ──────────────────────────────────
  // Antes el panel decia "manual" y la tarjeta de compra seguia calculando con el historial crudo.
  STORE.turmeric.demandOverride = 50;
  var so = invmProductStats('turmeric','Fiji');
  var go = invmBuySuggestion('turmeric','Fiji');
  check('el panel toma el numero escrito a mano', so.weeklyCasesBuy, 50);
  check('la sugerencia tambien', Math.round(go.demand*1000)/1000, 50);
  check('y siguen dando la misma compra', go.buy, so.orderCases);
  // Un numero escrito a mano no depende de la ventana: las cuatro lecturas dicen lo mismo.
  var distintas = go.others.filter(function(o){ return o.buy !== go.buy; });
  check('escrito a mano, las cuatro ventanas coinciden', distintas.length, 0);
  STORE.turmeric.demandOverride = null;

  // ── El semaforo mira la posicion, no la camara ────────────────────────────────────────────────
  // Con un contenedor entrando esta semana, "Urgent" es falso aunque la camara este corta.
  STORE.turmeric.lots[0].cases = 60;                 // 60 - 40 committed = 20 libres, 0.07 wk
  var flojo = invmProductStats('turmeric','Fiji');
  check('la cobertura de camara sigue siendo la de camara', Math.round(flojo.coverWks*100)/100, Math.round(20/300*100)/100);
  check('pero la posicion cuenta lo que llega', Math.round(flojo.coverPosWks*100)/100, Math.round(120/300*100)/100);
  STORE.turmeric.lots[0].cases = 200;
})();

group('En camino · el origen filtra, pero no puede hacer desaparecer carga');
// El bucket de origenes salia SOLO del inventario. ginger-Peru no vive en ese store, asi que sus
// 6.540 cajas en camino no encontraban bucket y se contaban como HAWAII: 737 semanas de cobertura
// sobre 2 cajas de stock, y fecha limite en 2040. Los proveedores si dicen de donde viene cada
// producto. Lo que NO puede pasar es el error opuesto: que una orden con un origen que nadie
// registro se caiga en silencio.
(function(){
  PRODUCTS = {
    ginger:   { suppliers:[ {name:'Anawi', origin:'Peru', leadDays:32}, {name:'Crown Pacific', origin:'Hawaii', leadDays:10} ] },
    shallots: { suppliers:[ {name:'Peri & Sons', origin:'AZ / CA', leadDays:7} ] }
  };
  invmOriginsFor = function(p){ return p==='ginger' ? ['Hawaii'] : ['California']; };   // lo que hay HOY con lote

  check('un origen con lote es conocido',            _invmKnownOrigin('ginger','Hawaii'), true);
  check('un origen que solo esta en el proveedor tambien', _invmKnownOrigin('ginger','Peru'), true);
  check('el de otro producto no cuenta',             _invmKnownOrigin('shallots','Peru'), false);
  check('y uno que nadie registro sigue sin serlo',  _invmKnownOrigin('shallots','Nevada'), false);
  check('sin origen no se decide nada',              _invmKnownOrigin('ginger',''), false);

  _ordProd  = function(o){ return o.product; };
  _ordOrigin= function(o){ return o.origin; };
  directShipTotal = function(){ return 0; };
  getOrders = function(){ return [
    { product:'ginger',   origin:'Peru',    status:'In Transit', cases:1320, jlzPo:'P1', arrivalEstimated:'2026-09-20' },
    { product:'ginger',   origin:'Hawaii',  status:'In Transit', cases:40,   jlzPo:'P2', arrivalEstimated:'2026-09-20' },
    { product:'shallots', origin:'Nevada',  status:'In Transit', cases:100,  jlzPo:'P3', arrivalEstimated:'2026-09-15' }
  ]; };
  var sum=function(o){ return Object.keys(o||{}).reduce(function(t,k){ return t+(o[k]||0); },0); };

  check('Peru ya no se cuenta como Hawaii', sum(invmProductArrivals('ginger','Hawaii')), 40);
  check('y sigue siendo de Peru cuando se pregunta por Peru', sum(invmProductArrivals('ginger','Peru')), 1320);
  check('un origen que no es de nadie NO desaparece', sum(invmProductArrivals('shallots','California')), 100);
  check('sin filtro de origen entra todo', sum(invmProductArrivals('ginger','all')), 1360);
})();

group('mtoMismatched · la marca contra-orden tiene que calzar con lo que pidió el cliente');
// Criterio de Juan: una compra es contra orden si lo que le pediste al proveedor calza con lo que
// pidió el cliente. Si no calza, compraste stock con un pedido a la vista — legítimo, pero entonces
// esa venta es demanda de tu cámara y no puede salir del run-rate. Sin este chequeo la marca es una
// opinión que saca volumen del plan sin que nadie pueda comprobarla.
(function(){
  var W = function(n){ var d=new Date(); d.setDate(d.getDate()-n*7); return dmWeekKey(d); };
  var VENTAS = [];
  var vender = function(cust, prod, wk, cs){ VENTAS.push({ prod:prod, c:cust, d:wk, lbs:cs*30, type:'Sale' }); };
  var poner = function(orders){
    localStorage.getItem = function(k){ return k==='jlz_demand_raw' ? JSON.stringify(VENTAS) : null; };
    getOrders = function(){ return orders; };
  };
  productCaseLb = function(){ return 30; };

  // Calza exacto: contra orden de manual (el caso Sol-ti).
  VENTAS.length = 0; vender('Sol-ti','turmeric',W(2),700);
  poner([{ jlzPo:'CALZA', product:'turmeric', status:'Arrived', arrivalActual:W(2),
           directShip:[{customer:'Sol-ti', cases:700}] }]);
  check('si calza no dice nada', mtoMismatched().length, 0);

  // Compró de más: quedó stock (el caso shallots — 100 compradas, 10 llevadas).
  VENTAS.length = 0; vender('Whole Foods Market','shallots',W(2),10);
  poner([{ jlzPo:'SOBRO', product:'shallots', status:'Arrived', arrivalActual:W(2),
           directShip:[{customer:'Whole Foods Market', cases:100}] }]);
  var m1 = mtoMismatched();
  check('marca la que no calza', m1.length, 1);
  check('y dice cuánto se compró', m1[0].marked, 100);
  check('cuánto se llevó', m1[0].took, 10);
  check('y la diferencia con signo', m1[0].diff, -90);

  // El cliente se llevó MÁS que la orden: también estaba comiendo stock (el caso garlic).
  VENTAS.length = 0; vender('Whole Foods Market','garlic',W(2),172);
  poner([{ jlzPo:'FALTO', product:'garlic', status:'Arrived', arrivalActual:W(2),
           directShip:[{customer:'Whole Foods Market', cases:134}] }]);
  check('también marca cuando el cliente se llevó de más', mtoMismatched()[0].diff, 38);

  // No se llevó nada esa semana.
  VENTAS.length = 0;
  poner([{ jlzPo:'NADA', product:'garlic', status:'Arrived', arrivalActual:W(2),
           directShip:[{customer:'Whole Foods Market', cases:140}] }]);
  check('y cuando no se llevó nada', mtoMismatched()[0].diff, -140);

  // El cliente puede facturar la semana siguiente a la llegada.
  VENTAS.length = 0; vender('Sol-ti','turmeric',W(1),700);
  poner([{ jlzPo:'TARDE', product:'turmeric', status:'Arrived', arrivalActual:W(2),
           directShip:[{customer:'Sol-ti', cases:700}] }]);
  check('acepta que facture la semana siguiente', mtoMismatched().length, 0);

  // Tolerancia: una caja de diferencia no es un problema.
  VENTAS.length = 0; vender('Sol-ti','turmeric',W(2),699);
  poner([{ jlzPo:'CASI', product:'turmeric', status:'Arrived', arrivalActual:W(2),
           directShip:[{customer:'Sol-ti', cases:700}] }]);
  check('no se queja por una caja', mtoMismatched().length, 0);

  // Sin llegada real todavía no hay nada que comparar.
  VENTAS.length = 0;
  poner([{ jlzPo:'ENCAMINO', product:'turmeric', status:'In Transit',
           directShip:[{customer:'Sol-ti', cases:700}] }]);
  check('una orden en tránsito no se juzga todavía', mtoMismatched().length, 0);
})();

group('mtoStaleShipments · el aviso del descuento que no se está aplicando');
// El descuento contra-orden pide fecha REAL de llegada. El reverso es silencioso: mercadería que ya
// salió al cliente con la orden todavía "en camino" cuenta como demanda de cámara y el plan compra
// de más. El pipeline no avanza solo, así que este caso es el DEFAULT si nadie marca la orden.
(function(){
  var HOY = dmISOLocal(new Date());
  var d = function(n){ var x = new Date(); x.setDate(x.getDate() + n); return dmISOLocal(x); };
  var BASE = [
    { jlzPo:'VENCIDA', product:'turmeric', status:'In Transit', arrivalEstimated:d(-3),
      directShip:[{customer:'Sol-ti', cases:700}] },
    { jlzPo:'FUTURA',  product:'turmeric', status:'In Transit', arrivalEstimated:d(+7),
      directShip:[{customer:'Sol-ti', cases:700}] },
    { jlzPo:'LLEGADA', product:'garlic',   status:'Arrived',    arrivalEstimated:d(-9), arrivalActual:d(-9),
      directShip:[{customer:'Whole Foods Market', cases:140}] },
    { jlzPo:'SINMARCA',product:'garlic',   status:'In Transit', arrivalEstimated:d(-20) },
    { jlzPo:'CANCEL',  product:'ginger',   status:'Cancelled',  arrivalEstimated:d(-30),
      directShip:[{customer:'Sol-ti', cases:900}] }
  ];
  getOrders = function(){ return BASE; };
  var r = mtoStaleShipments();
  check('avisa solo por la vencida y sin marcar', r.length, 1);
  check('y dice de qué orden se trata', r[0].po, 'VENCIDA');
  check('con las cajas que están inflando el run-rate', r[0].cases, 700);
  check('y hace cuántos días debió llegar', r[0].dias, 3);
  check('nombra al cliente, que es lo accionable', r[0].quien, 'Sol-ti');
  ok('una llegada futura todavía no es un problema', !r.some(function(x){ return x.po === 'FUTURA'; }));
  ok('una ya marcada como llegada se calla', !r.some(function(x){ return x.po === 'LLEGADA'; }));
  ok('una orden sin marca contra-orden no le incumbe', !r.some(function(x){ return x.po === 'SINMARCA'; }));
  ok('una cancelada tampoco', !r.some(function(x){ return x.po === 'CANCEL'; }));

  // El orden importa: primero la que lleva más tiempo mal, que es la que más distorsiona.
  BASE.push({ jlzPo:'MASVIEJA', product:'turmeric', status:'In Transit', arrivalEstimated:d(-30),
              directShip:[{customer:'Sol-ti', cases:400}] });
  check('ordena por antigüedad: la más vieja primero', mtoStaleShipments()[0].po, 'MASVIEJA');
})();

group('mtoCasesPerWeek · lo comprado contra orden, orden por orden');
// El flag por cliente saca a la cuenta entera. Esto solo saca las cajas que compraste para alguien,
// así que el mismo cliente puede tener stock y contra-orden a la vez — el caso real del ajo.
(function(){
  var HOY = new Date(2026, 8, 4);
  var W = function(n){ return new Date(HOY.getTime() - n*7*86400000).toISOString().slice(0,10); };
  var ORD = [
    { jlzPo:'A', product:'garlic', status:'In Transit', arrivalEstimated:W(1),
      directShip:[{customer:'Whole Foods Market', cases:140}] },
    { jlzPo:'B', product:'garlic', status:'Arrived', arrivalActual:W(2),
      directShip:[{customer:'Whole Foods Market', cases:134}] },
    { jlzPo:'C', product:'garlic', status:'Arrived', arrivalActual:W(3) },              // sin marcar → stock
    { jlzPo:'D', product:'garlic', status:'Cancelled', arrivalActual:W(1),
      directShip:[{customer:'Whole Foods Market', cases:999}] },                        // cancelada
    { jlzPo:'E', product:'garlic', status:'Arrived', arrivalActual:W(40),
      directShip:[{customer:'Whole Foods Market', cases:500}] },                        // fuera de ventana
    { jlzPo:'F', product:'turmeric', status:'Arrived', arrivalActual:W(2),
      directShip:[{customer:'Sol-ti', cases:700}] }
  ];
  getOrders = function(){ return ORD; };
  _ordProd  = function(o){ return o.product || 'ginger'; };
  
  productCaseLb = function(){ return 30; };
  dmWeekKey = function(d){ var x=new Date(d); var g=(x.getDay()+6)%7; x.setDate(x.getDate()-g);
    return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
  // ventas de sobra, para que el techo no ate
  _dmRawAll = [ { prod:'garlic', c:'Whole Foods Market', d:W(2), lbs:400*30 },
                { prod:'turmeric', c:'Sol-ti', d:W(2), lbs:800*30 } ];

  // La PO 'A' está In Transit (solo arrivalEstimated): todavía no llegó, así que no puede explicar
  // ventas pasadas. Solo cuenta la 'B', que ya está en el almacén.
  check('suma solo lo marcado Y LLEGADO, sobre la ventana pedida',
        Math.round(mtoCasesPerWeek('garlic', 26) * 26), 134);
  ok('una orden en tránsito no descuenta nada todavía',
     Math.round(mtoCasesPerWeek('garlic', 26) * 26) < 274);
  check('lo viejo queda fuera de la ventana', Math.round(mtoCasesPerWeek('garlic', 4) * 4), 134);
  check('no mezcla productos',                Math.round(mtoCasesPerWeek('turmeric', 26) * 26), 700);
  check('un producto sin marcas da cero',     mtoCasesPerWeek('shallots', 26), 0);
  // El desglose por cliente es lo que permite que las filas del build-up cuadren con el total.
  var porCli = mtoByCustomer('garlic', 26);
  check('el desglose nombra al cliente', Object.keys(porCli).join(), 'Whole Foods Market');
  check('y su tasa suma exactamente el total',
        Math.round(porCli['Whole Foods Market'] * 26), Math.round(mtoCasesPerWeek('garlic', 26) * 26));
  check('sin marcas, desglose vacío', Object.keys(mtoByCustomer('shallots', 26)).length, 0);
  ok('es una TASA: misma cantidad, ventana más larga, tasa más chica',
     mtoCasesPerWeek('garlic', 26) < mtoCasesPerWeek('garlic', 13));

  // ── El techo, que es lo que estuvo mal la primera vez ──────────────────────────────────────────
  // Restar el volumen de las POs cuando LLEGAN, contra un run-rate que mide lo que se VENDIÓ, puede
  // descontar más de lo que el cliente compró: el ajo daba 2 cs/wk en vez de 17.
  _dmRawAll = [ { prod:'garlic', c:'Whole Foods Market', d:W(2), lbs:100*30 } ];
  check('nunca descuenta más de lo que ese cliente compró',
        Math.round(mtoCasesPerWeek('garlic', 26) * 26), 100);
  _dmRawAll = [];
  check('si no compró nada, no hay nada que descontar', mtoCasesPerWeek('garlic', 26), 0);
  _dmRawAll = [ { prod:'garlic', c:'Otro Cliente', d:W(2), lbs:500*30 } ];
  check('y el techo es POR cliente, no del producto entero', mtoCasesPerWeek('garlic', 26), 0);

})();

group('dmcArrivingOrders · el picker sigue al producto, ya no es solo ginger');
// Decía "Direct-ship netting is a ginger-only workflow for v1". El ajo de Whole Foods destapó que no:
// una compra con destino existe en los cinco productos.
(function(){
  var ORD = [
    { jlzPo:'A', product:'ginger',   status:'In Transit' },
    { jlzPo:'B', product:'garlic',   status:'Contracted' },
    { jlzPo:'C', product:'garlic',   status:'Arrived'    },
    { jlzPo:'D', product:'shallots', status:'In Transit' }
  ];
  getOrders = function(){ return ORD; };
  _ordProd  = function(o){ return o.product || 'ginger'; };
  productFocus = function(){ return 'ginger'; };
  check('garlic ve sus órdenes en camino',   dmcArrivingOrders('garlic').length, 1);
  check('y es la que está contratada',       dmcArrivingOrders('garlic')[0].jlzPo, 'B');
  ok('las ya llegadas no aparecen',          dmcArrivingOrders('garlic').every(function(o){ return o.status !== 'Arrived'; }));
  check('shallots también, que antes no podía', dmcArrivingOrders('shallots').length, 1);
  check('sin argumento cae en el producto activo', dmcArrivingOrders().length, 1);
  ok('y no mezcla productos', dmcArrivingOrders('garlic').every(function(o){ return o.product === 'garlic'; }));
})();

group('ordBoughtForCustomers · el nombre tiene que matchear las ventas');
// El campo era texto libre. Un "Whole Foods" escrito a mano no matchea "Whole Foods Market", y la
// marca quedaba huérfana sin que nada lo dijera: el descuento no la reconoce, el carril "made to order" no
// la suma y el aviso de coherencia dispara al pedo. Por eso es una lista, no un input.
(function(){
  _dmRawAll = [
    { prod:'garlic',   c:'Whole Foods Market' }, { prod:'garlic', c:'Erewhon' },
    { prod:'garlic',   c:'Whole Foods Market' }, { prod:'garlic', c:'Compost' },
    { prod:'turmeric', c:'Sol-ti' }
  ];
  dmIsInternalAcct = function(c){ return c === 'Compost'; };
  var g = ordBoughtForCustomers('garlic');
  check('solo los clientes de ese producto', g.length, 2);
  check('y vienen ordenados alfabéticamente', g[0], 'Erewhon');
  ok('con el nombre exacto del reporte de ventas', g.indexOf('Whole Foods Market') >= 0);
  ok('sin duplicados', g.filter(function(x){ return x === 'Whole Foods Market'; }).length === 1);
  ok('las cuentas internas quedan afuera', g.indexOf('Compost') < 0);
  check('otro producto, otra lista', ordBoughtForCustomers('turmeric').join(), 'Sol-ti');
  check('un producto sin ventas devuelve lista vacía', ordBoughtForCustomers('shallots').length, 0);
  ok('un nombre a medias NO está en la lista — por eso no se puede tipear',
     g.indexOf('Whole Foods') < 0);
})();

group('Bought for · una compra con destino no es stock libre');
// Una orden puede pedirse PARA un cliente concreto. Esas cajas entran al almacén pero ya tienen
// dueño, así que no son stock libre. Se marca en el panel de Orders y escribe order.directShip[],
// que es lo que ya leen el Buy Planner, el Simulator y el Inventario — un solo camino de datos.
(function(){
  var ORDERS = [{ jlzPo:'2667517', product:'garlic', cases:140 },
                { jlzPo:'2605240', product:'ginger', cases:1300 }];
  getOrders  = function(){ return ORDERS; };
  saveOrders = function(x){ ORDERS = x; };
  findOrderForPo = function(po){ return ORDERS.filter(function(o){ return String(o.jlzPo)===String(po); })[0] || null; };

  check('sin marcar, nada está apartado', directShipTotal('2667517'), 0);
  addDirectShip('2667517', 'Whole Foods Market', 140);
  check('marcada, las 140 quedan apartadas', directShipTotal('2667517'), 140);
  check('la orden sigue teniendo sus 140 cajas físicas', findOrderForPo('2667517').cases, 140);
  check('y lo que llega como stock libre es cero', Math.max(0, 140 - directShipTotal('2667517')), 0);
  check('marcar una orden no toca a las otras', directShipTotal('2605240'), 0);

  addDirectShip('2667517', 'Erewhon', 20);
  check('se puede repartir entre varios destinos', directShipTotal('2667517'), 160);
  removeDirectShip('2667517', 1);
  check('y desmarcar uno deja el resto', directShipTotal('2667517'), 140);

  addDirectShip('2667517', 'Nadie', 0);
  check('cero cajas no se agrega', directShipTotal('2667517'), 140);
  addDirectShip('9999999', 'Fantasma', 50);
  check('un PO que no existe no rompe nada', directShipTotal('9999999'), 0);
})();

group('invmProjectionHTML · los otros cuatro también prorratean su primera semana');
// La proyección de turmeric/garlic/shallots (y ginger-Hawaii) camina 13 semanas desde el lunes de la
// semana en curso, y descontaba la semana COMPLETA en i=0 — desde un inventario que se carga a mitad
// de semana con el mismo /lunes. El mismo doble conteo que tenía el Buy Planner de ginger.
(function(){
  dmWeekKey = function(d){ var x=new Date(d); var g=(x.getDay()+6)%7; x.setDate(x.getDate()-g);
    return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
  invmProductArrivals = function(){ return {}; };
  whatifArrivals      = function(){ return {}; };
  invmCommittedByWeek = function(){ return {}; };
  var SNAP = null;
  prodInvState = function(){ return SNAP ? { _savedAt: SNAP } : {}; };
  var _s = { p:'turmeric', origin:'Fiji', label:'Turmeric', weeklyLbs:3510, weeklyCases:117,
             safetyWks:2, targetWks:6, onHandCases:400, availCases:400, effOnHandCases:400, hasModel:true };
  var wk1 = function(){ var m = invmProjectionHTML(_s).match(/−\s*([\d,]+)/);
                        return m ? parseInt(m[1].replace(/,/g,''), 10) : null; };

  SNAP = null;         check('sin fecha de conteo NO prorratea (lado seguro)', wk1(), 117);
  ok('...pero lo DICE, en vez de quedarse callado', /full week/.test(invmProjectionHTML(_s)));
  SNAP = '2026-08-31'; check('conteo del lunes: la semana entera está por delante', wk1(), 117);
  SNAP = '2026-09-03'; check('conteo del jueves: solo la mitad', wk1(), 59);
  ok('y con fecha muestra de cuándo es el conteo', /Counted 2026-09-03/.test(invmProjectionHTML(_s)));
  ok('y es la misma regla que usa ginger, no una copia paralela',
     Math.round(bpSnapWeekDemand(117, 0, 1, new Date(2026,8,3))) === 59);
})();

group('bpInvMigrateV1 · de guardar el libre a guardar lo físico');
// v1 guardaba las cajas LIBRES y el Buy Planner le sumaba el committed; v2 guarda lo FÍSICO y resta,
// igual que los otros cuatro productos. La migración corre una sola vez, al primer read sin v2.
(function(){
  var _LS = {};
  var _realLS = (typeof localStorage !== 'undefined') ? localStorage : null;
  localStorage = { getItem:function(k){ return (k in _LS) ? _LS[k] : null; },
                   setItem:function(k,v){ _LS[k] = v; } };
  bpTodayISO = function(){ return '2026-09-03'; };
  dmWeekKey  = function(){ return '2026-08-31'; };
  committedInvForWeek = function(){ return 150; };
  _LS['jlz_bp_inv'] = JSON.stringify({ rows:{ '2496593':{cases:379}, '2523058':{cases:1320}, '2618235':{cases:485} }, sellLb:2.02 });

  bpInvState = BPINVSTATE_REAL;                     // no el stub que dejó un grupo anterior
  var st = bpInvState();
  var tot = Object.keys(st.rows).reduce(function(a,k){ return a + st.rows[k].cases; }, 0);
  check('el total pasa a ser el físico', Math.round(tot), 2334);
  check('y queda anotado cuánto se agregó', st.migratedFromV1.addedCases, 150);
  ok('marcado como estimación: el reparto por lote no es exacto', st.migratedFromV1.estimated === true);
  check('los ajustes del store se preservan', st.sellLb, 2.02);
  ok('cada lote conserva su proporción',
     Math.abs(st.rows['2523058'].cases / tot - 1320/2184) < 0.001);

  var tot2 = Object.keys(bpInvState().rows).reduce(function(a,k){ return a + bpInvState().rows[k].cases; }, 0);
  check('leer de nuevo NO vuelve a migrar', Math.round(tot2), 2334);

  _LS = {};
  check('sin v1 no inventa lotes', Object.keys(bpInvState().rows).length, 0);
  if(_realLS) localStorage = _realLS;
})();

group('invmOverview · Inventory muestra lo FÍSICO, no lo libre');
// Desde el store v2 los lotes de ginger guardan lo físico, igual que los otros cuatro productos.
// El titular es lo que hay en cámara y el desglose muestra cuánto de eso ya está vendido.
invmF = function(n){ return Math.round(n||0).toLocaleString('en-US'); };
invmMoney = function(n){ return '$' + Math.round(n||0).toLocaleString('en-US'); };
dmWeekKey = function(){ return '2026-08-31'; };
committedInvForWeek = function(){ return 150; };
var _im = { lots:[{},{},{}], distressedLots:[] };
var _it = { lbs:70020, cases:2334, val:120000, breakeven:1.8, coverage:18.2,
            atUsd:3000, atCs:100, marginUsd:20000, under:0, thin:0, avgAge:12, oldest:20 };
var _ih = invmOverview(_im, _it);
ok('el titular es lo que hay en cámara', _ih.indexOf('2,334') >= 0);
ok('y desglosa libre vs reservado',      _ih.indexOf('2,184 free + 150 committed') >= 0);
committedInvForWeek = function(){ return 0; };
ok('sin committed no inventa desglose',  invmOverview(_im,_it).indexOf('2,334 cases') >= 0);

group('bpSnapWeekDemand · la semana del conteo se consume solo por lo que le queda');
// 2026: 31-ago lun · 3-sep jue · 6-sep dom.  Caso real: demanda 900, committed abierto 150, merma 1.09.
var LUN = new Date(2026,7,31), JUE = new Date(2026,8,3), SAB = new Date(2026,8,5);
check('conteo del lunes: no se toca, la semana entera está por delante',
      Math.round(bpSnapWeekDemand(900, 150, 1.09, LUN)), 900);
// jueves → quedan 3 de 6 días. El committed (150×1.09=163) entra entero; el resto se parte al medio.
check('conteo del jueves: solo la mitad de lo proyectado',
      Math.round(bpSnapWeekDemand(900, 150, 1.09, JUE)), Math.round(163.5 + (900-163.5)*0.5));
ok('y eso es bastante menos que la semana completa', bpSnapWeekDemand(900, 150, 1.09, JUE) < 600);
check('sábado: ya casi no queda semana',
      Math.round(bpSnapWeekDemand(900, 150, 1.09, SAB)), Math.round(163.5 + (900-163.5)/6));
ok('el committed nunca se prorratea — son órdenes reales con fecha',
   bpSnapWeekDemand(900, 150, 1.09, SAB) >= 163);
check('sin committed, se prorratea todo',
      Math.round(bpSnapWeekDemand(900, 0, 1.09, JUE)), 450);
check('si el committed supera la demanda, no la infla',
      Math.round(bpSnapWeekDemand(200, 900, 1.09, JUE)), 200);
check('demanda cero se queda en cero', bpSnapWeekDemand(0, 150, 1.09, JUE), 0);

group('renderWeekPanel · el HTML cierra bien en las dos ramas');
// El panel tiene dos salidas (la tabla normal y el estado "no hay demanda de stock") y comparten el
// <div class="dwk"> de apertura. Un </div> de menos en cualquiera de las dos rompe el layout de todo
// lo que viene abajo, y eso no se ve en el contador de divs del archivo: hay que mirar lo que SALE.
var _painted = '';
document = { getElementById: function(id){
  return (id === 'dm-week') ? { set innerHTML(v){ _painted = v; }, get innerHTML(){ return _painted; } } : null;
} };
productLabel = function(p){ return p.charAt(0).toUpperCase() + p.slice(1); };
function balanceOK(html){
  var o = (html.match(/<div\b/g) || []).length, c = (html.match(/<\/div>/g) || []).length;
  return o === c && o > 0;
}
var _base = { prod:'ginger', origin:'Peru', wk:'2026-08-31', pace:dmWeekPace(new Date(2026,8,3)),
              named:[{c:"Albert's",cs:42}], namedCs:42, rrAll:900, ds:0,
              lastLoaded:'2026-09-01', staleDays:2, win:6 };

dmWeekStatus = function(){ var o = {}; for(var k in _base) o[k] = _base[k];
                           o.est = 892; o.ahead = 446; return o; };
renderWeekPanel();
check('rama normal: los div cierran', balanceOK(_painted), true);
ok('y muestra el número de la semana', _painted.indexOf('892') >= 0);
ok('y nombra a quien ya ordenó', _painted.indexOf("Albert's") >= 0);

dmWeekStatus = function(){ var o = {}; for(var k in _base) o[k] = _base[k];
                           o.est = 0; o.ahead = 0; o.rrAll = 3.9; o.ds = 3.45; return o; };
renderWeekPanel();
check('rama sin demanda de stock: los div también cierran', balanceOK(_painted), true);
ok('y explica que es direct-ship, en vez de mostrar ceros', _painted.indexOf('direct') >= 0);
ok('sin imprimir una tabla de ceros', _painted.indexOf('A typical week') < 0);

dmWeekStatus = function(){ var o = {}; for(var k in _base) o[k] = _base[k];
                           o.est = 0; o.ahead = 0; o.rrAll = 0; o.ds = 0; o.namedCs = 0; o.named = []; return o; };
renderWeekPanel();
ok('y si simplemente no hubo ventas, lo dice así', _painted.indexOf('No sales in the last') >= 0);
check('ese caso también cierra bien', balanceOK(_painted), true);

group('hybridSalesForWeek · el committed también respeta el origen');
// Caso real 2026-09-03: ginger·Hawaii tiene 1 cliente y 8 cs/semana, pero la semana del 7-sep daba
// 275 cs — los 267 de Whole Foods, que son de PERÚ. Las filas del build-up sí filtraban por origen,
// así que ese volumen salía solo en el total de la columna, sin fila que lo explicara.
_cmOriginFor = function(c){ return c.origin || ''; };
var _mHi = { customers:[{c:'Local Hawaii', rrCases:8, rr6Cases:8, rr3Cases:8}] };
COMMITTED = [
  {type:'inv', wk:'2026-09-07', customer:'Whole Foods', cases:267, prod:'ginger', origin:'Peru'},
  {type:'inv', wk:'2026-09-07', customer:'Local Hawaii', cases:5,  prod:'ginger', origin:'Hawaii'}
];
check('con origen Hawaii, el committed de Perú no entra',
      Math.round(hybridSalesForWeek('2026-09-07', 8, _mHi, 'ginger', null, 'Hawaii')), 8);
check('sin origen, se comporta igual que siempre — el Buy Planner no cambia',
      Math.round(hybridSalesForWeek('2026-09-07', 8, _mHi, 'ginger')) > 200, true);
check('"All" no filtra nada',
      Math.round(hybridSalesForWeek('2026-09-07', 8, _mHi, 'ginger', null, 'All')),
      Math.round(hybridSalesForWeek('2026-09-07', 8, _mHi, 'ginger')));

// ═══ Inventory Report — el vendible por lote ════════════════════════════════
// Probado el 2026-09-08 contra el Sales Desk del 09/07 y contra la serie 09/07→09/08.
// DOS reglas, no una, porque las dos columnas mienten de maneras distintas:
//   · lote REAL  → Received − Sold.  `Qty on Hand` está CONGELADO: el 2523058 vendió 108 cajas
//     entre el lunes y el martes y su onHand siguió clavado en 1320.
//   · W-lot      → Qty on Hand.      Ahí `Sold` siempre iguala a `Received` (el reempaque se
//     factura como venta interna a JLZ Produce Manufacturing), así que R−S da 0 y borraría stock real.
// Cargar el NETO en vez del BRUTO fue el bug que dejó el ginger en 1.165 cuando eran 2.250:
// el committed se restaría dos veces. Ver [[inventory-one-convention]].
group('invmIsWLot — el patrón del número de lote es la definición');
[['W2939A2674126',true],['W2811A2596556',true],['w2931a2667673',true],
 ['2523058-0001',false],['2639206-0001',false],['750925-8348',false],
 ['',false],['Warehouse',false]].forEach(function(t){
  check('"' + t[0] + '"', invmIsWLot(t[0]), t[1]);
});
check('null no explota', invmIsWLot(null), false);

group('invmInvReportPhysical — cada regla con los números que la probaron');
check('lote real: 2523058 el lunes (1320 recv, 168 sold)', invmInvReportPhysical(1320,168,1320,false), 1152);
check('lote real: el martes ya vendió 276 — y onHand no se movió',
      invmInvReportPhysical(1320,276,1320,false), 1044);
check('lote real agotado: 2667517 (140/140)', invmInvReportPhysical(140,140,140,false), 0);
check('lote real sobrevendido no devuelve negativo', invmInvReportPhysical(144,146,-2,false), 0);
check('W-lot: W2939A2674126 vale 700, no 0', invmInvReportPhysical(700,700,700,true), 700);
check('W-lot: W2811A2596556 (5 recv, 0 sold)', invmInvReportPhysical(5,0,5,true), 5);
check('W-lot con onHand negativo se clampea', invmInvReportPhysical(64,64,-26,true), 0);

group('invmParseInventoryReport — filas reales del Inventory Report 09/07');
// Subconjunto textual del export: los 21 lotes que el Sales Desk también mostraba (así el
// esperado no es un número mío sino el Floor Count de WholesaleWare), más filas que deben
// descartarse. Los nombres de columna son los del XLS, no versiones limpias.
function _invRow(sku, lot, vendor, recv, sold, onHand, po){
  return { 'SKU':sku, 'Lot #':lot, 'Vendor':vendor, 'PO #':po || '',
           'Qty Received (Base UOM)':recv, 'Qty Sold (Base UOM) for Lot':sold,
           'Qty on Hand (Base UOM)':onHand, 'Product Cost Per Unit (Base UOM)':'35.5',
           'Received Date':'09/05/2026', 'Origin':'Peru' };
}
var JLZM = 'JLZ Produce Manufacturing';
var _INV07 = [
  // ginger Perú — Sales Desk: 1152, 980, 700, 144, 72, 45, 6  = 3099
  _invRow('OG-GIN-30Lbs-PR','2523058-0001','Interloom SAC',1320,168,1320,'2523058'),
  _invRow('OG-GIN-30Lbs-PR','2629655-0001','Anawi USA. LLC',980,0,980,'2629655'),
  _invRow('OG-GIN-30Lbs-PR','W2939A2674126',JLZM,700,700,700,'2674126'),
  _invRow('OG-GIN-30Lbs-PR','W2926A2667560',JLZM,144,144,144,'2667560'),
  _invRow('OG-GIN-30Lbs-PR','W2928A2667631',JLZM,72,72,72,'2667631'),
  _invRow('OG-GIN-30Lbs-PR','W2930A2667670',JLZM,45,45,45,'2667670'),
  _invRow('OG-GIN-30Lbs-PR','W2920A2667118',JLZM,6,6,6,'2667118'),
  // agotados y sobrevendidos: NO son stock, se descartan
  _invRow('OG-GIN-30Lbs-PR','2618235-0001','Anawi USA. LLC',790,790,485,'2618235'),
  _invRow('OG-GIN-30Lbs-PR','1937587-3146','Anawi USA. LLC',1020,1079,-59,'1937587'),
  // turmeric Fiji — Sales Desk: 75, 2, 6, 7, 4, 5 = 99
  _invRow('OG-TUR-30Lbs-PR-FJ','2620621-0001','SBimal LLC',150,75,123,'2620621'),
  _invRow('OG-TUR-30Lbs-PR-FJ','2597551-0001','SBimal LLC',150,148,20,'2597551'),
  _invRow('OG-TUR-30Lbs-PR-FJ','2439588-0001','SBimal LLC',100,94,7,'2439588'),
  _invRow('OG-TUR-30Lbs-PR-FJ','2260876-0001','SBimal LLC',150,143,7,'2260876'),
  _invRow('OG-TUR-30Lbs-PR-FJ','2305337-0001','SBimal LLC',100,96,4,'2305337'),
  _invRow('OG-TUR-30Lbs-PR-FJ','W2811A2596556',JLZM,5,0,5,'2596556'),
  // garlic: dos líneas de 30 lb que NO se pueden mezclar (Colossal vs Super Jumbo)
  _invRow('OG-GAR-30lbs-Colossal','W2931A2667673',JLZM,140,140,140,'2667673'),
  _invRow('OG-GAR-30lbs-Colossal','W2938A2674095',JLZM,70,70,70,'2674095'),
  _invRow('OG-GAR-30Lbs-SuperJumbo','2639212-0001','Christopher Ranch Vendor',64,19,45,'2639212'),
  _invRow('OG-GAR-30Lbs-SuperJumbo','2305351-0001','Christopher Ranch Vendor',64,51,13,'2305351'),
  _invRow('OG-GAR-30Lbs-SuperJumbo','2579010-0001','Christopher Ranch Vendor',64,53,11,'2579010'),
  // shallots (50 lb)
  _invRow('OG-SHA-50Lbs-LG','2667534-0001','Peri and Sons Farms',100,56,100,'2667534'),
  _invRow('OG-SHA-50Lbs-LG','2587428-0001','Peri and Sons Farms',100,99,36,'2587428'),
  // fuera de los SKU de compra: producto trabajado y empaque. No son la caja que se compra.
  _invRow('OG-TUR-5Lbs-PR-FJ','W2942A2678668',JLZM,120,120,120,'2678668'),
  _invRow('OG-GIN-5LBS-PR','W2945A2679079',JLZM,20,20,20,'2679079'),
  _invRow('Blank 30# Cases','X-1','Someone',10,0,10,'')
];
var _inv = invmParseInventoryReport(_INV07);
var _by = {};
_inv.lots.forEach(function(l){ _by[l.sku] = (_by[l.sku] || 0) + l.cases; });

check('ginger Perú = el Floor Count del Sales Desk', _by['OG-GIN-30Lbs-PR'], 3099);
check('turmeric Fiji = Floor Count',                 _by['OG-TUR-30Lbs-PR-FJ'], 99);
check('garlic Colossal = Floor Count',               _by['OG-GAR-30lbs-Colossal'], 210);
check('garlic Super Jumbo = Floor Count',            _by['OG-GAR-30Lbs-SuperJumbo'], 69);
check('shallots = Floor Count',                      _by['OG-SHA-50Lbs-LG'], 45);
check('Colossal y Super Jumbo NO se suman entre sí',
      _by['OG-GAR-30lbs-Colossal'] !== _by['OG-GAR-30Lbs-SuperJumbo'], true);
check('descarta 5/10/20 lb y empaque', _inv.stats.offSku, 3);
check('descarta agotados y sobrevendidos', _inv.stats.depleted, 2);
ok('no cuela ningún SKU que no sea de compra',
   _inv.lots.every(function(l){ return !!INVM_BUY_SKUS[l.sku]; }));

// El origen sale del SKU, nunca de la columna Origin: ese texto es libre ('USA' vs 'California'
// vs 'Nevada') y partiría un producto en dos grupos, que es lo que dejó el garlic disponible
// en 0 el 2026-09-03 — el committed matchea contra un solo origen.
var _gar = _inv.lots.filter(function(l){ return l.product === 'garlic'; });
ok('garlic queda en un solo origen aunque la columna Origin diga otra cosa',
   _gar.length > 0 && _gar.every(function(l){ return l.origin === 'California'; }));
check('el origen crudo se conserva para poder auditarlo', _gar[0].originRaw, 'Peru');

// Señal de control: el patrón del lote y el vendor de reempaque coinciden hoy en 299/299 filas.
// Si algún día dejan de coincidir cambió algo en WholesaleWare — se avisa, no se adivina.
check('sin discrepancias, no hay flags', _inv.flags.length, 0);
var _mix = invmParseInventoryReport([
  _invRow('OG-GIN-30Lbs-PR','2523058-0001',JLZM,100,10,100,'2523058')   // lote real, vendor de reempaque
]);
check('lote real con vendor de reempaque levanta flag', _mix.flags.length, 1);
check('…y la flag dice de qué se trata', _mix.flags[0].kind, 'wlot-signal');
check('…pero igual carga el lote, no lo descarta', _mix.lots.length, 1);

// 5 de ginger + 1 de turmeric + 2 de garlic Colossal. Los W-lots de 5 lb quedaron afuera antes,
// por SKU: el filtro de SKU corre primero que el conteo de W.
check('marca los W-lots para que el committed no se descuente dos veces',
      _inv.lots.filter(function(l){ return l.isW; }).length, 8);
check('cuenta las cajas que están en W-lots',
      _inv.stats.wcases, 700 + 144 + 72 + 45 + 6 + 5 + 140 + 70);
check('no rompe con una lista vacía', invmParseInventoryReport([]).lots.length, 0);
check('no rompe con null', invmParseInventoryReport(null).lots.length, 0);
// Con cellDates:true SheetJS devuelve objetos Date, no texto. Antes caía en '' y perdía la fecha
// de recepción, que alimenta los días de almacenamiento y el FEFO.
var _d = invmParseInventoryReport([{ 'SKU':'OG-SHA-50Lbs-LG','Lot #':'X','Vendor':'Peri and Sons Farms',
  'Qty Received (Base UOM)':10,'Qty Sold (Base UOM) for Lot':0,'Qty on Hand (Base UOM)':10,
  'Received Date': new Date(2026,8,4) }]);
check('lee una fecha que viene como objeto Date', _d.lots[0].received, '2026-09-04');
check('una fecha ilegible queda vacía, nunca inventada',
      invmParseInventoryReport([{ 'SKU':'OG-SHA-50Lbs-LG','Lot #':'X','Vendor':'v',
        'Qty Received (Base UOM)':10,'Qty Sold (Base UOM) for Lot':0,'Received Date':'n/d' }]).lots[0].received, '');

// ═══ Inventory Report — a qué store va cada lote ════════════════════════════
// Escribir en el store equivocado NO da error: el producto se queda con el inventario de la
// semana pasada y nadie se entera hasta que el plan de compra sale mal.
group('invmInvReportPlan — el plan de escritura');
// Orders SOLO tiene ordenes de COMPRA. El PO de un W-lot es de manufactura y nunca esta aca —
// esa es justamente la razon por la que los W-lots no pueden entrar por PO.
var _ORD = [{ id:'o-2523058', jlzPo:'2523058', status:'Arrived' },
            { id:'o-2629655', jlzPo:'2629655', status:'In Transit' }];
var _PARSED = invmParseInventoryReport(_INV07);
var _PREV = {
  turmeric:{ serviceLevel:95, lots:[ { lot:'2260876-0001', cases:7, excluded:true, origin:'Fiji' },
                                     { lot:'YA-NO-ESTA',   cases:99, excluded:true, origin:'Fiji' } ] },
  garlic:{   serviceLevel:95, lots:[ { lot:'2639212-0001', cases:45, origin:'California' } ] },
  shallots:{ serviceLevel:95, lots:[ { lot:'2667534-0001', cases:44, origin:'California' } ] }
};
var _P = invmInvReportPlan(_PARSED, _ORD, { rows:{ 'viejo':{cases:1500} }, sellLb:2.02 }, _PREV);
var _grp = function(k){ return _P.groups.filter(function(g){ return g.key === k; })[0] || {}; };

check('ginger-Perú va al store por PO, no al product-aware', _grp('ginger|Peru').store, 'bp');
check('turmeric va al store product-aware',                  _grp('turmeric|Fiji').store, 'prod');
// LA prueba de fuego, y la que faltaba: con Orders conteniendo solo POs de compra reales, el
// store tiene que recibir TODO el bruto — los 2 lotes reales MAS los 5 W-lots. 3.099 no es un
// numero mio: es el Floor Count que mostraba el Sales Desk del 09/07 para ginger-Peru.
// Sin esto, el test anterior daba verde con 1.852 y se perdian 967 cajas en silencio, mientras
// el committed que esos mismos W-lots sirven SI se restaba. El libre salia 1.165 en vez de 2.132.
check('el store recibe el BRUTO completo, W-lots incluidos',
      _grp('ginger|Peru').after, 1152 + 980 + (700 + 144 + 72 + 45 + 6));
check('…que es el Floor Count del Sales Desk', _grp('ginger|Peru').after, 3099);
check('2 lotes reales + 5 W-lots = 7 filas', Object.keys(_P.bpRows).length, 7);
check('ningun PO queda sin cargar', _P.bpMissing.length, 0);

// Un W-lot NO se busca en Orders: entra como fila de reempaque con su propia metadata.
var _rep = Object.keys(_P.bpRows).filter(function(k){ return _P.bpRows[k].repack; });
check('los 5 W-lots entran como reempaque', _rep.length, 5);
ok('la llave de un reempaque es el lote, no el PO de manufactura',
   _rep.every(function(k){ return k.indexOf('W:') === 0; }));
ok('ninguna fila de reempaque quedo reportada como PO faltante',
   !_P.bpMissing.some(function(m){ return String(m.po) === '2674126'; }));
var _r1 = _P.bpRows['W:W2939A2674126'] || {};
check('el reempaque lleva sus cajas', _r1.cases, 700);
check('…y de que lote salieron', (_r1.repack || {}).lot, 'W2939A2674126');
check('…y su costo por caja, para el costo puesto', typeof (_r1.repack || {}).costCase, 'number');
check('…y el proveedor interno', (_r1.repack || {}).supplier, 'JLZ Produce Manufacturing');

// Con un PO real ausente de Orders, ese SI se avisa — pero los W-lots entran igual.
var _P1 = invmInvReportPlan(_PARSED, [{ id:'o-2523058', jlzPo:'2523058', status:'Arrived' }],
                            { rows:{} }, _PREV);
check('un PO de compra que falta se reporta', _P1.bpMissing.length, 1);
check('…y es el que falta, no un W-lot', _P1.bpMissing[0].po, '2629655');
check('…y los W-lots entran lo mismo', _P1.groups.filter(function(g){
      return g.key === 'ginger|Peru'; })[0].after, 1152 + (700 + 144 + 72 + 45 + 6));

// El ajuste manual de dias de almacen es curado a mano y alimenta la merma estimada del lote:
// el reemplazo total lo pisaba.
var _P2d = invmInvReportPlan(_PARSED, _ORD, { rows:{ 'o-2523058':{ cases:1, days:9 } } }, _PREV);
check('preserva el ajuste manual de días', (_P2d.bpRows['o-2523058'] || {}).days, 9);
check('muestra lo que había antes, para poder comparar', _grp('ginger|Peru').before, 1500);
ok('ningún lote de ginger-Perú se cuela en el store product-aware',
   !_P.prodLots.ginger || !_P.prodLots.ginger.some(function(l){ return l.origin === 'Peru'; }));

// La marca "excluded" es lo único que el reemplazo total NO puede pisar: el lote sigue vivo en
// WholesaleWare, así que vuelve en el archivo, y sin la marca vuelve a contar como stock.
check('preserva la marca "excluded" por número de lote', _P.keptExcluded.join(','), '2260876-0001');
ok('y la marca queda puesta en el lote que se va a guardar',
   _P.prodLots.turmeric.some(function(l){ return l.lot === '2260876-0001' && l.excluded === true; }));
check('avisa el excluido que el almacén ya dio de baja', _P.goneExcluded.join(','), 'YA-NO-ESTA');
ok('un lote que no estaba excluido no queda marcado',
   _P.prodLots.turmeric.every(function(l){ return l.lot === '2260876-0001' || !l.excluded; }));

// Reemplazo total: lo que ya no está en el archivo se va. Si no, el stock vendido la semana
// pasada sigue contando y el plan compra de menos.
var _P2 = invmInvReportPlan(invmParseInventoryReport([]), _ORD, {rows:{}}, _PREV);
check('un producto que desaparece del archivo queda en cero, no congelado',
      (_P2.prodLots.garlic || []).length, 0);
check('…y el preview lo muestra bajando', _P2.groups.filter(function(g){
      return g.product === 'garlic'; })[0].after, 0);

// El SKU tiene que llegar al lote guardado o el committed se descuenta de la línea equivocada.
ok('cada lote guardado lleva su SKU',
   _P.prodLots.garlic.every(function(l){ return !!l.sku; }));
check('Colossal y Super Jumbo se muestran desglosados aunque compartan origen',
      Object.keys(_grp('garlic|California').skus).sort().join(','),
      'OG-GAR-30Lbs-SuperJumbo,OG-GAR-30lbs-Colossal');

// Un PO ya recibido que sigue "In Transit" se cuenta dos veces: stock + en camino.
check('detecta el PO recibido que sigue figurando en camino', _P.pipeline.length, 1);
check('…y dice cuál es', _P.pipeline[0].po, '2629655');
ok('no marca los que ya están en Arrived',
   !_P.pipeline.some(function(x){ return x.po === '2523058'; }));

check('no rompe sin órdenes ni stores previos',
      invmInvReportPlan(_PARSED, null, null, null).groups.length > 0, true);

// El XLS es entrada NO confiable y lo que sale del parser termina en innerHTML (l.po y l.sup se
// renderizan sin escapar). Se limpia en el BOUNDARY, como [[xss-stored-orders]]: un solo lugar.
group('invmParseInventoryReport — el archivo es entrada no confiable');
var _XSS = '<img src=x onerror=alert(1)>';
var _px = invmParseInventoryReport([{ 'SKU':'OG-SHA-50Lbs-LG', 'Lot #':'X'+_XSS,
  'Vendor':'Peri'+_XSS, 'PO #':'99'+_XSS, 'Origin':_XSS,
  'Qty Received (Base UOM)':10, 'Qty Sold (Base UOM) for Lot':0, 'Qty on Hand (Base UOM)':10 }]);
var _lx = _px.lots[0];
ok('el lote no puede traer HTML',      !/[<>"]/.test(_lx.lot));
ok('el proveedor tampoco',             !/[<>"]/.test(_lx.supplier));
ok('el PO tampoco',                    !/[<>"]/.test(_lx.po));
ok('ni el origen crudo que se guarda', !/[<>"]/.test(_lx.originRaw));
check('y las cajas se cargan igual', _lx.cases, 10);
// Un SKU envenenado no matchea la allow-list, así que la fila cae por off-SKU: doble red.
check('un SKU con HTML no entra', invmParseInventoryReport([{ 'SKU':'OG-SHA-50Lbs-LG'+_XSS,
  'Lot #':'Y', 'Vendor':'v', 'Qty Received (Base UOM)':5, 'Qty Sold (Base UOM) for Lot':0 }]).lots.length, 0);

// WholesaleWare escribe sus propios SKU con mayúsculas inconsistentes — hoy mismo conviven
// 'OG-GAR-30lbs-Colossal' y 'OG-GAR-30Lbs-SuperJumbo'. Con match exacto, el día que alguien
// "arregle" ese typo, esas cajas desaparecen de la app sin aviso.
group('invmCanonSku — las mayúsculas del SKU no pueden borrar stock');
check('resuelve el SKU tal cual viene',   invmCanonSku('OG-GAR-30lbs-Colossal'), 'OG-GAR-30lbs-Colossal');
check('…y con las mayúsculas cambiadas',  invmCanonSku('OG-GAR-30Lbs-COLOSSAL'), 'OG-GAR-30lbs-Colossal');
check('…y con espacios al costado',       invmCanonSku('  og-sha-50lbs-lg  '),   'OG-SHA-50Lbs-LG');
check('un SKU que no es de compra no resuelve', invmCanonSku('OG-TUR-5Lbs-PR-FJ'), '');
check('"__proto__" no resuelve a nada',   invmCanonSku('__proto__'), '');
check('null no explota',                  invmCanonSku(null), '');
// El lote se guarda con la forma CANÓNICA, no con la del archivo: así el resto de la app
// (el descuento del committed, que compara por SKU) ve un solo string.
var _cs = invmParseInventoryReport([{ 'SKU':'og-gar-30LBS-colossal', 'Lot #':'W2931A1', 'Vendor':'JLZ Produce Manufacturing',
  'Qty Received (Base UOM)':140, 'Qty Sold (Base UOM) for Lot':140, 'Qty on Hand (Base UOM)':140 }]);
check('el SKU se guarda canónico, no como vino', _cs.lots[0].sku, 'OG-GAR-30lbs-Colossal');
check('…y las cajas entran igual', _cs.lots[0].cases, 140);

// ═══ bpInvLot — el lote de reempaque no cuelga de una orden ═════════════════
// El store de ginger-Perú está keyeado por ORDEN DE COMPRA. Un W-lot lleva en su número el PO de
// MANUFACTURA, que nunca está en Orders — así que sin una fila que sepa vivir sin orden, las
// 1.189 cajas de reempaque (37% del bruto de ginger) no tienen dónde entrar.
group('bpInvLot — un lote de reempaque vive sin orden de compra');
getOrders = function(){ return []; };                       // Orders vacío: nada matchea
var _stR = { rates:{ transportLb:0.10, shrinkDay:0.5, cleanBase:0, cleanDetPctWk:0 },
  rows:{ 'W:W2939A2674126': { cases:700, repack:{ lot:'W2939A2674126', po:'2674126',
           received:'2026-09-05', costCase:35.5551, supplier:'JLZ Produce Manufacturing' } },
         'huerfana': { cases:99 } } };
var _LR = bpInvLot('W:W2939A2674126', _stR, null);
check('cuenta sus cajas aunque ninguna orden matchee', _LR.cases, 700);
// Un W-lot puede venir de un contenedor sea o air y no hay forma de saber cuál: estamparle uno
// sería inventarlo, y CLAUDE.md dice que sea y air nunca se mezclan.
check('no lo marca sea ni air', _LR.mode, 'repack');
// El costo del reempaque ya viene asignado por WholesaleWare e incluye el flete del contenedor
// de origen; sumarle transporte otra vez lo contaría dos veces.
check('el costo puesto sale del costo por caja del reporte', Math.round(_LR.landed * 30), 36);
ok('los días de almacén salen de la fecha del W-lot, no de una orden', _LR.stored > 0);
ok('lleva su metadata para que invmCompute lo reconozca', !!(_LR.rs && _LR.rs.repack));

// Una fila sin orden Y sin metadata de reempaque es huérfana (su orden se borró): invmCompute la
// descarta. La diferencia entre las dos es exactamente `rs.repack`.
var _LH = bpInvLot('huerfana', _stR, null);
check('la fila huérfana no tiene orden', _LH.o, null);
ok('…ni metadata de reempaque, que es lo que la distingue', !(_LH.rs && _LH.rs.repack));

// ═══ La semana cortada se VE pero no promedia ══════════════════════════════
// Garlic y shallots no mostraban W36 ni W37 en el build-up. Su unico committed viene de cuentas
// order-driven, que se descartan del completado a proposito; al quedar `cbw` vacio la funcion
// salia ANTES de calcular `partial` y se llevaba puesta la rama `prelim`, que existe justo para
// recuperar esas semanas. Y una vez recuperadas no pueden promediar: `reliableWeeks` ya deja
// fuera la ultima semana con datos porque la facturacion sigue llegando (garlic marcaba 73
// unidades en W36 contra ~190 de una semana normal). Promediarla baja el run-rate y empuja a
// comprar de menos. Las semanas se calculan desde HOY para que el test no caduque.
group('La semana cortada se muestra, pero nunca promedia');
var _wk = function(offDays){ var d = new Date(); d.setDate(d.getDate() + offDays); return dmWeekKey(d); };
var CURW = _wk(0), PREVW = _wk(-7);
var _rel = [];
for (var _i = 9; _i >= 1; _i--) _rel.push({ week: _wk(-14 - (_i - 1) * 7), lbs: 3000 });
var _mkModel = function(){
  return { caseLb:30, wkCust:{}, weeklyReliable:_rel.slice(),
           weekly:_rel.concat([{ week:PREVW, lbs:1200 }, { week:CURW, lbs:300 }]),
           rateWeeks:_rel.map(function(w){ return w.week; }),
           customers:[{ c:'LUMPY', rrCases:0, rr6Cases:0, rr3Cases:0, sporadic:true, ovr:{} }] };
};

// Escenario garlic: TODO el committed es de una cuenta order-driven.
COMMITTED = [{ type:'inv', wk:CURW, customer:'LUMPY', cases:210, prod:'garlic', origin:'California' }];
var G = nowcastProductModel(_mkModel(), 'garlic', 'California');
ok('el committed order-driven ya no corta la función antes de tiempo',
   !!G.nowcastWeeks && Object.keys(G.nowcastWeeks).length > 0);
check('la semana cerrada a medias se marca prelim', (G.nowcastWeeks || {})[PREVW], 'prelim');
ok('…y se expone aparte para que la UI la muestre',
   (G.prelimWeeks || []).some(function(w){ return w.week === PREVW && w.lbs === 1200; }));
ok('…pero NO entra al promedio', (G.rateWeeks || []).indexOf(PREVW) < 0);
ok('la semana en curso se muestra', !!(G.partialWeek && G.partialWeek.week === CURW));
ok('…y tampoco promedia', (G.rateWeeks || []).indexOf(CURW) < 0);
check('el run-rate queda igual que sin las dos semanas', G.runRate3, 3000);
check('y la ventana de 13 tampoco se mueve', G.runRate13, 3000);

// Contraste: una semana COMPLETADA con órdenes reservadas sí promedia — eso es un nowcast de
// verdad (facturado + reservado reconstruyen la semana entera), no una semana a medias.
COMMITTED = [{ type:'inv', wk:PREVW, customer:'STEADY', cases:100, prod:'garlic', origin:'California' }];
var G2m = _mkModel();
G2m.customers = [{ c:'STEADY', rrCases:0, rr6Cases:0, rr3Cases:0, sporadic:false, ovr:{} }];
var G2 = nowcastProductModel(G2m, 'garlic', 'California');
check('una semana con órdenes se marca now, no prelim', (G2.nowcastWeeks || {})[PREVW], 'now');
ok('…y esa SÍ promedia', (G2.rateWeeks || []).indexOf(PREVW) >= 0);
check('se completa a facturado + reservado: (3000+3000+1200+3000)/3', G2.runRate3, 3400);

// ═══ El entorno se limpia entre grupos ══════════════════════════════════════
// Guardián del arreglo de arriba. Si alguien saca la restauración de `group()`, esto falla y
// dice por qué — en vez de que un test futuro mida un stub ajeno y nadie se entere.
group('Un stub NO sobrevive al grupo que lo puso');
dmWeekKey = function(){ return 'PISADA-A-PROPOSITO'; };
getCommitted = function(){ return [{ pisado:true }]; };
check('dentro del grupo, el stub manda', dmWeekKey(new Date()), 'PISADA-A-PROPOSITO');

group('…y el grupo siguiente arranca con las reales');
check('dmWeekKey volvió a la de producción', dmWeekKey(new Date('2026-09-09T12:00:00')), '2026-09-07');
ok('…y no es la pisada', dmWeekKey(new Date()) !== 'PISADA-A-PROPOSITO');
ok('getCommitted también volvió', !((getCommitted() || [])[0] || {}).pisado);

summary();
