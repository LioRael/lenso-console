import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

// npm can accept a publish while its malware scan still withholds the package.
// A release is ready only when public metadata and its tarball are available.
export const waitForPackage = async (
  { name, version, integrity },
  {
    fetch: request = fetch,
    now = Date.now,
    sleep = delay,
    timeoutMs = 1800000,
    intervalMs = 20000,
  } = {}
) => {
  const deadline = now() + timeoutMs;
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  while (now() < deadline) {
    const response = await request(url, {
      headers: { "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(30000, deadline - now()))
      ),
    });
    if (response.ok) {
      const metadata = await response.json();
      if (
        metadata.name !== name ||
        metadata.version !== version ||
        metadata.dist?.integrity !== integrity
      ) {
        throw new Error(
          `Published package differs from the verified archive: ${name}@${version}`
        );
      }
      const tarball = new URL(metadata.dist.tarball);
      if (tarball.origin !== "https://registry.npmjs.org") {
        throw new Error(
          `Unexpected registry tarball origin: ${tarball.origin}`
        );
      }
      const artifact = await request(tarball, {
        method: "HEAD",
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(30000, deadline - now()))
        ),
      });
      if (artifact.ok) {
        return;
      }
      if (artifact.status !== 404) {
        throw new Error(
          `Tarball check failed (${artifact.status}): ${name}@${version}`
        );
      }
    } else if (response.status !== 404) {
      throw new Error(
        `Registry check failed (${response.status}): ${name}@${version}`
      );
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
  throw new Error(
    `Package is not publicly installable after ${timeoutMs / 1000}s: ${name}@${version}. Inspect npm publish/scan status; do not overwrite this version.`
  );
};

if (process.argv[1] && import.meta.filename === realpathSync(process.argv[1])) {
  const [archive] = process.argv.slice(2);
  if (!archive || process.argv.length !== 3) {
    throw new Error("Usage: wait-for-npm-package.mjs <verified-npm-tarball>");
  }
  const metadata = JSON.parse(
    execFileSync("tar", ["-xOf", archive, "package/package.json"], {
      encoding: "utf-8",
    })
  );
  const integrity = `sha512-${createHash("sha512").update(readFileSync(archive)).digest("base64")}`;
  console.log(
    `Waiting for public installation: ${metadata.name}@${metadata.version}`
  );
  await waitForPackage({
    integrity,
    name: metadata.name,
    version: metadata.version,
  });
  console.log(
    `Public metadata, integrity, and tarball verified: ${metadata.name}@${metadata.version}`
  );
}
