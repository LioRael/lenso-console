import "@fontsource-variable/inter";
import "@lenso/tokens/styles.css";
import "@lenso/console-react/styles.css";
import "../../../../plugins/console/shell/src/styles.css";
import { ConsoleInteractionHost, ConsoleLayout } from "@lenso/console-react";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  createReviewAdministration,
  createReviewWorkspaceServices,
} from "../../../../examples/composed-console/review-samples";
import Template from "../../../console-authoring/template/page";
import type { AdministrationClient } from "../../src/administration-contracts";
import { IdentityPage } from "../../src/administration-pages";
import { FixtureWorkspace } from "./workspace.fixture";

const base = createReviewAdministration();
const requests: Record<string, number> = {};
const navigations: string[] = [];
let mode = new URLSearchParams(location.search).get("state") ?? "ready";
let restricted = mode === "denied";
const client: AdministrationClient = {
  ...base,
  async invoke(method, input, options) {
    requests[method] = (requests[method] ?? 0) + 1;
    if (mode === "failure" && method === "usersList") {
      throw new Error("Fixture unavailable");
    }
    const value =
      method === "usersList" &&
      new URLSearchParams(location.search).has("paged")
        ? await base.invoke(method, { ...input, limit: 2 }, options)
        : await base.invoke(method, input, options);
    if (method === "info" && restricted) {
      return { ...value, allowed: [] } as typeof value;
    }
    if (method === "info" && mode === "unsupported") {
      return {
        ...value,
        supported: {
          sessions: false,
          userDisable: false,
          sessionRevoke: false,
        },
      } as typeof value;
    }
    if (method === "usersList" && mode === "empty") {
      return { ...value, items: [], nextCursor: null } as typeof value;
    }
    return value;
  },
};
Object.assign(window, {
  identityFixture: {
    requests,
    navigations,
    mode(value: string) {
      mode = value;
    },
    revoke() {
      restricted = true;
    },
  },
});

function Fixture() {
  const [subject, setSubject] = useState(
    new URLSearchParams(location.search).get("subject") ?? undefined
  );
  const controller = useMemo(() => new AbortController(), []);
  const activation = useMemo(
    () => ({
      key: "identity-isolated",
      isCurrent: () => !controller.signal.aborted,
    }),
    [controller]
  );
  const navigate = (href: string) => {
    navigations.push(href);
    const target = new URL(href, location.origin);
    const selected = target.pathname.includes("/users/")
      ? decodeURIComponent(target.pathname.split("/users/")[1]!)
      : undefined;
    const current = new URL(location.href);
    if (selected) {
      current.searchParams.set("subject", selected);
    } else {
      current.searchParams.delete("subject");
    }
    const directory = target.searchParams.get("directory");
    if (directory) {
      current.searchParams.set("directory", directory);
    } else {
      current.searchParams.delete("directory");
    }
    history.pushState(null, "", current);
    setSubject(selected);
  };
  return (
    <FixtureWorkspace
      segments={subject ? ["users", subject] : []}
      activation={activation}
      signal={controller.signal}
      services={createReviewWorkspaceServices()}
      navigate={navigate}
    >
      {(workspace) => (
        <ConsoleLayout>
          <ConsoleInteractionHost
            router={{
              pathname: subject ? `/identity/users/${subject}` : "/identity",
              navigate,
            }}
            signal={controller.signal}
          >
            {new URLSearchParams(location.search).has("template") ? (
              <Template {...workspace} />
            ) : (
              <IdentityPage
                client={client}
                {...(subject ? { subjectId: subject } : {})}
                {...(new URLSearchParams(location.search).has("routes")
                  ? {
                      identityHref: (id: string) =>
                        `/identity/users/${encodeURIComponent(id)}`,
                    }
                  : {})}
                returnHref="/identity"
                onNavigate={navigate}
              />
            )}
          </ConsoleInteractionHost>
        </ConsoleLayout>
      )}
    </FixtureWorkspace>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
