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
isDirectShipRow = function(){ return false; };
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
isDirectShipRow = function(){ return false; };
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

isDirectShipRow = function(r){ return r && r.c === 'Whole Foods Market'; };
check('direct-ship: su committed NO infla el plan', Math.round(hybridSalesForWeek('2026-09-07', 23, _mdl, 'garlic')), 23);
isDirectShipRow = function(){ return false; };
check('sin direct-ship, la misma orden sí entra', Math.round(hybridSalesForWeek('2026-09-07', 23, _mdl, 'garlic')), 23 + (140 - 37));
ok('y usa la ventana activa (rr6=37), no rrCases de 13 semanas (58)',
   Math.round(hybridSalesForWeek('2026-09-07', 23, _mdl, 'garlic')) !== 23 + (140 - 58));

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

var _PAIRS = { 'sol-ti|turmeric':true, 'whole foods market|garlic':true };
dsIsOn = function(cust, prod){ return !!_PAIRS[String(cust||'').trim().toLowerCase()+'|'+prod]; };
var _MDL = { customers:[ {c:'Whole Foods Market'}, {c:'Sol-ti'}, {c:"Albert's Organics"} ] };

check('garlic nombra a Whole Foods', dsLabelFor('garlic', _MDL), 'Whole Foods Market made to order');
check('turmeric nombra a Sol-ti',    dsLabelFor('turmeric', _MDL), 'Sol-ti made to order');
check('un producto sin direct-ship no inventa un nombre', dsLabelFor('shallots', _MDL), 'made to order');
check('solo devuelve las cuentas del producto pedido', dsNamesFor('garlic', _MDL).join(','), 'Whole Foods Market');

_PAIRS['sol-ti|garlic'] = true;
check('con dos cuentas las nombra a las dos', dsLabelFor('garlic', _MDL), 'Whole Foods Market + Sol-ti made to order');
_PAIRS["albert's organics|garlic"] = true;
check('con tres o más, cuenta en vez de enumerar', dsLabelFor('garlic', _MDL), '3 accounts direct-ship');

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
isDirectShipRow=function(r){ return !!(r && r.c==='Whole Foods Market' && r.prod==='garlic'); };
invmProductStats=function(p,o){ return {onHandCases:(p==='garlic'?48:0)}; };
bpInvState=function(){ return {rows:{A:{cases:2184}}}; };
nowcastProductModel=function(m){ return m; };

var _seen=null, _win=3;
dmWindow=function(){ return _win; };
// el modelo devuelve un agregado distinto por ventana, para poder afirmar cuál se eligió
dmBuildModel=function(rows,_a,cl,p){
  _seen={n:rows.length, custs:rows.map(function(r){return r.c;}).filter(function(v,i,a){return a.indexOf(v)===i;})};
  return { runRate3:30*cl, runRate6:60*cl, runRate13:130*cl, runRate26:260*cl,
           weeklyReliable:[{lbs:10*cl},{lbs:10*cl},{lbs:10*cl},{lbs:20*cl},{lbs:20*cl},{lbs:20*cl}] };
};
invmDirectShipCases=function(p,o){ return p==='garlic' ? 74 : 0; };

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
check('el direct-ship viene de invmDirectShipCases (dsWindow), no de la ventana del stock', _g.ds, 74);
check('cobertura = on hand / run-rate de stock', Math.round(_g.cover*10)/10, 1.6);

_win=6;  check('con ventana 6 toma runRate6',  Math.round(dmLineStats('garlic','California').rr), 60);
_win=26; check('con ventana 26 toma runRate26', Math.round(dmLineStats('garlic','California').rr), 260);
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
isDirectShipRow = function(){ return false; };
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
isDirectShipRow = function(){ return false; };
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
  dsIsOn = function(){ return false; };
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
  isDirectShipRow = function(){ return false; };
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
  dsIsOn    = function(){ return false; };
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

  _dmRawAll = [ { prod:'garlic', c:'Whole Foods Market', d:W(2), lbs:400*30 } ];
  dsIsOn = function(c, p){ return c === 'Whole Foods Market' && p === 'garlic'; };
  check('si el cliente YA está excluido por el flag, no se resta dos veces',
        mtoCasesPerWeek('garlic', 26), 0);
  dsIsOn = function(){ return false; };
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
// marca quedaba huérfana sin que nada lo dijera: dsIsOn no la reconoce, el carril "made to order" no
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

summary();
