#!/usr/bin/env python3
"""El committed de una cuenta CONTRA ORDEN no es demanda de almacen.

Esas cajas van del puerto al cliente: la orden ya entra con neto 0 en las llegadas. Contar su
committed como salida de camara las castiga dos veces — no llega el producto Y se cobra la demanda.

Turmeric-Fiji, 2026-09-11: la semana 38 mostraba -700 de Sol-ti sin ninguna llegada, y la proyeccion
entera caia en STOCKOUT (-455 y bajando) por mercaderia que nunca toca la camara.

Va como guardian y no como test porque tests/stubs.js TAPA `invmCommittedByWeek` (ver
stub-shadow-guard.py): cualquier test que la llame mide el stub.
"""
import re, sys, pathlib

HTML = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).parent.parent / 'JLZ_Container_Intelligence.html')
src  = pathlib.Path(HTML).read_text(encoding='utf-8')
fails = []
def ok(m):  print('  ok   ' + m)
def bad(m): fails.append(m); print('  FAIL ' + m)

m = re.search(r'function invmCommittedByWeek\(p, origin, fromWk\)\{(.*?)\n\}', src, re.S)
if not m:
    bad('no se encontro invmCommittedByWeek')
else:
    body = m.group(1)
    if 'mtoByCustomer' in body:
        ok('el committed contra-orden sale de la demanda de almacen')
    else:
        bad('invmCommittedByWeek no excluye las cuentas contra-orden: vuelve el doble castigo')
    if re.search(r'hasOwnProperty\.call\(_mtoCust,\s*c\.customer\)', body):
        ok('y se excluye por cliente, igual que hybridSalesForWeek')
    else:
        bad('la exclusion no es por cliente; hybridSalesForWeek usa esa regla y tienen que coincidir')
    if 'dmWindow' in body:
        ok('sobre la ventana del producto, la misma del neteo')
    else:
        bad('no usa la ventana del producto: puede discrepar con el neteo del run-rate')

# La otra punta: la llegada contra-orden ya se descuenta. Las dos tienen que estar, o hay asimetria.
a = re.search(r'function invmProductArrivals\(p, origin\)\{(.*?)\n\}', src, re.S)
if a and 'directShipTotal' in a.group(1):
    ok('y la llegada contra-orden sigue descontandose')
else:
    bad('invmProductArrivals dejo de netear direct-ship: la otra mitad del mismo error')

# ── Y tiene que VERSE en algun lado ─────────────────────────────────────────────────────────────
# Se descuenta de todo con razon, y el efecto lateral era que desaparecia de la pantalla: se compra
# producto, se paga y se despacha, y ninguna vista lo mostraba.
if 'function invmDirectShipOrdersHTML(p, origin)' in src:
    ok('existe el cuadro de lo comprado para un cliente')
else:
    bad('no existe invmDirectShipOrdersHTML: el contra-orden vuelve a ser invisible')

if re.search(r'invmDirectShipOrdersHTML\(s\.p, s\.origin\)', src):
    ok('los cuatro productos lo muestran bajo el Buy Planner')
else:
    bad('bpRenderProduct no muestra el cuadro: la compra contra-orden no se ve')

if re.search(r"_bds\.innerHTML=invmDirectShipOrdersHTML\('ginger','Peru'\)", src):
    ok('y ginger-Peru tambien')
else:
    bad('el Buy Planner de ginger no muestra el cuadro')

print()
if fails:
    print('  %d problema(s): el contra-orden vuelve a contarse contra el inventario' % len(fails)); sys.exit(1)
print('  ok   el contra-orden no toca el inventario, por ninguna de las dos puntas')
