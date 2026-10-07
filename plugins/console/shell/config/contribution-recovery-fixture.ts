import type { Plugin } from "vite";

// Browser acceptance only: an HTTP asset changes from an empty, successful ESM
// response to repaired code. Immutable data: fixtures cannot reproduce this.
export const contributionRecoveryFixture = (): Plugin => {
  const reads = new Map<string, number>();
  return {
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "", "http://fixture.invalid");
        const match =
          /^\/api\/console\/v1\/pages\/recovery-(empty|invalid|valid)-[a-f0-9-]+\/assets\/a{64}\/workspace\.(mjs|css)$/u.exec(
            url.pathname
          );
        if (!match) {
          next();
          return;
        }
        const count = (reads.get(url.pathname) ?? 0) + 1;
        reads.set(url.pathname, count);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (match[2] === "css") {
          response.setHeader("Content-Type", "text/css; charset=utf-8");
          response.end(".recovery-fixture{padding:16px}");
          return;
        }
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        if (match[1] === "empty" && count === 1) {
          response.end("");
          return;
        }
        response.end(`
          const key = ${JSON.stringify(url.pathname)};
          globalThis.__lensoRecoveryEvaluations[key] = (globalThis.__lensoRecoveryEvaluations[key] ?? 0) + 1;
          export const apiMajor = ${match[1] === "invalid" ? '"1"' : "1"};
          export function createWorkspace({createElement}) {
            return {Page: ({mount}) => createElement("h1", null, "Recovered " + mount.title)};
          }
        `);
      });
    },
    name: "console-contribution-recovery-fixture",
  };
};
