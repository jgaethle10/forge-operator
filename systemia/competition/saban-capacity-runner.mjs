import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { YardOperator } from "../yard/operator.mjs";
import { buildCompetitionCapacityMissionSnapshot, ensureCompetitionBrowserCapacity } from "./saban-capacity-runtime.mjs";

function arg(name,fallback=""){
  const index=process.argv.indexOf(name);
  return index>=0?String(process.argv[index+1]||""):fallback;
}
function atomicJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o750});
  const tmp=file+"."+process.pid+".tmp";
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+"\n",{mode:0o600});
  fs.renameSync(tmp,file);
}
function gitHead(root=process.cwd()){
  try{
    const dotGit=path.join(root,".git");
    const head=fs.readFileSync(path.join(dotGit,"HEAD"),"utf8").trim();
    if(/^[a-f0-9]{40,64}$/i.test(head)) return head;
    const match=head.match(/^ref:\s+(.+)$/);
    if(!match) return "";
    const refPath=path.join(dotGit,match[1]);
    if(fs.existsSync(refPath)){
      const value=fs.readFileSync(refPath,"utf8").trim();
      if(/^[a-f0-9]{40,64}$/i.test(value)) return value;
    }
    const packed=path.join(dotGit,"packed-refs");
    if(fs.existsSync(packed)){
      for(const line of fs.readFileSync(packed,"utf8").split(/\r?\n/)){
        const [value,ref]=line.trim().split(/\s+/,2);
        if(ref===match[1]&&/^[a-f0-9]{40,64}$/i.test(value)) return value;
      }
    }
  }catch{}
  return "";
}

const yardState=path.resolve(arg(
  "--yard-state",
  process.env.SYSTEMIA_YARD_STATE_DIR||
  process.env.EVERCRAFT_YARD_STATE_DIR||
  "artifacts/yard"
));
const brokerDeploymentId=arg(
  "--broker-deployment",
  process.env.SYSTEMIA_REMOTE_BROKER_DEPLOYMENT_ID||
  process.env.EVERCRAFT_REMOTE_CAPACITY_BROKER_DEPLOYMENT_ID||
  ""
);
const deploymentId=arg(
  "--deployment-id",
  process.env.SYSTEMIA_COMPETITION_BROWSER_DEPLOYMENT_ID||"competition-browser-worker"
);
const releaseRef=arg(
  "--release-ref",
  process.env.SYSTEMIA_COMPETITION_BROWSER_RELEASE_REF||
  process.env.EVERCRAFT_RELEASE_SHA||
  process.env.GITHUB_SHA||
  gitHead()||
  ""
);
const rollbackTarget=arg(
  "--rollback-target",
  process.env.SYSTEMIA_COMPETITION_BROWSER_ROLLBACK_TARGET||releaseRef
);
const out=path.resolve(arg(
  "--out",
  process.env.SYSTEMIA_COMPETITION_SABAN_CAPACITY_RECEIPT||
  "artifacts/competition-provider/capacity/latest.json"
));
const leaseTtlMs=Number(arg(
  "--lease-ttl-ms",
  process.env.SYSTEMIA_COMPETITION_BROWSER_LEASE_TTL_MS||String(30*60_000)
));
const missionSnapshotFile=path.join(path.dirname(out),"mission-snapshot.json");

function readJsonIfExists(file){
  try{
    return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):null;
  }catch{
    return null;
  }
}
function persist(receipt){
  atomicJson(out,receipt);
  const snapshot=buildCompetitionCapacityMissionSnapshot(
    receipt,
    readJsonIfExists(missionSnapshotFile)
  );
  atomicJson(missionSnapshotFile,snapshot);
  process.stdout.write(JSON.stringify({
    ...receipt,
    mission_snapshot:missionSnapshotFile,
    founder_action_required:snapshot.founder_action_required,
  })+"\n");
}

if(!brokerDeploymentId){
  const heldBody={
    schema:"evercraft.systemia.competition-saban-capacity.v1",
    state:"held_broker_unconfigured",
    route:["systemia","competition_control_plane","saban","yard","evercraft_compute"],
    zero_spend_only:true,
    paid_market_order_authorized:false,
    paid_lease_authorized:false,
    payment_attempted:false,
    authority_material_persisted:false,
    base44_used:false,
    next_action:"continue_saban_capacity_discovery",
    observed_at:new Date().toISOString(),
  };
  const held={
    ...heldBody,
    receipt_hash:"sha256:"+createHash("sha256")
      .update(JSON.stringify(heldBody))
      .digest("hex"),
  };
  persist(held);
}else{
  const yard=new YardOperator({stateDir:yardState});
  const receipt=await ensureCompetitionBrowserCapacity({
    yard,
    brokerDeploymentId,
    deploymentId,
    releaseRef,
    rollbackTarget,
    leaseTtlMs,
  });
  persist(receipt);
}
