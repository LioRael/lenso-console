// Render a reviewable deployment configuration from explicit public inputs.
// This command never creates resources, handles private keys, or deploys.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const [inputPath, outputPath] = process.argv.slice(2);
assert(inputPath && outputPath, 'usage: node proof/deployment-config.mjs inputs.json output.json');
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
for (const key of ['worker','hostname','database_name','database_id','bucket_name','catalog_id','key_id','public_key_hex']) {
  assert(typeof input[key] === 'string' && input[key].length > 0, `missing ${key}`);
}
assert(/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.worker), 'invalid Worker name');
assert(/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(input.hostname), 'invalid hostname');
assert(input.hostname !== 'catalog.lenso.dev', 'legacy catalog domain is outside this rollout');
assert(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.database_id), 'invalid D1 ID');
assert(/^[a-f0-9]{64}$/.test(input.public_key_hex), 'expected Ed25519 public key hex');
assert(input.public_key_hex !== 'd04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737', 'proof trust is not production trust');
assert(![input.worker,input.database_name,input.bucket_name,input.catalog_id,input.key_id].some(value => /proof|test-key|workers-g3/i.test(value)), 'proof resource or identity rejected');
assert(Number.isInteger(input.cpu_ms) && input.cpu_ms > 0 && input.cpu_ms <= 1000, 'explicit qualified CPU ceiling required (1..1000ms)');
const config = {
  name: input.worker, main: 'worker.mjs', compatibility_date: '2026-07-08',
  compatibility_flags: ['global_fetch_strictly_public','enable_request_signal'],
  workers_dev: false, preview_urls: false,
  routes: [{pattern:input.hostname,custom_domain:true}],
  limits: {cpu_ms:input.cpu_ms}, observability:{enabled:true},
  vars:{CATALOG_ID:input.catalog_id,CATALOG_KEY_ID:input.key_id,CATALOG_PUBLIC_KEY:input.public_key_hex},
  d1_databases:[{binding:'MARKETPLACE_DB',database_name:input.database_name,database_id:input.database_id,migrations_dir:'migrations'}],
  r2_buckets:[{binding:'MARKETPLACE_OBJECTS',bucket_name:input.bucket_name}],
};
writeFileSync(outputPath, JSON.stringify(config,null,2)+'\n', {flag:'wx'});
console.log('Configuration written for review; no deployment performed. Keep it beside worker.mjs.');
