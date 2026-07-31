import { describe, expect, test } from "vitest";

import {
  base64UrlNoPadding,
  consoleBootstrapStatusUrl,
  consoleOidcCallbackPath,
  consoleOidcRedirectUri,
  consolePasswordLoginUrl,
  decodeConsoleBootstrapStatus,
  decodePasswordSessionToken,
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

  test("uses the password session token as the Console access token", () => {
    expect(
      decodePasswordSessionToken({
        expires_at: "2026-08-01T00:00:00Z",
        session_id: "sess_console",
        token: "console-session-token",
        user_id: "usr_operator",
      })
    ).toBe("console-session-token");
    expect(() => decodePasswordSessionToken({ token: "" })).toThrow(
      "Password login response token is invalid"
    );
  });

  test("decodes the operator bootstrap status contract", () => {
    expect(consoleBootstrapStatusUrl("/")).toBe("/bootstrap/v1/status");
    expect(consoleBootstrapStatusUrl("https://console.example.com")).toBe(
      "https://console.example.com/bootstrap/v1/status"
    );
    expect(
      decodeConsoleBootstrapStatus({
        schema: "lenso.console-bootstrap-status.v1",
        status: "operator_required",
        nextAction: "Run the bootstrap command.",
      })
    ).toEqual({
      schema: "lenso.console-bootstrap-status.v1",
      status: "operator_required",
      nextAction: "Run the bootstrap command.",
    });
    expect(() =>
      decodeConsoleBootstrapStatus({
        schema: "lenso.console-bootstrap-status.v0",
        status: "operator_required",
        nextAction: "Run the bootstrap command.",
      })
    ).toThrow("schema is not supported");
  });
});
