/* eslint-disable func-style, no-use-before-define, sort-keys */
export * from "@lenso/remote-module-kit";

export interface ServiceContract {
  name: string;
  version?: string;
  provider?: ServiceProviderMetadata;
  compatibility?: ServiceCompatibility;
  config?: ServiceConfigField[];
  env?: ServiceEnvField[];
  health?: ServiceHealth;
  localProcess?: ServiceLocalProcess;
  modules: ServiceModuleContract[];
}

export interface ServiceProviderMetadata {
  name: string;
  vendor?: string;
  summary?: string;
  homepage?: string;
}

export interface ServiceCompatibility {
  remoteProtocolVersion?: string;
  requiredHostFeatures?: string[];
  sdkLanguage?: "ts" | "rust" | string;
  sdkVersion?: string;
}

export interface ServiceConfigField {
  key: string;
  required?: boolean;
  defaultValue?: unknown;
  secret?: boolean;
}

export interface ServiceEnvField {
  name: string;
  required?: boolean;
  example?: string;
}

export interface ServiceHealth {
  manifestUrl?: string;
  readyUrl?: string;
  livenessUrl?: string;
  statusUrl?: string;
}

export interface ServiceLocalProcess {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  autoStart?: boolean;
  readyTimeoutMs?: number;
}

export interface ServiceModuleContract {
  name: string;
  version?: string;
  capabilities?: string[];
  dependencies?: string[];
}

export interface ServiceContractIssue {
  path: string;
  message: string;
}

export const servicePackageProtocol = "lenso.service-package.v1" as const;
export const moduleReleaseProtocol = "lenso.module-release.v1" as const;

export interface ServicePackage {
  protocol: typeof servicePackageProtocol;
  name: string;
  version: string;
  serviceManifest: string;
  modules: string[];
}

export interface ModuleReleaseProvider {
  name: string;
  servicePackage?: string;
  serviceManifest?: string;
}

export interface ModuleRelease {
  protocol: typeof moduleReleaseProtocol;
  name: string;
  version: string;
  source: "service";
  provider: ModuleReleaseProvider;
  summary?: string;
  capabilities?: string[];
  dependencies?: string[];
}

export const serviceContractSchema = {
  $id: "https://contracts.lenso.local/services/lenso-service.v1.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: true,
  properties: {
    compatibility: { type: "object" },
    config: { type: "array" },
    env: { type: "array" },
    health: { type: "object" },
    localProcess: { type: "object" },
    modules: { minItems: 1, type: "array" },
    name: { minLength: 1, type: "string" },
    provider: { type: "object" },
    version: { minLength: 1, type: "string" },
  },
  required: ["name", "modules"],
  title: "LensoServiceContract",
  type: "object",
} as const;

export const servicePackageSchema = {
  $id: "https://contracts.lenso.local/services/lenso-service-package.v1.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: true,
  properties: {
    modules: {
      items: { minLength: 1, type: "string" },
      minItems: 1,
      type: "array",
    },
    name: { minLength: 1, type: "string" },
    protocol: { const: servicePackageProtocol, type: "string" },
    serviceManifest: { minLength: 1, type: "string" },
    version: { minLength: 1, type: "string" },
  },
  required: ["protocol", "name", "version", "serviceManifest", "modules"],
  title: "LensoServicePackage",
  type: "object",
} as const;

