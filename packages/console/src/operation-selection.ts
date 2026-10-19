import type { Operation } from "@lenso/engine/operations";

type ContractOperation = Operation & {
  readonly output?: Operation["input"];
  readonly errors?: readonly {
    readonly code: string;
    readonly message: string;
  }[];
};
function sameErrors(
  left: ContractOperation["errors"],
  right: ContractOperation["errors"]
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return (
    left.length === right.length &&
    left.every(
      (error, index) =>
        error.code === right[index]?.code &&
        error.message === right[index]?.message
    )
  );
}

export function snapshotOperation(operation: Operation): Operation {
  const extended = operation as ContractOperation;
  return Object.freeze({
    ...operation,
    ...(extended.errors
      ? {
          errors: Object.freeze(
            extended.errors.map((error) =>
              Object.freeze({ code: error.code, message: error.message })
            )
          ),
        }
      : {}),
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
      (declared as ContractOperation).output ===
        (operation as ContractOperation).output &&
      sameErrors(
        (declared as ContractOperation).errors,
        (operation as ContractOperation).errors
      ) &&
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
