import { describe, expect, test } from "vitest";

import {
  createTranslations,
  formatConsoleNumber,
  resolveConsoleLocale,
} from "../../../../../packages/console-authoring/src/i18n";
import { parseLocaleSnapshot } from "./console-locale";

describe("language policy", () => {
  test("explicit account choice precedes global default, browser order and English fallback", () => {
    expect(resolveConsoleLocale("en", "zh-CN", ["zh-TW"])).toBe("en");
    expect(resolveConsoleLocale("global", "zh-CN", ["en-US"])).toBe("zh-CN");
    expect(resolveConsoleLocale("global", null, ["fr", "zh-TW", "en"])).toBe(
      "zh-CN"
    );
    expect(resolveConsoleLocale("global", null, ["fr"])).toBe("en");
    expect(formatConsoleNumber("en", 1234.5)).toBe(
      new Intl.NumberFormat("en").format(1234.5)
    );
  });
  test("invalid server preferences cannot become an effective locale", () => {
    expect(() =>
      parseLocaleSnapshot({
        global_default: "xx",
        preference: "global",
        available: true,
        can_manage_default: false,
      })
    ).toThrow();
  });
  test("lazy catalogs deduplicate loads and missing keys retain English and literal values", async () => {
    let loads = 0;
    const translations = createTranslations(
      "relay",
      { title: "Hello {name}", fallback: "English" },
      {
        "zh-CN": async () => {
          loads += 1;
          return { title: "你好 {name}" };
        },
      }
    );
    await Promise.all([translations.load("zh-CN"), translations.load("zh-CN")]);
    expect(loads).toBe(1);
    expect(
      translations.translate("zh-CN", "title", { name: "$& {name}" })
    ).toBe("你好 $& {name}");
    expect(translations.translate("zh-CN", "fallback")).toBe("English");
    expect(translations.translate("zh-CN", "toString")).toBe("toString");
    expect(translations.translate("en", "title", { name: "Alice" })).toBe(
      "Hello Alice"
    );
  });
});
