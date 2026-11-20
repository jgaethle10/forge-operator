// Explicit, opt-in Leiland binding for an ALREADY AUTHORIZED Systemia Core
// deployment. Missing input keeps the resident disabled by the existing
// Systemia optional-resident mechanism. No service start, no new authority,
// no publication, no DNS/TLS; only pass three reviewed args to the supervisor.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const LEILAND_CORE_ADMISSION_SCHEMA='evercraft.leiland.core-binding.v1';
const SHA=/^[0-9a-f]{40}$/;
const KEYS=new Set(['enabled','release_sha','publication_root']);
const fail=code=>{throw Error(code)};
const within=(root,target)=>{
 const rel=path.relative(root,target);
 return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);
};
function realDirectory(value,code){
 if(typeof value!=='string'||!path.isAbsolute(value))fail(code);
 const full=path.resolve(value);
 let s,real;
 try{s=fs.lstatSync(full);real=fs.realpathSync(full)}catch{fail(code)}
 if(!s.isDirectory()||s.isSymbolicLink()||real!==full)fail(code);
 return {full,s};
}
// Test-friendly source binding: test checkoutSha only when it is provided
// *explicitly* to the function, never from caller-supplied admission JSON.
export function resolveLeilandCoreBindings({
 admission,releaseRef,repoRoot,workspaceRoot,checkoutSha
}={}){
 if(admission===undefined||admission===null)return Object.freeze({});
 if(!admission||typeof admission!=='object'||Array.isArray(admission)||
    Object.keys(admission).some(key=>!KEYS.has(key))||admission.enabled!==true)
  fail('leiland_admission_invalid');
 if(typeof releaseRef!=='string'||!SHA.test(releaseRef)||
    typeof admission.release_sha!=='string'||!SHA.test(admission.release_sha)||
    admission.release_sha!==releaseRef)
  fail('leiland_release_pin_invalid');
 const repo=realDirectory(repoRoot,'leiland_checkout_root_invalid').full;
 const canonical=realDirectory(path.join(repo,'public'),'leiland_static_public_root_invalid').full;
 const realRelease=checkoutSha??(()=>{try{
  return execFileSync('git',['-C',repo,'rev-parse','HEAD'],{
   encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']
  }).trim()
 }catch{fail('leiland_checkout_revision_unavailable')}})();
 if(realRelease!==admission.release_sha)fail('leiland_deployed_release_mismatch');
 const workspace=realDirectory(workspaceRoot,'leiland_workspace_root_invalid').full;
 const publication=realDirectory(admission.publication_root,'leiland_publication_root_invalid');
 if(!within(workspace,publication.full)||
    publication.full===repo||within(repo,publication.full)||
    publication.full===canonical||within(canonical,publication.full))
  fail('leiland_publication_outside_admitted_workspace');
 // Publisher and host identities remain separate: no group/world writes on the
 // approved public projections root and no implicit creation of its contents.
 if((publication.s.mode&0o022)!==0)fail('leiland_publication_directory_insecure');
 if(typeof process.getuid==='function'&&publication.s.uid!==process.getuid())
  fail('leiland_publication_directory_owner_mismatch');
 return Object.freeze({
  LEILAND_STATIC_PUBLIC_ROOT:canonical,
  LEILAND_PUBLICATION_ROOT:publication.full,
  LEILAND_RELEASE_SHA:admission.release_sha
 });
}
