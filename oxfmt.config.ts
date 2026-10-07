import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Markdown is maintained as authored product documentation; do not let a
  // formatter upgrade rewrite the full documentation history in this PR.
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    // Keep the qualified proof snapshot byte-identical. Preflight checks it.
    ".github/fixtures/console-kit-stream/fixture/**",
    "**/*.md",
    "plugins/console/**/generated/**",
    "contracts/**/generated/**",
    "plugins/**/generated/**",
    "packages/**/generated/**",
    "plugins/console/shell/src/**/generated/**",
    "plugins/management/crates/lenso-management-http/src/workers/mcp.mjs",
    "contracts/**/schemas/**",
  ],
});
