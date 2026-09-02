#!/bin/bash
# Corre los tests del modelo de demanda Y los snippets del runbook de los lunes,
# contra el código real (no contra copias).
#
#   ./tests/run.sh                      # el HTML del repo
#   ./tests/run.sh /ruta/copia.html     # otro HTML (para probar que el harness detecta bugs)
#
# No hay build step y `node` normalmente no está en esta máquina, así que corre con
# JavaScriptCore (`osascript -l JavaScript`), que viene con macOS. Sale != 0 si algo falla.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="${1:-$DIR/../JLZ_Container_Intelligence.html}"
RUNBOOK="${2:-$DIR/../.claude/commands/lunes.md}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILED=0

run_suite () {                       # nombre · archivo js a concatenar · archivo de tests
  local name="$1" code="$2" tests="$3"
  cat "$DIR/stubs.js" "$code" "$tests" > "$TMP/run.js"
  set +e
  local out; out="$(osascript -l JavaScript "$TMP/run.js" 2>&1)"
  set -e
  echo "$out"
  if echo "$out" | grep -q '✗'; then FAILED=1; return; fi
  if ! echo "$out" | grep -q '✓ todo pasa'; then
    echo; echo "[$name] el runner no llegó al final — revisá el error de arriba"; FAILED=1
  fi
}

echo "══ Modelo de demanda ═══════════════════════════════════════════"
python3 "$DIR/extract.py" "$HTML" "$TMP/app.js" \
  dmWeekKey nowcastProductModel dmToggleOther renderBuildupPanel dmEffectiveRunRateLbs \
  dmISOLocal bpFutureWeeks
run_suite "demanda" "$TMP/app.js" "$DIR/pure-tests.js"

echo
echo "══ Runbook de los lunes ════════════════════════════════════════"
if [ -f "$RUNBOOK" ]; then
  python3 "$DIR/extract-snippets.py" "$RUNBOOK" "$TMP/snippets.js"
  run_suite "lunes" "$TMP/snippets.js" "$DIR/lunes-tests.js"
else
  echo "no se encontró $RUNBOOK — salteado"
fi

exit $FAILED
