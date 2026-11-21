import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EvercraftIdentity} from '../systemia/identity/identity.mjs';
import {createWorldsHumanIdentityBridge} from '../systemia/worlds/living-lobby-identity-bridge.mjs';
import {createWorldsPresenceProof} from '../systemia/worlds/living-lobby-presence-proof.mjs';

function fixture(t,options={}){
  const dir=mkdtempSync(join(tmpdir(),'evercraft-worlds-id-test-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const identity=new EvercraftIdentity({stateDir:dir});
  let clock=Date.parse('2026-11-16T12:00:00Z');
  let keys={key1:'worlds-first-party-test-secret-aaaa-1111'};
  const getKeyring=()=>keys;
  const auth={schema:'evercraft.identity.authentication.v1',subject_ref:'user:worlds-test',
    display_name:'Synthetic Example',auth_strength:'password'};
  const issue=(subject_ref='user:worlds-test')=>identity.issueSession({...auth,subject_ref},{
    signingSecret:keys.key1,signingKeyId:'key1',ttlSeconds:300,now:new Date(clock),
  });
  const bridge=createWorldsHumanIdentityBridge({
    identity,getKeyring,now:()=>new Date(clock).toISOString(),...options,
  });
  return {
    identity,bridge,issue,get clock(){return clock;},advance:ms=>clock+=ms,
    rotate:()=>keys={key2:'new-worlds-first-party-secret-bbbb-2222'},
    replaceSameId:()=>keys={key1:'different-worlds-first-party-secret-cccc-3333'},
  };
}
test('uses a real first-party signed Identity session, not a client subject claim',t=>{
  const h=fixture(t),issued=h.issue();
  const verified=h.bridge.verifySession(issued.token);
  assert.equal(verified.subject_ref,'user:worlds-test');
  assert.equal(verified.session_id,issued.session.session_id);
  assert.equal('display_name' in verified,false);
  assert.equal(JSON.stringify(verified).includes(issued.token),false);
  assert.equal(h.bridge.isHumanActive({kind:'human',subject_ref:'user:worlds-test',
    auth_ref:issued.session.session_id}),true);
  assert.equal(h.bridge.isHumanActive({kind:'agent',subject_ref:'user:worlds-test',
    auth_ref:issued.session.session_id}),false);
  assert.throws(()=>h.bridge.verifySession(issued.token+'forged'));
});
test('logout invalidates a cached signed session immediately',t=>{
  const h=fixture(t),issued=h.issue(),verified=h.bridge.verifySession(issued.token);
  assert.equal(h.bridge.isHumanActive({kind:'human',subject_ref:verified.subject_ref,
    auth_ref:verified.session_id}),true);
  h.identity.revokeSession({sessionId:verified.session_id,subjectRef:verified.subject_ref});
  assert.equal(h.bridge.isHumanActive({kind:'human',subject_ref:verified.subject_ref,
    auth_ref:verified.session_id}),false);
  assert.throws(()=>h.bridge.verifySession(issued.token),/session_revoked/);
});
test('revoke-all cutoff and signing key retirement both disable previously verified presence',t=>{
  const h=fixture(t),issued=h.issue();
  const verified=h.bridge.verifySession(issued.token);
  h.identity.revokeSubjectSessions({subjectRef:'user:worlds-test',
    at:new Date(h.clock+1000).toISOString()});
  assert.equal(h.bridge.isHumanActive({kind:'human',
    subject_ref:verified.subject_ref,auth_ref:verified.session_id}),false);
  const other=fixture(t),signed=other.issue(),claims=other.bridge.verifySession(signed.token);
  other.rotate();
  assert.equal(other.bridge.isHumanActive({kind:'human',
    subject_ref:claims.subject_ref,auth_ref:claims.session_id}),false);
});
test('replacing the signing secret without rotating its key ID invalidates cached presence',t=>{
  const h=fixture(t),issued=h.issue(),claims=h.bridge.verifySession(issued.token);
  assert.equal(h.bridge.isHumanActive({kind:'human',subject_ref:claims.subject_ref,
    auth_ref:claims.session_id}),true);
  h.replaceSameId();
  assert.equal(h.bridge.isHumanActive({kind:'human',subject_ref:claims.subject_ref,
    auth_ref:claims.session_id}),false);
  assert.throws(()=>h.bridge.verifySession(issued.token),/session_signature_invalid/);
});
test('owned identity adapter plus Passport yields revocable private Worlds presence',t=>{
  const h=fixture(t),issued=h.issue();
  let allowed=true;
  const registry=createWorldsPresenceProof({
    verifySession:h.bridge.verifySession,verifyAgent:()=>null,
    isPrincipalActive:h.bridge.isHumanActive,verifyAdult:()=>true,
    passport:{authorize:({subject_ref,product,scope,resource_ref})=>({
      decision:allowed&&subject_ref==='user:worlds-test'&&product==='evercraft-worlds'&&
        scope==='worlds.presence.enter.human'&&resource_ref==='worlds:lobby:business'
        ?'allow':'deny',
    })},
    now:()=>new Date(h.clock).toISOString(),
  });
  const joined=registry.joinHuman({sessionToken:issued.token});
  assert.equal(joined.decision,'entered');
  assert.equal(registry.resolvePresence(joined.presence_id)?.kind,'human');
  allowed=false;
  assert.equal(registry.resolvePresence(joined.presence_id),null);
  allowed=true;
  const again=registry.joinHuman({sessionToken:issued.token});
  assert.equal(again.decision,'entered');
  h.identity.revokeSession({sessionId:issued.session.session_id,subjectRef:'user:worlds-test'});
  assert.equal(registry.resolvePresence(again.presence_id),null);
});
test('expired sessions and missing trust callbacks are fail closed',t=>{
  const h=fixture(t),issued=h.issue();
  h.bridge.verifySession(issued.token);
  h.advance(300001);
  assert.equal(h.bridge.isHumanActive({kind:'human',
    subject_ref:'user:worlds-test',auth_ref:issued.session.session_id}),false);
  assert.throws(()=>h.bridge.verifySession(issued.token),/session_expired/);
  assert.throws(()=>createWorldsHumanIdentityBridge({identity:h.identity}),/trusted_host_required/);
});
