#!/usr/bin/env node
/**
 * CI evidence rollup for humans and downstream Systemia. Never a release grant.
 * A successful workflow run means verification code executed, not commerce is live.
 */
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const token=value=>String(value??'unknown').replace(/[^a-zA-Z0-9._:-]/g,'_').slice(0,100);
export function buildFirstOfferCIStatus({readiness,probe,lineage}={}){
  if(!readiness||!probe||!lineage)throw Error('all_ci_evidence_required');
  const pageProved=probe.state==='externally_verified_buyer_page' && probe.verified===true;
  const lineageProved=lineage.integrity_ok===true && lineage.git_artifact_byte_parity===true &&
    lineage.source_only_ephemeral_proof===true && lineage.durable_lineage_remote_persisted===false;
  // These proofs are narrower than a live route, durable Lineage release, or a paid order.
  return {
    schema:'evercraft.systemia.offer-one-ci-release-hold.v1',
    mission_key:readiness.mission_key,
    ci_status:'evidence_evaluated_not_release_authority',
    release_state:'held',
    release_authorized:false,
    publication_authorized:false,
    checkout_verified:false,
    payment_verified:false,
    buyer_page:{verified:pageProved,reason:token(probe.reason),http_status:probe.http_status??null},
    lineage:{ephemeral_integrity_and_mirror_proved:lineageProved,durable_production_verified:false},
    next_gate:pageProved?'authenticate_runtime_and_commercial_release_gates':'independently_verify_owned_https_buyer_page',
    holds:[
      ...(!pageProved?['buyer_page_not_independently_verified']:[]),
      ...(!lineageProved?['ephemeral_lineage_integrity_not_proved']:[]),
      'durable_runtime_release_not_verified',
      'specialist_and_checkout_authority_not_verified',
      'buyer_payment_delivery_not_verified',
    ],
    source_assertions_are_not_proof:true,
  };
}
export function renderFirstOfferCIStatus(status){
  return [
    '## Systemia Offer #1: CI is not a production release',
    '',
    '**Commercial release: HELD**. A green test check does not prove the offer is buyable.',
    '',
    '| Evidence | Result |',
    '| --- | --- |',
    `| External buyer page | ${status.buyer_page.verified?'Page contents verified (not checkout)':'HELD: '+status.buyer_page.reason} |`,
    `| Native Lineage | ${status.lineage.ephemeral_integrity_and_mirror_proved?'Ephemeral proof passed; durable remote not verified':'Ephemeral proof not established'} |`,
    '| Customer checkout and payment | Not verified |',
    '| Publishing and production execution | Not authorized by CI |',
    '',
    `Next gate: \`${token(status.next_gate)}\``,
    '',
  ].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [readinessFile,lineageFile,probeFile,outputFile]=process.argv.slice(2);
  if(!readinessFile||!lineageFile||!probeFile||!outputFile)throw Error('expected_readiness_lineage_probe_and_output_paths');
  const [readiness,lineage,probe]=await Promise.all(
    [readinessFile,lineageFile,probeFile].map(async p=>JSON.parse(await readFile(p,'utf8')))
  );
  const status=buildFirstOfferCIStatus({readiness,lineage,probe});
  await writeFile(outputFile,JSON.stringify(status,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,renderFirstOfferCIStatus(status));
  process.stdout.write(JSON.stringify({release_state:status.release_state,public_page_verified:status.buyer_page.verified,next_gate:status.next_gate})+'\n');
}
