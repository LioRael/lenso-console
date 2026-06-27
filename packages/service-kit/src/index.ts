export * from "@lenso/remote-module-kit";

export type ServiceContract = {
  name: string;
  version?: string;
  provider?: ServiceProviderMetadata;
  compatibility?: ServiceCompatibility;
  config?: ServiceConfigField[];
  env?: ServiceEnvField[];
  health?: ServiceHealth;
  localProcess?: ServiceLocalProcess;
  modules: ServiceModuleContract[];
};

export type ServiceProviderMetadata = {
  name: string;
  vendor?: string;
  summary?: string;
  homepage?: string;
};

export type ServiceCompatibility = {
  remoteProtocolVersion?: string;
  requiredHostFeatures?: string[];
  sdkLanguage?: "ts" | "rust" | string;
  sdkVersion?: string;
};

export type ServiceConfigField = {
  key: string;
  required?: boolean;
  defaultValue?: unknown;
  secret?: boolean;
};

export type ServiceEnvField = {
  name: string;
  required?: boolean;
  example?: string;
};

export type ServiceHealth = {
  manifestUrl?: string;
  readyUrl?: string;
  livenessUrl?: string;
  statusUrl?: string;
};

export type ServiceLocalProcess = {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  autoStart?: boolean;
  readyTimeoutMs?: number;
};

export type ServiceModuleContract = {
  name: string;
  version?: string;
  capabilities?: string[];
  dependencies?: string[];
};

export type ServiceContractIssue = {
  path: string;
  message: string;
};

export const serviceContractSchema = {
  $id: "https://contracts.lenso.local/services/lenso-service.v1.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "LensoServiceContract",
  type: "object",
  required: ["name", "modules"],
  additionalProperties: true,
  properties: {
    name: { type: "string", minLength: 1 },
    version: { type: "string", minLength: 1 },
    provider: { type: "object" },
    compatibility: { type: "object" },
    config: { type: "array" },
    env: { type: "array" },
    health: { type: "object" },
    localProcess: { type: "object" },
    modules: { type: "array", minItems: 1 },
  },
} as const;

export function defineServiceContract(
  contract: ServiceContract
): ServiceContract {
  return {
    ...contract,
    config: contract.config ?? [],
    env: contract.env ?? [],
    modules: contract.modules,
  };
}

export function serviceEnv(
  name: string,
  options: Omit<ServiceEnvField, "name"> = {}
): ServiceEnvField {
  return { name, ...options };
}

export function serviceHealth(health: ServiceHealth): ServiceHealth {
  return health;
}

export function validateServiceContract(value: unknown): ServiceContractIssue[] {
  const root = asRecord(value);
  if (!root) {
    return [{ path: "$", message: "service contract must be an object" }];
  }

  const issues: ServiceContractIssue[] = [];
  requireNonEmptyString(root.name, "$.name", issues);
  if ("version" in root) {
    requireNonEmptyString(root.version, "$.version", issues);
  }
  validateProvider(root.provider, issues);
  validateNamedFieldsArray(root.config, "$.config", "key", issues);
  validateNamedFieldsArray(root.env, "$.env", "name", issues);
  validateStringArray(
    root.requiredEnv ?? root.required_env,
    "$.requiredEnv",
    issues
  );
  validateCompatibility(root.compatibility, issues);
  validateLocalProcess(
    root.localProcess ?? root.local_process,
    "$.localProcess",
    issues
  );
  validateInstall(root.install, issues);
  validateModules(root.modules, issues);
  return issues;
}

export function assertServiceContract(
  value: unknown
): asserts value is ServiceContract {
  const issues = validateServiceContract(value);
  if (issues.length > 0) {
    throw new Error(
      `Invalid Lenso service contract: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`
    );
  }
}

function validateProvider(
  value: unknown,
  issues: ServiceContractIssue[]
): void {
  if (value === undefined) {
    return;
  }
  const provider = asRecord(value);
  if (!provider) {
    issues.push({ path: "$.provider", message: "provider must be an object" });
    return;
  }
  requireNonEmptyString(provider.name, "$.provider.name", issues);
}

