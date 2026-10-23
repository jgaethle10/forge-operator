import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCompanyRelationshipSource} from './relationship-composite.mjs';
test('unconfigured relationship sources produce a hold',()=>{
 const result=resolveCompanyRelationshipSource({now:new Date('2026-10-18T07:00:00Z')});
 assert.equal(result.holdReason,'source_not_configured');
});
