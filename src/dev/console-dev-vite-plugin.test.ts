import { describe, expect, test } from "vitest";

import { decodeConsoleServiceComposition } from "../app/console-composition";
import { consoleDevComposition } from "./console-dev-vite-plugin";

describe("isolated Module UI development composition", () => {
  test("exposes one compatible binding for every mandatory Console role", () => {
    expect(decodeConsoleServiceComposition(consoleDevComposition())).toEqual(
      consoleDevComposition()
    );
  });
});
