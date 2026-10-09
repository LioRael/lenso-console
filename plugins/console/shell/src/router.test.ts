import { describe, expect, test } from "bun:test";

import {
  assertConsoleMountPaths,
  consoleMountHref,
  consoleMountKey,
  findConsoleMount,
  type BrowserAdmission,
  type BrowserMount,
} from "@lenso/console-sdk/browser";
import { createMemoryHistory } from "@tanstack/react-router";

import { consoleHandoffForLocation } from "./app/console-admission";
import { consolePathFromLocation } from "./app/console-router-config";
import { consoleBasePathFromBaseUrl, getRouter } from "./router";

describe("Console router", () => {
  test("mounts routes under the built console base path", () => {
    expect(consoleBasePathFromBaseUrl("/console/")).toBe("/console");
    expect(getRouter().options).toMatchObject({ basepath: "/" });
  });

  test("normalizes the console base path once for module surfaces", () => {
    expect(consolePathFromLocation("/console/modules", "/console")).toBe(
      "/modules"
    );
    expect(consolePathFromLocation("/modules", "/")).toBe("/modules");
  });
});

function browserMount(
  id: string,
  basePath: string,
  appId: string
): BrowserMount {
  return {
    apiMajor: 1,
    protocol: "lenso-console-rpc/2",
    id,
    title: id,
    targetId: appId,
    subject: { kind: "app", appId },
    owner: { instance: id, source: "application", trusted: true },
    revision: "revision-1",
    implementationId: "implementation-1",
    basePath,
    module: `/page-assets/${id}.mjs`,
    styles: [],
    navigation: { label: id, items: [] },
    requirements: [],
  };
}

describe("admitted browser navigation", () => {
  test("rejects cross-subject path ambiguity instead of selecting the first app", () => {
    const first = browserMount("first", "/reports/", "app-a");
    const second = browserMount("second", "/reports/", "app-b");
    const admission: BrowserAdmission = {
      subject: "operator",
      readScope: "read-scope",
      mounts: [first, second],
    };
    expect(() => assertConsoleMountPaths(admission.mounts)).toThrow(
      'mount "first" (/reports/) and mount "second" (/reports/). Assign globally distinct'
    );
    expect(() => findConsoleMount(admission, "/reports/")).toThrow(
      "Console browser paths overlap"
    );
    const nested = { ...second, basePath: "/reports/details/" };
    expect(() => assertConsoleMountPaths([first, nested])).toThrow(
      "Console browser paths overlap"
    );
    const distinct = { ...second, basePath: "/reports-archive/" };
    expect(
      findConsoleMount(
        { ...admission, mounts: [first, distinct] },
        "/reports-archive/"
      )
    ).toBe(distinct);
  });

  test("handoff belongs to the exact destination activation, not the retiring page", () => {
    const source = browserMount("source", "/source/", "app-a");
    const destination = browserMount("destination", "/destination/", "app-b");
    const admission: BrowserAdmission = {
      subject: "operator",
      readScope: "read-scope",
      mounts: [source, destination],
    };
    const handoff = { kind: "selection", payload: { id: "record-42" } };
    const pending = {
      admission,
      destinationKey: consoleMountKey(admission, destination),
      destinationHref: "/destination/detail",
      value: handoff,
    };
    expect(
      consoleHandoffForLocation(pending, admission, source, "/source/")
    ).toBeUndefined();
    // A freshly mounted destination can receive the value retained above its key.
    expect(
      consoleHandoffForLocation(
        pending,
        admission,
        { ...destination },
        "/destination/detail"
      )
    ).toBe(handoff);
    expect(
      consoleHandoffForLocation(
        pending,
        admission,
        { ...destination, revision: "revision-2" },
        "/destination/detail"
      )
    ).toBeUndefined();
    expect(
      consoleHandoffForLocation(
        pending,
        { ...admission },
        destination,
        "/destination/detail"
      )
    ).toBeUndefined();
    expect(
      consoleHandoffForLocation(
        pending,
        undefined,
        destination,
        "/destination/detail"
      )
    ).toBeUndefined();
    expect(
      consoleHandoffForLocation(
        pending,
        admission,
        destination,
        "/destination/detail?filter=other"
      )
    ).toBeUndefined();
    const router = getRouter();
    router.update({
      history: createMemoryHistory({ initialEntries: ["/source/"] }),
    });
    const rootHref = router.buildLocation({
      to: consoleMountHref(destination, []),
    }).href;
    expect(rootHref).toBe("/destination");
    expect(
      consoleHandoffForLocation(
        { ...pending, destinationHref: rootHref },
        admission,
        destination,
        rootHref
      )
    ).toBe(handoff);
  });
});
