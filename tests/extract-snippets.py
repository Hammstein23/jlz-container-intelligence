#!/usr/bin/env python3
"""Saca los bloques ```javascript de un runbook para poder probarlos.

Los snippets del lunes se pegan a mano en la consola y tocan el inventario real. Probarlos
copiados a un archivo de test no sirve de nada: la copia y el runbook se separan, y el que
se ejecuta es el runbook. Esto lee el .md de verdad, así que un snippet roto ahí rompe el test.

Usage: extract-snippets.py <runbook.md> <out.js> [--names A,B,C]

Cada bloque queda como `SNIPPET_<n>` (string), para que el test lo instrumente y lo evalúe.
"""
import json
import re
import sys


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    md, out = sys.argv[1], sys.argv[2]
    src = open(md, encoding='utf-8').read()
    blocks = re.findall(r'```javascript\n(.*?)```', src, re.S)
    if not blocks:
        raise SystemExit('extract-snippets: no hay bloques ```javascript en ' + md)
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write('// generado por extract-snippets.py desde %s — no editar\n' % md)
        for i, b in enumerate(blocks, 1):
            fh.write('var SNIPPET_%d = %s;\n' % (i, json.dumps(b)))
        fh.write('var SNIPPET_COUNT = %d;\n' % len(blocks))
    print('extracted %d snippet(s) -> %s' % (len(blocks), out))


if __name__ == '__main__':
    main()
