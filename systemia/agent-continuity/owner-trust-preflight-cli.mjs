#!/usr/bin/env node
// Owner configuration is loaded from a distinct runner environment variable.
// It MUST NOT be read from the downloaded producer artifact. Secrets are not
// printed. This read-only preflight cannot mutate Systemia/Passport or deploy.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {assessOwnerTrustAnchor} from './owner-trust-preflight.mjs';
function hold(msg){throw Error('BLACKBOX_OWNER_PREFLIGHT_HELD: '+msg);}
const filename=process.argv[2];
if(!filename)hold('requires artifact path');
const bytes=readFileSync(resolve(filename),'utf8');
if(Buffer.byteLength(bytes)>131072)hold('artifact larger than policy');
const artifact=JSON.parse(bytes);
const owner_pinned_sha256=String(process.env.BLACKBOX_OWNER_TRUST_SHA256||'').trim()||null;
const encoded=String(process.env.BLACKBOX_OWNER_PUBLIC_TRUST_JSON||'').trim();
if(encoded.length>12000)hold('owner trust config oversized');
let configured_public_trust=null;
if(encoded){
 try{configured_public_trust=JSON.parse(encoded);}catch{hold('independently configured public trust invalid JSON');}
}
const answer=assessOwnerTrustAnchor({artifact,configured_public_trust,owner_pinned_sha256});
if(answer.release_authorized!==false||answer.execution_authority!=='NONE_READ_ONLY')hold('read-only admission boundary violated');
process.stdout.write(JSON.stringify(answer,null,2)+'\n');
