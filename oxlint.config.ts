import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack],
  overrides: [
    {
      files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
      rules: {
        "class-methods-use-this": "off",
        complexity: "off",
        "func-style": "off",
        "import/consistent-type-specifier-style": "off",
        "import/no-cycle": "off",
        "max-classes-per-file": "off",
        "no-nested-ternary": "off",
        "no-promise-executor-return": "off",
        "no-use-before-define": "off",
        "promise/avoid-new": "off",
        "require-await": "off",
        "require-unicode-regexp": "off",
        "sort-keys": "off",
        "typescript/array-type": "off",
        "typescript/consistent-type-definitions": "off",
        "typescript/no-floating-promises": "off",
        "typescript/no-non-null-assertion": "off",
        "unicorn/no-array-for-each": "off",
        "unicorn/no-array-reduce": "off",
        "unicorn/no-array-sort": "off",
        "unicorn/no-nested-ternary": "off",
        "unicorn/no-useless-undefined": "off",
        "unicorn/prefer-query-selector": "off",
        "unicorn/prefer-spread": "off",
        "unicorn/prefer-ternary": "off",
      },
    },
  ],
  // Ultracite 7.10/Oxlint 1.77 introduced stricter React Compiler and
  // migration rules. Keep the existing Console code contract stable while
  // the dedicated lint-migration work is staged separately.
  rules: {
    "no-await-in-loop": "off",
    "no-unreachable-loop": "off",
    "no-void": "off",
    "prefer-named-capture-group": "off",
    "react/button-has-type": "off",
    "react/function-component-definition": "off",
    "react/jsx-no-constructed-context-values": "off",
    "react/jsx-no-useless-fragment": "off",
    "react/react-compiler": "off",
    "typescript/method-signature-style": "off",
    "unicorn/import-style": "off",
    "unicorn/numeric-separators-style": "off",
    "unicorn/prefer-export-from": "off",
  },
});
