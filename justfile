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

# Apps
console:
    pnpm dev

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

# Console web application
console-fmt: fmt

console-fmt-check: fmt-check

console-lint: lint

console-typecheck: typecheck

console-test: test

console-build: build

console-check: check

create-module name:
    pnpm create:module {{name}}

release-check:
    just check
