/** Read public Problem Details as plain text; never expose arbitrary response bodies. */
export async function problemMessage(
  response: Response,
  fallback: string
): Promise<string> {
  if (
    response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase() !== "application/problem+json"
  ) {
    return fallback;
  }
  try {
    const value: unknown = await response.json();
    if (!value || typeof value !== "object") {
      return fallback;
    }
    if (
      "detail" in value &&
      typeof value.detail === "string" &&
      value.detail.trim()
    ) {
      return value.detail;
    }
    if (
      "title" in value &&
      typeof value.title === "string" &&
      value.title.trim()
    ) {
      return value.title;
    }
  } catch {
    return fallback;
  }
  return fallback;
}
