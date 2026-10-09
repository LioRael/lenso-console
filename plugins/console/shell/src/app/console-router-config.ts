import { consoleHttpPaths } from "../lib/console-http-paths";

export const rootRedirectPath = "/";

export const consoleBasePath = consoleBasePathFromBaseUrl(
  typeof document !== "undefined" &&
    document.getElementById("lenso-console-http-paths")
    ? consoleHttpPaths.shell_base_path
    : import.meta.env.BASE_URL
);

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
