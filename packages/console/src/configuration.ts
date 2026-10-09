import { definePluginConfig } from "@lenso/core";
import { z } from "zod";

const schema = z.strictObject({
  apiBasePath: z.string().optional(),
  authBasePath: z.string().optional(),
  shellBasePath: z.string().optional(),
  management: z.boolean().optional(),
});

export const consoleConfiguration = definePluginConfig({
  schema,
  description: "Console paths and explicit management endpoint selection.",
  jsonSchema: () => z.toJSONSchema(schema),
});
