#!/usr/bin/env bash
# Local acceptance only. No registry, deployment or production credential writes.
set -euo pipefail
console_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
agent_root=${LENSO_ASSISTANT_AGENT_SOURCE:-$(dirname "$console_root")/lenso-agent}
agent_root=$(cd "$agent_root" && pwd)
fixture_container=""
cleanup() {
  if [[ -n "$fixture_container" ]]; then docker stop "$fixture_container" >/dev/null; fi
}
trap cleanup EXIT
if [[ -z "${LENSO_POSTGRES_TEST_URL:-}" ]]; then
  fixture_container="lenso-assistant-synthetic-$$"
  docker run --detach --rm --name "$fixture_container" --publish 127.0.0.1::5432 \
    --env POSTGRES_PASSWORD=synthetic-console-only --env POSTGRES_DB=lenso_synthetic postgres:16-alpine >/dev/null
  for attempt in {1..60}; do
    if docker exec "$fixture_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    if [[ "$attempt" == 60 ]]; then echo 'Synthetic PostgreSQL did not become ready' >&2; exit 1; fi
    sleep 1
  done
  fixture_port=$(docker port "$fixture_container" 5432/tcp)
  export LENSO_POSTGRES_TEST_URL="postgres://postgres:synthetic-console-only@${fixture_port}/lenso_synthetic"
fi
export CONSOLE_TEST_SECRET=${CONSOLE_TEST_SECRET:-synthetic-console-assistant-signing-key-fixture-only}
if [[ -z "${LENSO_ASSISTANT_AGENT_BINARY:-}" ]]; then
  agent_target=${LENSO_ASSISTANT_AGENT_TARGET:-$agent_root/target}
  (cd "$agent_root"; CARGO_TARGET_DIR="$agent_target" cargo build --locked -p lenso-agent-web --bin lenso-agent-web -j 2)
  export LENSO_ASSISTANT_AGENT_BINARY="$agent_target/debug/lenso-agent-web"
fi
cd "$console_root"
cargo test --locked -p lenso-console-app --lib real_two_login_users_parallel_owned_providers_and_byok -j 2 -- --ignored --exact assistant_multi_user_live::real_two_login_users_parallel_owned_providers_and_byok --nocapture
