// Checks del Inventory Report real contra el importer de producción.
// Los inyecta inv-report-check.py: ROWS (inventario) y UROWS (unshipped, puede venir vacío).

var parsed = invmParseInventoryReport(ROWS);

// ── Recuento independiente, sin tocar el parser ────────────────────────────────────────────
// Se rehace la física a mano desde las filas crudas. Si esto coincide con parsed.lots, el
// parser leyó el archivo bien; si coincide con el plan, el plan no perdió nada en el camino.
function num(v){ var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; }
var raw = {}, rawTotal = 0, rawW = 0, rawLots = 0;
ROWS.forEach(function(r){
  var sku = invmCanonSku(r['SKU']), meta = sku ? INVM_BUY_SKUS[sku] : null;
  if(!meta) return;
  var isW = invmIsWLot(String(r['Lot #'] == null ? '' : r['Lot #']));
  var cs = isW ? Math.max(0, num(r['Qty on Hand (Base UOM)']))
               : Math.max(0, num(r['Qty Received (Base UOM)']) - num(r['Qty Sold (Base UOM) for Lot']));
  cs = Math.round(cs);
  if(cs <= 0) return;
  var k = meta.product + '|' + meta.origin;
  raw[k] = (raw[k] || 0) + cs; rawTotal += cs; rawLots++; if(isW) rawW += cs;
});

group('Parseo del archivo');
ok('se cargó al menos un lote', parsed.stats.kept > 0);
check('lotes cargados = los del recuento independiente', parsed.lots.length, rawLots);
var pTotal = 0; parsed.lots.forEach(function(l){ pTotal += l.cases; });
check('cajas totales = recuento independiente', pTotal, rawTotal);
ok('todo lote tiene producto y origen', parsed.lots.every(function(l){ return !!l.product && !!l.origin; }));
ok('toda caja es un entero positivo', parsed.lots.every(function(l){
  return l.cases > 0 && l.cases === Math.round(l.cases); }));
var wSum = 0; parsed.lots.forEach(function(l){ if(l.isW) wSum += l.cases; });
check('cajas de reempaque = recuento independiente', wSum, rawW);
check('la física del W-lot es on-hand', invmInvReportPhysical(100, 40, 25, true), 25);
check('la física del lote real es recibido − vendido', invmInvReportPhysical(100, 40, 25, false), 60);

// ── El guardián del bug: SIN ninguna orden, los W-lots tienen que sobrevivir ───────────────
// Acá está la diferencia con el harness sintético. A los W-lots no se les da orden porque en
// la realidad no la tienen: su número lleva el PO de manufactura (W2939A|2674126), que es una
// orden de reempaque interna. Agrupados por PO se iban todos a bpMissing — 37% del ginger.
group('La fila de reempaque (sin una sola orden)');
var bare = invmInvReportPlan(parsed, [], {}, {});
var gpW = 0, gpWlots = [];
parsed.lots.forEach(function(l){ if(invmInvReportIsBpLot(l) && l.isW){ gpW += l.cases; gpWlots.push(l); } });
var gBare = bare.groups.filter(function(g){ return g.key === 'ginger|Peru'; })[0] || { after: 0 };
check('ginger-Perú conserva las cajas de reempaque', gBare.after, gpW);
ok('ningún W-lot cayó en bpMissing', bare.bpMissing.every(function(m){
  return !gpWlots.some(function(l){ return String(l.po) === String(m.po); }); }));
ok('cada W-lot tiene su fila W:<lote>', gpWlots.every(function(l){
  var row = bare.bpRows['W:' + l.lot];
  return row && row.cases === l.cases && row.repack && row.repack.lot === l.lot; }));
ok('la fila de reempaque guarda PO, costo y proveedor', gpWlots.every(function(l){
  var rp = (bare.bpRows['W:' + l.lot] || {}).repack || {};
  return 'po' in rp && 'costCase' in rp && 'supplier' in rp; }));
if(gpW > 0) ok('el bruto no se derrumbó a cero sin órdenes', gBare.after > 0);

// ── El plan completo: órdenes SOLO para los POs de lotes reales ────────────────────────────
group('El plan contra el recuento independiente');
var pos = {};
parsed.lots.forEach(function(l){ if(!l.isW && l.po) pos[String(l.po)] = 1; });
var orders = Object.keys(pos).map(function(po){
  return { id: 'PO-' + po, jlzPo: po, status: 'Arrived' }; });
var plan = invmInvReportPlan(parsed, orders, {}, {});
check('ningún PO real quedó sin orden', plan.bpMissing.length, 0);
var planTotal = 0, mismatch = [];
plan.groups.forEach(function(g){
  planTotal += g.after;
  if((raw[g.key] || 0) !== g.after) mismatch.push(g.key + ': plan ' + g.after + ' vs crudo ' + (raw[g.key] || 0));
});
check('cada grupo coincide con el recuento crudo', mismatch.join(' · ') || 'sin diferencias', 'sin diferencias');
check('la suma de los grupos = las cajas del archivo', planTotal, rawTotal);

// ── Los números del día ────────────────────────────────────────────────────────────────────
group('Los números del día');
var g = plan.groups.filter(function(x){ return x.key === 'ginger|Peru'; })[0] || { after:0, wcases:0, lots:0, wlots:0 };
console.log('  ginger · Perú BRUTO      ' + g.after + ' cajas  (' + g.lots + ' filas, ' +
            g.wlots + ' de reempaque = ' + g.wcases + ' cs, ' +
            Math.round(g.wcases * 1000 / (g.after || 1)) / 10 + '% del bruto)');
console.log('  sin la fila de reempaque ' + (g.after - g.wcases) + ' cajas  ← lo que mostraría el bug viejo');
plan.groups.filter(function(x){ return x.key !== 'ginger|Peru'; }).forEach(function(x){
  console.log('  ' + (x.key + '                       ').slice(0, 24) + ('     ' + x.after).slice(-5) + ' cajas'); });

if(UROWS && UROWS.length){
  // El store de committed vive en el navegador de Juan, así que acá se reconstruye del reporte.
  // `_cmProd` de stubs.js lee `c.prod`; parseOpenOrders emite `.product`, así que se filtra directo.
  var norm = dmcIsUnshippedFormat(UROWS) ? dmcNormalizeUnshipped(UROWS) : UROWS;
  var ent = parseOpenOrders(norm, '').entries.filter(function(c){ return c.product === 'ginger'; });
  var wk = dmWeekKey(new Date()), live = 0, stale = 0;
  ent.forEach(function(c){
    if(c.shipped) return;                          // despachada sin facturar: volumen sí, stock no
    var v = cmCasesInBuyPack(c, 'ginger');
    if(c.wk === wk) live += v; else stale += v;
  });
  live = Math.round(live); stale = Math.round(stale);
  console.log('  committed semana ' + wk + '   ' + live + ' cajas');
  console.log('  LIBRE = bruto − committed  ' + (g.after - live) + ' cajas');
  if(stale > 0) console.log('  ⚠ ' + stale + ' cs committed en semanas ya vencidas — Paso 2 del runbook');
  ok('el committed no se come todo el stock', live <= g.after);
  ok('el libre no es negativo', (g.after - live) >= 0);
}

summary();
