/**
 * Synthetic two-node integration rehearsal.
 *
 * This is deliberately NOT a real Node001/Node002 deployment. It uses two
 * independent PostgreSQL connection pools, isolated ephemeral cryptographic
 * keys and a disposable CI PostgreSQL primary to exercise the entire
 * signed-root -> pinned-sender -> ML-KEM encryption -> replay admission path.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import pg from 'pg';
import {generatePqRecipient} from '../../systemia/crypto/pq-envelope.mjs';
import {generatePqSigner,signAndEncryptPqMessage} from '../../systemia/crypto/pq-signed-envelope.mjs';
import {
  signPqTrustSnapshot,importSignedPqTrustSnapshot
} from '../../systemia/crypto/pq-trust-snapshot.mjs';
import {createSharedPostgresTrustRevisionGuard} from '../../systemia/crypto/pq-trust-revision-postgres.mjs';
import {openCurrentTrustPqMessageAsync} from '../../systemia/crypto/pq-current-trust-replay.mjs';

const {Pool}=pg;
const connectionString=process.env.PQ_REPLAY_TEST_DATABASE_URL;
const replaySql=fileURLToPath(new URL('../../systemia/crypto/sql/postgres-replay-v1.sql',import.meta.url));
const trustSql=fileURLToPath(new URL('../../systemia/crypto/sql/postgres-trust-highwater-v1.sql',import.meta.url));

test('synthetic node001/node002 exchange: verified keys, two-way delivery, replay and revocation denial',
  {skip:!connectionString},async()=>{
    const db1=new Pool({connectionString,max:3,connectionTimeoutMillis:3000});
    const db2=new Pool({connectionString,max:3,connectionTimeoutMillis:3000});
    try {
      await db1.query(readFileSync(replaySql,'utf8'));
      await db1.query(readFileSync(trustSql,'utf8'));
      const now=Date.now();
      const authority='systemia.pq.nodepair.'+randomBytes(8).toString('hex');
      const root=generateKeyPairSync('ml-dsa-65');
      const node001={signer:generatePqSigner(),recipient:generatePqRecipient()};
      const node002={signer:generatePqSigner(),recipient:generatePqRecipient()};
      const entry=(name,node,status='active')=>({
        sender:name,keyId:node.signer.senderKeyId,
        publicKeyPem:node.signer.publicKey.export({type:'spki',format:'pem'}),
        status,notBeforeMs:now-30000,notAfterMs:now+600000
      });
      const snapshot=(revision,entries)=>signPqTrustSnapshot({
        rootPrivateKey:root.privateKey,authority,revision,
        validFromMs:now-3000,validUntilMs:now+120000,entries
      });
      const guard1=createSharedPostgresTrustRevisionGuard({client:db1});
      const guard2=createSharedPostgresTrustRevisionGuard({client:db2});
      const importAt=(signedSnapshot,guard)=>importSignedPqTrustSnapshot({
        signedSnapshot,trustedRootPublicKey:root.publicKey,
        expectedAuthority:authority,revisionGuard:guard,nowMs:now
      });
      const first=snapshot(1,[
        entry('node001',node001),entry('node002',node002)
      ]);
      const trusted1=await importAt(first,guard1);
      const trusted2=await importAt(first,guard2);

      const outbound=(sender,recipient,senderName,route,plaintext)=>
        signAndEncryptPqMessage({
          senderPrivateKey:sender.signer.privateKey,sender:senderName,
          recipientPublicKey:recipient.recipient.publicKey,
          plaintext,context:route,nowMs:now,ttlSeconds:90
        });
      const receive=(client,trust,message,recipient,senderName,route)=>
        openCurrentTrustPqMessageAsync({
          client,importedSnapshot:trust,signedMessage:message,
          expectedSender:senderName,recipientPrivateKey:recipient.recipient.privateKey,
          expectedContext:route,nowMs:now
        });

      const route12='systemia.lab.node001.to.node002';
      const route21='systemia.lab.node002.to.node001';
      const msg12=outbound(node001,node002,'node001',route12,'hello from synthetic node001');
      assert.equal((await receive(db2,trusted2,msg12,node002,'node001',route12))
        .plaintext.toString(),'hello from synthetic node001');
      await assert.rejects(receive(db1,trusted1,msg12,node002,'node001',route12),/denied|rejected/);
      const msg21=outbound(node002,node001,'node002',route21,'reply from synthetic node002');
      assert.equal((await receive(db1,trusted1,msg21,node001,'node002',route21))
        .plaintext.toString(),'reply from synthetic node002');
      await assert.rejects(receive(db2,trusted2,msg21,node001,'node002',route12),/denied|rejected/);

      // The root approves node001's revocation, independently of message traffic.
      const revoked=snapshot(2,[
        entry('node001',node001,'revoked'),entry('node002',node002)
      ]);
      const current1=await importAt(revoked,guard1);
      const current2=await importAt(revoked,guard2);
      const staleMessage=outbound(node001,node002,'node001',route12,'unauthorized after revocation');
      // Even if synthetic node002 uses its OLD snapshot, the database enforces
      // the new high-water revision before accepting a new nonce.
      await assert.rejects(receive(db2,trusted2,staleMessage,node002,'node001',route12),/denied|rejected/);
      await assert.rejects(receive(db2,current2,staleMessage,node002,'node001',route12),/denied|rejected/);

      // Node002 is still authorized to send to node001 after the rotation.
      const postRotation=outbound(node002,node001,'node002',route21,'authorized after rotation');
      assert.equal((await receive(db1,current1,postRotation,node001,'node002',route21))
        .plaintext.toString(),'authorized after rotation');
      await assert.rejects(importAt(first,guard1),/rejected/);

      // An unreachable authoritative DB denies plaintext; no cached fallback.
      const unreachable={query:async()=>{throw Error('synthetic network partition');}};
      const blocked=outbound(node002,node001,'node002',route21,'partition must deny');
      await assert.rejects(receive(unreachable,current1,blocked,node001,'node002',route21),/denied|rejected/);
      console.log('SYNTHETIC_NODE_PAIR_PROOF: two_way=true replay_denied=true revoked_sender_denied=true stale_cache_denied=true partition_denied=true');
    } finally {
      await Promise.allSettled([db1.end(),db2.end()]);
    }
  });
