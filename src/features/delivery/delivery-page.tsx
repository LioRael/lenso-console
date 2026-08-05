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

const demoDeliveryPreview = {
  metrics: {
    approvals: "2",
    artifacts: "8",
    evidenceAge: "31s",
    subtitle: "commit 6e41d3a",
  },
  releases: [
    {
      gates: "12 / 12",
      id: "rel_01J7V4",
      name: "lenso 0.3.35",
      status: "ready",
    },
    {
      gates: "9 / 11",
      id: "rel_01J7V1",
      name: "console 0.8.0",
      status: "needs_attention",
    },
    {
      gates: "4 / 10",
      id: "rel_01J7UZ",
      name: "billing-sync 1.8.3",
      status: "draft",
    },
    {
      gates: "12 / 12",
      id: "rel_01J7PX",
      name: "lenso 0.3.34",
      status: "applied",
    },
  ],
} as const;

export function DeliveryPage() {
  const { locale } = useConsoleLocale();
  const copy = consoleProductCopy(locale);
  const delivery = useDeliveryEvidence();
  const projection = delivery.current.data;
  const isDemoPreview = delivery.mode === "demo" && !projection;
  const releases = useMemo<ReleaseCandidate[]>(() => {
    if (isDemoPreview) {
      return demoDeliveryPreview.releases.map((release) =>
        releaseCandidate(release, copy.delivery)
      );
    }

    const candidates = (delivery.releaseTrain.data?.releases ?? []).map(
      (release) =>
        releaseCandidate(
          {
            gates: `${release.services} / ${release.modules}`,
            id: release.id,
            name: `${release.systemName} · ${release.environment}`,
            status: release.status,
          },
          copy.delivery
        )
    );
    if (
      projection?.release &&
      !candidates.some(
        (release) => release.id === projection.release?.releaseId
      )
    ) {
      candidates.unshift(
        releaseCandidate(
          {
            gates: `${projection.supplyChain.length} / ${projection.deployments.length}`,
            id: projection.release.releaseId,
            name: projection.release.serviceId,
            status: projection.state,
          },
          copy.delivery
        )
      );
    }
    return candidates;
  }, [
    copy.delivery,
    delivery.releaseTrain.data?.releases,
    isDemoPreview,
    projection,
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    releases.find((release) => release.id === selectedId) ?? releases[0];
  const gates = buildDeliveryGates(projection, copy.delivery, isDemoPreview);
  const metrics = isDemoPreview ? demoDeliveryPreview.metrics : undefined;

  return (
    <ProductPage
      description={copy.delivery.description}
      meta={copy.delivery.authority}
      pageClassName="delivery-page"
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
                  disabled={projection ? projection.readOnly : !isDemoPreview}
                  variant="primary"
                >
                  {copy.delivery.handoff}
                </Button>
              }
              subtitle={`${selected.id} · ${projection?.projectionDigest ?? metrics?.subtitle ?? delivery.releaseTrain.data?.status ?? "recorded"}`}
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
                  value={String(
                    projection?.supplyChain.length ?? metrics?.artifacts ?? 0
                  )}
                />
                <Metric
                  label={copy.delivery.approvals}
                  value={projection?.policy ? "1" : (metrics?.approvals ?? "0")}
                />
                <Metric
                  label={copy.delivery.evidenceAge}
                  value={
                    projection ? "recorded" : (metrics?.evidenceAge ?? "—")
                  }
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
                        gate.status ??
                        (gate.recorded
                          ? copy.delivery.gateRecorded
                          : copy.delivery.gateNotRecorded)
                      }
                      tone={gate.recorded ? "success" : "warning"}
                    />
                  </div>
                ))}
              </div>
              <section className="delivery-page__authority">
                <h3>{copy.delivery.handoffTitle}</h3>
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
  copy: ReturnType<typeof consoleProductCopy>["delivery"],
  demoPreview = false
) {
  return [
    {
      label: copy.contracts,
      recorded: demoPreview || Boolean(projection?.supplyChain.length),
    },
    {
      label: copy.workspaceQuality,
      recorded: demoPreview || Boolean(projection?.policy),
    },
    {
      label: copy.cargoInstall,
      recorded:
        demoPreview || Boolean(projection && !projection.configuration.drifted),
    },
    {
      label: copy.npmInstall,
      recorded: demoPreview || Boolean(projection?.deployments.length),
    },
    {
      label: copy.publishedAcceptance,
      recorded: demoPreview || Boolean(projection?.canaryObservations.length),
    },
    {
      label: copy.reviewedPlan,
      recorded:
        demoPreview || Boolean(projection && projection.issues.length === 0),
      status: demoPreview ? copy.planApproved : undefined,
    },
  ];
}

function releaseCandidate(
  release: {
    gates: string;
    id: string;
    name: string;
    status: string;
  },
  copy: ReturnType<typeof consoleProductCopy>["delivery"]
): ReleaseCandidate {
  return {
    gates: release.gates,
    id: release.id,
    name: release.name,
    state: releaseStateLabel(release.status, copy),
    tone: releaseTone(release.status),
  };
}

function releaseStateLabel(
  status: string,
  copy: ReturnType<typeof consoleProductCopy>["delivery"]
) {
  switch (status.toLowerCase().replaceAll("-", "_")) {
    case "ready":
    case "approved": {
      return copy.readyForHandoff;
    }
    case "needs_attention":
    case "blocked": {
      return copy.evidencePending;
    }
    case "draft": {
      return copy.draft;
    }
    case "applied":
    case "verified": {
      return copy.verified;
    }
    default: {
      return status;
    }
  }
}

function releaseTone(
  status: string
): "success" | "warning" | "error" | "neutral" {
  switch (status.toLowerCase().replaceAll("-", "_")) {
    case "ready":
    case "approved":
    case "applied":
    case "verified": {
      return "success";
    }
    case "needs_attention":
    case "blocked": {
      return "warning";
    }
    case "failed":
    case "error": {
      return "error";
    }
    default: {
      return "neutral";
    }
  }
}
