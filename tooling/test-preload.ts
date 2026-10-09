import "../plugins/console/shell/test/stylex-preload";

// Local fixtures stay direct; registry requests retain the operator's proxy.
for (const variable of ["NO_PROXY", "no_proxy"]) {
  const hosts = (process.env[variable] ?? "").split(",").filter(Boolean);
  process.env[variable] = [
    ...new Set([...hosts, "127.0.0.1", "localhost", "::1"]),
  ].join(",");
}
