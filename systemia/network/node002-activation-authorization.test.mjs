import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {activationGrantBytes,verifyActivationGrant} from './node002-activation-authorization.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const ownerPublicKey=publicKey.export({type:'spki',format:'pem'});
const grant={schema:'evercraft.node002.activation-grant.v1',repository:'jgaethle10/forge-operator',node_id:'evercraft-node002-nextgen',operation:'activate',commit:'a'.repeat(40),phase:'cemetery-restore',sequence:2,rollback_commit:'b'.repeat(40),rollback_phase:'hash-only',stage_grant_sha256:'c'.repeat(64),issued_at:'2026-11-26T18:00:00Z',expires_at:'2026-11-26T18:30:00Z'};
const staged={schema:'evercraft.node002.release-stage-receipt.v1',state:'staged_not_validated',activation_authorized:false,commit:grant.commit,phase:grant.phase,sequence:2,grant_sha256:grant.stage_grant_sha256};
const current={healthy:true,node_id:grant.node_id,commit:grant.rollback_commit,phase:grant.rollback_phase};
const signed=g=>sign(null,activationGrantBytes(g),privateKey).toString('base64');
function check(g=grant,opts={}){return verifyActivationGrant({grant:g,signature:signed(g),ownerPublicKey,staged,current,lastActivationSequence:1,nowMs:Date.parse('2026-11-26T18:10:00Z'),...opts})}
test('valid signed grant is verified but not executable',()=>{const result=check();assert.equal(result.signature_verified,true);assert.equal(result.execution_authorized,false);assert.ok(Object.isFrozen(result))});
test('stage-only or wrong node grants rejected even when signed',()=>{for(const patch of [{operation:'stage-only'},{node_id:'other'},{repository:'other/repo'},{phase:'shell'}])assert.throws(()=>check({...grant,...patch}),/activation_scope_denied/)});
test('staging receipt binding cannot be substituted',()=>{for(const patch of [{grant_sha256:'d'.repeat(64)},{commit:grant.rollback_commit},{sequence:3},{activation_authorized:true}])assert.throws(()=>check(grant,{staged:{...staged,...patch}}),/activation_stage_binding_denied/)});
test('rollback baseline must match and be healthy',()=>{for(const patch of [{healthy:false},{commit:grant.commit},{phase:'cemetery-ingest'}])assert.throws(()=>check(grant,{current:{...current,...patch}}),/activation_rollback_binding_denied/)});
test('replay, missing sequence and expired grants rejected',()=>{for(const n of [2,3,undefined])assert.throws(()=>check(grant,{lastActivationSequence:n}),/activation_sequence_denied/);assert.throws(()=>check(grant,{nowMs:Date.parse(grant.expires_at)}),/activation_time_denied/)});
test('tampered signature and untrusted key rejected',()=>{assert.throws(()=>check({...grant,expires_at:'2026-11-26T18:40:00Z'},{signature:signed(grant)}),/activation_signature_denied/);assert.throws(()=>check(grant,{ownerPublicKey:generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})}),/activation_signature_denied/)});
