#!/usr/bin/env python3
"""El colchon de seguridad de ginger tiene que medirse con la serie DE GINGER.

Salia de `_dmModel`, que es el modelo del producto ENFOCADO en la pestaña Demand. Con el foco en
turmeric —cuya serie promedia 195 lb/semana contra las 22.317 de ginger— el colchon de ginger daba
64 cajas (0,08 semanas) en vez de ~1.172 (1,42). Dieciocho veces menos, decidido por que producto
estaba seleccionado en otra pantalla, y sin que nada lo dijera: el resto del plan se veia bien.

Es un bug que no se puede probar con el harness de funciones (vive dentro de renderBuyPlanner, que
no se extrae), asi que se blinda leyendo el codigo.
"""
import re, sys, pathlib

HTML = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).parent.parent / 'JLZ_Container_Intelligence.html')
src = pathlib.Path(HTML).read_text(encoding='utf-8')
fails = []

def ok(msg):   print('  ok   ' + msg)
def bad(msg):  fails.append(msg); print('  FAIL ' + msg)

# El bloque que arma la serie de la sigma.
m = re.search(r'const _gModel = .*?const ssCases = ssLbs / 30;', src, re.S)
if not m:
    bad('no se encontro el bloque del safety stock de ginger (_gModel … ssCases)')
else:
    blk = m.group(0)
    if re.search(r'_dmModel', blk):
        bad('la serie de la sigma vuelve a leer _dmModel — ese es el producto ENFOCADO, no ginger')
    else:
        ok('la serie no sale de _dmModel')
    if 'qaModelG' in blk or "invmProductModel('ginger'" in blk:
        ok('sale del modelo de ginger')
    else:
        bad('no se ve de donde sale la serie de ginger (qaModelG / invmProductModel)')
    if re.search(r'_ssMismatch\s*=', blk) and re.search(r'demandLbsWk\s*/\s*4', blk):
        ok('el guardian de escala esta puesto (serie vs demanda)')
    else:
        bad('falta el guardian de escala: una serie que no esta en el orden de magnitud de la demanda no es del mismo producto')
    if re.search(r'ssLbs\s*=\s*_ssDegradado\s*\?\s*Math\.max\(', blk):
        ok('degradado nunca deja el colchon por debajo de una semana')
    else:
        bad('cuando la serie no sirve, el colchon puede derrumbarse a cero sin piso')
    if re.search(r'\.filter\(\s*x\s*=>\s*x\s*>\s*0\s*\)', blk):
        bad('volvio el filter(x>0): una semana sin venta ES variabilidad y es lo que dimensiona el colchon')
    else:
        ok('las semanas en cero siguen contando')

# El aviso tiene que llegar a la pantalla, no quedarse en el digest.
if re.search(r"_setKpi\('bp-demand-src'[^;]*_ssMismatch", src):
    ok('el KPI avisa cuando la serie no coincide')
else:
    bad('el aviso de serie equivocada no llega al KPI')

print()
if fails:
    print('  %d problema(s) en el safety stock de ginger' % len(fails)); sys.exit(1)
print('  ok   el colchon de ginger se mide con ginger')
