// Invariants of the demand model, checked against the REAL functions lifted out of

// Secciones de más abajo reemplazan `hybridSalesForWeek` por stubs; guardamos la REAL acá arriba
// (el archivo se concatena después de app.js) para poder probarla de verdad más adelante.
var HYBRID_REAL = hybridSalesForWeek;

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

summary();
