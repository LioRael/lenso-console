import { describe, expect, test } from "vitest";

import {
  adminActionInvokePath,
  adminActionInvokeRequest,
} from "./admin-action-workbench-model";

describe("admin action workbench model", () => {
  test("builds the host admin action invocation path", () => {
    expect(adminActionInvokePath("hello-action", "seed_greeting")).toBe(
      "admin/data/hello-action/actions/seed_greeting"
    );
    expect(adminActionInvokePath("hello action", "seed/greeting")).toBe(
      "admin/data/hello%20action/actions/seed%2Fgreeting"
    );
  });

  test("builds the host admin action invocation request body", () => {
    expect(
      adminActionInvokeRequest({
        count: 2,
        text: "hi",
      })
    ).toEqual({
      input: {
        count: 2,
        text: "hi",
      },
    });
    expect(adminActionInvokeRequest({}, "SYNC")).toEqual({
      confirmation_phrase: "SYNC",
      input: {},
    });
    expect(adminActionInvokeRequest({}, "")).toEqual({
      input: {},
    });
  });
});
