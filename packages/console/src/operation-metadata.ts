import {
  consoleOperationMetadataSchema,
  type ConsoleOperationMetadata,
} from "@lenso/console-sdk/protocol";
import { environmentSecrets, redact } from "@lenso/engine/diagnostics";
import type { describeOperation } from "@lenso/engine/operations";

/** Source references are inert repository-relative locations, never file access URLs. */
export function projectOperationMetadata(
  entry: Partial<
    Pick<
      ReturnType<typeof describeOperation>,
      "source" | "retry" | "cancellation" | "destructive" | "outputDescription"
    >
  >
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
  return consoleOperationMetadataSchema.parse(
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
        // Engine 0.6's public Operation has no output/error schema. Never infer from a call.
        outputContract: { availability: "unavailable" },
        errorContract: { availability: "unavailable" },
      },
      environmentSecrets()
    )
  );
}
