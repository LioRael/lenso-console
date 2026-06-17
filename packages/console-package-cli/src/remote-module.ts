import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildConsolePackageContext,
  queueRemoteConsolePackageFiles,
} from "./console-package";
import {
  consolePackageKey,
  findRepoRoot,
  formatRemoteModuleEntries,
  parseRemoteModuleEntries,
  pathExists,
  queueWrite,
  readJsonFromReference,
  readTextIfExists,
  slugify,
  titleCase,
  upsertEnvValue,
  writePendingFiles,
} from "./file-utils";
import type {
  CliOptions,
  ConsolePackageContext,
  ConsolePackageInstallPlan,
  ConsoleSurfaceManifest,
  JsonRecord,
  ModuleCatalog,
  PendingWrites,
  RemoteModuleManifest,
} from "./types";

const remoteManifestJson = ({
  packageContext,
}: {
  packageContext: ConsolePackageContext;
}) => ({
  admin: {
    entities: [
      {
        fields: [
          {
            field_type: { kind: "string" },
            label: "Email",
            name: "email",
            nullable: false,
          },
          {
            field_type: { kind: "string" },
            label: "Name",
            name: "name",
            nullable: false,
          },
          {
            field_type: { kind: "timestamp" },
            label: "Created At",
            name: "created_at",
            nullable: false,
          },
        ],
        label: "Contacts",
        name: "contacts",
        read_capability: packageContext.capability,
      },
    ],
    kind: "schema",
  },
  capabilities: [packageContext.capability],
  console: [
    {
      area: packageContext.area,
      icon: packageContext.icon,
      label: packageContext.label,
      name: packageContext.surfaceName,
      navigation: {
        order: 10,
        workspace: {
          icon: packageContext.icon,
          id: packageContext.moduleId,
          label: packageContext.label,
        },
      },
      package: {
        export: packageContext.moduleName,
        name: packageContext.packageName,
      },
      required_capabilities: [packageContext.capability],
      route: packageContext.route,
    },
  ],
  http_routes: [
    {
      capability: packageContext.capability,
      display_name: "Fetch Contact",
      method: "GET",
      path: "/contacts/{id}",
      story_title: "Fetch Contact",
    },
  ],
  lifecycle: {
    activation_jobs: [
      {
        function_name: `${packageContext.moduleId}.contacts.enrich.v1`,
        input: { reason: "worker_startup" },
        name: "sync contacts on startup",
        required: true,
        run_policy: "every_startup",
      },
    ],
    startup_checks: [
      {
        function_name: `${packageContext.moduleId}.contacts.enrich.v1`,
        kind: "function_registered",
        name: "contacts enrich function is registered",
        required: true,
      },
    ],
  },
  name: packageContext.moduleId,
  runtime: {
    functions: [
      {
        input_schema: `${packageContext.moduleId}.contacts.enrich.v1`,
        name: `${packageContext.moduleId}.contacts.enrich.v1`,
        queue: packageContext.moduleId,
        retry_policy: {
          initial_delay_ms: 1000,
          max_attempts: 3,
        },
        version: 1,
      },
    ],
  },
  source: "remote",
  version: "0.1.0",
});

const remoteCatalogEntryJson = ({
  packageContext,
}: {
  packageContext: ConsolePackageContext;
}) => ({
  baseUrl: "https://example.com/lenso/module/v1",
  consolePackages: [
    {
      exportName: packageContext.moduleName,
      packageName: packageContext.packageName,
      route: packageContext.route,
    },
  ],
  manifestReference: "https://example.com/lenso/module/v1/manifest",
  name: packageContext.moduleId,
  source: "remote",
  summary: `${packageContext.label} workspace and operations`,
  version: "0.1.0",
});

