import { parse } from "smol-toml";
import { expect, test } from "vitest";

import { absentPluginConfigurationDigest } from "../plugins/plugin-configuration-source";
import {
  BUSINESS_PACKAGE,
  businessConfiguration,
} from "./business-connection-model";

test("business configuration contains only a clean origin and display label", () => {
  expect(
    parse(businessConfiguration(" Projects ", "http://127.0.0.1:55440/"))
  ).toEqual({
    label: "Projects",
    origin: "http://127.0.0.1:55440",
  });
  expect(
    parse(businessConfiguration("应用", "https://PROJECTS.example.com/"))
  ).toEqual({
    label: "应用",
    origin: "https://projects.example.com",
  });
  for (const address of [
    "file:///tmp/app",
    "http://remote.example.com",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?token=secret",
    "https://example.com#fragment",
  ]) {
    expect(() => businessConfiguration("Projects", address)).toThrow();
  }
  expect(() => businessConfiguration(" ", "https://example.com")).toThrow();
  expect(() =>
    businessConfiguration("应".repeat(34), "https://example.com")
  ).toThrow();
});

test("new connection preconditions are isolated by Plugin identity", async () => {
  expect(
    await absentPluginConfigurationDigest(BUSINESS_PACKAGE, "example")
  ).not.toBe(
    await absentPluginConfigurationDigest("lenso.agent.mcp-client", "example")
  );
});
