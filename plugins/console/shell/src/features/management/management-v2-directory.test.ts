import { expect, test, vi } from "vitest";

import type { PageMount } from "../extensions/page-contribution-catalog";
import { managementOperationHref } from "./management-operation-link";

vi.mock("../extensions/page-contribution-catalog", () => ({}));
vi.mock("../../lib/session-fetch", () => ({}));
vi.mock("../../lib/console-http-paths", () => ({
  consoleHttpPaths: { api_base_path: "/api" },
}));

const operation = {
  method: "restart",
  pluginId: "worker",
  targetId: "alpha",
};
const mount: PageMount = {
  apiMajor: 1,
  id: "worker-alpha",
  module: "",
  navigation: { items: [], label: "Worker" },
  owner: { instance: "worker", source: "application", trusted: true },
  requirements: [
    {
      available: true,
      capability_id: "worker",
      descriptor_version: "1",
      operations: ["restart"],
      required: true,
      service_id: "control",
      source: "owner",
    },
  ],
  revision: "1",
  styles: [],
  subject: { appId: "alpha", kind: "app" },
  title: "Worker",
};

test("binds the same owner on multiple targets, not the first page or its title", () => {
  const beta: PageMount = {
    ...mount,
    id: "worker-beta",
    subject: { appId: "beta", kind: "app" },
    title: "alpha",
  };
  expect(managementOperationHref([beta, mount], operation)).toBe(
    "/apps/alpha/worker-alpha/"
  );
  expect(
    managementOperationHref([beta, mount], { ...operation, targetId: "beta" })
  ).toBe("/apps/beta/worker-beta/");
});

test("uses explicit execution targets and requires one for console subjects", () => {
  const consoleMount: PageMount = { ...mount, subject: { kind: "console" } };
  expect(managementOperationHref([consoleMount], operation)).toBeUndefined();
  expect(
    managementOperationHref([{ ...consoleMount, targetId: "alpha" }], operation)
  ).toBe("/worker-alpha/");
  expect(
    managementOperationHref([{ ...mount, targetId: "beta" }], operation)
  ).toBeUndefined();
});

test.each([
  { ...mount, owner: { ...mount.owner, instance: "worker.other" } },
  { ...mount, requirements: [] },
  {
    ...mount,
    requirements: [{ ...mount.requirements[0]!, available: false }],
  },
  {
    ...mount,
    requirements: [{ ...mount.requirements[0]!, source: "subject" as const }],
  },
  {
    ...mount,
    requirements: [{ ...mount.requirements[0]!, operations: ["status"] }],
  },
])(
  "does not admit a page without its exact available owner operation %#",
  (page) => {
    expect(managementOperationHref([page], operation)).toBeUndefined();
  }
);

test("withholds links for zero or multiple eligible installed pages", () => {
  expect(managementOperationHref([], operation)).toBeUndefined();
  expect(
    managementOperationHref([mount, { ...mount, id: "worker-alt" }], operation)
  ).toBeUndefined();
});
