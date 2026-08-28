export const rootRedirectPath = "/";

export const consoleBasePath = consoleBasePathFromBaseUrl(
  import.meta.env.BASE_URL
);

export const legacyConsoleRedirects = {
  "/launchpad": "/",
  "/config": "/settings",
} as const;

const retiredConsolePaths = [
  "/changes",
  "/data",
  "/delivery",
  "/modules",
  "/operations",
  "/overview",
  "/runtime",
  "/system",
] as const;

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

export function isRetiredConsolePath(
  pathname: string,
  basepath = consoleBasePath
) {
  const path = consolePathFromLocation(pathname, basepath);
  return retiredConsolePaths.some(
    (retiredPath) => path === retiredPath || path.startsWith(`${retiredPath}/`)
  );
}
