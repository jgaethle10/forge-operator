import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseEcologyEndpoint,describeCaptureError} from './wa-source-diagnose.mjs';
const sourceKey='wa-county-disposal-1994-2024';
test('diagnostic stops at redirect and excludes query values',async()=>{
 const r=await diagnoseEcologyEndpoint({sourceKey,fetcher:async(url,options)=>{
  assert.equal(options.redirect,'manual');
  return new Response(null,{status:302,headers:{location:'https://ecology.wa.gov/example.xlsx?token=fixture-secret'}});
 }});
 assert.equal(r.httpStatus,302);
 assert.equal(r.redirectFollowed,false);assert.equal(r.bodyCaptured,false);
 assert.equal(r.redirectTarget.hasQuery,true);
 assert.equal(r.redirectTarget.path,'/example.xlsx');
 assert.ok(!JSON.stringify(r).includes('fixture-secret'));
});
test('sanitized nested transport codes preserve DNS error without raw error prose',async()=>{
 const e=new TypeError('fetch failed',{cause:Object.assign(new Error('fixture-private-path'),{code:'ENOTFOUND'})});
 const r=await diagnoseEcologyEndpoint({sourceKey,fetcher:async()=>{throw e}});
 assert.equal(r.status,'transport_failed');assert.deepEqual(r.causeCodes,['ENOTFOUND']);
 assert.ok(!JSON.stringify(r).includes('fixture-private-path'));
 assert.equal(describeCaptureError(new Error('private_directory_required')).knownReason,'private_directory_required');
 await assert.rejects(diagnoseEcologyEndpoint({sourceKey:'unknown'}),/source_not_allowlisted/);
});