const remotePackageReadme = ({
  moduleId,
  packageRootName,
}: {
  moduleId: string;
  packageRootName: string;
}) => `# ${titleCase(moduleId)}

Remote Lenso module package scaffold.

## Shape

- \`lenso.module.json\`: install-time module manifest.
- \`catalog-entry.json\`: optional local catalog entry for discovery.
- \`backend/\`: remote module backend implementation.
- \`console/\`: optional Runtime Console package.
- \`contracts/\`: module-owned event and runtime-function contracts.

## Local

\`\`\`sh
pnpm dev
pnpm smoke
pnpm check
\`\`\`

## Install

Expose the remote module protocol from a stable base URL such as:

\`\`\`text
GET https://example.com/lenso/module/v1/manifest
\`\`\`

Use \`catalog-entry.json\` as the local discovery record, or add the manifest
URL directly:

\`\`\`sh
lenso module catalog add https://example.com/lenso/module/v1/manifest
\`\`\`

Then install it into a host project:

\`\`\`sh
lenso module catalog add https://example.com/lenso/module/v1/manifest
lenso module add https://example.com/lenso/module/v1/manifest
lenso console-package apply-plan
pnpm install
\`\`\`

If the manifest is inspected from a local file, provide the runtime base URL:

\`\`\`sh
lenso module add ./lenso.module.json --base-url https://example.com/lenso/module/v1
lenso console-package apply-plan
\`\`\`

This scaffold lives in \`${packageRootName}\` and should stay separate from a
host application's linked \`modules/\` workspace.
`;

const remoteBackendReadme = ({
  moduleId,
}: {
  moduleId: string;
}) => `# Remote module backend

The generated Node server exposes the ${moduleId} manifest at:

\`\`\`text
GET /lenso/module/v1/manifest
\`\`\`

Run it locally:

\`\`\`sh
cd backend
pnpm install
pnpm dev
\`\`\`

Replace \`src/server.mjs\` with the language or framework you prefer as the
module grows.

The backend should expose the remote module protocol expected by
\`platform-module-remote\`, including a stable manifest endpoint and any
declared schema-admin, action, HTTP proxy, or runtime-function endpoints.

The host owns auth, capability enforcement, proxy policy, runtime queues,
retries, Runtime Stories, and Technical Operations records.
`;

const remoteBackendPackageJson = ({ moduleId }: { moduleId: string }) =>
  `${JSON.stringify(
    {
      dependencies: {
        "@lenso/remote-module-kit": "^0.1.0",
      },
      name: `${moduleId}-remote-backend`,
      private: true,
      scripts: {
        check: "node src/smoke.mjs",
        dev: "node src/server.mjs",
        smoke: "node src/smoke.mjs",
        start: "node src/server.mjs",
      },
      type: "module",
      version: "0.1.0",
    },
    null,
    2
  )}\n`;

