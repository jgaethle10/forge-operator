import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createTowiResident} from '../towi/resident.mjs';
import {bindTowiRecoveryRecord} from './towi-bridge.mjs';
test('real TOWI resident: bind exact dossier revision and evidence without publishing or mutating it',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'circular-towi-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const at='2026-11-27T16:00:00.000Z';
 const towiResident=createTowiResident({stateDir:root,clock:()=>new Date(at)});
 const signal={signal_id:'radar:synthetic-recovery',subject_key:'synthetic::plastic',observation_id:'obs:synthetic',
 observed_at:at,last_verified_at:at,summary:'Synthetic material recovery question',truth_state:'REPORTED',
 change_state:'NEW',materiality_score:0.9,reliability:0.8,domains:['environment'],region_keys:['synthetic'],
 source_family:'fixture-radar',provenance_refs:['https://example.org/radar'],
 review:{status:'pass',independent_source_families:1,freshness:{state:'fresh'},warnings:[]},observation:{facts:{}}};
 const run=await towiResident.runOnce({radarEdition:{edition_id:'radar:synthetic-recovery',signals:[signal],rolled_off_signals:[]}});
 assert.equal(run.status,'pass');
 const dossierId=towiResident.queue()[0].dossier_id;
 towiResident.addEvidence(dossierId,{source_family:'fixture-lab',independence_group:'fixture-lab',
 observed_at:at,evidence_state:'modeled',relationship:'context',summary:'Synthetic model, not a measured outcome',
 provenance_refs:['https://example.org/model']});
 const snapshot=towiResident.dossier(dossierId);
 const expectedDossierDigest='sha256:'+createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
 const record={id:'synthetic-plastic',stream:'plastic',pathway:'mechanical',
 evidence:[{source:'fixture-lab',ref:'https://example.org/model',state:'modeled'}]};
 const options={towiResident,dossierId,expectedDossierDigest,record};
 const result=bindTowiRecoveryRecord(options);
 assert.equal(result.dossierKey,dossierId);
 assert.equal(result.sourceDigest,expectedDossierDigest);
 assert.equal(result.independentSourceTruthVerified,false);
 assert.equal(result.publicationAuthority,false);
 assert.throws(()=>bindTowiRecoveryRecord({...options,expectedDossierDigest:'sha256:'+'0'.repeat(64)}),/revision_mismatch/);
 for(const patch of [{state:'observed'},{source:'other'},{ref:'https://example.org/unknown'}])
  assert.throws(()=>bindTowiRecoveryRecord({...options,record:{...record,evidence:[{...record.evidence[0],...patch}]}}),/not_bound_to_towi/);
 assert.deepEqual(towiResident.dossier(dossierId),snapshot);
 assert.equal(towiResident.health().resident,false);
});
