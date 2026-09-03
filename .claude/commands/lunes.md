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

2. **Cada store carga el inventario de una forma distinta — y son opuestas.** Confundirlas cuenta
   el committed dos veces, para abajo o para arriba según cuál.

   | Store | Qué cargás | Qué hace la app con el committed |
   |---|---|---|
   | **ginger-Perú** (`jlz_bp_inv`) | las cajas **LIBRES** (sin las reservadas) | lo **suma**: `gross = stock + committed` |
   | los otros cuatro (`jlz_prod_inv_v1`) | las cajas **BRUTAS** (con las reservadas) | lo **resta**: `available = onHand·shrink − committed` |

   Regla de bolsillo: **en ginger cargás lo que podés vender; en los otros, lo que hay físicamente.**
   El paso 3b lo verifica con números en los dos casos.

---

## Paso 0 — Ubicar los archivos

```bash
ls -lt ~/Downloads/*.xlsx ~/Desktop/*.xlsx 2>/dev/null | head
```

Necesitás `Sales By Account Report-<fecha>.xlsx` y `Unshipped Sales Order Report-<fecha>.xlsx`.

- Si el más nuevo **no es de hoy o de ayer**, pará y avisá: un export viejo mueve el `dataMax`
  para atrás y ensucia todo lo que sigue.
- Ignorá los archivos que empiezan con `~$` — son el lock de Excel, no datos.

## Paso 1 — Cargar las ventas

Juan sube el **Sales By Account** en la pestaña **Demand**. Esto avanza el `dataMax`, que es la
frontera entre "facturado" y "abierto".

## Paso 2 — Re-importar el committed

Juan sube el **Unshipped Sales Order Report** en Demand → **Committed orders** → import.
El importador re-filtra contra el `dataMax` nuevo y saca solo lo que ya se facturó.

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

Fuente: **WholesaleWare → Sales Desk**, con la data hasta ayer (domingo).

### Qué se carga y qué no

**Ojo con la convención, que es distinta según el store** (ver la regla 2 arriba):

- **ginger-Perú → cargá las cajas LIBRES**, sin las reservadas. La app le suma el committed
  (`stockCasesGross = stockCases + committedNowCases`) y lo consume en su propia semana. Cargar
  el bruto acá **infla** el stock: el committed se sumaría sobre cajas que ya lo incluyen.
- **Los otros cuatro → cargá las cajas BRUTAS**, todas las físicas incluidas las reservadas.
  La app resta el committed (`available = onHand·shrink − committed`). Cargar el libre acá
  **hunde** el stock: las reservadas se descuentan dos veces y el plan pide comprar de más.

En los dos casos las cajas reservadas se cuentan **una sola vez** — lo que cambia es de qué lado
de la cuenta las pone la app.

Excluir siempre:
- **River Road Organics** (ginger) — ese producto no va al inventario.
- **vLot** — lotes virtuales, no son producto.
- Las presentaciones **5 y 10 lb**: son producto trabajado, no la compra. La compra real es
  **30 lb** (ginger, turmeric, garlic) y **50 lb** (shallots, en saco).

**Los W-lots (`W2881A...`) son el caso delicado.** Son lotes fantasma que el almacén crea para no
recibir antes de tiempo, y representan **las mismas cajas** que las órdenes committed. La regla:
esas cajas se cuentan **una sola vez**. Como el Paso 2 ya las trae por el lado del committed, no
las agregues además como lote. El chequeo del Paso 3b lo confirma con números.

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

### Snippet A — solo ginger-Perú (por PO)

```javascript
(function(){
  var LOTS = [
    // {po:'2410367', cases:404}, {po:'2432242', cases:476},   ← Sales Desk sin River Road
  ];
  var orders = (typeof getOrders==='function' ? getOrders() : []);
  var st = bpInvState(), rows = {}, matched = [], missing = [];
  LOTS.forEach(function(d){
    var o = orders.find(function(x){ return String(x.jlzPo||'')===String(d.po) || String(x.id||'')===String(d.po); });
    if(!o){ missing.push(d.po); return; }
    rows[bpCcId(o)] = { cases: Math.max(0, parseInt(d.cases)||0) };
    matched.push(d.po+' ('+d.cases+' cs)');
  });
  st.rows = rows;                              // REEMPLAZO TOTAL (preserva sellLb y rates)
  bpInvSave(st);
  if(typeof renderInventory==='function') renderInventory();
  console.log('%c ginger-Peru: '+matched.length+' lots ','background:#0d5026;color:#fff;padding:2px', matched);
  if(missing.length) console.warn('POs que NO están en Orders — cargalos ahí primero:', missing);
})();
```

Un PO que no esté en **Orders** no se puede cargar como lot. Si aparece en `missing`, cargalo en
Orders y volvé a correr.

### Snippet B — los otros cuatro

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
- **ginger-Perú:** el "Available" del Buy Planner = lo que cargaste (`stockCases`), y el "on-hand
  gross" = eso + el committed de la semana. Si el gross te da **más** que las cajas físicas del
  Sales Desk, cargaste el bruto en vez del libre.

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
  var libre = Object.keys(st.rows||{}).reduce(function(s,k){ return s+(+((st.rows[k]||{}).cases)||0); }, 0);
  var wk = dmWeekKey(new Date());
  var comm = (typeof committedInvForWeek==='function') ? (committedInvForWeek(wk,'ginger')||0) : 0;
  console.log('ginger · Peru   libre (cargado) '+Math.round(libre)+
              '  + committed '+Math.round(comm)+'  = gross '+Math.round(libre+comm)+
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
