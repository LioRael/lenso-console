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
    "contracts/**/generated/**",
    "plugins/**/generated/**",
    // Rust build output and frozen proof records have byte-level integrity checks.
    "plugins/marketplace/directory/config.schema.json",
    "plugins/marketplace/web/config.schema.json",
    "plugins/marketplace/workers/evidence/**",
    "plugins/marketplace/workers/recovery/evidence/**",
    "plugins/marketplace/workers/proof/cohort.json",
    // These exact deployed configs are hashed by the qualification receipts.
    "plugins/marketplace/workers/wrangler.jsonc",
    "plugins/marketplace/workers/recovery/wrangler.jsonc",
  ],
});
