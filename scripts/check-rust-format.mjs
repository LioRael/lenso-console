import { execFileSync } from "node:child_process";

// Catch formatting failures before downloading browsers or compiling artifacts.
for (const manifest of [
  "contracts/Cargo.toml",
  "plugins/observe/Cargo.toml",
  "plugins/management/Cargo.toml",
  "plugins/management-mcp/Cargo.toml",
  "runtime/agent-turn-relay/Cargo.toml",
  "runtime/local-agent-launcher/Cargo.toml",
  "service/Cargo.toml",
]) {
  execFileSync(
    process.env.CARGO || "cargo",
    ["fmt", "--manifest-path", manifest, "--all", "--", "--check"],
    { stdio: "inherit" }
  );
}
