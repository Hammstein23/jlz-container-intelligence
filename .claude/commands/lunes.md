---
description: Rutina completa de los lunes — cargar datos, inventario de los 4 productos y verificar
---

# Lunes — actualización semanal

Juan baja los dos reportes. **Todo lo demás lo hacés vos.** Ejecutá de punta a punta sin
pedir confirmación entre pasos, salvo que algo no cuadre — ahí **pará y diagnosticá**, nunca
sigas para "ver si se arregla más adelante". Al final, una tabla corta: qué se cargó, cómo
quedó el inventario, si la verificación dio limpia, y qué conviene comprar.

**Dos reglas que no se rompen:**

1. **Excel antes que committed.** Al revés, una orden se cuenta dos veces hasta el refresh siguiente.

2. **Los cinco productos se cargan igual: las cajas BRUTAS, lo que hay físicamente.**

   | Store | Qué cargás | Qué hace la app con el committed |
   |---|---|---|
   | **ginger-Perú** (`jlz_bp_inv_v2`) | las cajas **BRUTAS** (con las reservadas) | lo **resta**: `free = stock − committed` |
   | los otros cuatro (`jlz_prod_inv_v1`) | las cajas **BRUTAS** (con las reservadas) | lo **resta**: `available = onHand·shrink − committed` |

   Regla de bolsillo: **cargás lo que hay en la cámara, siempre.** El paso 3b lo verifica.

   > **Cambió el 2026-09-03.** Antes ginger-Perú se cargaba con las cajas LIBRES y la app le sumaba
   > el committed — una convención opuesta a la de los otros cuatro, heredada de cuando ginger era el
   > único producto. Ya no: `jlz_bp_inv_v2` guarda lo físico y la migración desde v1 corrió sola.
   > Si ves un lote con decimales, es el reparto proporcional de esa migración; se corrige recargando.

---

## Paso 0 — Ubicar los archivos

```bash
ls -lt ~/Downloads/*.xlsx ~/Desktop/*.xlsx 2>/dev/null | head
```

Necesitás `Sales By Account Report-<fecha>.xlsx`, `Unshipped Sales Order Report-<fecha>.xlsx`,
`Inventory Report-<fecha>.xlsx` y `Purchase_Transactions-<fecha>.xlsx` (este último para el Paso 3c).

- Si el más nuevo **no es de hoy o de ayer**, pará y avisá: un export viejo mueve el `dataMax`
  para atrás y ensucia todo lo que sigue.
- Ignorá los archivos que empiezan con `~$` — son el lock de Excel, no datos.

## Paso 1 — Cargar las ventas

Juan sube el **Sales By Account** en la pestaña **Demand**. Esto avanza el `dataMax`, que es la
frontera entre "facturado" y "abierto".

## Paso 2 — Re-importar el committed

Juan sube el **Unshipped Sales Order Report** en Demand → **Committed orders** → import.
El importador re-filtra contra el `dataMax` nuevo y saca solo lo que ya se facturó.

El reporte trae una columna **`Status`** (`PICKING` / `SHIPPED`) y el importador la lee: lo que dice
`SHIPPED` entra ya marcado como despachado, así que **no descuenta stock ni cuenta como demanda**.
Antes se ignoraba y había que marcarlo a mano — así se coló la orden de Sol-ti de 1.000 cajas el
2026-09-03. En el archivo de ese día, 21 de 76 filas decían `SHIPPED`.

Una marca puesta a mano **sobrevive** al re-import aunque el reporte diga `PICKING`.

Cubre los 4 productos, pero **ginger solo importa `OG-GIN-30Lbs-PR`** (Perú, caja de 30 lb):
es una regla legacy deliberada de la que depende el plan de compra de ginger. **El committed de
ginger-Hawaii NO entra por acá** — si hace falta, se carga a mano.

### Las órdenes vencidas y sin facturar NO se dan por buenas — confirmá cada una

El import reporta al final `N pending invoice`. Son órdenes cuya **fecha de entrega ya pasó y
siguen sin facturar**, y son exactamente el caso peligroso: **la mercadería ya salió del almacén
pero WholesaleWare no lo registró**. La orden se queda en *Picking*, sigue apareciendo en el
Unshipped Report, y el app la cuenta como committed contra un stock que **ya no la tiene**. El
mismo producto se descuenta dos veces y el stock libre queda hundido.

