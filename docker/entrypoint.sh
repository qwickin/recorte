#!/bin/sh
set -e
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR" 2>/dev/null || true
if [ ! -w "$DATA_DIR" ]; then
  echo "Recorte: $DATA_DIR is not writable by uid $(id -u)." >&2
  echo "On the host, run: sudo chown -R $(id -u):$(id -g) ./data   (next to compose.yml)" >&2
  exit 1
fi
exec "$@"
