import test from 'node:test';
import assert from 'node:assert/strict';
import {getKaidanceStartupPulse} from './local-organism.mjs';

test('transient local KAIDANCE route loss gets bounded retry then actual pulse',async()=>{
  let calls=0,pauses=0;
  const yard={async getKaidancePulse(deploymentId){
    assert.equal(deploymentId,'kaidance-local-resident');
    calls++;
    if(calls<3)throw Error('KAIDANCE route is not healthy: unreachable');
    return {state:'healthy',coverage_receipt_valid:true,field_attestation:{state:'not_verified'}};
  }};
  const pulse=await getKaidanceStartupPulse(yard,'kaidance-local-resident',{
    attempts:4,sleep:async()=>{pauses++;}
  });
  assert.equal(pulse.state,'healthy');
  assert.equal(calls,3);
  assert.equal(pauses,2);
});

test('degraded KAIDANCE health, invalid coverage and authority errors never get transport retries',async()=>{
  for(const reason of [
    'KAIDANCE route is not healthy: degraded',
    'deployment is not KAIDANCE',
    'field_attestation_invalid'
  ]) {
    let calls=0;
    await assert.rejects(getKaidanceStartupPulse({
      async getKaidancePulse(){calls++;throw Error(reason);}
    },'kaidance-local-resident',{sleep:async()=>{}}),new RegExp(reason));
    assert.equal(calls,1,reason);
  }
});

test('persistent unreachable route is held after hard maximum of four attempts',async()=>{
  let calls=0,pauses=0;
  await assert.rejects(getKaidanceStartupPulse({
    async getKaidancePulse(){calls++;throw Error('KAIDANCE route is not healthy: unreachable');}
  },'kaidance-local-resident',{
    attempts:99,sleep:async()=>{pauses++;}
  }),/unreachable/);
  assert.equal(calls,4);
  assert.equal(pauses,3);
});
