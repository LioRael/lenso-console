/* eslint-disable func-style, no-use-before-define */

export interface SystemPlaneCredentialRequest {
  audience: string;
  contractId: string;
  featureId: string;
  endpoint: string;
  deadlineUnixMs: number;
}

export interface SystemPlaneCredentialProvider {
  issue(request: SystemPlaneCredentialRequest): Promise<string>;
}

export type SystemPlaneClientErrorKind =
  | "configuration"
  | "credential"
  | "deadline"
  | "transport"
  | "http"
  | "contract";

export class SystemPlaneClientError extends Error {
  readonly kind: SystemPlaneClientErrorKind;
  readonly status: number | undefined;
  readonly serviceCode: string | undefined;

  constructor(
    kind: SystemPlaneClientErrorKind,
    message: string,
    options: { cause?: unknown; status?: number; serviceCode?: string } = {}
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "SystemPlaneClientError";
    this.kind = kind;
    this.status = options.status;
    this.serviceCode = options.serviceCode;
  }
}

export interface SystemPlaneGetRequest {
  baseUrl: string;
  servicePrincipal: string;
  contractId: string;
  featureId: string;
  path: string;
  deadlineUnixMs: number;
}

export class SystemPlaneJsonTransport {
  readonly #credentials: SystemPlaneCredentialProvider;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;

  constructor(options: {
    credentials: SystemPlaneCredentialProvider;
    fetch?: typeof fetch;
    now?: () => number;
  }) {
    this.#credentials = options.credentials;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
  }

  async get(request: SystemPlaneGetRequest): Promise<unknown> {
    if (!Number.isFinite(request.deadlineUnixMs)) {
      throw new SystemPlaneClientError(
        "configuration",
        "System Plane request deadline must be finite"
      );
    }
    if (request.servicePrincipal.length === 0) {
      throw new SystemPlaneClientError(
        "configuration",
        "Managed Service Principal must not be empty"
      );
    }
    const remainingMs = request.deadlineUnixMs - this.#now();
    if (remainingMs <= 0) {
      throw new SystemPlaneClientError(
        "deadline",
        "System Plane request deadline has already elapsed"
      );
    }
    const endpoint = resolveEndpoint(request.baseUrl, request.path);
    let token: string;
    try {
      token = await this.#credentials.issue({
        audience: request.servicePrincipal,
        contractId: request.contractId,
        deadlineUnixMs: request.deadlineUnixMs,
        endpoint: endpoint.toString(),
        featureId: request.featureId,
      });
    } catch (error) {
      throw new SystemPlaneClientError(
        "credential",
        "Could not issue an audience-bound System Plane credential",
        { cause: error }
      );
    }
    if (token.length === 0) {
      throw new SystemPlaneClientError(
        "credential",
        "Credential provider returned an empty System Plane credential"
      );
    }
    const transportRemainingMs = request.deadlineUnixMs - this.#now();
    if (transportRemainingMs <= 0) {
      throw new SystemPlaneClientError(
        "deadline",
        "System Plane request deadline elapsed while issuing credentials"
      );
    }
    let response: Response;
    try {
      response = await this.#fetch(endpoint, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
        },
        method: "GET",
        signal: AbortSignal.timeout(
          Math.min(Math.ceil(transportRemainingMs), 2_147_483_647)
        ),
      });
    } catch (error) {
      const deadlineReached = this.#now() >= request.deadlineUnixMs;
      throw new SystemPlaneClientError(
        deadlineReached ? "deadline" : "transport",
        deadlineReached
          ? "System Plane request exceeded its absolute deadline"
          : "System Plane transport failed before a response was received",
        { cause: error }
      );
    }
    if (!response.ok) {
      const problem = await readProblem(response);
      throw new SystemPlaneClientError(
        "http",
        problem.message ??
          `Managed Service rejected the request with ${response.status}`,
        {
          status: response.status,
          ...(problem.code === undefined ? {} : { serviceCode: problem.code }),
        }
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw new SystemPlaneClientError(
        "contract",
        "Managed Service returned a non-JSON System Plane response",
        { cause: error }
      );
    }
  }
}

function resolveEndpoint(baseUrl: string, path: string): URL {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch (error) {
    throw new SystemPlaneClientError(
      "configuration",
      "Managed Service base URL is invalid",
      { cause: error }
    );
  }
  if (base.protocol !== "https:" && !isLoopback(base)) {
    throw new SystemPlaneClientError(
      "configuration",
      "System Plane requires HTTPS outside loopback development"
    );
  }
  const endpoint = new URL(path, base);
  if (endpoint.origin !== base.origin) {
    throw new SystemPlaneClientError(
      "configuration",
      "System Plane endpoint must remain on the managed Service origin"
    );
  }
  return endpoint;
}

function isLoopback(url: URL): boolean {
  return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}

async function readProblem(
  response: Response
): Promise<{ code?: string; message?: string }> {
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    const record = value as Record<string, unknown>;
    return {
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      ...(typeof record.message === "string"
        ? { message: record.message }
        : typeof record.detail === "string"
          ? { message: record.detail }
          : {}),
    };
  } catch {
    return {};
  }
}
