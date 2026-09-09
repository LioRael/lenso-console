# Lenso Agent

Run Agent and Console in the current workspace:

```sh
npx @lenso/agent web
npx @lenso/agent web --port 3035 --no-open
```

Requires Node.js 22.12 or newer, macOS 15+ on Apple Silicon or Ubuntu 24.04+ x64 (glibc 2.39+).
The command opens the browser when launched locally. SSH launches print the URL;
use your SSH client's port forwarding. Only the loopback interface is exposed.
Use Ctrl+C to stop the server and its Agents. Configure model authentication in
Console after startup.

npm installs an exact-version platform runtime with the Console client, Console
server, and both Agent Web binaries. Keep optional dependencies enabled. There
are no install scripts, runtime downloads, or Rust build requirements. npm's
cache supports repeated offline use after installation.

The current directory is the workspace. State remains in `~/.lenso/agent` and
`~/.lenso/console`; `LENSO_AGENT_HOME` and `LENSO_CONSOLE_HOME` may select other
absolute locations. Updating or removing the npm package does not delete these
Homes. Existing tool policy and approval settings remain authoritative. Optional
coding tools such as Git and ripgrep must be installed separately to use those
capabilities.

Pin a version for repeatable installation: `npx @lenso/agent@<version> web`.
Unsupported architectures and missing platform packages fail with an explicit
error. There is no fallback to a binary found on PATH.
