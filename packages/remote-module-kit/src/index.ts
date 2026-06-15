import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

export interface RemoteModuleConsoleSurface {
  name: string;
  label: string;
  area: "runtime" | "operations" | "data" | "configuration" | string;
  route: string;
  package: {
    name: string;
    export: string;
  };
  required_capabilities?: readonly string[];
  icon?: string;
  navigation?: {
    workspace?: {
      id: string;
      label: string;
      icon?: string;
    };
    group?: {
      id: string;
      label: string;
      order?: number;
    } | null;
    order?: number;
  };
}

export interface RemoteModuleManifest {
  name: string;
  version: string;
  source: "remote";
  capabilities: readonly string[];
  http_routes: readonly RemoteHttpRoute[];
  runtime: {
    functions: readonly RemoteRuntimeFunctionDeclaration[];
  };
  lifecycle?: RemoteLifecycleSurface;
  admin: unknown | null;
  console?: readonly RemoteModuleConsoleSurface[];
}

export type RemoteHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RemoteHttpRoute {
  method: RemoteHttpMethod;
  path: string;
  capability?: string;
  display_name?: string;
  story_title?: string;
}

export interface RemoteHttpRouteOptions {
  capability?: string;
  displayName?: string;
  storyTitle?: string;
}

export interface RemoteHttpHandlerContext {
  body: unknown;
  params: Record<string, string>;
  request: IncomingMessage;
  url: URL;
}

export type RemoteHttpHandlerResult =
  | unknown
  | {
      body: unknown;
      statusCode?: number;
    };

export type RemoteHttpHandler = (
  context: RemoteHttpHandlerContext
) => RemoteHttpHandlerResult | Promise<RemoteHttpHandlerResult>;

export interface RemoteRuntimeRetryPolicy {
  max_attempts: number;
  initial_delay_ms: number;
}

export interface RemoteRuntimeFunctionDeclaration {
  name: string;
  version: number;
  queue: string;
  input_schema?: string;
  retry_policy?: RemoteRuntimeRetryPolicy;
}

export interface RemoteRuntimeFunctionOptions {
  version?: number;
  queue?: string;
  inputSchema?: string;
  retryPolicy?: RemoteRuntimeRetryPolicy;
}

export interface RemoteRuntimeInvokeRequest {
  request_id: string;
  function_run_id: string;
  function_name: string;
  attempt: number;
  correlation_id: string;
  causation_id?: string | null;
  actor: unknown;
  trace: unknown;
  input: unknown;
}

export interface RemoteRuntimeHandlerContext {
  input: unknown;
  invocation: RemoteRuntimeInvokeRequest;
  request: IncomingMessage;
}

export type RemoteRuntimeHandler = (
  context: RemoteRuntimeHandlerContext
) => unknown | Promise<unknown>;

export interface RemoteLifecycleStartupCheck {
  name: string;
  required?: boolean;
  kind: "function_registered" | "capability_declared";
  function_name?: string;
  capability?: string;
}

export interface RemoteLifecycleActivationJob {
  name: string;
  function_name: string;
  run_policy?: "every_startup";
  input?: unknown;
  required?: boolean;
}

export interface RemoteLifecycleSurface {
  startup_checks: readonly RemoteLifecycleStartupCheck[];
  activation_jobs: readonly RemoteLifecycleActivationJob[];
}

export interface RemoteLifecycleActivationOptions {
  input?: unknown;
  required?: boolean;
}

export type SchemaFieldType =
  | { kind: "string" }
  | { kind: "integer" }
  | { kind: "boolean" }
  | { kind: "timestamp" }
  | { kind: "json" };

export interface SchemaField {
  name: string;
  label: string;
  field_type: SchemaFieldType;
  nullable: boolean;
}

export interface SchemaEntity {
  name: string;
  label: string;
  fields: readonly SchemaField[];
  read_capability: string;
}

export interface AdminSchema {
  entities: readonly SchemaEntity[];
}

