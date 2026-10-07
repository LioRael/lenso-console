import fs from "node:fs";
import path from "node:path";

import { isFileLoadingAllowed, normalizePath } from "vite";

/** Check the actual file before Vite's raw/static and cached-module handlers. */
export function previewFileAccess(vite) {
  const { root, base } = vite.config;
  return (req, res, next) => {
    let file;
    try {
      const pathname = decodeURI(new URL(req.url, "http://127.0.0.1").pathname);
      const local = pathname.startsWith(base)
        ? pathname.slice(base.length - 1)
        : pathname;
      let target;
      if (local.startsWith("/@fs/")) {
        target = local.slice("/@fs/".length);
        if (!path.isAbsolute(target)) {
          target = `/${target}`;
        }
      } else {
        target = path.resolve(root, `.${local}`);
      }
      file = fs.realpathSync(target);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        return next();
      }
      res.writeHead(403);
      res.end("Forbidden preview file");
      return;
    }
    if (!isFileLoadingAllowed(vite.config, normalizePath(file))) {
      res.writeHead(403);
      res.end("Forbidden preview file");
      return;
    }
    return next();
  };
}
