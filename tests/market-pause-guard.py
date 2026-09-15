#!/usr/bin/env python3
"""Una línea sin producto en el mercado: sus semanas no promedian y nadie sugiere comprarla.

Regla acordada con Juan el 2026-09-15 (ver CLAUDE.md, "Verdades de datos"): cero ventas porque no había
qué vender no es cero demanda. Hasta 6 semanas fuera se sigue el ritmo de antes; más de 6, el run-rate
arranca de cero con la campaña nueva y las primeras 4 semanas usa el estimado de arranque.

Los tests prueban la regla. Este guardián cuida lo que un test no ve: que TODOS los caminos que promedian
semanas o sugieren compra pasen por ella. Un camino nuevo que se la saltee vuelve a promediar los ceros de
cuando no había producto —y compra de menos justo cuando vuelve— sin que nada falle.
"""
import re, sys, pathlib

HTML = sys.argv[1] if len(sys.argv) > 1 else str(pathlib.Path(__file__).parent.parent / 'JLZ_Container_Intelligence.html')
src = pathlib.Path(HTML).read_text(encoding='utf-8')
claude = (pathlib.Path(__file__).parent.parent / 'CLAUDE.md').read_text(encoding='utf-8')
fails = []
def ok(m):  print('  ok   ' + m)
def bad(m): fails.append(m); print('  FAIL ' + m)

def cuerpo(nombre):
    m = re.search(r'\nfunction ' + re.escape(nombre) + r'\(.*?\n\}', src, re.S)
    return m.group(0) if m else ''

# ── La regla, con sus números ──────────────────────────────────────────────────────────────────────
if re.search(r"^var MKT_LS = '[^']+', MKT_LONG_DAYS = 42, MKT_EST_WEEKS = 4;", src, re.M):
    ok('corte largo = más de 42 días; estimado = 4 semanas')
else:
    bad('cambiaron los números de la regla (42 días / 4 semanas): eso se habla con Juan antes')
nota = re.search(r"^var MKT_RULE_NOTE = '([^']+)';", src, re.M)
if nota and '6 weeks' in nota.group(1) and '4 weeks' in nota.group(1):
    ok('la nota de la regla está en la app, con sus números')
else:
    bad('la nota de la regla ya no dice 6 y 4 semanas en la app')
if 'no disponible en el mercado' in claude.lower() and '6 semanas' in claude and '4 semanas' in claude:
    ok('y en CLAUDE.md')
else:
    bad('CLAUDE.md perdió la regla de la línea sin producto en el mercado')

# ── Donde se promedian semanas ─────────────────────────────────────────────────────────────────────
for fn in ('dmBuildModel', 'nowcastProductModel', 'invmStockableWeekly'):
    if 'mktWeekFilter(' in cuerpo(fn): ok('%s saca las semanas sin producto' % fn)
    else: bad('%s ya no pasa por mktWeekFilter: vuelve a promediar los ceros de cuando no había' % fn)
if 'function dmBuildModel(raw, weeklyOnly, caseLb, prodKey, origin){' in src:
    ok('dmBuildModel recibe el origen de la línea')
else:
    bad('dmBuildModel ya no recibe el origen: la marca de Hawaii no llega o se aplica a Fiji')

def args(texto, desde):
    """Argumentos de la llamada que abre en `desde` (el índice del paréntesis), respetando anidamiento."""
    prof, actual, out, i = 0, '', [], desde
    en = None
    while i < len(texto):
        c = texto[i]
        if en:
            actual += c
            if c == en and texto[i-1] != '\\': en = None
        elif c in '\'"':
            en = c; actual += c
        elif c in '([{':
            prof += 1
            if prof > 1: actual += c
        elif c in ')]}':
            prof -= 1
            if prof == 0:
                out.append(actual.strip()); return out
            actual += c
        elif c == ',' and prof == 1:
            out.append(actual.strip()); actual = ''
        else:
            actual += c
        i += 1
    return out

sin_origen = []
for m in re.finditer(r'(?<!function )\bdmBuildModel\(', src):
    a = args(src, m.end() - 1)
    if a[:1] == ['[]']: continue                     # el modelo vacío no tiene semanas que filtrar
    if len(a) < 5: sin_origen.append(src.count('\n', 0, m.start()) + 1)
if sin_origen:
    bad('dmBuildModel sin origen en las líneas %s: esas vistas ignoran las marcas' % sin_origen)
