import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { QueryClientProvider } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  exampleServices,
  isUiPreview,
  previewMounts,
  selectPreviewMounts,
} from "virtual:lenso-preview";
import PreviewPage from "virtual:lenso-preview-page";

import type { PageProps } from "../src/index";
import { consolePageDescriptorSchema } from "../src/protocol";
import { createConsoleWorkspaceServices } from "../src/transport";
import { useConsoleAppearance } from "./shell/app/console-appearance";
import { consoleHttpPaths } from "./shell/lib/console-http-paths";
import { ConsoleQueryClient } from "./shell/lib/console-query-client";
import {
  configureSessionCsrf,
  configureSessionReadScope,
  retireSessionReads,
  sessionFetch,
} from "./shell/lib/session-fetch";
import { createWorkspaceReads } from "./workspace-read-client";

export type PreviewMount = PageProps["mount"] & {
  basePath: string;
  requirements: NonNullable<PageProps["mount"]["requirements"]>;
  navigation: {
    label: string;
    items: readonly { label: string; path: readonly string[] }[];
  };
};
type Admission = {
  mounts: readonly PreviewMount[];
  subject?: string;
  readScope: string;
};

const styles = stylex.create({
  retry: { minHeight: 44 },
  destination: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 44,
    padding: 12,
  },
});

export function PreviewShell() {
  const [attempt, setAttempt] = useState(0);
  const [admission, setAdmission] = useState<Admission>();
  const [error, setError] = useState<string>();
  const [handoff, setHandoff] = useState<{
    mountId: string;
    value: PageProps["location"]["handoff"];
  }>();
  const location = useLocation();
  useEffect(() => {
    const lifetime = new AbortController();
    const retire = () => {
      lifetime.abort();
      setAdmission(undefined);
      setHandoff(undefined);
      setError(
        "The backend session changed. Authenticate with the application owner, then retry."
      );
    };
    window.addEventListener("lenso-session-expired", retire);
    setError(undefined);
    setAdmission(undefined);
    setHandoff(undefined);
    const load = async () => {
      if (isUiPreview) {
        setAdmission({ mounts: previewMounts, readScope: "local" });
        return;
      }
      const request = async (path: string) => {
        const response = await sessionFetch(path, {
          credentials: "same-origin",
          cache: "no-store",
          signal: lifetime.signal,
        });
        if (!response.ok) {
          throw new Error("Backend admission failed");
        }
        return response;
      };
      const methods = await request(
        `${consoleHttpPaths.auth_base_path}/methods`
      );
      configureSessionCsrf(await methods.json());
      const session = await request(
        `${consoleHttpPaths.api_base_path}/console/v1/session`
      );
      const identity = await session.json();
      const readScope = session.headers.get("x-lenso-read-scope");
      if (
        identity.authenticated !== true ||
        typeof identity.subject !== "string" ||
        !readScope ||
        !/^[a-f0-9]{64}$/u.test(readScope)
      ) {
        throw new Error("Backend session metadata is unavailable");
      }
      configureSessionReadScope(readScope, async () => {
        const current = await request(
          `${consoleHttpPaths.api_base_path}/console/v1/session`
        );
        if (current.headers.get("x-lenso-read-scope") !== readScope) {
          retire();
        }
      });
      const response = await request(
        `${consoleHttpPaths.api_base_path}/console/v1/pages`
      );
      const catalog = await response.json();
      if (!Array.isArray(catalog.mounts)) {
        throw new TypeError("Backend mount catalog is unavailable");
      }
      const mounts = selectPreviewMounts(catalog.mounts).map(
        (value: unknown) => {
          const mount = consolePageDescriptorSchema.parse(value);
          if (!mount.basePath) {
            throw new Error("Backend mount path is unavailable");
          }
          return { ...mount, basePath: mount.basePath };
        }
      );
      lifetime.signal.throwIfAborted();
      setAdmission({ mounts, subject: identity.subject, readScope });
    };
    const initialize = async () => {
      try {
        await load();
      } catch {
        if (!lifetime.signal.aborted) {
          setError(
            "Preview requires an authenticated compatible TS backend. Use the application owner's authentication, then retry."
          );
        }
      }
    };
    void initialize();
    return () => {
      lifetime.abort();
      retireSessionReads();
      configureSessionCsrf(undefined);
      window.removeEventListener("lenso-session-expired", retire);
    };
  }, [attempt]);
  const mount = admission?.mounts.find(
    (value) =>
      location.pathname === value.basePath.replace(/\/$/u, "") ||
      location.pathname === value.basePath ||
      location.pathname.startsWith(`${value.basePath.replace(/\/$/u, "")}/`)
  );
  return (
    <>
      <main>
        <h1>Plugin page preview</h1>
        <p>
          {isUiPreview
            ? "Example data only. No backend is running."
            : "Application authentication and permissions apply."}
        </p>
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <Button
              onClick={() => setAttempt((value) => value + 1)}
              xstyle={styles.retry}
            >
              Retry admission
            </Button>
          </div>
        ) : admission ? (
          <>
            <nav aria-label="Preview pages">
              {admission.mounts.map((value) => (
                <a
                  {...stylex.props(styles.destination)}
                  href={value.basePath}
                  key={value.id}
                >
                  {value.title}
                </a>
              ))}
            </nav>
            {mount ? (
              <MountedPreview
                admission={admission}
                handoff={
                  handoff?.mountId === mount.id ? handoff.value : undefined
                }
                key={`${mount.id}:${admission.readScope}`}
                mount={mount}
                onHandoff={setHandoff}
              />
            ) : (
              <p>
                {admission.mounts.length
                  ? "Select a preview page."
                  : "No matching pages are admitted by this backend."}
              </p>
            )}
          </>
        ) : (
          <output>Loading preview admission…</output>
        )}
      </main>
    </>
  );
}

