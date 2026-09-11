#!/usr/bin/env python3
"""Las tarjetas de compra se entienden leyendolas, sin que nadie las explique.

Es la regla numero uno de esta app —los dos duenos son no-tecnicos— y se rompio sola: "Free until
2026-09-26" se leia como "sin costo" cuando quiere decir que adelantarse no mejora nada; "is the
edge, not a target" es una metafora, no una instruccion; "floor" y "buffer" son jerga.

Este guardian no juzga redaccion: bloquea las formas concretas que ya confundieron, para que no
vuelvan por descuido.
"""
import re, sys, pathlib

HTML = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).parent.parent / 'JLZ_Container_Intelligence.html')
src  = pathlib.Path(HTML).read_text(encoding='utf-8')
fails = []
def ok(m):  print('  ok   ' + m)
def bad(m): fails.append(m); print('  FAIL ' + m)

# Solo dentro de las dos funciones que arman las tarjetas.
zonas = {}
for fn, pat in [('bpGingerSuggestionHTML', r'function bpGingerSuggestionHTML\(src\)\{.*?\n\}'),
                ('invmBuySuggestionHTML',  r'function invmBuySuggestionHTML\(p, origin, opts\)\{.*?\n\}')]:
    m = re.search(pat, src, re.S)
    if not m: bad('no se encontro %s' % fn)
    else: zonas[fn] = m.group(0)

PROHIBIDO = [
    ('Free until',     'se lee como "sin costo"; decir que no hay beneficio y por que'),
    ('is the edge',    'metafora, no instruccion; decir "Do not order later than ..."'),
    ('not a target',   'idem: decir que pasa si se cruza la fecha'),
    ('-case buffer',   'jerga; decir "safety level of N cases"'),
    ('floor ',         'jerga; decir "lowest N cases"'),
    ('you hit zero',   'ambiguo; decir "your stock reaches zero"'),
]
def sin_comentarios(txt):
    # Los comentarios del codigo CITAN la redaccion vieja para explicar por que se fue. No cuentan.
    return '\n'.join(l for l in txt.split('\n') if not l.lstrip().startswith('//'))

for fn, txt in zonas.items():
    txt = sin_comentarios(txt)
    malas = [(w, por) for w, por in PROHIBIDO if w in txt]
    if malas:
        for w, por in malas: bad('%s usa "%s" — %s' % (fn, w.strip(), por))
    else:
        ok('%s no usa jerga ni metaforas' % fn)

# Y lo que SI tiene que estar: cada linea de contexto dice que hacer o que no.
for fn, txt in zonas.items():
    if 'no benefit to ordering before' in txt and 'Do not order later than' in txt:
        ok('%s dice que hacer y que no' % fn)
    else:
        bad('%s perdio alguna de las dos instrucciones' % fn)

print()
if fails:
    print('  %d problema(s): la tarjeta volvio a necesitar que alguien la explique' % len(fails)); sys.exit(1)
print('  ok   las tarjetas se entienden solas')
