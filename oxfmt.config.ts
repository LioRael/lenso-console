import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Markdown is maintained as authored product documentation; do not let a
  // formatter upgrade rewrite the full documentation history in this PR.
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "**/*.md",
    "service/**/generated/**",
    "service/crates/lenso-console-projects-workspace-plugin/assets/**",
  ],
});
