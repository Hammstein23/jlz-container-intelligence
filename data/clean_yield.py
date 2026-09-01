#!/usr/bin/env python3
"""Clean the parsed yield rows.

What the raw data actually looks like (verified):
  · Input lines WITH weight  = the product being processed (Organic Ginger 30Lbs Premium, etc.)
  · Input lines WITHOUT weight = PACKAGING (RRO-30#, RRO-10#, RRO 30LBS@IPaper — empty boxes).
    Zero weight is correct for those; they must simply never count as product.
  · A few input lines are equipment (Temperature Recorder) and must be dropped outright.
  · ~5% of work orders still end up above 100% because their input product was not fully
    recorded in WholesaleWare. Those are a genuine data gap: excluded and reported, never
    silently kept or back-filled with invented weight.
"""
import json, re
from collections import defaultdict

rows = json.load(open('/tmp/yield_rows.json'))

EQUIPMENT = re.compile(r'Temperature Recorder|SENSITECH', re.I)
PACKAGING = re.compile(r'RRO[\s\-]*\d+\s*#|@IPaper|RRO#\d|Gusset|sticker|Master\b', re.I)

stats = defaultdict(int)
clean = []
for r in rows:
    if r['kind'] == 'input':
        if EQUIPMENT.search(r['body']):
            stats['equipo_excluido'] += 1
            continue
        if r['wt'] <= 0:
            stats['empaque_peso_cero'] += 1      # legitimately weightless — keep out of product lbs
            continue
    clean.append(r)

agg = defaultdict(lambda: dict(in_lb=0.0, out_lb=0.0, cat='', date='', pos=set()))
for r in clean:
    a = agg[r['wo']]
    a['in_lb' if r['kind'] == 'input' else 'out_lb'] += r['wt']
    if r['cat'] and not a['cat']:
        a['cat'] = r['cat']
    if r['date'] and not a['date']:
        a['date'] = r['date']
    if r['po']:
        a['pos'].add(r['po'])

wos, gaps = [], []
for wo, a in agg.items():
    if a['in_lb'] <= 0 or a['out_lb'] <= 0:
        continue
    y = a['out_lb'] / a['in_lb'] * 100
    rec = dict(wo=wo, cat=a['cat'], date=a['date'], in_lb=a['in_lb'], out_lb=a['out_lb'],
               yield_pct=round(y, 1), pos=sorted(a['pos']))
    (gaps if y > 105 else wos).append(rec)

wos.sort(key=lambda x: x['date'])
json.dump(wos, open('/tmp/yield_wos_clean.json', 'w'))
json.dump(gaps, open('/tmp/yield_gaps.json', 'w'))

print("limpieza:", dict(stats))
print(f"WOs válidos: {len(wos)}   ·   con hueco de datos (>105%, excluidos): {len(gaps)}"
      f"   ·   {len(gaps)/(len(wos)+len(gaps))*100:.1f}% del total")

bycat = defaultdict(lambda: [0.0, 0.0, 0])
for w in wos:
    b = bycat[w['cat'] or '?']
    b[0] += w['in_lb']; b[1] += w['out_lb']; b[2] += 1
print("\n=== RENDIMIENTO LIMPIO ===")
for c, (i, o, n) in sorted(bycat.items(), key=lambda x: -x[1][0]):
    print(f"  {c:10} {n:4} WOs  in {i:11,.0f} lb  out {o:11,.0f}  yield {o/i*100:5.1f}%  merma {100-o/i*100:4.1f}%")
