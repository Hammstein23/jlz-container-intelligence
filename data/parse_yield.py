#!/usr/bin/env python3
"""Parse the WholesaleWare Work Order Production/Yield Detail Report (PDF text).

Inputs section  = raw material consumed per work order (lot # carries the PO)
Outputs section = finished product produced per work order
yield per WO    = output lbs / input lbs
"""
import re, json, sys
from collections import defaultdict

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/yield_raw.txt'
t = open(SRC).read()

i_in = t.find('\nInputs')
i_out = t.find('\nOutputs')
assert i_in > 0 and i_out > i_in, "no encontré las secciones Inputs/Outputs"
sec = {'input': t[i_in:i_out], 'output': t[i_out:]}

STATUS = r'(Completed|In Progress|Cancelled|Not Started)'
REC = re.compile(STATUS + r'\s+(\d{2}/\d{2}/\d{4})\s+(.*?)(?=' + STATUS + r'\s+\d{2}/\d{2}/\d{4}|SUBTOTAL|TOTAL\s|\Z)', re.S)

def clean(s):
    return re.sub(r'\s+', ' ', s).strip()

def parse_tail(body):
    """Trailing fields: WT PLAN.QTY [ACT.QTY] [UOM] #PALLETS.
    The UOM is often blank (garlic) and ACT.QTY only present sometimes, so both are optional."""
    m = re.search(
        r'([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)(?:\s+([\d,]+(?:\.\d+)?))?'
        r'(?:\s+([A-Za-z]+))?\s+([\d,]+)\s*$', body)
    if not m:
        return None
    num = lambda x: float(x.replace(',', ''))
    wt = num(m.group(1))
    qty = num(m.group(3)) if m.group(3) else num(m.group(2))   # prefer ACT.QTY when present
    return wt, qty, (m.group(4) or '')

def parse_wo_lot(body):
    """WO# is a 4-digit token; LOT# follows it (may carry the PO)."""
    m = re.search(r'\b(\d{4})\s+((?:W[\dA-Z]+|\d{6,7})[-\dA-Z]*)', body)
    if m:
        return m.group(1), m.group(2)
    m = re.search(r'\b(\d{4})\b', body)
    return (m.group(1), '') if m else (None, '')

CATS = ['Ginger', 'Turmeric', 'Garlic', 'Onions', 'Others', 'Retail']

rows = []
for kind, txt in sec.items():
    for m in REC.finditer(txt):
        body = clean(m.group(3))
        tail = parse_tail(body)
        if not tail:
            continue
        wt, qty, uom = tail
        wo, lot = parse_wo_lot(body)
        if not wo:
            continue
        cat = next((c for c in CATS if re.search(r'\b' + c + r'\b', body)), '')
        # PO = leading digits of the lot (real lots only; W-lots are placeholders)
        po = ''
        mp = re.match(r'^(\d{6,7})-', lot)
        if mp:
            po = mp.group(1)
        rows.append(dict(kind=kind, status=m.group(1), date=m.group(2), wo=wo, lot=lot,
                         po=po, cat=cat, wt=wt, qty=qty, uom=uom, body=body[:120]))

print(f"registros parseados: {len(rows)}  (inputs={sum(1 for r in rows if r['kind']=='input')}, "
      f"outputs={sum(1 for r in rows if r['kind']=='output')})")

# ── yield por work order ──
agg = defaultdict(lambda: dict(in_lb=0.0, out_lb=0.0, cat='', date='', pos=set()))
for r in rows:
    a = agg[r['wo']]
    a['in_lb' if r['kind'] == 'input' else 'out_lb'] += r['wt']
    if r['cat'] and not a['cat']:
        a['cat'] = r['cat']
    if r['date'] and not a['date']:
        a['date'] = r['date']
    if r['po']:
        a['pos'].add(r['po'])

wos = []
for wo, a in agg.items():
    if a['in_lb'] > 0 and a['out_lb'] > 0:
        wos.append(dict(wo=wo, cat=a['cat'], date=a['date'],
                        in_lb=a['in_lb'], out_lb=a['out_lb'],
                        yield_pct=round(a['out_lb'] / a['in_lb'] * 100, 1),
                        pos=sorted(a['pos'])))
wos.sort(key=lambda x: x['date'])
print(f"work orders con input y output: {len(wos)}")

json.dump(rows, open('/tmp/yield_rows.json', 'w'))
json.dump(wos, open('/tmp/yield_wos.json', 'w'))

print("\n=== rendimiento por categoría ===")
bycat = defaultdict(lambda: [0.0, 0.0, 0])
for w in wos:
    b = bycat[w['cat'] or '?']
    b[0] += w['in_lb']; b[1] += w['out_lb']; b[2] += 1
for c, (i, o, n) in sorted(bycat.items(), key=lambda x: -x[1][0]):
    print(f"  {c:10} {n:4} WOs   in {i:11,.0f} lb   out {o:11,.0f} lb   yield {o/i*100:5.1f}%")

print("\n=== muestra de WOs ===")
for w in wos[:8]:
    print(f"  {w['date']}  WO {w['wo']:>5}  {w['cat']:9} in {w['in_lb']:8,.0f}  out {w['out_lb']:8,.0f}  "
          f"yield {w['yield_pct']:5.1f}%  PO {','.join(w['pos']) or '—'}")
