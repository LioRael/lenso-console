import type { Operation } from "@lenso/engine/operations";

export function snapshotOperation(operation: Operation): Operation {
  return Object.freeze({
    ...operation,
    ...(operation.source
      ? { source: Object.freeze({ ...operation.source }) }
      : {}),
  });
}

export function isSelectedOperation(
  declarations: readonly Operation[],
  operation: Operation
): boolean {
  // Manage snapshots the descriptor, but retains exact plugin/schema references.
  return declarations.some(
    (declared) =>
      declared.plugin === operation.plugin &&
      declared.input === operation.input &&
      (
        [
          "method",
          "context",
          "effect",
          "confirmation",
          "approval",
          "destructive",
          "retry",
          "cancellation",
          "mapError",
        ] as const
      ).every((field) => declared[field] === operation[field])
  );
}
