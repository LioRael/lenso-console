import { constants } from "node:fs";
import { open } from "node:fs/promises";

import { validateContract, type Contract } from "@lenso/runtime-sdk/schema";
import { z } from "zod";

import {
  isBoundedRuntimeMetadata,
  runtimeCatalogueServiceSchema,
  runtimeInspectionLimits,
  type RuntimeCatalogue,
} from "./client";

const manifestSchema = z.object({
  format: z.literal("lenso-runtime-build-manifest/1"),
  services: z
    .array(
      z.object({
        namespace: z.string(),
        service: z.string(),
        contract: z.unknown(),
      })
    )
    .max(runtimeInspectionLimits.catalogueServices),
});

/** The host selects this file at startup; browser input never supplies a path. */
export async function readRuntimeBuildManifest(
  path: string
): Promise<RuntimeCatalogue["services"]> {
  try {
    // Read at most one byte beyond the bound, even if the file grows after stat.
    // Filesystem open flags are a bitmask; nonblocking avoids waiting on a FIFO.
    // oxlint-disable-next-line no-bitwise
    const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    let source: string;
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > runtimeInspectionLimits.manifestBytes) {
        throw new Error("Invalid Runtime manifest file.");
      }
      const bytes = Buffer.alloc(runtimeInspectionLimits.manifestBytes + 1);
      let length = 0;
      while (length < bytes.length) {
        const read = await file.read(
          bytes,
          length,
          bytes.length - length,
          length
        );
        if (read.bytesRead === 0) {
          break;
        }
        length += read.bytesRead;
      }
      if (length > runtimeInspectionLimits.manifestBytes) {
        throw new Error("Runtime manifest exceeds byte limit.");
      }
      source = new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(0, length)
      );
    } finally {
      await file.close();
    }
    const raw: unknown = JSON.parse(source);
    if (!isBoundedRuntimeMetadata(raw)) {
      throw new Error("Runtime manifest exceeds metadata limits.");
    }
    const manifest = manifestSchema.parse(raw);
    const identities = new Set<string>();
    return manifest.services.map((service) => {
      // Runtime owns the contract vocabulary. Do not reinterpret unknown keywords.
      validateContract(service.contract as Contract);
      const projected = runtimeCatalogueServiceSchema.parse(service);
      const identity = JSON.stringify([
        projected.namespace,
        projected.service,
        projected.contract.version,
      ]);
      if (identities.has(identity)) {
        throw new Error("Duplicate Runtime manifest identity.");
      }
      identities.add(identity);
      return projected;
    });
  } catch {
    // Never forward a filesystem path, malformed schema keyword or raw metadata.
    throw new Error(
      "Runtime build manifest is invalid or exceeds inspection limits."
    );
  }
}