else:
    ok('todas las llamadas a dmBuildModel pasan el origen')
if "dmBuildModel(rows, weeklyOnly, cl, k, origin || 'all')" in cuerpo('dmBuild'):
    ok('dmBuild también (el modelo de ginger del Buy Planner sale de ahí)')
else:
    bad('dmBuild no pasa el origen: el plan de ginger ignora la marca de Perú')

# ── El estimado de arranque ────────────────────────────────────────────────────────────────────────
for fn in ('invmProductStats', 'dmEffectiveRunRateLbs'):
    if 'mktStartEstimate(' in cuerpo(fn): ok('%s usa el estimado de arranque' % fn)
    else: bad('%s ya no usa el estimado: tras un corte largo el plan arranca con demanda 0' % fn)

# ── Nadie sugiere comprar lo que no hay ────────────────────────────────────────────────────────────
bs = cuerpo('invmBuySuggestion')
if 'mktPauseActive(' in bs and re.search(r'_res\.buy=0', bs): ok('la sugerencia de compra queda en 0')
else: bad('invmBuySuggestion ya no apaga la compra de una línea sin producto')
if 'mktPauseActive(' in cuerpo('invmOrderCases'): ok('el camino de respaldo del número de compra también')
else: bad('invmOrderCases puede sugerir compra de una línea sin producto por el respaldo')
if "g.paused" in cuerpo('invmBuySuggestionHTML') and "d.paused" in cuerpo('bpGingerSuggestionHTML'):
    ok('las dos tarjetas de compra lo dicen')
else:
    bad('alguna tarjeta de compra ya no dice que no hay producto')
_bpd = re.search(r"window\._bpDigest = \{(.*?)\n  \};", src, re.S)          # hasta el cierre del objeto, no del archivo
_smd = re.search(r"window\._simDigest = \{ scenario:true(.*?)\};", src, re.S)
if _bpd and 'paused:' in _bpd.group(1) and _smd and 'paused:' in _smd.group(1):
    ok('el digest de ginger del Buy Planner y del Simulator llevan la marca')
else:
    bad('un digest de ginger no lleva la marca: Home o el Simulator sugieren comprar')
if "chip = 'NOT AVAILABLE'" in cuerpo('renderHome'): ok('Home lo dice')
else: bad('Home ya no dice que ginger-Perú no está en el mercado')
if 'Not available in the market right now' in cuerpo('codyEmailText') and 'paused' in cuerpo('codyDraftData'):
    ok('el precorreo de Cody lo dice aparte')
else:
    bad('el precorreo de Cody mezcla lo que no hay con lo que no hace falta')

# ── Dónde se marca ─────────────────────────────────────────────────────────────────────────────────
if src.count('mktControlHTML(s.p, s.origin)') >= 2 and len(re.findall(r"mktControlHTML\('ginger',\s*'Peru'\)", src)) >= 2:
    ok('se puede marcar en Buy Planner y Simulator, ginger-Perú incluido')
else:
    bad('falta la barra para marcar la línea en alguna vista')
# La tarjeta de compra de ginger solo se repinta cuando hay faltante: la barra no puede vivir en esa rama,
# o con ginger cubierto no hay dónde marcarlo. Va pegada al digest, que se arma siempre.
if _bpd and "getElementById('bp-ginger-market')" in src[_bpd.end():_bpd.end() + 400]:
    ok('la barra de ginger-Perú se pinta haya faltante o no')
else:
    bad('la barra de ginger-Perú quedó dentro de una rama: con ginger cubierto no se puede marcar')
if '<div id="bp-ginger-market"></div>' in src and '<div id="sim-ginger-market"></div>' in src:
    ok('ginger-Perú tiene dónde mostrarla')
else:
    bad('falta el contenedor de la barra de ginger-Perú')
pull = cuerpo('pullSettingsFromSheet') or (re.search(r'async function pullSettingsFromSheet\(\).*?\n\}', src, re.S) or [''])[0]
if 'marketPauses' in pull and 'mktRerender()' in pull:
    ok('las marcas de otro equipo rearman el modelo al llegar de la hoja')
else:
    bad('una marca puesta por Michael no rearma el modelo de Juan hasta recargar ventas')

print()
if fails:
    print('  %d problema(s): una línea sin producto vuelve a promediar ceros o a sugerir compra' % len(fails)); sys.exit(1)
print('  ok   las semanas sin producto no promedian y nadie sugiere comprar lo que no hay')
