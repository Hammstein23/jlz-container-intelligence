// Prueba los snippets del runbook de los lunes (.claude/commands/lunes.md) contra un estado
// simulado. Los snippets se leen del .md real, así que si alguien los edita y los rompe, esto
// falla — que es el punto: el lunes se ejecuta el runbook, no una copia.
//
// Cubre las dos fallas que se encontraron al auditarlo el 2026-09-02:
//   · cargar el neto en vez del bruto → el committed se descuenta dos veces
//   · el reemplazo total pisaba las marcas "excluded" → esos lotes volvían a contar como stock

// ── Estado simulado ─────────────────────────────────────────────────────────
var _prodInv, _bpInv, _orders, _rendered;
function reset(){
  _prodInv = {
    turmeric: { serviceLevel:95, demandOverride:null, lots:[
      { lot:'2597551', origin:'Fiji', supplier:'Sbimal', cases:102, avgCost:72, received:'2026-08-24' },
      { lot:'2260876', origin:'Fiji', supplier:'Sbimal', cases:7,   avgCost:83, received:'2026-04-28', excluded:true },
      { lot:'2439588', origin:'Fiji', supplier:'Sbimal', cases:6,   avgCost:79, received:'2026-06-24', excluded:true },
      { lot:'VIEJO01', origin:'Fiji', supplier:'Sbimal', cases:40,  avgCost:70, received:'2026-03-01' }
    ]},
    garlic: { serviceLevel:95, demandOverride:null, lots:[
      { lot:'2305351', origin:'California', supplier:'Christopher Ranch', cases:13, avgCost:94, received:'2026-05-08' }
    ]}
  };
  _bpInv  = { sellLb: 1.85, rates: { peru: 0.44 }, rows: { 'PO-VIEJO': { cases: 999 } } };
  _orders = [ { id:'A1', jlzPo:'2410367' }, { id:'A2', jlzPo:'2432242' } ];
  _rendered = 0;
}
var prodInvState = function(){ return _prodInv; };
var prodInvSave  = function(st){ _prodInv = st; };
var bpInvState   = function(){ return _bpInv; };
var bpInvSave    = function(st){ _bpInv = st; };
var getOrders    = function(){ return _orders; };
var bpCcId       = function(o){ return 'CC-' + o.id; };
var renderInventory = function(){ _rendered++; };
// Los snippets escriben en console; hay que capturarlo SIN romper la salida de los tests,
// así que se intercepta solo mientras corre el snippet y después se restaura.
var _logs = [];
var _realLog = console.log, _realWarn = console.warn;
function _capture(on){
  if(on){
    _logs = [];
    console.log  = function(){ _logs.push(Array.prototype.join.call(arguments, ' ')); };
    console.warn = function(){ _logs.push('WARN ' + Array.prototype.join.call(arguments, ' ')); };
    console.table = function(){};
  } else {
    console.log = _realLog; console.warn = _realWarn;
  }
}

// Reemplaza el array LOTS del snippet por datos de prueba, sin tocar el resto del código.
function withLots(snippet, lots, extra){
  var s = snippet.replace(/var LOTS = \[[\s\S]*?\n  \];/, 'var LOTS = ' + JSON.stringify(lots) + ';');
  if (extra) s = extra + '\n' + s;
  return s;
}
function run(code){ _capture(true); try { eval(code); } finally { _capture(false); } return _logs.join('\n'); }

// ════ Snippet B — los cuatro productos del store product-aware ══════════════
group('Snippet B — inventario por producto');

reset();
var NUEVO = [
  { lot:'2597551', origin:'Fiji', supplier:'Sbimal', cases:150, avgCost:72, received:'2026-08-28' },
  { lot:'2260876', origin:'Fiji', supplier:'Sbimal', cases:7,   avgCost:83, received:'2026-04-28' },  // venía excluido
  { lot:'2620621', origin:'Fiji', supplier:'Sbimal', cases:60,  avgCost:74, received:'2026-08-28' }   // nuevo
];
var out = run(withLots(SNIPPET_2, NUEVO));
var lots = _prodInv.turmeric.lots;
var byLot = {}; lots.forEach(function(l){ byLot[l.lot] = l; });

check('reemplazo total: quedan solo los lots cargados', lots.length, 3);
ok('el lot viejo que ya no viene desaparece', !byLot['VIEJO01']);
ok('el lot nuevo entra', !!byLot['2620621']);
check('las cajas se actualizan', byLot['2597551'].cases, 150);

