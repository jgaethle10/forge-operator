import assert from 'node:assert/strict';
import { resolveDiscoveryLane } from './discovery-lane-policy.mjs';

const ok = { robots_allowed:true, live:{checked:true,ok:true,status:200} };
const dead = { robots_allowed:true, live:{checked:true,ok:false,status:404} };
const blocked = { robots_allowed:false, live:{checked:true,ok:true,status:200} };

assert.deepEqual(resolveDiscoveryLane({origin:ok,fallback:null,lane:'search'}).route,'origin');
assert.equal(resolveDiscoveryLane({origin:dead,fallback:ok,lane:'search'}).blocked,false);
assert.equal(resolveDiscoveryLane({origin:dead,fallback:ok,lane:'search'}).recovered_by_fallback,true);
assert.deepEqual(resolveDiscoveryLane({origin:dead,fallback:ok,lane:'search'}).route,'chum_mirror_fallback');
assert.equal(resolveDiscoveryLane({origin:dead,fallback:dead,lane:'search'}).blocked,true);
assert.equal(resolveDiscoveryLane({origin:blocked,fallback:ok,lane:'user_fetch'}).blocked,false);
assert.equal(resolveDiscoveryLane({origin:dead,fallback:null,lane:'agent_crawl'}).blocked,true);
assert.equal(resolveDiscoveryLane({origin:dead,fallback:ok,lane:'robots_policy_only'}).blocked,false);

console.log(JSON.stringify({ok:true,policy:'CHUM mirror fallback preserves discovery without claiming origin runtime health'}));
