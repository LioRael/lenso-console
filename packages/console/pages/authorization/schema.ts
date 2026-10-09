import { z } from "zod";

const scope = z.object({ type: z.string(), id: z.string() });
export const authorizationInspectionSchema = z.object({
  revision: z.string(),
  graph: z.object({
    roles: z.array(
      z.object({
        id: z.string(),
        scope,
        inherits: z.array(z.string()).optional(),
        permissions: z.array(
          z.object({
            action: z.string(),
            resourceType: z.string(),
            scope,
            resourceId: z.string().optional(),
          })
        ),
      })
    ),
    bindings: z.array(
      z.object({
        id: z.string(),
        principal: z.object({
          realmId: z.string(),
          subjectId: z.string(),
          kind: z.string(),
        }),
        roleId: z.string(),
        scope,
        expiresAt: z.number().int().nonnegative().optional(),
      })
    ),
  }),
});
