// Matches lenso-cli's configuration_authority::source_digest_for_bytes(None).
// The Host rejects this precondition if the instance already has configuration.
export async function absentPluginConfigurationDigest(
  packageId: string,
  instance: string
) {
  const chunks = [
    "lenso.plugin-configuration-source.v1",
    packageId,
    instance,
  ].map((value) => {
    const bytes = new TextEncoder().encode(value);
    const chunk = new Uint8Array(8 + bytes.length);
    new DataView(chunk.buffer).setBigUint64(0, BigInt(bytes.length));
    chunk.set(bytes, 8);
    return chunk;
  });
  const input = new Uint8Array(
    chunks.reduce((n, chunk) => n + chunk.length, 1)
  );
  let offset = 0;
  for (const chunk of chunks) {
    input.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = await crypto.subtle.digest("SHA-256", input);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