const remoteBackendServer = ({
  packageContext,
}: {
  packageContext: ConsolePackageContext;
}) => `import {
  defineRemoteModule,
  defineSchemaEntity,
  everyStartup,
  getRoute,
  lifecycle,
  runtimeFunction,
  schemaAdmin,
  serveRemoteModule,
  textField,
  timestampField,
} from "@lenso/remote-module-kit";

const contacts = [
  {
    id: "contact_1",
    created_at: "2026-01-01T00:00:00Z",
    email: "ada@example.com",
    name: "Ada Lovelace",
  },
  {
    id: "contact_2",
    created_at: "2026-01-02T00:00:00Z",
    email: "grace@example.com",
    name: "Grace Hopper",
  },
];

const contactsEntity = defineSchemaEntity({
  fields: [textField("email"), textField("name"), timestampField("created_at")],
  label: "Contacts",
  name: "contacts",
  readCapability: "${packageContext.capability}",
});

const module = defineRemoteModule({
  admin: schemaAdmin([contactsEntity]),
  capabilities: ["${packageContext.capability}"],
  console: [
    {
      area: "${packageContext.area}",
      icon: "${packageContext.icon}",
      label: "${packageContext.label}",
      name: "${packageContext.surfaceName}",
      navigation: {
        order: 10,
        workspace: {
          icon: "${packageContext.icon}",
          id: "${packageContext.moduleId}",
          label: "${packageContext.label}",
        },
      },
      package: {
        export: "${packageContext.moduleName}",
        name: "${packageContext.packageName}",
      },
      required_capabilities: ["${packageContext.capability}"],
      route: "${packageContext.route}",
    },
  ],
  httpRoutes: [
    getRoute("/contacts/{id}", {
      capability: "${packageContext.capability}",
      displayName: "Fetch Contact",
      storyTitle: "Fetch Contact",
    }),
  ],
  lifecycle: lifecycle({
    activationJobs: [
      everyStartup(
        "sync contacts on startup",
        "${packageContext.moduleId}.contacts.enrich.v1",
        {
          input: { reason: "worker_startup" },
        }
      ),
    ],
    startupChecks: [
      {
        function_name: "${packageContext.moduleId}.contacts.enrich.v1",
        kind: "function_registered",
        name: "contacts enrich function is registered",
        required: true,
      },
    ],
  }),
  name: "${packageContext.moduleId}",
  runtimeFunctions: [
    runtimeFunction("${packageContext.moduleId}.contacts.enrich.v1", {
      inputSchema: "${packageContext.moduleId}.contacts.enrich.v1",
      queue: "${packageContext.moduleId}",
      retryPolicy: {
        initial_delay_ms: 1000,
        max_attempts: 3,
      },
      version: 1,
    }),
  ],
  version: "0.1.0",
});

await serveRemoteModule(module, {
  data: {
    contacts: {
      detail: async (id) => contacts.find((contact) => contact.id === id),
      list: async ({ limit }) => ({
        next_cursor: null,
        records: contacts.slice(0, limit),
      }),
    },
  },
  http: {
    "GET /contacts/{id}": ({ params }) =>
      contacts.find((contact) => contact.id === params.id) ?? null,
  },
  runtime: {
    "${packageContext.moduleId}.contacts.enrich.v1": ({ input }) => {
      const contactId = input?.contact_id;
      const contact = contacts.find((item) => item.id === contactId);
      return {
        contact,
        enriched: Boolean(contact),
        source: "${packageContext.moduleId}",
      };
    },
  },
  port: Number(process.env.PORT ?? 4100),
  onReady: ({ manifestUrl }) => {
    console.log("${packageContext.moduleId} manifest: " + manifestUrl);
  },
});
`;

const remoteBackendSmoke = ({
  moduleId,
}: {
  moduleId: string;
}) => `import { spawn } from "node:child_process";

const childProcess = spawn(process.execPath, ["src/server.mjs"], {
  env: { ...process.env, PORT: "0" },
  stdio: ["ignore", "pipe", "inherit"],
});

const timeout = setTimeout(() => childProcess.kill(), 3000);

try {
  let manifestUrl = "";
  for await (const chunk of childProcess.stdout) {
    manifestUrl = String(chunk).match(new RegExp("http://\\\\S+", "u"))?.[0] ?? "";
    if (manifestUrl) {
      break;
    }
  }

  if (!manifestUrl) {
    throw new Error("manifest URL was not printed");
  }

  const manifest = await fetch(manifestUrl).then((response) => response.json());
  if (manifest.name !== "${moduleId}" || manifest.source !== "remote") {
    throw new Error("manifest response did not match ${moduleId}");
  }
  const moduleBaseUrl = manifestUrl.slice(0, -"/manifest".length);
  const contact = await fetch(moduleBaseUrl + "/contacts/contact_1").then(
    (response) => response.json()
  );
  if (contact.email !== "ada@example.com") {
    throw new Error("HTTP route response did not match ${moduleId}");
  }
  const runtimeResult = await fetch(
    moduleBaseUrl + "/runtime/functions/${moduleId}.contacts.enrich.v1/invoke",
    {
      body: JSON.stringify({
        actor: { id: "worker", kind: "service", scopes: [] },
        attempt: 1,
        correlation_id: "corr_1",
        function_name: "${moduleId}.contacts.enrich.v1",
        function_run_id: "fnrun_1",
        input: { contact_id: "contact_1" },
        request_id: "req_1",
        trace: { span_id: "span_1", trace_id: "trace_1" },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  ).then((response) => response.json());
  if (!runtimeResult.output?.enriched) {
    throw new Error("runtime function response did not match ${moduleId}");
  }

  console.log("${moduleId} backend smoke passed");
} finally {
  clearTimeout(timeout);
  childProcess.kill();
}
`;

