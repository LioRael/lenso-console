import { describe, expect, test } from "vitest";

import {
  base64UrlNoPadding,
  consoleOidcCallbackPath,
  consoleOidcRedirectUri,
  consolePasswordLoginUrl,
  passwordLoginBody,
} from "./console-auth";

describe("console OIDC auth", () => {
  test("builds callback paths under the hosted console base", () => {
    expect(consoleOidcCallbackPath("/")).toBe("/oidc/callback");
    expect(consoleOidcCallbackPath("/console/")).toBe("/console/oidc/callback");
    expect(
      consoleOidcRedirectUri({ origin: "https://app.example.com" }, "/console/")
    ).toBe("https://app.example.com/console/oidc/callback");
  });

  test("uses unpadded base64url for PKCE values", () => {
    expect(base64UrlNoPadding(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });

  test("builds password login requests against the configured API prefix", () => {
    expect(consolePasswordLoginUrl("/")).toBe("/v1/auth/password/login");
    expect(consolePasswordLoginUrl("https://api.example.com")).toBe(
      "https://api.example.com/v1/auth/password/login"
    );
    expect(
      passwordLoginBody({
        identifier: "admin@example.com",
        password: "secret",
      })
    ).toBe(
      JSON.stringify({
        identifier: "admin@example.com",
        password: "secret",
      })
    );
  });
});
