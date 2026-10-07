import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {auditRivetHostingMigration} from '../systemia/migrations/rivet-hosting/brand-fidelity-audit.mjs';

const root='public/rivet';
const exact={
  '/rivet/brand.json':fs.readFileSync(root+'/brand.json'),
  '/rivet/brand.css':fs.readFileSync(root+'/brand.css'),
  '/rivet/':fs.readFileSync(root+'/index.html')
};

async function serve({driftCss=false}={}){
  const server=http.createServer((req,res)=>{
    let body=exact[req.url];
    if(!body){
      res.writeHead(404);res.end('not found');return;
    }
    if(driftCss&&req.url==='/rivet/brand.css') body=Buffer.concat([body,Buffer.from('\n/* unauthorized drift */\n')]);
    const type=req.url.endsWith('.json')?'application/json':req.url.endsWith('.css')?'text/css':'text/html';
    res.writeHead(200,{'content-type':type});
    res.end(body);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  return {
    origin:'http://127.0.0.1:'+address.port,
    close:()=>new Promise(resolve=>server.close(()=>resolve()))
  };
}

const local=await auditRivetHostingMigration();
assert.equal(local.migration_authority_granted,false);
assert.equal(local.local.brand_contract_verified,true);
assert.equal(local.target,null);

const good=await serve();
try{
  const receipt=await auditRivetHostingMigration({targetOrigin:good.origin});
  assert.equal(receipt.target.zero_brand_drift_gate,'pass');
  assert.equal(receipt.target.brand_assets_exact,true);
  assert.equal(receipt.target.brand_manifest_verified,true);
  assert.equal(receipt.target.page_contract_verified,true);
}finally{
  await good.close();
}

const bad=await serve({driftCss:true});
try{
  await assert.rejects(
    ()=>auditRivetHostingMigration({targetOrigin:bad.origin}),
    /exact approved asset drift brand\.css/
  );
}finally{
  await bad.close();
}

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet.hosting-migration-audit-test.v1',
  local_baseline:true,
  exact_target_passes:true,
  altered_brand_asset_fails:true,
  deployment_authority:false
},null,2));
