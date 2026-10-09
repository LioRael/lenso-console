import path from "node:path";

import {
  definePluginConfig,
  resolveConfig,
  type ConfigSource,
} from "@lenso/core";
import { envSource } from "@lenso/core/config/env";
import { jsonFileSource } from "@lenso/core/config/file";
import { z } from "zod";

import { overlapsShellNamespace } from "./shell";

const prefix = z.string().regex(/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/);
const within = (a: string, b: string) => a === b || a.startsWith(`${b}/`);
export const hostConfiguration = definePluginConfig({
  schema: z
    .strictObject({
      origin: z.string().default("http://127.0.0.1:3100"),
      apiBasePath: prefix.default("/api"),
      authBasePath: prefix.default("/auth"),
      token: z.string().min(16).max(4096),
      subject: z.email().default("operator@localhost.test"),
      shellDirectory: z
        .string()
        .default("../../plugins/console/shell/dist/client"),
      databasePath: z
        .string()
        .default("../../.artifacts/ts-console/locale.sqlite"),
    })
    .superRefine((value, context) => {
      let origin: URL;
      try {
        origin = new URL(value.origin);
      } catch {
        context.addIssue({
          code: "custom",
          path: ["origin"],
          message: "Invalid origin",
        });
        return;
      }
      if (
        origin.origin !== value.origin ||
        origin.protocol !== "http:" ||
        origin.hostname !== "127.0.0.1" ||
        !origin.port ||
        Number(origin.port) < 1024
      ) {
        context.addIssue({
          code: "custom",
          path: ["origin"],
          message:
            "Local isolation requires an exact loopback HTTP origin on an unprivileged port",
        });
      }
      if (
        within(value.apiBasePath, value.authBasePath) ||
        within(value.authBasePath, value.apiBasePath)
      ) {
        context.addIssue({
          code: "custom",
          path: ["authBasePath"],
          message: "API and Auth prefixes must be separate",
        });
      }
      for (const field of ["apiBasePath", "authBasePath"] as const) {
        if (overlapsShellNamespace(value[field])) {
          context.addIssue({
            code: "custom",
            path: [field],
            message:
              "API and Auth prefixes cannot occupy a Shell-owned namespace",
          });
        }
      }
    }),
  fields: [{ path: ["token"], sensitive: true }],
});

export type HostConfiguration = z.output<typeof hostConfiguration.schema>;

export function hostSources(root: string): ConfigSource[] {
  return [
    jsonFileSource({
      id: "local-file",
      root,
      path: "local.json",
      optional: true,
    }),
    envSource({
      id: "operator-environment",
      read: (name) => process.env[name],
      bindings: {
        token: { name: "LENSO_TS_TOKEN", sensitive: true, empty: "error" },
        subject: { name: "LENSO_TS_SUBJECT", empty: "error" },
        origin: { name: "LENSO_TS_ORIGIN", empty: "error" },
        apiBasePath: { name: "LENSO_TS_API_PREFIX", empty: "error" },
        authBasePath: { name: "LENSO_TS_AUTH_PREFIX", empty: "error" },
        shellDirectory: { name: "LENSO_TS_SHELL", empty: "error" },
        databasePath: { name: "LENSO_TS_DATABASE", empty: "error" },
      },
    }),
  ];
}

export async function resolveHostConfiguration(
  root: string,
  sources = hostSources(root)
) {
  const { value } = await resolveConfig("ts-console-host", {
    contract: hostConfiguration,
    sources,
  });
  return {
    ...value,
    shellDirectory: path.resolve(root, value.shellDirectory),
    databasePath: path.resolve(root, value.databasePath),
  };
}