export const moduleReleaseSchema = {
  $id: "https://contracts.lenso.local/modules/lenso-module-release.v1.schema.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: true,
  properties: {
    capabilities: { items: { minLength: 1, type: "string" }, type: "array" },
    dependencies: { items: { minLength: 1, type: "string" }, type: "array" },
    name: { minLength: 1, type: "string" },
    protocol: { const: moduleReleaseProtocol, type: "string" },
    provider: {
      additionalProperties: true,
      anyOf: [
        { required: ["servicePackage"] },
        { required: ["serviceManifest"] },
      ],
      properties: {
        name: { minLength: 1, type: "string" },
        serviceManifest: { minLength: 1, type: "string" },
        servicePackage: { minLength: 1, type: "string" },
      },
      required: ["name"],
      type: "object",
    },
    source: { const: "service", type: "string" },
    summary: { type: "string" },
    version: { minLength: 1, type: "string" },
  },
  required: ["protocol", "name", "version", "source", "provider"],
  title: "LensoModuleRelease",
  type: "object",
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

export function defineServicePackage(
  servicePackage: Omit<ServicePackage, "protocol" | "serviceManifest"> & {
    serviceManifest?: string;
  }
): ServicePackage {
  return {
    ...servicePackage,
    protocol: servicePackageProtocol,
    serviceManifest: servicePackage.serviceManifest ?? "lenso.service.json",
  };
}

export function defineModuleRelease(
  release: Omit<ModuleRelease, "protocol" | "source" | "provider"> & {
    provider: ModuleReleaseProvider;
  }
): ModuleRelease {
  const provider =
    release.provider.servicePackage || release.provider.serviceManifest
      ? release.provider
      : { ...release.provider, servicePackage: "lenso.service-package.json" };
  return {
    ...release,
    protocol: moduleReleaseProtocol,
    source: "service",
    provider,
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

export function validateServiceContract(
  value: unknown
): ServiceContractIssue[] {
  const root = asRecord(value);
  if (!root) {
    return [{ message: "service contract must be an object", path: "$" }];
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

export function validateServicePackage(value: unknown): ServiceContractIssue[] {
  const root = asRecord(value);
  if (!root) {
    return [{ message: "service package must be an object", path: "$" }];
  }

  const issues: ServiceContractIssue[] = [];
  if (root.protocol !== servicePackageProtocol) {
    issues.push({
      message: `protocol must be \`${servicePackageProtocol}\``,
      path: "$.protocol",
    });
  }
  requireNonEmptyString(root.name, "$.name", issues);
  requireNonEmptyString(root.version, "$.version", issues);
  requireNonEmptyString(
    root.serviceManifest ?? root.service_manifest,
    "$.serviceManifest",
    issues
  );
  validateServicePackageModules(root.modules, issues);
  return issues;
}

export function assertServicePackage(
  value: unknown
): asserts value is ServicePackage {
  const issues = validateServicePackage(value);
  if (issues.length > 0) {
    throw new Error(
      `Invalid Lenso service package: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`
    );
  }
}

export function validateModuleRelease(value: unknown): ServiceContractIssue[] {
  const root = asRecord(value);
  if (!root) {
    return [{ message: "module release must be an object", path: "$" }];
  }

  const issues: ServiceContractIssue[] = [];
  if (root.protocol !== moduleReleaseProtocol) {
    issues.push({
      message: `protocol must be \`${moduleReleaseProtocol}\``,
      path: "$.protocol",
    });
  }
  requireNonEmptyString(root.name, "$.name", issues);
  requireNonEmptyString(root.version, "$.version", issues);
  if (root.source !== "service") {
    issues.push({ message: "source must be `service`", path: "$.source" });
  }
  validateModuleReleaseProvider(root.provider, issues);
  validateStringArray(root.capabilities, "$.capabilities", issues);
  validateStringArray(root.dependencies, "$.dependencies", issues);
  return issues;
}

export function assertModuleRelease(
  value: unknown
): asserts value is ModuleRelease {
  const issues = validateModuleRelease(value);
  if (issues.length > 0) {
    throw new Error(
      `Invalid Lenso module release: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`
    );
  }
}

function validateModuleReleaseProvider(
  value: unknown,
  issues: ServiceContractIssue[]
): void {
  const provider = asRecord(value);
  if (!provider) {
    issues.push({ message: "provider must be an object", path: "$.provider" });
    return;
  }
  requireNonEmptyString(provider.name, "$.provider.name", issues);
  if (
    !requireOneNonEmptyString(
      [
        provider.servicePackage,
        provider.service_package,
        provider.serviceManifest,
        provider.service_manifest,
      ],
      "$.provider.servicePackage",
      issues
    )
  ) {
    return;
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
    issues.push({ message: "provider must be an object", path: "$.provider" });
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
      message: "compatibility must be an object",
      path: "$.compatibility",
    });
    return;
  }
  validateStringArray(
    compatibility.requiredHostFeatures ?? compatibility.required_host_features,
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
    issues.push({ message: "field must be an array", path });
    return;
  }
  for (const [index, item] of value.entries()) {
    const entry = asRecord(item);
    if (!entry) {
      issues.push({
        message: "entry must be an object",
        path: `${path}[${index}]`,
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
    issues.push({ message: "localProcess must be an object", path });
    return;
  }
  requireNonEmptyString(localProcess.command, `${path}.command`, issues);
}

function validateInstall(value: unknown, issues: ServiceContractIssue[]): void {
  if (value === undefined) {
    return;
  }
  const install = asRecord(value);
  if (!install) {
    issues.push({ message: "install must be an object", path: "$.install" });
    return;
  }
  if (install.services === undefined) {
    return;
  }
  if (!Array.isArray(install.services)) {
    issues.push({
      message: "install services must be an array",
      path: "$.install.services",
    });
    return;
  }
  for (const [index, service] of install.services.entries()) {
    const entry = asRecord(service);
    if (!entry) {
      issues.push({
        message: "service must be an object",
        path: `$.install.services[${index}]`,
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

function validateModules(value: unknown, issues: ServiceContractIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ message: "modules must be an array", path: "$.modules" });
    return;
  }
  if (value.length === 0) {
    issues.push({ message: "modules must not be empty", path: "$.modules" });
    return;
  }

  const names = new Set<string>();
  for (const [index, module] of value.entries()) {
    const entry = asRecord(module);
    if (!entry) {
      issues.push({
        message: "module must be an object",
        path: `$.modules[${index}]`,
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
          message: `module \`${moduleName}\` is declared more than once`,
          path: `$.modules[${index}].name`,
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

function validateServicePackageModules(
  value: unknown,
  issues: ServiceContractIssue[]
): void {
  if (!Array.isArray(value)) {
    issues.push({ message: "modules must be an array", path: "$.modules" });
    return;
  }
  if (value.length === 0) {
    issues.push({ message: "modules must not be empty", path: "$.modules" });
    return;
  }
  const names = new Set<string>();
  for (const [index, moduleNameValue] of value.entries()) {
    const moduleName = requireNonEmptyString(
      moduleNameValue,
      `$.modules[${index}]`,
      issues
    );
    if (moduleName) {
      if (names.has(moduleName)) {
        issues.push({
          message: `module \`${moduleName}\` is declared more than once`,
          path: `$.modules[${index}]`,
        });
      }
      names.add(moduleName);
    }
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
    issues.push({ message: "field must be an array", path });
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
  issues.push({ message: "field must be a non-empty string", path });
  return undefined;
}

function requireOneNonEmptyString(
  values: unknown[],
  path: string,
  issues: ServiceContractIssue[]
): boolean {
  if (values.some((value) => typeof value === "string" && value.trim())) {
    return true;
  }
  issues.push({ message: "field must be a non-empty string", path });
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
