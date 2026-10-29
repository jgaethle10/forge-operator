#!/usr/bin/env node
// Research Desk local operator entry: compile an evidence dossier, not an order or shipment.
// Input files may contain sensitive excerpts; never copy them into the public site.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileEvidenceDossier} from "./evidence-dossier.mjs";
export function compileLocalResearch(inputPath,outputDir){
 const input=path.resolve(inputPath),dir=path.resolve(outputDir);
 // Never inadvertently publish customer excerpts through GitHub Pages.
 if(dir.split(path.sep).includes("public"))throw Error("research_output_must_not_be_public");
 const raw=fs.readFileSync(input,"utf8");
 if(raw.length>2_000_000)throw Error("research_job_file_too_large");
 const job=JSON.parse(raw);
 // This CLI does not authenticate Evercraft Web receipts: no observed/public
 // claim can be promoted by the local writer alone.
 const dossier=compileEvidenceDossier(job);
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const markdown=path.join(dir,"evidence-dossier.review-draft.md");
 const receipt=path.join(dir,"evidence-dossier.review-draft.json");
 fs.writeFileSync(markdown,dossier.markdown,{mode:0o600,flag:"wx"});
 fs.writeFileSync(receipt,JSON.stringify(dossier.receipt,null,2)+"\n",{mode:0o600,flag:"wx"});
 return {markdown,receipt,status:dossier.receipt.report_status};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf("--input"),o=process.argv.indexOf("--out");
 if(i<0||o<0||!process.argv[i+1]||!process.argv[o+1]){console.error("Usage: node compile.mjs --input authorized-job.json --out PRIVATE_DIRECTORY");process.exitCode=2}
 else try{console.log(JSON.stringify(compileLocalResearch(process.argv[i+1],process.argv[o+1])))}catch(e){console.error("Research draft not compiled: "+e.message);process.exitCode=1}
}
