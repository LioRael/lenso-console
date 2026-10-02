function decodePrefix(value: string) {
  const match = /^"((?:\\.|[^"\\])*)/u.exec(value);
  if (!match) {
    return undefined;
  }
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return undefined;
  }
}

/** Decode legacy Rust debug wrappers for presentation; retain the original for inspection. */
export function toolErrorDetails(raw: string): {
  summary: string;
  output: string;
  exitCode?: string;
  incomplete?: boolean;
  reconnect?: boolean;
} {
  let details: Record<string, unknown> = {};
  let incomplete = false;
  try {
    const wrapped = /RawJson\(("(?:\\.|[^"\\])*")\)/u.exec(raw);
    const value: unknown = wrapped
      ? JSON.parse(JSON.parse(wrapped[1]!))
      : JSON.parse(raw);
    if (value && typeof value === "object") {
      details = value as Record<string, unknown>;
    }
  } catch {
    /* Older providers may return unstructured text. */
  }
  // Some old event logs truncate the debug wrapper midway through stderr.
  // Decode only complete escape sequences in that prefix; never invent the tail.
  if (Object.keys(details).length === 0 && raw.includes("RawJson(")) {
    incomplete = true;
    const prefix = decodePrefix(raw.slice(raw.indexOf("RawJson(") + 8));
    if (prefix) {
      for (const key of ["stderr", "stdout", "exit_code"]) {
        const field = new RegExp(`"${key}"\\s*:\\s*`).exec(prefix);
        if (field) {
          details[key] = decodePrefix(
            prefix.slice(field.index + field[0].length)
          );
        }
      }
    }
  }
  const output = [details.stderr, details.stdout]
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
    .join("\n");
  const message = /message: ("(?:\\.|[^"\\])*")/u.exec(raw);
  let summary =
    typeof details.message === "string"
      ? details.message
      : "The tool could not complete this operation.";
  if (message) {
    try {
      summary = JSON.parse(message[1]!) as string;
    } catch {
      /* Keep the fallback. */
    }
  }
  if (output) {
    summary = output.split("\n").find((line) => line.trim()) ?? summary;
  } else if (!raw.startsWith("Domain(") && !raw.startsWith("Runtime(")) {
    summary = raw.split("\n")[0] || summary;
  }
  return {
    summary: summary.slice(0, 240),
    ...(/reason_code[:\s"]+connection_required/u.test(raw)
      ? { reconnect: true }
      : {}),
    ...(incomplete ? { incomplete: true } : {}),
    output: output || raw,
    ...(details.exit_code === undefined
      ? {}
      : { exitCode: String(details.exit_code) }),
  };
}
