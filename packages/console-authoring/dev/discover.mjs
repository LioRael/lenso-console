import { discoverPages } from "../compiler/page-discovery.mjs";

if (process.argv[2] === "--http-paths") {
  const { parseConsoleHttpPaths } = await import("../src/http-paths.ts");
  process.stdout.write(
    JSON.stringify(parseConsoleHttpPaths(JSON.parse(process.argv[3])))
  );
} else {
  process.stdout.write(
    JSON.stringify(await discoverPages(process.argv[2], process.argv[3]))
  );
}