const remoteRootPackageJson = ({ moduleId }: { moduleId: string }) =>
  `${JSON.stringify(
    {
      name: `lenso-${moduleId}`,
      private: true,
      scripts: {
        check: "pnpm --dir backend check && pnpm --dir console check",
        dev: "pnpm --dir backend dev",
        smoke: "pnpm --dir backend smoke",
      },
      type: "module",
      version: "0.1.0",
    },
    null,
    2
  )}\n`;

const remoteContractsReadme = () => `# Module-owned contracts

Keep event and runtime-function JSON Schema contracts here.

The host may validate these before installing or enabling a remote module.
`;

const queueRemoteModuleFiles = ({
  packageContext,
  packageRoot,
  packageRootName,
  pendingWrites,
}: {
  packageContext: ConsolePackageContext;
  packageRoot: string;
  packageRootName: string;
  pendingWrites: PendingWrites;
}) => {
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "lenso.module.json"),
    `${JSON.stringify(remoteManifestJson({ packageContext }), null, 2)}\n`
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "catalog-entry.json"),
    `${JSON.stringify(remoteCatalogEntryJson({ packageContext }), null, 2)}\n`
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "package.json"),
    remoteRootPackageJson({ moduleId: packageContext.moduleId })
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "README.md"),
    remotePackageReadme({
      moduleId: packageContext.moduleId,
      packageRootName,
    })
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "backend/README.md"),
    remoteBackendReadme({ moduleId: packageContext.moduleId })
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "backend/package.json"),
    remoteBackendPackageJson({ moduleId: packageContext.moduleId })
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "backend/src/server.mjs"),
    remoteBackendServer({ packageContext })
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "backend/src/smoke.mjs"),
    remoteBackendSmoke({ moduleId: packageContext.moduleId })
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "backend/openapi.yaml"),
    `openapi: 3.1.0
info:
  title: ${packageContext.label} Remote Module
  version: 0.1.0
paths: {}
`
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "contracts/README.md"),
    remoteContractsReadme()
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "contracts/events/.gitkeep"),
    ""
  );
  queueWrite(
    pendingWrites,
    path.join(packageRoot, "contracts/runtime-functions/.gitkeep"),
    ""
  );
  queueRemoteConsolePackageFiles({ packageContext, pendingWrites });
};

export const createRemoteModule = async ({
  options,
}: {
  options: CliOptions;
}) => {
  const moduleId = slugify(options.moduleId ?? "");
  if (!moduleId) {
    throw new Error("Module id is required");
  }
  const outputRoot = path.resolve(options.outputDir ?? process.cwd());
  const packageRootName = slugify(options.packageRoot ?? `lenso-${moduleId}`);
  const packageRoot = path.join(outputRoot, packageRootName);
  const packageContext = buildConsolePackageContext({
    options: {
      ...options,
      moduleId,
      packageName:
        options.packageName ??
        `${options.packageScope ?? "@vendor"}/lenso-${moduleId}-console`,
      packagePrivate: false,
      packageSlug: `${moduleId}-console`,
      runtimeConsoleApiVersion: "^0.1.0",
      source: options.source ?? "installed",
    },
    runtimeConsoleRoot: packageRoot,
  });
  packageContext.packageDir = path.join(packageRoot, "console");

  if (await pathExists(packageRoot)) {
    throw new Error(`Remote module package already exists: ${packageRoot}`);
  }

  const pendingWrites: PendingWrites = new Map();
  queueRemoteModuleFiles({
    packageContext,
    packageRoot,
    packageRootName,
    pendingWrites,
  });

  if (options.dryRun) {
    console.log("Remote module dry run:");
    for (const filePath of pendingWrites.keys()) {
      console.log(`- ${path.relative(outputRoot, filePath)}`);
    }
    return;
  }

  await writePendingFiles(pendingWrites);

  console.log(`Created remote module package ${packageRootName}.`);
  console.log("Next steps:");
  console.log(`- pnpm --dir ${packageRootName}/backend dev`);
  console.log(
    `- lenso module catalog add http://127.0.0.1:4100/lenso/module/v1/manifest`
  );
  console.log(
    `- lenso module add http://127.0.0.1:4100/lenso/module/v1/manifest`
  );
  console.log("- publish or install the console package");
  console.log("- lenso console-package apply-plan");
  console.log("- pnpm install");
};

