import { initSync, __wbg_reset_state, handle_http } from './pkg/lenso_marketplace_workers_host.js';
import module from './pkg/lenso_marketplace_workers_host_bg.wasm';
import { clearTimers } from './clock.mjs';
import { createEventRunner } from './runtime/runner.mjs';
import { createHttpHandler } from './runtime/http.mjs';
import { createStorage } from './storage.mjs';
import { createStorageScope } from './storage-scope.mjs';

let proofBoot;
const runner = createEventRunner({ instantiate: () => initSync({ module }), resetState: __wbg_reset_state, clearTimers, eventLimitMs: 5000, maxConcurrent: 1, retirementAdmissionLimit: 16 });
export default {
  async fetch(request, env) {
    const handler = createHttpHandler({
      run: async (...args) => {
        try { return await runner.run(...args); }
        catch (error) { if (env.PROOF_DIAGNOSTICS === "1") console.error("Marketplace proof host:", String(error)); throw error; }
      },
      handleHttp: handle_http,
      maxRequestBodyBytes: 65536,
      maxResponseBodyBytes: 4 * 1024 * 1024,
      maxRequestHeadBytes: 16384,
      bodyReadTimeoutMs: 5000,
      onReceipt(receipt, response) {
        if (env.PROOF_DIAGNOSTICS === "1") {
          proofBoot ??= crypto.randomUUID();
          response.headers.set("x-proof-generation", String(receipt.generation));
          response.headers.set("x-proof-wasm-memory", String(receipt.wasm_memory_bytes));
          response.headers.set("x-proof-boot", proofBoot);
        }
      },
      createScope() {
        return createStorageScope(
          signal => {
            const storage = createStorage(env.MARKETPLACE_DB, env.MARKETPLACE_OBJECTS, signal);
            return async (...args) => {
              try { return await storage(...args); }
              catch (error) {
                if (env.PROOF_DIAGNOSTICS === '1') console.error('Marketplace proof storage:', args[0], String(error));
                throw error;
              }
            };
          },
          JSON.stringify({ catalog_id: env.CATALOG_ID, key_id: env.CATALOG_KEY_ID, public_key_hex: env.CATALOG_PUBLIC_KEY, diagnostics: env.PROOF_DIAGNOSTICS === '1' }),
        );
      },
    });
    return handler(request);
  },
};
