import { expect, test } from "bun:test";

import { authorizationInspectionSchema } from "../authorization/schema";
import { credentialResultSchema, keyListSchema } from "./schema";

test("read DTO boundaries strip secrets and unapproved principal facts", () => {
  const keys = keyListSchema.parse([
    {
      id: "key",
      subject: {
        namespace: "app",
        tenantId: "tenant",
        subjectId: "subject",
        credential: "unsafe",
      },
      scopes: ["read"],
      revision: 1,
      issuedAt: 1,
      expiresAt: 2,
      revokedAt: null,
      overlapUntil: null,
      credential: "unsafe",
      digest: "unsafe",
      previousDigest: "unsafe",
    },
  ]);
  expect(JSON.stringify(keys)).not.toContain("unsafe");
  const inspection = authorizationInspectionSchema.parse({
    revision: "revision",
    graph: {
      roles: [],
      bindings: [
        {
          id: "binding",
          roleId: "role",
          scope: { type: "app", id: "app" },
          principal: {
            realmId: "realm",
            kind: "person",
            subjectId: "subject",
            attributes: { credential: "unsafe" },
          },
        },
      ],
    },
  });
  expect(JSON.stringify(inspection)).not.toContain("unsafe");
});

test("a credential replay remains unrecoverable instead of becoming a success credential", () => {
  const result = credentialResultSchema.parse({
    key: {
      id: "key",
      subject: { namespace: "app", tenantId: "tenant", subjectId: "subject" },
      scopes: [],
      revision: 1,
      issuedAt: 1,
      expiresAt: 2,
      revokedAt: null,
      overlapUntil: null,
    },
    credential: null,
    replayed: true,
  });
  expect(result.credential).toBeNull();
  expect(result.replayed).toBe(true);
  expect(
    credentialResultSchema.safeParse({ ...result, credential: "" }).success
  ).toBe(false);
});
