import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const source = readFileSync(new URL("./index.html", import.meta.url), "utf8");
test("atlas page's embedded module parses as valid modern JavaScript",()=>{
 const moduleSource=source.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(moduleSource,"module script must exist");
 const out=spawnSync(process.execPath,["--input-type=module","--check"],{input:moduleSource,encoding:"utf8",timeout:4000});
 assert.equal(out.status,0,out.stderr);
});
test("interactive controls, evidence labels and source links are present",()=>{
 for(const id of ["map","selectKuril","selectCascadia","toggleQuakes","toggleInundation","toggleEvacuation",
  "dataStatus","eventCount","generatedTime","eventList","evidenceText"]){
  assert.ok(source.includes('id="'+id+'"'),"missing control: "+id);
 }
 for(const evidence of ["USGS","Washington Geological Survey","2019–24","not a prediction",
   "modeled inundation","official","tsunami.gov"]){
  assert.ok(source.toLowerCase().includes(evidence.toLowerCase()),"missing evidence text: "+evidence);
 }
});
test("research preview is not presenting unofficial alerts or countdowns",()=>{
 assert.ok(source.includes("Research prototype"));
 assert.ok(source.includes("not an emergency service"));
 assert.ok(source.includes("Systemia mission admission pending"));
 assert.equal(source.includes("earthquake countdown timer"),false);
});