export interface SchemaAdminSurface extends AdminSchema {
  kind: "schema";
}

export type AdminActionDangerLevel = "low" | "medium" | "high";

export interface AdminActionInputField {
  name: string;
  label: string;
  field_type: SchemaFieldType;
  required: boolean;
  description?: string;
}

export interface AdminActionInputSchema {
  fields: readonly AdminActionInputField[];
}

export interface AdminActionConfirmation {
  message: string;
  required_phrase?: string;
}

export interface AdminAction {
  name: string;
  label: string;
  capability: string;
  input_schema?: AdminActionInputSchema;
  confirmation?: AdminActionConfirmation;
  danger_level?: AdminActionDangerLevel;
}

export interface AdminMetricBinding {
  label: string;
  value_path: string;
}

export type AdminDeclarativeComponent =
  | {
      kind: "metric_strip";
      metrics: readonly AdminMetricBinding[];
    }
  | {
      kind: "entity_table";
      entity: string;
    }
  | {
      kind: "entity_detail";
      entity: string;
    };

export interface AdminDeclarativeSection {
  name: string;
  label: string;
  component: AdminDeclarativeComponent;
}

export interface AdminDeclarativePage {
  name: string;
  label: string;
  sections: readonly AdminDeclarativeSection[];
}

export interface AdminDeclarativeSurface {
  kind: "declarative_custom";
  pages: readonly AdminDeclarativePage[];
  actions: readonly AdminAction[];
  fallback_schema?: AdminSchema;
}

export interface RemoteModuleDefinition {
  name: string;
  version?: string;
  capabilities?: readonly string[];
  httpRoutes?: readonly RemoteHttpRoute[];
  runtimeFunctions?: readonly RemoteRuntimeFunctionDeclaration[];
  lifecycle?: RemoteLifecycleSurface;
  admin?: unknown | null;
  console?: readonly RemoteModuleConsoleSurface[];
}

export interface RemoteAdminPage {
  records: readonly unknown[];
  next_cursor?: string | null;
}

export interface RemoteAdminDataSource {
  list: (query: {
    limit: number;
    cursor?: string;
  }) => RemoteAdminPage | Promise<RemoteAdminPage>;
  detail: (
    id: string
  ) => unknown | null | undefined | Promise<unknown | null | undefined>;
}

export interface RemoteAdminActionHandlerContext {
  action: string;
  input: unknown;
  request: IncomingMessage;
}

export type RemoteAdminActionHandler = (
  context: RemoteAdminActionHandlerContext
) => unknown | Promise<unknown>;

export interface ServedRemoteModule {
  baseUrl: string;
  manifestUrl: string;
  server: Server;
  close: () => Promise<void>;
}

export interface ServeRemoteModuleOptions {
  host?: string;
  port?: number;
  basePath?: string;
  data?: Record<string, RemoteAdminDataSource>;
  actions?: Record<string, RemoteAdminActionHandler>;
  http?: Record<string, RemoteHttpHandler>;
  runtime?: Record<string, RemoteRuntimeHandler>;
  onReady?: (server: ServedRemoteModule) => void;
}

const normalizeBasePath = (basePath: string) => {
  const trimmed = basePath.replace(/\/+$/u, "");
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }
  return trimmed || "/lenso/module/v1";
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown
) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
};

const route = (
  method: RemoteHttpMethod,
  path: string,
  options: RemoteHttpRouteOptions = {}
): RemoteHttpRoute => ({
  ...(options.capability ? { capability: options.capability } : {}),
  ...(options.displayName ? { display_name: options.displayName } : {}),
  method,
  path,
  ...(options.storyTitle ? { story_title: options.storyTitle } : {}),
});

const routeKey = (method: RemoteHttpMethod, path: string) =>
  `${method} ${path}`;

