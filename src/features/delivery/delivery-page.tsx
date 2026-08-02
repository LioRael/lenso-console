import { Button, useConsoleLocale } from "@lenso/console-ui-internal";
import { useMemo, useState } from "react";

import { useDeliveryEvidence } from "../console-data/use-console-product-data";
import {
  Inspector,
  ProductPage,
  SplitWorkspace,
  StatusDot,
} from "../console-design/components";
import { consoleProductCopy } from "../console-design/copy";

type ReleaseCandidate = {
  gates: string;
  id: string;
  name: string;
  state: string;
  tone: "success" | "warning" | "error" | "neutral";
};

export function DeliveryPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const delivery = useDeliveryEvidence();
  const projection = delivery.current.data;
  const releases = useMemo<ReleaseCandidate[]>(() => {
    const candidates = (delivery.releaseTrain.data?.releases ?? []).map(
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
      !candidates.some(
        (release) => release.id === projection.release?.releaseId
      )
    ) {
      candidates.unshift({
        gates: `${projection.supplyChain.length} / ${projection.deployments.length}`,
        id: projection.release.releaseId,
        name: projection.release.serviceId,
        state: projection.state,
        tone: projection.issues.length ? "warning" : "success",
      });
    }
    return candidates;
  }, [delivery.releaseTrain.data?.releases, projection]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    releases.find((release) => release.id === selectedId) ?? releases[0];
  const gates = buildDeliveryGates(projection, copy.delivery);

  return (
    <ProductPage
      description={copy.delivery.description}
      meta={copy.delivery.authority}
      title={copy.delivery.title}
    >
      <SplitWorkspace
        className="delivery-page__workspace"
        inspector={
          selected ? (
            <Inspector
              className="product-inspector delivery-inspector"
              headerAction={
                <Button
                  disabled={!projection || projection.readOnly}
                  variant="primary"
                >
                  {copy.delivery.handoff}
                </Button>
              }
              subtitle={`${selected.id} · ${projection?.projectionDigest ?? delivery.releaseTrain.data?.status ?? "recorded"}`}
              title={selected.name}
            >
              <div className="delivery-page__divider" />
              <div className="delivery-page__summary">
                <Metric
                  label={copy.delivery.readiness}
                  value={selected.gates}
                />
                <Metric
                  label={copy.delivery.artifacts}
                  value={String(projection?.supplyChain.length ?? 0)}
                />
                <Metric
                  label={copy.delivery.approvals}
                  value={projection?.policy ? "1" : "0"}
                />
                <Metric
                  label={copy.delivery.evidenceAge}
                  value={projection ? "recorded" : "—"}
                />
              </div>
              <div className="delivery-page__divider" />
              <h3 className="delivery-page__readiness-title">
                {copy.delivery.readiness}
              </h3>
              <div className="delivery-page__gates">
                {gates.map((gate) => (
                  <div className="delivery-page__gate" key={gate.label}>
                    <span>{gate.label}</span>
                    <StatusDot
                      label={
                        gate.recorded
                          ? copy.delivery.gateRecorded
                          : copy.delivery.gateNotRecorded
                      }
                      tone={gate.recorded ? "success" : "warning"}
                    />
                  </div>
                ))}
              </div>
              <section className="delivery-page__authority">
                <h3>{copy.delivery.authority}</h3>
                <p>{copy.delivery.handoffDescription}</p>
                <p>{copy.delivery.authorityDescription}</p>
              </section>
            </Inspector>
          ) : (
            <p className="delivery-page__no-data">{copy.delivery.noRelease}</p>
          )
        }
        inspectorWidth={716}
      >
        <section className="delivery-page__candidate-pane">
          <header className="delivery-page__candidate-header">
            <h2>{copy.delivery.candidates}</h2>
            <span>
              {releases.length} {copy.delivery.open}
            </span>
          </header>
          <div className="delivery-page__candidate-rows">
            {releases.map((release) => (
              <button
                aria-pressed={selected?.id === release.id}
                className="delivery-page__candidate"
                data-selected={selected?.id === release.id}
                key={release.id}
                onClick={() => setSelectedId(release.id)}
                type="button"
              >
                <div className="delivery-page__candidate-top">
                  <strong>{release.name}</strong>
                  <span className="delivery-page__candidate-gates">
                    {release.gates} gates
                  </span>
                </div>
                <StatusDot label={release.state} tone={release.tone} />
                <span className="delivery-page__candidate-id">
                  {release.id}
                </span>
              </button>
            ))}
          </div>
        </section>
      </SplitWorkspace>
    </ProductPage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="delivery-page__metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function buildDeliveryGates(
  projection: ReturnType<typeof useDeliveryEvidence>["current"]["data"],
  copy: ReturnType<typeof consoleProductCopy>["delivery"]
) {
  return [
    {
      label: copy.supplyChain,
      recorded: Boolean(projection?.supplyChain.length),
    },
    { label: copy.policy, recorded: Boolean(projection?.policy) },
    {
      label: copy.configuration,
      recorded: Boolean(projection && !projection.configuration.drifted),
    },
    {
      label: copy.deployments,
      recorded: Boolean(projection?.deployments.length),
    },
    {
      label: copy.canary,
      recorded: Boolean(projection?.canaryObservations.length),
    },
    {
      label: copy.issues,
      recorded: Boolean(projection && projection.issues.length === 0),
    },
  ];
}
