import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const fixture = path.dirname(fileURLToPath(import.meta.url));
const kit = fs.realpathSync(process.argv[2]);
const cli = path.join(kit, 'bin/lenso');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'console-kit-stream-'));
const app = path.join(temporary, 'app');
const env = { ...process.env, PATH: path.join(kit, 'bin') };
const receipt = { kit, temporary, app, claims: [], passed: false, stage: 'create' };
const receiptFile = path.join(fixture, 'actual-kit-stream-receipt.json');
const save = () => fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2));
const run = (args) => {
  const result = spawnSync(cli, args, { env, encoding: 'utf8', timeout: 90000 });
  fs.appendFileSync(path.join(fixture, 'actual-kit-build.log'), `${args.join(' ')}\n${result.stdout}\n${result.stderr}\n`);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
};
let host; let stderr = ''; let guard;
try {
  run(['app', 'create', app, '--console']);
  const provider = path.join(app, 'app/stream-fixture');
  fs.mkdirSync(provider, { recursive: true });
  for (const name of ['plugin.ts', 'package.json', 'tsconfig.json', 'contribution.ts', 'workspace-service.ts', 'bun.lock']) fs.copyFileSync(path.join(fixture, name), path.join(provider, name));
  // Exact qualified public JS dependencies are already installed; only compiler
  // outputs/cache are linked. Authored provider/contract files remain regular files.
  fs.symlinkSync(fs.realpathSync(path.join(fixture, 'node_modules')), path.join(provider, 'node_modules'), 'dir');
  receipt.stage = 'build'; save();
  run(['app', 'build', '--root', app]);
  run(['app', 'start', '--from', path.join(app, 'dist'), '--check']);
  assert.equal(fs.existsSync(path.join(app, '.lenso/cache/local-native-host')), false);
  receipt.stage = 'Host readiness'; save();
  host = spawn(cli, ['app', 'start', '--from', path.join(app, 'dist')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  guard = setTimeout(() => host.kill('SIGTERM'), 60000);
  const endpoint = Promise.withResolvers();
  host.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-32768); const match = stderr.match(/http:\/\/127\.0\.0\.1:[0-9]+/u); if (match) endpoint.resolve(match[0]); });
  host.once('exit', () => endpoint.reject(new Error(`Host exited before ready: ${stderr}`)));
  const base = await endpoint.promise;
  const catalog = await (await fetch(`${base}/api/console/v1/pages`, { signal: AbortSignal.timeout(10000) })).json();
  const mount = catalog.mounts.find((m) => m.workspaceId === 'stream-fixture' || m.title === 'Stream fixture');
  assert.ok(mount, JSON.stringify(catalog));
  assert.equal(mount.requirements[0].available, true);
  const url = `${base}/api/console/v1/pages/${mount.id}/services/events`;
  const call = (tail, body, signal = AbortSignal.timeout(10000)) => fetch(`${url}/${tail}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const status = async () => { const response = await call('invoke/status', {}); assert.equal(response.status, 200); return response.json(); };
  const before = await status();
  receipt.stage = 'route denial'; save();
  const unknown = await call('subscribe/unknown', { id: '42', mode: 'finite' });
  assert.equal(unknown.status, 404);
  assert.equal((await status()).subscribeCalls, before.subscribeCalls);
  receipt.claims.push('Unknown route rejected before provider invocation; not production identity authorization.');
  receipt.stage = 'business denial'; save();
  const denied = await call('subscribe/watch', { id: '99', mode: 'finite' });
  assert.equal(denied.status, 422);
  assert.equal((await denied.json()).code, 'workspace_service_denied');
  const afterDeny = await status();
  assert.equal(afterDeny.opened, 0); assert.equal(afterDeny.messages, 0); assert.equal(afterDeny.denied, 1);
  receipt.claims.push('Business policy denial precedes stream opening/message work.');
  receipt.stage = 'finite stream messages/terminal'; save();
  const finite = await call('subscribe/watch', { id: '42', mode: 'finite' });
  assert.equal(finite.status, 200); assert.match(finite.headers.get('content-type'), /text\/event-stream/u);
  const text = await finite.text();
  const frames = text.trim().split(/\n\n/u).map((chunk) => ({ event: chunk.match(/^event: (.+)$/mu)?.[1], data: JSON.parse(chunk.match(/^data: (.+)$/mu)[1]) }));
  assert.deepEqual(frames.map((f) => f.event), ['item', 'item', 'terminal']);
  assert.deepEqual(frames.slice(0, 2).map((f) => f.data.sequence), ['0', '1']);
  assert.deepEqual(frames.slice(0, 2).map((f) => JSON.parse(Buffer.from(f.data.bodyBase64Url, 'base64url').toString())), [{ index: 0 }, { index: 1 }]);
  assert.equal(frames[2].data.outcome, 'success');
  const afterFinite = await status(); assert.equal(afterFinite.messages, 2); assert.equal(afterFinite.terminal, 1);
  receipt.claims.push('Actual WorkspaceService subscribe sends two ordered messages then success terminal and EOF.');
  receipt.stage = 'disconnect cancellation'; save();
  const cancel = new AbortController();
  const live = await call('subscribe/watch', { id: '42', mode: 'cancel' }, cancel.signal);
  assert.equal(live.status, 200);
  const reader = live.body.getReader();
  const first = await reader.read(); assert.equal(first.done, false); assert.match(new TextDecoder().decode(first.value), /event: item/u);
  cancel.abort();
  try { await reader.read(); assert.fail('Expected abort rather than post-cancel delivery'); } catch (error) { assert.equal(error.name, 'AbortError'); }
  const deadline = performance.now() + 5000;
  let observed;
  do { observed = await status(); if (observed.cancelled >= 1) break; await new Promise((resolve) => setTimeout(resolve, 25)); } while (performance.now() < deadline);
  assert.equal(observed.cancelled, 1); assert.equal(observed.messages, 3); assert.equal(observed.opened, 2);
  const fence = await status(); assert.equal(fence.messages, 3); assert.equal(fence.terminal, 1);
  receipt.claims.push('HTTP disconnect reaches provider StreamSession.cancel; no further message count after cancellation/terminal.');
  receipt.statistics = fence; receipt.passed = true; receipt.stage = 'passed';
} catch (error) { receipt.error = { name: error.name, message: error.message }; throw error; }
finally {
  clearTimeout(guard);
  if (host && host.exitCode === null && host.signalCode === null) { host.kill('SIGTERM'); await once(host, 'exit'); }
  receipt.stderrTail = stderr; save();
}
