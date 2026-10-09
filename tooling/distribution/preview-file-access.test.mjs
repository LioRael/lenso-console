import { test } from "bun:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import { createServer as createHttpServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { createServer } from "vite";

import { previewFileAccess } from "../../packages/console-authoring/dev/file-access.mjs";

const closeServer = (server) =>
  server.listening ? promisify(server.close.bind(server))() : Promise.resolve();

// Direct outside-file/.env checks miss links whose request path looks allowed.
// Also prevent a cached module from surviving a link's destination change.
test("preview rejects symlink escapes and masked env files before Vite serves them", async () => {
  const temp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "console-preview-access-"))
  );
  const root = path.join(temp, "plugin");
  fs.mkdirSync(root);
  const safe = path.join(root, "safe.js");
  const outside = path.join(temp, "outside.js");
  const env = path.join(root, ".env");
  fs.writeFileSync(safe, 'export const value = "explicit safe fixture";');
  fs.writeFileSync(outside, 'export const value = "explicit outside fixture";');
  fs.writeFileSync(env, "EXPLICIT_NONSECRET_FIXTURE=1");
  fs.symlinkSync(outside, path.join(root, "outside-link.js"));
  fs.symlinkSync(env, path.join(root, "env-link.txt"));
  const mutable = path.join(root, "mutable-link.js");
  fs.symlinkSync(safe, mutable);
  const vite = await createServer({
    configFile: false,
    envDir: false,
    plugins: [
      {
        configureServer(server) {
          server.middlewares.use(previewFileAccess(server));
        },
        name: "preview-file-access",
      },
    ],
    publicDir: false,
    root,
    server: {
      fs: { allow: [root], strict: true },
      hmr: false,
      middlewareMode: true,
      ws: false,
    },
  });
  const http = createHttpServer(vite.middlewares);
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const origin = `http://127.0.0.1:${http.address().port}`;
  try {
    for (const file of [
      outside,
      path.join(root, "outside-link.js"),
      path.join(root, "env-link.txt"),
      env,
    ]) {
      for (const query of ["", "?raw"]) {
        const response = await fetch(`${origin}/@fs${file}${query}`);
        assert.equal(response.status, 403, file + query);
        await response.text();
      }
    }
    const allowed = await fetch(`${origin}/@fs${mutable}`);
    assert.equal(allowed.status, 200);
    assert.match(await allowed.text(), /explicit safe fixture/u);
    fs.unlinkSync(mutable);
    fs.symlinkSync(outside, mutable);
    const changed = await fetch(`${origin}/@fs${mutable}`);
    assert.equal(changed.status, 403);
    await changed.text();
    const normal = await fetch(`${origin}/safe.js`);
    assert.equal(normal.status, 200);
    assert.match(await normal.text(), /explicit safe fixture/u);
  } finally {
    http.closeAllConnections();
    await Promise.all([vite.close(), closeServer(http)]);
    fs.rmSync(temp, { force: true, recursive: true });
  }
});
