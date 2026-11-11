// Self-contained device checks. No network, device IDs, file bodies, or browser fingerprint collection.
const vectorPublic='d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const vectorSignature='e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
const knownSha256='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
function fromHex(hex){return Uint8Array.from(hex.match(/../g),b=>parseInt(b,16))}
function toHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')}
export async function runCryptoSelfCheck(cryptoProvider=globalThis.crypto){
 if(!cryptoProvider?.subtle)throw Error('WebCrypto is unavailable in this browser or file context');
 const subtle=cryptoProvider.subtle;
 const digest=await subtle.digest('SHA-256',new TextEncoder().encode('abc'));
 if(toHex(digest)!==knownSha256)throw Error('SHA-256 known-answer test failed');
 let key;try{key=await subtle.importKey('spki',fromHex('302a300506032b6570032100'+vectorPublic),{name:'Ed25519'},false,['verify'])}
 catch{throw Error('Ed25519 is unavailable in this browser or file context')}
 const signature=fromHex(vectorSignature);
 if(!await subtle.verify({name:'Ed25519'},key,signature,new Uint8Array(0)))throw Error('Ed25519 known-answer test failed');
 if(await subtle.verify({name:'Ed25519'},key,signature,new Uint8Array([0])))throw Error('Altered message passed signature verification');
 return {sha256:'pass',ed25519:'pass',tamper_rejected:'pass'};
}
export function createDeviceReceipt({result,platform='unspecified',reportedOffline=false,packageState='not-tried',at=new Date()}){
 if(!result||!['pass'].every(v=>result.sha256===v&&result.ed25519===v&&result.tamper_rejected===v))throw Error('The local self-check did not pass');
 if(!['unspecified','iphone-ipad','android','desktop','other'].includes(platform))throw Error('Unknown platform category');
 if(!['not-tried','verified-locally','not-verified'].includes(packageState))throw Error('Invalid package check status');
 const time=new Date(at);if(!Number.isFinite(time.getTime()))throw Error('Invalid timestamp');
 return {schema:'evercraft.passage.device-qa.v1',tested_at:time.toISOString(),
  platform_category:platform,offline_manually_confirmed:reportedOffline===true,
  sha256_known_answer:'pass',ed25519_known_answer:'pass',altered_signature_rejected:'pass',
  signed_package_observation:packageState,
  interpretation:'Self-reported lab record only. No trusted publisher identity, device attestation, network assurance, or independent safety certification.'};
}
function wireDeviceQa(){
 const run=document.getElementById('qa-run'),download=document.getElementById('qa-download');
 const resultText=document.getElementById('qa-status'),platform=document.getElementById('qa-platform');
 const offline=document.getElementById('qa-offline');
 if(!run||!download||!resultText||!platform||!offline)return;
 let last=null;
 run.addEventListener('click',async()=>{
  last=null;download.hidden=true;run.disabled=true;resultText.textContent='Checking local SHA-256 and Ed25519 support…';
  try{last=await runCryptoSelfCheck();resultText.textContent='Local cryptography self-check passed. This is not proof the device is offline.';download.hidden=false}
  catch(error){resultText.textContent='UNSUPPORTED OR FAILED: '+(error instanceof Error?error.message:'Unknown error')}
  finally{run.disabled=false}
 });
 download.addEventListener('click',()=>{
  if(!last)return;
  const status=document.getElementById('verification-status')?.textContent||'';
  const packageState=status.includes('Signature, content and independent fingerprint match')?'verified-locally':status.startsWith('NOT VERIFIED')?'not-verified':'not-tried';
  const receipt=createDeviceReceipt({result:last,platform:platform.value,reportedOffline:offline.checked,packageState});
  const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='passage-local-device-test.json';document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
 });
}
if(typeof document!=='undefined')wireDeviceQa();