function validateCompatibility(
  value: unknown,
  issues: ServiceContractIssue[]
): void {
  if (value === undefined) {
    return;
  }
  const compatibility = asRecord(value);
  if (!compatibility) {
    issues.push({
      path: "$.compatibility",
      message: "compatibility must be an object",
    });
    return;
  }
  validateStringArray(
    compatibility.requiredHostFeatures ??
      compatibility.required_host_features,
    "$.compatibility.requiredHostFeatures",
    issues
  );
}

function validateNamedFieldsArray(
  value: unknown,
  path: string,
  nameField: string,
  issues: ServiceContractIssue[]
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "field must be an array" });
    return;
  }
  for (const [index, item] of value.entries()) {
    const entry = asRecord(item);
    if (!entry) {
      issues.push({
        path: `${path}[${index}]`,
        message: "entry must be an object",
      });
      continue;
    }
    requireNonEmptyString(
      entry[nameField],
      `${path}[${index}].${nameField}`,
      issues
    );
  }
}

function validateLocalProcess(
  value: unknown,
  path: string,
  issues: ServiceContractIssue[]
): void {
  if (value === undefined) {
    return;
  }
  const localProcess = asRecord(value);
  if (!localProcess) {
    issues.push({ path, message: "localProcess must be an object" });
    return;
  }
  requireNonEmptyString(localProcess.command, `${path}.command`, issues);
}

function validateInstall(
  value: unknown,
  issues: ServiceContractIssue[]
): void {
  if (value === undefined) {
    return;
  }
  const install = asRecord(value);
  if (!install) {
    issues.push({ path: "$.install", message: "install must be an object" });
    return;
  }
  if (install.services === undefined) {
    return;
  }
  if (!Array.isArray(install.services)) {
    issues.push({
      path: "$.install.services",
      message: "install services must be an array",
    });
    return;
  }
  for (const [index, service] of install.services.entries()) {
    const entry = asRecord(service);
    if (!entry) {
      issues.push({
        path: `$.install.services[${index}]`,
        message: "service must be an object",
      });
      continue;
    }
    requireNonEmptyString(
      entry.name,
      `$.install.services[${index}].name`,
      issues
    );
    requireNonEmptyString(
      entry.command,
      `$.install.services[${index}].command`,
      issues
    );
  }
}

function validateModules(
  value: unknown,
  issues: ServiceContractIssue[]
): void {
  if (!Array.isArray(value)) {
    issues.push({ path: "$.modules", message: "modules must be an array" });
    return;
  }
  if (value.length === 0) {
    issues.push({ path: "$.modules", message: "modules must not be empty" });
    return;
  }

  const names = new Set<string>();
  for (const [index, module] of value.entries()) {
    const entry = asRecord(module);
    if (!entry) {
      issues.push({
        path: `$.modules[${index}]`,
        message: "module must be an object",
      });
      continue;
    }
    const moduleName = requireNonEmptyString(
      entry.name,
      `$.modules[${index}].name`,
      issues
    );
    if (moduleName) {
      if (names.has(moduleName)) {
        issues.push({
          path: `$.modules[${index}].name`,
          message: `module \`${moduleName}\` is declared more than once`,
        });
      }
      names.add(moduleName);
    }
    validateStringArray(
      entry.capabilities,
      `$.modules[${index}].capabilities`,
      issues
    );
    validateStringArray(
      entry.dependencies,
      `$.modules[${index}].dependencies`,
      issues
    );
  }
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: ServiceContractIssue[]
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "field must be an array" });
    return;
  }
  for (const [index, item] of value.entries()) {
    requireNonEmptyString(item, `${path}[${index}]`, issues);
  }
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  issues: ServiceContractIssue[]
): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  issues.push({ path, message: "field must be a non-empty string" });
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
