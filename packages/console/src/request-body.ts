/** Bound request memory and unblock a pending stream read when its owner aborts. */
export async function readRequestBytes(
  request: Request,
  maxBytes: number,
  oversized: () => Error
): Promise<Uint8Array<ArrayBuffer>> {
  request.signal.throwIfAborted();
  if (!request.body) {
    return new Uint8Array();
  }
  const reader = request.body.getReader();
  const abort = async () => {
    try {
      await reader.cancel(request.signal.reason);
    } catch {
      // Cancellation rejection is not the public reason; the pending read rethrows signal.reason.
    }
  };
  request.signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { done, value } = await reader.read();
      request.signal.throwIfAborted();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw oversized();
      }
      chunks.push(value);
    }
  } finally {
    request.signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