// El corazón del fix: la marca sobrevive al reemplazo.
ok('la marca "excluded" SOBREVIVE al reemplazo', byLot['2260876'].excluded === true);
ok('un lot que no estaba excluido no se marca solo', !byLot['2597551'].excluded);
ok('avisa qué marcas preservó', /excluded" preservadas/.test(out) && /2260876/.test(out));
// 2439588 venía excluido y ya no aparece: el almacén lo dio de baja.
ok('avisa el excluido que ya no está en el Sales Desk', /ya NO están/.test(out) && /2439588/.test(out));
ok('reporta el antes → después', /155 → 217/.test(out));
check('re-renderiza el inventario', _rendered, 1);
ok('NO toca los otros productos', _prodInv.garlic.lots.length === 1 && _prodInv.garlic.lots[0].cases === 13);

// Un producto que todavía no existe en el store no debe romper.
reset();
run(withLots(SNIPPET_2.replace("var PROD = 'turmeric'", "var PROD = 'shallots'"),
             [{ lot:'S1', origin:'California', supplier:'Peri and Sons', cases:30, avgCost:64, received:'2026-08-25' }]));
ok('crea el producto si no existía', _prodInv.shallots && _prodInv.shallots.lots.length === 1);
check('con los valores por defecto', _prodInv.shallots.serviceLevel, 95);

// ════ Snippet A — ginger-Perú, por PO ═══════════════════════════════════════
group('Snippet A — ginger-Perú por PO');

reset();
var out2 = run(withLots(SNIPPET_1, [
  { po:'2410367', cases:404 },
  { po:'2432242', cases:476 },
  { po:'9999999', cases:100 }        // no está en Orders
]));
check('mapea los POs que existen en Orders', Object.keys(_bpInv.rows).length, 2);
check('la llave es el bpCcId de la orden', _bpInv.rows['CC-A1'].cases, 404);
ok('el PO viejo desaparece (reemplazo total)', !_bpInv.rows['PO-VIEJO']);
ok('avisa el PO que falta en Orders', /WARN/.test(out2) && /9999999/.test(out2));
ok('NO carga el PO que falta', !Object.keys(_bpInv.rows).some(function(k){ return _bpInv.rows[k].cases === 100; }));
check('preserva sellLb', _bpInv.sellLb, 1.85);
ok('preserva rates', _bpInv.rates && _bpInv.rates.peru === 0.44);

// ════ Paso 3b — las DOS convenciones, que son opuestas ══════════════════════
// Los dos stores tratan el committed al revés uno del otro. Confundirlos cuenta las cajas
// reservadas dos veces: para abajo en el product-aware, para arriba en ginger-Perú.
group('Paso 3b — cada store carga distinto');

var SHRINK = 0.05, COMMITTED = 50, LIBRES = 150, FISICAS = LIBRES + COMMITTED;

// product-aware: available = onHand·shrink − committed  → se carga BRUTO
function availProd(onHand){ return Math.max(0, onHand * (1 - SHRINK) - COMMITTED); }
var pa_bien = availProd(FISICAS), pa_mal = availProd(LIBRES);
check('product-aware con BRUTO: available = las libres (menos shrink)',
      Math.round(pa_bien), Math.round(LIBRES - FISICAS * SHRINK));
ok('product-aware con LIBRE: queda corto', pa_mal < pa_bien - 40);
ok('lo que falta es el committed restado dos veces',
   Math.round(pa_bien - pa_mal) === Math.round(COMMITTED * (1 - SHRINK)));

// ginger-Perú: gross = stock + committed  → se carga LIBRE (la convención OPUESTA)
function grossGinger(stock){ return stock + COMMITTED; }
var g_bien = grossGinger(LIBRES), g_mal = grossGinger(FISICAS);
check('ginger-Perú con LIBRE: el gross son las cajas físicas', g_bien, FISICAS);
ok('ginger-Perú con BRUTO: infla el stock', g_mal > FISICAS);
ok('lo que sobra es el committed sumado dos veces', g_mal - FISICAS === COMMITTED);

// El punto que hay que recordar: cargar igual en los dos stores rompe uno de los dos.
ok('las dos convenciones son opuestas — no se puede cargar igual en ambos',
   (LIBRES !== FISICAS) && (availProd(FISICAS) !== availProd(LIBRES)) && (grossGinger(LIBRES) !== grossGinger(FISICAS)));

// ════ El runbook no perdió ningún snippet ═══════════════════════════════════
group('Integridad del runbook');
check('sigue teniendo los 4 bloques de código', SNIPPET_COUNT, 4);
ok('el snippet A es el de ginger-Perú (por PO)', /bpInvSave/.test(SNIPPET_1) && /jlzPo/.test(SNIPPET_1));
ok('el snippet B es el product-aware', /prodInvSave/.test(SNIPPET_2) && /excluded/.test(SNIPPET_2));
ok('el snippet B hace REEMPLAZO total, no merge', /\.lots = LOTS/.test(SNIPPET_2));
ok('el paso 3b muestra on-hand, committed y available', /onHandCases/.test(SNIPPET_3) && /committedCases/.test(SNIPPET_3) && /availCases/.test(SNIPPET_3));
ok('el paso 3b también cubre ginger-Perú, que vive en el otro store', /bpInvState/.test(SNIPPET_3) && /committedInvForWeek/.test(SNIPPET_3));
// Cada store tiene que quedar asociado a SU convención: buscar las palabras sueltas no sirve,
// las dos aparecen en el documento. Se mira la fila de la tabla de cada uno.
var _row = function(store){                 // la fila de tabla que describe qué se carga en ese store
  var ls = RUNBOOK_TEXT.split('\n');
  for (var i = 0; i < ls.length; i++){
    var l = ls[i];
    if (l.indexOf(store) > -1 && l.indexOf('|') > -1 && l.indexOf('cajas') > -1) return l;
  }
  return '';
};
var _gRow = _row('jlz_bp_inv'), _pRow = _row('jlz_prod_inv_v1');
ok('se encontró la fila de cada store en el runbook', !!_gRow && !!_pRow);
ok('el runbook asocia ginger-Perú con cargar LIBRES y sumar el committed',
   /LIBRES/.test(_gRow) && /suma/.test(_gRow));
ok('el runbook asocia el store product-aware con cargar BRUTAS y restar',
   /BRUTAS/.test(_pRow) && /resta/.test(_pRow));
ok('el chequeo de consola lleva el cache-buster', /\?v='\s*\+\s*Date\.now\(\)/.test(SNIPPET_4));

summary();
