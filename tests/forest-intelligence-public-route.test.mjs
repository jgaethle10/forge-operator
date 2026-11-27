import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {serveForestIntelligence} from '../systemia/mcp/forest-intelligence-public-route.mjs';
const repoRoot=fileURLToPath(new URL('../',import.meta.url));
function request(url,method='GET',root=repoRoot){
 const result={status:null,headers:null,body:null};
 const handled=serveForestIntelligence({url,method},{writeHead(s,h){result.status=s;result.headers=h},end(b){result.body=b}}, {repoRoot:root});
 return {...result,handled};
}
test('exact public routes expose only the approved explanatory HTML',()=>{
 for(const url of ['/forest-intelligence','/forest-intelligence/','/forest-intelligence/index.html']){
  const r=request(url);assert.equal(r.handled,true);assert.equal(r.status,200);
  const s=r.body.toString();assert.match(s,/Restoration observatory/i);assert.match(s,/1\.25M/);assert.match(s,/foresthealthtracker\.dnr\.wa\.gov/);assert.match(s,/rights review/);
  assert.doesNotMatch(s,/27,238|1,241,853|\.private\.html|localhost|<script\b|base44/i);
  assert.equal(r.headers['x-content-type-options'],'nosniff');assert.match(r.headers['content-security-policy'],/default-src 'none'/);
  assert.equal(r.headers['content-length'],r.body.length);
 }
});
test('HEAD is bodyless, mutations are rejected, unrelated paths not handled',()=>{
 assert.equal(request('/forest-intelligence/','HEAD').body,undefined);
 assert.equal(request('/forest-intelligence/','POST').status,405);
 for(const url of ['/forest-intelligence/atlas.private.html','/forest-intelligence/private.json','/forest-intelligence/../private.json','/api/forest-intelligence','/forest-intelligence-extra'])assert.equal(request(url).handled,false);
});
test('missing public artifact fails closed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'forest-public-test-'));
 try{assert.equal(request('/forest-intelligence/','GET',dir).status,503)}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('shared runtime contains exact route import and hook',()=>{
 const s=fs.readFileSync(path.join(repoRoot,'systemia/mcp/fabric-local-runtime.mjs'),'utf8');
 assert.match(s,/import \{ serveForestIntelligence \} from '\.\/forest-intelligence-public-route\.mjs'/);
 assert.match(s,/if \(serveForestIntelligence\(req,res,\{repoRoot:ownedPublicRoot\}\)\) return;/);
});
