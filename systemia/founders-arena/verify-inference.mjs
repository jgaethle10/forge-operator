/** Verify a private local-model match envelope, independent of its runner. */
import {readFileSync} from 'node:fs';
import {verifyMatch} from './league.mjs';
import {verifyInferenceEvidence} from './inference-evidence.mjs';

try{
  const filename=process.argv[2];
  if(!filename)throw Error('Usage: node verify-inference.mjs path/to/local-inference-match.json');
  const envelope=JSON.parse(readFileSync(filename,'utf8'));
  verifyMatch(envelope.match);
  verifyInferenceEvidence(envelope.match,envelope.evidence);
  console.log(JSON.stringify({verified:true,kind:'local-http-receipt-integrity-only',
    no_neural_inference_attestation:true,turns:envelope.match.turns.length,
    decisions:envelope.evidence.events.length,match_digest:envelope.match.digest,
    evidence_digest:envelope.evidence.ledger_digest},null,2));
}catch(error){console.error('Verification failed:',error.message);process.exitCode=1;}