> **Pasó el 2026-09-03 con Sol-ti** (orden 2618081, **1.000 cajas** — el 46% del stock físico):
> el plan mostró **1.324 cajas libres cuando había 2.184**, y la cobertura 1,7 semanas en vez de
> 2,4. La orden estaba abierta en WholesaleWare, pero la mercadería ya se había ido.

**Que la orden esté abierta en WholesaleWare no prueba que el producto esté en el almacén.** Son
dos cosas distintas y hay que verificar la segunda:

```javascript
// Órdenes committed con la entrega ya vencida — candidatas a "ya salió, falta facturar".
(function(){
  var hoy = dmISOLocal ? dmISOLocal(new Date()) : new Date().toISOString().slice(0,10);
  var wk  = dmWeekKey(new Date());
  var rows = bpInvState().rows || {};
  var stock = Object.keys(rows).reduce(function(s,k){ return s+(+((rows[k]||{}).cases)||0); }, 0);
  var v = getCommitted().filter(function(c){
      return c.type==='inv' && c.wk>=wk && c.date && c.date<=hoy; })
    .sort(function(a,b){ return b.cases-a.cases; });
  if(!v.length){ console.log('%c OK · ninguna orden committed vencida ','background:#0d5026;color:#fff'); return; }
  var pesa = function(c){ return stock>0 && c.cases/stock >= 0.10; };
  v.filter(pesa).forEach(function(c){
    console.warn('FRENA EL PASO · '+(c.customer||'?')+' · '+c.cases+' cs ('+
                 Math.round(c.cases/stock*100)+'% del stock) · '+(c.product||'ginger')+
                 ' · entrega '+c.date+' vencida · orden '+(c.orderNo||'?'));
  });
  var chicas = v.filter(function(c){ return !pesa(c); });
  if(chicas.length) console.log('  y '+chicas.length+' vencidas chicas (<10% del stock): '+
    chicas.map(function(c){ return (c.customer||'?')+' '+c.cases+'cs'; }).join(', '));
})();
```

Por cada una, preguntale a Juan: **¿esa mercadería ya salió del almacén?**

- **Si ya salió** → no es committed. Sacala del store antes de cargar el inventario, o el stock
  libre queda corto por esa cantidad. El arreglo de fondo es de **WholesaleWare** (facturarla o
  marcarla despachada); mientras no se haga, **el lunes siguiente vuelve a entrar**.
- **Si sigue en cámara** → es committed legítimo, se cuenta normal.

Cualquiera que pese más del ~10% del stock **frena el paso**: no cargues el inventario hasta
resolverla, porque mueve el plan de compra entero.

## Paso 3 — Inventario físico de los 4 productos

Fuente: el **Inventory Report** (XLS) que baja Michael, del **mismo día** que los otros dos reportes.
El **Sales Desk** queda de cross-check: si no cuadra, se anota la discrepancia. (Así se cazó el lote
de turmeric que faltaba el 2026-09-07 — recibido el sábado, sin digitar por el feriado.)

### La fórmula — probada lote por lote

El físico de un lote **no** es la columna `Qty on Hand`. Esa columna engaña: en unos lotes es bruta
y en otros neta. Es:

> **`físico = si el lote es W-lot → Qty on Hand ; si no → max(0, Qty Received − Qty Sold for Lot)`**

Verificado el 2026-09-08 contra el Sales Desk: **21 de 21 lotes dan exacto**, W-lots incluidos.

Son dos reglas porque `Sold` significa dos cosas: en un lote normal es un **despacho real** (la caja
se fue), así que el físico es recibido menos vendido. En un W-lot es la **venta interna a JLZ Produce
Manufacturing** al reempacar — la caja **no se fue**, solo cambió de presentación — así que sigue
contando por `Qty on Hand`.

### El camino normal: el importer de la app

**Inventory → botón `Import Inventory Report` → elegís el XLS → Confirm.** Eso es todo: los cinco
productos entran de una, en los dos stores que corresponden, con la fórmula de arriba aplicada por
código. No hay que tipear cajas ni pegar snippets — que era de donde salían los errores.

