import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (filePath) => readFile(path.join(root, filePath), "utf-8");

describe("Console Service delivery", () => {
  test("builds one non-root image containing every Console workload", async () => {
    const dockerfile = await read("Dockerfile");

    expect(dockerfile).toContain("RUN pnpm service:web-build");
    expect(dockerfile).toContain("cargo build --locked --release");
    expect(dockerfile).toContain("id=lenso-console-cargo-registry");
    expect(dockerfile).toContain("id=lenso-console-service-target");
    expect(dockerfile).toContain("/workspace/service-bin/");
    expect(dockerfile).toContain(
      "COPY packages/console-system-plane/migrations ./packages/console-system-plane/migrations"
    );
    expect(dockerfile).toContain("lenso-console-api /usr/local/bin/");
    expect(dockerfile).toContain("lenso-console-migrate /usr/local/bin/");
    expect(dockerfile).toContain("lenso-console-serve /usr/local/bin/");
    expect(dockerfile).toContain("lenso-console-worker /usr/local/bin/");
    expect(dockerfile).toContain("CONSOLE_WEB_ROOT=/opt/lenso-console/web");
    expect(dockerfile).toContain("USER 10001:10001");
    expect(dockerfile).toContain("org.opencontainers.image.version");
    expect(dockerfile).toContain("org.opencontainers.image.revision");
  });

  test("runs migration before the disposable Console workload", async () => {
    const compose = await read("service/compose.yml");
    const serve = await read("service/src/bin/serve.rs");
    const worker = await read("service/src/bin/worker.rs");

    expect(compose).toContain(
      'command: ["/usr/local/bin/lenso-console-migrate"]'
    );
    expect(compose).toContain("condition: service_completed_successfully");
    expect(compose.match(/read_only: true/gu)).toHaveLength(2);
    expect(compose.match(/- ALL/gu)).toHaveLength(2);
    expect(compose).toContain("console-database:/var/lib/postgresql");
    expect(compose).toContain(
      `CONSOLE_RECOVERY_MODE: \${CONSOLE_RECOVERY_MODE:?set CONSOLE_RECOVERY_MODE}`
    );
    expect(serve).toContain("ConsoleRecoveryMode::Restore");
    expect(serve).toContain("run_api_from_env_with_composition");
    expect(worker).toContain("require_background_work_allowed");
  });

  test("has no hosted frontend archive publisher", async () => {
    const packageJson = JSON.parse(await read("package.json"));

    expect(packageJson.scripts["package:hosted-console"]).toBeUndefined();
    await expect(
      access(path.join(root, "scripts/package-hosted-console.mjs"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      access(path.join(root, ".github/workflows/publish-hosted-console.yml"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("defines the attested OCI release manifest contract", async () => {
    const schema = JSON.parse(
      await read("service/release-manifest.schema.json")
    );

    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.schema.const).toBe(
      "lenso.console-service-release.v1"
    );
    expect(schema.required).toEqual([
      "schema",
      "releaseId",
      "version",
      "sourceCommit",
      "image",
      "compositionDigest",
      "schemaDigest",
      "contractDigest",
      "configurationDigest",
      "compatibleFromSchemaDigests",
      "irreversibleMigrations",
    ]);
    expect(schema.properties.image.additionalProperties).toBe(false);
    expect(schema.properties.image.required).toEqual(["reference", "digest"]);
    expect(schema.properties.image.properties.reference.pattern).toBe(
      "@sha256:[a-f0-9]{64}$"
    );
    expect(schema.$defs.digest.pattern).toBe("^sha256:[a-f0-9]{64}$");
  });

  test("defines a fail-closed encrypted Recovery Set contract", async () => {
    const schema = JSON.parse(await read("service/recovery-set.schema.json"));
    const releaseInputs = JSON.parse(await read("service/release-inputs.json"));

    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.schema.const).toBe(
      "lenso.console-recovery-set.v1"
    );
    expect(schema.properties.store.additionalProperties).toBe(false);
    expect(schema.properties.store.properties.format.const).toBe(
      "postgresql-custom"
    );
    expect(schema.properties.store.properties.encrypted.const).toBe(true);
    expect(schema.properties.store.properties.encryption.const).toBe("age-v1");
    expect(schema.properties.store.properties.excludedData.const).toEqual([
      "auth.sessions",
    ]);
    expect(schema.properties.secretReferences.const).toEqual([
      "CONSOLE_DATABASE_URL",
    ]);
    expect(schema.properties.restorePreconditions.const).toContain(
      "outbound_mutations_disabled"
    );
    expect(schema.$defs.digest.pattern).toBe("^sha256:[a-f0-9]{64}$");
    expect(releaseInputs.groups.contract).toContain(
      "service/recovery-set.schema.json"
    );
  });

  test("defines content-addressed recovery reconciliation contracts", async () => {
    const input = JSON.parse(
      await read("service/reconciliation-input.schema.json")
    );
    const evidence = JSON.parse(
      await read("service/reconciliation-evidence.schema.json")
    );
    const releaseInputs = JSON.parse(await read("service/release-inputs.json"));

    expect(input.additionalProperties).toBe(false);
    expect(input.properties.schema.const).toBe(
      "lenso.console-reconciliation-input.v1"
    );
    expect(input.properties.singleAuthoritativeDeployment.const).toBe(true);
    expect(input.properties.identityAndEnrollmentContinuityVerified.const).toBe(
      true
    );
    expect(input.properties.outboxReconciled.const).toBe(true);
    expect(evidence.additionalProperties).toBe(false);
    expect(evidence.properties.schema.const).toBe(
      "lenso.console-reconciliation-evidence.v1"
    );
    expect(evidence.properties.store.$ref).toBe("#/$defs/storeObservation");
    expect(evidence.properties.singleAuthoritativeDeployment.const).toBe(true);
    expect(
      evidence.$defs.storeObservation.properties.staleSessionCount.const
    ).toBe(0);
    expect(
      evidence.$defs.storeObservation.properties.outboxSnapshotDigest.$ref
    ).toBe("#/$defs/digest");
    expect(releaseInputs.groups.contract).toContain(
      "service/reconciliation-input.schema.json"
    );
    expect(releaseInputs.groups.contract).toContain(
      "service/reconciliation-evidence.schema.json"
    );
  });

  test("defines content-addressed recovery activation evidence", async () => {
    const evidence = JSON.parse(
      await read("service/activation-evidence.schema.json")
    );
    const releaseInputs = JSON.parse(await read("service/release-inputs.json"));

    expect(evidence.additionalProperties).toBe(false);
    expect(evidence.properties.schema.const).toBe(
      "lenso.console-activation-evidence.v1"
    );
    expect(evidence.properties.authorityTransferApproved.const).toBe(true);
    expect(evidence.properties.workloadMode.const).toBe("normal");
    expect(evidence.$defs.authorityProbe.properties.serviceId.const).toBe(
      "lenso-console"
    );
    expect(evidence.$defs.authorityProbe.properties.workloadMode.const).toBe(
      "normal"
    );
    expect(evidence.required).toContain("authorityProbeDigest");
    expect(evidence.properties.activationPlanDigest.$ref).toBe(
      "#/$defs/digest"
    );
    expect(releaseInputs.groups.contract).toContain(
      "service/activation-evidence.schema.json"
    );
  });

  test("defines activation recovery and re-reconciliation evidence", async () => {
    const intervention = JSON.parse(
      await read("service/activation-recovery-evidence.schema.json")
    );
    const reconciliation = JSON.parse(
      await read("service/reconciliation-evidence.schema.json")
    );
    const releaseInputs = JSON.parse(await read("service/release-inputs.json"));

    expect(intervention.additionalProperties).toBe(false);
    expect(intervention.properties.schema.const).toBe(
      "lenso.console-activation-recovery-evidence.v1"
    );
    expect(intervention.properties.recoveryModeRestored.const).toBe(true);
    expect(intervention.properties.workloadMode.const).toBe("restore");
    expect(
      intervention.$defs.authorityProbe.properties.workloadMode.const
    ).toBe("restore");
    expect(intervention.required).toContain("authorityProbeDigest");
    expect(intervention.properties.priorStatus.enum).toEqual([
      "activating",
      "activation_failed",
      "recovering_activation",
      "activation_recovery_failed",
    ]);
    expect(intervention.properties.store.$ref).toBe("#/$defs/storeObservation");
    expect(
      reconciliation.properties.activationRecoveryEvidenceDigest.$ref
    ).toBe("#/$defs/digest");
    expect(releaseInputs.groups.contract).toContain(
      "service/activation-recovery-evidence.schema.json"
    );
  });

  test("runs an isolated destructive recovery drill in CI", async () => {
    const packageJson = JSON.parse(await read("package.json"));
    const workflow = await read(".github/workflows/ci.yml");
    const drill = await read("scripts/console-service-recovery-smoke.sh");
    const resultSchema = JSON.parse(
      await read("service/recovery-drill-result.schema.json")
    );
    const releaseInputs = JSON.parse(await read("service/release-inputs.json"));

    expect(packageJson.scripts["service:recovery:smoke"]).toBe(
      "sh scripts/console-service-recovery-smoke.sh"
    );
    expect(workflow).toContain("Run Console Service recovery drill");
    expect(workflow).toContain('LENSO_CONSOLE_SKIP_BUILD: "1"');
    expect(drill).toContain("--exclude-table-data=auth.sessions");
    expect(drill).toContain("--format=custom");
    expect(drill).toContain("--volumes --remove-orphans");
    expect(drill).toContain("post_activation_drift_observed");
    expect(drill).toContain("recovery_fence_reestablished");
    expect(resultSchema.additionalProperties).toBe(false);
    expect(resultSchema.properties.schema.const).toBe(
      "lenso.console-recovery-drill.v1"
    );
    expect(drill).toContain("lenso.console-service-composition.v2");
    expect(drill).toContain("refenced_restore_mode_reported");
    expect(drill).toContain("lenso.console-authority.v1");
    expect(drill).toContain("refenced_restore_authority_reported");
    expect(resultSchema.properties.checks.minItems).toBe(16);
    expect(releaseInputs.groups.contract).toContain(
      "service/recovery-drill-result.schema.json"
    );
  });

  test("keeps release candidates unsigned and coordinator-only", async () => {
    const workflow = await read(
      ".github/workflows/build-console-service-release.yml"
    );

    expect(workflow).toContain("workflow_call:");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/attest|id-token:\s*write|packages:\s*write/u);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("scripts/build-console-release-artifacts.mjs");
    expect(workflow).toContain("oci:lenso-console-service");
  });

  test("joins the reviewed composite OCI publisher", async () => {
    const packageJson = JSON.parse(await read("package.json"));
    const config = JSON.parse(await read(".lenso-release/config.json"));
    const builder = await read("scripts/build-console-release-artifacts.mjs");

    expect(packageJson.scripts["release:artifacts"]).toBe(
      "node scripts/build-console-release-artifacts.mjs"
    );
    expect(config.aliases).toEqual({
      "oci:lenso-console-service": "npm:@lenso/console",
    });
    expect(config.ociImages["oci:lenso-console-service"]).toEqual({
      archivePath: ".artifacts/lenso-console-service.oci.tar",
      installManifestPath: ".artifacts/lenso-console-release.json",
      registryRepository: "liorael/lenso-console",
    });
    expect(builder).toContain('"--platform",\n        "linux/amd64"');
    expect(builder).toContain('"--provenance=false"');
    expect(builder).toContain('"--sbom=false"');
  });
});
