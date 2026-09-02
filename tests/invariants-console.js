// ── Contraste contra la verdad ─────────────────────────────────────────────
// Pegar entero en la consola del navegador, con la app cargada y los datos puestos.
//
// Los tests de tests/run.sh prueban que el modelo es consistente CONSIGO MISMO. Eso no
// alcanza: el bug de los lunes tenía todo cuadrando y las semanas corridas igual. Esto
// va un paso más afuera y compara en tres niveles:
//
//   NIVEL 1  modelo  vs  filas crudas   — recálculo independiente, sin usar el código de la app
//   NIVEL 2  invariantes sobre datos reales (continuidad, promedio = run-rate, filas = agregado)
//   NIVEL 3  filas crudas  vs  WholesaleWare — imprime los totales por semana para que los
//            compares contra el Sales By Account Report de ese mismo rango de fechas.
//
// Cualquier fila con dif ≠ 0 es un bug. Pasásela a Claude tal cual.

(function(){
  'use strict';
  if (typeof _dmRawAll === 'undefined' || !_dmRawAll || !_dmRawAll.length){
    console.log('No hay datos cargados. Abrí Demand y cargá el archivo primero.'); return;
  }

  // Semana ISO calculada de cero, a propósito: si usáramos dmWeekKey compartiríamos su bug.
  function wkOf(v){
    var s = String(v).slice(0,10);
    var d = new Date(s + 'T12:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));          // atrás hasta el lunes
    var p = function(n){ return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
  }
  var isInternal = function(c){
    c = String(c||'').toLowerCase();
    return c.indexOf('jlz') > -1 || c.indexOf('che che') > -1;
  };
  var r1 = function(x){ return Math.round((x||0)*10)/10; };

  var PRODS = ['ginger','turmeric','garlic','shallots'];
  var pairs = [];
  PRODS.forEach(function(p){
    var os = ['all'];
    try { var o = invmOriginsFor(p) || []; if (o.length) os = o; } catch(e){}
    os.forEach(function(o){ pairs.push([p, o]); });
  });

  var problems = [];

  // ══ NIVEL 1 + 2 ═════════════════════════════════════════════════════════
  var level12 = [];
  pairs.forEach(function(pair){
    var p = pair[0], origin = pair[1], m = null;
    try { m = invmProductModel(p, origin); } catch(e){}
    if (!m || !m.customers) return;
    var cl = m.caseLb || 30;
    var win = (typeof dmWindow === 'function') ? dmWindow(p, origin) : 13;
    var key = win === 3 ? 'rr3Cases' : win === 6 ? 'rr6Cases' : 'rrCases';

    // Recálculo independiente de las filas crudas, espejando EXACTAMENTE el filtro que usa
    // invmProductModel: producto, origen (con invmOriginMatch, que es el resolvedor que usa
    // ese camino), sin direct-ship. Más dmBuildModel: solo ventas, sin cuentas internas.
    // El volumen direct-ship se cuenta aparte y se muestra: no es demanda de stock, pero
    // tampoco tiene que desaparecer sin dejar rastro.
    var mine = {}, dsByWk = {};
    _dmRawAll.forEach(function(r){
      if ((r.prod || 'ginger') !== p) return;
      if (r.type && r.type !== 'Sale') return;
      if (isInternal(r.c)) return;
      if (origin !== 'all'){
        var match = false;
        try { match = (typeof invmOriginMatch === 'function') ? invmOriginMatch(r, origin) : (dmRowOrigin(r) === origin); }
        catch(e){ match = false; }
        if (!match) return;
      }
      var isDs = false;
      // origin 'all' cae en otro camino del modelo (qaModelG/_dmModel) que NO saca direct-ship.
      if (origin !== 'all'){ try { isDs = isDirectShipRow(r); } catch(e){} }
      var w = wkOf(r.d);
      if (isDs){ dsByWk[w] = (dsByWk[w] || 0) + (r.lbs || 0); return; }
      mine[w] = (mine[w] || 0) + (r.lbs || 0);
    });

    // Comparar semana por semana sobre la ventana que el run-rate promedia.
    var wks = (m.rateWeeks || []).slice(-win);
    var worst = 0, worstWk = '';
    wks.forEach(function(w){
      var model = 0, wc = (m.wkCust || {})[w] || {};
      Object.keys(wc).forEach(function(c){ model += wc[c]; });
      var d = Math.abs(model - (mine[w] || 0)) / cl;         // en cajas
      if (d > worst){ worst = d; worstWk = w; }
    });

    // Continuidad de calendario.
    var skips = 0;
    for (var i = 1; i < wks.length; i++){
      if (Math.round((new Date(wks[i]+'T12:00:00') - new Date(wks[i-1]+'T12:00:00'))/864e5) !== 7) skips++;
    }
    // El promedio de la ventana tiene que ser el run-rate.
    var sumWin = 0;
    wks.forEach(function(w){ var wc = (m.wkCust||{})[w] || {}; Object.keys(wc).forEach(function(c){ sumWin += wc[c]; }); });
    var rr = (win === 3 ? m.runRate3 : win === 6 ? m.runRate6 : m.runRate13) / cl;
    // Las filas tienen que explicar el agregado.
    var sumRows = 0, internal = 0, ds = 0;
    m.customers.forEach(function(c){
      if (!c || !c.c) return;
      var v = (c[key] != null ? c[key] : c.rrCases) || 0;
      if (isInternal(c.c)){ internal += v; return; }
      var isDs = false; try { isDs = isDirectShipRow({ c:c.c, prod:p }); } catch(e){}
      if (isDs) ds += v;
      sumRows += v;
    });
    var curWk = wkOf(new Date().toISOString().slice(0,10));

    var row = {
      prod:p, origen:origin, vent:win,
      dif_vs_crudo: r1(worst),
      directship_cs: (function(){ var t=0; wks.forEach(function(w){ t += (dsByWk[w]||0); }); return Math.round(t/cl); })(),  // en la ventana, no en toda la historia
      saltos: skips,
      rr: Math.round(rr),
      filas: Math.round(sumRows),
      gap: Math.round(rr - sumRows),
      interna: Math.round(internal),
      semana_curso_en_promedio: wks.indexOf(curWk) >= 0 ? 'SI' : 'no'
    };
    level12.push(row);
    if (row.dif_vs_crudo > 0.5) problems.push(p+' '+origin+': el modelo no coincide con las filas crudas en '+worstWk+' ('+row.dif_vs_crudo+' cs)');
    if (skips) problems.push(p+' '+origin+': la ventana saltea '+skips+' semana(s)');
    if (Math.abs(rr - sumRows) > 2) problems.push(p+' '+origin+': las filas no explican el run-rate (gap '+Math.round(rr-sumRows)+' cs)');
    if (internal >= 1) problems.push(p+' '+origin+': una cuenta interna entra al run-rate ('+Math.round(internal)+' cs)');
    if (row.semana_curso_en_promedio === 'SI') problems.push(p+' '+origin+': la semana en curso está entrando al promedio');
  });

  console.log('%c NIVEL 1+2 — modelo vs filas crudas, e invariantes ', 'background:#0d5026;color:#fff;font-weight:700');
  console.log('dif_vs_crudo = mayor diferencia en cajas entre lo que dice el modelo y un recálculo independiente. Debe ser 0.');
  console.table(level12);

  // ══ NIVEL 3 ═════════════════════════════════════════════════════════════
  // Totales por semana calculados solo de las filas crudas, para comparar a mano contra el
  // Sales By Account Report de WholesaleWare del mismo rango. Esto es lo único que detecta
  // un error en la CARGA del archivo (si se perdieran filas, todo lo de arriba igual cuadra).
  // Se compara por BILLABLE UNITS y GROSS SALES, que son columnas tal cual del reporte: se
  // suman y listo. Las libras NO sirven para esto — son derivadas
  // ((units ÷ Billable UOM Ratio) × lb por unidad, con ese último factor PARSEADO del nombre
  // del ítem), así que compararlas mediría nuestra propia conversión, no el dato de origen.
  // Se muestran igual, en su propia columna, porque si units cuadra y lb no, el problema está
  // exactamente en el parseo del peso.
  var byWk = {};
  _dmRawAll.forEach(function(r){
    if (r.type && r.type !== 'Sale') return;
    var o = byWk[wkOf(r.d)] || (byWk[wkOf(r.d)] = { u:0, gs:0, lb:0 });
    o.u  += (r.units || 0);        // firmado: notas de crédito y devoluciones restan
    o.gs += (r.gs || 0);
    o.lb += (r.lbs || 0);
  });
  var lvl3 = Object.keys(byWk).sort().slice(-6).map(function(w){
    var e = byWk[w], end = new Date(w + 'T12:00:00'); end.setDate(end.getDate() + 6);
    var p2 = function(n){ return (n < 10 ? '0' : '') + n; };
    return {
      desde: w,
      hasta: end.getFullYear() + '-' + p2(end.getMonth()+1) + '-' + p2(end.getDate()),
      BILLABLE_UNITS: Math.round(e.u),
      GROSS_SALES: Math.round(e.gs),
      lb_derivado: Math.round(e.lb)
    };
  });
  console.log('%c NIVEL 3 — contra WholesaleWare (comparación manual) ', 'background:#0d5026;color:#fff;font-weight:700');
  console.log('Sales By Account Report, filtrando por TARGET FULFILLMENT DATE con el rango desde→hasta de una fila.');
  console.log('Tiene que ser ese campo: es el que lee el cargador (r["Target Fullfillment Date"]). Con otro no compara nada.');
  console.log('Compará las columnas BILLABLE UNITS y GROSS SALES del reporte — se suman directo, sin convertir nada.');
  console.log('lb_derivado NO se compara: lo calcula la app parseando el peso del nombre del ítem.');
  console.log('Incluye TODAS las cuentas, internas y direct-ship, porque así lo reporta WholesaleWare.');
  console.table(lvl3);

  console.log('%c RESULTADO ', 'background:#0d5026;color:#fff;font-weight:700');
  if (!problems.length) console.log('✓ Sin problemas en los niveles 1 y 2. Falta tu comparación manual del nivel 3.');
  else problems.forEach(function(x){ console.log('✗ ' + x); });
})();
