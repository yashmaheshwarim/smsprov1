#!/bin/bash
cd "D:/smsprov1/Mobile App"

# Kill any existing server
PID=$(netstat -ano 2>/dev/null | findstr :8081 | findstr LISTENING | head -1 | awk '{print $5}')
if [ -n "$PID" ]; then
  taskkill //F //PID $PID 2>/dev/null || true
  sleep 2
fi

# Start server in background
npx expo start --clear --non-interactive 2>&1 &
EXPOPID=$!
echo "Server PID: $EXPOPID"

# Wait for server to be ready
sleep 50

# Try to fetch the Android bundle
echo ""
echo "=== FETCHING ANDROID BUNDLE ==="
curl -v -s -o /tmp/bundle.js -w "\nHTTP_STATUS: %{http_code}\nSIZE: %{size_download} bytes\n" "http://localhost:8081/index.bundle?platform=android&dev=true&minify=false" 2>&1

echo ""
echo "=== FIRST 20 LINES ==="
head -20 /tmp/bundle.js 2>/dev/null

echo ""
echo "=== LAST 30 LINES ==="
tail -30 /tmp/bundle.js 2>/dev/null

# Cleanup
kill $EXPOPID 2>/dev/null || true
wait $EXPOPID 2>/dev/null || true
echo ""
echo "Done"
