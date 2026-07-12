import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { m0ServiceSystemResponse } from "../data/m0-service-system-fixture";
import {
  serviceSystemDriftSummary,
  serviceSystemRunbooksSummary,
  serviceSystemReleaseTrainSummary,
  serviceSystemSummary,
} from "./services-model";
import { SystemPlane } from "./services-page";

describe("service system plane", () => {
  it("renders the authoritative M0 topology and compatibility evidence", () => {
    const html = renderToStaticMarkup(
      <SystemPlane
        drift={serviceSystemDriftSummary(undefined)}
        driftError={null}
        error={null}
        loading={false}
        releaseTrain={serviceSystemReleaseTrainSummary(undefined)}
        releaseTrainError={null}
        runbooks={serviceSystemRunbooksSummary(undefined)}
        runbooksError={null}
        system={serviceSystemSummary(m0ServiceSystemResponse)}
      />
    );

    expect(html).toContain("Autonomous Service: support");
    expect(html).toContain("Provider: notification-provider");
    expect(html).toContain("Workload: support-api / owner: support");
    expect(html).toContain("--produces--&gt;");
    expect(html).toContain("--consumes--&gt;");
    expect(html).toContain(
      "breaking: event_contract/notification-events.v1@v2"
    );
    expect(html).toContain("affected: consumer:analytics");
    expect(html).toContain("next: coordinate the analytics consumer upgrade");
  });
});
