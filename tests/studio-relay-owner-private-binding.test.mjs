import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {parsePrivateEnv,expectedBinding,renderBinding,dropInText} from '../scripts/configure-studio-relay-owner.mjs';

const secret='a'.repeat(64);
const claim={schema:'evercraft.home.owner-claim.v1',subject_ref:'user:jesse'};
const home=parsePrivateEnv('EVERCRAFT_OWNER_SUBJECT_REF=user:jesse\n');
const relay=parsePrivateEnv('EVERCRAFT_NOTIFICATION_BASE_URL=http://127.0.0.1:3921\nEVERCRAFT_NOTIFICATION_INGEST_TOKEN='+secret+'\n');
const fabric=parsePrivateEnv('EVERCRAFT_STUDIO_LEADS_DIR=/var/lib/evercraft/studio-leads\n');

test('uses existing claimed Home subject and owned private Relay credential without inventing principal',()=>{
  const result=expectedBinding({claim,home,relay,fabric});
  assert.deepEqual(result,{principal:'user:jesse',base:'http://127.0.0.1:3921',token:secret});
  const rendered=renderBinding(result);
  assert.match(rendered,/EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL=user:jesse/);
  assert.match(rendered,/EVERCRAFT_NOTIFICATION_BASE_URL=http:\/\/127\.0\.0\.1:3921/);
  assert.match(rendered,/EVERCRAFT_NOTIFICATION_INGEST_TOKEN=/);
  assert.equal(rendered.match(/EVERCRAFT_NOTIFICATION_INGEST_TOKEN=/g)?.length,1);
  assert.equal(rendered.split('\n').filter(Boolean).length,3);
});

test('rejects an unclaimed, mismatched, or malicious owner subject',()=>{
  assert.throws(()=>expectedBinding({claim:{...claim,subject_ref:'user:other'},home,relay,fabric}),/HOME_OWNER_IDENTITY_NOT_VERIFIED/);
  assert.throws(()=>expectedBinding({claim:{...claim,subject_ref:'owner\nINJECT=1'},home,relay,fabric}),/HOME_OWNER_IDENTITY_NOT_VERIFIED/);
  assert.throws(()=>expectedBinding({claim:{...claim,schema:'invalid'},home,relay,fabric}),/HOME_OWNER_IDENTITY_NOT_VERIFIED/);
});

test('refuses remote Relay URL or insufficient ingest credential',()=>{
  const remote=parsePrivateEnv('EVERCRAFT_NOTIFICATION_BASE_URL=https://unknown.example\nEVERCRAFT_NOTIFICATION_INGEST_TOKEN='+secret);
  assert.throws(()=>expectedBinding({claim,home,relay:remote,fabric}),/PRIVATE_RELAY_AUTH_NOT_VERIFIED/);
  const weak=parsePrivateEnv('EVERCRAFT_NOTIFICATION_BASE_URL=http://127.0.0.1:3921\nEVERCRAFT_NOTIFICATION_INGEST_TOKEN=weak');
  assert.throws(()=>expectedBinding({claim,home,relay:weak,fabric}),/PRIVATE_RELAY_AUTH_NOT_VERIFIED/);
});

test('rejects duplicate environment settings and existing Fabric Relay variables rather than overwriting',()=>{
  assert.throws(()=>parsePrivateEnv('K=v\nK=evil'),/PRIVATE_ENV_FORMAT_HOLD/);
  assert.throws(()=>parsePrivateEnv('not-valid=bad'),/PRIVATE_ENV_FORMAT_HOLD/);
  const legacy=parsePrivateEnv('EVERCRAFT_STUDIO_RELAY_OWNER_PRINCIPAL=user:old');
  assert.throws(()=>expectedBinding({claim,home,relay,fabric:legacy}),/FABRIC_LEGACY_RELAY_CONFIG_REQUIRES_REVIEW/);
});

test('binding is isolated from original Fabric env and systemd drop-in only includes private path',()=>{
  assert.equal(dropInText,'[Service]\nEnvironmentFile=/etc/evercraft/studio-relay.env\n');
  assert.doesNotMatch(dropInText,/user:jesse|TOKEN|a{20}/);
  const source=fs.readFileSync('scripts/configure-studio-relay-owner.mjs','utf8');
  assert.match(source,/const STUDIO_ENV='\/etc\/evercraft\/studio-relay\.env'/);
  assert.match(source,/const FABRIC_ENV='\/etc\/evercraft\/fabric\.env'/);
  assert.match(source,/systemctl/);
  assert.match(source,/run\('systemctl',\['restart',FABRIC_SERVICE\]\)/);
  assert.match(source,/!sameSecret\(actual\.get\('EVERCRAFT_NOTIFICATION_INGEST_TOKEN'\),expectedBindingValue\.token\)/);
  assert.match(source,/if\(presentEnv\|\|presentDrop\)throw Error\('EXISTING_BINDING_NO_OVERWRITE'\)/);
  assert.match(source,/fs\.openSync\(filename,'wx',mode\)/);
  assert.match(source,/getJson\(LOCAL_RELAY\+'\/api\/notifications\/metrics'/);
  assert.doesNotMatch(source,/POST.*api\/notifications\/intents/);
  assert.doesNotMatch(source,/sendMail|stripe\.com/);
});
