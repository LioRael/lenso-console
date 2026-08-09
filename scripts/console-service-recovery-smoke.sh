#!/bin/sh

set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$repository_root/service/compose.yml"
image_version=${LENSO_CONSOLE_IMAGE_VERSION:-recovery-smoke}
skip_build=${LENSO_CONSOLE_SKIP_BUILD:-0}
result_output=${LENSO_CONSOLE_RECOVERY_DRILL_OUTPUT:-}
source_project="lenso-console-recovery-source-$$"
recovery_project="lenso-console-recovery-target-$$"
source_port=$((34000 + ($$ % 400)))
recovery_port=$((34500 + ($$ % 400)))
work_directory=$(mktemp -d "${TMPDIR:-/tmp}/lenso-console-recovery.XXXXXX")
source_environment="$work_directory/source.env"
recovery_environment="$work_directory/recovery.env"
result_file="$work_directory/result.json"
token='recovery-drill-session'
token_hash='sha256:20e40057722ef2a0d08b31339f9818d28554d4c041b6aec25d533d4f2d86a388'

cleanup() {
  exit_status=$?
  if [ "$exit_status" -ne 0 ]; then
    docker compose --project-name "$source_project" --env-file "$source_environment" \
      --file "$compose_file" ps >&2 || true
    docker compose --project-name "$source_project" --env-file "$source_environment" \
      --file "$compose_file" logs --no-color >&2 || true
    docker compose --project-name "$recovery_project" --env-file "$recovery_environment" \
      --file "$compose_file" ps >&2 || true
    docker compose --project-name "$recovery_project" --env-file "$recovery_environment" \
      --file "$compose_file" logs --no-color >&2 || true
  fi
  docker compose --project-name "$source_project" --env-file "$source_environment" \
    --file "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker compose --project-name "$recovery_project" --env-file "$recovery_environment" \
    --file "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work_directory"
}

trap cleanup EXIT
trap 'exit 130' INT TERM

for command_name in docker curl jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "required command is unavailable: $command_name" >&2
    exit 1
  fi
done

docker info >/dev/null

write_environment() {
  environment_file=$1
  port=$2
  mode=$3
  password=$4
  cat >"$environment_file" <<EOF
LENSO_CONSOLE_VERSION=$image_version
CONSOLE_HTTP_PORT=$port
CONSOLE_PUBLIC_ORIGIN=http://127.0.0.1:$port
POSTGRES_PASSWORD=$password
CONSOLE_DATABASE_URL=postgres://lenso_console:$password@database:5432/lenso_console
CONSOLE_RECOVERY_MODE=$mode
LENSO_MODULE_PLATFORM_STORY_ENABLED=false
EOF
}

source_password="source-recovery-drill-$$"
recovery_password="target-recovery-drill-$$"
write_environment "$source_environment" "$source_port" normal "$source_password"
write_environment "$recovery_environment" "$recovery_port" restore "$recovery_password"

source_compose() {
  docker compose --project-name "$source_project" --env-file "$source_environment" \
    --file "$compose_file" "$@"
}

recovery_compose() {
  docker compose --project-name "$recovery_project" --env-file "$recovery_environment" \
    --file "$compose_file" "$@"
}

wait_for_http() {
  port=$1
  attempt=0
  until curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:$port/health/ready" >/dev/null; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 30 ]; then
      echo "Console did not become reachable on port $port" >&2
      return 1
    fi
    sleep 1
  done
}

assert_workload_mode() {
  port=$1
  expected_mode=$2
  curl --fail --silent --show-error --max-time 5 \
    --header "Authorization: Bearer $token" \
    "http://127.0.0.1:$port/api/console/v1/composition" |
    jq -e --arg expected_mode "$expected_mode" \
      '.schema == "lenso.console-service-composition.v2" and .workloadMode == $expected_mode' \
      >/dev/null
}

assert_authority_mode() {
  port=$1
  expected_mode=$2
  curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:$port/health/authority" |
    jq -e --arg expected_mode "$expected_mode" \
      '.schema == "lenso.console-authority.v1" and .serviceId == "lenso-console" and .workloadMode == $expected_mode' \
      >/dev/null
}

if [ "$skip_build" != 1 ]; then
  source_compose build
fi
source_compose up --detach --wait database
source_compose run --rm migrate

source_compose exec -T database psql --username lenso_console --dbname lenso_console \
  --set ON_ERROR_STOP=1 <<'SQL'
INSERT INTO console.managed_services (
  service_id, service_principal, base_url, enrollment_receipt_digest,
  enrollment_grant_revision, authorization_epoch, enrollment_expires_at_unix_ms,
  enrollment_state, version
) VALUES
  (
    'billing', 'service:billing', 'https://billing.example.test',
    'sha256:' || repeat('a', 64), 1, 0,
    (extract(epoch from now() + interval '1 day') * 1000)::bigint, 'active', 1
  ),
  (
    'support', 'service:support', 'https://support.example.test',
    'sha256:' || repeat('b', 64), 1, 0,
    (extract(epoch from now() + interval '1 day') * 1000)::bigint, 'active', 1
  );

