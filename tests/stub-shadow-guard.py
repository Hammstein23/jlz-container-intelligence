#!/usr/bin/env python3
"""Ningun stub puede TAPAR una funcion que el harness dice estar probando.

tests/stubs.js declara sus propias versiones de algunas funciones. Si un nombre esta a la vez en
stubs.js y en la lista de extraccion de run.sh, gana el stub —se ejecuta despues del hoisting— y
todo test que lo llame mide el andamio, no el codigo. Ya paso dos veces hoy: `invmProductArrivals`
(que ni siquiera se extraia) e `invmCommittedByWeek`.

Los dos choques que quedan estan listados como conocidos. El guardian falla si aparece uno NUEVO.
"""
import re, sys, pathlib

raiz = pathlib.Path(__file__).parent
run  = (raiz / 'run.sh').read_text(encoding='utf-8')
stub = (raiz / 'stubs.js').read_text(encoding='utf-8')

CONOCIDOS = {
    'invmCommittedByWeek': 'el stub lee COMMITTED, del que dependen ~10 grupos; migrarlos a cmPlanEntries',
    'productCaseLb':       'el stub devuelve siempre 30; produccion lee PRODUCTS[k].caseLb (shallots = 50)',
}

m = re.search(r'extract\.py" "\$HTML" "\$TMP/app\.js" \\\n(.*?)\n# ', run, re.S)
extraidas = set()
if m:
    for tok in m.group(1).replace('\\', '').split():
        if re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', tok):
            extraidas.add(tok)

declarados = set(re.findall(r'^\s*(?:var\s+)?function\s+([A-Za-z_][\w]*)', stub, re.M))
declarados |= set(re.findall(r'^\s*var\s+([A-Za-z_][\w]*)\s*=\s*function', stub, re.M))

choque = extraidas & declarados
nuevos  = sorted(choque - set(CONOCIDOS))
viejos  = sorted(choque & set(CONOCIDOS))

print('  ok   %d funciones extraidas, %d declaraciones en stubs.js' % (len(extraidas), len(declarados)))
for n in viejos:
    print('  ·    conocido: %s tapa produccion — %s' % (n, CONOCIDOS[n]))
if nuevos:
    for n in nuevos:
        print('  FAIL %s esta en stubs.js Y en la lista de extraccion: los tests miden el stub' % n)
    print()
    print('  %d choque(s) nuevo(s): sacalo de stubs.js o de la extraccion' % len(nuevos))
    sys.exit(1)
faltan = sorted(set(CONOCIDOS) - choque)
if faltan:
    print()
    print('  ok   %s ya no choca: sacalo de CONOCIDOS en este guardian' % ', '.join(faltan))
print()
print('  ok   ningun choque nuevo')
