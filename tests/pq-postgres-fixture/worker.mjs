import pg from 'pg';
import {createSharedPostgresReplayGuard} from '../../systemia/crypto/pq-replay-postgres.mjs';

const {Pool}=pg;
const url=process.env.PQ_REPLAY_TEST_DATABASE_URL;
if (!url) throw new Error('PQ_REPLAY_TEST_DATABASE_URL required');
const pool=new Pool({connectionString:url,connectionTimeoutMillis:2500,max:1});
try {
  const guard=createSharedPostgresReplayGuard({client:pool});
  const now=Date.now();
  const accepted=await guard.consume({
    senderId:'node001',senderKeyId:'b'.repeat(64),
    context:'systemia.lab.multi-process',
    nonce:process.argv[2],nowMs:now,expiresAtMs:now+60_000
  });
  process.stdout.write(accepted?'ACCEPT':'REJECT');
} finally {
  await pool.end();
}
