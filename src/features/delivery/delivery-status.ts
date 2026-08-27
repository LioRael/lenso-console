export type DeliveryStatus = {
  projectionDigest: string;
  state: string;
  release?: {
    serviceId: string;
    releaseId: string;
    releaseDigest: string;
  } | null;
  supplyChain: unknown[];
  policy?: unknown | null;
  configuration: {
    drifted: boolean;
  };
  deployments: unknown[];
  canaryObservations: unknown[];
  issues: unknown[];
  readOnly: boolean;
};
