import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedPostgresReplayGuard} from '../systemia/crypto/pq-replay-postgres.mjs';

const nonce=Buffer.alloc(24, 0x7b).toString('base64url');
function sample(nowMs=Date.now()) {
  return {
    senderId:'node001',senderKeyId:'a'.repeat(64),
    context:'systemia.lab.shared',nonce,nowMs,expiresAtMs:nowMs+60_000
  };
}

test('PostgreSQL adapter requires an injected shared query authority',()=>{
  assert.throws(()=>createSharedPostgresReplayGuard(),/shared PostgreSQL/);
  const guard=createSharedPostgresReplayGuard({client:{query:async()=>({rowCount:1,rows:[{token_digest:'x'}]})}});
  assert.equal(guard.schema,'systemia.crypto.replay-ledger.postgres.v1');
  assert.equal(guard.durability,'shared-postgres-single-primary');
});

test('injected PostgreSQL results only admit exact committed INSERT confirmation',async()=>{
  let calls=0;
  const accepted=createSharedPostgresReplayGuard({client:{
    async query(sql,args) {
      calls++;
      assert.match(sql,/ON CONFLICT \(token_digest\) DO NOTHING/);
      assert.match(sql,/clock_timestamp/);
      assert.equal(args[0].length,64);
      assert.match(args[1],/^\d+$/);
      return {rowCount:1,rows:[{token_digest:args[0]}]};
    }
  }});
  assert.equal(await accepted.consume(sample()),true);
  assert.equal(calls,1);

  const cases=[
    {rowCount:0,rows:[]},
    {rowCount:1,rows:[{token_digest:'different'}]},
    {rowCount:1,rows:[]},
    {rowCount:2,rows:[{token_digest:'bad'}]},
    null
  ];
  for(const result of cases) {
    const guard=createSharedPostgresReplayGuard({client:{query:async()=>result}});
    assert.equal(await guard.consume(sample()),false);
  }
});

test('invalid claims, database outages and expired claims never authorize a message',async()=>{
  let calls=0;
  const guard=createSharedPostgresReplayGuard({client:{query:async()=>{
    calls++;
    throw new Error('DB is not reachable');
  }}});
  assert.equal(await guard.consume(sample()),false);
  assert.equal(calls,1);
  const invalid=[
    {...sample(),senderId:''},{...sample(),senderKeyId:'a'},
    {...sample(),context:'not allowed spaces'},
    {...sample(),nonce:'bad'},
    {...sample(),expiresAtMs:1},
    {...sample(),expiresAtMs:Date.now()+11*60_000}
  ];
  for(const input of invalid) assert.equal(await guard.consume(input),false);
  assert.equal(calls,1);
});