Antes de escribir nada muestra un preview con **antes → después** por producto y los avisos que
importan:

| Aviso | Qué significa |
|---|---|
| **POs que no están en Orders** | ese stock no se puede cargar (la llave de ginger-Perú es el PO). Cargalos en Orders y reimportá. |
| **Recibido pero aún "en camino"** | el PO ya tiene lote físico y sigue `Contracted`/`In Transit`: se cuenta **dos veces** (stock + incoming) e infla la cobertura del Buy Planner y del Simulator. Pasalo a `Arrived`. |
| **Marcas "excluded" preservadas** | el reemplazo total no las pisa; si las pisara, el lote volvería a contar como stock. |
| **Excluidos que ya no están** | el almacén los dio de baja, se van solos. |
| **Lote y vendor no coinciden** | cambió algo en WholesaleWare; el lote igual carga, pero miralo. |

Si **ningún** PO de ginger matchea con Orders, el importer **bloquea** el Confirm en vez de avisar:
confirmar ahí dejaría el ginger en cero y de ese número cuelga el plan de compra entero.

> **El desglose por SKU no es decorativo.** Colossal y Super Jumbo comparten producto, origen y pack
> de 30 lb, pero son líneas distintas: el preview las muestra separadas porque confundirlas puso el
> garlic disponible en 0 el 2026-09-03.

Los snippets de consola de más abajo quedan como **plan B** — si el XLS viene raro o hay que forzar
un número a mano. El importer es el camino por defecto.

### Qué se carga y qué no

**Los cinco igual: cargá las cajas BRUTAS**, todas las físicas incluidas las reservadas.
La app resta el committed en cada caso, así que las reservadas se cuentan **una sola vez**.

Cargar el libre **hunde** el stock: las reservadas se descontarían dos veces y el plan pediría
comprar de más. *(Pasó el 2026-09-08: se cargó el neto — 2 132, sin W-lots — en una app que espera
bruto, y el ginger libre salió **1 165 en vez de 2 250**.)*

Excluir siempre:
- **vLot** — lotes virtuales, no son producto.
- Las presentaciones **5, 10 y 20 lb**: son producto trabajado, no la compra. La compra real es
  **30 lb** (ginger, turmeric, garlic) y **50 lb** (shallots, en saco).

**Los W-lots (`W2881A...`) SÍ se cargan.** Hasta el 2026-09-08 este runbook decía lo contrario, y
**estaba mal** — era la causa del ginger subcontado. Son las cajas que ya reempacaste (marca River
Road, vendedor **JLZ Produce Manufacturing**): siguen **físicamente en cámara**, solo cambiaron de
presentación. Son justamente "las reservadas" que hacen que el número sea BRUTO. El committed las
netea **una sola vez**, que es exactamente lo que espera el Buy Planner (`stockCasesGross = stockCases`,
línea ~16697).

Identificarlos es seguro porque hay **dos señales que siempre coinciden**: el lote matchea `/^W\d/`
**y** el Vendor es `JLZ Produce Manufacturing`. Verificado en 155 lotes de dos exports: 100%.

**Fechas de recepción:** WholesaleWare → Purchase Orders (scheduled delivery date). Alimentan los
días de almacenamiento y el FEFO. **Nunca las inventes** — una fecha inventada mueve la merma
estimada. Si no la encontrás, decilo y dejala vacía.

### Son DOS stores distintos

| Qué | Dónde | Llave del lot |
|---|---|---|
| **ginger-Perú** | `jlz_bp_inv` → `bpInvState().rows` | número de **PO** (`bpCcId`), armado desde **Orders** |
| ginger-Hawaii, turmeric, garlic, shallots | `jlz_prod_inv_v1` → `prodInvState()` | lot con origen, proveedor, costo, fecha |

Usar el snippet equivocado **no da error**: escribe en el store que no es y el producto se queda
con el inventario de la semana pasada.

### Plan B · Snippet A — solo ginger-Perú (por PO, cajas BRUTAS)

