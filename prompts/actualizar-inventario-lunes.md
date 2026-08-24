# Actualizar inventario de ginger — runbook (lunes)

> **Qué es:** rutina para actualizar el **Inventory** de JLZ Container Intelligence con el stock físico
> en mano de **Organic Ginger 30Lbs Premium**, tomado del **Sales Desk de WholesaleWare**.
> **Cadencia:** **lunes**, con la data cargada hasta el **domingo** (ayer). **Trigger manual** — Juan dice
> "actualiza el inventario" (NO auto-programado).
> **Mecanismo:** yo genero un **snippet** que Juan pega en la consola del app; **reemplaza TODO** el inventario
> de ginger con la foto del Sales Desk. El inventario vive en `localStorage['jlz_bp_inv']`, por dispositivo.

## Verdades de datos — no violar
- **El id de inventario = el número de PO.** En el app, `bpCcId(order)` → `order.jlzPo` (los lots se arman
  desde el pipeline de **Orders**). Confirmado 2026-08-24: los PO del Sales Desk matchean 1:1 con Orders.
- **Reemplazo TOTAL cada lunes.** El Sales Desk es la foto completa en mano → `st.rows` se reemplaza entero
  con la lista limpia (no merge). Lo que ya no aparece, se va.
- **EXCLUIR siempre la marca/supplier `River Road Organics`.** Ese producto NO va al inventario (ej. lot
  `W2861A2621537`). Todo lo demás (Añawi, Interloom, Hamilton Farm, etc.) sí.
- **Solo `Organic Ginger 30Lbs Premium`** (presentación 30 lb). Otras presentaciones/productos no.
- **30 lb por caja = constante.** El Sales Desk ya viene en cajas → se cargan cajas directo.

## Precondiciones (si falta algo, PARÁ y avisá)
1. Chrome logueado en `erp.wholesaleware.com` (sesión de Juan; la manejo yo, la devuelvo al terminar).
2. El app **JLZ Container Intelligence abierto** en un navegador (para pegar el snippet + consola).

## Pasos
1. **WholesaleWare → Sales Desk.** Esperar a que cargue la data hasta ayer (domingo).
2. **Abrir Ginger → presentación `Organic Ginger 30Lbs Premium`.**
3. **Leer la lista completa** de lots (todas las filas): `PO(id) · Supplier · Origin · SKU · Cases`.
4. **Limpiar:** sacar toda fila de **River Road Organics**.
5. **Generar el snippet** replace-all con la lista limpia `{po, cases}` (template abajo).
6. **Juan lo pega** en la consola del app (Chrome: Cmd+Option+J). Reemplaza el inventario + reporta
   `matched` / `missing`.
7. **Si hay POs `missing`** (no están en el pipeline de Orders): agregarlos a **Orders** primero (el
   inventario se arma desde ahí), o avisarle a Juan. Un PO sin orden no se puede cargar como lot.
8. Devolver la pestaña de WholesaleWare a donde estaba.

## Snippet (rellenar `LOTS` con la lista limpia del Sales Desk)
```javascript
(function(){
  var LOTS = [
    // {po:'2410367', cases:404}, {po:'2432242', cases:476}, ...  ← Sales Desk sin River Road
  ];
  var orders = (typeof getOrders==='function'?getOrders():[]);
  var st = bpInvState(); var rows={}, matched=[], missing=[];
  LOTS.forEach(function(d){
    var o=orders.find(function(x){ return String(x.jlzPo||'')===String(d.po) || String(x.id||'')===String(d.po); });
    if(!o){ missing.push(d.po); return; }
    rows[bpCcId(o)] = { cases: Math.max(0, parseInt(d.cases)||0) };
    matched.push(d.po+' ('+d.cases+' cs)');
  });
  st.rows = rows;                       // REEMPLAZO TOTAL
  bpInvSave(st);
  if(typeof renderInventory==='function') renderInventory();
  console.log('%c Inventario actualizado: '+matched.length+' lots ','background:#0d5026;color:#fff;padding:2px',matched);
  if(missing.length) console.warn('POs NO encontrados en Orders (agregarlos primero):', missing);
})();
```

## Notas
- **Dry-run** (validar el mapeo sin cambiar nada): mismo snippet pero sin `st.rows=rows; bpInvSave(st)`,
  usando `console.table`. Usar cuando haya PO nuevos y se quiera verificar que matchean antes de reemplazar.
- Preservar `st.sellLb` y `st.rates`: el snippet solo toca `st.rows`, así que se mantienen.
- Extensión futura: si se quiere para turmeric/garlic/shallots, misma lógica con su presentación en Sales Desk.
