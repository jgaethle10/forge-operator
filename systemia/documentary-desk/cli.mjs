#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { compileDocumentaryPlan, assertDocumentaryReleaseReady } from './runtime.mjs';

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

  if (commandOrInput === 'plan' || commandOrInput === 'release-check') {
    command = commandOrInput;
    input = maybeInput;
    output = maybeOutput;
  }

  if (!input) {
    throw new Error(
      'usage: documentary-desk [plan] <brief.json> <plan.json> | documentary-desk release-check <plan.json> <receipt.json>'
    );
  }

  if (command === 'plan') {
    if (!output) throw new Error('output path required');
    const plan = compileDocumentaryPlan(readJson(input));
    writeJson(output, plan);
    console.log(JSON.stringify({
      ok: true,
      documentaryId: plan.id,
      releaseState: plan.qa.releaseState,
      blockers: plan.qa.blockerCount,
      reviews: plan.qa.reviewCount,
      researchNeeds: plan.researchNeeds.length,
      output: path.resolve(output),
    }, null, 2));
  } else if (command === 'release-check') {
    if (!output) throw new Error('receipt output path required');
    const receipt = assertDocumentaryReleaseReady(readJson(input));
    writeJson(output, receipt);
    console.log(JSON.stringify({ ok: true, ...receipt, output: path.resolve(output) }, null, 2));
  } else {
    throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
