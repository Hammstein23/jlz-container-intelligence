#!/usr/bin/env python3
"""Nivel 3: el Excel de WholesaleWare contra lo que cargó la app.

Los tests de run.sh prueban que el modelo es consistente consigo mismo, y el script de
consola que coincide con un recálculo sobre las filas ya cargadas. Ninguno de los dos ve
si el CARGADOR perdió filas al leer el archivo. Esto sí: parsea el .xlsx de cero — sin
openpyxl, sin pandas, sin una línea del código de la app — y suma por semana y producto.

    ./tests/compare-excel.py "~/Downloads/Sales By Account Report-08.31.2026.xlsx"
    ./tests/compare-excel.py <xlsx> --semanas 6

Compará la salida contra la tabla del NIVEL 3 de tests/invariants-console.js. Si cuadran,
el archivo entró completo.

Ojo con lo que esto SÍ y NO prueba: confirma que la app leyó bien el archivo. No confirma
que el archivo sea un extracto completo de WholesaleWare — para eso hay que correr el
reporte de nuevo y comparar contra él.
"""
import argparse
import datetime
import os
import re
import sys
import zipfile
from collections import defaultdict
from xml.etree import ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
EPOCH = datetime.date(1899, 12, 30)          # el "día cero" de Excel
COL = {'type': 'A', 'item': 'C', 'date': 'H', 'units': 'V', 'gross': 'AB'}


def read_rows(path):
    z = zipfile.ZipFile(path)
    sst = []
    if 'xl/sharedStrings.xml' in z.namelist():
        sst = [''.join(t.text or '' for t in si.iter(NS + 't'))
               for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(NS + 'si')]
    sheet = sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n))[0]
    for r in ET.fromstring(z.read(sheet)).iter(NS + 'row'):
        out = {}
        for c in r.iter(NS + 'c'):
            col = re.match(r'[A-Z]+', c.get('r')).group(0)
            t, v, inline = c.get('t'), c.find(NS + 'v'), c.find(NS + 'is')
            if t == 's' and v is not None:
                out[col] = sst[int(v.text)]
            elif t == 'inlineStr' and inline is not None:
                out[col] = ''.join(x.text or '' for x in inline.iter(NS + 't'))
            else:
                out[col] = v.text if v is not None else ''
        yield out


def to_iso(v):
    v = str(v).strip()
    if not v:
        return ''
    if re.match(r'^\d+(\.\d+)?$', v):                       # serial de Excel
        return (EPOCH + datetime.timedelta(days=float(v))).isoformat()
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', v)        # MM/DD/YYYY
    if m:
        return '%s-%02d-%02d' % (m.group(3), int(m.group(1)), int(m.group(2)))
    m = re.match(r'^\d{4}-\d{2}-\d{2}', v)
    return m.group(0) if m else ''


def monday_of(iso):
    d = datetime.date.fromisoformat(iso)
    return (d - datetime.timedelta(days=d.weekday())).isoformat()


def num(v):
    try:
        return float(str(v).replace(',', '').replace('$', '').strip() or 0)
    except ValueError:
        return 0.0


def product_of(item):
    """Clasificación deliberadamente escrita de cero, para no heredar los errores de la app."""
    s = item.lower()
    if 'juice' in s:
        return None
    for name, key in (('ginger', 'ginger'), ('turmeric', 'turmeric'),
                      ('garlic', 'garlic'), ('shallot', 'shallots')):
        if name in s:
            return key
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('xlsx', help='el Sales By Account Report descargado')
    ap.add_argument('--semanas', type=int, default=3, help='cuántas semanas mostrar (default 3)')
    a = ap.parse_args()

    path = os.path.expanduser(a.xlsx)
    if not os.path.exists(path):
        sys.exit('no existe: ' + path)

    rows = read_rows(path)
    next(rows)                                              # encabezados

    agg = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))
    other = defaultdict(lambda: [0.0, 0.0])                 # CREDIT / RETURN
    conventional = defaultdict(lambda: [0.0, 0.0])
    scanned = 0
    for c in rows:
        scanned += 1
        iso = to_iso(c.get(COL['date'], ''))
        if not iso:
            continue
        wk, item = monday_of(iso), (c.get(COL['item'], '') or '')
        prod = product_of(item)
        if prod is None:
            continue
        u, g = num(c.get(COL['units'], '')), num(c.get(COL['gross'], ''))
        kind = (c.get(COL['type'], '') or '').strip()
        if kind != 'Sale':
            other[wk][0] += u; other[wk][1] += g
        elif 'conventional' in item.lower():
            conventional[wk][0] += u; conventional[wk][1] += g
        else:
            agg[wk][prod][0] += u; agg[wk][prod][1] += g

    weeks = sorted(agg)[-a.semanas:]
    print('%s  ·  %d filas\n' % (os.path.basename(path), scanned))
    print('%-12s %-10s %14s %14s' % ('semana', 'producto', 'BILLABLE_UNITS', 'GROSS_SALES'))
    for w in weeks:
        for p in ('ginger', 'turmeric', 'garlic', 'shallots'):
            u, g = agg[w][p]
            if u or g:
                print('%-12s %-10s %14d %14d' % (w, p, round(u), round(g)))
    for label, data in (('creditos/devoluciones', other), ('convencional', conventional)):
        vals = [(w, v) for w, v in sorted(data.items()) if w in weeks and (v[0] or v[1])]
        if vals:
            print('\n%s — en el reporte, NO en la demanda:' % label)
            for w, v in vals:
                print('  %-12s %14d %14d' % (w, round(v[0]), round(v[1])))
    print('\nCompará contra la tabla del NIVEL 3 de tests/invariants-console.js.')


if __name__ == '__main__':
    main()
