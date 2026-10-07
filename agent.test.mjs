import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { DEFAULT_NEBIUS_MODEL,normalizeRepairMission,repairRepository,requestNemotronRepair,runVerification } from "./agent.mjs";
function fakeNemotron(plan){const calls=[];const fetchImpl=async(url,options={})=>{calls.push({url:String(url),headers:options.headers,body:JSON.parse(options.body||"{}")});return{ok:true,status:200,async text(){return JSON.stringify({id:"chatcmpl-fixture",model:DEFAULT_NEBIUS_MODEL,choices:[{message:{content:JSON.stringify(plan)}}]});}};};fetchImpl.calls=calls;return fetchImpl;}
test("mission blocks path escape and requires argv verification",()=>{assert.throws(()=>normalizeRepairMission({repository_path:".",allowed_files:["../secret"],verify_command:["node","x"]}),/unsafe_relative_path/);assert.throws(()=>normalizeRepairMission({repository_path:".",allowed_files:["a.mjs"],verify_command:[]}),/verify_command_argv_required/);});
test("Nemotron request uses Token Factory and never exposes key in provider receipt",async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"runbook-request-"));try{fs.writeFileSync(path.join(root,"a.mjs"),"export const x=1;\n");const mission=normalizeRepairMission({repository_path:root,allowed_files:["a.mjs"],verify_command:[process.execPath,"--version"]});const fetchImpl=fakeNemotron({diagnosis:"fixture",done:true,edits:[]});const result=await requestNemotronRepair({mission,verification:{ok:false,stderr:"fixture"},files:[{file:"a.mjs",content:"export const x=1;\n"}],round:1},{fetchImpl,apiKey:"nebius-secret-fixture-abcdefghijklmnopqrstuvwxyz",baseUrl:"https://api.tokenfactory.nebius.com/v1"});assert.equal(fetchImpl.calls[0].url,"https://api.tokenfactory.nebius.com/v1/chat/completions");assert.equal(fetchImpl.calls[0].headers.authorization,"Bearer nebius-secret-fixture-abcdefghijklmnopqrstuvwxyz");assert.equal(fetchImpl.calls[0].body.model,DEFAULT_NEBIUS_MODEL);assert.equal(JSON.stringify(result.provider).includes("nebius-secret-fixture"),false);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test("agent repairs an allowed file, reruns real tests, and emits a receipt",async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"runbook-repair-"));try{fs.writeFileSync(path.join(root,"answer.mjs"),"export const answer = 1;\n");fs.writeFileSync(path.join(root,"answer.test.mjs"),['import test from "node:test";','import assert from "node:assert/strict";','import { answer } from "./answer.mjs";','test("answer",()=>assert.equal(answer,2));',"",].join("\n"));const fetchImpl=fakeNemotron({diagnosis:"The fixture value is one instead of two.",done:false,edits:[{file:"answer.mjs",search:"export const answer = 1;",replace:"export const answer = 2;"}]});const result=await repairRepository({repository_path:root,allowed_files:["answer.mjs"],verify_command:[process.execPath,"--test","answer.test.mjs"],max_rounds:2},{fetchImpl,apiKey:"fixture-nebius-key-abcdefghijklmnopqrstuvwxyz"});assert.equal(result.state,"repaired_and_verified");assert.equal(result.final_verification.ok,true);assert.deepEqual(result.files_changed,["answer.mjs"]);assert.equal(result.rollback_performed,false);assert.match(result.receipt_hash,/^sha256:/);assert.match(fs.readFileSync(path.join(root,"answer.mjs"),"utf8"),/answer = 2/);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test("model cannot edit outside the mission allowlist",async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"runbook-boundary-"));try{fs.writeFileSync(path.join(root,"allowed.mjs"),"export const x=1;\n");fs.writeFileSync(path.join(root,"secret.mjs"),"export const secret=1;\n");fs.writeFileSync(path.join(root,"fail.test.mjs"),['import test from "node:test";','import assert from "node:assert/strict";','test("fail",()=>assert.equal(1,2));',"",].join("\n"));const fetchImpl=fakeNemotron({diagnosis:"Try touching secret.",done:false,edits:[{file:"secret.mjs",search:"secret=1",replace:"secret=2"}]});const result=await repairRepository({repository_path:root,allowed_files:["allowed.mjs"],verify_command:[process.execPath,"--test","fail.test.mjs"],max_rounds:1},{fetchImpl,apiKey:"fixture-nebius-key-abcdefghijklmnopqrstuvwxyz"});assert.equal(result.state,"held_error");assert.equal(result.rollback_performed,true);assert.match(result.error_code,/not_allowed/);assert.equal(fs.readFileSync(path.join(root,"secret.mjs"),"utf8"),"export const secret=1;\n");}finally{fs.rmSync(root,{recursive:true,force:true});}});