const validateRemoteModuleManifest = (
  manifest: unknown
): RemoteModuleManifest => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Remote module manifest must be a JSON object");
  }
  const candidate = manifest as JsonRecord;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) {
    throw new Error("Remote module manifest name is required");
  }
  if (typeof candidate.version !== "string" || !candidate.version.trim()) {
    throw new Error("Remote module manifest version is required");
  }
  if (candidate.source !== "remote") {
    throw new Error("Remote module manifest source must be remote");
  }
  if (!Array.isArray(candidate.capabilities)) {
    throw new TypeError("Remote module manifest capabilities must be an array");
  }
  if (!Array.isArray(candidate.console)) {
    throw new TypeError("Remote module manifest console must be an array");
  }
  return {
    ...candidate,
    capabilities: candidate.capabilities,
    console: candidate.console as ConsoleSurfaceManifest[],
    name: candidate.name.trim(),
    source: "remote",
    version: candidate.version,
  } as RemoteModuleManifest;
};

const trimTrailingSlash = (value: string) => value.replaceAll(/\/+$/gu, "");

const deriveRemoteBaseUrl = ({
  baseUrl,
  manifestReference,
}: {
  baseUrl: string | undefined;
  manifestReference: string;
}) => {
  if (baseUrl) {
    return trimTrailingSlash(baseUrl);
  }
  if (
    manifestReference.startsWith("http://") ||
    manifestReference.startsWith("https://")
  ) {
    const url = new URL(manifestReference);
    if (url.pathname.endsWith("/manifest")) {
      url.pathname = url.pathname.slice(0, -"/manifest".length);
      url.search = "";
      url.hash = "";
      return trimTrailingSlash(url.toString());
    }
  }
  throw new Error(
    "Remote module base URL is required unless the manifest URL ends with /manifest"
  );
};

const updateRemoteModulesEnv = async ({
  envFilePath,
  moduleName,
  baseUrl,
}: {
  baseUrl: string;
  envFilePath: string;
  moduleName: string;
}) => {
  const source = await readTextIfExists(envFilePath);
  const remoteModulesLine = source
    .split("\n")
    .find((line) => line.startsWith("REMOTE_MODULES="));
  const currentValue = remoteModulesLine?.slice("REMOTE_MODULES=".length) ?? "";
  const entries = parseRemoteModuleEntries(currentValue).filter(
    (entry) => entry.name !== moduleName
  );
  entries.push({ baseUrl, name: moduleName });
  return upsertEnvValue(
    source,
    "REMOTE_MODULES",
    formatRemoteModuleEntries(entries)
  );
};

