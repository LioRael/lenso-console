import { useEffect } from "react";

export type BrowserUrlWriteMode = "push" | "replace";

export function currentBrowserUrl() {
  if (typeof window === "undefined") {
    return "";
  }
  return `${window.location.pathname}${window.location.search}`;
}

export function browserUrlForConsolePath(
  path: string,
  baseUrl = import.meta.env.BASE_URL
) {
  const basePath = baseUrl.replace(/\/+$/, "");
  if (
    !basePath ||
    basePath === "/" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path === basePath ||
    path.startsWith(`${basePath}/`)
  ) {
    return path;
  }
  return `${basePath}${path}`;
}

export function writeBrowserUrl(
  path: string,
  mode: BrowserUrlWriteMode = "replace"
) {
  const targetPath = browserUrlForConsolePath(path);
  if (typeof window === "undefined" || currentBrowserUrl() === targetPath) {
    return;
  }
  if (mode === "push") {
    window.history.pushState(null, "", targetPath);
    return;
  }
  window.history.replaceState(null, "", targetPath);
}

export function useBrowserUrlPopState(
  onPopState: (search: URLSearchParams) => void
) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handlePopState = () => {
      onPopState(new URLSearchParams(window.location.search));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onPopState]);
}