```javascript
(function(){
  // Lotes REALES: por PO. Un W-lot NO va acá — abajo.
  var LOTS = [
    // {po:'2523058', cases:1152}, {po:'2629655', cases:980},
  ];
  // W-LOTS: van aparte, con su número de lote. Su PO es de MANUFACTURA y nunca está en Orders,
  // así que buscarlos por PO los descarta — así se perdían 1.189 de 3.213 cajas (37% del bruto).
  var WLOTS = [
    // {lot:'W2939A2674126', cases:700, received:'2026-09-05', costCase:35.56},
  ];
  var orders = (typeof getOrders==='function' ? getOrders() : []);
  var st = bpInvState(), rows = {}, matched = [], missing = [];
  LOTS.forEach(function(d){
    var o = orders.find(function(x){ return String(x.jlzPo||'')===String(d.po) || String(x.id||'')===String(d.po); });
    if(!o){ missing.push(d.po); return; }
    rows[bpCcId(o)] = { cases: Math.max(0, parseInt(d.cases)||0) };
    matched.push(d.po+' ('+d.cases+' cs)');
  });
  WLOTS.forEach(function(w){
    rows['W:'+w.lot] = { cases: Math.max(0, parseInt(w.cases)||0),
      repack: { lot:w.lot, po:String(w.lot).replace(/^W\w+?(\d{6,})$/,'$1'),
                received:w.received||'', costCase:+w.costCase||0,
                supplier:'JLZ Produce Manufacturing' } };
    matched.push(w.lot+' ('+w.cases+' cs, reempaque)');
  });
  st.rows = rows;                              // REEMPLAZO TOTAL (preserva sellLb y rates)
  bpInvSave(st);
  if(typeof renderInventory==='function') renderInventory();
  console.log('%c ginger-Peru: '+matched.length+' lots ','background:#0d5026;color:#fff;padding:2px', matched);
  if(missing.length) console.warn('POs que NO están en Orders — cargalos ahí primero:', missing);
})();
```

Un PO de **compra** que no esté en Orders no se puede cargar como lot. Si aparece en `missing`,
cargalo en Orders y volvé a correr.

> **Los W-lots van en `WLOTS`, nunca en `LOTS`.** Ponerlos en `LOTS` los manda a `missing` y se
> pierden en silencio — y el committed que esos mismos W-lots sirven **sí** se resta igual. Ese
> doble descuento dejaba el ginger libre en **1.057 cuando eran 2.246**. El importer de la app
> hace esta separación solo; el plan B depende de que la hagas vos.

### Plan B · Snippet B — los otros cuatro

```javascript
(function(){
  var PROD = 'turmeric';                       // ginger | turmeric | garlic | shallots
  var LOTS = [
    // {lot:'2620621', origin:'Fiji', supplier:'Sbimal', cases:150, avgCost:72, received:'2026-08-28', sku:'OG-TUR-30Lbs-PR-FJ'},
  ];
  var st = prodInvState();
  if(!st[PROD]) st[PROD] = { serviceLevel:95, demandOverride:null, lots:[] };
  // Las marcas "excluded" tienen que sobrevivir al reemplazo: esos lotes siguen vivos en
  // WholesaleWare, así que el Sales Desk los devuelve, y sin esto volverían a contar como stock.
  var wasExcl = {};
  (st[PROD].lots||[]).forEach(function(l){ if(l && l.excluded) wasExcl[String(l.lot)] = 1; });
  var restored = [];
  LOTS.forEach(function(l){ if(wasExcl[String(l.lot)]){ l.excluded = true; restored.push(l.lot); } });
  var gone = Object.keys(wasExcl).filter(function(k){
    return !LOTS.some(function(l){ return String(l.lot) === k; }); });

  var prev = (st[PROD].lots||[]).reduce(function(s,l){ return s+(+l.cases||0); }, 0);
  st[PROD].lots = LOTS;                        // REEMPLAZO TOTAL, no merge
  prodInvSave(st);
  if(typeof renderInventory==='function') renderInventory();

  var now = LOTS.reduce(function(s,l){ return s+(+l.cases||0); }, 0);
  console.log('%c '+PROD+': '+prev+' → '+now+' cs  ('+LOTS.length+' lots) ',
              'background:#0d5026;color:#fff;padding:2px');
  if(restored.length) console.log('  marcas "excluded" preservadas:', restored);
  if(gone.length)     console.log('  excluidos que ya NO están en el Sales Desk (el almacén los dio de baja):', gone);
})();
```

