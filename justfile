set dotenv-load := true

default:
    @just --list

# Dependencies
install:
    bun install

install-ci:
    CI=true bun install --frozen-lockfile

# Quality gates
fmt:
    bun run format

fmt-check:
    bun run format:check

lint:
    bun run lint

typecheck:
    bun run typecheck

test:
    bun run test

build:
    bun run build

check:
    bun run check

# Apps
console:
    bun run dev

console-api:
    VITE_CONSOLE_MODE=api VITE_CONSOLE_DEV_MODE=production VITE_API_BASE_URL=http://127.0.0.1:3100 bun run dev

console-preview:
    bun run preview

# Console Service
service-serve:
    bun run service:serve

service-check:
    bun run service:check

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
