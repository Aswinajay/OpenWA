#!/bin/sh
set -e

# If Cloudflare Named Tunnel token is supplied, start named tunnel in the background
if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
  echo "[Cloudflare Tunnel] Starting Cloudflare named tunnel..."
  cloudflared tunnel --no-autoupdate run --token "$CLOUDFLARE_TUNNEL_TOKEN" &
# If quick tunnel flag is enabled, start quick tunnel (trycloudflare.com)
elif [ "$CLOUDFLARE_QUICK_TUNNEL" = "true" ]; then
  echo "[Cloudflare Tunnel] Starting Cloudflare Quick Tunnel on port ${PORT:-2785}..."
  cloudflared tunnel --no-autoupdate --url "http://localhost:${PORT:-2785}" &
fi

exec node --optimize-for-size dist/main
