#!/bin/bash
# Run the demand-model invariant tests against the real code in the HTML file.
#
#   ./tests/run.sh
#
# There is no build step and node is usually not installed on this machine, so the
# functions under test are lifted out of the HTML and run through JavaScriptCore
# (osascript -l JavaScript), which ships with macOS. Exits non-zero if anything fails.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="${1:-$DIR/../JLZ_Container_Intelligence.html}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 "$DIR/extract.py" "$HTML" "$TMP/app.js" \
  dmWeekKey nowcastProductModel dmToggleOther renderBuildupPanel

cat "$DIR/stubs.js" "$TMP/app.js" "$DIR/pure-tests.js" > "$TMP/run.js"

set +e
OUT="$(osascript -l JavaScript "$TMP/run.js" 2>&1)"
set -e
echo "$OUT"

if echo "$OUT" | grep -q '✗'; then exit 1; fi
if ! echo "$OUT" | grep -q '✓ todo pasa'; then
  echo; echo "el runner no llegó al final — revisá el error de arriba"; exit 1
fi