**Copiá también el `sku`** (columna SKU del Sales Desk). Es lo que deja restar el committed de la línea
correcta: Colossal y Super Jumbo son los dos garlic de 30 lb, pero son productos distintos, y sin el SKU
las 140 cajas comprometidas de Colossal se descuentan del Super Jumbo que tenés en cámara — que fue lo que
puso el disponible de garlic en 0 el 2026-09-03. Sin `sku` el código cae al peso del pack, que ya alcanza
para turmeric y shallots pero no distingue las dos líneas de garlic.

Repetí el B por producto. **Reemplazo total en los dos**: lo que ya no aparece en el Sales Desk se va.
Con POs nuevos, hacé antes un dry-run (mismo snippet con `console.table` y sin guardar).

## Paso 3b — El chequeo que atrapa el doble descuento

Después de cargar, **el stock que muestra la app tiene que dar igual a las cajas libres del
Sales Desk** — en los dos stores, aunque lleguen ahí por caminos opuestos.

- **Los cuatro del store product-aware:** el `available` de abajo = cajas libres del Sales Desk.
  Si da **menos**, cargaste el libre en vez del bruto y las reservadas se restaron dos veces.
- **ginger-Perú:** el "On hand · gross" del Buy Planner = lo que cargaste, y el "Available" =
  eso menos el committed de la semana. Si el gross te da **menos** que las cajas físicas del
  Sales Desk, cargaste el libre en vez del bruto.

**Y antes de creerle al número: el committed del app tiene que parecerse al que reserva
WholesaleWare.** El Sales Desk trae su propia columna `Committed`. Si la del app es **mucho más
alta**, hay órdenes que el app cuenta como reservadas y WholesaleWare no — señal de que esa
mercadería ya no está. El 2026-09-03: app **1.150**, Sales Desk **349**; la diferencia era Sol-ti.
Confirmalas con el chequeo del Paso 2 antes de seguir.

```javascript
// Committed que NO se descontó por ser de otro pack/línea (5/10/20 lb, u otra variedad).
// Debe ser producto trabajado que vive en sus propios lotes — si acá aparece algo de 30/50 lb
// que sí tenés en cámara, es que al lote le falta el `sku`.
(function(){
  var sk = (typeof window!=='undefined' && window._prodCommittedSkipped) || {};
  var hay = Object.keys(sk).filter(function(k){ return (sk[k].cases||0) > 0; });
  if(!hay.length){ console.log('committed descartado por pack: nada'); return; }
  hay.forEach(function(k){ console.log('  ' + k + ' — ' + sk[k].cases + ' cs fuera del descuento: ' + sk[k].skus.join(', ')); });
})();

// ginger-Perú (store propio): lo cargado = LIBRE; la app le suma el committed de la semana.
(function(){
  var st = bpInvState();
  var bruto = Object.keys(st.rows||{}).reduce(function(s,k){ return s+(+((st.rows[k]||{}).cases)||0); }, 0);
  var wk = dmWeekKey(new Date());
  var comm = (typeof committedInvForWeek==='function') ? (committedInvForWeek(wk,'ginger')||0) : 0;
  console.log('ginger · Peru   bruto (cargado) '+Math.round(bruto)+
              '  − committed '+Math.round(comm)+'  = libre '+Math.round(bruto-comm)+
              '   ('+Object.keys(st.rows||{}).length+' lots)');
})();

// Los otros cuatro: lo cargado = BRUTO; la app le resta el committed.
['ginger','turmeric','garlic','shallots'].forEach(function(p){
  (invmOriginsFor(p)||['all']).forEach(function(o){
    var s = invmProductStats(p,o); if(!s) return;
    console.log(p+' · '+o+'  on-hand '+Math.round(s.onHandCases)+
                '  − committed '+Math.round(s.committedCases)+
                '  = available '+Math.round(s.availCases)+
                (s.excludedCases ? '   (+'+Math.round(s.excludedCases)+' excluded, no cuentan)' : ''));
  });
});
```

## Paso 3c — Las órdenes en tránsito

