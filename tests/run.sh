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

echo "══ Sintaxis de los bloques inline ══════════════════════════════"
python3 "$DIR/syntax-check.py" || FAILED=1
echo

echo "══ Coherencia del descuento contra-orden ══════════════════════"
python3 "$DIR/demand-coherence.py" || FAILED=1
echo

echo "══ Guardián del store de committed ════════════════════════════"
python3 "$DIR/committed-guard.py" || FAILED=1
echo

echo "══ Modelo de demanda ═══════════════════════════════════════════"
python3 "$DIR/extract.py" "$HTML" "$TMP/app.js" \
  dmWeekKey nowcastProductModel dmToggleOther renderBuildupPanel dmEffectiveRunRateLbs \
  dmISOLocal bpFutureWeeks bpWeeksOfCover mtoDetectCandidates mtoNetRows mtoByCustomer mtoCasesPerWeek dmcArrivingOrders ordBoughtForCustomers addDirectShip removeDirectShip directShipTotal getDirectShip _mutateOrderDirectShip bpInvState bpInvMigrateV1 invmProjectionHTML invmOverview cmPlanEntries dmWeekPace bpSnapWeekDemand renderWeekPanel hybridSalesForWeek dsNamesFor dsLabelFor jlzSyncScope getActiveOrigin \
  dmLineOrigins dmLineStats dmProductSeries dmProductMeta dmSeriesCompare dmBuildModel invmDirectShipCases dmFocusRows dmComboSVG dmFmt0 dmMoney2 dmRenderTrendPrice dmWireChartTip cxSpark cxRenderList cxWireSparkTip renderCustomers cxOverrideCard
# Constantes top-level que las funciones extraídas necesitan. extract.py solo saca funciones,
# así que sin esto el test las leería de un stub y estaría probando el stub, no producción.
for _c in DM_SELL_DAYS BP_INV_LS BP_INV_LS_V1; do
  grep -E "^var $_c *=" "$DIR/../JLZ_Container_Intelligence.html" >> "$TMP/app.js" \
    || { echo "  FAIL no se encontró $_c en el HTML"; FAILED=1; }
done

run_suite "demanda" "$TMP/app.js" "$DIR/pure-tests.js"

echo
echo "══ Chequeo de cierre del día ═══════════════════════════════════"
if [ -f "$DIR/orders-check.js" ]; then
  cat "$DIR/stubs.js" "$DIR/orders-check.js" > /dev/null   # existe y es legible
  set +e; osascript -l JavaScript -e "var getOrders=undefined;$(cat "$DIR/orders-check.js")" >/dev/null 2>&1
  rc=$?; set -e
  if [ $rc -ne 0 ]; then echo "  FAIL orders-check.js no parsea"; FAILED=1; else echo "  ok   orders-check.js parsea y sale limpio sin datos"; fi
else
  echo "no se encontró orders-check.js — salteado"
fi

echo
echo "══ Runbook de los lunes ════════════════════════════════════════"
if [ -f "$RUNBOOK" ]; then
  python3 "$DIR/extract-snippets.py" "$RUNBOOK" "$TMP/snippets.js"
  run_suite "lunes" "$TMP/snippets.js" "$DIR/lunes-tests.js"
else
  echo "no se encontró $RUNBOOK — salteado"
fi

exit $FAILED
