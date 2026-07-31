/* eslint-disable func-style, no-use-before-define, promise/avoid-new, promise/prefer-await-to-then */

export const consoleBridgeProtocol = "lenso.console-bridge.v1" as const;

export interface ConsoleBridgeConnectOptions {
  moduleId: string;
  surface: string;
  timeoutMs?: number;
}

export interface ConsoleBridgeClient {
  protocol: typeof consoleBridgeProtocol;
  grantedPermissions: readonly string[];
  request<T>(permission: string, payload: unknown): Promise<T>;
}

export interface ConsoleBridgeGrant {
  moduleId: string;
  moduleReleaseDigest: string;
  uiArtifactDigest: string;
  grantedPermissions: readonly string[];
  expiresAt: string;
}

export interface ConsoleBridgeHostOptions {
  frame: HTMLIFrameElement;
  grant: ConsoleBridgeGrant;
  surface: string;
  invoke(permission: string, payload: unknown): Promise<unknown>;
}

interface BridgeReady {
  protocol: typeof consoleBridgeProtocol;
  type: "ready";
  moduleId: string;
  surface: string;
  nonce: string;
}

interface BridgeInit {
  protocol: typeof consoleBridgeProtocol;
  type: "init";
  moduleId: string;
  surface: string;
  nonce: string;
  handle: string;
  grantedPermissions: string[];
  expiresAt: string;
}

interface BridgeRequest {
  protocol: typeof consoleBridgeProtocol;
  type: "request";
  requestId: string;
  handle: string;
  permission: string;
  payload: unknown;
}

interface BridgeResponse {
  protocol: typeof consoleBridgeProtocol;
  type: "response";
  requestId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

export async function connectConsoleBridge(
  options: ConsoleBridgeConnectOptions
): Promise<ConsoleBridgeClient> {
  if (window.parent === window) {
    throw new Error("Console Bridge requires an isolated frame");
  }
  const nonce = randomId();
  const init = await new Promise<BridgeInit>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Console Bridge handshake timed out"));
    }, options.timeoutMs ?? 5000);
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !isInit(event.data)) {
        return;
      }
      if (
        event.data.nonce !== nonce ||
        event.data.moduleId !== options.moduleId ||
        event.data.surface !== options.surface ||
        Date.parse(event.data.expiresAt) <= Date.now()
      ) {
        return;
      }
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(event.data);
    };
    window.addEventListener("message", onMessage);
    const ready: BridgeReady = {
      moduleId: options.moduleId,
      nonce,
      protocol: consoleBridgeProtocol,
      surface: options.surface,
      type: "ready",
    };
    window.parent.postMessage(ready, "*");
  });

  return {
    grantedPermissions: Object.freeze([...init.grantedPermissions]),
    protocol: consoleBridgeProtocol,
    request: (permission, payload) =>
      requestFromParent(init, permission, payload),
  };
}

export function installConsoleBridgeHost(
  options: ConsoleBridgeHostOptions
): () => void {
  const handle = randomId();
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== options.frame.contentWindow) {
      return;
    }
    if (isReady(event.data)) {
      if (
        event.data.moduleId !== options.grant.moduleId ||
        event.data.surface !== options.surface
      ) {
        return;
      }
      const init: BridgeInit = {
        expiresAt: options.grant.expiresAt,
        grantedPermissions: [...options.grant.grantedPermissions],
        handle,
        moduleId: event.data.moduleId,
        nonce: event.data.nonce,
        protocol: consoleBridgeProtocol,
        surface: event.data.surface,
        type: "init",
      };
      options.frame.contentWindow?.postMessage(init, "*");
      return;
    }
    if (!isRequest(event.data) || event.data.handle !== handle) {
      return;
    }
    const request = event.data;
    if (
      Date.parse(options.grant.expiresAt) <= Date.now() ||
      !options.grant.grantedPermissions.includes(request.permission)
    ) {
      postResponse(
        options.frame,
        request.requestId,
        false,
        undefined,
        "permission_denied"
      );
      return;
    }
    void options
      .invoke(request.permission, request.payload)
      .then((payload) =>
        postResponse(options.frame, request.requestId, true, payload)
      )
      .catch(() =>
        postResponse(
          options.frame,
          request.requestId,
          false,
          undefined,
          "operation_failed"
        )
      );
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

function requestFromParent<T>(
  init: BridgeInit,
  permission: string,
  payload: unknown
): Promise<T> {
  if (!init.grantedPermissions.includes(permission)) {
    return Promise.reject(
      new Error(`Console permission is not granted: ${permission}`)
    );
  }
  if (Date.parse(init.expiresAt) <= Date.now()) {
    return Promise.reject(new Error("Console Bridge handle expired"));
  }
  const requestId = randomId();
  return new Promise<T>((resolve, reject) => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !isResponse(event.data)) {
        return;
      }
      if (event.data.requestId !== requestId) {
        return;
      }
      window.removeEventListener("message", onMessage);
      if (event.data.ok) {
        resolve(event.data.payload as T);
      } else {
        reject(new Error(event.data.error ?? "Console Bridge request failed"));
      }
    };
    window.addEventListener("message", onMessage);
    const request: BridgeRequest = {
      handle: init.handle,
      payload,
      permission,
      protocol: consoleBridgeProtocol,
      requestId,
      type: "request",
    };
    window.parent.postMessage(request, "*");
  });
}

function postResponse(
  frame: HTMLIFrameElement,
  requestId: string,
  ok: boolean,
  payload?: unknown,
  error?: string
) {
  const response: BridgeResponse = {
    ok,
    protocol: consoleBridgeProtocol,
    requestId,
    type: "response",
    ...(payload === undefined ? {} : { payload }),
    ...(error === undefined ? {} : { error }),
  };
  frame.contentWindow?.postMessage(response, "*");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isReady(value: unknown): value is BridgeReady {
  return (
    isRecord(value) &&
    value.protocol === consoleBridgeProtocol &&
    value.type === "ready" &&
    typeof value.moduleId === "string" &&
    typeof value.surface === "string" &&
    typeof value.nonce === "string"
  );
}

function isInit(value: unknown): value is BridgeInit {
  return (
    isRecord(value) &&
    value.protocol === consoleBridgeProtocol &&
    value.type === "init" &&
    typeof value.moduleId === "string" &&
    typeof value.surface === "string" &&
    typeof value.nonce === "string" &&
    typeof value.handle === "string" &&
    Array.isArray(value.grantedPermissions) &&
    value.grantedPermissions.every((item) => typeof item === "string") &&
    typeof value.expiresAt === "string"
  );
}

function isRequest(value: unknown): value is BridgeRequest {
  return (
    isRecord(value) &&
    value.protocol === consoleBridgeProtocol &&
    value.type === "request" &&
    typeof value.requestId === "string" &&
    typeof value.handle === "string" &&
    typeof value.permission === "string"
  );
}

function isResponse(value: unknown): value is BridgeResponse {
  return (
    isRecord(value) &&
    value.protocol === consoleBridgeProtocol &&
    value.type === "response" &&
    typeof value.requestId === "string" &&
    typeof value.ok === "boolean"
  );
}

function randomId(): string {
  return crypto.randomUUID();
}
