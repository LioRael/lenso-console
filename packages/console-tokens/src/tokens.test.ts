import { describe, expect, test } from "vitest";

import tokensSource from "../tokens.json";
import {
  darkTheme,
  legacyTokenCssVariables,
  lightTheme,
  tokenCssVariables,
  tokenNames,
} from "./tokens.stylex";

describe("Console token contract", () => {
  test("keeps a DTCG source and a stable public CSS variable for every token", () => {
    expect(tokensSource.$schema).toContain("designtokens.org");
    const names = Object.keys(tokenNames);
    expect(names.length).toBeGreaterThan(40);
    expect(new Set(Object.values(tokenCssVariables)).size).toBe(names.length);
    expect(Object.keys(legacyTokenCssVariables).toSorted()).toEqual(
      names.toSorted()
    );
    for (const name of names) {
      expect(tokenCssVariables[name as keyof typeof tokenCssVariables]).toBe(
        `--lenso-token-${name}`
      );
    }
  });

  test("publishes official light and dark StyleX themes", () => {
    expect(lightTheme).toBeDefined();
    expect(darkTheme).toBeDefined();
  });
});
