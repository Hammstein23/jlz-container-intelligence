#!/usr/bin/env python3
"""Los repacks van en su propia tabla, en los dos renderizadores de inventario.

Un repack no es un lote de proveedor: ya cambio de presentacion y son, en la practica, las cajas que
ya tienen dueño. Estaban mezcladas —turmeric 3 de 8, garlic 2 de 6, ginger-Peru 11 de 15— y leer la
tabla pedia saberse de memoria cual lote era cual.

El cableado no lo pueden ver los tests: llaman a las funciones de orden y deteccion directo, no al
renderizador. Va por codigo.
"""
import re, sys, pathlib

HTML = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).parent.parent / 'JLZ_Container_Intelligence.html')
src  = pathlib.Path(HTML).read_text(encoding='utf-8')
fails = []
def ok(m):  print('  ok   ' + m)
def bad(m): fails.append(m); print('  FAIL ' + m)

# invmRenderProduct — los cuatro productos + ginger-Hawaii
m = re.search(r'function invmRenderProduct\(p\)\{(.*?)\n\}', src, re.S)
if not m: bad('no se encontro invmRenderProduct')
else:
    b = m.group(1)
    if re.search(r'var repacks=s\.lots\.filter\(esRepack\), prov=s\.lots\.filter', b):
        ok('los cuatro productos parten proveedor / repack')
    else:
        bad('invmRenderProduct dejo de partir las tablas: los repacks vuelven a mezclarse')
    if 'Repacked — River Road' in b: ok('y la tabla de repacks se nombra como tal')
    else: bad('no hay tabla de repacks en invmRenderProduct')
    if 'invmSetLotSort' in b: ok('con columnas ordenables')
    else: bad('las columnas dejaron de ser ordenables')
    sin_com = '\n'.join(l for l in b.split('\n') if not l.lstrip().startswith('//'))
    if 'excl. W / vLot' in sin_com:
        bad('vuelve "excl. W / vLot": es falso desde que los W-lots SI se cargan (2026-09-08)')
    else:
        ok('el pie ya no dice que excluye los W-lots')

# invmLots — ginger-Peru, el caso peor
m2 = re.search(r'function invmLots\(m,t\)\{(.*?)\n\}', src, re.S)
if not m2: bad('no se encontro invmLots')
else:
    b2 = m2.group(1)
    if re.search(r'm\.lots\.filter\(function\(l\)\{ return !!l\.repack', b2):
        ok('ginger-Peru tambien parte proveedor / repack')
    else:
        bad('invmLots dejo de partir las tablas: ginger-Peru mezcla 11 repacks con 4 lotes reales')
    # No alcanza con que el helper exista: tiene que USARSE en el encabezado, o las columnas
    # quedan fijas y el helper es codigo muerto que hace pasar el chequeo.
    usadas = set(re.findall(r"_thO\('(\w+)'", b2))
    if {'stored','cases'} <= usadas:
        ok('y sus columnas Stored y Cases ordenan de verdad')
    else:
        bad('ginger-Peru perdio el orden por columna: falta %s en el encabezado'
            % ', '.join(sorted({'stored','cases'} - usadas)))

# La deteccion pide UNA de las dos señales, no las dos.
m3 = re.search(r'function invmIsRepackLot\(l\)\{(.*?)\n\}', src, re.S)
if not m3: bad('no se encontro invmIsRepackLot')
else:
    b3 = m3.group(1)
    if 'invmIsWLot' in b3 and 'manufactur' in b3:
        ok('el repack se detecta por el lote O por el vendedor')
    else:
        bad('invmIsRepackLot perdio una de las dos señales: se pierde un repack si el vendedor viene escrito distinto')

# ── La fecha de recepcion: presente, y en mes/dia/año ───────────────────────────────────────────
# Juan: "no podemos fallar ahi". A ginger le faltaba la columna entera; en los otros cuatro el
# <input type="date"> se renderiza segun el locale del navegador, asi que se fuerza con lang.
if m2 and re.search(r"_thO\('received','Received'\)", m2.group(1)):
    ok('ginger-Peru muestra la fecha de recepcion')
else:
    bad('ginger-Peru perdio la columna Received')

if m2 and 'invmFmtDate(l.received)' in m2.group(1):
    ok('y la muestra en mes/dia/año')
else:
    bad('ginger-Peru no formatea la fecha con invmFmtDate')

if m and re.search(r'type="date" lang="en-US"', m.group(1)):
    ok('los otros cuatro fuerzan el formato del selector')
else:
    bad('el <input type="date"> perdio lang="en-US": el formato queda a merced del navegador')

if m and 'invmFmtDate(l.received)' in m.group(1):
    ok('y lo escriben tambien como texto, sin depender del navegador')
else:
    bad('los cuatro productos no muestran la fecha en texto: si el navegador no es en-US, se lee al reves')

_fd = re.search(r'function invmFmtDate\(v\)\{(.*?)\n\}', src, re.S)
if _fd and 'new Date' not in _fd.group(1):
    ok('el formateo no construye un Date, asi que no puede correrse un dia')
else:
    bad('invmFmtDate construye un Date: al oeste de Greenwich mostrara el dia anterior')

print()
if fails:
    print('  %d problema(s) en las tablas de lotes' % len(fails)); sys.exit(1)
print('  ok   proveedor y repack, cada uno en su tabla')
