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
