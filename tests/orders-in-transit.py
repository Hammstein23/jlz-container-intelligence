#!/usr/bin/env python3
"""Qué está realmente en tránsito: Purchase Transactions × Inventory Report.

    ./tests/orders-in-transit.py                                   # los más nuevos de ~/Downloads
    ./tests/orders-in-transit.py <purchase_transactions.xlsx> <inventory.xlsx>

POR QUÉ ASÍ Y NO CONTRA LA APP. El pipeline de Orders se cura a mano y **no** se sincroniza con
WholesaleWare: una PO cargada allá no aparece sola acá. Así que comparar contra la app solo dice
si la app está al día consigo misma. Los dos archivos son la fuente:

    en tránsito  =  está en Purchase Transactions  ·  y NO tiene lote físico en el Inventory Report

La llave del join es la columna **`PO #`** del Inventory Report (no el `Lot #`: los W-lots llevan
el PO de manufactura y hay que excluirlos, y un lote normal es `<PO>-0001`).

NO USAR la columna `Order Status` del export de compras: dice OPEN en casi todo, incluidas POs de
2024 ya recibidas y consumidas — WholesaleWare no las cierra. La señal buena es `Received Quantity`.

Las canceladas siguen apareciendo como "pedidas y no recibidas", así que quedan bajo su propio
título: entrega vencida sin lote casi siempre es una cancelación, no un contenedor perdido.

**No commitear los .xlsx.** El repo es público y el export trae proveedores y precios.
"""
import sys, os, re, glob, zipfile, datetime
from xml.etree import ElementTree as ET
from collections import defaultdict

M  = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS = {'m': M[1:-1]}


def read_sheet(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter(M + 't')))
    name = sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet'))[0]
    root = ET.fromstring(z.read(name))
    rows = []
    for row in root.iter(M + 'row'):
        vals = {}
        for c in row.findall('m:c', NS):
            ref = re.match(r'([A-Z]+)', c.get('r')).group(1)
            v = c.find('m:v', NS)
            if v is None:
                continue
            vals[ref] = shared[int(v.text)] if c.get('t') == 's' else v.text
        rows.append(vals)
    return rows


def parse_date(s):
    s = str(s or '').strip()
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', s)
    if m:
        return datetime.date(int(m.group(3)), int(m.group(1)), int(m.group(2)))
    try:
        return datetime.date(1899, 12, 30) + datetime.timedelta(days=float(s))
    except Exception:
        return None


def newest(pattern):
    hits = [p for p in glob.glob(os.path.expanduser(pattern))
            if not os.path.basename(p).startswith('~$')]
    return max(hits, key=os.path.getmtime) if hits else None


def main(argv):
    if len(argv) >= 3:
        pt_path, inv_path = argv[1], argv[2]
    else:
        pt_path  = newest('~/Downloads/Purchase_Transactions*.xlsx')
        inv_path = newest('~/Downloads/Inventory Report*.xlsx')
    if not pt_path or not inv_path:
        print('Sin archivos que cruzar (hace falta Purchase_Transactions + Inventory Report).')
        return 0
    print('  compras:   ' + os.path.basename(pt_path))
    print('  inventario: ' + os.path.basename(inv_path))
    print()

    inv = read_sheet(inv_path)
    col = {v: k for k, v in inv[0].items()}
    for needed in ('PO #', 'Lot #'):
        if needed not in col:
            print('El Inventory Report no trae la columna "%s" — cambió el export.' % needed)
            return 1
    fisico = defaultdict(float)
    for d in inv[1:]:
        po  = str(d.get(col['PO #'], '') or '').strip()
        lot = str(d.get(col['Lot #'], '') or '')
        if not po or re.match(r'^W\d', lot):        # W-lot: PO de manufactura, no es compra
            continue
        try:
            fisico[po] += float(d.get(col.get('Qty on Hand (Base UOM)')) or 0)
        except Exception:
            pass

    pt = read_sheet(pt_path)
    by_order = defaultdict(list)
    for d in pt[1:]:
        by_order[d.get('A', '?')].append(d)

    hoy = datetime.date.today()
    transito, vencidas = [], []
    for order, items in by_order.items():
        f = parse_date(items[0].get('D'))
        if not f or f < hoy - datetime.timedelta(days=120):
            continue
        if 'JLZ Produce Manufacturing' in str(items[0].get('B', '')):
            continue                                 # reempaque interno, no es una compra
        recibido = sum(float(i.get('Q') or 0) for i in items)
        if order in fisico or recibido > 0:
            continue                                 # ya llegó
        (vencidas if f < hoy else transito).append((f, order, items))

    def show(rows, title):
        print(title)
        if not rows:
            print('   (ninguna)')
            return
        for f, order, items in sorted(rows):
            for i in items:
                print('   PO %-9s %-11s %-24s %-40s %8s %s' % (
                    order, f.isoformat(), str(items[0].get('B', ''))[:24],
                    str(i.get('H', ''))[:40], i.get('O') or 0, i.get('N', '')))

    show(transito, 'EN TRÁNSITO — pedido, sin lote físico, entrega por delante')
    print()
    show(vencidas, 'ENTREGA VENCIDA sin lote — revisá si están CANCELADAS en WholesaleWare')
    print()
    print('Cargá en Orders las que sean reales y todavía no estén ahí.')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
