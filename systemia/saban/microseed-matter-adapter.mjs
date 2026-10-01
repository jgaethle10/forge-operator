import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync=promisify(nodeExecFile);
const TOKEN=/^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
const ID=/^(?:0x[0-9a-fA-F]+|[0-9]+)$/;

function clean(v){return String(v??'').trim();}
function safeToken(v,label){
  const value=clean(v);
  if(!TOKEN.test(value)) throw new Error('matter_'+label+'_invalid');
  return value;
}
function safeId(v,label){
  const value=clean(v);
  if(!ID.test(value)) throw new Error('matter_'+label+'_invalid');
  return value;
}
function bounded(value,max=256*1024){
  const text=String(value??'');
  if(Buffer.byteLength(text)>max) throw new Error('matter_adapter_output_too_large');
  return text;
}

export function buildMatterCommand({
  capability,
  operation,
  payload,
}={}){
  const matter=capability?.metadata?.matter;
  if(!matter) throw new Error('matter_operation_metadata_required');
  const mapping=matter.operations?.[operation];
  if(!mapping) throw new Error('matter_operation_mapping_required');

  const cluster=safeToken(mapping.cluster,'cluster');
  const nodeId=safeId(mapping.node_id??matter.node_id,'node_id');
  const endpoint=safeId(mapping.endpoint??matter.endpoint,'endpoint');
  const type=String(mapping.type||'read');

  if(type==='read'){
    const attribute=safeToken(mapping.attribute,'attribute');
    return [cluster,'read',attribute,nodeId,endpoint];
  }
  if(type==='command'){
    const command=safeToken(mapping.command,'command');
    const declaredArgs=Array.isArray(mapping.args)?mapping.args:[];
    const args=declaredArgs.map((arg,index)=>{
      if(typeof arg==='string'&&arg.startsWith('$payload.')){
        const key=arg.slice('$payload.'.length);
        const value=payload?.[key];
        if(value===undefined) throw new Error('matter_payload_field_missing:'+key);
        const out=String(value);
        if(out.length>256||/[\r\n\0]/.test(out)) throw new Error('matter_payload_value_invalid');
        return out;
      }
      const out=String(arg);
      if(out.length>256||/[\r\n\0]/.test(out)) throw new Error('matter_declared_argument_invalid:'+index);
      return out;
    });
    return [cluster,command,...args,nodeId,endpoint];
  }
  throw new Error('matter_operation_type_invalid');
}

export function createMicroSeedMatterAdapter({
  chipTool='chip-tool',
  execFileImpl=execFileAsync,
  timeoutMs=15000,
}={}){
  return {
    async invokeCapability({
      manifest,
      capability,
      operation,
      payload,
      approval_ref,
    }={}){
      if(manifest?.bridge_mode!=='matter') throw new Error('microseed_matter_manifest_required');
      const mapping=capability?.metadata?.matter?.operations?.[operation];
      if(!mapping) throw new Error('matter_operation_mapping_required');
      if(
        String(mapping.type||'read')==='command' &&
        capability.kind==='actuation' &&
        !clean(approval_ref)
      ){
        throw new Error('microseed_matter_actuation_approval_required');
      }

      const args=buildMatterCommand({capability,operation,payload});
      let result;
      try{
        result=await execFileImpl(chipTool,args,{
          timeout:Math.max(1000,Number(timeoutMs||15000)),
          maxBuffer:256*1024,
          windowsHide:true,
          shell:false,
        });
      }catch(error){
        const code=error?.code?String(error.code):'execution_failed';
        throw new Error('microseed_matter_'+code);
      }
      return {
        ok:true,
        schema:'evercraft.microseed.matter-result.v1',
        operation,
        command_argv_hash_input:{
          executable:chipTool,
          arg_count:args.length,
        },
        stdout:bounded(result?.stdout),
        stderr:bounded(result?.stderr),
        shell_used:false,
        arbitrary_command_allowed:false,
        approval_value_exposed:false,
      };
    },
  };
}
