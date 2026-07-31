import { afterEach, describe, expect, test, vi } from "vitest";

import { consoleBridgeProtocol, installConsoleBridgeHost } from "./index";

afterEach(() => vi.unstubAllGlobals());

describe("Console Bridge host", () => {
  test("binds the frame source and exact permission grant", async () => {
    let listener: ((event: MessageEvent<unknown>) => void) | undefined;
    const posted: unknown[] = [];
    const child = { postMessage: (message: unknown) => posted.push(message) };
    vi.stubGlobal("window", {
      addEventListener: (_type: string, next: typeof listener) => {
        listener = next;
      },
      removeEventListener: vi.fn(),
    });
    const invoke = vi.fn(() => Promise.resolve({ records: [] }));
    const frame = { contentWindow: child } as unknown as HTMLIFrameElement;
    const uninstall = installConsoleBridgeHost({
      frame,
      grant: {
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        grantedPermissions: ["contacts.read"],
        moduleId: "acme/contacts",
        moduleReleaseDigest: `sha256:${"a".repeat(64)}`,
        uiArtifactDigest: `sha256:${"b".repeat(64)}`,
      },
      surface: "contacts",
      invoke,
    });

    listener?.({
      data: {
        moduleId: "acme/contacts",
        nonce: "wrong-surface",
        protocol: consoleBridgeProtocol,
        surface: "settings",
        type: "ready",
      },
      source: child,
    } as unknown as MessageEvent<unknown>);
    expect(posted).toEqual([]);

    listener?.({
      data: {
        moduleId: "acme/contacts",
        nonce: "nonce-1",
        protocol: consoleBridgeProtocol,
        surface: "contacts",
        type: "ready",
      },
      source: child,
    } as unknown as MessageEvent<unknown>);
    const init = posted[0] as { handle: string };
    expect(init.handle).toBeTypeOf("string");

    listener?.({
      data: {
        handle: init.handle,
        payload: { limit: 10 },
        permission: "contacts.read",
        protocol: consoleBridgeProtocol,
        requestId: "request-1",
        type: "request",
      },
      source: child,
    } as unknown as MessageEvent<unknown>);
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith("contacts.read", { limit: 10 });

    listener?.({
      data: {
        handle: init.handle,
        payload: {},
        permission: "contacts.write",
        protocol: consoleBridgeProtocol,
        requestId: "request-2",
        type: "request",
      },
      source: child,
    } as unknown as MessageEvent<unknown>);
    expect(posted.at(-1)).toMatchObject({
      error: "permission_denied",
      ok: false,
      requestId: "request-2",
    });

    listener?.({
      data: {
        moduleId: "acme/contacts",
        nonce: "attacker",
        protocol: consoleBridgeProtocol,
        surface: "contacts",
        type: "ready",
      },
      source: {},
    } as unknown as MessageEvent<unknown>);
    expect(posted).toHaveLength(3);
    uninstall();
  });
});
