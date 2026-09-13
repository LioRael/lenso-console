import { execFileSync } from "node:child_process";

// Protect the Shell's independent build: even a transitive dependency on a
// concrete provider would silently register business behavior in native hosts.
const metadata = JSON.parse(
  execFileSync(
    process.env.CARGO || "cargo",
    [
      "metadata",
      "--locked",
      "--all-features",
      "--format-version",
      "1",
      "--manifest-path",
      "service/Cargo.toml",
      ...process.argv.slice(2),
    ],
    { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 }
  )
);
const packages = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
const shell = metadata.packages.find(
  (pkg) => pkg.name === "lenso-console-plugin"
);
if (!shell) {
  throw new Error("Console Shell package is missing");
}
// Native capability dispatch uses Rust type identity, not only descriptor IDs.
// A second Git/path source of either contract compiles but fails at Host startup.
for (const name of [
  "lenso-capability-ui-contribution",
  "lenso-capability-workspace-service",
]) {
  const instances = metadata.packages.filter(
    (pkg) => pkg.name === name && nodes.has(pkg.id)
  );
  if (instances.length !== 1) {
    throw new Error(
      `Native UI contract must have one source: ${name} (${instances.length} found)`
    );
  }
}
const visited = new Set();
const visit = (id, path) => {
  if (visited.has(id)) {
    return;
  }
  visited.add(id);
  const pkg = packages.get(id);
  const next = [...path, pkg.name];
  if (
    id !== shell.id &&
    (pkg.name.endsWith("-plugin") || pkg.name === "lenso-console-app")
  ) {
    throw new Error(
      `Console Shell depends on a concrete Plugin: ${next.join(" -> ")}`
    );
  }
  for (const dependency of nodes.get(id).deps) {
    if (dependency.dep_kinds.some((kind) => kind.kind !== "dev")) {
      visit(dependency.pkg, next);
    }
  }
};
visit(shell.id, []);
console.log("Console Shell has no concrete Plugin dependencies.");

const app = metadata.packages.find((pkg) => pkg.name === "lenso-console-app");
if (!app) {
  throw new Error("Console App package is missing");
}
const pending = [app.id];
const appDependencies = new Set();
while (pending.length > 0) {
  const id = pending.pop();
  if (appDependencies.has(id)) {
    continue;
  }
  appDependencies.add(id);
  const pkg = packages.get(id);
  if (
    pkg.name === "lenso-console-welcome-workspace-plugin" ||
    pkg.manifest_path.includes("/tests/fixtures/")
  ) {
    throw new Error(
      `Console App includes a test fixture in its production dependencies: ${pkg.name}`
    );
  }
  for (const dependency of nodes.get(id).deps) {
    if (dependency.dep_kinds.some((kind) => kind.kind !== "dev")) {
      pending.push(dependency.pkg);
    }
  }
}
console.log("Console App production dependencies contain no test fixtures.");

// The launcher owns process/filesystem mechanics. Agent wire details are supplied
// by its client interface, so it must remain independent of Shell and HTTP stacks.
const launcher = metadata.packages.find(
  (pkg) => pkg.name === "lenso-local-agent-launcher"
);
if (!launcher) {
  throw new Error("Local Agent launcher package is missing");
}
const launcherPending = [launcher.id];
const launcherDependencies = new Set();
while (launcherPending.length > 0) {
  const id = launcherPending.pop();
  if (launcherDependencies.has(id)) {
    continue;
  }
  launcherDependencies.add(id);
  const pkg = packages.get(id);
  if (
    id !== launcher.id &&
    (pkg.name.startsWith("lenso-") ||
      ["http", "reqwest", "axum"].includes(pkg.name))
  ) {
    throw new Error(
      `Local Agent launcher depends on host/protocol implementation: ${pkg.name}`
    );
  }
  for (const dependency of nodes.get(id).deps) {
    if (dependency.dep_kinds.some((kind) => kind.kind !== "dev")) {
      launcherPending.push(dependency.pkg);
    }
  }
}
console.log(
  "Local Agent launcher has no Lenso or HTTP implementation dependencies."
);

// Turn relay may use HTTP, but cannot select or depend on an App, Shell, Plugin,
// launcher, or Lenso runtime. The authenticated target comes from its caller.
const relay = metadata.packages.find(
  (pkg) => pkg.name === "lenso-agent-turn-relay"
);
if (!relay) {
  throw new Error("Agent turn relay package is missing");
}
const relayPending = [relay.id];
const relayDependencies = new Set();
while (relayPending.length > 0) {
  const id = relayPending.pop();
  if (relayDependencies.has(id)) {
    continue;
  }
  relayDependencies.add(id);
  const pkg = packages.get(id);
  if (id !== relay.id && pkg.name.startsWith("lenso-")) {
    throw new Error(
      `Agent turn relay depends on Lenso implementation: ${pkg.name}`
    );
  }
  for (const dependency of nodes.get(id).deps) {
    if (dependency.dep_kinds.some((kind) => kind.kind !== "dev")) {
      relayPending.push(dependency.pkg);
    }
  }
}
console.log("Agent turn relay has no Lenso implementation dependencies.");
