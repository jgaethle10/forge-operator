import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const doctor=fileURLToPath(new URL('../scripts/diagnose-fabric-owned-edge-release.sh',import.meta.url));
function fixture(t,{slash='404',noSlash='404',readiness='404',source=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'fmp-doctor-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'.git'));
 fs.mkdirSync(path.join(root,'bin'));
 fs.mkdirSync(path.join(root,'public','findmypart'),{recursive:true});
 fs.mkdirSync(path.join(root,'systemia','mcp'),{recursive:true});
 if(source){
  fs.writeFileSync(path.join(root,'public','findmypart','index.html'),'FindMyPart');
  fs.writeFileSync(path.join(root,'systemia','mcp','fabric-local-runtime.mjs'),"const findMyPartPath='yes';");
 }
 const fake=[
 '#!/bin/sh',
 'case "$*" in',
 '  *"/api/findmypart/readiness"*) printf "%s" "$FMP_FAKE_READY" ;;',
 '  *"/findmypart/"*) printf "%s" "$FMP_FAKE_SLASH" ;;',
 '  *"/findmypart"*) printf "%s" "$FMP_FAKE_NOSLASH" ;;',
 '  *) exit 1 ;;',
 'esac',
 ].join('\n')+'\n';
 fs.writeFileSync(path.join(root,'bin','curl'),fake,{mode:0o755});
 return {
  root,
  env:{...process.env,PATH:path.join(root,'bin')+':'+process.env.PATH,
   FMP_FAKE_SLASH:slash,FMP_FAKE_NOSLASH:noSlash,FMP_FAKE_READY:readiness}
 };
}
function run(t,state){
 const f=fixture(t,state);
 const result=spawnSync('bash',[doctor,'--repo-root',f.root],{
  env:f.env,encoding:'utf8',timeout:10000
 });
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/doctor_mutation_performed=false/);
 assert.doesNotMatch(result.stdout,/PRIVATE[_-]KEY|SECRET\s*=/);
 return result.stdout;
}
test('doctor isolates resident 404 from source already containing FindMyPart',t=>{
 const report=run(t,{slash:'404',noSlash:'404',readiness:'404'});
 assert.match(report,/findmypart_source_route_available=true/);
 assert.match(report,/findmypart_local_slash_http=404/);
 assert.match(report,/findmypart_diagnosis=local_runtime_not_serving_merged_route/);
});
test('doctor distinguishes local success from public proxy failure',t=>{
 const report=run(t,{slash:'200',noSlash:'200',readiness:'200'});
 assert.match(report,/findmypart_local_readiness_http=200/);
 assert.match(report,/findmypart_diagnosis=local_route_present_check_external_tls_proxy_and_intake_available/);
});
test('doctor refuses to treat a page as operational intake if readiness is not served',t=>{
 const report=run(t,{slash:'200',noSlash:'200',readiness:'404'});
 assert.match(report,/findmypart_diagnosis=frontage_local_but_inquiry_readiness_missing/);
});
test('doctor does not mistake an unavailable service for the wrong source',t=>{
 const report=run(t,{slash:'000',noSlash:'000',readiness:'000'});
 assert.match(report,/findmypart_local_slash_http=000/);
 assert.match(report,/findmypart_diagnosis=route_not_yet_proven/);
});
