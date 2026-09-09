// ── Poner en Arrived las órdenes cuya mercadería ya está en cámara ─────────────────────────
//
//   fetch('tests/orders-arrived.js?v='+Date.now()).then(r=>r.text()).then(eval)
//
// Corre en seco: dice qué cambiaría y no toca nada. Para aplicar:  jlzOrdersArrived(true)
//
// POR QUÉ HACE FALTA. El pipeline avanza solo en UN caso: cuando se guarda un contenedor en
// History (`advanceOrderFromContainer`). Ni la llegada de la mercadería, ni el import del
// Inventory Report, ni el calendario lo mueven. Así que una orden cuyo contenedor nunca se
// cargó en History se queda en Contracted o In Transit para siempre — y ahí se cuenta DOS
// veces: como stock en cámara y como mercadería en camino. Eso infla la cobertura del Buy
// Planner y del Simulator, que es exactamente el error que hace comprar de menos.
//
// El importer ya avisa cuál está así ("Received but still marked as on the way"), pero hay que
// arreglarlas de a una en Orders. Esto las arregla todas juntas y sincroniza con la hoja.

var jlzOrdersArrived = (function(){
  // POs con mercadería FÍSICA en cámara, leídos del Inventory Report del 2026-09-07 con el
  // parser de producción (tests/inv-report-check.py). Los W-lots quedan fuera: su número lleva
  // el PO de manufactura, que no es una orden de compra. Fecha = Received Date del lote.
  var FISICO = {
    '2260876':'2026-04-28', '2305351':'2026-05-08', '2305337':'2026-05-12', '2395076':'2026-06-09',
    '2439588':'2026-06-24', '2579010':'2026-08-06', '2587428':'2026-08-07', '2523058':'2026-08-20',
    '2597551':'2026-08-24', '2639212':'2026-08-28', '2620621':'2026-08-31', '2629655':'2026-09-03',
    '2667534':'2026-09-04'
  };
  var FUENTE = 'Inventory Report 2026-09-07';

  return function(apply){
    if(typeof getOrders !== 'function'){ console.log('Abrí la app primero.'); return; }
    var orders = getOrders() || [];
    if(!orders.length){ console.log('No hay órdenes cargadas.'); return; }

    var hoy = new Date(), p2 = function(n){ return (n<10?'0':'') + n; };
    var hoyISO = hoy.getFullYear() + '-' + p2(hoy.getMonth()+1) + '-' + p2(hoy.getDate());
    var dias = function(iso){
      var s = String(iso || '').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      return Math.round((new Date(hoyISO+'T12:00:00') - new Date(s+'T12:00:00'))/864e5);
    };
    // Misma resolución que usa el importer: PO propio o id.
    var buscar = function(po){
      for(var i=0;i<orders.length;i++){
        var o = orders[i];
        if(String(o.jlzPo||'') === String(po) || String(o.id||'') === String(po)) return i;
      }
      return -1;
    };

    var cambios = [], yaOk = [], noEstan = [], sospechosas = [];
    Object.keys(FISICO).forEach(function(po){
      var i = buscar(po);
      if(i < 0){ noEstan.push(po); return; }
      var o = orders[i];
      if(o.status === 'Cancelled'){ sospechosas.push(po + ' está Cancelled pero tiene stock físico'); return; }
      if(o.status === 'Arrived'){ yaOk.push(po); return; }
      cambios.push({ i:i, po:po, de:o.status, recibido:FISICO[po] });
    });

    // Lo que el calendario marca como vencido, pero sin stock físico que lo confirme: se REPORTA,
    // no se toca. Puede ser una orden que de verdad sigue navegando con la fecha corrida.
    orders.forEach(function(o){
      if(!o || o.status === 'Arrived' || o.status === 'Cancelled') return;
      if(FISICO[String(o.jlzPo||'')]) return;
      var d = dias(o.arrivalActual || o.arrivalEstimated || o.etaActual || o.etaEstimated);
      if(d != null && d > 2) sospechosas.push('PO ' + (o.jlzPo||o.id) + ' — ' + o.status +
        ', su llegada fue hace ' + d + ' d y no tiene lote en cámara');
    });

    console.log('── Órdenes con mercadería física en cámara (' + FUENTE + ') ──');
    console.log('   ya en Arrived: ' + yaOk.length + '   ·   a corregir: ' + cambios.length +
                '   ·   sin orden en el pipeline: ' + noEstan.length);
    if(cambios.length){
      console.log('');
      cambios.forEach(function(c){
        console.log('   PO ' + c.po + '   ' + c.de + '  →  Arrived   (llegó el ' + c.recibido + ')');
      });
    }
    if(noEstan.length){
      console.log('');
      console.log('   ⚠ sin orden cargada: ' + noEstan.join(', '));
      console.log('     ese stock es invisible para el plan de compra hasta que la orden exista.');
    }
    if(sospechosas.length){
      console.log('');
      console.log('   Para revisar a mano (NO se tocan):');
      sospechosas.forEach(function(s){ console.log('     · ' + s); });
    }

    if(!cambios.length){ console.log('\nNada que corregir.'); return; }
    if(!apply){
      console.log('\nEsto fue en seco. Para aplicarlo:  jlzOrdersArrived(true)');
      return;
    }

    // Forward-only, igual que advanceOrderFromContainer: nunca pisa un arrivalActual puesto a
    // mano y nunca retrocede un estado.
    cambios.forEach(function(c){
      var o = orders[c.i];
      o.status = 'Arrived';
      if(!o.arrivalActual) o.arrivalActual = c.recibido;
      if(!o.etaActual)     o.etaActual     = o.etaEstimated || c.recibido;
    });
    saveOrders(orders);
    window._ordersData = orders;
    // saveOrders() NO sincroniza: sin esto el cambio vive solo en este navegador.
    if(typeof pushOrdersToSheet === 'function'){
      try{ pushOrdersToSheet(); console.log('\n✓ ' + cambios.length + ' órdenes en Arrived y mandadas a la hoja.'); }
      catch(e){ console.warn('Se guardaron local, pero pushOrdersToSheet falló:', e); }
    } else {
      console.log('\n✓ Guardadas localmente. No encontré pushOrdersToSheet — abrí Orders y revisá el sync.');
    }
    if(typeof renderOrders === 'function'){ try{ renderOrders(); }catch(e){} }
  };
})();

jlzOrdersArrived(false);
