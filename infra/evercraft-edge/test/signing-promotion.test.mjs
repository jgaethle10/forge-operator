import test from "node:test";
import assert from "node:assert/strict";
import {generateSigningKeypair,signSnapshot,verifySignedSnapshot} from "../dns/signing.mjs";
import {evaluatePromotion} from "../dns/promotion.mjs";

test("Systemia signature detects zone tampering",()=>{
 const {publicKey,privateKey}=generateSigningKeypair();
 const doc=signSnapshot({origin:"x.",serial:1},privateKey);
 assert.equal(verifySignedSnapshot(doc,{[doc.key_id]:publicKey}).ok,true);
 doc.zone.serial=2;
 assert.equal(verifySignedSnapshot(doc,{[doc.key_id]:publicKey}).ok,false);
});
test("promotion fails closed until every external gate is green",()=>{
 const base={placement:{ready:true,selected:[{},{}]},snapshot:{signature_verified:true,replicas_consistent:true},canary:{udp:true,tcp:true,aa:true,ra:false,delegation:true}};
 assert.equal(evaluatePromotion(base).state,"promotable");
 base.canary.delegation=false;
 assert.equal(evaluatePromotion(base).state,"hold");
});
