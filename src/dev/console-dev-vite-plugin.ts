import { createReadStream, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";

import type { PluginOption } from "vite";

const MAX_DEV_PROXY_BODY_BYTES = 1024 * 1024;
const REQUEST_TARGET_ORIGIN = "http://lenso.local";

interface ConsoleDevPluginOptions {
  agentControlToken?: string | undefined;
  diagnosticsFile?: string | undefined;
  hostUrl?: string | undefined;
  trustedOrigin?: string | undefined;
}

type NextFunction = (error?: unknown) => void;

export function consoleDevPlugin({
  agentControlToken,
  diagnosticsFile,
  hostUrl,
  trustedOrigin,
}: ConsoleDevPluginOptions = {}): PluginOption {
  return {
    name: "lenso-console-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        runConsoleDevRequest({
          next,
          options: {
            agentControlToken,
            diagnosticsFile,
            hostUrl,
            trustedOrigin,
          },
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

  const requestTarget = parseOriginFormRequestTarget(req.url);
  if (!requestTarget) {
    sendText(res, 400, "invalid request target");
    return;
  }
  const { pathname } = requestTarget;
  if (
    isPrivilegedDevPath(pathname) &&
    !isTrustedDevRequest(req, options.trustedOrigin)
  ) {
    sendText(res, 403, "forbidden development request");
    return;
  }
  if (pathname === "/console/dev/diagnostics.json" && options.diagnosticsFile) {
    sendFile(res, options.diagnosticsFile, "application/json");
    return;
  }

  if (options.hostUrl && shouldProxyToHost(pathname)) {
    await proxyToHost({
      agentControlToken: options.agentControlToken,
      hostUrl: options.hostUrl,
      req,
      requestTarget,
      res,
    });
    return;
  }

  next();
}

type OriginFormRequestTarget = {
  pathname: string;
  search: string;
};

function parseOriginFormRequestTarget(
  value: string
): OriginFormRequestTarget | undefined {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  try {
    const target = new URL(value, REQUEST_TARGET_ORIGIN);
    if (target.origin !== REQUEST_TARGET_ORIGIN || target.hash) {
      return undefined;
    }
    return { pathname: target.pathname, search: target.search };
  } catch {
    return undefined;
  }
}

function shouldProxyToHost(pathname: string) {
  return pathname.startsWith("/api/console/");
}

function isPrivilegedDevPath(pathname: string) {
  return (
    pathname === "/console/dev/diagnostics.json" || shouldProxyToHost(pathname)
  );
}

function isLoopbackPeer(req: IncomingMessage) {
  const address = req.socket.remoteAddress?.toLowerCase().split("%", 1)[0];
  return (
    address === "::1" ||
    address?.startsWith("127.") === true ||
    address?.startsWith("::ffff:127.") === true
  );
}

function isTrustedDevRequest(
  req: IncomingMessage,
  trustedOrigin: string | undefined
) {
  const host = requestHost(req);
  if (!host) {
    return false;
  }
  const trustedOriginUrl = trustedOrigin ? new URL(trustedOrigin) : undefined;
  const isLoopbackRequest =
    isLoopbackPeer(req) && isLoopbackHostname(host.hostname);
  const isConfiguredRemoteRequest =
    trustedOriginUrl?.host.toLowerCase() === host.authority;
  if (!(isLoopbackRequest || isConfiguredRemoteRequest)) {
    return false;
  }

  const origin = firstHeader(req.headers.origin);
  if (!origin) {
    return isBrowserSameOriginRead(req);
  }
  try {
    const url = new URL(origin);
    const isCanonicalSameHostOrigin =
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.host.toLowerCase() === host.authority &&
      url.origin === origin;
    if (!isCanonicalSameHostOrigin) {
      return false;
    }
    return isLoopbackRequest || origin === trustedOrigin;
  } catch {
    return false;
  }
}

function requestHost(req: IncomingMessage) {
  const value = firstHeader(req.headers.host);
  if (!value) {
    return undefined;
  }
  try {
    const url = new URL(`http://${value}`);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return {
      authority: url.host.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
    };
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname: string) {
  const address =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    (isIP(address) === 4 && address.split(".", 1)[0] === "127") ||
    (isIP(address) === 6 && address === "::1")
  );
}

function isBrowserSameOriginRead(req: IncomingMessage) {
  return (
    (req.method === "GET" || req.method === "HEAD") &&
    firstHeader(req.headers["sec-fetch-site"]) === "same-origin" &&
    firstHeader(req.headers["sec-fetch-mode"]) === "cors" &&
    firstHeader(req.headers["sec-fetch-dest"]) === "empty"
  );
}

function sendText(res: ServerResponse, statusCode: number, body: string) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(body);
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

async function proxyToHost({
  agentControlToken,
  hostUrl,
  req,
  requestTarget,
  res,
}: {
  agentControlToken?: string | undefined;
  hostUrl: string;
  req: IncomingMessage;
  requestTarget: OriginFormRequestTarget;
  res: ServerResponse;
}) {
  const configuredHost = new URL(hostUrl);
  const target = new URL(configuredHost.origin);
  target.pathname = requestTarget.pathname;
  target.search = requestTarget.search;
  if (target.origin !== configuredHost.origin) {
    throw new Error(
      "Console development proxy target escaped configured Host Origin"
    );
  }
  const bodyResult = await requestBody(req);
  if (bodyResult.tooLarge) {
    sendText(res, 413, "request body too large");
    return;
  }
  const { body } = bodyResult;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const abortIfIncomplete = () => {
    if (!res.writableEnded) {
      abort();
    }
  };
  req.once("aborted", abort);
  res.once("close", abortIfIncomplete);
  const init: RequestInit = {
    headers: proxyHeaders(req, agentControlToken, requestTarget.pathname),
    signal: controller.signal,
  };
  if (req.method) {
    init.method = req.method;
  }
  if (body) {
    init.body = new Uint8Array(body);
  }
  try {
    const response = await fetch(target, init);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const reader = response.body.getReader();
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        res.write(Buffer.from(value));
      }
    }
    if (!(res.destroyed || res.writableEnded)) {
      res.end();
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      throw error;
    }
  } finally {
    req.off("aborted", abort);
    res.off("close", abortIfIncomplete);
  }
}

function proxyHeaders(
  req: IncomingMessage,
  agentControlToken: string | undefined,
  pathname: string
) {
  const headers = new Headers();
  const accept = firstHeader(req.headers.accept) ?? "*/*";
  const authorization = firstHeader(req.headers.authorization);
  const contentType = firstHeader(req.headers["content-type"]);

  headers.set("accept", accept);
  if (
    agentControlToken &&
    pathname.startsWith("/api/console/v1/agent/control/")
  ) {
    headers.set("authorization", `Bearer ${agentControlToken}`);
  } else if (authorization) {
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

async function requestBody(req: IncomingMessage): Promise<{
  body: Buffer | undefined;
  tooLarge: boolean;
}> {
  if (req.method === "GET" || req.method === "HEAD") {
    return { body: undefined, tooLarge: false };
  }
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.byteLength;
    if (receivedBytes > MAX_DEV_PROXY_BODY_BYTES) {
      req.resume();
      return { body: undefined, tooLarge: true };
    }
    chunks.push(buffer);
  }
  return {
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
    tooLarge: false,
  };
}
