import { createReadStream, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { PluginOption } from "vite";

interface ConsoleDevPluginOptions {
  agentControlToken?: string | undefined;
  diagnosticsFile?: string | undefined;
  hostUrl?: string | undefined;
}

type NextFunction = (error?: unknown) => void;

export function consoleDevPlugin({
  agentControlToken,
  diagnosticsFile,
  hostUrl,
}: ConsoleDevPluginOptions = {}): PluginOption {
  return {
    name: "lenso-console-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        runConsoleDevRequest({
          next,
          options: { agentControlToken, diagnosticsFile, hostUrl },
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
  if (pathname === "/console/dev/diagnostics.json" && options.diagnosticsFile) {
    sendFile(res, options.diagnosticsFile, "application/json");
    return;
  }

  if (options.hostUrl && shouldProxyToHost(pathname)) {
    await proxyToHost({
      agentControlToken: options.agentControlToken,
      hostUrl: options.hostUrl,
      req,
      res,
    });
    return;
  }

  next();
}

function requestPathname(url: string) {
  return new URL(url, "http://lenso.local").pathname;
}

function shouldProxyToHost(pathname: string) {
  return pathname.startsWith("/api/console/");
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
  res,
}: {
  agentControlToken?: string | undefined;
  hostUrl: string;
  req: IncomingMessage;
  res: ServerResponse;
}) {
  const target = new URL(req.url ?? "/", hostUrl);
  const body = await requestBody(req);
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
    headers: proxyHeaders(req, agentControlToken),
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
  agentControlToken?: string | undefined
) {
  const headers = new Headers();
  const accept = firstHeader(req.headers.accept) ?? "*/*";
  const authorization = firstHeader(req.headers.authorization);
  const contentType = firstHeader(req.headers["content-type"]);

  headers.set("accept", accept);
  if (
    agentControlToken &&
    requestPathname(req.url ?? "").startsWith("/api/console/v1/agent/control/")
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
