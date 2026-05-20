#!/bin/bash

# Script para probar las nuevas rutas de líneas

echo "🧪 Testing new líneas endpoints..."
echo ""

# Iniciar el servidor en background
echo "🚀 Starting server..."
npm start > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Esperar a que el servidor inicie
sleep 5

# Verificar que el servidor está corriendo
if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "❌ Server failed to start"
  cat /tmp/server.log
  exit 1
fi

echo "✅ Server is running (PID: $SERVER_PID)"
echo ""

# Probar GET /api/v2/lineas
echo "📍 Testing GET /api/v2/lineas..."
LINEAS_RESPONSE=$(curl -s http://localhost:3000/api/v2/lineas)
echo "$LINEAS_RESPONSE" | jq '.' > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ GET /api/v2/lineas - Valid JSON response"
  FIRST_LINEA=$(echo "$LINEAS_RESPONSE" | jq -r '.[0].numero' 2>/dev/null)
  echo "   First line number: $FIRST_LINEA"
else
  echo "❌ GET /api/v2/lineas - Invalid response"
fi
echo ""

# Probar GET /api/v2/lineas/{numero}
if [ -n "$FIRST_LINEA" ] && [ "$FIRST_LINEA" != "null" ]; then
  echo "📍 Testing GET /api/v2/lineas/$FIRST_LINEA..."
  LINEA_DETAIL=$(curl -s http://localhost:3000/api/v2/lineas/$FIRST_LINEA)
  echo "$LINEA_DETAIL" | jq '.' > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "✅ GET /api/v2/lineas/$FIRST_LINEA - Valid JSON response"
    HAS_PARADAS=$(echo "$LINEA_DETAIL" | jq '.paradas | length' 2>/dev/null)
    echo "   Total stops: $HAS_PARADAS"
  else
    echo "❌ GET /api/v2/lineas/$FIRST_LINEA - Invalid response"
  fi
  echo ""
fi

# Probar una línea que no existe
echo "📍 Testing GET /api/v2/lineas/999999 (should 404)..."
INVALID_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/v2/lineas/999999)
HTTP_CODE=$(echo "$INVALID_RESPONSE" | tail -n1)
BODY=$(echo "$INVALID_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "404" ]; then
  echo "✅ GET /api/v2/lineas/999999 - Returns 404 as expected"
else
  echo "⚠️  Got HTTP code: $HTTP_CODE (expected 404)"
fi
echo ""

# Detener el servidor
echo "Stopping server..."
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "✅ All tests completed!"
