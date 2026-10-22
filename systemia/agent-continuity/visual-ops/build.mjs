import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVisualOpsPacket } from './packet.mjs';

const here=dirname(fileURLToPath(import.meta.url));
export function renderVisualOpsHTML(template, packet) {
  if((template.match(/__OPS_PACKET_JSON__/g)||[]).length!==1)
    throw new Error('Expected exactly one safe data insertion point');
  if(packet.schema!=='evercraft.agent-continuity.visual-ops.v1' || packet.mode!=='SYNTHETIC_REPLAY' ||
    packet.live!==false || packet.read_only!==true)
    throw new Error('Refusing to render an unaudited incident packet');
  const json=JSON.stringify(packet).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')
    .replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return template.replace('__OPS_PACKET_JSON__',json);
}
export function buildHTML(fixture, assessment, template=readFileSync(resolve(here,'studio.html'),'utf8')) {
  return renderVisualOpsHTML(template,buildVisualOpsPacket(fixture,assessment));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length!==5) throw new Error('Usage: node build.mjs <scenario.json> <blackbox-assessment.json> <output.html>');
    const fixture=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8'));
    const assessment=JSON.parse(readFileSync(resolve(process.argv[3]),'utf8'));
    const html=buildHTML(fixture,assessment);
    const target=resolve(process.argv[4]);
    mkdirSync(dirname(target),{recursive:true});
    writeFileSync(target,html,{flag:'w',mode:0o600});
    process.stdout.write('Synthetic read-only visual operations built: '+target+'\n');
  } catch(error) { console.error('Build rejected:',error.message); process.exitCode=1; }
}
