import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRemoteOperatorStatus} from '../scripts/validate-fabric-remote-operator-status.mjs';

const valid = () => ({
  ok: true,
  schema: 'evercraft.remote-operator.status.v1',
  instance_id: 'local-operator-001',
  roots: ['home', 'evercraft'],
  filesystem: {list: true, read: true, write: true, sensitive_path_read_block: true},
  execution: {mode:'bounded-program', interactive_tty:false, root_privilege:false,
    programs:['git','npm','systemctl','journalctl'], ambient_secret_environment_forwarded:false},
  receipt_semantics: 'hashes_and_metadata_only',
});

test('accepts the actual bounded operator status shape', () => assert.equal(validateRemoteOperatorStatus(valid()).valid, true));
test('rejects HTTP 200 with arbitrary JSON', () => assert.equal(validateRemoteOperatorStatus({ok:true}).valid, false));
test('rejects missing status', () => assert.equal(validateRemoteOperatorStatus(null).valid, false));
test('rejects wrong schema', () => assert.equal(validateRemoteOperatorStatus({...valid(),schema:'health.v1'}).valid, false));
test('rejects interactive TTY', () => {const s=valid();s.execution.interactive_tty=true;assert.equal(validateRemoteOperatorStatus(s).valid,false)});
test('rejects root elevation', () => {const s=valid();s.execution.root_privilege=true;assert.equal(validateRemoteOperatorStatus(s).valid,false)});
test('rejects arbitrary shell in allowed program list', () => {const s=valid();s.execution.programs.push('bash');assert.equal(validateRemoteOperatorStatus(s).valid,false)});
test('rejects forwarded secrets', () => {const s=valid();s.execution.ambient_secret_environment_forwarded=true;assert.equal(validateRemoteOperatorStatus(s).valid,false)});
test('rejects absent secret path guard', () => {const s=valid();delete s.filesystem.sensitive_path_read_block;assert.equal(validateRemoteOperatorStatus(s).valid,false)});
test('rejects full output receipts', () => assert.equal(validateRemoteOperatorStatus({...valid(),receipt_semantics:'plaintext'}).valid,false));
test('rejects missing admitted roots', () => assert.equal(validateRemoteOperatorStatus({...valid(),roots:[]}).valid,false));
test('rejects duplicate program entries', () => {const s=valid();s.execution.programs.push('git');assert.equal(validateRemoteOperatorStatus(s).valid,false)});
