import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGoalInwardRecovery,GOAL_RECOVERY_SCHEMA} from './controller-rc05-goal-recovery.mjs';

const args={estimate:{x:10.63,z:.10,heading:0},
  goal:{x:10,z:0},bounds:{xmin:-.7,xmax:10.8,ymin:-2.8,ymax:2.8},
  velocity:{x:0,z:0},scan:[],tracks:[],uncertainty:.055,scanAgeSec:0,
  braking:.5,delaySeconds:.4,robotRadius:.22};
const latched=(reason='geofence_uncertain_hold',active=false)=>({
  decision:{velocity:{x:0,z:0},reason,heading:0,state:{preferredTurn:0},authority:'modeled_only'},
  latch:{active,clearStreak:0,ageTicks:0,recoveryTicks:0},
  cancelPending:false,diagnostic:{phase:'inactive',physicalControl:false}
});

test('RC05G strictly inward recovery is modeled only and reduces inner-fence violation',()=>{
  const r=applyGoalInwardRecovery(args,latched());
  assert.equal(r.decision.reason,'goal_inward_recovery');
  assert.ok(r.decision.velocity.x<0);
  assert.ok(Math.hypot(r.decision.velocity.x,r.decision.velocity.z)<=.16+1e-10);
  assert.ok(r.diagnostic.goalRecovery.newViolation<r.diagnostic.goalRecovery.oldViolation);
  assert.equal(r.diagnostic.goalRecovery.schema,GOAL_RECOVERY_SCHEMA);
  assert.equal(r.diagnostic.goalRecovery.hardwareAuthority,false);
});
test('RC05G preserves existing stale, uncertain, hazard and normal navigation outputs',()=>{
  for(const reason of ['stale_sensor_hold','localization_uncertain_hold','hazard_hold','reactive_heading']){
    const existing=latched(reason);
    assert.equal(applyGoalInwardRecovery(args,existing),existing);
  }
  const active=applyGoalInwardRecovery(args,latched('geofence_uncertain_hold',true));
  assert.equal(active.decision.reason,'geofence_uncertain_hold');
  assert.equal(active.diagnostic.goalRecovery.reason,'active_hazard_latch');
});
test('RC05G rejects stale scans, uncertain pose, outer fence and far-field escapes',()=>{
  const changes=[
    [{scanAgeSec:2},'stale_or_uncertain_localization'],
    [{uncertainty:.3},'stale_or_uncertain_localization'],
    [{estimate:{x:10.799,z:0,heading:0}},'outside_modeled_outer_geofence'],
    [{estimate:{x:10.42,z:0,heading:0}},'outside_recovery_band'],
    [{estimate:{x:7.5,z:0,heading:0}},'not_near_goal']
  ];
  for(const [fields,label] of changes){
    const r=applyGoalInwardRecovery({...args,...fields},latched());
    assert.equal(r.decision.reason,'geofence_uncertain_hold');
    assert.equal(r.diagnostic.goalRecovery.reason,label);
  }
});
test('RC05G uses current anonymous proximity evidence to reject an obstructed inward return',()=>{
  const reading={range:.08,bearing:Math.PI,radius:.45};
  const r=applyGoalInwardRecovery({...args,scan:[reading]},latched());
  assert.equal(r.decision.reason,'geofence_uncertain_hold');
  assert.equal(r.diagnostic.goalRecovery.reason,'not_enough_observed_clearance');
});
test('RC05G cancels outward pending simulated commands before proposing an inward motion',()=>{
  const r=applyGoalInwardRecovery(args,latched(),{pendingCommands:[{x:.4,z:0}]});
  assert.equal(r.cancelPending,true);
  assert.equal(r.decision.reason,'geofence_uncertain_hold');
  assert.equal(r.diagnostic.goalRecovery.reason,'flush_outward_simulated_queue');
});
test('RC05G refuses a recovery request while speed is too high or a moving hazard is predicted',()=>{
  const momentum=applyGoalInwardRecovery({...args,velocity:{x:.4,z:0}},latched());
  assert.equal(momentum.diagnostic.goalRecovery.reason,'braking_inertia_too_high');
  const tracks=[{x:10.38,z:.1,vx:.2,vz:0,radius:.3}];
  const moving=applyGoalInwardRecovery({...args,tracks},latched());
  assert.equal(moving.diagnostic.goalRecovery.reason,'moving_hazard_on_recovery');
});
test('RC05G rejects fabricated/malformed state instead of issuing arbitrary movement',()=>{
  assert.throws(()=>applyGoalInwardRecovery({...args,uncertainty:NaN},latched()),/rc05g_invalid_recovery_inputs/);
  assert.throws(()=>applyGoalInwardRecovery(args,latched(),{pendingCommands:[{x:Infinity,z:0}]}),/rc05g_invalid_recovery_inputs/);
});
test('RC05G allows the final few centimeters of inward recovery without weakening outer bounds',()=>{
  const near={...args,estimate:{x:10.46,z:.10,heading:0}};
  const r=applyGoalInwardRecovery(near,latched());
  assert.equal(r.decision.reason,'goal_inward_recovery');
  assert.ok(r.diagnostic.goalRecovery.newViolation<r.diagnostic.goalRecovery.oldViolation);
  assert.ok(r.diagnostic.goalRecovery.oldViolation<.07);
  const outside=applyGoalInwardRecovery({...args,estimate:{x:10.81,z:0,heading:0}},latched());
  assert.equal(outside.decision.reason,'geofence_uncertain_hold');
});
