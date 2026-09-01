#!/usr/bin/env python3
"""Pull named functions out of JLZ_Container_Intelligence.html so they can be tested.

The app is one big HTML file with no build step, so there is nothing to import. This
lifts the requested functions verbatim (by brace matching) into a plain .js file that
the test runner concatenates with stubs and assertions. Because it reads the real file
every run, the tests can never drift out of sync with production code.

Usage: extract.py <html> <out.js> <fnName> [fnName ...]
"""
import re
import sys


def extract(src: str, name: str) -> str:
    m = re.search(r'function\s+' + re.escape(name) + r'\s*\(', src)
    if not m:
        raise SystemExit(f'extract: function {name} not found')
    i = m.start()
    p = src.index('{', m.end() - 1)
    depth = 0
    while True:
        c = src[p]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                break
        p += 1
        if p >= len(src):
            raise SystemExit(f'extract: unbalanced braces in {name}')
    return src[i:p + 1]


def main() -> None:
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    html, out, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    src = open(html, encoding='utf-8').read()
    with open(out, 'w', encoding='utf-8') as fh:
        for n in names:
            fh.write(extract(src, n) + '\n')
    print(f'extracted {len(names)} function(s) -> {out}')


if __name__ == '__main__':
    main()
