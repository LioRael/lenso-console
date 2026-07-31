import { useState } from "react";

import { ProductPage, StatusDot } from "../console-design/components";

type ModuleRow = readonly [string, string, string, string, string];

const modules: readonly ModuleRow[] = [
  ["Auth", "auth", "Linked", "Loaded", "Users · Sessions"],
  ["Story", "platform-story", "Linked", "Loaded", "Stories · Traces"],
  ["Identity Console", "identity", "Installed", "Loaded", "Users"],
  ["Remote CRM", "remote-crm", "Installed", "Loaded", "Contacts · Companies"],
  ["System Registry", "system-registry", "First party", "Loaded", "Services"],
] as const;

export function ModulesPage() {
  const [selected, setSelected] = useState<ModuleRow>(modules[0]!);
  return (
    <ProductPage
      description="Installed capabilities, loading sources, and Console surfaces registered with this host."
      meta="5 registered · 5 loaded"
      title="Modules"
    >
      <div className="grid min-h-[744px] grid-cols-[minmax(0,1fr)_376px] border-t border-(--line)">
        <section className="border-r border-(--line) pr-7">
          <header className="flex h-[58px] items-center px-2.5">
            <h2 className="text-[14px] font-medium">Registry</h2>
            <span className="ml-auto text-[11px] text-(--fg-tertiary)">
              manifest declarations
            </span>
          </header>
          <div className="grid h-10 grid-cols-[minmax(180px,1fr)_120px_120px_160px] items-center border-b border-(--line) px-2.5 text-[11px] text-(--fg-tertiary)">
            <span>Module</span>
            <span>Source</span>
            <span>State</span>
            <span>Surfaces</span>
          </div>
          {modules.map((item) => (
            <button
              className={`grid h-[68px] w-full grid-cols-[minmax(180px,1fr)_120px_120px_160px] items-center border-b border-(--line) px-2.5 text-left text-[12px] ${selected[1] === item[1] ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"}`}
              key={item[1]}
              onClick={() => setSelected(item)}
              type="button"
            >
              <span>
                <strong className="block font-medium">{item[0]}</strong>
                <span className="font-mono text-[10px] text-(--fg-tertiary)">
                  {item[1]}
                </span>
              </span>
              <span>{item[2]}</span>
              <StatusDot label={item[3]} tone="success" />
              <span className="text-(--fg-secondary)">{item[4]}</span>
            </button>
          ))}
        </section>
        <aside className="px-7 pt-7">
          <h2 className="text-[18px] font-semibold">{selected[0]}</h2>
          <p className="font-mono text-[10px] text-(--fg-tertiary)">
            module.{selected[1]}
          </p>
          <ModuleDetail label="Source">{selected[2]} binding</ModuleDetail>
          <ModuleDetail label="Manifest">
            Serializable declaration · v1
          </ModuleDetail>
          <ModuleDetail label="Console surfaces">{selected[4]}</ModuleDetail>
          <ModuleDetail label="Authority">
            Module owns business rules; Console renders registered surfaces and
            invokes capability-gated actions.
          </ModuleDetail>
        </aside>
      </div>
    </ProductPage>
  );
}

function ModuleDetail({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section className="mt-5 border-t border-(--line) pt-4">
      <h3 className="mb-2 text-[11px] text-(--fg-tertiary)">{label}</h3>
      <div className="text-[12px] leading-5">{children}</div>
    </section>
  );
}
