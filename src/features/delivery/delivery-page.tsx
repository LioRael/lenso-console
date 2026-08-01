import { useConsoleLocale } from "@lenso/console-package-api";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { useDeliveryEvidence } from "../console-data/use-console-product-data";
import { ProductPage, StatusDot } from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

export function DeliveryPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const delivery = useDeliveryEvidence();
  const projection = delivery.current.data;
  const releases = (delivery.releaseTrain.data?.releases ?? []).map(
    (release) => ({
      gates: `${release.services} / ${release.modules}`,
      id: release.id,
      name: `${release.systemName} · ${release.environment}`,
      state: release.status,
      tone:
        release.status === "ready" || release.status === "applied"
          ? ("success" as const)
          : ("warning" as const),
    })
  );
  if (
    projection?.release &&
    !releases.some((release) => release.id === projection.release?.releaseId)
  ) {
    releases.unshift({
      gates: `${projection.supplyChain.length} / ${projection.deployments.length}`,
      id: projection.release.releaseId,
      name: projection.release.serviceId,
      state: projection.state,
      tone: projection.issues.length ? "warning" : "success",
    });
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    releases.find((release) => release.id === selectedId) ?? releases[0];
  const gates = projection
    ? ([
        ["Supply-chain evidence", projection.supplyChain.length > 0],
        ["Policy evidence", Boolean(projection.policy)],
        ["Configuration converged", !projection.configuration.drifted],
        ["Deployments observed", projection.deployments.length > 0],
        ["Canary observations", projection.canaryObservations.length > 0],
        ["No unresolved issues", projection.issues.length === 0],
      ] as const)
    : [];
  return (
    <ProductPage
      description={copy.delivery.description}
      meta={`${copy.delivery.authority} · ${delivery.mode === "live" ? copy.common.live : copy.common.demo}`}
      title={copy.delivery.title}
    >
      <div className="grid min-h-[744px] grid-cols-[420px_minmax(0,1fr)]">
        <section className="border-r border-(--line) pr-6 pt-2">
          <header className="flex h-[58px] items-center px-2.5">
            <h2 className="text-[14px] font-medium">
              {copy.delivery.candidates}
            </h2>
            <span className="ml-auto text-[11px] text-(--fg-tertiary)">
              {releases.length} open
            </span>
          </header>
          {releases.map((release) => (
            <button
              className={`grid min-h-[111px] w-full grid-cols-[minmax(0,1fr)_auto] border-b border-(--line) px-2.5 py-4 text-left ${selected?.id === release.id ? "bg-(--bg-row-hover)" : "hover:bg-(--bg-row-hover)"}`}
              key={release.id}
              onClick={() => setSelectedId(release.id)}
              type="button"
            >
              <span>
                <strong className="text-[13px] font-medium">
                  {release.name}
                </strong>
                <span className="mt-2 block">
                  <StatusDot label={release.state} tone={release.tone} />
                </span>
                <span className="mt-1 block font-mono text-[10px] text-(--fg-tertiary)">
                  {release.id}
                </span>
              </span>
              <span className="font-mono text-[10px]">
                {release.gates} gates
              </span>
            </button>
          ))}
        </section>
        <article className="pl-7 pt-7">
          {selected ? (
            <>
              <header className="flex items-start border-b border-(--line) pb-6">
                <div>
                  <h2 className="text-[18px] font-semibold">{selected.name}</h2>
                  <p className="mt-1 font-mono text-[10px] text-(--fg-tertiary)">
                    {selected.id} ·{" "}
                    {projection?.projectionDigest ??
                      delivery.releaseTrain.data?.status ??
                      "recorded"}
                  </p>
                </div>
                <Button
                  className="ml-auto"
                  disabled={!projection || projection.readOnly}
                  variant="primary"
                >
                  {copy.delivery.handoff}
                </Button>
              </header>
              <div className="grid h-[70px] grid-cols-4 border-b border-(--line)">
                <Metric label="Readiness" value={selected.gates} />
                <Metric
                  label="Artifacts"
                  value={String(projection?.supplyChain.length ?? 0)}
                />
                <Metric
                  label="Deployments"
                  value={String(projection?.deployments.length ?? 0)}
                />
                <Metric
                  label="Issues"
                  value={String(projection?.issues.length ?? 0)}
                />
              </div>
              <h3 className="py-3 text-[11px] text-(--fg-tertiary)">
                {copy.delivery.readiness}
              </h3>
              {gates.map(([gate, passed]) => (
                <div
                  className="flex h-12 items-center border-b border-(--line) text-[12px]"
                  key={gate}
                >
                  <span>{gate}</span>
                  <span className="ml-auto">
                    <StatusDot
                      label={passed ? "Passed" : "Missing"}
                      tone={passed ? "success" : "warning"}
                    />
                  </span>
                </div>
              ))}
              <section className="pt-4 text-[12px] leading-6">
                <h3 className="text-[11px] text-(--fg-tertiary)">
                  Authority handoff
                </h3>
                <p>
                  Console packages the reviewed plan, receipts, and verification
                  contract.
                </p>
                <p>
                  A separate release authority decides and executes the
                  production release.
                </p>
              </section>
            </>
          ) : (
            <p className="text-[12px] text-(--fg-tertiary)">
              {copy.delivery.noRelease}
            </p>
          )}
        </article>
      </div>
    </ProductPage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="pt-3">
      <strong className="block text-[15px] font-medium">{value}</strong>
      <span className="text-[10px] text-(--fg-tertiary)">{label}</span>
    </div>
  );
}
