import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { agentApiUrl } from "./agent-runtime";

type Project = { id: string; path: string };
type Directory = {
  path: string;
  parent: string | null;
  directories: string[];
  truncated: boolean;
};

async function request<T>(path: string, body?: { path: string }): Promise<T> {
  const response = await fetch(agentApiUrl("app", `projects${path}`), {
    headers: {
      "x-lenso-console-projects": "1",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => undefined);
    throw new Error(error?.detail ?? "Projects are unavailable");
  }
  return response.json();
}

export function AgentProjectPicker({
  agentId,
  path,
  children,
}: {
  agentId: string;
  path: string;
  children: ReactNode;
}) {
  const directoryInputId = useId();
  const [open, setOpen] = useState(false);
  const [directory, setDirectory] = useState(path);
  const [browsing, setBrowsing] = useState(path);
  const [busy, setBusy] = useState(false);
  const [projectError, setProjectError] = useState<string>();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const projects = useQuery({
    queryKey: ["local-projects", agentId],
    queryFn: () => request<{ projects: Project[]; defaultPath: string }>(""),
    enabled: agentId === "app",
    retry: false,
  });
  const listing = useQuery({
    queryKey: ["project-directories", browsing],
    queryFn: () =>
      request<Directory>(`/directories?path=${encodeURIComponent(browsing)}`),
    enabled: open,
    retry: false,
  });
  const choose = (project?: string) => {
    setOpen(false);
    navigate({
      to: "/agent/$agentId/$chatId",
      params: { agentId, chatId: "new-task" },
      search: { project },
    });
  };
  const openDirectory = async () => {
    setBusy(true);
    setProjectError(undefined);
    try {
      const project = await request<Project>("", { path: directory });
      await projects.refetch();
      choose(project.id);
    } catch (error) {
      setProjectError(
        error instanceof Error ? error.message : "Could not open project"
      );
    } finally {
      setBusy(false);
    }
  };
  if (!projects.data) {
    return children;
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setOpen(next);
          setDirectory(path);
          setBrowsing(path);
          setProjectError(undefined);
        }
      }}
    >
      <Dialog.Trigger
        render={
          <Button
            size="compact"
            variant="ghost"
            aria-label={`Change project: ${path}`}
            xstyle={styles.trigger}
          />
        }
      >
        {children}
      </Dialog.Trigger>
      <Dialog.Portal {...stylex.props(styles.portal)}>
        <Dialog.Backdrop xstyle={styles.backdrop} />
        <Dialog.Viewport xstyle={styles.viewport}>
          <Dialog.Popup xstyle={styles.popup}>
            <Dialog.Header>
              <div>
                <Dialog.Title>Open project</Dialog.Title>
                <Dialog.Description>
                  Each project keeps its own tasks. Tasks in other projects
                  continue running.
                </Dialog.Description>
              </div>
              <Dialog.Close disabled={busy} />
            </Dialog.Header>
            <Dialog.Body xstyle={styles.body}>
              <div
                {...stylex.props(styles.projects)}
                aria-label="Opened projects"
              >
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => choose()}
                  aria-current={search.project ? undefined : "true"}
                  xstyle={styles.row}
                >
                  <FolderOpen size={14} />
                  {projects.data.defaultPath}
                  <span>Default</span>
                </Button>
                {projects.data.projects.map((project) => (
                  <Button
                    key={project.id}
                    variant="ghost"
                    disabled={busy}
                    onClick={() => choose(project.id)}
                    aria-current={
                      search.project === project.id ? "true" : undefined
                    }
                    xstyle={styles.row}
                  >
                    <FolderOpen size={14} />
                    {project.path}
                  </Button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setBrowsing(directory);
                }}
                {...stylex.props(styles.pathForm)}
              >
                <label htmlFor={directoryInputId}>Directory</label>
                <div {...stylex.props(styles.pathRow)}>
                  <input
                    id={directoryInputId}
                    value={directory}
                    onChange={(event) => setDirectory(event.target.value)}
                    placeholder="/path/to/project"
                    disabled={busy}
                    {...stylex.props(styles.input)}
                  />
                  <Button type="submit" disabled={busy} variant="secondary">
                    Browse
                  </Button>
                </div>
              </form>
              <div
                {...stylex.props(styles.directories)}
                aria-label="Directories"
              >
                {listing.data?.parent ? (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    xstyle={styles.row}
                    onClick={() => {
                      const parent = listing.data?.parent;
                      if (parent) {
                        setDirectory(parent);
                        setBrowsing(parent);
                      }
                    }}
                  >
                    ↑ Parent directory
                  </Button>
                ) : null}
                {listing.data?.directories.map((entry) => (
                  <Button
                    key={entry}
                    variant="ghost"
                    disabled={busy}
                    xstyle={styles.row}
                    onClick={() => {
                      setDirectory(entry);
                      setBrowsing(entry);
                    }}
                  >
                    <FolderOpen size={14} />
                    {entry.split("/").at(-1)}
                  </Button>
                ))}
                {listing.isPending ? <span>Loading directories…</span> : null}
                {listing.data?.truncated ? (
                  <span>
                    Directory listing is limited. Enter a full path to open
                    another folder.
                  </span>
                ) : null}
                {listing.error ? (
                  <p role="alert">{listing.error.message}</p>
                ) : null}
              </div>
              {projectError ? <p role="alert">{projectError}</p> : null}
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                disabled={busy || !directory.trim()}
                onClick={() => void openDirectory()}
              >
                {busy ? "Opening project…" : "Open project"}
              </Button>
            </Dialog.Footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const styles = stylex.create({
  portal: { position: "relative", zIndex: 100 },
  trigger: { minWidth: 0, padding: "4px 6px", gap: "6px", textAlign: "left" },
  backdrop: { zIndex: 100 },
  viewport: { zIndex: 101 },
  popup: { width: "calc(100vw - 32px)", maxWidth: 540 },
  body: { display: "grid", gap: 16, fontSize: 12 },
  projects: { display: "grid", gap: 2, maxHeight: 160, overflowY: "auto" },
  row: {
    justifyContent: "flex-start",
    textAlign: "left",
    fontSize: 12,
    gap: 8,
    overflowWrap: "anywhere",
    whiteSpace: "normal",
    height: "auto",
    minHeight: 30,
  },
  pathForm: { display: "grid", gap: 6 },
  pathRow: { display: "flex", gap: 8 },
  input: {
    minWidth: 0,
    flex: 1,
    fontSize: 12,
    border: "1px solid var(--color-border-primary)",
    borderRadius: "var(--radius-control)",
    backgroundColor: "var(--color-surface-canvas)",
    color: "var(--color-content-primary)",
    padding: "6px 8px",
  },
  directories: { display: "grid", maxHeight: 220, overflowY: "auto", gap: 2 },
});
