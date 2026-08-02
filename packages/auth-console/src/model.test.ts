import { describe, expect, test } from "vitest";

import {
  authDeviceRows,
  authProviderRows,
  authSessionRows,
  authUserRows,
} from "./model";

describe("auth console model", () => {
  test("maps provider module metadata into stable provider surfaces", () => {
    expect(
      authProviderRows([
        { module_name: "auth-github", status: "loaded" },
        { module_name: "auth-google", status: "error" },
      ])
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "github", state: "registered" }),
        expect.objectContaining({ id: "google", state: "degraded" }),
        expect.objectContaining({ id: "oidc", state: "registered" }),
      ])
    );
  });

  test("formats Auth admin records without inventing credentials", () => {
    expect(
      authUserRows([
        {
          created_at: "2026-08-01T01:42:00.000Z",
          disabled_at: null,
          id: "usr_01",
          is_anonymous: false,
        },
      ])
    ).toEqual([
      {
        anonymous: "Member",
        createdAt: "2026-08-01T01:42:00.000Z",
        id: "usr_01",
        state: "Active",
      },
    ]);
    expect(
      authSessionRows([
        {
          client_ip: "203.0.113.24",
          created_at: "2026-08-01T01:42:00.000Z",
          device_id: "device_7f2a",
          expires_at: "2026-08-08T01:42:00.000Z",
          id: "sess_01",
          revoked_at: null,
          user_id: "usr_01",
        },
      ])[0]
    ).toMatchObject({ id: "sess_01", state: "active" });
    expect(
      authDeviceRows([
        {
          created_at: "2026-08-01T01:42:00.000Z",
          id: "device_7f2a",
          last_seen_ip: "203.0.113.24",
          trusted_at: "2026-08-01T01:44:00.000Z",
          updated_at: "2026-08-01T01:44:00.000Z",
          user_id: "usr_01",
        },
      ])[0]
    ).toMatchObject({ id: "device_7f2a", userId: "usr_01" });
  });
});
