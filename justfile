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
    VITE_CONSOLE_MODE=api VITE_CONSOLE_DEV_MODE=production VITE_API_BASE_URL=http://localhost:3000 pnpm dev

console-preview:
    pnpm preview

# Console Service
service-serve:
    pnpm service:serve

service-check:
    pnpm service:check

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
