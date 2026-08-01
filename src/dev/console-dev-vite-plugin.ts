import { createReadStream, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import type { PluginOption } from "vite";

interface ConsoleDevPluginOptions {
  diagnosticsFile?: string | undefined;
  extensionsDir?: string | undefined;
  hostUrl?: string | undefined;
  registryFile?: string | undefined;
}

type NextFunction = (error?: unknown) => void;

export function consoleDevPlugin({
  diagnosticsFile,
  extensionsDir,
  hostUrl,
  registryFile,
}: ConsoleDevPluginOptions = {}): PluginOption {
  return {
    name: "lenso-console-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        runConsoleDevRequest({
          next,
          options: { diagnosticsFile, extensionsDir, hostUrl, registryFile },
          req,
          res,
        });
      });
    },
  };
}

function runConsoleDevRequest(params: {
  next: NextFunction;
  options: ConsoleDevPluginOptions;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  void handleConsoleDevRequestSafely(params);
}

async function handleConsoleDevRequestSafely(params: {
  next: NextFunction;
  options: ConsoleDevPluginOptions;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  try {
    await handleConsoleDevRequest(params);
  } catch (error) {
    params.next(error);
  }
}

async function handleConsoleDevRequest({
  next,
  options,
  req,
  res,
}: {
  next: NextFunction;
  options: ConsoleDevPluginOptions;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  if (!req.url) {
    next();
    return;
  }

  const pathname = requestPathname(req.url);
  if (pathname === "/console/dev/registry.json" && options.registryFile) {
    sendFile(res, options.registryFile, "application/json");
    return;
  }

  if (pathname === "/console/dev/diagnostics.json" && options.diagnosticsFile) {
    sendFile(res, options.diagnosticsFile, "application/json");
    return;
  }

  if (pathname === "/api/console/v1/composition" && options.hostUrl) {
    sendJson(res, consoleDevComposition());
    return;
  }

  if (
    pathname.startsWith("/console/dev/extensions/") &&
    options.extensionsDir
  ) {
    sendDevAsset({ extensionsDir: options.extensionsDir, pathname, res });
    return;
  }

  if (options.hostUrl && shouldProxyToHost(pathname)) {
    await proxyToHost({ hostUrl: options.hostUrl, req, res });
    return;
  }

  next();
}

function requestPathname(url: string) {
  return new URL(url, "http://lenso.local").pathname;
}

function shouldProxyToHost(pathname: string) {
  return pathname.startsWith("/admin/") || pathname.startsWith("/v1/");
}

function sendDevAsset({
  extensionsDir,
  pathname,
  res,
}: {
  extensionsDir: string;
  pathname: string;
  res: ServerResponse;
}) {
  const assetName = pathname.replace("/console/dev/extensions/", "");
  const assetPath = safeJoin(extensionsDir, assetName);
  if (!assetPath) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  const contentType = assetName.endsWith(".css")
    ? "text/css"
    : "text/javascript";
  sendFile(res, assetPath, contentType, {
    fallbackBody: assetName.endsWith(".css") ? "" : undefined,
  });
}

function safeJoin(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (
    resolvedPath === resolvedRoot ||
    !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    return null;
  }
  return resolvedPath;
}

function sendFile(
  res: ServerResponse,
  filePath: string,
  contentType: string,
  { fallbackBody }: { fallbackBody?: string | undefined } = {}
) {
  if (!existsSync(filePath)) {
    res.statusCode = fallbackBody === undefined ? 404 : 200;
    res.setHeader("content-type", contentType);
    res.end(fallbackBody ?? "not found");
    return;
  }
  res.setHeader("content-type", contentType);
  createReadStream(filePath).pipe(res);
}

function sendJson(res: ServerResponse, value: unknown) {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(value));
}

export function consoleDevComposition() {
  return {
    issues: [],
    modules: [
      { kind: "shell", moduleId: "console-dev-shell" },
      { kind: "mandatory", moduleId: "auth", role: "identity" },
      {
        kind: "mandatory",
        moduleId: "console-dev-host",
        role: "system_registry",
      },
    ],
    schema: "lenso.console-service-composition.v2",
    serviceId: "lenso-console",
    status: "ready",
    workloadMode: "normal",
  } as const;
}

async function proxyToHost({
  hostUrl,
  req,
  res,
}: {
  hostUrl: string;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  const target = new URL(req.url ?? "/", hostUrl);
  const body = await requestBody(req);
  const init: RequestInit = {
    headers: proxyHeaders(req),
  };
  if (req.method) {
    init.method = req.method;
  }
  if (body) {
    init.body = new Uint8Array(body);
  }
  const response = await fetch(target, init);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

function proxyHeaders(req: IncomingMessage) {
  const headers = new Headers();
  const accept = firstHeader(req.headers.accept) ?? "*/*";
  const authorization = firstHeader(req.headers.authorization);
  const contentType = firstHeader(req.headers["content-type"]);

  headers.set("accept", accept);
  if (authorization) {
    headers.set("authorization", authorization);
  }
  if (contentType) {
    headers.set("content-type", contentType);
  }
  return headers;
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function requestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") {
    return undefined;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}
