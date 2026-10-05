import assert from 'node:assert/strict';
import { executePortableWorkerOnRental } from './client.mjs';

const payload={
  schema:'evercraft.saban.portable-assignment.v1',
  portable_worker_id:'chum-portable-v1',
  portable_worker_version:'1',
  software:'chum',
  assignment:{
    agent_id:'client-proof-00001',
    idempotency_key:'sha256:client-proof',
    role:'surface_auditor',
    work:{kind:'product',key:'client-proof'},
  },
};

const calls=[];
const receipt={
  schema:'evercraft.saban.portable-worker-receipt.v1',
  portable_worker_id:'chum-portable-v1',
  software_id:'chum',
  agent_id:'client-proof-00001',
  idempotency_key:'sha256:client-proof',
  result:{status:'finding'},
  checkpoint:{step:1,state:'portable_assignment_completed'},
  receipt_hash:'sha256:portable-client-proof',
};

const exe={
  async uploadFile(src,dst){
    calls.push({type:'uploadFile',src,dst});
    return {result:'Ok'};
  },
  async uploadJson(value,dst){
    calls.push({type:'uploadJson',value,dst});
    return {result:'Ok'};
  },
  async run(executable,args){
    calls.push({type:'run',executable,args});
    return {
      result:'Ok',
      stdout:JSON.stringify(receipt),
      stderr:'',
    };
  },
};
const rental={
  async getExeUnit(){
    calls.push({type:'getExeUnit'});
    return exe;
  },
};

const got=await executePortableWorkerOnRental({
  rental,
  localWorkerPath:'/trusted/portable/chum.mjs',
  payload,
});

assert.deepEqual(got,receipt);
assert.deepEqual(
  calls.map((row)=>row.type),
  ['getExeUnit','uploadFile','uploadJson','run']
);
assert.equal(calls[1].src,'/trusted/portable/chum.mjs');
assert.equal(
  calls[1].dst,
  '/golem/work/evercraft-portable-worker.mjs'
);
assert.deepEqual(calls[2].value,payload);
assert.equal(
  calls[2].dst,
  '/golem/work/evercraft-portable-input.json'
);
assert.equal(calls[3].executable,'node');
assert.deepEqual(
  calls[3].args,
  [
    '/golem/work/evercraft-portable-worker.mjs',
    '/golem/work/evercraft-portable-input.json',
  ]
);

await assert.rejects(
  executePortableWorkerOnRental({
    rental:{
      async getExeUnit(){
        return {
          async uploadFile(){return {result:'Ok'};},
          async uploadJson(){return {result:'Ok'};},
          async run(){
            return {
              result:'Error',
              stdout:null,
              stderr:'provider execution failed',
              message:'exit 1',
            };
          },
        };
      },
    },
    localWorkerPath:'/trusted/portable/chum.mjs',
    payload,
  }),
  /golem_portable_worker_execution_failed/
);

await assert.rejects(
  executePortableWorkerOnRental({
    rental:{
      async getExeUnit(){
        return {
          async uploadFile(){return {result:'Ok'};},
          async uploadJson(){return {result:'Ok'};},
          async run(){
            return {result:'Ok',stdout:'not json'};
          },
        };
      },
    },
    localWorkerPath:'/trusted/portable/chum.mjs',
    payload,
  }),
  /golem_portable_worker_invalid_json/
);

await assert.rejects(
  executePortableWorkerOnRental({
    rental:{
      async getExeUnit(){
        return {
          async uploadFile(){return {result:'Ok'};},
          async uploadJson(){return {result:'Ok'};},
          async run(){
            return {
              result:'Ok',
              stdout:JSON.stringify({schema:'wrong.schema'}),
            };
          },
        };
      },
    },
    localWorkerPath:'/trusted/portable/chum.mjs',
    payload,
  }),
  /golem_portable_worker_receipt_schema_invalid/
);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.golem-requestor-portable-execution-proof.v1',
  registered_worker_uploaded:true,
  assignment_uploaded_as_json:true,
  argv_execution:true,
  provider_error_rejected:true,
  malformed_json_rejected:true,
  wrong_receipt_schema_rejected:true,
  receipt_hash:got.receipt_hash,
},null,2));
