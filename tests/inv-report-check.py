#!/usr/bin/env python3
"""El Inventory Report real contra el importer de producción.

`run.sh` prueba el importer con datos sintéticos, y ahí está la trampa que dejó pasar el bug
de los W-lots: el harness generaba una orden para CADA PO del archivo, W-lots incluidos, así
que los lotes de reempaque siempre encontraban orden y nunca se caían. Circular. Esto no:
lee el XLS de verdad, y a los W-lots **no les da orden ninguna** — que es la realidad, su
número lleva el PO de manufactura y por construcción nunca está en Orders.

    ./tests/inv-report-check.py                          # el más nuevo de ~/Downloads
    ./tests/inv-report-check.py <inventory.xlsx>
    ./tests/inv-report-check.py <inventory.xlsx> <unshipped.xlsx>
    ./tests/inv-report-check.py --html <copia-rota.html>     # probar que el harness detecta

Sin archivo no falla: dice que no hay nada que probar y sale limpio, para que `run.sh` pueda
llamarlo cualquier día. Con archivo corre las funciones REALES sacadas del HTML — parser,
plan y física — y recuenta todo por un camino independiente desde las filas crudas.

**No commitear los .xlsx.** El repo es público (GitHub Pages) y el Unshipped Report trae
nombres de clientes. Por eso el archivo se pasa por ruta y nunca vive acá.

Si además está el Unshipped Report del mismo día, calcula el committed de la semana en curso
y con eso el LIBRE, que es el segundo número que valida el importer.
"""
import glob
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HTML = os.path.join(ROOT, 'JLZ_Container_Intelligence.html')
DOWNLOADS = os.path.expanduser('~/Downloads')

# El lector de .xlsx ya existe en compare-excel.py y no depende de nada de la app. Se importa
# por ruta (el nombre lleva guion, no es importable) en vez de duplicarlo: un solo lector,
# un solo lugar donde arreglarlo.
_spec = importlib.util.spec_from_file_location('ce', os.path.join(HERE, 'compare-excel.py'))
_ce = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ce)

FUNCS = ['invmParseInventoryReport', 'invmInvReportPlan', 'invmInvReportPhysical', 'invmIsWLot',
         'invmCanonSku', 'invmInvReportIsBpLot', 'bpCcId', 'dmcExcelDate', 'ooDateToISO',
         'dmcNormalizeUnshipped', 'dmcIsUnshippedFormat', 'parseOpenOrders', 'ooClassifySku',
         'ooOriginFromSku', 'productCaseLb', 'dmWeekKey', 'cmCasesInBuyPack', 'dmISOLocal']


def newest(pattern):
    hits = sorted(glob.glob(os.path.join(DOWNLOADS, pattern)), key=os.path.getmtime, reverse=True)
    return hits[0] if hits else None


def rows_of(path):
    """Filas del .xlsx como dicts con el ENCABEZADO como llave, igual que las ve SheetJS."""
    it = _ce.read_rows(path)
    hdr = next(it)
    out = []
    for r in it:
        o = {hdr[c]: v for c, v in r.items() if c in hdr}
        if any(str(v).strip() for v in o.values()):
            out.append(o)
    return out


def js_literal(obj):
    # JSON es JS válido salvo por U+2028/29, que en un literal de JS cortan la línea.
    return json.dumps(obj).replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def block(name, html=None):
    """Un objeto top-level entero (`var X = {` … `};`). extract.py solo saca funciones."""
    out, on = [], False
    with open(html or HTML, encoding='utf-8') as fh:
        for line in fh:
            if line.startswith('var %s = {' % name):
                on = True
            if on:
                out.append(line)
                if line.startswith('};'):
                    break
    if not out or not out[-1].startswith('};'):
        sys.exit('no se pudo extraer el bloque %s del HTML' % name)
    return ''.join(out)


def main():
    argv = sys.argv[1:]
    html = HTML
    if '--html' in argv:                       # correr contra una copia con un bug puesto a mano
        i = argv.index('--html'); html = argv[i + 1]; del argv[i:i + 2]
    args = [a for a in argv if not a.startswith('-')]
    inv = args[0] if len(args) > 0 else newest('Inventory Report-*.xlsx')
    unship = args[1] if len(args) > 1 else newest('Unshipped Sales Order Report-*.xlsx')

    if not inv or not os.path.exists(inv):
        print('  no se encontró ningún "Inventory Report-*.xlsx" en ~/Downloads — salteado')
        print('  (bajalo de WholesaleWare o pasá la ruta: ./tests/inv-report-check.py <archivo>)')
        return 0
    print('  archivo:   %s' % os.path.basename(inv))
    if unship and os.path.exists(unship):
        print('  committed: %s' % os.path.basename(unship))
    else:
        unship = None
        print('  committed: (sin Unshipped Report — no se calcula el libre)')

    tmp = tempfile.mkdtemp()
    app = os.path.join(tmp, 'app.js')
    subprocess.run([sys.executable, os.path.join(HERE, 'extract.py'), html, app] + FUNCS,
                   check=True, stdout=subprocess.DEVNULL)

    parts = [open(os.path.join(HERE, 'stubs.js'), encoding='utf-8').read(),
             open(app, encoding='utf-8').read(),
             block('INVM_BUY_SKUS', html),
             'var ROWS = %s;\n' % js_literal(rows_of(inv)),
             'var UROWS = %s;\n' % js_literal(rows_of(unship) if unship else []),
             open(os.path.join(HERE, 'inv-report-tests.js'), encoding='utf-8').read()]
    run = os.path.join(tmp, 'run.js')
    with open(run, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(parts))

    # JXA manda console.log a stderr y el resultado del script a stdout. Mezclados en un solo
    # canal (como hace run.sh con 2>&1) salen en orden; concatenados, el resultado saldría primero.
    p = subprocess.run(['osascript', '-l', 'JavaScript', run],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    out = p.stdout or ''
    lines = out.rstrip().split('\n')
    if lines and re.fullmatch(r'\d+', lines[-1].strip()):
        lines.pop()                      # el valor que devuelve summary(), que osascript imprime
    out = '\n'.join(lines)
    print(out)
    if '✗' in out or 'FAIL' in out:
        return 1
    if '✓ todo pasa' not in out:
        print('\n  el runner no llegó al final — revisá el error de arriba')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
