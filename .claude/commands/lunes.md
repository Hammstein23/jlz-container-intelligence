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
2. **El inventario se carga BRUTO**, incluidas las cajas ya reservadas. La app resta el committed
   ella misma (`availCases = onHand·shrink − committed`). Cargar el "Available libre" descuenta
   dos veces las mismas cajas.

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

## Paso 3 — Inventario físico de los 4 productos

Fuente: **WholesaleWare → Sales Desk**, con la data hasta ayer (domingo).

### Qué se carga y qué no

**Cargar BRUTO** — todas las cajas físicas, incluidas las que respaldan órdenes reservadas.
La app resta el committed sola. Si cargás el "Available libre", las cajas reservadas se
descuentan dos veces y el plan te va a decir que compres de más.

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
    // {lot:'2620621', origin:'Fiji', supplier:'Sbimal', cases:150, avgCost:72, received:'2026-08-28'},
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

Repetí el B por producto. **Reemplazo total en los dos**: lo que ya no aparece en el Sales Desk se va.
Con POs nuevos, hacé antes un dry-run (mismo snippet con `console.table` y sin guardar).

## Paso 3b — El chequeo que atrapa el doble descuento

Después de cargar, por cada producto: **el "Available to sell" que muestra la app tiene que dar
igual a las cajas libres del Sales Desk.** Si da menos, cargaste el neto en vez del bruto y las
cajas reservadas se restaron dos veces.

```javascript
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
