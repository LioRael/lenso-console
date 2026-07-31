import { Link, Outlet } from "@tanstack/react-router";

import { useConsoleComposition } from "./console-composition";

export function SystemShell() {
  const composition = useConsoleComposition();
  const entries =
    composition.data?.modules.flatMap((module) =>
      (module.uiEntries ?? []).map((entry) => ({ entry, module }))
    ) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
          <Link className="font-semibold tracking-tight" to="/">
            Lenso Console
          </Link>
          <nav aria-label="Console Modules" className="flex flex-wrap gap-4">
            {entries.map(({ entry, module }) => (
              <Link
                key={`${module.moduleId}:${entry.name}`}
                params={{ entryName: entry.name, moduleId: module.moduleId }}
                to="/module-ui/$moduleId/$entryName"
              >
                {entry.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">
        <Outlet />
      </main>
    </div>
  );
}

export function SystemHome() {
  const composition = useConsoleComposition();
  return (
    <section>
      <p className="text-sm text-muted-foreground">System Plane</p>
      <h1 className="mt-2 text-3xl font-semibold">Console Service</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        This shell contains no management workflow. Installed Console Modules
        contribute the available operator surfaces through the reviewed
        composition.
      </p>
      <p className="mt-6 text-sm">
        Composition revision is active with{" "}
        {composition.data?.modules.length ?? 0} modules.
      </p>
    </section>
  );
}
