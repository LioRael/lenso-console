import { expect, test } from "bun:test";

import {
  parseSessionRenewalStatus,
  sessionRenewalDue,
} from "../src/session-renewal";
// Stops expiry/cap bypass and premature writes; deadline hints never authorize anything.
test("renew only a live near-expiry session inside the server's idle and absolute bounds", () => {
  const s = {
    subjectId: "synthetic",
    serverNow: 100_000,
    expiresAt: 120_000,
    absoluteExpiresAt: 900_000,
    renewAfterAt: 0,
  };
  expect(sessionRenewalDue(parseSessionRenewalStatus(s))).toBe(true);
  for (const value of [
    { ...s, expiresAt: 200_000 },
    { ...s, renewAfterAt: 110_000 },
    { ...s, expiresAt: 100_000 },
    { ...s, absoluteExpiresAt: 120_000 },
  ]) {
    expect(sessionRenewalDue(value)).toBe(false);
  }
  expect(() =>
    parseSessionRenewalStatus({ ...s, expiresAt: "130000" })
  ).toThrow();
});
