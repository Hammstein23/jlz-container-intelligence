#!/usr/bin/env python3
"""Guardián del store de committed orders.

Una orden committed se lee desde muchos lugares, y cada lugar decide por su cuenta si cuenta o no.
Cuando se agrega un estado nuevo (`shipped`, direct-ship, pack, origen) hay que aplicarlo en TODOS
los que alimentan stock o demanda — y siempre se escapa uno. El 2026-09-03 se escaparon siete: la
entrega de Sol-ti (1.000 cs, 1-sep) seguía contando como demanda y el plan pedía 4 contenedores.

La regla, desde entonces:

  · alimenta STOCK o DEMANDA  →  lee por cmPlanEntries()   (filtra las despachadas)
  · muestra VOLUMEN o escribe →  lee getCommitted() directo, y está listado abajo con su razón

Este script falla si aparece un getCommitted() nuevo que no esté en ninguno de los dos lados.
No adivina la intención: te obliga a declararla.
"""
import io, re, sys

SRC = 'JLZ_Container_Intelligence.html'

# Lectores que leen el store COMPLETO a propósito. Cada uno con la razón por la que las
# órdenes despachadas SÍ tienen que aparecer ahí.
ALLOWED = {
    'cmPlanEntries':            'ES el accessor: acá vive el filtro',
    'addCommitted':             'escribe en el store',
    'removeCommitted':          'escribe en el store',
    'importCommittedOpenOrders':'re-importa y preserva las marcas shipped existentes',
    'dmcRenderChips':           'panel de Committed orders: la despachada se muestra con su badge',
    'dmcToggleShipped':         'es el que pone y saca la marca',
    'renderBuildupPanel':       'vista de volumen: esas cajas se movieron y tienen que verse',
}

src = io.open(SRC, encoding='utf8').read()
lines = src.split('\n')

# a qué función pertenece cada línea (las de este archivo arrancan en columna 0)
owner, cur = {}, '(top-level)'
for i, ln in enumerate(lines, 1):
    m = re.match(r'^(?:function|  function|window\.)?\s*function\s+([A-Za-z_$][\w$]*)', ln) \
        or re.match(r'^function\s+([A-Za-z_$][\w$]*)', ln)
    if m: cur = m.group(1)
    owner[i] = cur

bad = []
for i, ln in enumerate(lines, 1):
    if 'getCommitted()' not in ln: continue
    if re.search(r'function\s+getCommitted', ln): continue
    fn = owner[i]
    if fn in ALLOWED: continue
    bad.append((i, fn, ln.strip()[:90]))

if bad:
    print('✗ getCommitted() sin declarar de qué lado está:\n')
    for i, fn, ln in bad:
        print('  %s:%d  en %s()' % (SRC, i, fn))
        print('     %s\n' % ln)
    print('  Si alimenta STOCK o DEMANDA        → cambialo por cmPlanEntries()')
    print('  Si es vista de VOLUMEN o escritura → agregalo a ALLOWED en %s con su razón\n' % __file__.split('/')[-1])
    sys.exit(1)

# ── Segundo guardián: la semana del conteo se prorratea en TODAS las proyecciones ────────────────
# Tres pantallas caminan semana a semana consumiendo demanda desde la foto de inventario: el Buy
# Planner de ginger, la proyección de los otros productos y el Simulator. Las tres tienen que usar
# bpSnapWeekDemand, o muestran números distintos para la misma semana — que fue exactamente el
# reporte del 2026-09-03: "el buy planner y el simulator están desalineados".
PROJECTORS = {
    'renderBuyPlanner':    'proyección de ginger-Perú',
    'invmProjectionHTML':  'proyección de turmeric/garlic/shallots + ginger-Hawaii',
    'simRenderProjection': 'proyección del Simulator',
}

def body_of(name):
    m = re.search(r'^function\s+' + re.escape(name) + r'\s*\(', src, re.M)
    if not m: return None
    i = src.index('{', m.end() - 1); depth = 0; p2 = i
    while p2 < len(src):
        if src[p2] == '{': depth += 1
        elif src[p2] == '}':
            depth -= 1
            if depth == 0: return src[i:p2 + 1]
        p2 += 1
    return None

missing = []
for fn, what in PROJECTORS.items():
    b = body_of(fn)
    if b is None:
        missing.append((fn, what, 'no se encontró la función'))
    elif 'bpSnapWeekDemand' not in b:
        missing.append((fn, what, 'no llama a bpSnapWeekDemand'))

if missing:
    print('✗ una proyección no prorratea la semana del conteo:\n')
    for fn, what, why in missing:
        print('  %s()  — %s' % (fn, what))
        print('     %s\n' % why)
    print('  Las tres pantallas tienen que consumir la semana del conteo por la MISMA regla,')
    print('  o muestran cifras distintas para la misma semana.\n')
    sys.exit(1)

print('  ok   prorrateo: las %d proyecciones pasan por bpSnapWeekDemand' % len(PROJECTORS))

# ── Tercer guardián: la merma va en la DEMANDA, no en el stock ──────────────────────────────────
# `available` tiene que ser el conteo físico menos lo comprometido — nada más. Con 48 cajas en cámara
# la pantalla decía 46 porque le aplicaba la merma al inventario, y parecía que dos se evaporaban.
# La merma es consumo: se saca más de la cámara por semana. Ginger ya lo hacía así; los otros cuatro
# no, y esa era la otra mitad de la inconsistencia.
stats = body_of('invmProductStats')
if stats is None:
    print('✗ no se encontró invmProductStats'); sys.exit(1)
problems = []
m_avail = re.search(r'var\s+availCases\s*=([^;]*);', stats)
if not m_avail:
    problems.append('no se encontró el cálculo de availCases')
elif 'effOnHand' in m_avail.group(1):
    problems.append('availCases vuelve a salir del stock con merma aplicada (effOnHand…)')
if 'weeklyLbsBuy' not in stats:
    problems.append('no existe weeklyLbsBuy: la merma dejó de inflar la demanda')
else:
    m_cov = re.search(r'var\s+coverWks\s*=([^;]*);', stats)
    if m_cov and 'weeklyLbsBuy' not in m_cov.group(1):
        problems.append('el cover no se mide contra la demanda inflada')

if problems:
    print('✗ la merma volvió al lado del stock:\n')
    for w in problems: print('  · ' + w)
    print('\n  available = físico − committed.  La merma infla la demanda semanal (weeklyLbsBuy),')
    print('  igual que en ginger. No la apliques al inventario.\n')
    sys.exit(1)

print('  ok   merma: available es el conteo físico; la merma infla la demanda')

n_plan = len(re.findall(r'cmPlanEntries\(\)', src)) - 1   # menos la definición
print('  ok   committed: %d lectores de plan por cmPlanEntries(), %d de volumen declarados'
      % (n_plan, len(ALLOWED)))
