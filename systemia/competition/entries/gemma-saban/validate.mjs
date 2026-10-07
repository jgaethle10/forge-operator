import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.dirname(fileURLToPath(import.meta.url));
const allowedTools=new Set([
  "run_command","read_file","edit_file","write_file","get_status","submit_patch",
  "get_code_neighbors","search_similar_code","get_code_subgraph"
]);

function must(condition,message){ if(!condition) throw new Error(message); }

export function validateSabanSubmission(){
  const agentPath=path.join(root,"agent.yaml");
  const promptPath=path.join(root,"prompts","system.md");
  const samplingPath=path.join(root,"configs","sampling.yaml");
  for(const file of [agentPath,promptPath,samplingPath]) must(fs.existsSync(file),"required_file_missing:"+path.relative(root,file));

  const agent=fs.readFileSync(agentPath,"utf8");
  const prompt=fs.readFileSync(promptPath,"utf8");
  const sampling=fs.readFileSync(samplingPath,"utf8");

  must(/^name:\s*saban_swe_agent\s*$/m.test(agent),"agent_name_invalid");
  must(/^model:\s*gemma-4-31b-it-qat-w4a16-ct\s*$/m.test(agent),"model_must_be_official_gemma4_variant");
  must(/^instruction:\s*!include\s+prompts\/system\.md\s*$/m.test(agent),"system_prompt_include_missing");
  must(/^generate_content_config:\s*!include\s+configs\/sampling\.yaml\s*$/m.test(agent),"sampling_include_missing");
  must(!/(^|\s)adapter\s*:/m.test(agent),"unverified_adapter_forbidden_in_scaffold");

  const toolLines=[...agent.matchAll(/^\s{2}-\s+([a-z_]+)\s*$/gm)].map(m=>m[1]);
  must(toolLines.length===allowedTools.size,"official_tool_count_mismatch");
  for(const tool of toolLines) must(allowedTools.has(tool),"unsupported_tool:"+tool);
  for(const tool of allowedTools) must(toolLines.includes(tool),"missing_official_tool:"+tool);

  for(const required of [
    "get_status","search_similar_code","get_code_neighbors","get_code_subgraph",
    "edit_file","run_command","submit_patch","git diff"
  ]) must(prompt.includes(required),"prompt_missing_doctrine:"+required);

  must(/temperature:\s*0\.1/.test(sampling),"sampling_temperature_unexpected");
  must(/top_p:\s*0\.95/.test(sampling),"sampling_top_p_unexpected");
  must(!prompt.includes("http://")&&!prompt.includes("https://"),"network_instruction_forbidden");

  const bytes=[agentPath,promptPath,samplingPath].reduce((sum,file)=>sum+fs.statSync(file).size,0);
  return {
    schema:"evercraft.competition.gemma-saban-scaffold-validation.v1",
    ok:true,
    model:"gemma-4-31b-it-qat-w4a16-ct",
    tools:[...allowedTools],
    adapters_declared:false,
    core_bytes:bytes,
    live_kaggle_harness_verified:false,
    note:"Static scaffold validation only. Kaggle harness execution remains gated on competition data/rules access."
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{ process.stdout.write(JSON.stringify(validateSabanSubmission(),null,2)+"\n"); }
  catch(error){ console.error(error instanceof Error?error.message:String(error)); process.exit(1); }
}
