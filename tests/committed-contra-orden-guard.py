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

if re.search(r"_bds\.innerHTML=.*invmDirectShipOrdersHTML\('ginger','Peru'\)", src):
    ok('y ginger-Peru tambien')
else:
    bad('el Buy Planner de ginger no muestra el cuadro')

# ── Y los candidatos que la app detecta tienen que decirse ──────────────────────────────────────
# `mtoDetectCandidates` existia, estaba testeada, y no se mostraba en ninguna pantalla: la app
# detectaba compras que parecen hechas para un cliente y se lo guardaba. Juan lo encontro a ojo.
if 'function invmMtoCandidatesHTML(p, origin)' in src:
    ok('los candidatos a contra-orden se muestran')
else:
    bad('no existe invmMtoCandidatesHTML: la app vuelve a callarse lo que detecta')

if len(re.findall(r'invmMtoCandidatesHTML\(', src)) >= 3:
    ok('en el Buy Planner de los cuatro y en el de ginger')
else:
    bad('el aviso de candidatos no esta cableado en los dos modulos')

_mc = re.search(r'function invmMtoCandidatesHTML\(p, origin\)\{(.*?)\n\}', src, re.S)
if _mc and 'getDirectShip' in _mc.group(1):
    ok('y no vuelve a proponer lo que ya esta marcado')
else:
    bad('el aviso propone ordenes ya marcadas: ruido sobre una decision ya tomada')

if _mc and 'addDirectShip' not in _mc.group(1):
    ok('avisa, pero no marca: la decision sigue siendo de Juan')
else:
    bad('el aviso marca ordenes por su cuenta: eso cambia el plan de compra sin que nadie lo decida')

# ── El stock libre tampoco puede restar lo cruzado ──────────────────────────────────────────────
# Esa mercaderia nunca entro a camara, asi que no esta en el fisico: restarla del stock libre lo
# hunde por cajas que nadie tiene. El REEMPACADO si entra y si espera, asi que su committed cuenta.
for fn in ['committedInvForWeek', 'prodCommittedTotal']:
    m3 = re.search(r'function %s\(.*?\)\s*\{(.*?)\n\}' % fn, src, re.S)
    if not m3:
        bad('no se encontro %s' % fn); continue
    # No alcanza con LLAMAR a _cmCrossDock: el filtro tiene que aplicarse de verdad. Con solo la
    # llamada, borrar la linea del filtro dejaba pasar el chequeo.
    cuerpo = m3.group(1)
    if re.search(r'hasOwnProperty\.call\(_?cd,\s*c\.customer\)', cuerpo):
        ok('%s no resta el cruzado del stock libre' % fn)
    else:
        bad('%s resta committed cruzado: descuenta mercaderia que nunca entro' % fn)

_cd = re.search(r'function _cmCrossDock\(p\)\{(.*?)\n\}', src, re.S)
if _cd and 'crossDockOnly:true' in _cd.group(1):
    ok('y la fuente del cruzado es la misma de siempre')
else:
    bad('_cmCrossDock no sale de mtoByCustomer con crossDockOnly')

print()
if fails:
    print('  %d problema(s): el contra-orden vuelve a contarse contra el inventario' % len(fails)); sys.exit(1)
print('  ok   el contra-orden no toca el inventario, por ninguna de las dos puntas')
