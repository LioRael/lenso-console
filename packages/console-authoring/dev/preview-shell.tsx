import {
  ConsoleActionHost,
  ConsoleDock,
  ConsoleLayout,
  useConsoleActivation,
} from "@lenso/console-react";

import "@lenso/console-react/styles.css";
import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { QueryClientProvider } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  exampleServices,
  isUiPreview,
  previewMounts,
  selectPreviewMounts,
} from "virtual:lenso-preview";
import PreviewPage from "virtual:lenso-preview-page";

import {
  ConsoleBrowserMount,
  consoleMountHref,
  consoleMountKey,
  findConsoleMount,
  useConsoleAdmission,
  type BrowserMount,
} from "../src/browser";
import { ConsoleQueryClient } from "../src/browser-query-client";
import { createWorkspaceReads } from "../src/browser-reads";
import type { PageProps } from "../src/index";
import { useConsoleAppearance } from "./shell/app/console-appearance";

export type PreviewMount = PageProps["mount"] & {
  basePath: string;
  requirements: NonNullable<PageProps["mount"]["requirements"]>;
  navigation: {
    label: string;
    items: readonly { label: string; path: readonly string[] }[];
  };
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

const selectMounts = (mounts: readonly BrowserMount[]) =>
  selectPreviewMounts(mounts) as readonly BrowserMount[];

export function PreviewShell() {
  return isUiPreview ? <LocalPreview /> : <BackendPreview />;
}

function BackendPreview() {
  const { admission, error, retry } = useConsoleAdmission(selectMounts);
  const location = useLocation();
  const mount = findConsoleMount(admission, location.pathname);
  return (
    <main>
      <h1>Plugin page preview</h1>
      <p>Application authentication and permissions apply.</p>
      {error ? (
        <div role="alert">
          <p>{error.message}</p>
          <Button onClick={retry} xstyle={styles.retry}>
            Retry admission
          </Button>
        </div>
      ) : admission ? (
        <>
          <Destinations mounts={admission.mounts} />
          {mount ? (
            <ConsoleBrowserMount
              admission={admission}
              key={consoleMountKey(admission, mount)}
              mount={mount}
            >
              {(runtime) => (
                <PreviewContent
                  mount={mount}
                  mounts={admission.mounts}
                  runtime={runtime}
                />
              )}
            </ConsoleBrowserMount>
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
  );
}

function Destinations({ mounts }: { mounts: readonly PreviewMount[] }) {
  return (
    <nav aria-label="Preview pages">
      {mounts.map((mount) => (
        <a
          {...stylex.props(styles.destination)}
          href={mount.basePath}
          key={mount.id}
        >
          {mount.title}
        </a>
      ))}
    </nav>
  );
}

function PreviewContent({
  mount,
  mounts,
  runtime,
}: {
  mount: PreviewMount;
  mounts: readonly PreviewMount[];
  runtime: Pick<PageProps, "services" | "reads" | "signal">;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useConsoleAppearance();
  const dockRef = useRef<HTMLDivElement | null>(null);
  const { activation, signal } = useConsoleActivation(
    location.pathname,
    runtime.signal
  );
  const [handoff, setHandoff] = useState<{
    mountId: string;
    value: PageProps["location"]["handoff"];
  }>();
  return (
    <ConsoleLayout>
      <ConsoleActionHost
        render={(selection) => (
          <ConsoleLayout.Foreground>
            <ConsoleDock
              visible={!!selection}
              position="bottom"
              compact={false}
              activeId=""
              items={[]}
              selection={selection}
              running={selection?.running ?? false}
              dockRef={dockRef}
              onNavigate={() => undefined}
              onExpand={() => undefined}
              onFocusDock={() => undefined}
            />
          </ConsoleLayout.Foreground>
        )}
      >
        <PreviewPage
          {...runtime}
          activation={activation}
          signal={signal}
          environment={{ locale: "en", theme }}
          location={{
            segments: location.pathname
              .slice(mount.basePath.replace(/\/$/u, "").length)
              .split("/")
              .filter(Boolean)
              .map(decodeURIComponent),
            hash: location.hash,
            search: location.searchStr,
            handoff: handoff?.mountId === mount.id ? handoff.value : undefined,
          }}
          mount={mount}
          navigation={{
            href: (segments) => consoleMountHref(mount, segments),
            go: (segments) => {
              setHandoff(undefined);
              void navigate({ to: consoleMountHref(mount, segments) });
            },
            openWorkspace: ({
              workspaceId,
              subject,
              handoff: value,
              segments = [],
            }) => {
              const other = mounts.find(
                (candidate) =>
                  (candidate.id === workspaceId ||
                    candidate.pageId === workspaceId) &&
                  candidate.subject.kind === subject.kind &&
                  (subject.kind === "console" ||
                    (candidate.subject.kind === "app" &&
                      candidate.subject.appId === subject.appId))
              );
              if (!other) {
                throw new Error("Workspace is not admitted in this preview");
              }
              setHandoff({ mountId: other.id, value });
              void navigate({ to: consoleMountHref(other, segments) });
            },
          }}
          params={{}}
        />
      </ConsoleActionHost>
    </ConsoleLayout>
  );
}

function LocalPreview() {
  const location = useLocation();
  const mount = previewMounts.find(
    (candidate) =>
      location.pathname === candidate.basePath.replace(/\/$/u, "") ||
      location.pathname.startsWith(candidate.basePath)
  );
  return (
    <main>
      <h1>Plugin page preview</h1>
      <p>Example data only. No backend is running.</p>
      <Destinations mounts={previewMounts} />
      {mount ? (
        <LocalMount key={`${mount.id}:${mount.revision}`} mount={mount} />
      ) : (
        <p>Select a preview page.</p>
      )}
    </main>
  );
}

function LocalMount({ mount }: { mount: PreviewMount }) {
  const [content, setContent] = useState<ReactNode>();
  useEffect(() => {
    const lifetime = new AbortController();
    const query = new ConsoleQueryClient();
    query.admitReadScope("local");
    setContent(
      <QueryClientProvider client={query}>
        <PreviewContent
          mount={mount}
          mounts={previewMounts}
          runtime={{
            signal: lifetime.signal,
            services: exampleServices(lifetime.signal),
            reads: createWorkspaceReads(query, {
              scopeKey: `${mount.id}:${mount.revision}`,
              signal: lifetime.signal,
              localDevelopment: true,
              policy: { focus: "never", staleTimeMs: 10_000 },
            }),
          }}
        />
      </QueryClientProvider>
    );
    return () => {
      lifetime.abort();
      query.clear();
    };
  }, [mount]);
  return content;
}