**Orders NO se sincroniza con WholesaleWare.** Es un pipeline curado a mano contra el Google Sheet,
así que una PO cargada allá **no aparece sola acá** — y comparar la app contra sí misma solo dice si
está de acuerdo consigo misma. La verdad sale de cruzar los dos archivos:

> **en tránsito = está en Purchase Transactions · y NO tiene lote físico en el Inventory Report**

```bash
./tests/orders-in-transit.py
```

Toma los más nuevos de `~/Downloads`, o pasale las rutas. **Hace falta un tercer export:
`Purchase_Transactions-<fecha>.xlsx`** (WholesaleWare → Purchasing → Reports), del mismo día.

Dos trampas del export, ya resueltas dentro del script pero conviene conocerlas:

- **La columna `Order Status` no sirve:** dice `OPEN` en casi todo, incluidas POs de 2024 ya
  recibidas y consumidas. WholesaleWare no las cierra. La señal buena es `Received Quantity`.
- **El join va por `PO #` del Inventory Report**, no por `Lot #`. Un lote normal es `<PO>-0001`,
  pero los W-lots llevan el PO de **manufactura** y hay que excluirlos.

Lo que devuelve:

- **EN TRÁNSITO** — cargá en Orders las que sean reales y no estén. Si falta una, el Buy Planner y
  el Simulator no la cuentan como mercadería en camino y la cobertura sale corta.
- **ENTREGA VENCIDA sin lote** — casi siempre son **canceladas**, no contenedores perdidos.
  Confirmalo en WholesaleWare antes de cargar nada.

**Que no haya órdenes abiertas de garlic o shallots es normal**, no un olvido: son compra doméstica
con ~2 días de lead time (Christopher Ranch, Peri and Sons). Ginger y turmeric sí viven de pipeline.

### El otro lado: órdenes que ya llegaron y siguen figurando en camino

Una orden **no avanza sola**. El pipeline solo se mueve al guardar un contenedor en History
(`advanceOrderFromContainer`): ni la llegada, ni el import del Inventory Report, ni el calendario lo
tocan. Una orden cuyo contenedor nunca se cargó se queda en `Contracted`/`In Transit` para siempre
y ahí **se cuenta dos veces**, como stock y como mercadería en camino. Corré esto en la consola
**después** de cargar el inventario:

```javascript
(function(){
  var orders = getOrders(), fisico = {};
  var st = bpInvState();
  Object.keys(st.rows||{}).forEach(function(k){
    if(/^W:/.test(k)) return;                       // W-lot: PO de manufactura, no es orden de compra
    var o = orders.find(function(x){ return bpCcId(x)===k; });
    if(o) fisico[String(o.jlzPo||o.id||'')] = (st.rows[k].cases||0);
  });
  var ps = prodInvState();
  Object.keys(ps).forEach(function(p){
    if(p==='_savedAt') return;
    ((ps[p]||{}).lots||[]).forEach(function(l){
      if(!l || !l.lot || /^W\d/.test(String(l.lot))) return;
      fisico[String(l.lot).split('-')[0]] = (fisico[String(l.lot).split('-')[0]]||0) + (+l.cases||0);
    });
  });
  var abiertas = orders.filter(function(o){ return /contracted|in transit/i.test(o.status||''); });
  var mal = abiertas.filter(function(o){ return fisico.hasOwnProperty(String(o.jlzPo||o.id||'')); });
  abiertas.forEach(function(o){
    console.log('  PO '+(o.jlzPo||o.id)+' · '+o.status+' · '+_ordProd(o)+' · '+(o.cases||0)+' cs · ETA '+(o.arrivalEstimated||'-'));
  });
  if(mal.length) mal.forEach(function(o){
    console.warn('DOBLE CONTEO · PO '+(o.jlzPo||o.id)+' sigue en '+o.status+' pero ya tiene lote físico ('+
                 fisico[String(o.jlzPo||o.id)]+' cs) — pasala a Arrived');
  });
  else console.log('%c OK · ninguna orden abierta tiene mercadería ya en cámara ','background:#0d5026;color:#fff');
})();
```

Si sale DOBLE CONTEO: pasala a `Arrived` (`arrivalActual = arrivalEstimated`) y **acordate de
`pushOrdersToSheet()`** — `saveOrders()` solo escribe local.

