// Auditoría de los números de compra, contra el modelo VIVO.
// Se pega en la consola de la app (ver Paso 4b del runbook). No escribe nada: solo lee y recalcula.
//
//   fetch('tests/buy-audit-console.js?v='+Date.now()).then(r=>r.text()).then(eval)
//
// Cada eslabón se recalcula por un camino propio —los lotes, las órdenes, el modelo— y se compara
// contra lo que la app reporta. Un ✗ es una discrepancia real; no hay tolerancia salvo el redondeo.
(function(){
  var V='buy-audit v2 · 2026-09-10';
  console.log('%c '+V+' ','background:#0d5026;color:#fff;padding:2px 6px;font-weight:700');
  var fails=0, rows=[];
  var near=function(a,b,tol){ return Math.abs((a||0)-(b||0)) <= (tol==null?0.51:tol); };
  var mark=function(nombre, mio, app, tol){
    var ok=near(mio,app,tol);
    if(!ok){ fails++; console.warn('  ✗ '+nombre+' · yo '+(Math.round((mio||0)*100)/100)+'  ·  la app '+(Math.round((app||0)*100)/100)); }
    return ok;
  };
  var f2=function(x){ return Math.round((x||0)*100)/100; };
  // Mismo criterio que _invmKnownOrigin en la app, escrito acá aparte a propósito: si el día de
  // mañana alguien lo cambia de un solo lado, este chequeo lo tiene que gritar.
  var conocido=function(p,o){
    if(!o) return false;
    try{ if((invmOriginsFor(p)||[]).indexOf(o)>-1) return true; }catch(e){}
    try{ var sup=(((typeof PRODUCTS==='object'&&PRODUCTS[p])||{}).suppliers)||[];
         for(var i=0;i<sup.length;i++) if(String((sup[i]||{}).origin||'')===o) return true; }catch(e){}
    return false;
  };

  // ── Los cuatro del store product-aware ───────────────────────────────────────────────────────
  ['turmeric','garlic','shallots','ginger'].forEach(function(p){
    (invmOriginsFor(p)||[]).forEach(function(o){
      var s, g;
      try{ s=invmProductStats(p,o); g=invmBuySuggestion(p,o); }catch(e){ console.warn('  ✗ '+p+'|'+o+' reventó: '+e); fails++; return; }
      if(!s) return;
      var tag=p+'|'+o;

      // 1 · lo físico, lote por lote, sin los excluidos
      var lots=((prodInvFor(p)||{}).lots)||[];
      var mine=lots.filter(function(l){ return l && !l.excluded && (o==='all' || invmOriginMatch(l,o)); })
                   .reduce(function(t,l){ return t+(parseFloat(l.cases)||0); },0);
      mark(tag+' · on-hand', mine, s.onHandCases);
      mark(tag+' · disponible = on-hand − committed', mine-(s.committedCases||0), s.availCases);

      // 2 · lo que ya viene, orden por orden, neto de contra-orden
      var inc=0;
      (getOrders()||[]).forEach(function(x){
        if(_ordProd(x)!==p) return;
        if(!(x.status==='Contracted'||x.status==='In Transit')) return;
        if(!(x.arrivalActual||x.arrivalEstimated||x.etaActual||x.etaEstimated)) return;
        var oo=(typeof _ordOrigin==='function')?_ordOrigin(x):(x.origin||'');
        // Los orígenes conocidos son los lotes MÁS los proveedores: ginger-Perú no tiene lote en este
        // store y sin los proveedores sus contenedores se contaban como Hawaii.
        if(o&&o!=='all'&&oo&&oo!==o&&conocido(p,oo)) return;
        var ds=0; try{ ds=directShipTotal(x.jlzPo)||0; }catch(e){}
        inc+=Math.max(0,(parseFloat(x.cases)||0)-ds);
      });
      mark(tag+' · en camino (neto de contra-orden)', inc, s.incomingCases);
      mark(tag+' · posición = libre + en camino', s.availCases+inc, s.posCases);

      // 3 · la demanda de la ventana activa, con la merma del lado del consumo
      var m=invmProductModel(p,o), win=s.win;
      var rr=(s.demandOverride!=null&&s.demandOverride>0) ? s.demandOverride*s.caseLb : invmRunRateLbs(m,win);
      var draw=(rr/s.caseLb)/(1-Math.max(0,Math.min(60,s.shrinkPct||0))/100);
      mark(tag+' · run-rate ventana '+win+'wk', rr, s.weeklyLbs, 1.01);
      mark(tag+' · lo que sale de cámara', draw, s.weeklyCasesBuy, 0.05);

      // 4 · el objetivo
      var tgt=s.leadWks + (s.cv>0&&s.leadWks>0 ? s.z*s.cv*Math.sqrt(s.leadWks) : 0);
      mark(tag+' · objetivo = lead + colchón', tgt, s.targetWks, 0.005);

      // 5 · y la compra, por los DOS caminos
      var buy=Math.max(0, Math.ceil(tgt*draw - (s.availCases+inc)));
      mark(tag+' · a comprar (panel)', buy, s.orderCases);
      if(g) mark(tag+' · a comprar (sugerencia)', buy, g.buy);

      rows.push({ producto:tag, libre:Math.round(s.availCases), camino:Math.round(inc),
                  posicion:Math.round(s.posCases), 'cs/sem':f2(draw), ventana:win+'wk',
                  'cobertura wk':f2(s.coverPosWks), 'objetivo wk':f2(s.targetWks),
                  comprar:s.orderCases, 'ordenar antes de':(g&&g.orderBy)||'—', llega:(g&&g.arrives)||'—' });
    });
  });

  // ── ginger-Perú vive en el Buy Planner, no en este store ─────────────────────────────────────
  var d=(typeof window!=='undefined')?window._bpDigest:null;
  if(!d){ console.warn('  · ginger-Perú: abrí el Buy Planner una vez y volvé a correr esto'); }
  else {
    var st=bpInvState(), bruto=Object.keys(st.rows||{}).reduce(function(t,k){ return t+(+((st.rows[k]||{}).cases)||0); },0);
    // El Buy Planner arranca del BRUTO (stockCasesGross = stockCases) y consume el committed semana
    // a semana; si esto no cierra, se cargó el libre en vez de lo físico — el error del Paso 3b.
    mark('ginger|Peru · bruto cargado = el del plan', bruto, d.stockCases, 1.01);
    var R=d.rec||{};
    // El objetivo de ginger NO es lead+colchón: es lead + cadencia entre órdenes (order-up-to).
    if(R.leadWks!=null) mark('ginger|Peru · cajas a pedir = order-up-to − proyectado', 
        Math.max(0,(R.orderUpTo||0)-(R.projAtArrival||0)), R.netNeeded||0, 1.01);
    if(R.raw!=null && R.cap!=null)
      console.log('  ginger|Peru · '+f2(R.raw)+' contenedores crudos → quiere '+R.wanted
                 +' → techo de vida útil '+R.cap+' ('+(R.shelfWks||'?')+' sem) → recomienda '+R.containers
                 +(R.cappedBy?(' · limitado por '+(R.cappedBy==='shelf'?'la vida útil':'el redondeo')):''));
    rows.push({ producto:'ginger|Peru', libre:Math.round(d.stockCases||0), camino:'—',
                posicion:'—', 'cs/sem':f2(d.weeklyDemand),
                ventana:'—', 'cobertura wk':f2(d.coverage), 'objetivo wk':f2((R.leadWks||0)+(R.cadence||0)),
                comprar:(R.netCases!=null?(R.containers+' cont · '+Math.round(R.netCases)+' cs'):'—'),
                'ordenar antes de':(d.seaDeadline||d.airDeadline||'—'), llega:'—' });
  }

  console.table(rows);
  if(fails) console.log('%c '+fails+' discrepancia(s) — arriba, con los dos números ','background:#7f1d1d;color:#fff;padding:2px 6px');
  else      console.log('%c todos los eslabones cierran ','background:#0d5026;color:#fff;padding:2px 6px');
})();
