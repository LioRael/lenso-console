import fs from "node:fs";
import path from "node:path";

// Native TypeScript declaration emission, never service-module evaluation.
export function generateClient({ root, out, config, checker }) {
  const source = path.join(root, "services.ts");
  // A reused output must not keep callable types after its service is removed.
  fs.rmSync(path.join(out, "client.ts"), { force: true });
  fs.rmSync(path.join(out, "services.d.ts"), { force: true });
  fs.rmSync(path.join(out, "client-types"), { recursive: true, force: true });
  if (!fs.existsSync(source)) {
    return;
  }
  const types = path.join(out, "client-types");
  const declarationConfig = path.join(out, "typecheck", "services.json");
  fs.writeFileSync(
    declarationConfig,
    JSON.stringify({
      ...config,
      compilerOptions: {
        ...config.compilerOptions,
        noEmit: false,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: types,
        rootDir: path.parse(root).root,
      },
      files: [source],
    })
  );
  const result = Bun.spawnSync(
    [
      process.execPath,
      checker,
      "--project",
      declarationConfig,
      "--listEmittedFiles",
    ],
    { stdout: "pipe", stderr: "inherit" }
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `${source}: service type projection failed\n${result.stdout.toString()}`
    );
  }
  const files = result.stdout
    .toString()
    .split("\n")
    .filter((line) => line.startsWith("TSFILE: "))
    .map((line) => line.slice(8).trim());
  let declarations = files.filter((file) => file.endsWith("/services.d.ts"));
  const parents = source.split(path.sep).slice(0, -1);
  let suffix = "services.d.ts";
  while (declarations.length > 1 && parents.length) {
    suffix = `${parents.pop()}/${suffix}`;
    const currentSuffix = `/${suffix}`;
    declarations = files.filter((file) => file.endsWith(currentSuffix));
  }
  if (declarations.length !== 1) {
    throw new Error(
      `${source}: service declaration projection missing or ambiguous`
    );
  }
  const relative = `./${path
    .relative(out, declarations[0])
    .replaceAll(path.sep, "/")
    .replace(/\.d\.ts$/, "")}`;
  fs.writeFileSync(
    path.join(out, "services.d.ts"),
    `import type definitions from ${JSON.stringify(relative)};\ndeclare const services: typeof definitions;\nexport default services;\n`
  );
  fs.writeFileSync(
    path.join(out, "client.ts"),
    `// Generated from services.ts. Do not edit.\nimport {createClient} from "@lenso/console-sdk/client";\nimport type {WorkspaceServices} from "@lenso/console-sdk";\nimport type definitions from ${JSON.stringify(relative)};\nexport const bindServices = (transport:WorkspaceServices) => createClient<typeof definitions>(transport);\n`
  );
}
