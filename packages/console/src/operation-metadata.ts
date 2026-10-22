import {
  consoleOperationMetadataSchema,
  type ConsoleOperationMetadata,
} from "@lenso/console-sdk/protocol";
import { environmentSecrets, redact } from "@lenso/engine/diagnostics";
import {
  boundedJson,
  safeInputSchema,
  type describeOperation,
} from "@lenso/engine/operations";

/** Source references are inert repository-relative locations, never file access URLs. */
export function projectOperationMetadata(
  entry: Partial<
    Pick<
      ReturnType<typeof describeOperation>,
      "source" | "retry" | "cancellation" | "destructive" | "outputDescription"
    >
  > & {
    // Runtime projection below still accepts only the supported values.
    outputSchemaAvailability?: string;
    outputSchema?: Record<string, unknown> | null;
    errors?: readonly { code: string; message: string }[];
  }
): ConsoleOperationMetadata {
  const { source } = entry;
  const file = source?.file;
  const safeSource =
    typeof file === "string" &&
    file.length <= 1024 &&
    /^[A-Za-z0-9_.@/-]+$/.test(file) &&
    !file.startsWith("/") &&
    !file.split("/").some((part) => part === ".." || part === "") &&
    !environmentSecrets().some((secret) => file.includes(secret));
  const metadata = consoleOperationMetadataSchema.parse(
    redact(
      {
        source: safeSource
          ? {
              file,
              ...(source?.export &&
              /^[A-Za-z_$][\w$]{0,127}$/.test(source?.export)
                ? { export: source?.export }
                : {}),
              ...(typeof source?.line === "number" &&
              Number.isSafeInteger(source.line) &&
              source.line > 0
                ? { line: source?.line }
                : {}),
              ...(typeof source?.column === "number" &&
              Number.isSafeInteger(source.column) &&
              source.column > 0
                ? { column: source?.column }
                : {}),
            }
          : null,
        retry: entry.retry ?? "unknown",
        cancellation: entry.cancellation ?? "unknown",
        destructive: entry.destructive ?? null,
        outputDescription: entry.outputDescription?.slice(0, 4096) ?? null,
        // Additive TS descriptors are optional on older published Manage versions.
        outputContract:
          entry.outputSchemaAvailability === "available" && entry.outputSchema
            ? {
                availability: "available",
                schema: safeInputSchema(entry.outputSchema),
              }
            : {
                availability:
                  entry.outputSchemaAvailability ===
                    "runtime-validation-only" ||
                  entry.outputSchemaAvailability === "not-declared"
                    ? entry.outputSchemaAvailability
                    : "unavailable",
              },
        errorContract:
          entry.errors === undefined
            ? { availability: "unavailable" }
            : { availability: "declared", errors: entry.errors },
      },
      environmentSecrets()
    )
  );
  boundedJson(metadata, 262144);
  return metadata;
}
