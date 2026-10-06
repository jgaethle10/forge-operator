import assert from 'node:assert/strict';
import { humanStartState, humanStartUrl } from '../systemia/chum/start-corridor.mjs';

const offer={
  public_id:'faie-signal-brief-v1',
  commercial_state:'sell_now',
  human_start_url:'https://fabric.systemiacommandcenters.com/faie/',
  human_start_url_state:'external_canary_verified'
};
assert.equal(humanStartUrl(offer,{publicOrigin:'',surface:'faie-proof'}),'https://fabric.systemiacommandcenters.com/faie/');
assert.equal(humanStartState(offer,{publicOrigin:''}),'owned_direct_human_start');
assert.equal(humanStartUrl({...offer,human_start_url_state:'pending'},{publicOrigin:''}),null);
assert.equal(humanStartUrl({...offer,human_start_url:'https://legacy.example.base44.app/faie/'},{publicOrigin:''}),null);
console.log(JSON.stringify({ok:true,faie_owned_direct_human_start:true}));
