import { expect, test } from "bun:test";

import { readAdmissionBootstrap } from "../../src/admission-bootstrap.ts";

test("a slow discovery response does not serialize the session request", async () => {
  let release!: (value: string) => void;
  let sessions = 0;
  const pending = readAdmissionBootstrap(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
    async () => {
      sessions += 1;
      return "session";
    }
  );
  expect(sessions).toBe(1);
  release("methods");
  expect(await pending).toEqual([
    { status: "fulfilled", value: "methods" },
    { status: "fulfilled", value: "session" },
  ]);
});

test("anonymous session rejection cannot hide successful login discovery", async () => {
  let release!: (value: string) => void;
  const denied = new Error("unauthenticated");
  const pending = readAdmissionBootstrap(
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
    async () => {
      throw denied;
    }
  );
  await Promise.resolve();
  release("methods");
  expect(await pending).toEqual([
    { status: "fulfilled", value: "methods" },
    { status: "rejected", reason: denied },
  ]);
});

test("both rejected GETs are observed without admitting either result", async () => {
  const methods = new Error("unavailable"),
    session = new Error("expired");
  expect(
    await readAdmissionBootstrap(
      async () => {
        throw methods;
      },
      async () => {
        throw session;
      }
    )
  ).toEqual([
    { status: "rejected", reason: methods },
    { status: "rejected", reason: session },
  ]);
});
