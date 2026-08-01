import { useConsoleLocale } from "@lenso/console-package-api";
import { useState } from "react";

import { useModuleRegistry } from "../console-data/use-console-product-data";
import { ProductPage, StatusDot } from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

export function ModulesPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const registry = useModuleRegistry();
  const modules = registry.rows;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    modules.find((module) => module.id === selectedId) ?? modules[0];
  return (
    <ProductPage
      description={copy.modules.description}
      meta={`${modules.length} registered · ${modules.filter((module) => module.state === "loaded").length} loaded · ${registry.mode === "live" ? copy.common.live : copy.common.demo}`}
      title={copy.modules.title}
    >
      <div className="grid min-h-[744px] grid-cols-[minmax(0,1fr)_376px] border-t border-(--line)">
        <section className="border-r border-(--line) pr-7">
          <header className="flex h-[58px] items-center px-2.5">
            <h2 className="text-[14px] font-medium">{copy.modules.registry}</h2>
            <span className="ml-auto text-[11px] text-(--fg-tertiary)">
              manifest declarations
            </span>
          </header>
          <div className="grid h-10 grid-cols-[minmax(180px,1fr)_120px_120px_160px] items-center border-b border-(--line) px-2.5 text-[11px] text-(--fg-tertiary)">
            <span>{copy.modules.module}</span>
            <span>{copy.modules.source}</span>
            <span>{copy.modules.state}</span>
            <span>{copy.modules.surfaces}</span>
          </div>
          {modules.map((item) => (
            <button
              className={`grid h-[68px] w-full grid-cols-[minmax(180px,1fr)_120px_120px_160px] items-center border-b border-(--line) px-2.5 text-left text-[12px] ${selected?.id === item.id ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"}`}
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              type="button"
            >
              <span>
                <strong className="block font-medium">{item.name}</strong>
                <span className="font-mono text-[10px] text-(--fg-tertiary)">
                  {item.id}
                </span>
              </span>
              <span>{item.source}</span>
              <StatusDot
                label={item.state}
                tone={item.state === "loaded" ? "success" : "error"}
              />
              <span className="truncate text-(--fg-secondary)">
                {item.surfaces.map((surface) => surface.label).join(" · ") ||
                  "—"}
              </span>
            </button>
          ))}
        </section>
        <aside className="px-7 pt-7">
          {selected ? (
            <>
              <h2 className="text-[18px] font-semibold">{selected.name}</h2>
              <p className="font-mono text-[10px] text-(--fg-tertiary)">
                module.{selected.id}
              </p>
              <ModuleDetail label={copy.modules.source}>
                {selected.source}
              </ModuleDetail>
              <ModuleDetail label={copy.modules.manifest}>
                Serializable declaration · v1
              </ModuleDetail>
              <ModuleDetail label={copy.modules.surfaces}>
                {selected.surfaces
                  .map((surface) => `${surface.label} · ${surface.route}`)
                  .join("\n") || "—"}
              </ModuleDetail>
              <ModuleDetail label={copy.modules.authority}>
                Module owns business rules; Console renders registered surfaces
                and invokes capability-gated actions.
              </ModuleDetail>
            </>
          ) : (
            <p className="text-[12px] text-(--fg-tertiary)">
              {copy.common.noData}
            </p>
          )}
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
