import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStorage } from './storage.mjs';

test('R2 body returned after cancellation is still released', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const object = {size:2,body:new ReadableStream({cancel(){cancelled=true;}})};
  const database = {prepare(){return {bind(){return {first:async()=>({object_key:'snapshot',digest:'unused'})};}};}};
  const bucket = {async get(){controller.abort();return object;},put(){throw Error('unexpected write');}};
  const storage = createStorage(database,bucket,controller.signal);
  await assert.rejects(storage('published',JSON.stringify({catalog:'fixture'})), /abort/i);
  assert.equal(cancelled,true);
});

test('cancelled absent-object lookup cannot initiate a durable write', async () => {
  const controller = new AbortController();
  let writes = 0;
  const bucket = {async get(){controller.abort();return null;},async put(){writes++;}};
  const database = {prepare(){throw Error('unexpected database access');}};
  const envelope = '{}';
  const token = 'sha256:'+createHash('sha256').update(envelope).digest('hex');
  const storage = createStorage(database,bucket,controller.signal);
  await assert.rejects(storage('compare_exchange',JSON.stringify({catalog:'fixture',expected:null,value:{envelope,token,checkpoint:{}}})),/abort/i);
  assert.equal(writes,0);
});
