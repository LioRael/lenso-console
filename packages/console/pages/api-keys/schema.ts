import { z } from "zod";

const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const keyMetadataSchema = z.object({
  id: z.string().min(1),
  subject: z.object({
    namespace: z.string(),
    tenantId: z.string(),
    subjectId: z.string(),
  }),
  scopes: z.array(z.string()),
  revision: z.number().int().nonnegative(),
  issuedAt: timestamp,
  expiresAt: timestamp,
  revokedAt: timestamp.nullable(),
  overlapUntil: timestamp.nullable(),
});
export const keyListSchema = z.array(keyMetadataSchema);
export const keyReadSchema = keyMetadataSchema.nullable();
export const credentialResultSchema = z.object({
  key: keyMetadataSchema,
  credential: z.string().min(1).nullable(),
  replayed: z.boolean(),
});
export type KeyMetadata = z.infer<typeof keyMetadataSchema>;
