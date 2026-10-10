import { expect, test } from "bun:test";

import { publish, validateReceipt } from "./console-npm.mjs";

const names = [
  "console-sdk",
  "console-react",
  "console-dashboard",
  "auth-console",
  "console-plugin-manager",
];
const receipt = {
  packages: names.map((name) => ({
    filename: `lenso-${name}-0.1.0.tgz`,
    name: `@lenso/${name}`,
    sha256: "b".repeat(64),
    version: "0.1.0",
  })),
  repository: "LioRael/lenso-console",
  run_attempt: "1",
  run_id: "1",
  source_sha: "a".repeat(40),
};
const env = {
  GITHUB_REPOSITORY: receipt.repository,
  GITHUB_RUN_ATTEMPT: "2",
  GITHUB_RUN_ID: "1",
  GITHUB_SHA: receipt.source_sha,
};

test("receipt rejects another source/run, private owners and archive path changes", () => {
  expect(() => validateReceipt(receipt, env)).not.toThrow();
  expect(() =>
    validateReceipt(receipt, { ...env, GITHUB_SHA: "c".repeat(40) })
  ).toThrow();
  expect(() =>
    validateReceipt(receipt, { ...env, GITHUB_RUN_ID: "2" })
  ).toThrow();
  expect(() =>
    validateReceipt({ ...receipt, run_attempt: "3" }, env)
  ).toThrow();
  for (const edit of [
    { name: "@lenso/console" },
    { filename: "../package.tgz" },
    { version: "0.1.0-beta.1" },
  ]) {
    const changed = structuredClone(receipt);
    Object.assign(changed.packages[0], edit);
    expect(() => validateReceipt(changed, env)).toThrow();
  }
});

test("local publication fails before opening a receipt or invoking npm", async () => {
  await expect(publish("does-not-exist", {})).rejects.toThrow(
    "protected main OIDC"
  );
  const ci = {
    ...env,
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture",
    ACTIONS_ID_TOKEN_REQUEST_URL: "fixture",
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    RELEASE_PROTECTED_JOB: "npm",
  };
  await expect(
    publish("does-not-exist", { ...ci, NPM_TOKEN: "fixture" })
  ).rejects.toThrow("fallback");
  await expect(
    publish("does-not-exist", { ...ci, GITHUB_REF: "refs/heads/feature" })
  ).rejects.toThrow("protected main OIDC");
});