test("verification scrubs recursive Node test-runner control variables",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"runbook-env-"));
  const prior=process.env.NODE_TEST_CONTEXT;
  try{
    fs.writeFileSync(path.join(root,"env-check.mjs"),'if(process.env.NODE_TEST_CONTEXT) process.exit(7);\n');
    process.env.NODE_TEST_CONTEXT="child-v8";
    const mission=normalizeRepairMission({
      repository_path:root,
      allowed_files:["env-check.mjs"],
      verify_command:[process.execPath,"env-check.mjs"],
    });
    const result=await runVerification(mission);
    assert.equal(result.ok,true);
    assert.equal(result.exit_code,0);
  }finally{
    if(prior===undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT=prior;
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test("nested node --test cannot false-green when parent runner control variables are present",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"runbook-nested-red-"));
  const keys=["NODE_TEST_CONTEXT","NODE_TEST_REPORTER","NODE_TEST_REPORTER_DESTINATION"];
  const prior=Object.fromEntries(keys.map((key)=>[key,process.env[key]]));
  try{
    fs.writeFileSync(path.join(root,"allowed.mjs"),"export const untouched = true;\n");
    fs.writeFileSync(path.join(root,"nested.test.mjs"),[
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'test("must really execute",()=>assert.equal(1,2));',
      "",
    ].join("\n"));
    process.env.NODE_TEST_CONTEXT="child-v8";
    process.env.NODE_TEST_REPORTER="spec";
    process.env.NODE_TEST_REPORTER_DESTINATION="stdout";
    const mission=normalizeRepairMission({
      repository_path:root,
      allowed_files:["allowed.mjs"],
      verify_command:[process.execPath,"--test","nested.test.mjs"],
    });
    const result=await runVerification(mission);
    assert.equal(result.ok,false);
    assert.equal(result.exit_code,1);
    assert.match(result.stdout,/# tests 1/);
    assert.match(result.stdout,/# pass 0/);
    assert.match(result.stdout,/# fail 1/);
  }finally{
    for(const key of keys){
      if(prior[key]===undefined) delete process.env[key];
      else process.env[key]=prior[key];
    }
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test("repair receipt proves real red, bounded repair, and real green rerun",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"runbook-proof-"));
  try{
    fs.writeFileSync(path.join(root,"answer.mjs"),"export const answer = 1;\n");
    fs.writeFileSync(path.join(root,"answer.test.mjs"),[
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { answer } from "./answer.mjs";',
      'test("answer",()=>assert.equal(answer,2));',
      "",
    ].join("\n"));
    const fetchImpl=fakeNemotron({
      diagnosis:"The fixture value is one instead of two.",
      done:false,
      edits:[{file:"answer.mjs",search:"export const answer = 1;",replace:"export const answer = 2;"}],
    });
    const result=await repairRepository({
      repository_path:root,
      allowed_files:["answer.mjs"],
      verify_command:[process.execPath,"--test","answer.test.mjs"],
      max_rounds:2,
    },{fetchImpl,apiKey:"fixture-nebius-key-abcdefghijklmnopqrstuvwxyz"});
    assert.equal(result.initial_verification.ok,false);
    assert.equal(result.initial_verification.exit_code,1);
    assert.match(result.initial_verification.stdout,/# tests 1/);
    assert.match(result.initial_verification.stdout,/# fail 1/);
    assert.equal(result.state,"repaired_and_verified");
    assert.equal(result.final_verification.ok,true);
    assert.equal(result.final_verification.exit_code,0);
    assert.match(result.final_verification.stdout,/# tests 1/);
    assert.match(result.final_verification.stdout,/# pass 1/);
    assert.match(result.final_verification.stdout,/# fail 0/);
    assert.equal(result.rounds[0].state,"verified");
    assert.deepEqual(result.files_changed,["answer.mjs"]);
    assert.equal(result.rollback_performed,false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test("outside-allowlist repair is held and rollback follows a real red verification",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"runbook-boundary-proof-"));
  try{
    fs.writeFileSync(path.join(root,"allowed.mjs"),"export const x=1;\n");
    fs.writeFileSync(path.join(root,"secret.mjs"),"export const secret=1;\n");
    fs.writeFileSync(path.join(root,"fail.test.mjs"),[
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'test("fail",()=>assert.equal(1,2));',
      "",
    ].join("\n"));
    const fetchImpl=fakeNemotron({
      diagnosis:"Try touching secret.",
      done:false,
      edits:[{file:"secret.mjs",search:"secret=1",replace:"secret=2"}],
    });
    const result=await repairRepository({
      repository_path:root,
      allowed_files:["allowed.mjs"],
      verify_command:[process.execPath,"--test","fail.test.mjs"],
      max_rounds:1,
    },{fetchImpl,apiKey:"fixture-nebius-key-abcdefghijklmnopqrstuvwxyz"});
    assert.equal(result.initial_verification.ok,false);
    assert.equal(result.initial_verification.exit_code,1);
    assert.match(result.initial_verification.stdout,/# tests 1/);
    assert.match(result.initial_verification.stdout,/# fail 1/);
    assert.equal(result.state,"held_error");
    assert.equal(result.rollback_performed,true);
    assert.match(result.error_code,/not_allowed/);
    assert.equal(fs.readFileSync(path.join(root,"allowed.mjs"),"utf8"),"export const x=1;\n");
    assert.equal(fs.readFileSync(path.join(root,"secret.mjs"),"utf8"),"export const secret=1;\n");
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

