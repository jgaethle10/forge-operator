import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {publicDemandRefreshBindings,selectPublicDemandBrowserCache} from '../systemia/revenue-desk/public-demand-browser-bindings.mjs';
test('refresh requires explicit local opt-in, both owned native paths and document-link support',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'demand-native-bind-'));
 try{
  const sourceDir=path.join(dir,'source'),browsersPath=path.join(dir,'browsers');
  fs.mkdirSync(path.join(sourceDir,'node_modules','playwright'),{recursive:true,mode:0o700});fs.mkdirSync(browsersPath,{mode:0o700});
  const run=(enabled=true,cache=browsersPath)=>publicDemandRefreshBindings({enabled,sourceDir,browsersPath:cache});
  const empty={SYSTEMIA_PUBLIC_DEMAND_BROWSER_SOURCE:'',SYSTEMIA_PUBLIC_DEMAND_BROWSER_CACHE:''};
  assert.deepEqual(run(false),empty);assert.deepEqual(run(),empty);
  for(const f of ['server.mjs','document-link-contract.mjs','node_modules/playwright/package.json'])fs.writeFileSync(path.join(sourceDir,f),'fixture',{mode:0o600});
  assert.deepEqual(run(),{SYSTEMIA_PUBLIC_DEMAND_BROWSER_SOURCE:sourceDir,SYSTEMIA_PUBLIC_DEMAND_BROWSER_CACHE:browsersPath});
  const link=path.join(dir,'link');fs.symlinkSync(browsersPath,link);assert.deepEqual(run(true,link),empty);
  fs.chmodSync(browsersPath,0o777);assert.deepEqual(run(),empty);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('owner cache mode selects one fixed path and unknown modes fail closed',()=>{
 const home='/home/operator',organismRoot='/home/operator/state/organism';
 assert.equal(selectPublicDemandBrowserCache({mode:'home-playwright',home,organismRoot}),home+'/.cache/ms-playwright');
 assert.equal(selectPublicDemandBrowserCache({mode:'organism',home,organismRoot}),organismRoot+'/browser-runtime/browsers');
 assert.equal(selectPublicDemandBrowserCache({mode:'/tmp/arbitrary',home,organismRoot}),null);
 assert.equal(selectPublicDemandBrowserCache({mode:'home-playwright',home:'relative'}),null);
 assert.equal(publicDemandRefreshBindings({enabled:true,sourceDir:home,browsersPath:null}).SYSTEMIA_PUBLIC_DEMAND_BROWSER_CACHE,'');
});
