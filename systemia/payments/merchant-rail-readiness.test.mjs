import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  newMerchantRailCandidates,nominateMerchantRail,assertRegistry,
  saveMerchantRailCandidates,readMerchantRailCandidates,
  publicMerchantRailReadiness,
} from './merchant-rail-readiness.mjs';

const sandbox=()=>fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-rail-readiness-'));

test('merchant rails default disabled; operator nomination is NOT business payment verification',()=>{
  const registry=newMerchantRailCandidates();
  assert.equal(assertRegistry(registry),true);
  for(const rail of ['cash','check','bank_transfer','zelle_business',
    'paypal_business','venmo_business','cash_app_business','card_processor']){
    const status=publicMerchantRailReadiness(registry,rail);
    assert.equal(status.available,false);
    assert.equal(status.payment_destination,null);
    assert.equal(status.fulfillment_authorized,false);
  }
  const proposed=nominateMerchantRail(registry,{
    rail:'bank_transfer',ownerConfirmed:true,reviewNote:'Review with business bank'
  });
  assert.equal(proposed.version,2);
  assert.equal(proposed.records.bank_transfer.status,'owner_nominated_requires_external_verification');
  assert.equal(proposed.records.bank_transfer.eligible_for_public_invoice,false);
  assert.equal(proposed.live_payment_instructions_authorized,false);
  const status=publicMerchantRailReadiness(proposed,'bank_transfer');
  assert.equal(status.nominated_by_operator,true);
  assert.equal(status.available,false);
  assert.equal(status.payment_instructions,null);
  assert.equal(status.reason,'requires_authenticated_merchant_rail_verification');
});

test('no buyer input or merchant preference alone can enable an external collection rail',()=>{
  const registry=newMerchantRailCandidates();
  assert.throws(()=>nominateMerchantRail(registry,{rail:'zelle_business'}),/operator_approval_required/);
  assert.throws(()=>nominateMerchantRail(registry,{rail:'card_processor',ownerConfirmed:true}),/not_supported/);
  assert.throws(()=>nominateMerchantRail(registry,{rail:'fake_rail',ownerConfirmed:true}),/not_supported/);
  assert.throws(()=>nominateMerchantRail(registry,{
    rail:'cash',ownerConfirmed:true,reviewNote:'<script>evil</script>'
  }),/review_note_invalid/);
  const proposed=nominateMerchantRail(registry,{rail:'cash',ownerConfirmed:true});
  assert.throws(()=>nominateMerchantRail(proposed,{rail:'cash',ownerConfirmed:true}),/already_nominated/);
  assert.throws(()=>assertRegistry({...proposed,live_payment_instructions_authorized:true}),/overauthorized/);
  assert.throws(()=>assertRegistry({...proposed,buyer_bank_account:'test'}),/unexpected_fields/);
  assert.throws(()=>assertRegistry({...proposed,records:{
    ...proposed.records,cash:{...proposed.records.cash,eligible_for_public_invoice:true}
  }}),/unverified_status_invalid/);
  assert.throws(()=>assertRegistry({...proposed,records:{
    ...proposed.records,cash:{...proposed.records.cash,provider_token:'fake'}
  }}),/credential_or_extra_fields/);
});

