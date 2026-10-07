import { validateAdapterManifest } from './equipment-adapter.mjs';

const REQUIRED_COMMAND_CLASSES=Object.freeze({
  mobile:['hold','resume','navigate_to_zone'],
  haul:['hold','resume','navigate_to_zone','haul','dump'],
  loading:['hold','resume','load']
});

export function runAdapterConformance({manifest,profile='mobile'}={}) {
  const checks=[];
  const add=(id,pass,detail)=>checks.push({id,pass:Boolean(pass),detail});

  const schema=validateAdapterManifest(manifest);
  add('manifest.valid',schema.ok,schema.ok?'manifest accepted':schema.errors.join('; '));

  const required=REQUIRED_COMMAND_CLASSES[profile] ?? REQUIRED_COMMAND_CLASSES.mobile;
  for(const command of required){
    add(`command.${command}`,manifest?.commands?.includes(command),`profile ${profile} requires ${command}`);
  }

  add('telemetry.heartbeat',manifest?.telemetry?.includes('heartbeat_at'),'adapter must report heartbeat timestamp');
  add('telemetry.position',manifest?.telemetry?.includes('position'),'adapter must report position');
  add('telemetry.state',manifest?.telemetry?.includes('state'),'adapter must report machine state');

  const physical=manifest?.authority_states?.includes('bounded_physical');
  if(physical){
    add('physical.independent_stop',manifest?.safety?.independent_stop===true,'independent stop required');
    add('physical.heartbeat_fail_safe',manifest?.safety?.heartbeat_fail_safe===true,'heartbeat fail-safe required');
    add('physical.operator_takeover',manifest?.safety?.operator_takeover===true,'operator takeover required');
    add('physical.watchdog',manifest?.safety?.adapter_watchdog===true,'adapter watchdog required');
    add('physical.timeout_stop',manifest?.safety?.local_stop_on_command_timeout===true,'local timeout stop required');
  }

  const passed=checks.filter(x=>x.pass).length;
  const failed=checks.length-passed;
  return {
    schema:'evercraft.earthworks.adapter-conformance-report.v1',
    adapter_id:manifest?.id ?? null,
    profile,
    state:failed===0?'conformant':'nonconformant',
    passed,
    failed,
    checks,
    badge_eligible:failed===0,
    authority_note:'Conformance means interface compatibility with this contract. It is not machine certification or site safety approval.'
  };
}
