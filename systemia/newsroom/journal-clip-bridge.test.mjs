import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJournalClipSocialPublishRequest } from './journal-clip-bridge.mjs';

function handoff(){
  const canonical='https://journal.evercraft.global/cfb-power-rankings-week-6/';
  return {
    schema:'evercraft.clip.journal-handoff.v1',
    story_id:'journal:2026-10-06:cfb-power-rankings-week-6',
    slug:'cfb-power-rankings-week-6',
    title:'Evercraft College Football Power Rankings',
    canonical_url:canonical,
    publication_receipt_ref:'receipts/cfb-power-rankings-week-6.json',
    source_refs:['ap-week-6','evercraft-cfbpi-run'],
    link_verification:{
      expectedText:['Evercraft College Football Power Rankings'],
      expectedCanonicalUrl:canonical,
      expectedOgUrl:canonical,
      expectedStoryId:'journal:2026-10-06:cfb-power-rankings-week-6',
      requireCanonicalSelfMatch:true,
      requireOpenGraphSelfMatch:true,
    },
  };
}

test('builds a Clip publish request from carried Journal identity without guessing the URL',()=>{
  const req=buildJournalClipSocialPublishRequest({
    handoff:handoff(),
    destination:'facebook-page',
    authorizationRef:'policy:evercraft-journal-autopublish-v1',
    message:'Our new college football power rankings are live.',
  });
  assert.equal(req.metadata.link,'https://journal.evercraft.global/cfb-power-rankings-week-6/');
  assert.equal(req.linkVerification.expectedCanonicalUrl,req.metadata.link);
  assert.equal(req.linkVerification.expectedOgUrl,req.metadata.link);
  assert.equal(req.linkVerification.expectedStoryId,'journal:2026-10-06:cfb-power-rankings-week-6');
  assert.equal(req.lineage.publication_receipt_ref,'receipts/cfb-power-rankings-week-6.json');
});

test('fails closed if the handoff canonical verification contract disagrees with the carried URL',()=>{
  const fixture=handoff();
  fixture.link_verification.expectedCanonicalUrl='https://journal.evercraft.global/wrong/';
  assert.throws(()=>buildJournalClipSocialPublishRequest({
    handoff:fixture,
    destination:'facebook-page',
    authorizationRef:'policy:evercraft-journal-autopublish-v1',
    message:'Publish me.',
  }),/journal_clip_canonical_contract_mismatch/);
});

test('still requires explicit publication authority even though the Journal handoff carries the link',()=>{
  assert.throws(()=>buildJournalClipSocialPublishRequest({
    handoff:handoff(),
    destination:'facebook-page',
    message:'Publish me.',
  }),/journal_clip_authorization_ref_required/);
});
