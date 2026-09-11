#!/usr/bin/env python3
"""Un solo productor del numero de cajas a comprar.

El defecto central que abrio esta auditoria: dos pantallas contestaban "cuanto comprar" por caminos
distintos y daban numeros distintos. El KPI "Suggested order" de Inventory salia de
`invmProductStats.orderCases` —que mide sobre la posicion de HOY— y la tarjeta del Simulator de
`invmBuySuggestion`, que recorre la proyeccion y mide en la fecha en que el pedido entra.

`invmOrderCases()` es el unico productor. Esto verifica que nadie se lo saltee.
"""
import re, sys, pathlib

HTML = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).parent.parent / 'JLZ_Container_Intelligence.html')
src  = pathlib.Path(HTML).read_text(encoding='utf-8')
fails = []
def ok(m):  print('  ok   ' + m)
def bad(m): fails.append(m); print('  FAIL ' + m)

if re.search(r'function invmOrderCases\(p, origin\)\{', src):
    ok('invmOrderCases existe')
else:
    bad('no existe invmOrderCases: no hay un productor unico')

# `s.orderCases` solo puede aparecer como respaldo DENTRO de invmOrderCases o de la linea que lo llama.
# El cuerpo de invmOrderCases es justamente donde vive el respaldo: se excluye.
_m = re.search(r'function invmOrderCases\(p, origin\)\{.*?\n\}', src, re.S)
_dentro = set()
if _m:
    ini = src[:_m.start()].count('\n') + 1
    _dentro = set(range(ini, ini + _m.group(0).count('\n') + 1))
usos = []
for i, line in enumerate(src.split('\n'), start=1):
    if 's.orderCases' not in line and 'st.orderCases' not in line:
        continue
    if i in _dentro:                      # el respaldo documentado
        continue
    if line.lstrip().startswith('//'):    # un comentario no calcula nada
        continue
    if 'invmOrderCases' in line:          # la linea que llama al productor
        continue
    usos.append((i, line.strip()[:110]))
if usos:
    for i, l in usos: bad('linea %d usa orderCases directo, salteando el productor: %s' % (i, l))
else:
    ok('ninguna pantalla lee orderCases salteando el productor')

# Los tres consumidores conocidos tienen que pasar por el.
for fn, marca in [('invmAnalysisHTML', 'el KPI de Inventory'),
                  ('invmProjectionHTML', 'el veredicto de la proyeccion')]:
    m = re.search(r'function %s\(s\)\{(.*?)\n\}' % fn, src, re.S)
    if not m:
        bad('no se encontro %s' % fn); continue
    if 'invmOrderCases(' in m.group(1): ok('%s pasa por el productor' % marca)
    else: bad('%s no pasa por el productor' % marca)

# Y la cantidad tiene que medirse en la fecha de llegada, no hoy.
m = re.search(r'var applyPlan=function\(o\)\{(.*?)\n    \};', src, re.S)
if not m:
    bad('no se encontro applyPlan: la cantidad no se mide sobre la proyeccion')
elif re.search(r'o\.buy\s*=\s*Math\.max\(0,\s*Math\.ceil\(upTo-\(ancla\.stockAtLanding', m.group(1)):
    ok('la cantidad sale de objetivo menos lo proyectado a la llegada')
else:
    bad('la cantidad ya no sale de objetivo menos lo proyectado a la llegada')

print()
if fails:
    print('  %d problema(s): vuelve a haber mas de un numero de compra' % len(fails)); sys.exit(1)
print('  ok   un solo numero de compra')