const remoteModuleConsolePackagePlans = ({
  manifest,
  moduleName,
}: {
  manifest: RemoteModuleManifest;
  moduleName: string;
}) =>
  manifest.console
    .map((surface) => ({
      exportName: surface.package?.export,
      packageName: surface.package?.name,
      route: surface.route ?? "-",
      surfaceLabel: surface.label ?? surface.name ?? "-",
      surfaceName: surface.name ?? "-",
    }))
    .filter(
      (
        surface
      ): surface is {
        exportName: string;
        packageName: string;
        route: string;
        surfaceLabel: string;
        surfaceName: string;
      } => Boolean(surface.packageName && surface.exportName)
    )
    .map((surface) => {
      const packageReference = {
        exportName: surface.exportName,
        packageName: surface.packageName,
      };
      return {
        command: `pnpm add ${surface.packageName}`,
        exportName: surface.exportName,
        key: consolePackageKey(packageReference),
        packageName: surface.packageName,
        reason: `${moduleName} / ${surface.surfaceLabel} / ${surface.route}`,
        requestedByModule: moduleName,
        route: surface.route,
        status: "requires_manual_install",
        surfaceLabel: surface.surfaceLabel,
        surfaceName: surface.surfaceName,
      };
    });

const updateConsolePackageInstallPlan = async ({
  baseUrl,
  installPlanPath,
  manifest,
  manifestReference,
  moduleName,
}: {
  baseUrl: string;
  installPlanPath: string;
  manifest: RemoteModuleManifest;
  manifestReference: string;
  moduleName: string;
}) => {
  const source = await readTextIfExists(installPlanPath);
  const currentPlan: ConsolePackageInstallPlan = source
    ? (JSON.parse(source) as ConsolePackageInstallPlan)
    : {
        modules: [],
        version: 1,
      };
  const modules = (currentPlan.modules ?? []).filter(
    (module) => module.moduleName !== moduleName
  );
  modules.push({
    baseUrl,
    consolePackages: remoteModuleConsolePackagePlans({
      manifest,
      moduleName,
    }),
    manifestReference,
    moduleName,
    restartRequired: true,
  });
  return `${JSON.stringify({ modules, version: 1 }, null, 2)}\n`;
};

const consolePackageCountFromInstallPlan = ({
  installPlan,
  moduleName,
}: {
  installPlan: ConsolePackageInstallPlan;
  moduleName: string;
}) => {
  const modulePlan = (installPlan.modules ?? []).find(
    (module) => module.moduleName === moduleName
  );
  return modulePlan?.consolePackages?.length ?? 0;
};

const readModuleCatalog = async (
  catalogFilePath: string
): Promise<ModuleCatalog> => {
  const source = await readTextIfExists(catalogFilePath);
  if (!source) {
    return { modules: [], version: 1 };
  }
  const catalog = JSON.parse(source) as JsonRecord;
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("Module catalog must be a JSON object");
  }
  if (!Array.isArray(catalog.modules)) {
    throw new TypeError("Module catalog modules must be an array");
  }
  return {
    modules: catalog.modules,
    version:
      typeof catalog.version === "number" && Number.isInteger(catalog.version)
        ? catalog.version
        : 1,
  };
};

const moduleCatalogEntryFromManifest = ({
  baseUrl,
  manifest,
  manifestReference,
  summary,
}: {
  baseUrl: string;
  manifest: RemoteModuleManifest;
  manifestReference: string;
  summary: string | undefined;
}) => ({
  baseUrl,
  consolePackages: manifest.console
    .map((surface) => ({
      exportName: surface.package?.export,
      packageName: surface.package?.name,
      route: surface.route,
    }))
    .filter((item) => item.packageName && item.exportName),
  manifestReference,
  name: manifest.name.trim(),
  source: "remote",
  summary: summary ?? manifest.summary ?? "-",
  version: manifest.version.trim(),
});

