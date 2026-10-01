import fs from "node:fs";
import crypto from "node:crypto";
import {validateZone} from "../lib/zone.mjs";

const stable=v=>JSON.stringify(v,Object.keys(v).sort());
export function snapshot(zone){
 validateZone(zone);
 const body={schema:"evercraft.edge.zone-snapshot.v1",zone};
 const digest="sha256:"+crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
 return {...body,digest};
}
export function writeSnapshotAtomic(file,zone){
 const s=snapshot(zone),tmp=file+".tmp";
 fs.writeFileSync(tmp,JSON.stringify(s.zone,null,2)+"\n",{mode:0o600});
 fs.renameSync(tmp,file);
 return s;
}
