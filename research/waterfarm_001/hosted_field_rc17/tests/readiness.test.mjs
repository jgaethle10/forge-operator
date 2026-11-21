import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceReadiness,RC17_CACHE} from '../app/readiness.mjs';
const minimal={location:{protocol:'file:'},isSecureContext:false};
test('file preview never calls itself device-ready',async()=>{
 const r=await deviceReadiness(minimal);
 assert.equal(r.https_origin,false);assert.equal(r.worker_controls_this_page,false);
 assert.equal(r.certified_native_iphone,false);assert.equal(r.certified_offline_relaunch,false);
 assert.equal(r.verified_field_measurements,false);
});
test('secure browser with supported APIs STILL does not certify persistence',async()=>{
 const r=await deviceReadiness({location:{protocol:'https:'},isSecureContext:true,indexedDB:{open(){}},navigator:{serviceWorker:{register(){},controller:{scriptURL:'/sw.js'}},storage:{async persisted(){return true}}},caches:{async has(k){assert.equal(k,RC17_CACHE);return true;}}});
 assert.equal(r.storage_persistence_granted,'BROWSER_REPORTS_PERSISTENT_NOT_GUARANTEED');
 assert.equal(r.app_shell_cache_present,'PRESENT_NOT_VERIFIED_COMPLETE');
 assert.equal(r.certified_native_iphone,false);assert.equal(r.certified_offline_relaunch,false);
 assert.equal(JSON.stringify(r).includes('meter_id'),false);
});
test('inaccessible caches and storage produce explicit unknown states without throwing',async()=>{
 const r=await deviceReadiness({location:{protocol:'https:'},isSecureContext:true,navigator:{storage:{async persisted(){throw Error('denied')}}},caches:{async has(){throw Error('denied')}}});
 assert.equal(r.app_shell_cache_present,'INACCESSIBLE');assert.equal(r.storage_persistence_granted,'INACCESSIBLE');
});
