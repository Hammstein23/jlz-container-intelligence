// ── Cierre del día: qué le falta al pipeline de órdenes ────────────────────
// Pegar en la consola del navegador con la app abierta. Sale del comando /cierre.
//
// No necesita nada de afuera: revisa el pipeline contra sí mismo y contra el calendario.
// Encuentra lo que se desactualiza solo — una orden que zarpó y sigue en Contracted, una
// que llegó y sigue En tránsito, fechas que faltan, costos sin cargar. Todo eso mueve el
// Buy Planner y el Simulator, que leen este pipeline para saber qué viene en camino.

(function(){
  'use strict';
  if (typeof getOrders !== 'function'){ console.log('Abrí la app primero.'); return; }
  var ORD = (getOrders() || []).filter(function(o){ return o && o.jlzPo; });
  if (!ORD.length){ console.log('No hay órdenes cargadas.'); return; }

  var p2 = function(n){ return (n < 10 ? '0' : '') + n; };
  var todayISO = (function(){ var d = new Date();
    return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate()); })();
  var days = function(iso){                       // días desde/hasta una fecha (negativo = futuro)
    if (!iso) return null;
    var s = String(iso).slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return Math.round((new Date(todayISO + 'T12:00:00') - new Date(s + 'T12:00:00')) / 864e5);
  };
  var prod = function(o){ return (typeof _ordProd === 'function') ? _ordProd(o) : (o.product || 'ginger'); };
  var eta  = function(o){ return o.arrivalActual || o.arrivalEstimated || o.etaActual || o.etaEstimated || ''; };
  var etd  = function(o){ return o.etdActual || o.etdEstimated || ''; };

  var live = ORD.filter(function(o){ return o.status !== 'Cancelled'; });
  var issues = [];
  var add = function(sev, po, qué, detalle){ issues.push({ sev:sev, po:po, problema:qué, detalle:detalle }); };

  // 1. Estado que se quedó atrás. Es lo que más se desactualiza solo: nadie vuelve a tocar
  //    una orden que ya zarpó, y el pipeline la sigue mostrando como si no hubiera salido.
  live.forEach(function(o){
    var dEta = days(eta(o)), dEtd = days(etd(o));
    if (o.status === 'Contracted' && dEtd != null && dEtd > 0)
      add('alta', o.jlzPo, 'zarpó hace ' + dEtd + ' d y sigue en Contracted', 'ETD ' + String(etd(o)).slice(0,10));
    if (o.status === 'Contracted' && dEta != null && dEta > 0)
      add('alta', o.jlzPo, 'su llegada ya pasó y sigue en Contracted', 'ETA ' + String(eta(o)).slice(0,10));
    if (o.status === 'In Transit' && dEta != null && dEta > 2)
      add('alta', o.jlzPo, 'llegó hace ' + dEta + ' d y sigue En tránsito', 'ETA ' + String(eta(o)).slice(0,10));
  });

  // 2. Sin fecha de llegada: el Buy Planner no la puede poner en ninguna semana, así que
  //    esa mercadería simplemente no existe para el plan.
  live.forEach(function(o){
    if (o.status === 'Arrived' || o.status === 'Docs closed') return;
    if (!eta(o)) add('alta', o.jlzPo, 'sin fecha de llegada — el plan no la ve', o.status + ' · ' + prod(o));
  });

  // 3. Costos que faltan. No frenan el plan de compra, pero rompen el costo puesto en almacén.
  live.forEach(function(o){
    var falta = [];
    if (!(parseFloat(o.cases) > 0)) falta.push('cases');
    if (!(parseFloat(o.cifPriceCase) > 0) && !(parseFloat(o.cifTotal) > 0)) falta.push('CIF');
    if (o.mode === 'sea' && !(parseFloat(o.freightUsd) > 0)) falta.push('flete');
    if (falta.length) add('media', o.jlzPo, 'faltan datos: ' + falta.join(', '), o.status + ' · ' + prod(o));
  });

  // 4. POs duplicadas: dos filas con el mismo número inflan el pipeline al doble.
  var vistos = {};
  ORD.forEach(function(o){
    var k = String(o.jlzPo).trim();
    if (vistos[k]) add('alta', k, 'PO duplicada en el pipeline', 'aparece ' + (++vistos[k]) + ' veces');
    else vistos[k] = 1;
  });

  // 5. Lotes de inventario cuya PO no está en el pipeline. Ese stock existe en cámara pero
  //    su orden no, así que no tiene costo ni trazabilidad.
  try {
    var enPipe = {}; ORD.forEach(function(o){ enPipe[String(o.jlzPo).trim()] = 1; });
    var st = (typeof bpInvState === 'function') ? bpInvState() : null;
    if (st && st.rows && typeof bpCcId === 'function'){
      var idPorOrden = {}; ORD.forEach(function(o){ idPorOrden[bpCcId(o)] = o.jlzPo; });
      Object.keys(st.rows).forEach(function(id){
        if (!idPorOrden[id]) add('media', id, 'lote de inventario sin orden en el pipeline', 'ginger-Perú');
      });
    }
    var ps = (typeof prodInvState === 'function') ? prodInvState() : null;
    if (ps) Object.keys(ps).forEach(function(pr){
      (ps[pr].lots || []).forEach(function(l){
        if (l && l.lot && !enPipe[String(l.lot).trim()] && !l.excluded)
          add('baja', l.lot, 'lote sin orden en el pipeline', pr + ' · ' + (l.cases||0) + ' cs');
      });
    });
  } catch(e){}

  // ── Salida ────────────────────────────────────────────────────────────────
  var orden = { alta:0, media:1, baja:2 };
  issues.sort(function(a,b){ return (orden[a.sev]-orden[b.sev]) || String(a.po).localeCompare(String(b.po)); });

  console.log('%c CIERRE DEL DÍA · ' + todayISO + ' ', 'background:#0d5026;color:#fff;font-weight:700');
  console.log(live.length + ' órdenes vivas · ' + (ORD.length - live.length) + ' canceladas');

  if (!issues.length) console.log('%c ✓ El pipeline está al día ', 'background:#065F46;color:#fff');
  else {
    console.log(issues.filter(function(i){ return i.sev==='alta'; }).length + ' para revisar hoy · '
              + issues.filter(function(i){ return i.sev!=='alta'; }).length + ' menores');
    console.table(issues);
  }

  // Lo que viene en camino, para cerrar el día sabiendo qué esperar.
  var llegando = live.filter(function(o){ var d = days(eta(o)); return d != null && d <= 0 && d >= -21
                                          && o.status !== 'Arrived' && o.status !== 'Docs closed'; })
                     .map(function(o){ return { po:o.jlzPo, producto:prod(o), estado:o.status,
                                                llega:String(eta(o)).slice(0,10), en_días:-days(eta(o)),
                                                cases:parseFloat(o.cases)||0 }; })
                     .sort(function(a,b){ return a.en_días - b.en_días; });
  if (llegando.length){ console.log('Llega en las próximas 3 semanas:'); console.table(llegando); }
  else console.log('No hay llegadas registradas en las próximas 3 semanas.');
})();
