#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
project_name="lenso-console-smoke-$$"
http_port=$((33000 + ($$ % 1000)))
environment_file=$(mktemp "${TMPDIR:-/tmp}/lenso-console-smoke.XXXXXX")
extensions_dir=$(mktemp -d "${TMPDIR:-/tmp}/lenso-console-extensions.XXXXXX")
compose_file="$repository_root/service/compose.yml"

cleanup() {
  docker compose \
    --project-name "$project_name" \
    --env-file "$environment_file" \
    --file "$compose_file" \
    down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$environment_file" "$environment_file.story-response"
  rm -rf "$extensions_dir"
}
trap cleanup EXIT INT TERM

mkdir -p "$extensions_dir/runtime/smoke"
cat >"$extensions_dir/registry.json" <<'EOF'
{
  "version": 1,
  "bundles": [
    {
      "packageName": "@lenso/smoke-console",
      "exportName": "smokeConsoleModule",
      "entry": "/extensions/runtime/smoke/entry.js",
      "hostApi": "1"
    }
  ]
}
EOF
printf '%s\n' 'export const smokeConsoleModule = { id: "smoke", surfaces: [] };' >"$extensions_dir/runtime/smoke/entry.js"

{
  printf '%s\n' 'POSTGRES_PASSWORD=container-smoke-password'
  printf '%s\n' 'CONSOLE_DATABASE_URL=postgres://lenso_console:container-smoke-password@database:5432/lenso_console'
  printf '%s\n' 'CONSOLE_RECOVERY_MODE=normal'
  printf 'CONSOLE_EXTENSIONS_PATH=%s\n' "$extensions_dir"
  printf '%s\n' 'LENSO_MODULE_PLATFORM_STORY_ENABLED=false'
  printf 'CONSOLE_PUBLIC_ORIGIN=http://127.0.0.1:%s\n' "$http_port"
  printf 'CONSOLE_HTTP_PORT=%s\n' "$http_port"
  printf '%s\n' 'LENSO_CONSOLE_VERSION=smoke'
} >"$environment_file"

docker compose \
  --project-name "$project_name" \
  --env-file "$environment_file" \
  --file "$compose_file" \
  up --build --detach

attempt=0
until curl --fail --silent --show-error "http://127.0.0.1:$http_port/health/ready" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    docker compose \
      --project-name "$project_name" \
      --env-file "$environment_file" \
      --file "$compose_file" \
      ps
    docker compose \
      --project-name "$project_name" \
      --env-file "$environment_file" \
      --file "$compose_file" \
      logs --no-color console migrate
    exit 1
  fi
  sleep 2
done

curl --fail --silent --show-error "http://127.0.0.1:$http_port/" | grep -q '<title>Lenso Console</title>'
curl --fail --silent --show-error "http://127.0.0.1:$http_port/system/services" | grep -q '<title>Lenso Console</title>'
curl --fail --silent --show-error "http://127.0.0.1:$http_port/extensions/registry.json" | grep -q '@lenso/smoke-console'
curl --fail --silent --show-error "http://127.0.0.1:$http_port/extensions/runtime/smoke/entry.js" | grep -q 'smokeConsoleModule'

unknown_status=$(curl --output /dev/null --silent --write-out '%{http_code}' "http://127.0.0.1:$http_port/api/console/v1/unknown")
if [ "$unknown_status" != "404" ]; then
  printf 'expected unknown Console API route to return 404, got %s\n' "$unknown_status" >&2
  exit 1
fi

api_content_type=$(curl --head --silent "http://127.0.0.1:$http_port/api/console/v1/services" | tr -d '\r' | awk 'tolower($1) == "content-type:" { print tolower($2) }')
case "$api_content_type" in
  application/problem+json*) ;;
  *)
    printf 'expected protected Console API to return problem JSON, got %s\n' "$api_content_type" >&2
    exit 1
    ;;
esac

story_status=$(curl --output "$environment_file.story-response" --silent --write-out '%{http_code}' "http://127.0.0.1:$http_port/admin/runtime/stories")
if [ "$story_status" != "401" ]; then
  printf 'expected Console-owned Story route to require authentication, got %s\n' "$story_status" >&2
  exit 1
fi
story_content_type=$(curl --head --silent "http://127.0.0.1:$http_port/admin/runtime/stories" | tr -d '\r' | awk 'tolower($1) == "content-type:" { print tolower($2) }')
case "$story_content_type" in
  application/problem+json*) ;;
  *)
    printf 'expected protected Story route to return problem JSON, got %s\n' "$story_content_type" >&2
    exit 1
    ;;
esac

printf 'Console Service container smoke passed on port %s.\n' "$http_port"
