#!/usr/bin/env node
// Read-only external Evercraft Research customer-surface canary.
// Public GET only. Never submits a question, quote request, file or payment.
import {writeFileSync,mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const ORIGIN="https://jgaethle10.github.io/forge-operator/research/";
export const ASSETS=Object.freeze([
 {path:"",name:"customer_website",expected:["Evercraft Research","Prepare my research brief","scope.mjs"]},
 {path:"scope.mjs",name:"scope_engine",expected:["prepareResearchScope","researchPerformed:false","orderCreated:false"]},
 {path:"ai-discovery.json",name:"discovery",expected:["evercraft.research.public-product.v1","human_scoping_only","checkout_url"]},
 {path:"llms.txt",name:"llm_discovery",expected:["Evercraft Research","No purchase or charge"]},
 {path:"share/",name:"founder_share_kit",expected:["Evercraft Research | Launch Share Kit","Download PNG","Copy caption","captions.json"]},
 {path:"share/captions.json",name:"share_copy",expected:["evercraft.research.share-kit.v1","personal","company","prepared_not_published"]}
]);
export function evaluatePublicAsset({status,final_url,content_type,body},asset){
 const findings=[];
 let url;try{url=new URL(final_url)}catch{findings.push("INVALID_FINAL_URL");}
 if(!url||url.protocol!=="https:"||url.host!=="jgaethle10.github.io"||!url.pathname.startsWith("/forge-operator/research/"))findings.push("WRONG_PUBLIC_ORIGIN");
 if(status!==200)findings.push("HTTP_NOT_200");
 if(!/(text\/html|text\/plain|text\/javascript|application\/javascript|application\/json|application\/octet-stream)/i.test(String(content_type)))findings.push("CONTENT_TYPE_UNEXPECTED");
 for(const marker of asset.expected)if(!String(body).includes(marker))findings.push("MISSING_MARKER_"+marker.replace(/[^a-zA-Z0-9]+/g,"_").toUpperCase());
 return {state:findings.length?"UNVERIFIED":"PUBLIC_GET_VERIFIED",findings};
}
async function main(){
 const receipt={schema:"evercraft.research.public-canary.v1",observed_at:new Date().toISOString(),origin:ORIGIN,method:"read_only_https_get",submitted_question:false,customer_data_sent:false,payment_attempted:false,research_run:false,paid_order_verified:false,delivery_verified:false,rows:[],state:"UNVERIFIED"};
 for(const asset of ASSETS){
  const url=ORIGIN+asset.path;
  try{
   const response=await fetch(url,{method:"GET",headers:{"accept":"text/html,application/json,text/plain","user-agent":"Evercraft-Research-Public-Canary/1.0"},signal:AbortSignal.timeout(12000)});
   const body=(await response.text()).slice(0,200000);
   const result=evaluatePublicAsset({status:response.status,final_url:response.url,content_type:response.headers.get("content-type"),body},asset);
   receipt.rows.push({asset:asset.name,http_status:response.status,...result});
  }catch(error){receipt.rows.push({asset:asset.name,state:"UNVERIFIED",findings:["NETWORK_OR_TIMEOUT"],error_kind:error?.name||"unknown"});}
 }
 receipt.state=receipt.rows.length===ASSETS.length&&receipt.rows.every(r=>r.state==="PUBLIC_GET_VERIFIED")?"PUBLIC_RESEARCH_SURFACES_VERIFIED":"PUBLIC_RESEARCH_SURFACES_INCOMPLETE";
 const out=resolve(process.env.EVERCRAFT_RESEARCH_CANARY_RECEIPT||"/tmp/evercraft-research-public-canary.json");
 mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify({receipt_path:out,...receipt},null,2));
 if(process.argv.includes("--gate")&&receipt.state!=="PUBLIC_RESEARCH_SURFACES_VERIFIED")process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
