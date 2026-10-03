# Console frontend with App dev

Keep the existing Vite development loop. To embed this Shell in an App's
explicit `frontend/lenso.dev.toml` process, start Vite with the Shell as its
root and this repository's `apps/shell/vite.config.ts`. The App controller
supplies `LENSO_API_URL_FILE`; no generated Plan or Descriptor is authored.

The development middleware implements the existing `/__lenso/backend`
readiness handshake and reads the active backend URL for each API request.
Backend replacement does not restart Vite. A configured URL file takes
precedence over `LENSO_CONSOLE_DEV_HOST`; a missing, invalid or symlinked file
returns 503. The file must contain a bounded HTTP loopback URL.

For a standalone Shell, `LENSO_CONSOLE_DEV_HOST` retains its existing behavior.
Browser API requests still require the existing same-origin authorization;
the local controller's read-only readiness probe does not grant API access.
The proxy retains page owner, revision and implementation guards so the selected
backend can reject a retired mount before dispatch; these headers grant no authority.
Console page conventions in the development kit retain their current build
semantics. This integration covers the selected Shell frontend dev process,
not hot replacement of generated Workspace service Plugins.

Optional real-browser evidence (requires a prepared Core incremental-dev example):

```sh
node tooling/devloop-smoke.mjs --cli /path/to/lenso \
  --app /path/to/lenso/examples/incremental-dev --out /tmp/console-feedback.json
```

The probe uses mock Shell data, a real native App and real Vite/browser reload.
It instruments a temporary frontend dependency, waits for the updated page to
finish loading and checks that the backend generation and native artifacts did
not change. Existing frontend configuration is never overwritten. A diagnostic
`--chromium /path/to/browser` override is available; it is not pinned CI evidence.
