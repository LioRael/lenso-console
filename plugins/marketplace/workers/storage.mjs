// Private Marketplace adapter. Signature/trust policy runs only in Rust.
const MAX_ENVELOPE = 4 * 1024 * 1024;
const MAX_STATE = 12 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

async function readObject(bucket, key, limit, signal, existing) {
  if (!existing) signal.throwIfAborted();
  const object = existing ?? await bucket.get(key);
  if (!object?.body) throw new Error('catalog object missing');
  const reader = object.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    if (object.size > limit) throw new Error('catalog object exceeds limit');
    const parts = [];
    let size = 0;
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('catalog object exceeds limit');
      parts.push(value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return decoder.decode(bytes);
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function digest(bytes) {
  return 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

// D1 calls always use the primary binding, never replica sessions. Each closure
// belongs to one fetch. Reset fences callbacks; bounded owner cleanup may report
// unconfirmed settlement because D1/R2 operations cannot be forcibly rolled back.
export function createStorage(database, bucket, signal) {
  if (!database?.prepare || !bucket?.get || !bucket?.put) throw new Error('Marketplace bindings missing');
  return async (operation, json) => {
    signal.throwIfAborted();
    const input = JSON.parse(json);
    const catalog = input.catalog;
    if (typeof catalog !== 'string' || catalog.length < 1 || catalog.length > 128) throw new Error('invalid catalog binding');
    let result;
    if (operation === 'published') {
      const row = await database.prepare('SELECT object_key,digest FROM marketplace_publications WHERE catalog_id=?').bind(catalog).first();
      if (!row) return 'null';
      const envelope = await readObject(bucket, row.object_key, MAX_ENVELOPE, signal);
      if (await digest(encoder.encode(envelope)) !== row.digest) throw new Error('published object integrity failure');
      result = envelope;
    } else if (operation === 'accepted') {
      const row = await database.prepare('SELECT token,object_key FROM marketplace_accepted WHERE catalog_id=?').bind(catalog).first();
      if (!row) return 'null';
      const raw = await readObject(bucket, row.object_key, MAX_STATE, signal);
      const expectedKey = `accepted/${encodeURIComponent(catalog)}/${(await digest(encoder.encode(raw))).slice(7)}.json`;
      if (row.object_key !== expectedKey) throw new Error('accepted checkpoint integrity failure');
      const stored = JSON.parse(raw);
      if (stored.token !== row.token || await digest(encoder.encode(stored.envelope)) !== row.token) throw new Error('accepted pointer mismatch');
      result = stored;
    } else if (operation === 'compare_exchange') {
      const { expected, value } = input;
      const bytes = encoder.encode(value.envelope);
      if (bytes.byteLength > MAX_ENVELOPE || await digest(bytes) !== value.token) throw new Error('invalid accepted content token');
      const stored = JSON.stringify(value);
      if (encoder.encode(stored).byteLength > MAX_STATE) throw new Error('accepted state exceeds bound');
      // Include all checkpoint bytes in the immutable key, not only envelope.
      const key = `accepted/${encodeURIComponent(catalog)}/${(await digest(encoder.encode(stored))).slice(7)}.json`;
      // Reuse verified immutable content without resending a large rejected PUT.
      // A missing-object race still uses create-only conditions, never overwrite.
      const existing = await bucket.get(key);
      if (existing) {
        if (await readObject(bucket, key, MAX_STATE, signal, existing) !== stored) throw new Error('immutable accepted object conflict');
      } else {
        signal.throwIfAborted();
        let written;
        try { written = await bucket.put(key, stored, { onlyIf: { etagDoesNotMatch: '*' } }); }
        catch (error) { throw new Error(`accepted object create failed: ${error}`); }
        if (!written && await readObject(bucket, key, MAX_STATE, signal) !== stored) throw new Error('immutable accepted object conflict');
      }
      signal.throwIfAborted();
      const statement = expected === null
        ? database.prepare('INSERT INTO marketplace_accepted(catalog_id,token,object_key) VALUES(?,?,?) ON CONFLICT(catalog_id) DO NOTHING').bind(catalog, value.token, key)
        : database.prepare('UPDATE marketplace_accepted SET token=?,object_key=? WHERE catalog_id=? AND token=?').bind(value.token, key, catalog, expected);
      let receipt;
      try { receipt = await statement.run(); }
      catch (error) { throw new Error(`accepted pointer compare-and-swap failed: ${error}`); }
      if (!receipt.success) throw new Error('accepted pointer write failed');
      result = receipt.meta.changes === 1;
    } else {
      throw new Error('unknown Marketplace storage operation');
    }
    signal.throwIfAborted();
    return JSON.stringify(result);
  };
}
