#!/bin/sh
# Build the image from this checkout with the Git-derived versions and start the stack.
#   scripts/up.sh            # docker/compose.yml (one container, embedded Meilisearch)
#   scripts/up.sh --caddy    # + docker/compose.caddy.yml (HTTPS with $DOMAIN)
# Extra arguments go to `docker compose up` (e.g. scripts/up.sh --force-recreate).
# Needs git history (the versions count commits) and Node 24; reads docker/.env like plain compose.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FILES="-f $ROOT/docker/compose.yml"
if [ "${1:-}" = "--caddy" ]; then
  FILES="$FILES -f $ROOT/docker/compose.caddy.yml"
  shift
fi
APP_VERSION=$(node "$ROOT/scripts/version.mjs" --app "$ROOT")
EXTENSION_VERSION=$(node "$ROOT/scripts/version.mjs" --extension "$ROOT")
export APP_VERSION EXTENSION_VERSION
echo "Recorte app $APP_VERSION, extension $EXTENSION_VERSION"
# shellcheck disable=SC2086
exec docker compose $FILES up -d --build "$@"
