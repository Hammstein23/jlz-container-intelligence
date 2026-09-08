#!/usr/bin/env python3
"""Guardián del lote de reempaque (W-lot) en ginger-Perú.

El store de ginger-Perú (`jlz_bp_inv_v2`) está keyeado por ORDEN DE COMPRA. Un W-lot lleva en su
número el PO de MANUFACTURA (W2939A|2674126), que es una orden de reempaque interna y por
construcción NUNCA está en Orders. Sin una fila que sepa vivir sin orden se perdían 1.189 de las
3.213 cajas de ginger — el 37% del bruto — mientras el committed que esos mismos W-lots sirven SÍ
se restaba. El libre salía 1.057 cuando eran 2.246.

Son tres eslabones y basta que se rompa uno para volver al bug, en silencio:
  1. invmInvReportPlan escribe las filas de reempaque (con `repack:`)
  2. bpInvLot sabe leerlas sin orden
  3. invmCompute NO las descarta

El 3 no se puede testear con la suite headless (invmCompute arrastra medio módulo de UI), así que
se verifica sobre el código. Los 1 y 2 además tienen tests funcionales en pure-tests.js.
"""
import re, sys, os

HTML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(__file__), '..', 'JLZ_Container_Intelligence.html')
src = open(HTML, encoding='utf-8').read()
fails = []


def body(name):
    """Cuerpo de una función top-level, de su declaración al `}` en columna 0."""
    m = re.search(r'^function %s\(.*?\n\}' % re.escape(name), src, re.S | re.M)
    return m.group(0) if m else None


def need(name, cond, msg):
    if cond:
        print('  ok   ' + msg)
    else:
        print('  FAIL ' + msg)
        fails.append(name)


# 1 · el importer emite filas de reempaque en vez de mandarlas a "PO faltante"
b = body('invmInvReportPlan')
need('plan', b is not None, 'invmInvReportPlan existe')
if b:
    need('plan-emite', 'repack:' in b,
         'invmInvReportPlan escribe filas de reempaque (repack:)')
    # El bloque que recorre los W-lots no puede tocar bpMissing: buscarlos en Orders es
    # precisamente el bug. Se aísla ese forEach y se mira solo adentro.
    wblk = re.search(r'return l\.isW;\s*\}\)\.forEach\(function\(l\)\{(.*?)\n  \}\);', b, re.S)
    need('plan-no-po', wblk is not None and 'bpMissing' not in wblk.group(1),
         'el bloque de W-lots no los busca en Orders')
    # Y el agrupado por PO tiene que excluirlos, o entran dos veces.
    need('plan-excluye', re.search(r'bpAll\.filter\(function\(l\)\{ return !l\.isW; \}\)', b) is not None,
         'el agrupado por PO excluye los W-lots')

# 2 · bpInvLot sabe leer una fila sin orden
b = body('bpInvLot')
need('lot', b is not None, 'bpInvLot existe')
if b:
    need('lot-lee', 'rs.repack' in b, 'bpInvLot lee rs.repack')
    need('lot-fecha', re.search(r'bpDaysSince\(o\?bpEtaOf\(o\):\(rp\?', b) is not None,
         'los días de almacén salen de la fecha del W-lot cuando no hay orden')

# 3 · invmCompute no descarta la fila de reempaque  ← lo que la suite no puede probar
b = body('invmCompute')
need('compute', b is not None, 'invmCompute existe')
if b:
    need('compute-viejo', 'if(!L.o || L.cases<=0) return null;' not in b,
         'invmCompute ya NO descarta toda fila sin orden')
    need('compute-repack', re.search(r'if\(!L\.o\s*&&\s*!rp\)\s*return null;', b) is not None,
         'invmCompute solo descarta si NO hay orden Y NO hay reempaque')

if fails:
    print('\n✗ el camino del reempaque está roto: ' + ', '.join(fails))
    print('  Volver a leer el encabezado de este archivo antes de "arreglarlo".')
    sys.exit(1)
print('\n✓ los tres eslabones del reempaque siguen conectados')
