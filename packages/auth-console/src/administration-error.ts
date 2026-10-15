export class AdministrationError extends Error {
  readonly code:
    | "DENIED"
    | "CONFLICT"
    | "INVALID_INPUT"
    | "UNAVAILABLE"
    | "OUTCOME_UNKNOWN";
  readonly intentId: string | undefined;
  constructor(
    code:
      | "DENIED"
      | "CONFLICT"
      | "INVALID_INPUT"
      | "UNAVAILABLE"
      | "OUTCOME_UNKNOWN",
    intentId?: string
  ) {
    super(code);
    this.name = "AdministrationError";
    this.code = code;
    this.intentId = intentId;
  }
}
