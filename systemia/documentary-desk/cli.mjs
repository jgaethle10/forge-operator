#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compileDocumentaryPlan, assertDocumentaryReleaseReady } from './runtime.mjs';
import { assertOwnedDocumentaryRuntime, documentaryExecutionLanes } from './owned-runtime.mjs';

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}
function writeJson(file, value) {
  const full = path.resolve(file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

const [, , commandOrInput, maybeInput, maybeOutput] = process.argv;

try {
  let command = 'plan';
  let input = commandOrInput;
  let output = maybeInput;

  if (['plan', 'release-check', 'owned-runtime-check'].includes(commandOrInput)) {
    command = commandOrInput;
    input = maybeInput;
    output = maybeOutput;
  }

  if (command === 'owned-runtime-check') {
    const receipt = assertOwnedDocumentaryRuntime(documentaryExecutionLanes());
    console.log(JSON.stringify({ ok: true, ...receipt }, null, 2));
  } else if (command === 'plan') {
    if (!input || !output) throw new Error('usage: documentary-desk plan <brief.json> <plan.json>');
    const plan = compileDocumentaryPlan(readJson(input));
    writeJson(output, plan);
    console.log(JSON.stringify({
      ok: true,
      documentaryId: plan.id,
      releaseState: plan.qa.releaseState,
      runtimeAuthority: plan.systemia.runtimeAuthority,
      externalLegacyRuntimeAllowed: plan.systemia.externalLegacyRuntimeAllowed,
      blockers: plan.qa.blockerCount,
      reviews: plan.qa.reviewCount,
      researchNeeds: plan.researchNeeds.length,
      output: path.resolve(output),
    }, null, 2));
  } else if (command === 'release-check') {
    if (!input || !output) throw new Error('usage: documentary-desk release-check <plan.json> <receipt.json>');
    const receipt = assertDocumentaryReleaseReady(readJson(input));
    writeJson(output, receipt);
    console.log(JSON.stringify({ ok: true, ...receipt, output: path.resolve(output) }, null, 2));
  } else {
    throw new Error('commands: plan, release-check, owned-runtime-check');
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}
