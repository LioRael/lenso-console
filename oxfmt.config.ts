import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Markdown is maintained as authored product documentation; do not let a
  // formatter upgrade rewrite the full documentation history in this PR.
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "**/*.md",
    "plugins/console/**/generated/**",
    "contracts/**/generated/**",
    "plugins/**/generated/**",
    "packages/**/generated/**",
    "apps/shell/src/**/generated/**",
    "plugins/management/crates/lenso-management-http/src/workers/mcp.mjs",
    "contracts/**/schemas/**",
  ],
});
