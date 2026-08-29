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

console-api:
    LENSO_CONSOLE_AGENT_URL=http://127.0.0.1:8788 pnpm dev

console-preview:
    pnpm preview

console-start:
    pnpm start

# Console web
console-fmt: fmt

console-fmt-check: fmt-check

console-lint: lint

console-typecheck: typecheck

console-test: test

console-build: build

console-check: check

release-check:
    just check
