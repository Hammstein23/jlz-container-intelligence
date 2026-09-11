#!/usr/bin/env python3
"""Un solo vocabulario para las tres formas de comprar.

Juan: "creo que seria bueno revisar que todas las ordenes, demanda, buy planner y simulator reflejen
lo mismo, y que el lenguaje que utilicemos sea el correcto, en cuanto a si afecta el run-rate o no".

  made to order   paraguas. Se compra cuando el cliente pide, asi que NO hay stock esperandolo:
                  sale del run-rate. Es lo unico cierto para los dos casos.
  cross-dock      del proveedor al cliente. Nunca entra al almacen.
  repacked here   entra, se reempaca y sale. SI cuenta como llegada y como salida de esa semana.

El texto viejo ("direct-ship", "never touches stock") afirmaba de TODOS lo que solo vale para el
cruzado — y desde que existe el reempacado, eso es falso en pantalla.
"""
import re, sys, pathlib

HTML = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).parent.parent / 'JLZ_Container_Intelligence.html')
src  = pathlib.Path(HTML).read_text(encoding='utf-8')
fails = []
def ok(m):  print('  ok   ' + m)
def bad(m): fails.append(m); print('  FAIL ' + m)

# Solo el texto que ve el usuario: los comentarios del codigo citan la palabra vieja a proposito.
vivo = '\n'.join(l for l in src.split('\n') if not l.lstrip().startswith('//'))

PROHIBIDO = [
    ("direct-ship'",        'la palabra vieja como texto de UI; decir "made to order"'),
    ('>direct-ship<',       'idem, dentro de una etiqueta'),
    ('Cuentas que NO',      'texto en castellano dentro de una UI en ingles'),
    ('never touches stock', 'solo vale para el cruzado; el reempacado SI toca stock'),
    ('never enter inventory', 'idem'),
]
malas = [(w, por) for w, por in PROHIBIDO if w in vivo]
if malas:
    for w, por in malas: bad('sigue en pantalla "%s" — %s' % (w, por))
else:
    ok('ningun texto de pantalla usa el vocabulario viejo')

# Lo que SI tiene que estar, porque es la afirmacion que vale para los dos casos.
if 'no stock waits for it' in vivo:
    ok('se dice por que sale del run-rate, que es lo unico cierto de los dos')
else:
    bad('se perdio la explicacion de por que sale del run-rate')

# Y las dos formas tienen que seguir nombradas donde importa.
for w, d in [('cross-dock', 'la forma que nunca entra'), ('repacked here', 'la que entra y sale')]:
    if w in vivo: ok('%s sigue nombrada (%s)' % (w, d))
    else: bad('desaparecio "%s" (%s)' % (w, d))

# El volumen contra-orden del grafico ya no es solo de ginger.
m = re.search(r"\(byWk\[wk\] = byWk\[wk\] \|\| \{ committed:0, direct:0 \}\)\.direct \+= tot;", src)
g = re.search(r"_ordProd\(o\) !== _p \|\| !Array\.isArray\(o\.directShip\)", src)
if m and g:
    ok('el grafico dibuja el contra-orden de los cuatro productos')
else:
    bad('el grafico volvio a dibujar contra-orden solo para ginger')

print()
if fails:
    print('  %d problema(s): el lenguaje volvio a decir algo que no es' % len(fails)); sys.exit(1)
print('  ok   un solo vocabulario, y cada afirmacion es cierta')
