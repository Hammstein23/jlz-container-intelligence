# Actualizar inventario — runbook (lunes)

> ## ⚠️ Este archivo quedó parcial. La rutina completa vive en `/lunes`
>
> Escribí **`/lunes`** en Claude Code y se ejecuta todo: cargar los dos reportes, el inventario
> de los 4 productos y la verificación en tres capas. Este documento se mantiene solo como
> referencia de las **verdades de datos**, que siguen valiendo.
>
> Lo que este archivo decía y ya **no** alcanza: era **solo de ginger** y describía un único
> store. Desde 2026-09-01 el inventario es multi-producto y vive en **dos** lugares distintos.

## Los dos stores — confundirlos no da error, escribe en el lugar equivocado

| Qué | Dónde | Llave del lot |
|---|---|---|
| **ginger-Perú** | `jlz_bp_inv` → `bpInvState().rows` | número de **PO** (`bpCcId(order)`), armado desde **Orders** |
| ginger-Hawaii, turmeric, garlic, shallots | `jlz_prod_inv_v1` → `prodInvState()` | lot con origen, proveedor, costo y fecha |

Los snippets de cada uno están en `.claude/commands/lunes.md`.

## Verdades de datos — no violar

- **Reemplazo TOTAL cada lunes.** El Sales Desk es la foto completa en mano. Lo que ya no
  aparece, se va. No es un merge.
- **Excluir `River Road Organics`** (ginger). Ese producto no va al inventario.
- **Excluir los W-lots** (`W2881A...`) **y vLot.** Son lotes fantasma que el almacén crea para no
  recibir antes de tiempo, y representan las **mismas cajas** que las órdenes committed. Contarlos
  además del committed descuenta dos veces el mismo stock.
- **Los lots marcados "excluded" no se borran de WholesaleWare.** Siguen vivos allá pero ya no son
  físicos; se dan de baja recién cuando el almacén lo hace. Si los borrás, vuelven el lunes.
- **30 lb por caja es constante.** El Sales Desk ya viene en cajas.
- **Las fechas de recepción no se inventan.** Salen de WholesaleWare → Purchase Orders (scheduled
  delivery date) y alimentan los días de almacenamiento y el FEFO. Una fecha inventada mueve la
  merma estimada. Si no la encontrás, decilo.
- **Un PO que no esté en Orders no se puede cargar como lot** — el inventario de ginger-Perú se
  arma desde ahí. Cargalo en Orders primero.
- **`localStorage` es por dispositivo.** Hacerlo desde otra laptop es otra foto; no se sincroniza.

## Precondiciones

1. Chrome logueado en `erp.wholesaleware.com`.
2. La app abierta en el navegador, para pegar los snippets en la consola.

## De dónde sale el dato

WholesaleWare → **Sales Desk**, con la data hasta ayer (domingo). Por producto: leer la lista
completa de lots con `PO · Supplier · Origin · Cases`, y aplicar las exclusiones de arriba.
