import fs from "node:fs"; import path from "node:path"; import { repairRepository } from "./agent.mjs";
const missionFile=process.argv[2]; if(!missionFile){console.error("Usage: node cli.mjs <mission.json>");process.exit(2);}
const mission=JSON.parse(fs.readFileSync(path.resolve(missionFile),"utf8")); const result=await repairRepository(mission); process.stdout.write(JSON.stringify(result,null,2)+"\n"); process.exitCode=result.state==="repaired_and_verified"||result.state==="already_green"?0:1;
