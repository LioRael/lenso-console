import { resolveHostConfiguration } from "./configuration";
import { createHost } from "./host";

export const host = await createHost(
  await resolveHostConfiguration(import.meta.dir)
);
export default host.app;
