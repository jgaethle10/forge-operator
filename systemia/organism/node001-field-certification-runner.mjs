#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { evaluateNode001FieldMissionFromDirectory } from './node001-field-certification.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

const dir = path.resolve(arg('--dir', 'artifacts/node001-field/megatron'));
const out = path.resolve(arg('--out', 'artifacts/node001-field/megatron-status'));
const result = evaluateNode001FieldMissionFromDirectory({
  dir,
  candidateKey: arg('--candidate', 'megatron-node001-candidate'),
  issueRef: arg('--issue', 'github:issue:175'),
});

atomicJson(path.join(out, 'latest.json'), result.mission);
atomicJson(path.join(out, 'mission-snapshot.json'), result.mission_snapshot);

console.log(JSON.stringify({
  ok: true,
  schema: result.mission.schema,
  status: result.mission.status,
  progress: result.mission.progress,
  next_step: result.mission.next_step,
  next_action: result.mission.next_action,
  human_field_action_required: result.mission.human_field_action_required,
  mission_snapshot: path.join(out, 'mission-snapshot.json'),
}, null, 2));
