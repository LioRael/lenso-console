import { useConsoleLocale } from "@lenso/console-package-api";
import { useMemo, useState } from "react";

import { useSystemInventory } from "../console-data/use-console-product-data";
import {
  FilterButton,
  Inspector,
  InspectorSection,
  ProductPage,
  SplitWorkspace,
  StatusDot,
} from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

export function SystemPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const inventory = useSystemInventory();
  const capabilities = inventory.rows;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () =>
      capabilities.find((item) => item.id === selectedId) ?? capabilities[0],
    [capabilities, selectedId]
  );

  if (!selected) {
    return (
      <ProductPage
        description={copy.system.description}
        title={copy.system.title}
      >
        <div className="py-8 text-[12px] text-(--fg-tertiary)">
          {copy.common.noData}
        </div>
      </ProductPage>
    );
  }

  return (
    <ProductPage
      description={copy.system.description}
      meta={`${capabilities.length} ${copy.system.capabilities.toLowerCase()} · ${inventory.mode === "live" ? copy.common.live : copy.common.demo}`}
      title={copy.system.title}
    >
      <div className="flex h-12 items-center gap-2">
        <FilterButton>{copy.system.kind}</FilterButton>
        <FilterButton>{copy.system.owner}</FilterButton>
        <FilterButton>{copy.system.state}</FilterButton>
      </div>
      <SplitWorkspace
        inspector={
          <Inspector
            status={
              <StatusDot
                label={`${selected.state} · evidence 18s ago`}
                tone={selected.state === "Healthy" ? "success" : "warning"}
              />
            }
            subtitle={selected.id}
            title={selected.name}
          >
            <InspectorSection title={copy.system.execution}>
              <p>{selected.kind}</p>
              <p>Compiled into lenso-api</p>
              <p>Manifest: v7</p>
            </InspectorSection>
            <InspectorSection title={copy.system.boundary}>
              <p>{selected.owner}</p>
              <p>
                {selected.dependencies.length
                  ? selected.dependencies.join(" · ")
                  : "No declared dependencies"}
              </p>
            </InspectorSection>
            <InspectorSection title={copy.system.surfaces}>
              <p>
                {selected.capabilities.length
                  ? selected.capabilities.join(" · ")
                  : "No declared capabilities"}
              </p>
            </InspectorSection>
            <InspectorSection title={copy.system.evidence}>
              <p>{selected.state}</p>
              <p>{inventory.data?.status ?? inventory.mode}</p>
            </InspectorSection>
          </Inspector>
        }
      >
        <header className="flex h-[50px] items-center px-2.5">
          <h2 className="text-[14px] font-medium">
            {copy.system.capabilities}
          </h2>
          <span className="ml-auto text-[11px] text-(--fg-tertiary)">
            {capabilities.length} total
          </span>
        </header>
        <div className="grid h-[38px] grid-cols-[minmax(250px,1fr)_120px_170px_122px] items-center border-b border-(--line) px-2.5 text-[11px] text-(--fg-tertiary)">
          <span>{copy.system.capability}</span>
          <span>{copy.system.kind}</span>
          <span>{copy.system.owner}</span>
          <span>{copy.system.state}</span>
        </div>
        {capabilities.map((item) => (
          <button
            className={`grid h-16 w-full grid-cols-[minmax(250px,1fr)_120px_170px_122px] items-center border-b border-(--line) px-2.5 text-left text-[12px] ${selected.id === item.id ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"}`}
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
            <span>{item.kind}</span>
            <span>{item.owner}</span>
            <StatusDot
              label={item.state}
              tone={item.state === "Healthy" ? "success" : "warning"}
            />
          </button>
        ))}
      </SplitWorkspace>
    </ProductPage>
  );
}
