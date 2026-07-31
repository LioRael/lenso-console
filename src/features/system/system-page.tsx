import { useMemo, useState } from "react";

import {
  FilterButton,
  Inspector,
  InspectorSection,
  ProductPage,
  SplitWorkspace,
  StatusDot,
} from "../console-design/components";

type Capability = {
  id: string;
  kind: string;
  name: string;
  owner: string;
  state: "Healthy" | "Degraded";
};

const capabilities: Capability[] = [
  {
    id: "module.auth",
    kind: "Linked module",
    name: "Auth",
    owner: "Identity",
    state: "Healthy",
  },
  {
    id: "svc.billing-sync",
    kind: "Service",
    name: "Billing sync",
    owner: "Revenue",
    state: "Healthy",
  },
  {
    id: "svc.customer-index",
    kind: "Service",
    name: "Customer index",
    owner: "Search",
    state: "Degraded",
  },
  {
    id: "svc.runtime-admin",
    kind: "Platform",
    name: "Runtime admin",
    owner: "Core",
    state: "Healthy",
  },
  {
    id: "svc.outbox-relay",
    kind: "Worker",
    name: "Outbox relay",
    owner: "Core",
    state: "Healthy",
  },
  {
    id: "svc.audit-evidence",
    kind: "Platform",
    name: "Audit evidence",
    owner: "Security",
    state: "Healthy",
  },
];

export function SystemPage() {
  const [selectedId, setSelectedId] = useState(capabilities[0]!.id);
  const selected = useMemo(
    () =>
      capabilities.find((item) => item.id === selectedId) ?? capabilities[0]!,
    [selectedId]
  );

  return (
    <ProductPage
      description="Inventory, ownership boundaries, and the runtime evidence behind each capability."
      meta="18 capabilities · 12 services"
      title="System Inventory"
    >
      <div className="flex h-12 items-center gap-2">
        <FilterButton>All kinds</FilterButton>
        <FilterButton>All owners</FilterButton>
        <FilterButton>Healthy + degraded</FilterButton>
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
            <InspectorSection title="Execution source">
              <p>{selected.kind}</p>
              <p>Compiled into lenso-api</p>
              <p>Manifest: v7</p>
            </InspectorSection>
            <InspectorSection title="Ownership boundary">
              <p>{selected.owner} owns state and effects</p>
              <p>Other modules read stable references only</p>
              <p>No cross-module imports</p>
            </InspectorSection>
            <InspectorSection title="Console surfaces">
              <p>Schema records · read only</p>
              <p>Protected actions · approval required</p>
              <p>Configuration · planned operation</p>
            </InspectorSection>
            <InspectorSection title="Runtime evidence">
              <p>API 3 / 3 healthy</p>
              <p>Worker 2 / 2 healthy</p>
              <p>Outbox lag 18 ms</p>
            </InspectorSection>
          </Inspector>
        }
      >
        <header className="flex h-[50px] items-center px-2.5">
          <h2 className="text-[14px] font-medium">Capabilities</h2>
          <span className="ml-auto text-[11px] text-(--fg-tertiary)">
            18 total
          </span>
        </header>
        <div className="grid h-[38px] grid-cols-[minmax(250px,1fr)_120px_170px_122px] items-center border-b border-(--line) px-2.5 text-[11px] text-(--fg-tertiary)">
          <span>Capability</span>
          <span>Kind</span>
          <span>Owner</span>
          <span>State</span>
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
