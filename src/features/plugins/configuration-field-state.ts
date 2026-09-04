export function readField(
  value: unknown,
  path: readonly (number | string)[]
): unknown {
  let current = value;
  for (const key of path) {
    if (
      !current ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    ) {
      return undefined;
    }
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

// Object fields remain sparse overrides. Arrays are replaced as one value.
export function editField(
  value: Record<string, unknown>,
  path: readonly string[],
  next: unknown
): Record<string, unknown> {
  const [key, ...rest] = path;
  if (key === undefined) {
    return value;
  }
  let replacement = next;
  if (rest.length > 0) {
    const child = Object.hasOwn(value, key) ? value[key] : undefined;
    replacement = editField(
      child && typeof child === "object" && !Array.isArray(child)
        ? (child as Record<string, unknown>)
        : {},
      rest,
      next
    );
    if (next === undefined && Object.keys(replacement as object).length === 0) {
      replacement = undefined;
    }
  }
  return Object.fromEntries([
    ...Object.entries(value).filter(([name]) => name !== key),
    ...(replacement === undefined ? [] : [[key, replacement]]),
  ]);
}