const matchRoutePath = (
  pattern: string,
  pathname: string
): Record<string, string> | null => {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (const [index, patternPart] of patternParts.entries()) {
    const pathPart = pathParts[index];
    if (!pathPart) {
      return null;
    }
    if (patternPart.startsWith("{") && patternPart.endsWith("}")) {
      const paramName = patternPart.slice(1, -1);
      if (!paramName) {
        return null;
      }
      params[paramName] = decodeURIComponent(pathPart);
      continue;
    }
    if (patternPart !== pathPart) {
      return null;
    }
  }
  return params;
};

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const normalizeHandlerResult = (
  result: RemoteHttpHandlerResult
): { body: unknown; statusCode: number } => {
  if (
    typeof result === "object" &&
    result !== null &&
    "body" in result &&
    ("statusCode" in result || Object.keys(result).length <= 2)
  ) {
    const response = result as { body: unknown; statusCode?: number };
    return {
      body: response.body,
      statusCode: response.statusCode ?? 200,
    };
  }
  return { body: result ?? null, statusCode: 200 };
};

const handleHttpRouteRequest = async ({
  basePath,
  handlers,
  manifest,
  request,
}: {
  basePath: string;
  handlers: Record<string, RemoteHttpHandler>;
  manifest: RemoteModuleManifest;
  request: IncomingMessage;
}): Promise<{ body: unknown; statusCode: number } | null> => {
  const method = request.method as RemoteHttpMethod | undefined;
  if (!method) {
    return null;
  }
  const url = new URL(request.url ?? "", "http://127.0.0.1");
  if (!url.pathname.startsWith(`${basePath}/`)) {
    return null;
  }
  const modulePath = url.pathname.slice(basePath.length) || "/";
  for (const declaredRoute of manifest.http_routes) {
    if (declaredRoute.method !== method) {
      continue;
    }
    const params = matchRoutePath(declaredRoute.path, modulePath);
    if (!params) {
      continue;
    }
    const handler =
      handlers[routeKey(declaredRoute.method, declaredRoute.path)];
    if (!handler) {
      return {
        body: {
          error: {
            code: "not_found",
            message: `${declaredRoute.method} ${declaredRoute.path} handler not found`,
          },
        },
        statusCode: 404,
      };
    }
    const body = await readBody(request);
    return normalizeHandlerResult(
      await handler({
        body,
        params,
        request,
        url,
      })
    );
  }
  return null;
};

const runtimeFunctionQueue = (name: string) => name.split(".")[0] ?? name;

const handleRuntimeFunctionRequest = async ({
  basePath,
  handlers,
  request,
}: {
  basePath: string;
  handlers: Record<string, RemoteRuntimeHandler>;
  request: IncomingMessage;
}): Promise<{ body: unknown; statusCode: number } | null> => {
  if (request.method !== "POST") {
    return null;
  }
  const url = new URL(request.url ?? "", "http://127.0.0.1");
  const prefix = `${basePath}/runtime/functions/`;
  if (!(url.pathname.startsWith(prefix) && url.pathname.endsWith("/invoke"))) {
    return null;
  }
  const functionName = decodeURIComponent(
    url.pathname.slice(prefix.length, -"/invoke".length)
  );
  if (!functionName || functionName.includes("/")) {
    return {
      body: {
        error: {
          code: "not_found",
          message: "runtime function endpoint not found",
        },
      },
      statusCode: 404,
    };
  }
  const handler = handlers[functionName];
  if (!handler) {
    return {
      body: {
        error: {
          code: "not_found",
          message: `${functionName} runtime function handler not found`,
        },
      },
      statusCode: 404,
    };
  }
  const invocation = (await readBody(request)) as RemoteRuntimeInvokeRequest;
  const output = await handler({
    input: invocation?.input,
    invocation,
    request,
  });
  return {
    body: { output: output ?? null },
    statusCode: 200,
  };
};

