import { z } from "zod";

const identifier = z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/u);
export const consoleWorkspaceSettingSchema = z.strictObject({
  id: identifier,
  page: z
    .array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u))
    .max(8)
    .readonly(),
  label: z.string().trim().min(1).max(120),
  description: z.string().max(512).optional(),
  group: z
    .strictObject({ id: identifier, label: z.string().trim().min(1).max(80) })
    .optional(),
  status: z.string().max(120).optional(),
});
export const consoleWorkspaceSettingsSchema = z
  .array(consoleWorkspaceSettingSchema)
  .max(64)
  .readonly()
  .superRefine((entries, context) => {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate settings ID: ${entry.id}`,
        });
      }
      ids.add(entry.id);
    }
  });
export type ConsoleWorkspaceSetting = z.infer<
  typeof consoleWorkspaceSettingSchema
>;
