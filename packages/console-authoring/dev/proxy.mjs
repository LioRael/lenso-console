import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const within = (path, prefix) =>
  path === prefix || path.startsWith(`${prefix}/`);

/** Preserve Origin, cookies, CSRF and actor headers. Never synthesize authority. */
export function backendProxy(backend, paths, localOrigin) {
  const active = new Set();
  const prefixes = [
    paths.api_base_path,
    paths.auth_base_path,
    ...(paths.workspace_sources ?? []).flatMap((source) => [
      source.api_base_path,
      source.auth_base_path,
    ]),
  ];
  const handle = async (req, res, next) => {
    let target;
    try {
      target = new URL(req.url, localOrigin);
      if (
        target.origin !== localOrigin ||
        !req.url.startsWith("/") ||
        req.url.startsWith("//")
      ) {
        throw new Error("Invalid origin-form request target");
      }
    } catch {
      res.writeHead(400);
      res.end("Invalid request target");
      return;
    }
    if (!prefixes.some((prefix) => within(target.pathname, prefix))) {
      next();
      return;
    }
    const safeRead = ["GET", "HEAD", "OPTIONS"].includes(req.method);
    if (
      (req.headers.origin && req.headers.origin !== localOrigin) ||
      (!safeRead && req.headers.origin !== localOrigin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      res.writeHead(403);
      res.end("Forbidden development request");
      return;
    }
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
      res.destroy();
      req.destroy();
    };
    active.add(cancel);
    const abort = () => controller.abort();
    const close = () => {
      if (!res.writableEnded) {
        abort();
      }
    };
    req.once("aborted", abort);
    res.once("close", close);
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (
          [
            "host",
            "connection",
            "content-length",
            "transfer-encoding",
            "accept-encoding",
            "upgrade",
          ].includes(name) ||
          value === undefined
        ) {
          continue;
        }
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      const chunks = [];
      let bytes = 0;
      if (!safeRead) {
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          bytes += chunk.length;
          if (bytes > 1024 * 1024) {
            req.resume();
            res.writeHead(413);
            res.end("Request body too large");
            return;
          }
          chunks.push(chunk);
        }
      }
      const response = await fetch(
        new URL(target.pathname + target.search, backend.origin),
        {
          method: req.method,
          headers,
          redirect: "manual",
          signal: controller.signal,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        }
      );
      res.statusCode = response.status;
      for (const [name, value] of response.headers) {
        if (
          ![
            "set-cookie",
            "connection",
            "transfer-encoding",
            "content-encoding",
            "content-length",
          ].includes(name)
        ) {
          res.setHeader(name, value);
        }
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) {
        res.setHeader("set-cookie", cookies);
      }
      if (response.body) {
        await pipeline(Readable.fromWeb(response.body), res, {
          signal: controller.signal,
        });
      } else {
        res.end();
      }
    } catch {
      if (!controller.signal.aborted) {
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "text/plain" });
        }
        res.end("Compatible backend unavailable");
      }
    } finally {
      req.off("aborted", abort);
      res.off("close", close);
      active.delete(cancel);
    }
  };
  handle.close = () => {
    for (const cancel of active) {
      cancel();
    }
  };
  return handle;
}
