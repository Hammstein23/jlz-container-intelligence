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
  // Estampa de versión: si el navegador sirvió una copia cacheada, esto lo delata al instante.
  console.log('%c invariants-console.js  ·  v2026-09-02c  ·  incluye ginger-Perú y el plan de compra ',
              'background:#334155;color:#fff');
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

  // Los pares producto+origen salen de las VENTAS, no del inventario. Derivarlos de
  // invmOriginsFor (que lee el store de lots) dejaba a **ginger-Perú fuera del chequeo**: sus lots
  // viven en el otro store (jlz_bp_inv) y ese resolvedor solo devolvía Hawaii.
  var vol = {}, skipped = [];
  _dmRawAll.forEach(function(r){
    if (r.type && r.type !== 'Sale') return;
    var o = ''; try { o = dmRowOrigin(r) || ''; } catch(e){}
    if (!o) return;
    var k = (r.prod || 'ginger') + '|' + o;
    vol[k] = (vol[k] || 0) + (r.lbs || 0);
  });
  // 'ginger|all' primero y aparte: es _dmModelG, el modelo de PRODUCCIÓN que alimenta el Buy
  // Planner, el Simulator y el sync con la hoja. Se arma con TODAS las filas de ginger, sin
  // filtrar origen y CON direct-ship — distinto de las vistas por origen. Es el más importante
  // de la app y no estaba entrando a esta verificación.
  var pairs = [['ginger','all']];
  Object.keys(vol).sort().forEach(function(k){
    var a = k.split('|');
    if (vol[k] < 3000){ skipped.push(a[0]+' · '+a[1]+' ('+Math.round(vol[k]/30)+' cs históricas)'); return; }
    pairs.push([a[0], a[1]]);
  });
  if (skipped.length) console.log('orígenes marginales no verificados (volumen histórico chico): ' + skipped.join(' · '));

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
      prod:p, origen:(p==='ginger'&&origin==='all')?'TODOS (Buy Planner)':origin, vent:win,
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

  // ══ GINGER — lo que decide la compra ════════════════════════════════════
  // El Buy Planner NO compra contra el run-rate del modelo: usa dmEffectiveRunRateLbs(), que le
  // resta las cuentas quiet sacadas A MANO. Por defecto no se saca ninguna (la política es cubrir
  // a todos), así que los dos números deben coincidir. Si no coinciden, alguien sacó una cuenta:
  // es una decisión válida, pero tiene que verse acá y no aparecer como sorpresa en la compra.
  try {
    var mg = (typeof qaModelG === 'function') ? qaModelG() : null;
    if (!mg) {
      problems.push('no existe el modelo de producción de ginger (qaModelG) — el Buy Planner no tiene base');
    } else {
      var wG = (typeof dmWindow === 'function') ? dmWindow('ginger') : 13;
      var clG = mg.caseLb || 30;
      var rrModel = (wG === 3 ? mg.runRate3 : wG === 6 ? mg.runRate6 : mg.runRate13) / clG;
      var rrPlan = (typeof dmEffectiveRunRateLbs === 'function' && dmEffectiveRunRateLbs() != null)
                   ? dmEffectiveRunRateLbs() / clG : rrModel;
      var quitadas = [];
      try {
        (typeof qaQuietList === 'function' ? qaQuietList() : []).forEach(function(x){
          var pct = (typeof qaPct === 'function') ? qaPct(x.c) : 100;
          if (pct < 100) quitadas.push(x.c + ' (' + pct + '%)');
        });
      } catch(e){}

      console.log('%c GINGER — lo que decide la compra ', 'background:#0d5026;color:#fff;font-weight:700');
      console.log('ventana activa: ' + wG + ' semanas  ·  run-rate del modelo: ' + Math.round(rrModel) + ' cs/sem');
      console.log('lo que usa el Buy Planner: ' + Math.round(rrPlan) + ' cs/sem'
        + (Math.abs(rrPlan - rrModel) > 1
            ? '   ← ' + Math.round(rrModel - rrPlan) + ' cs sacadas a mano'
            : '   (sin ajustes manuales)'));
      if (quitadas.length) console.log('cuentas quiet sacadas del plan: ' + quitadas.join(' · '));

      // Inventario de ginger-Perú: vive en el otro store, así que el chequeo de arriba no lo ve.
      // Acá la convención es la OPUESTA: se carga lo LIBRE y la app le suma el committed.
      try {
        var stG = bpInvState();
        var libre = Object.keys(stG.rows || {}).reduce(function(t,k){ return t + (+((stG.rows[k]||{}).cases) || 0); }, 0);
        var wkNow = (typeof dmWeekKey === 'function') ? dmWeekKey(new Date()) : '';
        var commG = (typeof committedInvForWeek === 'function') ? (committedInvForWeek(wkNow, 'ginger') || 0) : 0;
        console.log('inventario ginger-Perú: libre (cargado) ' + Math.round(libre)
          + '  + committed ' + Math.round(commG) + '  = gross ' + Math.round(libre + commG)
          + '   (' + Object.keys(stG.rows || {}).length + ' lots)');
        if (libre <= 0) problems.push('ginger-Perú: no hay inventario cargado — el plan compraría contra stock 0');
        var covG = (rrPlan > 0) ? (libre / rrPlan) : 0;
        console.log('cobertura con lo libre: ' + (Math.round(covG * 10) / 10) + ' semanas');
      } catch(e){ console.log('no se pudo leer el inventario de ginger-Perú: ' + e.message); }
    }
  } catch(e){ console.log('no se pudo evaluar el plan de ginger: ' + e.message); }

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
  // Se compara POR PRODUCTO, no todo junto: el cargador descarta a propósito las filas
  // convencionales, los productos que no son los nuestros (Ginger Juice incluido) y los ítems
  // sin peso parseable en el nombre ("4CT"). Un total contra otro total nunca iba a cuadrar.
  // Filtrá el reporte a UN producto y compará esa fila.
  // Se compara por BILLABLE UNITS y GROSS SALES, columnas tal cual del reporte. Las libras NO:
  // son derivadas ((units ÷ Billable UOM Ratio) × lb por unidad, parseado del nombre del ítem),
  // así que medirían nuestra conversión y no el dato de origen.
  var byWk = {}, credits = {};
  _dmRawAll.forEach(function(r){
    var w = wkOf(r.d), pr = r.prod || 'ginger';
    if (r.type && r.type !== 'Sale'){                       // CREDIT / RETURN: van aparte
      var cc = credits[w] || (credits[w] = { u:0, gs:0 });
      cc.u += (r.units || 0); cc.gs += (r.gs || 0);
      return;
    }
    var o = byWk[w] || (byWk[w] = {});
    var e = o[pr] || (o[pr] = { u:0, gs:0 });
    e.u += (r.units || 0); e.gs += (r.gs || 0);
  });
  var p2 = function(n){ return (n < 10 ? '0' : '') + n; };
  var endOf = function(w){ var d = new Date(w + 'T12:00:00'); d.setDate(d.getDate() + 6);
    return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate()); };
  var weeks3 = Object.keys(byWk).sort().slice(-3);

  var lvl3 = [];
  weeks3.forEach(function(w){
    PRODS.forEach(function(pr){
      var e = (byWk[w] || {})[pr];
      if (!e || (!e.u && !e.gs)) return;
      lvl3.push({ desde:w, hasta:endOf(w), producto:pr,
                  BILLABLE_UNITS:Math.round(e.u), GROSS_SALES:Math.round(e.gs) });
    });
  });

  console.log('%c NIVEL 3 — contra WholesaleWare (comparación manual) ', 'background:#0d5026;color:#fff;font-weight:700');
  console.log('Sales By Account Report → filtro TARGET FULFILLMENT DATE con el rango desde→hasta.');
  console.log('Es ese campo y no otro: es el que lee el cargador (r["Target Fullfillment Date"]).');
  console.log('Filtrá el reporte a UN producto y compará BILLABLE UNITS y GROSS SALES de esa fila.');
  console.log('En el reporte: solo Type = Sale, solo ORGANICO (lo convencional la app no lo carga).');
  console.table(lvl3);

  // Notas de crédito y devoluciones: están en el archivo y el reporte las muestra, pero NO entran
  // al modelo de demanda. Si el total del reporte no cierra por poco, casi siempre es esto.
  var cr = Object.keys(credits).filter(function(w){ return weeks3.indexOf(w) >= 0; })
                 .map(function(w){ return { desde:w, hasta:endOf(w),
                   credito_devol_units:Math.round(credits[w].u), credito_devol_gross:Math.round(credits[w].gs) }; });
  if (cr.length){
    console.log('Créditos y devoluciones de esas semanas — están en el reporte pero NO en la demanda:');
    console.table(cr);
  }

  // Lo que el cargador dejó afuera a propósito, con su motivo. Estas filas SÍ están en el reporte.
  if (typeof _dmRecon !== 'undefined' && _dmRecon){
    var dropped = [];
    Object.keys(_dmRecon).forEach(function(pr){
      var d = _dmRecon[pr];
      if (!d) return;
      if (d.dropWeight || d.dropZeroUnit || d.dropNoDate || d.dropMixedOrigin){
        dropped.push({ producto:pr, filas_cargadas:d.kept,
                       sin_peso_en_el_nombre:d.dropWeight || 0, gross_de_esas:Math.round(d.dropGross || 0),
                       sin_unidades:d.dropZeroUnit || 0, sin_fecha:d.dropNoDate || 0,
                       origen_mezclado:d.dropMixedOrigin || 0 });
      }
    });
    if (dropped.length){
      console.log('Filas descartadas a propósito (histórico completo, no solo estas semanas) — están en el reporte:');
      console.table(dropped);
    }
  }

  console.log('%c RESULTADO ', 'background:#0d5026;color:#fff;font-weight:700');
  if (!problems.length) console.log('✓ Sin problemas en los niveles 1 y 2. Falta tu comparación manual del nivel 3.');
  else problems.forEach(function(x){ console.log('✗ ' + x); });
})();