const handleAdminActionRequest = async ({
  basePath,
  handlers,
  request,
}: {
  basePath: string;
  handlers: Record<string, RemoteAdminActionHandler>;
  request: IncomingMessage;
}): Promise<{ body: unknown; statusCode: number } | null> => {
  if (request.method !== "POST") {
    return null;
  }
  const url = new URL(request.url ?? "", "http://127.0.0.1");
  const prefix = `${basePath}/admin/actions/`;
  if (!url.pathname.startsWith(prefix)) {
    return null;
  }
  const action = decodeURIComponent(url.pathname.slice(prefix.length));
  if (!action || action.includes("/")) {
    return {
      body: {
        error: {
          code: "not_found",
          message: "admin action endpoint not found",
        },
      },
      statusCode: 404,
    };
  }
  const handler = handlers[action];
  if (!handler) {
    return {
      body: {
        error: {
          code: "not_found",
          message: `${action} admin action handler not found`,
        },
      },
      statusCode: 404,
    };
  }
  const input = await readBody(request);
  const result = await handler({
    action,
    input,
    request,
  });
  return {
    body: { result: result ?? null },
    statusCode: 200,
  };
};

interface FieldOptions {
  label?: string;
  nullable?: boolean;
}

export interface ActionFieldOptions {
  label?: string;
  required?: boolean;
  description?: string;
}

export interface AdminActionOptions {
  label?: string;
  capability: string;
  inputFields?: readonly AdminActionInputField[];
  confirmation?: AdminActionConfirmation;
  dangerLevel?: AdminActionDangerLevel;
}

export interface AdminConfirmationOptions {
  requiredPhrase?: string;
}

export interface AdminDeclarativePageOptions {
  label?: string;
  sections?: readonly AdminDeclarativeSection[];
}

export interface AdminDeclarativeSectionOptions {
  label?: string;
  component: AdminDeclarativeComponent;
}

export interface AdminDeclarativeSurfaceOptions {
  pages?: readonly AdminDeclarativePage[];
  actions?: readonly AdminAction[];
  fallbackSchema?: AdminSchema;
}

const titleCase = (value: string) =>
  value
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const field = (
  name: string,
  fieldType: SchemaFieldType,
  options: FieldOptions
): SchemaField => ({
  field_type: fieldType,
  label: options.label ?? titleCase(name),
  name,
  nullable: options.nullable ?? false,
});

const actionField = (
  name: string,
  fieldType: SchemaFieldType,
  options: ActionFieldOptions
): AdminActionInputField => ({
  ...(options.description ? { description: options.description } : {}),
  field_type: fieldType,
  label: options.label ?? titleCase(name),
  name,
  required: options.required ?? false,
});

const handleAdminDataRequest = async ({
  basePath,
  data,
  requestUrl,
}: {
  basePath: string;
  data: Record<string, RemoteAdminDataSource>;
  requestUrl: string;
}): Promise<{ body: unknown; statusCode: number } | null> => {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const prefix = `${basePath}/admin/`;
  if (!url.pathname.startsWith(prefix)) {
    return null;
  }
  const parts = url.pathname.slice(prefix.length).split("/").filter(Boolean);
  const [entity, id] = parts;
  if (!entity || parts.length > 2) {
    return {
      body: {
        error: { code: "not_found", message: "admin endpoint not found" },
      },
      statusCode: 404,
    };
  }
  const source = data[entity];
  if (!source) {
    return {
      body: {
        error: { code: "not_found", message: `${entity} admin data not found` },
      },
      statusCode: 404,
    };
  }
  if (id) {
    const record = await source.detail(decodeURIComponent(id));
    return {
      body: { record: record ?? null },
      statusCode: record ? 200 : 404,
    };
  }
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const page = await source.list({
    limit: Number.isFinite(limit) ? limit : 50,
    ...(cursor ? { cursor } : {}),
  });
  return {
    body: page,
    statusCode: 200,
  };
};

export const defineRemoteModule = (
  definition: RemoteModuleDefinition
): RemoteModuleManifest => {
  if (!definition.name.trim()) {
    throw new Error("Remote module name is required");
  }
  return {
    admin: definition.admin ?? null,
    capabilities: definition.capabilities ?? [],
    console: definition.console ?? [],
    http_routes: definition.httpRoutes ?? [],
    ...(definition.lifecycle ? { lifecycle: definition.lifecycle } : {}),
    name: definition.name,
    runtime: {
      functions: definition.runtimeFunctions ?? [],
    },
    source: "remote",
    version: definition.version ?? "0.1.0",
  };
};

