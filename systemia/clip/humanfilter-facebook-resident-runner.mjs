#!/usr/bin/env node
// First-party Evercraft Clip HumanFilter resident, with real Passport + vault checks.
// No raw credentials, test attestation, or release approval stored in repository.
import fs from 'node:fs';
import path from 'node:path';
import { EvercraftPassport } from '../passport/passport.mjs';
import { installHumanFilterClipGrant } from './humanfilter-publish-authorize.mjs';
import { resolveFacebookPageCredential } from './facebook-page-credential-resolver.mjs';
import { runHumanFilterFacebookCycle } from './humanfilter-facebook-resident.mjs';

const arg=(key,fallback='')=>{
  const i=process.argv.indexOf(key);
  return i<0?fallback:(process.argv[i+1]||fallback);
};
const repoRoot=path.resolve(arg('--repo-root',process.env.SYSTEMIA_WORKSPACE_ROOT||'.'));
const stateDir=arg('--state-dir',process.env.SYSTEMIA_HUMANFILTER_CLIP_STATE_DIR||'');
const credentialStateDir=arg('--credential-state-dir',process.env.EVERCRAFT_CREDENTIAL_STATE_DIR||'');
const passportStateDir=arg('--passport-state-dir',process.env.EVERCRAFT_PASSPORT_STATE_DIR||'');
const expectedPageId=arg('--expected-facebook-page-id',process.env.EVERCRAFT_CLIP_HUMANFILTER_FACEBOOK_PAGE_ID||'');
const fire=process.argv.includes('--fire');
if(!stateDir||!credentialStateDir||!passportStateDir){
  process.stdout.write(JSON.stringify({status:'blocked_runtime_configuration',fire,
    missing:['SYSTEMIA_HUMANFILTER_CLIP_STATE_DIR','EVERCRAFT_CREDENTIAL_STATE_DIR','EVERCRAFT_PASSPORT_STATE_DIR']
      .filter((name,i)=>!([stateDir,credentialStateDir,passportStateDir][i]))})+'\n');
  process.exit(0);
}
const passport=new EvercraftPassport({stateDir:path.resolve(passportStateDir)});
const authorityFile=path.resolve(repoRoot,'systemia/clip/authority/humanfilter-autopublish.json');
const grant=installHumanFilterClipGrant({passport,receipt:JSON.parse(fs.readFileSync(authorityFile,'utf8'))});
const result=await runHumanFilterFacebookCycle({
  repoRoot,stateDir:path.resolve(stateDir),expectedPageId,fire,
  credentialResolver:()=>resolveFacebookPageCredential({credentialStateDir:path.resolve(credentialStateDir)}),
  authorize:({scope,resource_ref})=>passport.authorize({
    subject_ref:'system:humanfilter-clip-publisher',product:'evercraft-home',
    scope,resource_ref,at:new Date().toISOString(),
  })
});
process.stdout.write(JSON.stringify({grant_status:grant.status,...result})+'\n');
// Fail safely for blocked conditions: resident supervisor can retry at next cycle
// only BEFORE any claim has been written. An ambiguous provider attempt is held.
