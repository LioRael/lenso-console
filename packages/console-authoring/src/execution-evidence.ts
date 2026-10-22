import { z } from "zod";

/** Browser-safe projection of Engine OperationExecutionEvidence, with the same fields. */
const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:@/-]+$/);
const trace = z
  .object({
    traceId: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .refine((value) => !/^0+$/.test(value)),
    spanId: z
      .string()
      .regex(/^[0-9a-f]{16}$/)
      .refine((value) => !/^0+$/.test(value)),
  })
  .readonly();

export const operationExecutionEvidenceSchema = z
  .object({
    instanceId: identifier,
    operation: z
      .object({ pluginId: identifier, method: identifier })
      .readonly(),
    trace: trace.nullable(),
  })
  .readonly();
export type OperationExecutionEvidence = z.infer<
  typeof operationExecutionEvidenceSchema
>;

export const executionEvidenceHeader = "x-lenso-execution";
export const maxExecutionEvidenceBytes = 1024;
const encoder = new TextEncoder();

export function projectExecutionEvidence(
  value: unknown
): OperationExecutionEvidence | undefined {
  try {
    const result = operationExecutionEvidenceSchema.safeParse(value);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

export function executionEvidenceHeaderValue(
  value: unknown
): string | undefined {
  const evidence = projectExecutionEvidence(value);
  if (!evidence) {
    return undefined;
  }
  const encoded = JSON.stringify(evidence);
  return encoder.encode(encoded).byteLength <= maxExecutionEvidenceBytes
    ? encoded
    : undefined;
}

export function readExecutionEvidenceHeader(
  value: string | null
): OperationExecutionEvidence | undefined {
  if (!value || encoder.encode(value).byteLength > maxExecutionEvidenceBytes) {
    return undefined;
  }
  try {
    return projectExecutionEvidence(JSON.parse(value));
  } catch {
    return undefined;
  }
}