export const getRoute = (path: string, options: RemoteHttpRouteOptions = {}) =>
  route("GET", path, options);

export const postRoute = (path: string, options: RemoteHttpRouteOptions = {}) =>
  route("POST", path, options);

export const putRoute = (path: string, options: RemoteHttpRouteOptions = {}) =>
  route("PUT", path, options);

export const patchRoute = (
  path: string,
  options: RemoteHttpRouteOptions = {}
) => route("PATCH", path, options);

export const deleteRoute = (
  path: string,
  options: RemoteHttpRouteOptions = {}
) => route("DELETE", path, options);

export const runtimeFunction = (
  name: string,
  options: RemoteRuntimeFunctionOptions = {}
): RemoteRuntimeFunctionDeclaration => ({
  ...(options.inputSchema ? { input_schema: options.inputSchema } : {}),
  queue: options.queue ?? runtimeFunctionQueue(name),
  ...(options.retryPolicy ? { retry_policy: options.retryPolicy } : {}),
  name,
  version: options.version ?? 1,
});

export const everyStartup = (
  name: string,
  functionName: string,
  options: RemoteLifecycleActivationOptions = {}
): RemoteLifecycleActivationJob => ({
  function_name: functionName,
  input: options.input ?? {},
  name,
  required: options.required ?? true,
  run_policy: "every_startup",
});

export const lifecycle = ({
  activationJobs,
  startupChecks,
}: {
  startupChecks?: readonly RemoteLifecycleStartupCheck[];
  activationJobs?: readonly RemoteLifecycleActivationJob[];
}): RemoteLifecycleSurface => ({
  activation_jobs: activationJobs ?? [],
  startup_checks: startupChecks ?? [],
});

export const textField = (name: string, options: FieldOptions = {}) =>
  field(name, { kind: "string" }, options);

export const integerField = (name: string, options: FieldOptions = {}) =>
  field(name, { kind: "integer" }, options);

export const booleanField = (name: string, options: FieldOptions = {}) =>
  field(name, { kind: "boolean" }, options);

export const timestampField = (name: string, options: FieldOptions = {}) =>
  field(name, { kind: "timestamp" }, options);

export const jsonField = (name: string, options: FieldOptions = {}) =>
  field(name, { kind: "json" }, options);

export const actionTextField = (
  name: string,
  options: ActionFieldOptions = {}
) => actionField(name, { kind: "string" }, options);

export const actionIntegerField = (
  name: string,
  options: ActionFieldOptions = {}
) => actionField(name, { kind: "integer" }, options);

export const actionBooleanField = (
  name: string,
  options: ActionFieldOptions = {}
) => actionField(name, { kind: "boolean" }, options);

export const actionTimestampField = (
  name: string,
  options: ActionFieldOptions = {}
) => actionField(name, { kind: "timestamp" }, options);

export const actionJsonField = (
  name: string,
  options: ActionFieldOptions = {}
) => actionField(name, { kind: "json" }, options);

export const actionConfirmation = (
  message: string,
  options: AdminConfirmationOptions = {}
): AdminActionConfirmation => ({
  message,
  ...(options.requiredPhrase
    ? { required_phrase: options.requiredPhrase }
    : {}),
});

export const adminAction = (
  name: string,
  options: AdminActionOptions
): AdminAction => ({
  capability: options.capability,
  ...(options.confirmation ? { confirmation: options.confirmation } : {}),
  ...(options.dangerLevel && options.dangerLevel !== "low"
    ? { danger_level: options.dangerLevel }
    : {}),
  ...(options.inputFields?.length
    ? { input_schema: { fields: options.inputFields } }
    : {}),
  label: options.label ?? titleCase(name),
  name,
});

