#!/usr/bin/env python3
"""Sintaxis de TODOS los bloques <script> inline, no solo el más grande.

El 2026-09-04 un apóstrofo sin escapar ("this customer's confirmed order") entró en una cadena JS
delimitada por comillas simples y el chequeo manual no lo vio: se estaba revisando únicamente el
bloque de mayor tamaño, y esa línea vivía en otro. El archivo tiene diez bloques; hay que mirarlos
todos, siempre.

Un SyntaxError falla. Un ReferenceError de runtime es esperable y se ignora: acá solo se parsea.
"""
import io, os, re, subprocess, sys, tempfile

SRC = os.path.join(os.path.dirname(__file__), '..', 'JLZ_Container_Intelligence.html')
src = io.open(SRC, encoding='utf8').read()
blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', src, re.S)

bad = 0
for i, b in enumerate(blocks):
    if len(b.strip()) < 20:
        continue
    d = tempfile.mkdtemp()
    f = os.path.join(d, 'b.js')
    io.open(f, 'w', encoding='utf8').write('var window={},document={},localStorage={};\n' + b)
    r = subprocess.run(['osascript', '-l', 'JavaScript', f], capture_output=True, text=True)
    if 'SyntaxError' in (r.stderr or ''):
        print('  FAIL bloque %d (%d chars): %s' % (i, len(b), (r.stderr or '').strip()[:220]))
        bad = 1

o, c = len(re.findall(r'<div\b', src)), len(re.findall(r'</div>', src))
if bad:
    sys.exit(1)
print('  ok   sintaxis: %d bloques <script>, todos parsean' % len(blocks))
print('  ok   divs: %d abiertos / %d cerrados (%+d)' % (o, c, o - c))
