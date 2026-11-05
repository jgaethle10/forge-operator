/** Offline FIRST-CONTACT evidence/mission integrity check. No network or dispatch. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {evaluateCaseReadiness} from "./case-readiness.mjs";

const directory=path.dirname(fileURLToPath(import.meta.url));
const ensure=(condition,message)=>{
  if(!condition) throw Error("first_contact_validation: "+message);
};
const readJSON=name=>JSON.parse(fs.readFileSync(path.join(directory,name),"utf8"));
const https=value=>typeof value==="string" && /^https:\/\/[^\s/]+\/[^\s]+$/u.test(value);
const noDup=(values,label)=>{
  ensure(new Set(values).size===values.length,"duplicate "+label);
};
function audit(){
  const mission=readJSON("mission-intake.json");
  ensure(mission.mission_id==="FIRST-CONTACT-001","mission id mismatch");
  ensure(mission.repository==="jgaethle10/forge-operator","repository mismatch");
  ensure(mission.branch==="research/first-contact-uap-001","branch mismatch");
  ensure(mission.evidence_status==="NO_VERIFIED_EXTRATERRESTRIAL_TECHNOLOGY","unexpected evidence assertion");
  ensure(Array.isArray(mission.deliverables)&&mission.deliverables.length>0,"no work packages");
  const ids=mission.deliverables.map(item=>item.id);
  noDup(ids,"work package id");
  for(const task of mission.deliverables){
    ensure(typeof task.acceptance==="string"&&task.acceptance.length>10,"missing task acceptance");
    for(const dep of task.dependencies||[]) ensure(ids.includes(dep),"unknown dependency "+dep);
  }
  if(mission.execution_state==="NOT_DISPATCHED"){
    ensure(mission.agent_assignments_state==="UNASSIGNED","agent status conflicts with no-dispatch");
  }else{
    ensure(Array.isArray(mission.execution_receipts)&&mission.execution_receipts.length>0,
      "dispatch state requires auditable execution receipts");
  }
  const cases=readJSON("cases.json");
  ensure(cases.project===mission.mission_id,"case project mismatch");
  ensure(cases.verified_extraterrestrial_technology===false,"unsupported origin claim");
  ensure(Array.isArray(cases.records)&&cases.records.length>0,"no case records");
  noDup(cases.records.map(x=>x.id),"case id");
  for(const c of cases.records){
    ensure(typeof c.id==="string"&&c.id.trim(),"blank case id");
    ensure(Array.isArray(c.sources)&&c.sources.length>0&&c.sources.every(https),
      "missing official / accessible https reference for "+c.id);
  }
  const publicIndex=readJSON("public-case-intake-2026-11-04.json");
  ensure(publicIndex.project===mission.mission_id,"public index mission mismatch");
  ensure(Array.isArray(publicIndex.sources)&&publicIndex.sources.every(s=>https(s.url)),
    "bad public index references");
  noDup(publicIndex.records.map(x=>x.id),"public case id");
  for(const c of publicIndex.records){
    ensure(https(c.source_url),"missing https source for "+c.id);
    ensure(publicIndex.sources.some(s=>s.url===c.source_url),"unregistered citation for "+c.id);
    const readiness=evaluateCaseReadiness({id:c.id,facts:c.facts});
    ensure(readiness.extraordinaryPerformanceEstablished===false &&
           readiness.extraterrestrialOriginEstablished===false,"unexpected evidence promotion");
  }
  return {ok:true,schema:"evercraft.first-contact.offline-research-validation.v1",
    caseCount:cases.records.length,publicCaseCount:publicIndex.records.length,
    workPackages:mission.deliverables.length,
    state:mission.execution_state,externalExecution:false,networkAccess:false,
    interpretation:"Pass validates machine-readable research contracts; not scientific proof or independent peer review"};
}
const result=audit();
console.log(JSON.stringify(result,null,2));
