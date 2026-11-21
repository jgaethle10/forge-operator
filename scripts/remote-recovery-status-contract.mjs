/**
 * Fail-closed shape validation for a *read-only* Evercraft Remote Operator
 * status response. A valid response is one narrow protocol observation,
 * not proof of Node002 identity, enrollment, authorized broker route or job.
 */
const allowedPrograms=new Set(['git','npm','systemctl','journalctl']);
export function assessRemoteOperatorStatus(body){
  const fail=(reason)=>({
    accepted:false,reason,
    operator_schema:null,instance_id_present:false,
    bounded_nonroot_verified:false,credentials_exposed:false,
    actual_node_identity_verified:false,broker_device_enrollment_verified:false,
    cross_node_dispatch_verified:false,
  });
  if(!body||typeof body!=='object'||Array.isArray(body))return fail('status_not_object');
  if(body.schema!=='evercraft.remote-operator.status.v1'||body.ok!==true)
    return fail('unexpected_status_contract');
  const exec=body.execution;
  if(!exec||exec.mode!=='bounded-program'||exec.interactive_tty!==false||
     exec.root_privilege!==false||exec.ambient_secret_environment_forwarded!==false)
    return fail('unsafe_execution_authority');
  if(!Array.isArray(exec.programs)||exec.programs.length===0||
     exec.programs.length>allowedPrograms.size||
     exec.programs.some(p=>typeof p!=='string'||!allowedPrograms.has(p))||
     new Set(exec.programs).size!==exec.programs.length)
    return fail('unknown_execution_program');
  if(!Array.isArray(body.roots)||body.roots.length===0||body.roots.length>16||
     body.roots.some(k=>typeof k!=='string'||!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(k))||
     new Set(body.roots).size!==body.roots.length)
    return fail('invalid_root_keys');
  if(typeof body.instance_id!=='string'||!/^remote_operator_[a-f0-9]{20}$/.test(body.instance_id))
    return fail('invalid_operator_instance');
  if(body.filesystem?.sensitive_path_read_block!==true)
    return fail('sensitive_path_boundary_missing');
  return {
    accepted:true,reason:null,
    operator_schema:'evercraft.remote-operator.status.v1',
    instance_id_present:true, // never print the raw instance id from a remote response
    bounded_nonroot_verified:true,
    root_count:body.roots.length,
    allowed_programs:[...exec.programs].sort(),
    credentials_exposed:false,
    actual_node_identity_verified:false,
    broker_device_enrollment_verified:false,
    cross_node_dispatch_verified:false,
  };
}
