import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  readSplitIdentityRequests,publishSplitIdentityOutcome,
} from '../systemia/saban/split-identity-protocol.mjs';
import {
  publishSplitIdentityRequests,importSplitIdentityOutcomes,
} from '../systemia/saban/split-identity-handoff.mjs';
import {YardOperator} from '../systemia/yard/operator.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const load=file=>fs.readFileSync(path.join(repoRoot,file),'utf8');

test('Yard import path does not eagerly load Saban private queue or intent execution modules',()=>{
  const consumer=load('systemia/yard/split-identity-request-consumer.mjs');
  const operator=load('systemia/yard/operator.mjs');
  const protocol=load('systemia/saban/split-identity-protocol.mjs');
  const handoff=load('systemia/saban/split-identity-handoff.mjs');
  const preMethod=operator.slice(0,operator.indexOf('export class YardOperator'));
  assert.ok(preMethod.includes("from './capacity-resolver.mjs'"));
  assert.doesNotMatch(preMethod,/from ['"]\.\.\/saban\/nodeseed-intent-executor\.mjs/);
  assert.match(operator,/await import\('\.\.\/saban\/nodeseed-intent-executor\.mjs'\)/);
  assert.match(consumer,/from '\.\.\/saban\/split-identity-protocol\.mjs'/);
  assert.doesNotMatch(consumer,/from '\.\.\/saban\/split-identity-handoff\.mjs'/);
  assert.doesNotMatch(protocol,/from '\.\/ambient-work-queue\.mjs'|from '\.\/nodeseed-execution-intent\.mjs'/);
  assert.match(handoff,/from '\.\/ambient-work-queue\.mjs'/);
  assert.match(handoff,/from '\.\/split-identity-protocol\.mjs'/);
  assert.equal(typeof readSplitIdentityRequests,'function');
  assert.equal(typeof publishSplitIdentityOutcome,'function');
  assert.equal(typeof publishSplitIdentityRequests,'function');
  assert.equal(typeof importSplitIdentityOutcomes,'function');
  assert.equal(typeof YardOperator,'function');
});
