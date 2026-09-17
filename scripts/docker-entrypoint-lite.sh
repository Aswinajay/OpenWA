#!/bin/sh
set -e

echo "[Entrypoint] Initializing OpenWA container..."

# If Cloudflare Named Tunnel token is supplied, start named tunnel in the background with auto-reconnect
if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
  echo "[Cloudflare Tunnel] Starting Cloudflare named tunnel (protocol: http2)..."
  (
    while true; do
      cloudflared tunnel --no-autoupdate --protocol http2 run --token "$CLOUDFLARE_TUNNEL_TOKEN" || true
      echo "[Cloudflare Tunnel] Connection lost, reconnecting in 3s..."
      sleep 3
    done
  ) &
# If quick tunnel flag is enabled, start quick tunnel (trycloudflare.com)
elif [ "$CLOUDFLARE_QUICK_TUNNEL" = "true" ]; then
  echo "[Cloudflare Tunnel] Starting Cloudflare Quick Tunnel on port ${PORT:-2785}..."
  (
    while true; do
      cloudflared tunnel --no-autoupdate --protocol http2 --url "http://localhost:${PORT:-2785}" || true
      echo "[Cloudflare Tunnel] Quick tunnel connection lost, reconnecting in 3s..."
      sleep 3
    done
  ) &
else
  echo "[Cloudflare Tunnel] No tunnel configured. Serving directly on port ${PORT:-2785}."
fi

# Execute CMD arguments or default to node
if [ $# -gt 0 ]; then
  exec "$@"
else
  exec node --optimize-for-size dist/main
fi
