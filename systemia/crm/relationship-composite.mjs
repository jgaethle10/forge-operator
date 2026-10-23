import {createHash} from 'node:crypto';
import {resolveCrmSource} from './interaction-ledger-adapter.mjs';
import {readPrivateRelationships,projectRelationshipReview} from './relationship-policy.mjs';
import {INPUT_SCHEMA} from './heartbeat.mjs';

const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const MISSING=['evercraft-interaction-ledger','evercraft-payments','eps-services','havenly-services','partnership-pipeline'];

export function resolveCompanyRelationshipSource({inputPath='',ledgerStateDir='',relationshipLedgerFile='',now=new Date()}={}) {
  // An explicitly supplied canonical projection must not be silently combined
  // with another source. The aggregator that creates it owns reconciliation.
  if(inputPath)return {inputPath};
  const base=resolveCrmSource({ledgerStateDir,now});
  if(!relationshipLedgerFile) {
    if(base.inputData){
      return {inputData:{
        ...base.inputData,
        connectors:[...base.inputData.connectors,{source_key:'private-relationship-ledger',state:'unavailable'}],
      }};
    }
    return base;
  }
  let privateProjection;
  try{
    privateProjection=projectRelationshipReview(readPrivateRelationships(relationshipLedgerFile,{now}),{now});
  }catch(error){
    if(base.inputData) return {inputData:{
      ...base.inputData,connectors:[...base.inputData.connectors,{source_key:'private-relationship-ledger',state:'unavailable'}]
    }};
    return {holdReason:'source_invalid'};
  }
  const prefix=base.inputData || {
    schema:INPUT_SCHEMA,tenant_id:'evercraft',generated_at:now.toISOString(),
    source_revision:'no-interaction-ledger',connectors:MISSING.map(source_key=>({source_key,state:'unavailable'})),signals:[]
  };
  const connectors=new Map();
  for(const x of [...prefix.connectors,...privateProjection.connectors]) connectors.set(x.source_key,x);
  return {inputData:{
    schema:INPUT_SCHEMA,tenant_id:'evercraft',generated_at:now.toISOString(),
    source_revision:sha(prefix.source_revision+'|'+privateProjection.source_revision),
    connectors:[...connectors.values()],signals:[...prefix.signals,...privateProjection.signals]
  }};
}
