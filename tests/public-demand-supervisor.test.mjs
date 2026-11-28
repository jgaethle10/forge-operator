import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SystemiaCoreResidentSupervisor} from '../systemia/core/resident-supervisor.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const key='kaidance-public-demand-documents';
const config=JSON.parse(fs.readFileSync(path.join(root,'systemia/core/resident-services.json'),'utf8'));
test('canonical document cycle is optional, five-minute and runs only with both bindings',async()=>{
 const candidates=config.services.filter(x=>x.service_key===key);
 assert.equal(candidates.length,1);
 const c=candidates[0];
 assert.equal(c.cadence_seconds,300);assert.equal(c.optional_when_unconfigured,true);
 assert.deepEqual(c.env_args,{'--root':'SYSTEMIA_PUBLIC_DEMAND_RESEARCH_ROOT','--inbox':'SYSTEMIA_PUBLIC_DEMAND_DOCUMENT_INBOX'});
 assert.deepEqual(c.optional_env_args,{'--browser-source':'SYSTEMIA_PUBLIC_DEMAND_BROWSER_SOURCE','--browser-cache':'SYSTEMIA_PUBLIC_DEMAND_BROWSER_CACHE'});
 const tmp=fs.mkdtempSync(path.join(root,'.public-demand-supervisor-proof-'));
 const cfg=path.join(tmp,'config.json'),state=path.join(tmp,'state'),research=path.join(tmp,'research'),inbox=path.join(research,'document-inbox.json');
 fs.mkdirSync(research,{mode:0o700});
 fs.writeFileSync(inbox,JSON.stringify({schema:'evercraft.public-demand.document-inbox.v1',captures:[]}),{mode:0o600});
 fs.writeFileSync(cfg,JSON.stringify({...config,services:[c]}),{mode:0o600});
 let supervisor;
 try{
  supervisor=new SystemiaCoreResidentSupervisor({repoRoot:root,configPath:cfg,stateDir:state,env:{PATH:process.env.PATH}});
  supervisor.start({immediateCycles:true});
  assert.equal(supervisor.health().services[0].status,'disabled');
  await supervisor.stop();
  supervisor=new SystemiaCoreResidentSupervisor({repoRoot:root,configPath:cfg,stateDir:state,env:{PATH:process.env.PATH,SYSTEMIA_PUBLIC_DEMAND_RESEARCH_ROOT:research,SYSTEMIA_PUBLIC_DEMAND_DOCUMENT_INBOX:inbox}});
  supervisor.start({immediateCycles:true});
  const until=Date.now()+10000;
  while(supervisor.health().services[0].last_completed_at===null&&Date.now()<until)await new Promise(r=>setTimeout(r,25));
  const health=supervisor.health().services[0];
  assert.equal(health.status,'idle');
  assert.equal(health.last_exit_code,0);
  assert.equal(health.run_count,1);
  assert.ok(health.last_receipt_hash.startsWith('sha256:'));
 }finally{if(supervisor)await supervisor.stop();fs.rmSync(tmp,{recursive:true,force:true});}
});
