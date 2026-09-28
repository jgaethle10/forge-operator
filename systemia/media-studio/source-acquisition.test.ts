import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitSourceCandidate,
  buildSourceAcquisitionRequests,
  buildSourceCandidateInventory,
  sourceAssetFromAdmission,
  type SourceCandidate,
} from './source-acquisition.js';

const coverage=[{
  id:'coverage-1-naval-vessel',
  subjectId:'naval-vessel',
  subjectLabel:'naval vessel',
  preferredTreatment:'documentary_or_verified_visualization' as const,
  minScreenTimeSec:2.5,
  matchedAssetIds:[],
  status:'missing' as const
}];

function candidate(overrides:Partial<SourceCandidate>={}):SourceCandidate{
  return {
    id:'destroyer-source-1',
    requestId:'source-acq-1-naval-vessel',
    subjectId:'naval-vessel',
    mediaKind:'video',
    artifactPath:'./destroyer-source.mp4',
    artifactDigest:`sha256:${'a'.repeat(64)}`,
    providerId:'owned-source-library',
    visualState:'documentary_source',
    rights:'licensed',
    commercialUseAllowed:'yes',
    provenance:{
      sourceId:'source-001',
      canonicalSourceUrl:'https://example.invalid/source-001',
      rightsBasis:'commercial stock license',
      licenseId:'license-001',
      attribution:'Provider archive'
    },
    visualMatch:{
      schema:'evercraft.fallen.source-visual-match.v1',
      candidateId:'destroyer-source-1',
      subjectId:'naval-vessel',
      verifierId:'forensiscope-visual-match-v1',
      verifierState:'verified',
      score:.97,
      threshold:.88,
      evidenceRefs:['frame-sha256:proof']
    },
    durationSec:8,
    tags:['destroyer','naval'],
    ...overrides
  };
}

test('semantic coverage gaps become source-first acquisition requests',()=>{
  const requests=buildSourceAcquisitionRequests({
    coverage,
    aspectRatio:'16:9',
    storyPrompt:'Explain naval movement.'
  });
  assert.equal(requests.length,1);
  assert.equal(requests[0].sourceFirst,true);
  assert.equal(requests[0].subjectId,'naval-vessel');
  assert.match(requests[0].queryHints.join(' '),/public domain footage/i);
});

test('verified licensed documentary footage can satisfy the missing subject',()=>{
  const request=buildSourceAcquisitionRequests({
    coverage,aspectRatio:'16:9',storyPrompt:'Explain naval movement.'
  })[0];
  const source=candidate();
  const admission=admitSourceCandidate(request,source);
  assert.equal(admission.status,'accepted');
  assert.equal(admission.receiptDigest.length,64);

  const asset=sourceAssetFromAdmission(request,source,admission);
  assert.equal(asset.kind,'video');
  assert.equal(asset.rights,'licensed');
  assert.ok(asset.tags?.includes('naval-vessel'));
});

test('pretty synthetic footage cannot masquerade as source-first documentary coverage',()=>{
  const request=buildSourceAcquisitionRequests({
    coverage,aspectRatio:'16:9',storyPrompt:'Explain naval movement.'
  })[0];
  const admission=admitSourceCandidate(request,candidate({
    visualState:'synthetic_visualization',
    rights:'owned',
    provenance:{
      sourceId:'generated-1',
      rightsBasis:'owned synthetic generation'
    }
  }));
  assert.equal(admission.status,'rejected');
  assert.match(admission.reasons.join(' '),/synthetic_cannot_satisfy/);
});

test('unknown rights and unverified subject matches fail closed',()=>{
  const request=buildSourceAcquisitionRequests({
    coverage,aspectRatio:'16:9',storyPrompt:'Explain naval movement.'
  })[0];
  const bad=candidate({
    rights:'unknown',
    commercialUseAllowed:'unknown',
    visualMatch:{
      ...candidate().visualMatch,
      verifierState:'declared',
      score:.99
    }
  });
  const admission=admitSourceCandidate(request,bad);
  assert.equal(admission.status,'rejected');
  assert.match(admission.reasons.join(' '),/rights_not_admissible/);
  assert.match(admission.reasons.join(' '),/visual_match_not_verified/);
});

test('source candidate inventory binds each candidate to a known semantic request',()=>{
  const requests=buildSourceAcquisitionRequests({
    coverage,aspectRatio:'16:9',storyPrompt:'Explain naval movement.'
  });
  const inventory=buildSourceCandidateInventory({
    requests,
    candidates:[candidate()]
  });
  assert.equal(inventory.jobs.length,1);
  assert.equal(inventory.jobs[0].request.subjectId,'naval-vessel');
  assert.throws(()=>buildSourceCandidateInventory({
    requests,
    candidates:[candidate({requestId:'missing'})]
  }),/unknown acquisition request/);
});