> **Ojo con el campo `product`.** Cuando falta, `_ordProd()` cae a `'ginger'` por defecto, así que
> una orden de otro producto sin ese campo se suma en silencio al ginger entrante. Además `product`
> **no viaja en el esquema de la hoja**, así que completarlo a mano se pierde en el próximo pull:
> arreglarlo de verdad pide tocar `pushOrdersToSheet()` y el backend.

## Paso 4 — Verificar (no lo saltees)

**4a. Contra el archivo fuente** — lo único que detecta si el cargador perdió filas:

```bash
./tests/compare-excel.py "<ruta del Sales By Account que se cargó>"
```

**4b. Contra el modelo vivo** — que Juan pegue en la consola:

```javascript
fetch('tests/invariants-console.js?v='+Date.now()).then(r=>r.text()).then(eval)
```

El `?v=` **no es opcional**: sin él el navegador sirve la copia cacheada y mirás resultados
viejos creyendo que son nuevos (nos costó dos rondas el 2026-09-02). El script imprime su versión
en la primera línea.

**Qué tiene que dar:**
- NIVEL 3 del script **idéntico** a la salida de 4a, en `Billable Units` y `Gross Sales`
- NIVEL 1+2 sin ningún ✗: `dif_vs_crudo` 0, `saltos` 0, `interna` 0, semana en curso fuera del promedio

Si algo no cuadra, **pará ahí**. Contexto de qué prueba cada capa: `tests/README.md`.

## Paso 5 — Reportar

Tabla corta: run-rate y cobertura por producto, y qué comprar según el Buy Planner.

- **Marcá cualquier movimiento grande contra la semana pasada.** Un run-rate que salta de golpe
  casi siempre es un dato raro, no una tendencia.
- **Ventana de reacción:** ginger 6 semanas, los otros 3. Solo la de ginger alimenta el Buy Planner
  y el Simulator; cambiar la de otro producto no mueve el plan de ginger.
- **Las cuentas quiet se cubren por defecto, a propósito** — sacarlas es decisión manual de Juan.
  Su postura: *"lo peor que me puede pasar es no tener producto"*. No propongas sacarlas solo
  porque estén calladas.

---

## Si algo falla

| Síntoma | Qué es |
|---|---|
| Sheet sync *"unauthorized / timed out"* | Arranque en frío de Apps Script, **no** el token. Típico en el primer pull del día. Reintentá una vez. |
| Cambios que no aparecen tras desplegar | Caché. **Cmd+Shift+R**. Ya se perdió una sesión entera de debugging por esto. |
| PO sin fecha de llegada | Purchase Orders: el filtro por defecto es "Scheduled Delivery Date = Today" y deja la lista vacía. Elegí **Custom Date Range** y **tipeá** la fecha (setearla por JS no funciona, React la revierte). |
| El stock libre da mucho menos que las cajas del Sales Desk | Una orden committed cuya mercadería **ya salió** pero sigue sin facturar (típico: se quedó en *Picking*). Se descuenta dos veces. Corré el chequeo de vencidas del Paso 2 y confirmá cada una. |
| Un lote excluido volvió a contar | El reemplazo total pisó su marca. El snippet B ya lo previene; si pasó, re-marcalo con `invmProdToggleLotExcl`. |

**Nunca:** pedirle a Juan que pegue el token de la API en el chat · borrar un lote "excluded" de la
app (vuelve el lunes siguiente; se marca, no se borra) · inventar una fecha de recepción.

**`localStorage` es por dispositivo.** El inventario y el History no se sincronizan entre máquinas.
Desde otra laptop es otra foto.

## Si tocaste código en el camino

```bash
./tests/run.sh
```

Tiene que dar verde antes de que Juan despliegue. Después del deploy, **Cmd+Shift+R**.

## Contexto relacionado

- `tests/README.md` — las tres capas de verificación y qué prueba cada una
- `prompts/refresh-container-intelligence.md` — por qué el orden Excel→committed importa
- `prompts/actualizar-inventario-lunes.md` — las verdades de datos del inventario
- `prompts/reporte-ventas-viernes.md` — el cierre del viernes, la otra rutina de la semana
