#!/usr/bin/env python3
"""Toda pantalla de PLANIFICACIÓN descuenta lo comprado contra orden. Ni una menos, ni dos veces.

Una compra hecha para un cliente concreto no necesita stock esperándola, así que sale de la demanda.
El 2026-09-04 ese descuento llegó a unas pantallas y no a otras, y el resultado fue el peor posible:
la zona 3 decía 321 cs/wk y el plan de compra usaba 88, para el mismo producto, en la misma app.

Hay tres formas legítimas de descontarlo y cada superficie usa UNA:

  · por FILA      `mtoNetRows`   — netea las ventas antes de construir el modelo. Es la más completa:
                                   arregla las barras por semana, la lista de clientes y el titular a
                                   la vez, así que la aritmética que el panel muestra sigue cerrando.
  · por MODELO    `mtoNetModel`  — el mismo modelo con las tasas por cliente ya netas. Va junto con la
                                   resta al agregado: la base excluye el volumen y el modelo evita que
                                   hybridSalesForWeek lo reste una segunda vez.
  · al AGREGADO   `mtoCasesPerWeek` — solo válido acompañado del modelo neto.

Las pantallas que muestran el NEGOCIO REAL (Customers, Trend & Price, Committed, Buy confidence) leen
el modelo crudo a propósito: ahí Sol-ti y Whole Foods tienen que aparecer con lo que de verdad
compraron. Están listadas abajo con su razón.
"""
import io, os, re, sys

SRC = os.path.join(os.path.dirname(__file__), '..', 'JLZ_Container_Intelligence.html')
src = io.open(SRC, encoding='utf8').read()


def body(name):
    m = re.search(r'^function\s+' + re.escape(name) + r'\s*\(', src, re.M)
    if not m:
        return None
    i = src.index('{', m.end() - 1)
    d, p = 0, i
    while p < len(src):
        if src[p] == '{':
            d += 1
        elif src[p] == '}':
            d -= 1
            if d == 0:
                return src[i:p + 1]
        p += 1
    return None


# fn -> etiqueta.  Cada una TIENE que descontar.
PLANNING = {
    'dmLineStats':         'Zona 1 · tarjetas producto+origen',
    'dmWeekStatus':        'Zona 2 · This week',
    'renderDmRunRate':     'Zona 3 · Run-rate',
    'renderBuildupPanel':  'Zona 5 · Forward build-up',
    'invmProductModel':    'modelo de los 4 productos (Inventory + Buy Planner)',
    'renderBuyPlanner':    'Buy Planner · ginger',
    'simRenderProjection': 'Simulator',
}

# fn -> razón por la que NO descuenta.  Cambiar esto es una decisión, no un descuido.
GROSS_ON_PURPOSE = {
    'cxRenderList':         'Customers lista lo que el cliente COMPRÓ, no lo que hay que stockear',
    'renderCustomers':      'idem: es inteligencia de clientes, no plan de compra',
    'dmRenderTrendPrice':   'Trend & Price es historia de ventas: lo que pasó, pasó',
    'renderCommittedPanel': 'muestra las órdenes reservadas tal cual',
    'renderDemandAccuracy': 'mide si el modelo predijo las VENTAS reales; netearlo falsearía la nota',
}

MECH = {'mtoNetRows': 'fila', 'mtoNetModel': 'modelo', 'mtoCasesPerWeek': 'agregado'}
bad = []

for fn, label in PLANNING.items():
    b = body(fn)
    if b is None:
        bad.append((label, fn, 'no se encontró la función'))
        continue
    used = [m for m in MECH if m in b]
    if not used:
        bad.append((label, fn, 'no descuenta lo comprado contra orden'))
    elif used == ['mtoCasesPerWeek']:
        bad.append((label, fn, 'resta al agregado sin netear el modelo → hybridSalesForWeek lo resta dos veces'))

for fn in GROSS_ON_PURPOSE:
    b = body(fn)
    if b is not None and any(m in b for m in MECH):
        bad.append((GROSS_ON_PURPOSE[fn], fn, 'descuenta, pero está declarada como pantalla de negocio real'))

if bad:
    print('✗ el descuento de compras contra orden no es coherente:\n')
    for label, fn, why in bad:
        print('  %s  —  %s()' % (label, fn))
        print('     %s\n' % why)
    print('  Si una pantalla nueva planifica, tiene que descontar. Si muestra el negocio real,')
    print('  agregala a GROSS_ON_PURPOSE con su razón.\n')
    sys.exit(1)

print('  ok   contra-orden: %d pantallas de plan descuentan, %d muestran el negocio real'
      % (len(PLANNING), len(GROSS_ON_PURPOSE)))
