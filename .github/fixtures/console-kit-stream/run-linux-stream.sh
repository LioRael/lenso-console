#!/usr/bin/env bash
set -euo pipefail
# Run from a copy of this handoff directory, after exact artifact download.
# Argument is the directory containing the downloaded original tar archive.
handoff="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
downloads="$(cd -- "$1" && pwd -P)"
cd "$handoff"
sha256sum --check fixture-files.sha256
archive="$downloads/console-development-host-x86_64-unknown-linux-gnu.tar.gz"
printf '%s  %s\n' '017a95ab9f155b1eaed3912cabfc8b102420b379bc8210e73a36a25ef8e15af9' "$archive" | sha256sum --check -
mkdir -p extracted
tar -xzf "$archive" -C extracted
kit="$handoff/extracted/development-host"
printf '%s  %s\n' '43a31543683be172cf80b485e42efc9c647ec5d1e5711d2b853699a72e0a19fe' "$kit/console-host" | sha256sum --check -
printf '%s  %s\n' '69c5d5e35ace48cda063c35631c4bda5cde3e8c362d2c36b3c14294798c04202' "$kit/build-inputs/generated-host/Cargo.lock" | sha256sum --check -
test "$(node --version)" = 'v24.18.0'
test "$("$kit/bin/bun" --version)" = '1.4.2'
# Normal public locked dependency installation; no new tool installation.
(cd fixture && "$kit/bin/bun" install --frozen-lockfile) > dependency-install.log 2>&1
sha256sum --check fixture-files.sha256
set +e
node fixture/driver.mjs "$kit" > actual-kit-driver.log 2>&1
driver_status=$?
set -e
printf '{"exit_code":%s}\n' "$driver_status" > driver-exit.json
test "$driver_status" -eq 0
node --input-type=module -e 'import fs from "node:fs";import assert from "node:assert/strict";const r=JSON.parse(fs.readFileSync("fixture/actual-kit-stream-receipt.json","utf8"));assert.equal(r.passed,true);assert.equal(r.stage,"passed");assert.deepEqual(r.statistics,{subscribeCalls:3,opened:2,denied:1,cancelled:1,terminal:1,messages:3});'
sha256sum --check fixture-files.sha256
