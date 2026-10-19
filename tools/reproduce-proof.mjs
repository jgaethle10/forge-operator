/** File Ferry Week 2: reproducible synthetic, local, no-network integrity demo. */
import {makeLosslessParts, reassemblePieces,sha256,createPlan,MiB} from '../src/core.mjs';
import {writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto) globalThis.crypto=webcrypto;
const output=process.argv[2];
const source=new Uint8Array(4*MiB);
for(let i=0;i<source.length;i++)source[i]=(i*17+i%29)%256;
const input=new Blob([source],{type:'application/octet-stream'});
input.name='synthetic-client-packet.bin';
const budget=0.5*MiB;
const plan=createPlan(input,budget,'exact',false);
const packaged=await makeLosslessParts(input,budget);
const parts=packaged.pieces.map(p=>Object.assign(p.blob,{name:p.name}));
const recovered=await reassemblePieces(packaged.manifest,parts);
const inputHash=await sha256(input);
const recoveredHash=await sha256(recovered.blob);
if(inputHash!==recoveredHash||recovered.blob.size!==input.size)throw new Error('Data fidelity failed');
let tamper='not_checked';
const damaged=new Blob([new Uint8Array([9]),await packaged.pieces[0].blob.slice(1).arrayBuffer()]);
try{await reassemblePieces(packaged.manifest,[Object.assign(damaged,{name:parts[0].name}),...parts.slice(1)]);tamper='missed';}catch(e){tamper=/checksum mismatch/i.test(e.message)?'detected':e.message;}
if(tamper!=='detected')throw new Error('Tamper test failed: '+tamper);
const report={run_type:'LOCAL_SYNTHETIC_TEST_NOT_CUSTOMER_DELIVERY',project:'File Ferry Week 2',tested_at_utc:new Date().toISOString(),source_bytes:input.size,budget_bytes:budget,route:plan.method,parts:packaged.pieces.length,sha256_input:inputHash,sha256_reassembled:recoveredHash,byte_exact_match:inputHash===recoveredHash,tamper_detection:tamper,recipient_provider_delivery:'not_tested',ai_model_inference:'not_tested',secure_origin_browser_execution:'not_tested'};
if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'REPRODUCIBLE_PROOF.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));