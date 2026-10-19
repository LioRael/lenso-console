import { expect, test } from "bun:test";

import { ConsoleActionHost, ConsoleLayout } from "@lenso/console-react";
import type {
  PageProps,
  ReadSnapshot,
  WorkspaceReadOptions,
  WorkspaceReadResult,
  WorkspaceReads,
} from "@lenso/console-sdk";
import { WorkspaceScope } from "@lenso/console-sdk/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  AdministrationAction,
  AdministrationClient,
  AdministrationInfo,
} from "../src/administration-contracts";
import { AccessPage, IdentityPage } from "../src/administration-pages";

// This is a test-only host projection, not an application or sample directory.
function render(profile: AdministrationInfo, view: "access" | "identity") {
  const requested: string[] = [];
  const client: AdministrationClient = {
    async invoke() {
      throw new Error("Unexpected network request during render proof");
    },
    async issueToken() {
      throw new Error("Unexpected credential request");
    },
    async rotateToken() {
      throw new Error("Unexpected credential request");
    },
  };
  const fixtures: Record<string, unknown> = {
    "administration.info": profile,
    "administration.accessRead": {
      revision: "test-revision",
      consoleId: profile.consoleId,
      tenantId: profile.tenantId,
      members: [],
      roles: [],
    },
    "administration.usersRead": {
      subjectId: "test-subject",
      realmId: profile.realmId,
      label: "Test identity",
      source: profile.source,
      status: "active",
    },
    "administration.sessionsList": { items: [], nextCursor: null },
  };
  const reads: WorkspaceReads = {
    useRead<Params, Data>({
      key,
    }: WorkspaceReadOptions<Params, Data>): WorkspaceReadResult<Data> {
      requested.push(key);
      return {
        data: fixtures[key] as ReadSnapshot<Data>,
        error: null,
        blocking: false,
        refreshing: false,
        async refetch() {},
      };
    },
    async invalidate() {},
  };
  renderToStaticMarkup(
    createElement(
      WorkspaceScope,
      {
        // These renderers only consume the supplied reads boundary.
        value: {
          reads,
          activation: { key: "administration-test", isCurrent: () => true },
          mount: { id: "administration-test" },
          location: { hash: "", search: "", segments: [] },
          navigation: {
            go() {},
            href(segments: readonly string[]) {
              return `/${segments.join("/")}`;
            },
            openWorkspace() {},
          },
        } as unknown as PageProps,
      },
      createElement(ConsoleActionHost, {
        render: () => null,
        // eslint-disable-next-line react/no-children-prop -- The public ActionHost type requires function-capable children in createElement props.
        children: createElement(
          ConsoleLayout,
          null,
          view === "access"
            ? createElement(AccessPage, { client })
            : createElement(IdentityPage, { client, subjectId: "test-subject" })
        ),
      })
    )
  );
  return requested;
}

function info(
  allowed: readonly AdministrationAction[],
  sessions = false
): AdministrationInfo {
  return {
    consoleId: "test-console",
    tenantId: "test-tenant",
    realmId: "test-realm",
    source: "test-directory",
    mcpUrl: "https://example.invalid/mcp",
    allowed,
    supported: { userDisable: true, sessions, sessionRevoke: sessions },
    authentication: "personal-token",
    observedLastCallAt: null,
  };
}

// Server authorization tests cannot catch a renderer starting a composite read
// when only one of its two independently protected projections is admitted.
test("combined access snapshot is requested only with both list permissions", () => {
  for (const allowed of [[], ["members.list"], ["roles.list"]] as const) {
    expect(render(info(allowed), "access")).toEqual(["administration.info"]);
  }
  expect(render(info(["members.list", "roles.list"]), "access")).toEqual([
    "administration.info",
    "administration.accessRead",
  ]);
});

// The legacy Auth pages have different capabilities; their coverage cannot prove
// the administration renderer omits unsupported session and safety-revision reads.
test("identity source capabilities and permissions gate child reads", () => {
  expect(render(info([]), "identity")).toEqual(["administration.info"]);
  expect(
    render(info(["users.read", "users.disable", "sessions.list"]), "identity")
  ).toEqual(["administration.info", "administration.usersRead"]);
  expect(render(info(["users.read", "permissions.read"]), "identity")).toEqual([
    "administration.info",
    "administration.usersRead",
    "administration.permissionsRead",
  ]);
  expect(
    render(
      info(
        [
          "users.read",
          "users.disable",
          "members.list",
          "roles.list",
          "sessions.list",
        ],
        true
      ),
      "identity"
    )
  ).toEqual([
    "administration.info",
    "administration.usersRead",
    "administration.accessRead",
    "administration.sessionsList",
  ]);
});
