#!/usr/bin/env sh
set -eu

api_base="${VITE_API_BASE_URL:-${API_BASE_URL:-http://localhost:3000}}"

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

get_api() {
    path="$1"
    curl --noproxy "*" -fsS "$api_base$path"
}

require_cmd curl
require_cmd jq

echo "Console API QA: $api_base"

if ! get_api "/livez" | jq -e '.status == "healthy"' >/dev/null; then
    cat >&2 <<EOF
Console API QA could not reach $api_base/livez.

Start the local API first:
  cd ../lenso
  just db-up
  just migrate
  just api

Then run from the Lenso Console repository root:
  just console-api-qa
EOF
    exit 1
fi

if ! get_api "/readyz" | jq -e '.status == "healthy"' >/dev/null; then
    cat >&2 <<EOF
Console API QA reached /livez but /readyz is not healthy.

Check local database and migrations:
  cd ../lenso
  just db-up
  just migrate
  just api
EOF
    exit 1
fi

sh scripts/console-api-fixture.sh
sh scripts/console-api-smoke.sh

cat <<EOF
Console API QA passed.

Optional manual pass:
  run Lenso Console from this repository
  check /operations/queues
  check /operations/functions
  check /operations/dead-letters
  check /operations/remote-calls
EOF
