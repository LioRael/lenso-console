import { expect, test } from "bun:test";

import { publish, releaseTag, validateReceipt } from "./console-npm.mjs";

const names = [
  "console-sdk",
  "console-react",
  "console-dashboard",
  "auth-console",
  "console-plugin-manager",
];
const receipt = {
  package_scope: "frontend",
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
    { name: "@lenso/engine" },
    { filename: "../package.tgz" },
    { version: "0.1.0-beta.1" },
  ]) {
    const changed = structuredClone(receipt);
    Object.assign(changed.packages[0], edit);
    expect(() => validateReceipt(changed, env)).toThrow();
  }
});

test("SDK-only release rejects frontend companions and mismatched scope", () => {
  const sdk = {
    ...receipt,
    package_scope: "sdk",
    packages: [receipt.packages[0]],
  };
  const sdkEnv = { ...env, RELEASE_PACKAGE_SCOPE: "sdk" };
  expect(() => validateReceipt(sdk, sdkEnv)).not.toThrow();
  expect(() => validateReceipt(receipt, sdkEnv)).toThrow();
  expect(() => validateReceipt(sdk, env)).toThrow();
  expect(() =>
    validateReceipt({ ...sdk, packages: [receipt.packages[1]] }, sdkEnv)
  ).toThrow();
  expect(() =>
    validateReceipt({ ...sdk, packages: receipt.packages }, sdkEnv)
  ).toThrow();
});

test("React-only release rejects foreign owners, multiple archives and mismatched scope", () => {
  const react = {
    ...receipt,
    package_scope: "react",
    packages: [receipt.packages[1]],
  };
  const reactEnv = { ...env, RELEASE_PACKAGE_SCOPE: "react" };
  expect(() => validateReceipt(react, reactEnv)).not.toThrow();
  expect(() => validateReceipt(receipt, reactEnv)).toThrow();
  expect(() => validateReceipt(react, env)).toThrow();
  for (const name of [
    ...names.filter((owner) => owner !== "console-react"),
    "console",
    "engine",
  ]) {
    expect(() =>
      validateReceipt(
        {
          ...react,
          packages: [
            {
              ...react.packages[0],
              filename: `lenso-${name}-0.1.0.tgz`,
              name: `@lenso/${name}`,
            },
          ],
        },
        reactEnv
      )
    ).toThrow();
  }
  expect(() =>
    validateReceipt({ ...react, packages: receipt.packages }, reactEnv)
  ).toThrow();
});

test("backend release scope accepts only Console and cannot reuse a frontend receipt", () => {
  const backend = {
    ...receipt,
    package_scope: "backend",
    packages: [
      {
        filename: "lenso-console-2.0.0.tgz",
        name: "@lenso/console",
        sha256: "b".repeat(64),
        version: "2.0.0",
      },
    ],
  };
  const backendEnv = { ...env, RELEASE_PACKAGE_SCOPE: "backend" };
  expect(() => validateReceipt(backend, backendEnv)).not.toThrow();
  expect(() => validateReceipt(receipt, backendEnv)).toThrow();
  expect(() => validateReceipt(backend, env)).toThrow();
  expect(() =>
    validateReceipt({ ...backend, packages: receipt.packages }, backendEnv)
  ).toThrow();
  expect(() =>
    validateReceipt(
      { ...backend, package_scope: "all" },
      { ...env, RELEASE_PACKAGE_SCOPE: "all" }
    )
  ).toThrow();
});

test("backend RC archives use next and cannot become frontend or stable releases", () => {
  expect(releaseTag("2.0.1-rc.0", "backend")).toBe("next");
  expect(releaseTag("2.0.0", "backend")).toBe("latest");
  expect(releaseTag("0.3.0", "frontend")).toBe("latest");
  for (const [version, scope] of [
    ["2.0.1-rc.0", "frontend"],
    ["2.0.1-beta.0", "backend"],
    ["2.0.1-rc.0+build", "backend"],
    ["2.0.1", "all"],
  ]) {
    expect(() => releaseTag(version, scope)).toThrow();
  }
  const rc = {
    ...receipt,
    package_scope: "backend",
    packages: [
      {
        filename: "lenso-console-2.0.1-rc.0.tgz",
        name: "@lenso/console",
        sha256: "b".repeat(64),
        version: "2.0.1-rc.0",
      },
    ],
  };
  expect(() =>
    validateReceipt(rc, { ...env, RELEASE_PACKAGE_SCOPE: "backend" })
  ).not.toThrow();
  expect(() => validateReceipt(rc, env)).toThrow();
});

test("Auth Console repair publication rejects broader or foreign archive receipts", () => {
  const auth = {
    ...receipt,
    package_scope: "auth-console",
    packages: [
      {
        filename: "lenso-auth-console-1.0.1.tgz",
        name: "@lenso/auth-console",
        sha256: "b".repeat(64),
        version: "1.0.1",
      },
    ],
  };
  const authEnv = { ...env, RELEASE_PACKAGE_SCOPE: "auth-console" };
  expect(() => validateReceipt(auth, authEnv)).not.toThrow();
  expect(() => validateReceipt(receipt, authEnv)).toThrow();
  expect(() => validateReceipt(auth, env)).toThrow();
  expect(() =>
    validateReceipt({ ...auth, packages: receipt.packages }, authEnv)
  ).toThrow();
  expect(() =>
    validateReceipt(
      {
        ...auth,
        packages: [
          {
            ...auth.packages[0],
            filename: "lenso-console-sdk-1.0.1.tgz",
            name: "@lenso/console-sdk",
          },
        ],
      },
      authEnv
    )
  ).toThrow();
  expect(() => releaseTag("1.0.1-rc.0", "auth-console")).toThrow();
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

// The approved plugin-manager patch must not repackage other existing frontend versions.
test("plugin-manager-only receipt rejects other owners, multiple archives and cross-scope reuse", () => {
  const manager = {
    ...receipt,
    package_scope: "plugin-manager",
    packages: [receipt.packages[4]],
  };
  const managerEnv = { ...env, RELEASE_PACKAGE_SCOPE: "plugin-manager" };
  expect(() => validateReceipt(manager, managerEnv)).not.toThrow();
  expect(() => validateReceipt(manager, env)).toThrow();
  expect(() => validateReceipt(receipt, managerEnv)).toThrow();
  expect(() =>
    validateReceipt({ ...manager, packages: receipt.packages }, managerEnv)
  ).toThrow();
  for (const foreign of receipt.packages.slice(0, 4)) {
    expect(() =>
      validateReceipt({ ...manager, packages: [foreign] }, managerEnv)
    ).toThrow();
  }
  expect(() =>
    validateReceipt(manager, { ...managerEnv, GITHUB_SHA: "c".repeat(40) })
  ).toThrow();
  expect(() =>
    validateReceipt(manager, { ...managerEnv, GITHUB_RUN_ID: "2" })
  ).toThrow();
  expect(releaseTag("0.1.8", "plugin-manager")).toBe("latest");
});
