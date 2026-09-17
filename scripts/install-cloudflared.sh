#!/bin/sh
set -e

ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)

case "$ARCH" in
  amd64|x86_64) cfArch="amd64" ;;
  arm64|aarch64) cfArch="arm64" ;;
  armhf|armv7*) cfArch="arm" ;;
  i386) cfArch="386" ;;
  *) cfArch="amd64" ;;
esac

echo "Downloading cloudflared for ${cfArch}..."
curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cfArch}" -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
echo "cloudflared successfully installed to /usr/local/bin/cloudflared"
