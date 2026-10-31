#!/usr/bin/env node
// Read actual Systemia Passport grants and Evercraft's credential vault.
// Never create authority from an editorial direction or claim a post on dry-run.
import path from 'node:path';
import {EvercraftPassport} from '../passport/passport.mjs';
import {resolveFacebookPageCredential} from './facebook-page-credential-resolver.mjs';
import {runWorkSabanFacebookCycle} from './work-saban-facebook-resident.mjs';
import {WORK_SABAN_SUBJECT} from './work-saban-publish-authorize.mjs';
const arg=(key,fallback='')=>{
  const i=process.argv.indexOf(key);
  return i<0?fallback:(process.argv[i+1]||fallback);
};
const env=process.env,fire=process.argv.includes('--fire');
const repoRoot=path.resolve(arg('--repo-root',env.SYSTEMIA_WORKSPACE_ROOT||'.'));
const stateDir=arg('--state-dir',env.SYSTEMIA_WORK_SABAN_CLIP_STATE_DIR||'');
const credentialStateDir=arg('--credential-state-dir',env.EVERCRAFT_CREDENTIAL_STATE_DIR||'');
const passportStateDir=arg('--passport-state-dir',env.EVERCRAFT_PASSPORT_STATE_DIR||'');
const expectedPageId=arg('--expected-facebook-page-id',env.EVERCRAFT_CLIP_WORK_SABAN_FACEBOOK_PAGE_ID||'');
const missing=[
 ['SYSTEMIA_WORK_SABAN_CLIP_STATE_DIR',stateDir],
 ['EVERCRAFT_CREDENTIAL_STATE_DIR',credentialStateDir],
 ['EVERCRAFT_PASSPORT_STATE_DIR',passportStateDir],
 ['EVERCRAFT_CLIP_WORK_SABAN_FACEBOOK_PAGE_ID',expectedPageId]
].filter(([,v])=>!v).map(([n])=>n);
if(fire&&missing.length){
 process.stdout.write(JSON.stringify({status:'blocked_runtime_configuration',fire,missing,post_submitted:false})+'\n');
 process.exit(0);
}
const passport=fire?new EvercraftPassport({stateDir:path.resolve(passportStateDir)}):null;
const r=await runWorkSabanFacebookCycle({
 repoRoot,stateDir:path.resolve(stateDir||path.join(process.cwd(),'.work-saban-clip-dryrun')),
 expectedPageId,fire,
 authorize:fire?({scope,resource_ref})=>passport.authorize({
   subject_ref:WORK_SABAN_SUBJECT,product:'evercraft-home',
   scope,resource_ref,at:new Date().toISOString()
 }):undefined,
 credentialResolver:fire?()=>resolveFacebookPageCredential({
   credentialStateDir:path.resolve(credentialStateDir)
 }):undefined
});
process.stdout.write(JSON.stringify(r)+'\n');
