import { describe, expect, test } from "vitest";

import { translateConsoleMessage } from "./console-i18n";

describe("Console translations", () => {
  test("falls back to English and preserves unknown identifiers", () => {
    expect(translateConsoleMessage("en", "Plugins")).toBe("Plugins");
    expect(translateConsoleMessage("zh-CN", "lenso.agent.loop/agent")).toBe(
      "lenso.agent.loop/agent"
    );
    expect(translateConsoleMessage("zh-CN", "GPT-5.6-Luna")).toBe(
      "GPT-5.6-Luna"
    );
  });
  test("interpolates values literally without translating user names", () => {
    expect(
      translateConsoleMessage("zh-CN", "{agent} is using {profile}.", {
        agent: "My Agent",
        profile: "$& {agent}",
      })
    ).toBe("My Agent 正在使用 $& {agent}。");
    expect(
      translateConsoleMessage("zh-CN", "{count} profiles", { count: 0 })
    ).toBe("0 个配置方案");
  });
});