function MountedPreview({
  admission,
  handoff,
  mount,
  onHandoff,
}: {
  admission: Admission;
  handoff: PageProps["location"]["handoff"];
  mount: PreviewMount;
  onHandoff: (
    value:
      | {
          mountId: string;
          value: PageProps["location"]["handoff"];
        }
      | undefined
  ) => void;
}) {
  const query = useMemo(() => {
    const client = new ConsoleQueryClient();
    client.admitReadScope(admission.readScope);
    return client;
  }, [admission.readScope]);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useConsoleAppearance();
  const lifetime = useMemo(() => new AbortController(), []);
  useEffect(
    () => () => {
      lifetime.abort();
      query.clear();
    },
    [lifetime, query]
  );
  const href = (segments: readonly string[]) =>
    `${mount.basePath.replace(/\/$/u, "")}/${segments.map(encodeURIComponent).join("/")}`;
  const services = useMemo(
    () =>
      isUiPreview
        ? exampleServices(lifetime.signal)
        : createConsoleWorkspaceServices({
            mount,
            signal: lifetime.signal,
            expectedSubject: admission.subject,
            url: `/${consoleHttpPaths.api_base_path.slice(1)}/console/v2/rpc`,
            fetch: (input, init) =>
              sessionFetch(input, {
                ...init,
                credentials: "same-origin",
                cache: "no-store",
              }),
          }),
    [admission.subject, lifetime, mount]
  );
  const reads = useMemo(
    () =>
      createWorkspaceReads(query, {
        scopeKey: `${mount.id}:${mount.revision}`,
        signal: lifetime.signal,
        localDevelopment: isUiPreview,
        policy: { focus: "never", staleTimeMs: 10_000 },
      }),
    [lifetime, mount, query]
  );
  const segments = location.pathname
    .slice(mount.basePath.length)
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  return (
    <QueryClientProvider client={query}>
      <PreviewPage
        environment={{ locale: "en", theme }}
        location={{
          segments,
          hash: location.hash,
          search: location.searchStr,
          handoff,
        }}
        mount={mount}
        navigation={{
          href,
          go: (next: readonly string[]) => {
            onHandoff(undefined);
            void navigate({ to: href(next) });
          },
          openWorkspace: ({
            workspaceId,
            subject,
            handoff: nextHandoff,
            segments: next = [],
          }: Parameters<PageProps["navigation"]["openWorkspace"]>[0]) => {
            const other = admission.mounts.find(
              (value) =>
                (value.id === workspaceId || value.pageId === workspaceId) &&
                value.subject.kind === subject.kind &&
                (subject.kind === "console" ||
                  (value.subject.kind === "app" &&
                    value.subject.appId === subject.appId))
            );
            if (!other) {
              throw new Error("Workspace is not admitted in this preview");
            }
            onHandoff({ mountId: other.id, value: nextHandoff });
            void navigate({
              to: `${other.basePath.replace(/\/$/u, "")}/${next.map(encodeURIComponent).join("/")}`,
            });
          },
        }}
        params={{}}
        reads={reads}
        services={services}
        signal={lifetime.signal}
      />
    </QueryClientProvider>
  );
}
