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

n_plan = len(re.findall(r'cmPlanEntries\(\)', src)) - 1   # menos la definición
print('  ok   committed: %d lectores de plan por cmPlanEntries(), %d de volumen declarados'
      % (n_plan, len(ALLOWED)))
