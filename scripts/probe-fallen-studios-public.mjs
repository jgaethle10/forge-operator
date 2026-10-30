#!/usr/bin/env node
// Read-only public smoke test. No form submit, card entry, upload, or social action.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ORIGIN="https://jgaethle10.github.io/forge-operator/";
export const routes=[
 {name:"fallen_studios_public_home",path:"fallen-studios/",markers:["Fallen Studios | Original commercials by Evercraft","Your story deserves","../commercial-studio/#inquire"]},
 {name:"existing_commercial_inquiry",path:"commercial-studio/",markers:["$50 Small Business Commercial","id=\"studio-request\"","api/commercial-studio/inquiry"]}
];
export function evaluate({status,finalUrl,body},route){
 const issues=[];
 try{const u=new URL(finalUrl);if(u.protocol!=="https:"||u.origin!=="https://jgaethle10.github.io"||!u.pathname.startsWith("/forge-operator/"))issues.push("unexpected_origin")}catch{issues.push("invalid_url")}
 if(status!==200)issues.push("not_http_200");
 for(const marker of route.markers)if(!String(body).includes(marker))issues.push("missing_marker:"+marker.slice(0,40));
 return {state:issues.length?"UNVERIFIED":"PUBLIC_GET_VERIFIED",issues};
}
async function main(){
 const receipt={schema:"evercraft.fallen.public-studio-canary.v1",date:new Date().toISOString(),
  method:"read_only_external_https_get",social_posted:false,paid_order_verified:false,
  submitted_inquiry:false,customer_data_sent:false,rows:[],state:"UNVERIFIED"};
 for(const route of routes){
  try{const r=await fetch(ORIGIN+route.path,{signal:AbortSignal.timeout(14000),redirect:"follow",headers:{"user-agent":"Evercraft-Fallen-Studios-ReadOnly-Canary/1.0"}});
   const body=(await r.text()).slice(0,200000);
   receipt.rows.push({name:route.name,http:r.status,...evaluate({status:r.status,finalUrl:r.url,body},route)});
  }catch(error){receipt.rows.push({name:route.name,state:"UNVERIFIED",issues:["connection_error"],error_name:error?.name||"unknown"});}
 }
 receipt.state=receipt.rows.every(x=>x.state==="PUBLIC_GET_VERIFIED")?"PUBLIC_STUDIO_AND_INTAKE_VERIFIED":"PUBLIC_STUDIO_ROUTE_INCOMPLETE";
 const out=process.env.FALLEN_STUDIOS_PUBLIC_RECEIPT||"/tmp/fallen-studios-public-canary.json";
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(receipt,null,2)+"\n");
 console.log(JSON.stringify(receipt,null,2));
 if(process.argv.includes("--gate")&&receipt.state!=="PUBLIC_STUDIO_AND_INTAKE_VERIFIED")process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
