#!/usr/bin/env node
// Detached verification subprocess for a READ-ONLY LAB evidence chain.
// Standard input: JSON {bundle, trust, scope}; no private signing keys.
// The output attests only cryptographic agreement with the PROVIDED public-key
// trust configuration, not independent Passport enrollment or live services.
import {readFileSync} from 'node:fs';
import {verifyLabChain} from './detached-receipt-chain.mjs';
let src;
try{src=readFileSync(0,'utf8');}
catch{throw Error('BLACKBOX_DETACHED_VERIFIER_HELD: read failed');}
if(Buffer.byteLength(src)>131072)throw Error('BLACKBOX_DETACHED_VERIFIER_HELD: input too large');
let input;
try{input=JSON.parse(src);}catch{throw Error('BLACKBOX_DETACHED_VERIFIER_HELD: invalid JSON');}
if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='bundle,scope,trust')
 throw Error('BLACKBOX_DETACHED_VERIFIER_HELD: unexpected input');
const result=verifyLabChain(input.bundle,input.trust,input.scope);
process.stdout.write(JSON.stringify({...result,process_boundary:'SEPARATE_NODE_PROCESS_ONLY',source_of_trust:'CALLER_SUPPLIED_PUBLIC_KEYS_NOT_PASSPORT_ENROLLED'},null,2)+'\n');