export const addModuleCatalogEntry = async ({
  manifestReference,
  options,
}: {
  manifestReference: string;
  options: CliOptions;
}) => {
  const repoRoot = options.repoRoot
    ? path.resolve(options.repoRoot)
    : await findRepoRoot(process.cwd());
  const catalogFilePath = path.resolve(
    options.catalogFile ?? path.join(repoRoot, ".lenso/module-catalog.json")
  );
  const manifest = validateRemoteModuleManifest(
    await readJsonFromReference(manifestReference)
  );
  const remoteModule = manifest;
  const baseUrl = deriveRemoteBaseUrl({
    baseUrl: options.baseUrl,
    manifestReference,
  });
  const catalog = await readModuleCatalog(catalogFilePath);
  const modules = catalog.modules.filter(
    (entry) => entry.name !== remoteModule.name
  );
  modules.push(
    moduleCatalogEntryFromManifest({
      baseUrl,
      manifest,
      manifestReference,
      summary: options.summary,
    })
  );
  const nextCatalog = `${JSON.stringify({ modules, version: 1 }, null, 2)}\n`;

  if (options.dryRun) {
    console.log("Module catalog dry run:");
    console.log(`- ${path.relative(repoRoot, catalogFilePath)}`);
    console.log(`- ${remoteModule.name} ${remoteModule.version}`);
    return;
  }

  await mkdir(path.dirname(catalogFilePath), { recursive: true });
  await writeFile(catalogFilePath, nextCatalog);

  console.log(`Added ${remoteModule.name} to module catalog.`);
  console.log("Updated:");
  console.log(`- ${path.relative(repoRoot, catalogFilePath)}`);
  console.log("Install:");
  console.log(`- lenso module add ${manifestReference}`);
};

export const addRemoteModule = async ({
  manifestReference,
  options,
}: {
  manifestReference: string;
  options: CliOptions;
}) => {
  const repoRoot = options.repoRoot
    ? path.resolve(options.repoRoot)
    : await findRepoRoot(process.cwd());
  const envFilePath = path.resolve(
    options.envFile ?? path.join(repoRoot, ".env")
  );
  const installPlanPath = path.resolve(
    options.installPlanFile ??
      path.join(repoRoot, ".lenso/console-package-install-plan.json")
  );
  const manifest = validateRemoteModuleManifest(
    await readJsonFromReference(manifestReference)
  );
  const remoteModule = manifest;
  const baseUrl = deriveRemoteBaseUrl({
    baseUrl: options.baseUrl,
    manifestReference,
  });
  const envFile = await updateRemoteModulesEnv({
    baseUrl,
    envFilePath,
    moduleName: remoteModule.name,
  });
  const installPlan = await updateConsolePackageInstallPlan({
    baseUrl,
    installPlanPath,
    manifest,
    manifestReference,
    moduleName: remoteModule.name,
  });
  const consolePackageCount = consolePackageCountFromInstallPlan({
    installPlan: JSON.parse(installPlan) as ConsolePackageInstallPlan,
    moduleName: remoteModule.name,
  });

  if (options.dryRun) {
    console.log("Remote module install dry run:");
    console.log(`- ${path.relative(repoRoot, envFilePath)}`);
    console.log(`- ${path.relative(repoRoot, installPlanPath)}`);
    console.log(`- ${remoteModule.name}=${baseUrl}`);
    console.log(`- console packages: ${consolePackageCount}`);
    return;
  }

  await mkdir(path.dirname(envFilePath), { recursive: true });
  await writeFile(envFilePath, envFile);
  await mkdir(path.dirname(installPlanPath), { recursive: true });
  await writeFile(installPlanPath, installPlan);

  console.log(`Added remote module ${remoteModule.name}.`);
  console.log("Updated:");
  console.log(`- ${path.relative(repoRoot, envFilePath)}`);
  console.log(`- ${path.relative(repoRoot, installPlanPath)}`);
  console.log(`REMOTE_MODULES: ${remoteModule.name}=${baseUrl}`);
  console.log(`Console packages: ${consolePackageCount}`);
  console.log("Next steps:");
  if (consolePackageCount > 0) {
    console.log("- lenso console-package apply-plan");
    console.log("- pnpm install");
    console.log("- restart Runtime Console after applying the plan");
  }
  console.log("- restart the API and worker");
};
