import { afterEach, describe, expect, test, vi } from "vitest";

import {
  consoleAccessTokenStorageKey,
  consoleApiPrefix,
  httpClient,
  lensoApiErrorMessage,
  subscribeConsoleAccessToken,
} from "./http-client";

describe("consoleApiPrefix", () => {
  test("keeps hosted console requests origin-rooted", () => {
    expect(consoleApiPrefix("/")).toBe("/");
    expect(consoleApiPrefix("http://localhost:3000/")).toBe(
      "http://localhost:3000"
    );
    expect(consoleApiPrefix("")).toBeUndefined();
  });
});

describe("lensoApiErrorMessage", () => {
  test("extracts standard API error messages", () => {
    expect(
      lensoApiErrorMessage({
        code: "forbidden",
        detail: "missing console admin scope: console.admin",
        status: 403,
        title: "Forbidden",
        type: "https://lenso.dev/problems/forbidden",
      })
    ).toBe("missing console admin scope: console.admin");
  });

  test("ignores unknown error bodies", () => {
    expect(lensoApiErrorMessage({ message: "Forbidden" })).toBeUndefined();
  });
});

describe("Console HTTP authentication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("clears a stored Console session after an API 401", async () => {
    const storage = memoryStorage();
    storage.setItem(consoleAccessTokenStorageKey, "stale-console-session");
    const storageEvents = new EventTarget();
    vi.stubGlobal("window", {
      addEventListener: storageEvents.addEventListener.bind(storageEvents),
      localStorage: storage,
      removeEventListener:
        storageEvents.removeEventListener.bind(storageEvents),
    });
    const tokenChanged = vi.fn();
    const unsubscribe = subscribeConsoleAccessToken(tokenChanged);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            detail: "Console authentication is required",
            status: 401,
            title: "Unauthorized",
            type: "https://lenso.dev/problems/unauthorized",
          },
          { status: 401 }
        )
      )
    );

    await expect(
      httpClient.get("https://console.example.test/api/console/v1/composition")
    ).rejects.toThrow("401");

    expect(storage.getItem(consoleAccessTokenStorageKey)).toBeNull();
    expect(tokenChanged).toHaveBeenCalledOnce();
    unsubscribe();
  });
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
