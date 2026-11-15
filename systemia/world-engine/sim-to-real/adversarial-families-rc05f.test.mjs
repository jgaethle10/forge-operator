import test from 'node:test';
import assert from 'node:assert/strict';
import {FAMILY_NAMES,FAMILY_SCHEMA,createFamilyScenario,familyMovingInputs} from './adversarial-families-rc05f.mjs';
test('RC05F introduces different obstacle layouts and moving hazard counts',()=>{
  const a=createFamilyScenario(101,'crossing-lanes'),b=createFamilyScenario(101,'offset-slalom');
  assert.deepEqual(FAMILY_NAMES,['crossing-lanes','offset-slalom']);
  assert.equal(a.course.schema,FAMILY_SCHEMA);
  assert.equal(a.world.entities.filter(e=>e.properties?.moving).length,2);
  assert.equal(b.world.entities.filter(e=>e.properties?.moving).length,1);
  assert.notDeepEqual(a.course.obstacles,b.course.obstacles);
  assert.ok(!a.world.entities.some(e=>e.properties?.hardware_execution===true));
});
test('RC05F synthetic course generation is deterministic but seeded',()=>{
  assert.deepEqual(createFamilyScenario(101,'crossing-lanes'),createFamilyScenario(101,'crossing-lanes'));
  assert.notDeepEqual(createFamilyScenario(101,'crossing-lanes').course.obstacles,
    createFamilyScenario(102,'crossing-lanes').course.obstacles);
});
test('RC05F all moving obstacles use tick-bound native velocity inputs and no teleports',()=>{
  for(const family of FAMILY_NAMES){
    const {course,world}=createFamilyScenario(110,family);
    const obstaclesBefore=world.entities.filter(e=>e.id!=='rover');
    const inputs=familyMovingInputs({course,obstaclesBefore,tick:7});
    assert.equal(inputs.length,course.obstacles.filter(o=>o.moving).length);
    assert.ok(inputs.every(x=>x.kind==='set_velocity'&&x.tick===7&&x.value.y===0));
    assert.equal(new Set(inputs.map(x=>x.id)).size,inputs.length);
    assert.equal(world.metadata.hardwareAuthority,false);
  }
});
test('RC05F invalid seeds, family, and missing modeled entity fail closed',()=>{
  assert.throws(()=>createFamilyScenario(0,'crossing-lanes'),/rc05f_invalid_seed/);
  assert.throws(()=>createFamilyScenario(101,'unknown'),/rc05f_invalid_family/);
  const {course}=createFamilyScenario(101,'crossing-lanes');
  assert.throws(()=>familyMovingInputs({course,obstaclesBefore:[],tick:1}),/rc05f_moving_entity_missing/);
});