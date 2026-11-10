import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLocalSourcePin}
  from '../systemia/organism/eo001-source-pin-check.mjs';

const sha='a'.repeat(40);
test('pinned unchanged source accepted for internal QA only',()=>{
  const requests=[];
  const run=(command,args)=>{
    requests.push([command,...args]);
    if(args.includes('rev-parse'))return {status:0,stdout:sha};
    return {status:0,stdout:''};
  };
  assert.deepEqual(verifyLocalSourcePin({root:'/private/owned',expectedPin:sha,run}),
    {ok:true,state:'PINNED_SOURCE_UNCHANGED'});
  assert.equal(requests.length,2);
});
test('no operator-selected pin cannot become success',()=>{
  const r=verifyLocalSourcePin({root:'/private/owned',expectedPin:'invalid',run:()=>{throw Error('must_not_run')}});
  assert.deepEqual(r,{ok:false,reason:'PIN_MISSING'});
});
test('different HEAD holds before loading mission',()=>{
  const r=verifyLocalSourcePin({root:'/private/owned',expectedPin:sha,
    run:()=>({status:0,stdout:'b'.repeat(40)})});
  assert.deepEqual(r,{ok:false,reason:'SOURCE_DRIFT'});
});
test('modified tracked source holds before loading mission',()=>{
  const r=verifyLocalSourcePin({root:'/private/owned',expectedPin:sha,
    run:(_c,args)=>args.includes('rev-parse')?
      {status:0,stdout:sha}:{status:0,stdout:' M systemia/organism/eo001-owned-qa-mission.mjs'}});
  assert.deepEqual(r,{ok:false,reason:'TRACKED_SOURCE_CHANGED'});
});
test('git failure holds; no fallback to unverified code',()=>{
  const r=verifyLocalSourcePin({root:'/private/owned',expectedPin:sha,
    run:()=>({status:128,stdout:''})});
  assert.deepEqual(r,{ok:false,reason:'SOURCE_DRIFT'});
});
