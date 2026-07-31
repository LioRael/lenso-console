set dotenv-load := true

default:
    @just --list

# Dependencies
install:
    pnpm install

install-ci:
    CI=true pnpm install --frozen-lockfile

# Quality gates
fmt:
    pnpm format

fmt-check:
    pnpm format:check

lint:
    pnpm lint

typecheck:
    pnpm typecheck

test:
    pnpm test

build:
    pnpm build

check:
    pnpm check

package-readiness:
    pnpm package-readiness

# Apps
console:
    pnpm dev

console-api:
    VITE_RUNTIME_CONSOLE_MODE=api VITE_API_BASE_URL=http://localhost:3000 pnpm dev

console-api-fixture:
    pnpm console-api-fixture

console-api-smoke:
    pnpm console-api-smoke

console-api-qa:
    pnpm console-api-qa

console-preview:
    pnpm preview

# Independent Console Service
service-api:
    pnpm service:api

service-worker:
    pnpm service:worker

service-migrate:
    pnpm service:migrate

service-serve:
    pnpm service:serve

service-check:
    pnpm service:check

# Console packages
console-fmt: fmt

console-fmt-check: fmt-check

console-lint: lint

console-typecheck: typecheck

console-test: test

console-build: build

console-check: check

check-console-packages:
    pnpm check:console-packages

create-console-package name:
    pnpm create:console-package {{name}}

create-module name:
    pnpm create:module {{name}}

release-check:
    just check
