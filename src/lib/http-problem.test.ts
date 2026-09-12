import { expect, test } from "vitest";

import { problemMessage } from "./http-problem";

test("uses Problem Details and handles malformed or unrelated responses", async () => {
  const headers = { "Content-Type": "application/problem+json; charset=utf-8" };
  expect(
    await problemMessage(
      Response.json({ detail: "Try later", title: "Busy" }, { headers }),
      "Fallback"
    )
  ).toBe("Try later");
  expect(
    await problemMessage(
      Response.json({ title: "Busy" }, { headers }),
      "Fallback"
    )
  ).toBe("Busy");
  expect(
    await problemMessage(new Response("broken", { headers }), "Fallback")
  ).toBe("Fallback");
  expect(
    await problemMessage(
      Response.json({ detail: "Internal diagnostic" }),
      "Fallback"
    )
  ).toBe("Fallback");
});
