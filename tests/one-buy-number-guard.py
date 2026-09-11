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

# ── Cada tarjeta contesta con SUS datos ─────────────────────────────────────────────────────────
# Antes habia una sola: la del Buy Planner, renderizada DENTRO del Simulator. Asi que el Simulator
# mostraba una recomendacion que ignoraba los escenarios que Juan acababa de cargar en el Simulator.
print()
if re.search(r"function bpGingerSuggestionHTML\(src\)\{", src):
    ok('la tarjeta de ginger recibe el digest que tiene que leer')
else:
    bad('bpGingerSuggestionHTML no toma el digest por parametro: vuelve a haber una sola fuente')

if re.search(r"_bs\.innerHTML=bpGingerSuggestionHTML\(window\._bpDigest\)", src):
    ok('el Buy Planner pinta la suya con el digest real')
else:
    bad('el Buy Planner no pinta su tarjeta con su propio digest')

if re.search(r"_sgs\.innerHTML=bpGingerSuggestionHTML\(window\._simDigest", src):
    ok('el Simulator pinta la suya con el digest de escenarios')
else:
    bad('el Simulator no pinta su tarjeta con su propio digest')

if re.search(r"window\._simDigest = \{ scenario:true", src):
    ok('el Simulator publica su digest, marcado como escenario')
else:
    bad('el Simulator no publica un digest propio')

if re.search(r"invmBuySuggestionHTML\(s\.p, s\.origin, \{whatif:false\}\)", src):
    ok('los otros cuatro tienen tarjeta en el Buy Planner, sin escenarios')
else:
    bad('los otros cuatro no tienen tarjeta en el Buy Planner')

if re.search(r"invmBuySuggestionHTML\(s\.p, s\.origin, \{whatif:true\}\)", src):
    ok('y en el Simulator, con escenarios')
else:
    bad('los otros cuatro no tienen tarjeta con escenarios en el Simulator')

# La cuenta de contenedores tiene que ser UNA, o los dos digest divergen en silencio.
if len(re.findall(r"bpContainerPlan\(\{", src)) >= 2 and 'function bpContainerPlan(o){' in src:
    ok('los dos digest deciden contenedores con la misma funcion')
else:
    bad('la cuenta de contenedores no esta compartida entre Buy Planner y Simulator')

print()
if fails:
    print('  %d problema(s): vuelve a haber mas de un numero de compra' % len(fails)); sys.exit(1)
print('  ok   un solo numero de compra')
