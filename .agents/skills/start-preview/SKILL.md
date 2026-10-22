---
name: start-preview
description: Start the existing console development preview, verify readiness, and return its supported URL.
---

This uses the existing SDK Orders authoring preview, labelled example data only. Unsupported service calls fail explicitly. The composed Console review host forbids network exposure. The SDK server allows loopback hosts only, so this skill fails safely on Cloud Runner until a separately reviewed preview-origin contract exists.

1. From the repository root, run `.agents/dependencies` and source `. .agents/env`.
2. Choose a free `PREVIEW_PORT` (default 4312); never use runner-reserved 49983.
   Check listeners first. Do not reuse or kill an unrelated process.
3. Run `PREVIEW_PORT=4312 .agents/preview` in an owned terminal. It stays in the
   foreground. If it needs to persist on Delta, ask the user to background that
   terminal with the terminal UI; these commands have no invented `--background` flag.
4. In another terminal, retry `PREVIEW_PORT=4312 .agents/preview-check` for up to
   120 seconds while checking that the owned terminal remains alive. A failed
   build, terminated process or timeout is a failure, even if an unrelated listener
   answers. Report errors without environment values. A response proves readiness,
   not authentication or full application acceptance.
5. On a supported runner, return exactly the HTTPS URL printed by
   `delta-runner preview url 4312`. Locally return the loopback URL. Never infer
   a preview hostname or expose a port whose host/origin checks reject it.
6. Stop through Ctrl+C in the owned server terminal; wait for cleanup. Studio's
   wrapper also stops and removes its private cluster and agent SQLite file.
   Never run broad kill/pkill or stop another checkout's database.

Only UI and Relay currently support cloud preview here. Console and Studio need
the separately reviewed origin/Auth support described above before cloud use.
Delta preview access is per runner/thread; only share with trusted collaborators.
