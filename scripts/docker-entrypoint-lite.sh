#!/bin/sh
set -e

echo "[Entrypoint] Initializing OpenWA container..."
echo "[Server] Serving directly on port ${PORT:-2785}."

# Execute CMD arguments or default to node
if [ $# -gt 0 ]; then
  exec "$@"
else
  exec node dist/main
fi
