import { describe, expect, it } from "vitest";

import {
  EnrollmentContractError,
  enrollmentOfferDigest,
  enrollmentOfferProtocol,
  enrollmentReceiptDigest,
  enrollmentReceiptProtocol,
  parseEnrollmentOffer,
  parseEnrollmentReceipt,
  verifyEnrollmentOffer,
  verifyEnrollmentReceipt,
  type EnrollmentOffer,
  type EnrollmentReceipt,
  type EnrollmentSignature,
} from "./enrollment-contracts";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const emptySignature = (keyId: string): EnrollmentSignature => ({
  algorithm: "ed25519",
  keyId,
  subjectDigest: digest("0"),
  value: "A".repeat(86),
});

describe("System Plane enrollment contracts", () => {
  it("strictly decodes the public Offer and Receipt wire contracts", async () => {
    const offer = offerFixture();
    const receipt = receiptFixture();

    expect(parseEnrollmentOffer(offer)).toEqual(offer);
    await expect(enrollmentOfferDigest(offer)).resolves.toBe(
      "sha256:2785dc552ff44d8b9980a075e02d65a2bd3957f24ab4d68c3f5434de5dabfb2f"
    );
    expect(parseEnrollmentReceipt(receipt)).toEqual(receipt);
    expect(() => parseEnrollmentOffer({ ...offer, unsigned: true })).toThrow(
      EnrollmentContractError
    );
    expect(() =>
      parseEnrollmentReceipt({ ...receipt, authorizationEpoch: -1 })
    ).toThrow(EnrollmentContractError);
  });

  it("verifies a signed bilateral Offer and Receipt without widening authority", async () => {
    const consoleKeys = await keyPair();
    const serviceKeys = await keyPair();
    const offer = offerFixture();
    offer.signature = await sign(
      "console-key-1",
      await enrollmentOfferDigest(offer),
      consoleKeys.privateKey
    );
    const receipt = receiptFixture();
    receipt.offerDigest = await enrollmentOfferDigest(offer);
    receipt.signature = await sign(
      "service-key-1",
      await enrollmentReceiptDigest(receipt),
      serviceKeys.privateKey
    );

    await expect(
      verifyEnrollmentOffer({
        key: { keyId: "console-key-1", publicKey: consoleKeys.publicKey },
        nowUnixMs: 2000,
        offer,
      })
    ).resolves.toBe(receipt.offerDigest);
    await expect(
      verifyEnrollmentReceipt({
        key: { keyId: "service-key-1", publicKey: serviceKeys.publicKey },
        nowUnixMs: 3000,
        offer,
        receipt,
      })
    ).resolves.toBe(await enrollmentReceiptDigest(receipt));
  });

  it("rejects capability widening before trusting a valid signature", async () => {
    const serviceKeys = await keyPair();
    const offer = offerFixture();
    const receipt = receiptFixture();
    receipt.offerDigest = await enrollmentOfferDigest(offer);
    receipt.grantedCapabilities[0]!.featureIds.push("undeclared-feature");
    receipt.signature = await sign(
      "service-key-1",
      await enrollmentReceiptDigest(receipt),
      serviceKeys.privateKey
    );

    await expect(
      verifyEnrollmentReceipt({
        key: { keyId: "service-key-1", publicKey: serviceKeys.publicKey },
        nowUnixMs: 3000,
        offer,
        receipt,
      })
    ).rejects.toMatchObject({ code: "enrollment_receipt_capability_widened" });
  });

  it("rejects a signature that is not bound to the canonical artifact", async () => {
    const consoleKeys = await keyPair();
    const offer = offerFixture();
    offer.signature = await sign(
      "console-key-1",
      digest("f"),
      consoleKeys.privateKey
    );

    await expect(
      verifyEnrollmentOffer({
        key: { keyId: "console-key-1", publicKey: consoleKeys.publicKey },
        nowUnixMs: 2000,
        offer,
      })
    ).rejects.toMatchObject({ code: "enrollment_signature_binding_invalid" });
  });
});

function offerFixture(): EnrollmentOffer {
  return {
    protocol: enrollmentOfferProtocol,
    systemId: "customer-support",
    consoleServicePrincipal: "service:console",
    nonce: "nonce-0123456789abcdef",
    issuedAtUnixMs: 1000,
    expiresAtUnixMs: 20_000,
    requestedCapabilities: [
      {
        contractId: "lenso.system-plane.runtime-observability.v1",
        schemaDigest: digest("a"),
        featureIds: ["queue-summary"],
      },
    ],
    requestedPolicy: {
      policyId: "support-system-plane",
      policyRevision: "revision:1",
      policyDigest: digest("b"),
    },
    signature: emptySignature("console-key-1"),
  };
}

function receiptFixture(): EnrollmentReceipt {
  const offer = offerFixture();
  return {
    protocol: enrollmentReceiptProtocol,
    offerDigest: digest("c"),
    systemId: offer.systemId,
    managedServiceId: "support",
    managedServicePrincipal: "service:support",
    managedServiceRevision: "release:sha256:0123456789abcdef",
    consoleServicePrincipal: offer.consoleServicePrincipal,
    nonce: offer.nonce,
    issuedAtUnixMs: 2000,
    expiresAtUnixMs: 18_000,
    grantRevision: 1,
    authorizationEpoch: 4,
    grantedCapabilities: structuredClone(offer.requestedCapabilities),
    grantedPolicy: structuredClone(offer.requestedPolicy),
    signature: emptySignature("service-key-1"),
  };
}

async function keyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: Uint8Array;
}> {
  const keys = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    privateKey: keys.privateKey,
    publicKey: new Uint8Array(
      await crypto.subtle.exportKey("raw", keys.publicKey)
    ),
  };
}

async function sign(
  keyId: string,
  subjectDigest: string,
  privateKey: CryptoKey
): Promise<EnrollmentSignature> {
  const value = new Uint8Array(
    await crypto.subtle.sign(
      "Ed25519",
      privateKey,
      new TextEncoder().encode(subjectDigest)
    )
  );
  return {
    algorithm: "ed25519",
    keyId,
    subjectDigest,
    value: base64Url(value),
  };
}

function base64Url(value: Uint8Array): string {
  return btoa(String.fromCodePoint(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