INSERT INTO auth.users (id, created_at)
VALUES ('recovery-drill-operator', now());

INSERT INTO auth.sessions (id, user_id, token_hash, created_at, expires_at)
VALUES (
  'recovery-drill-source-session', 'recovery-drill-operator',
  'sha256:20e40057722ef2a0d08b31339f9818d28554d4c041b6aec25d533d4f2d86a388',
  now(), now() + interval '1 day'
);

INSERT INTO console.console_administrators
  (user_id, role, source, created_by, created_at)
VALUES (
  'recovery-drill-operator', 'superadmin', 'local_recovery',
  'recovery-drill', now()
)
ON CONFLICT (user_id) DO NOTHING;
\q
SQL

source_compose up --detach --wait console
wait_for_http "$source_port"
assert_workload_mode "$source_port" normal
assert_authority_mode "$source_port" normal

source_services=$(curl --fail --silent --show-error --max-time 5 \
  --header "Authorization: Bearer $token" \
  "http://127.0.0.1:$source_port/api/console/v1/services")
printf '%s' "$source_services" | jq -e 'length == 2' >/dev/null

source_snapshot=$(source_compose exec -T database psql --username lenso_console \
  --dbname lenso_console --tuples-only --no-align --command \
  "SELECT jsonb_agg(to_jsonb(s) ORDER BY service_id)::text FROM console.managed_services AS s;")

recovery_compose up --detach --wait database
source_compose exec -T database pg_dump --username lenso_console --dbname lenso_console \
  --format=custom --no-owner --no-privileges --exclude-table-data=auth.sessions |
  recovery_compose exec -T database pg_restore --username lenso_console \
    --dbname lenso_console --exit-on-error --no-owner --no-privileges

recovery_snapshot=$(recovery_compose exec -T database psql --username lenso_console \
  --dbname lenso_console --tuples-only --no-align --command \
  "SELECT jsonb_agg(to_jsonb(s) ORDER BY service_id)::text FROM console.managed_services AS s;")
test "$source_snapshot" = "$recovery_snapshot"

session_count=$(recovery_compose exec -T database psql --username lenso_console \
  --dbname lenso_console --tuples-only --no-align --command \
  "SELECT count(*) FROM auth.sessions;")
test "$(printf '%s' "$session_count" | tr -d '[:space:]')" = 0

recovery_compose exec -T database psql --username lenso_console --dbname lenso_console \
  --set ON_ERROR_STOP=1 --set token_hash="$token_hash" <<'SQL'
INSERT INTO auth.sessions (id, user_id, token_hash, created_at, expires_at)
VALUES (
  'recovery-drill-target-session', 'recovery-drill-operator', :'token_hash',
  now(), now() + interval '1 day'
);
\q
SQL

recovery_compose up --detach --wait console
wait_for_http "$recovery_port"
assert_workload_mode "$recovery_port" restore
assert_authority_mode "$recovery_port" restore

write_environment "$recovery_environment" "$recovery_port" normal "$recovery_password"
recovery_compose up --detach --wait --force-recreate console
wait_for_http "$recovery_port"
assert_workload_mode "$recovery_port" normal
assert_authority_mode "$recovery_port" normal

write_environment "$recovery_environment" "$recovery_port" restore "$recovery_password"
recovery_compose up --detach --wait --force-recreate console
wait_for_http "$recovery_port"
assert_workload_mode "$recovery_port" restore
assert_authority_mode "$recovery_port" restore

jq --null-input \
  --arg source_project "$source_project" \
  --arg recovery_project "$recovery_project" \
  --argjson source_port "$source_port" \
  --argjson recovery_port "$recovery_port" \
  '{
    schema: "lenso.console-recovery-drill.v1",
    status: "passed",
    sourceProject: $source_project,
    recoveryProject: $recovery_project,
    sourcePort: $source_port,
    recoveryPort: $recovery_port,
    checks: [
      "normal_mode_ready",
      "source_normal_mode_reported",
      "source_normal_authority_reported",
      "managed_services_seeded",
      "store_stream_restored",
      "browser_sessions_excluded",
      "restored_mode_reported",
      "restored_authority_reported",
      "activated_normal_mode_reported",
      "activated_normal_authority_reported",
      "refenced_restore_mode_reported",
      "refenced_restore_authority_reported",
      "recovery_fence_reestablished"
    ]
  }' | tee "$result_file"

if [ -n "$result_output" ]; then
  cp "$result_file" "$result_output"
fi
