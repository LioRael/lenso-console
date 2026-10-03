# Real multi-user assistant acceptance

`live.rs` is included by the reference Host's test target. It starts real
Account/Password owners with disposable PostgreSQL schemas, logs in three
synthetic users through the Password capability, and transports their issued
session cookies over the real Web Ingress and ordinary Console proxy. A real
Agent Web subprocess calls two local OpenAI-compatible HTTP model endpoints.
Only those external model responses are synthetic.

This is the cross-repository regression for a dropped login identity, one slow
user blocking another, overlapping turns in one session, foreign history and
cancellation access, a non-administrator gaining host control, provider
assignment bypass and BYOK credential disclosure. Narrow unit tests cannot
prove identity survives the Console-to-Agent transport.

An additional real legacy Agent process verifies unsigned local bootstrap still
works, while a reserved signed actor header is rejected when assertion ingress
is disabled. Console startup with an enabled member assistant policy must fail
against that process's real readiness response; an explicitly disabled policy
can still start safely.

The proof also sends eight concurrent authenticated session requests to cover
browser polling bursts. It creates an actual pending `ask_user` interaction:
another owner cannot read or answer its known identifier, while its owner can
answer and complete the turn. Signed tool calls include the Tools, ToolProvider
and ToolHook audiences as well as UserInteraction; each Kernel hop retains only
the audiences allowed for its next target.

The test Password consumer exposes `/auth/methods` as a real projection of this
test Host's ingress CSRF policy, using the same cookie/header constants. Its
methods list is empty because registration and login use the bound Password
capability, rather than an advertised HTTP login route. Identity issuance and
permission checks still run through the real Auth plugins.

With sibling Console and Agent checkouts and Docker available:

```sh
./tooling/multi-user-assistant/run.sh
```

The script builds the Agent binary, creates a temporary local PostgreSQL
container, runs the focused ignored test, then removes its container. An
existing disposable database can be supplied via `LENSO_POSTGRES_TEST_URL`.
`LENSO_ASSISTANT_AGENT_SOURCE` chooses another Agent checkout and
`LENSO_ASSISTANT_AGENT_BINARY` reuses an already built binary. Cargo's normal
environment variables choose toolchains and target directories.

For browser acceptance, set `LENSO_ASSISTANT_WEB_ROOT` to the built Shell's
`dist/client` directory and `LENSO_ASSISTANT_UI_EVIDENCE_DIR` to a private
absolute temporary directory. Once assertions pass, the test writes mode 0600
`service.json` containing the synthetic cookie sessions and keeps its local
services alive for up to ten minutes. The browser verifier writes a `finish`
file in that directory to release the services. This file must never be
committed or used as a production session export.
Use a new private directory for each run, or remove its prior `service.json` and
`finish` files after the previous services have stopped.

All account passwords, model keys and encryption passphrases are synthetic.
The fixture creates no real provider account and never changes a global
Profile. Its local native Plugins are trusted code; the acceptance does not
claim OS isolation of native, Bun or Process execution.

Build the real UI before starting the browser hold:

```sh
pnpm install --frozen-lockfile
cd apps/shell
VITE_CONSOLE_MODE=api VITE_API_BASE_URL=/ pnpm build
```

In one terminal, start the same real acceptance services with their UI assets
and a private evidence directory (from the repository root):

```sh
LENSO_ASSISTANT_WEB_ROOT="$PWD/apps/shell/dist/client" \
LENSO_ASSISTANT_UI_EVIDENCE_DIR=/tmp/lenso-assistant-ui \
./tooling/multi-user-assistant/run.sh
```

Once `/tmp/lenso-assistant-ui/service.json` exists, run this in another terminal:

```sh
LENSO_ASSISTANT_UI_EVIDENCE_DIR=/tmp/lenso-assistant-ui \
LENSO_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium \
node tooling/multi-user-assistant/browser-proof.mjs
```

Omit `LENSO_BROWSER_EXECUTABLE_PATH` to use Playwright's installed Chromium.
`LENSO_ASSISTANT_SERVICE_MANIFEST` optionally selects a separate private
manifest. The verifier authenticates three isolated browser contexts with the
real issued synthetic sessions, renders allowed and denied routes, saves a
personal synthetic key through the UI, checks provider/credential boundaries,
exercises keyboard focus and light/dark desktop/narrow layouts, runs two real
conversations concurrently, and switches accounts in one browser to check
history removal. It writes screenshots and a credential-free `ui-report.json`
under the evidence directory, then creates `finish` only after every check
passes. On failure it retains the service hold for diagnosis until its timeout;
create `finish` manually when diagnosis is complete. No screenshot or private
session manifest is checked into the repository.
