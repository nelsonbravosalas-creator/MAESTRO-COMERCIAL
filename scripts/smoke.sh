#!/usr/bin/env bash
# A-09: comprobaciones mínimas post-deploy. Uso:
#   ./scripts/smoke.sh https://tu-app.vercel.app
set -euo pipefail

URL="${1:?Uso: smoke.sh <URL base, sin barra final>}"
FAILED=0

check() {
  local name="$1" path="$2" expected="$3"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL$path" || echo "000")
  if [ "$code" = "$expected" ]; then
    echo "✓ $name ($path -> $code)"
  else
    echo "✗ $name ($path -> $code, esperaba $expected)"
    FAILED=1
  fi
}

echo "Smoke test contra $URL"
echo "---"

# 1. Health check con base de datos real
health_body=$(curl -s --max-time 10 "$URL/api/health" || echo '{}')
if echo "$health_body" | grep -q '"db":"ok"' || echo "$health_body" | grep -q '"db": "ok"'; then
  echo "✓ /api/health responde db:ok"
else
  echo "✗ /api/health no responde db:ok — body: $health_body"
  FAILED=1
fi

# 2. La API enruta de verdad: un GET a una ruta solo-POST debe dar 404 del
# router, no un 500 de una función que murió al arrancar.
check "la API enruta (GET a ruta solo-POST -> 404, no 500)" "/api/auth/login" "404" || true
login_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "$URL/api/auth/login" \
  -H 'content-type: application/json' -d '{"email":"smoke-test@example.invalid","password":"no-existe"}')
if [ "$login_code" = "401" ]; then
  echo "✓ login con credenciales inválidas responde 401"
else
  echo "✗ login con credenciales inválidas respondió $login_code (esperaba 401)"
  FAILED=1
fi

# 3. El frontend sirve el index.html (no un 404 ni una página en blanco)
index_body=$(curl -s --max-time 10 "$URL/" || echo "")
if echo "$index_body" | grep -qi "<div id=\"root\">"; then
  echo "✓ el frontend sirve index.html con el punto de montaje de React"
else
  echo "✗ el frontend no parece estar sirviendo la SPA correctamente"
  FAILED=1
fi

echo "---"
if [ "$FAILED" = "1" ]; then
  echo "SMOKE TEST FALLÓ"
  exit 1
fi
echo "SMOKE TEST OK"
