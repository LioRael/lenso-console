export const rootRedirectPath = "/";

export const consoleBasePath = consoleBasePathFromBaseUrl(
  import.meta.env.BASE_URL
);

export const legacyConsoleRedirects = {
  "/launchpad": "/",
  "/overview": "/runtime",
  "/operations": "/runtime",
  "/operations/queues": "/runtime",
  "/operations/dead-letters": "/runtime",
  "/operations/functions": "/runtime",
  "/operations/remote-calls": "/runtime",
  "/operations/admin-actions": "/changes",
  "/data": "/modules",
  "/config": "/settings",
} as const;

export type LegacyConsolePath = keyof typeof legacyConsoleRedirects;
export type LegacyConsoleTarget =
  (typeof legacyConsoleRedirects)[LegacyConsolePath];

export function consoleBasePathFromBaseUrl(baseUrl: string) {
  const basePath = baseUrl.replace(/\/+$/, "");
  if (!basePath) {
    return "/";
  }
  return basePath.startsWith("/") ? basePath : `/${basePath}`;
}

export function consolePathFromLocation(
  pathname: string,
  basepath = consoleBasePath
) {
  const normalizedBasepath = basepath.replace(/\/+$/, "");
  if (
    normalizedBasepath &&
    normalizedBasepath !== "/" &&
    (pathname === normalizedBasepath ||
      pathname.startsWith(`${normalizedBasepath}/`))
  ) {
    return pathname.slice(normalizedBasepath.length) || "/";
  }
  return pathname;
}

export function legacyConsoleTargetForPath(
  pathname: string,
  basepath = consoleBasePath
): LegacyConsoleTarget | undefined {
  const path = consolePathFromLocation(pathname, basepath);
  return legacyConsoleRedirects[path as LegacyConsolePath];
}
