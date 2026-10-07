#!/usr/bin/env bash
set -euo pipefail

LAB_DIR="practices/practice_03/lab"

if [ ! -d "$LAB_DIR" ]; then
  echo "{\"ok\":false,\"error\":\"lab directory not found\"}"
  exit 0
fi

OUT_INSTALL=$(mktemp)
OUT_TEST=$(mktemp)

make -C "$LAB_DIR" install >"$OUT_INSTALL" 2>&1 || true
make -C "$LAB_DIR" test >"$OUT_TEST" 2>&1 || true

RC_INSTALL=0
RC_TEST=0

grep -q "Standard library only: ready" "$OUT_INSTALL" || RC_INSTALL=1
grep -q "OK" "$OUT_TEST" || RC_TEST=1

OK=true
if [ $RC_INSTALL -ne 0 ] || [ $RC_TEST -ne 0 ]; then
  OK=false
fi

printf '{"ok":%s,"install":"' "$OK"
python3 - <<'PY'
import json,sys
print(sys.stdin.read().replace('"','\\"'), end='')
PY
<"$OUT_INSTALL"
printf '","test":"'
python3 - <<'PY'
import json,sys
print(sys.stdin.read().replace('"','\\"'), end='')
PY
<"$OUT_TEST"
printf '"}\n'

rm -f "$OUT_INSTALL" "$OUT_TEST"
