// NextGen-only one-time retrieval: requires locally held Fallen Ed25519 signing key.
// Defaults to inspection only. --fetch performs a signed claim and writes ciphertext
// to an exclusive private file after verifying independent pinned SHA-256.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const URL_PIN='https://fabric.systemiacommandcenters.com/api/internal/wing-enrollment/v1/fallen';
const expected='b3c4dbc7e2cf167291257d64bab60b174763b3512f5fed4da4e14580ff4a4491';
const fp='eebd0eb18ff928eaee284fa9b584bd9d981e2091c40fb1708d8129a94799867a';
const fail=x=>{throw Error('fallen_bootstrap_'+x);};
function privateKey(file){
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))fail('key_not_private');
 const key=crypto.createPrivateKey(fs.readFileSync(file));
 if(key.asymmetricKeyType!=='ed25519')fail('signer_type_invalid');
 return key;
}
export async function retrieveFallenBootstrap({url=URL_PIN,signingKeyFile,outputFile,fetchImpl=fetch}={}){
 if(url!==URL_PIN)fail('unapproved_origin');
 if(!outputFile||!path.isAbsolute(outputFile)||fs.existsSync(outputFile))fail('output_must_be_new_absolute');
 const key=privateKey(signingKeyFile);
 const get=await fetchImpl(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(get.status!==200)fail('challenge_http_'+get.status);
 const raw=await get.text();if(raw.length>2048)fail('challenge_too_large');
 const challenge=JSON.parse(raw);
 if(challenge.schema!=='evercraft.wing-courier.enrollment-challenge.v1'||!(/^[0-9a-f]{48}$/).test(challenge.nonce)||
    challenge.sha256!==expected||challenge.recipientFingerprint!==fp||
    !Number.isFinite(Date.parse(challenge.expiresAt))||Date.parse(challenge.expiresAt)<Date.now()||
    Date.parse(challenge.expiresAt)>Date.now()+121000)fail('challenge_invalid');
 const statement=Buffer.from(JSON.stringify({schema:'evercraft.wing-courier.enrollment-claim.v1',nonce:challenge.nonce,sha256:expected,recipientFingerprint:fp}));
 const signature=crypto.sign(null,statement,key).toString('base64');
 const response=await fetchImpl(url,{method:'POST',redirect:'manual',
  headers:{'content-type':'application/json'},body:JSON.stringify({nonce:challenge.nonce,signature}),
  signal:AbortSignal.timeout(12000)});
 if(response.status!==200)fail('delivery_http_'+response.status);
 const body=await response.text();if(body.length>140000)fail('delivery_oversized');
 const delivery=JSON.parse(body);
 if(delivery.schema!=='evercraft.wing-courier.enrollment-delivery.v1'||delivery.sha256!==expected||
    typeof delivery.payloadBase64!=='string')fail('delivery_contract_invalid');
 const bytes=Buffer.from(delivery.payloadBase64,'base64');
 if(bytes.length>65536||crypto.createHash('sha256').update(bytes).digest('hex')!==expected)
  fail('delivery_integrity_invalid');
 const parsed=JSON.parse(bytes.toString('utf8'));
 if(parsed.schema!=='evercraft.fallen.receiver-enrollment.v1'||parsed.recipientFingerprint!==fp)
  fail('recipient_invalid');
 const parent=fs.lstatSync(path.dirname(outputFile));
 if(!parent.isDirectory()||parent.isSymbolicLink()||(parent.mode&0o077))fail('output_dir_not_private');
 fs.writeFileSync(outputFile,bytes,{flag:'wx',mode:0o600});
 return {schema:'evercraft.wing-courier.bootstrap-retrieval.v1',status:'CIPHERTEXT_VERIFIED',sha256:expected,bytes:bytes.length,
  receiverCredentialInstalled:false,authenticatedReceiverVerified:false,customerTransferAuthorized:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [flag,signingKeyFile,outputFile]=process.argv.slice(2);
 if(flag!=='--fetch'){console.log('HELD: explicit --fetch <private-fallen-sign.key> <new-private-output.enc.json> required');process.exit(0);}
 try{console.log(JSON.stringify(await retrieveFallenBootstrap({signingKeyFile,outputFile}),null,2));}
 catch(e){console.error(e.message);process.exitCode=2;}
}
