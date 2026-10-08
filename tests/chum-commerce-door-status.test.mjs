import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommerceDoorProbe } from '../systemia/chum/commerce-door-status.mjs';

const offers = [{ public_id: 'sample' }, { public_id: 'second' }];
const gateway = 'https://fabric.systemiacommandcenters.com/commerce';
test('a fully readable, configured, non-transactional door probe may pass', () => {
  assert.equal(classifyCommerceDoorProbe({gateway,offers,results:[{valid:true},{valid:true}]}),'pass');
});
test('a declared offer failure must never be written as a passing receipt', () => {
  assert.equal(classifyCommerceDoorProbe({gateway,offers,results:[{valid:true},{valid:false}]}),'fail');
  assert.equal(classifyCommerceDoorProbe({gateway,offers,results:[{valid:true}]}),'fail');
  assert.equal(classifyCommerceDoorProbe({gateway,offers,results:[{valid:true},{valid:undefined}]}),'fail');
});
test('unconfigured and empty offer inventory remain held, not successful', () => {
  assert.equal(classifyCommerceDoorProbe({gateway:null,offers,results:[]}), 'held');
  assert.equal(classifyCommerceDoorProbe({gateway,offers:[],results:[]}), 'held');
});
