import {verifySignedPackage,MAX_PACKAGE_BYTES} from './package-verifier.mjs';
const pkg=document.getElementById('package-file');
const trust=document.getElementById('trusted-key-file');
const action=document.getElementById('verify-package');
const status=document.getElementById('verification-status');
const details=document.getElementById('verification-details');
const save=document.getElementById('save-verified-file');
let verified=null;
function reset(){verified=null;save.hidden=true;details.hidden=true;details.replaceChildren();status.textContent='No file has been verified.'}
pkg.addEventListener('change',reset);trust.addEventListener('change',reset);
action.addEventListener('click',async()=>{
 reset();const a=pkg.files?.[0],b=trust.files?.[0];
 if(!a||!b){status.textContent='Choose both a Passage JSON package and an independently trusted public key.';return}
 if(a.size>MAX_PACKAGE_BYTES||b.size>5000){status.textContent='File too large. No verification performed.';return}
 action.disabled=true;status.textContent='Checking signature, contents and expiry locally…';
 try{
  verified=await verifySignedPackage(await a.text(),await b.text());
  status.textContent='Signature and content match the public key you provided. This does not verify the truth of the article or the origin of your key.';
  const d=verified.metadata;
  for(const [name,value] of [['Title',d.title],['Edition',d.edition],['Expires',d.expires_at],['Rights',d.rights],['Public key fingerprint (SHA-256)',verified.fingerprint_sha256]]){
   const p=document.createElement('p');p.textContent=name+': '+value;details.append(p);
  }
  details.hidden=false;save.hidden=false;
 }catch(error){verified=null;status.textContent='NOT VERIFIED: '+(error instanceof Error?error.message:'Unknown verification failure')}
 finally{action.disabled=false}
});
save.addEventListener('click',()=>{
 if(!verified)return;
 const bytes=new TextEncoder().encode(verified.text);
 const url=URL.createObjectURL(new Blob([bytes],{type:'text/plain;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=verified.metadata.filename;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
});
