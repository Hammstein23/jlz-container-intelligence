// Invariants of the demand model, checked against the REAL functions lifted out of
// JLZ_Container_Intelligence.html. Each group locks in a bug that was found and fixed
// on 2026-09-01, so a regression fails here instead of quietly changing a buy plan.

// ═══ 1. Week bucketing ══════════════════════════════════════════════════════
// Was: a bare 'YYYY-MM-DD' parses as UTC midnight, which west of Greenwich resolves to
// the previous day, so every MONDAY sale landed in the previous week.
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
var isDirectShipRow = function(r){ return r.c === 'SOL-TI'; };
var dmEffectiveRunRateLbs = function(){ return null; };
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
    out.push({ weekStartISO:x.toISOString().slice(0,10), weekNum:35 + i }); }
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

summary();