test('private registry can persist across operator processes but never becomes payment authority',()=>{
  const dir=sandbox();
  const parent=path.join(dir,'private');
  const file=path.join(parent,'rail.json');
  try{
    const initial=newMerchantRailCandidates();
    const receipt=saveMerchantRailCandidates(initial,{file});
    assert.equal(receipt.saved,true);
    assert.equal(receipt.public_payment_instructions_enabled,false);
    assert.equal(fs.statSync(parent).mode&0o077,0);
    assert.equal(fs.statSync(file).mode&0o077,0);
    const read=readMerchantRailCandidates({file});
    assert.deepEqual(read,initial);
    const nominated=nominateMerchantRail(read,{rail:'zelle_business',ownerConfirmed:true});
    const second=saveMerchantRailCandidates(nominated,{file});
    assert.equal(second.rails_nominated,1);
    assert.deepEqual(readMerchantRailCandidates({file}),nominated);
    const buyer=publicMerchantRailReadiness(readMerchantRailCandidates({file}),'zelle_business');
    assert.equal(buyer.available,false);
    assert.equal(buyer.payment_destination,null);
    assert.throws(()=>saveMerchantRailCandidates(initial,{file}),/revision_or_overwrite_rejected/);
    fs.chmodSync(file,0o644);
    assert.throws(()=>readMerchantRailCandidates({file}),/not_private/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('existing rails may not be edited or removed by silent overwrite',()=>{
  const dir=sandbox(),file=path.join(dir,'rail.json');
  try{
    const original=newMerchantRailCandidates();
    saveMerchantRailCandidates(original,{file});
    const first=nominateMerchantRail(original,{rail:'paypal_business',ownerConfirmed:true});
    saveMerchantRailCandidates(first,{file});
    const second=nominateMerchantRail(first,{rail:'bank_transfer',ownerConfirmed:true});
    const altered={...second,records:{
      ...second.records,paypal_business:{
        ...second.records.paypal_business,
        review_note:'changed without operator proof'
      }
    }};
    assert.throws(()=>saveMerchantRailCandidates(altered,{file}),/existing_nomination_modified/);
    const clean=saveMerchantRailCandidates(second,{file});
    assert.equal(clean.version,3);
    assert.equal(readMerchantRailCandidates({file}).version,3);
    assert.throws(()=>saveMerchantRailCandidates(second,{file}),/revision_or_overwrite_rejected/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('public interface never includes an actual payment destination or claimed settlement',()=>{
  const registry=nominateMerchantRail(newMerchantRailCandidates(),{
    rail:'venmo_business',ownerConfirmed:true
  });
  const view=publicMerchantRailReadiness(registry,'venmo_business');
  assert.deepEqual(view,{
    rail:'venmo_business',available:false,nominated_by_operator:true,
    reason:'requires_authenticated_merchant_rail_verification',
    payment_destination:null,payment_instructions:null,
    paid:false,fulfillment_authorized:false
  });
  assert.equal(publicMerchantRailReadiness(null,'bank_transfer').available,false);
  assert.equal(publicMerchantRailReadiness(null,'unknown').available,false);
});


test('merchant registry write lock refuses a second writer without mutating private data',()=>{
  const dir=sandbox(),file=path.join(dir,'merchant.json'),lock=file+'.lock';
  try{
    const empty=newMerchantRailCandidates();
    saveMerchantRailCandidates(empty,{file});
    const proposed=nominateMerchantRail(empty,{rail:'bank_transfer',ownerConfirmed:true});
    fs.writeFileSync(lock,'another writer',{flag:'wx',mode:0o600});
    assert.throws(()=>saveMerchantRailCandidates(proposed,{file}),/registry_write_locked/);
    assert.deepEqual(readMerchantRailCandidates({file}),empty);
    assert.deepEqual(fs.readdirSync(dir).sort(),['merchant.json','merchant.json.lock'].sort());
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Saban independent processes race to nominate competing rails and only one revision can commit',async()=>{
  const dir=sandbox(),file=path.join(dir,'merchant.json');
  const helper=fileURLToPath(new URL('./merchant-rail-race-worker.test-helper.mjs',import.meta.url));
  const barrier=path.join(dir,'go');
  const children=[];
  function start(rail){
    const child=spawn(process.execPath,[helper,file,rail,barrier],{
      cwd:dir,shell:false,stdio:['ignore','pipe','pipe'],
      env:{PATH:process.env.PATH||'/usr/bin:/bin',HOME:dir,
        EVERCRAFT_PAYMENTS_TEST_ONLY:'1',NODE_ENV:'test'}
    });
    children.push(child);
    return new Promise((resolve,reject)=>{
      let stdout='',stderr='';
      child.stdout.on('data',x=>{stdout+=String(x);if(stdout.length>2048)child.kill('SIGKILL')});
      child.stderr.on('data',x=>{stderr+=String(x);if(stderr.length>2048)child.kill('SIGKILL')});
      child.on('error',reject);
      child.on('close',code=>{
        if(code!==0)return reject(Error('race_worker_failed:'+stderr.slice(0,120)));
        try{resolve(JSON.parse(stdout.trim()))}
        catch{reject(Error('race_worker_bad_output'))}
      });
    });
  }
  try{
    const initial=newMerchantRailCandidates();
    saveMerchantRailCandidates(initial,{file});
    const a=start('bank_transfer'),b=start('paypal_business');
    const readyTimeout=Date.now()+7000;
    while(!fs.existsSync(path.join(dir,'ready-bank_transfer'))||
          !fs.existsSync(path.join(dir,'ready-paypal_business'))){
      if(Date.now()>readyTimeout)throw Error('independent_workers_never_became_ready');
      await new Promise(resolve=>setTimeout(resolve,15));
    }
    fs.writeFileSync(barrier,'go',{flag:'wx',mode:0o600});
    const outputs=await Promise.all([a,b]);
    assert.equal(outputs.filter(x=>x.result==='committed').length,1);
    assert.equal(outputs.filter(x=>x.result==='conflicted').length,1);
    const stored=readMerchantRailCandidates({file});
    assert.equal(stored.version,2);
    assert.equal(Object.keys(stored.records).length,1);
    assert.equal(stored.provider_authorization_verified,false);
    assert.equal(stored.live_payment_instructions_authorized,false);
    const win=outputs.find(x=>x.result==='committed').rail;
    assert.deepEqual(Object.keys(stored.records),[win]);
    assert.equal(publicMerchantRailReadiness(stored,win).available,false);
    assert.equal(fs.existsSync(file+'.lock'),false);
  }finally{
    for(const child of children)if(child.exitCode===null)child.kill('SIGKILL');
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
