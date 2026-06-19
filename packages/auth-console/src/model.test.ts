import { describe, expect, test } from "vitest";

import { authUserRows, authUsersSummary } from "./model";

describe("auth console model", () => {
  test("formats auth user records from admin data", () => {
    const users = [
      {
        created_at: "2026-06-18T09:00:00.000Z",
        disabled_at: null,
        id: "usr_active",
      },
      {
        created_at: "2026-06-17T09:00:00.000Z",
        disabled_at: "2026-06-18T10:00:00.000Z",
        id: "usr_disabled",
      },
    ];

    expect(authUserRows(users)).toEqual([
      {
        createdAt: "2026-06-18T09:00:00.000Z",
        disabledAt: "-",
        id: "usr_active",
        status: "active",
      },
      {
        createdAt: "2026-06-17T09:00:00.000Z",
        disabledAt: "2026-06-18T10:00:00.000Z",
        id: "usr_disabled",
        status: "disabled",
      },
    ]);
    expect(authUsersSummary(users)).toEqual({
      active: 1,
      disabled: 1,
      total: 2,
    });
  });
});
