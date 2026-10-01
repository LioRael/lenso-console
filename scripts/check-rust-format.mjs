import { execFileSync } from "node:child_process";

// Catch formatting failures before downloading browsers or compiling artifacts.
execFileSync(process.env.CARGO || "cargo", ["fmt", "--all", "--", "--check"], {
  stdio: "inherit",
});
