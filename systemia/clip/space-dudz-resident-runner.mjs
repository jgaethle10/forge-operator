#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {authorizeSpaceDudzResidentFromReceipt} from './space-dudz-publish-authorize.mjs';
import {emptySpaceDudzResidentState,runSpaceDudzPublishCycle} from './space-dudz-resident.mjs';

function arg(name,fallback=null){const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;}
function readJson(file,fallback){if(!fs.existsSync(file))return fallback;try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);}

const repoRoot=path.resolve(arg('--repo-root',process.env.SYSTEMIA_WORKSPACE_ROOT||'.'));
const credentialStateDir=path.resolve(arg('--credential-state-dir',process.env.EVERCRAFT_CREDENTIAL_STATE_DIR||''));
const passportStateDir=path.resolve(arg('--passport-state-dir',process.env.EVERCRAFT_PASSPORT_STATE_DIR||''));
const campaignPath=arg('--campaign',process.env.SYSTEMIA_SPACE_DUDZ_CAMPAIGN||'systemia/clip/campaigns/space-dudz-orbit-one/campaign.json');
const authorityReceiptFile=path.resolve(arg('--authority-receipt-file',process.env.SYSTEMIA_SPACE_DUDZ_CLIP_AUTHORITY_RECEIPT_FILE||path.join(repoRoot,'systemia','clip','authority','space-dudz-autopublish.json')));
const stateDir=path.resolve(arg('--state-dir',process.env.SYSTEMIA_SPACE_DUDZ_CLIP_STATE_DIR||'artifacts/space-dudz-clip-resident'));
if(!credentialStateDir||!passportStateDir) throw new Error('space_dudz_runtime_state_binding_missing');

const passport=new EvercraftPassport({stateDir:passportStateDir});
const authorityReceipt=JSON.parse(fs.readFileSync(authorityReceiptFile,'utf8'));
const authorityInstall=authorizeSpaceDudzResidentFromReceipt({passport,receipt:authorityReceipt});
const stateFile=path.join(stateDir,'state.json');
const inputState=readJson(stateFile,emptySpaceDudzResidentState());
const result=await runSpaceDudzPublishCycle({
  repoRoot,campaignPath,credentialStateDir,inputState,
  authorize:({scope,resource_ref})=>passport.authorize({
    subject_ref:'system:space-dudz-clip-publisher',
    product:'evercraft-home',
    scope,
    resource_ref,
    at:new Date().toISOString(),
  }),
  maxPublishesPerCycle:1,
});
atomicJson(stateFile,result.state);
atomicJson(path.join(stateDir,'latest.json'),result.snapshot);
process.stdout.write(JSON.stringify({ok:true,authority_install:authorityInstall,...result.snapshot})+'\n');
