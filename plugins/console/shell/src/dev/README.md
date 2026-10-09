# Console frontend development

`pnpm dev` runs the existing Vite loop. The local Agentation toolbar is enabled
after hydration only in development; no MCP endpoint or webhook is configured.

For an application-owned TS service, configure `VITE_CONSOLE_MODE=api`,
`VITE_CONSOLE_DEV_MODE=production` and `VITE_API_BASE_URL` with the backend origin.
The supported example uses `http://127.0.0.1:3100`.

The middleware also accepts an explicitly supplied `LENSO_API_URL_FILE` for a
controller-owned loopback URL. This is a generic development proxy seam, not a
native Engine launcher or a claim of hot-replacement support. A missing, invalid
or symlinked file fails closed with 503. The `/__lenso/backend` readiness probe
does not grant API access. Browser requests retain same-origin authorization
and page owner/revision/implementation guards.

The retired native incremental-dev smoke script and development-kit instructions
are no longer supported. Use the TS host and normal Vite development commands.
