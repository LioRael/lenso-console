const reserved = new Set([
  "api",
  "auth",
  "assets",
  "health",
  "management",
  "settings",
  "plugins",
  "agent",
  "apps",
  "favicon.ico",
  "favicon.svg",
  "robots.txt",
  "manifest.webmanifest",
  "index.html",
]);

/** Browser paths are presentation metadata, not instance or permission IDs. */
export function canonicalWorkspacePath(
  path: string,
  administrator = false
): string {
  if (path === "/") {
    return path;
  }
  const parts = path.replace(/\/$/u, "").slice(1).split("/");
  if (
    !path.startsWith("/") ||
    path.length > 256 ||
    parts.some((part) => !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(part)) ||
    reserved.has(parts[0]!) ||
    (parts[0] === "admin" && !administrator)
  ) {
    throw new TypeError(`Invalid or reserved workspace path: ${path}`);
  }
  return `/${parts.join("/")}/`;
}

export function isReservedConsolePath(path: string): boolean {
  return (
    reserved.has(path.split("/")[1] ?? "") ||
    ["/favicon.ico", "/robots.txt", "/manifest.webmanifest"].includes(path)
  );
}

export function matchPagePath(
  pattern: readonly string[],
  actual: readonly string[]
): boolean {
  let cursor = 0;
  for (const part of pattern) {
    if (part.startsWith("[[...")) {
      return true;
    }
    if (part.startsWith("[...")) {
      return cursor < actual.length;
    }
    const value = actual[cursor];
    if (value === undefined || (!part.startsWith("[") && part !== value)) {
      return false;
    }
    cursor += 1;
  }
  return cursor === actual.length;
}