export const metricBinding = (
  label: string,
  valuePath: string
): AdminMetricBinding => ({
  label,
  value_path: valuePath,
});

export const metricStrip = (
  metrics: readonly AdminMetricBinding[]
): AdminDeclarativeComponent => ({
  kind: "metric_strip",
  metrics,
});

export const entityTable = (entity: string): AdminDeclarativeComponent => ({
  entity,
  kind: "entity_table",
});

export const entityDetail = (entity: string): AdminDeclarativeComponent => ({
  entity,
  kind: "entity_detail",
});

export const declarativeSection = (
  name: string,
  options: AdminDeclarativeSectionOptions
): AdminDeclarativeSection => ({
  component: options.component,
  label: options.label ?? titleCase(name),
  name,
});

export const declarativePage = (
  name: string,
  options: AdminDeclarativePageOptions = {}
): AdminDeclarativePage => ({
  label: options.label ?? titleCase(name),
  name,
  sections: options.sections ?? [],
});

export const defineSchemaEntity = ({
  fields,
  label,
  name,
  readCapability,
}: {
  name: string;
  label: string;
  fields: readonly SchemaField[];
  readCapability: string;
}): SchemaEntity => ({
  fields,
  label,
  name,
  read_capability: readCapability,
});

export const adminSchema = (
  entities: readonly SchemaEntity[]
): AdminSchema => ({
  entities,
});

export const schemaAdmin = (
  entities: readonly SchemaEntity[]
): SchemaAdminSurface => ({
  ...adminSchema(entities),
  kind: "schema",
});

export const declarativeCustom = (
  options: AdminDeclarativeSurfaceOptions = {}
): AdminDeclarativeSurface => ({
  actions: options.actions ?? [],
  ...(options.fallbackSchema
    ? { fallback_schema: options.fallbackSchema }
    : {}),
  kind: "declarative_custom",
  pages: options.pages ?? [],
});

export const serveRemoteModule = async (
  manifest: RemoteModuleManifest,
  options: ServeRemoteModuleOptions = {}
): Promise<ServedRemoteModule> => {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4100;
  const basePath = normalizeBasePath(options.basePath ?? "/lenso/module/v1");
  const manifestPath = `${basePath}/manifest`;

  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === manifestPath) {
      sendJson(response, 200, manifest);
      return;
    }
    if (request.method === "GET") {
      const adminResult = await handleAdminDataRequest({
        basePath,
        data: options.data ?? {},
        requestUrl: request.url ?? "",
      });
      if (adminResult) {
        sendJson(response, adminResult.statusCode, adminResult.body);
        return;
      }
    }
    const actionResult = await handleAdminActionRequest({
      basePath,
      handlers: options.actions ?? {},
      request,
    });
    if (actionResult) {
      sendJson(response, actionResult.statusCode, actionResult.body);
      return;
    }
    const runtimeResult = await handleRuntimeFunctionRequest({
      basePath,
      handlers: options.runtime ?? {},
      request,
    });
    if (runtimeResult) {
      sendJson(response, runtimeResult.statusCode, runtimeResult.body);
      return;
    }
    const httpResult = await handleHttpRouteRequest({
      basePath,
      handlers: options.http ?? {},
      manifest,
      request,
    });
    if (httpResult) {
      sendJson(response, httpResult.statusCode, httpResult.body);
      return;
    }

    sendJson(response, 404, {
      error: {
        code: "not_found",
        message: `${manifest.name} remote module endpoint not found`,
      },
    });
  });

  server.listen(port, host);
  await once(server, "listening");

  const address = server.address();
  const boundPort =
    typeof address === "object" && address ? address.port : port;
  const baseUrl = `http://${host}:${boundPort}${basePath}`;
  const served = {
    baseUrl,
    close: async () => {
      server.close();
      await once(server, "close");
    },
    manifestUrl: `${baseUrl}/manifest`,
    server,
  } satisfies ServedRemoteModule;

  options.onReady?.(served);
  return served;
};
