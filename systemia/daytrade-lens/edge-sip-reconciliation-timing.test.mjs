import assert from "node:assert/strict";
import {normalizeAlpacaQuote} from "./edge-quote-microstructure.mjs";

function selectLatestPreTarget(rows,target,maxStateAgeMs=60000){
  const targetMs=new Date(target).getTime();
  const normalized=(rows||[])
    .map(normalizeAlpacaQuote)
    .filter(Boolean)
    .filter(q=>new Date(q.t).getTime()<=targetMs)
    .sort((a,b)=>new Date(a.t)-new Date(b.t));
  const q=normalized.at(-1)||null;
  if(!q) return null;
  const stalenessMs=targetMs-new Date(q.t).getTime();
  if(stalenessMs<0||stalenessMs>maxStateAgeMs) return null;
  return {
    ...q,
    quote_state_age_ms:stalenessMs,
    quote_state_age_over_5s:stalenessMs>5000,
  };
}

const target="2026-10-07T16:05:30.250Z";
const rows=[
  {t:"2026-10-07T16:05:29.900Z",bp:100,ap:100.02},
  {t:"2026-10-07T16:05:30.200Z",bp:100.01,ap:100.02},
  {t:"2026-10-07T16:05:30.300Z",bp:99,ap:101},
];
const q=selectLatestPreTarget(rows,target);
assert.ok(q);
assert.equal(q.t,"2026-10-07T16:05:30.200Z");
assert.equal(q.bid_price,100.01);
assert.equal(q.ask_price,100.02);
assert.equal(q.quote_state_age_ms,50);
assert.equal(q.quote_state_age_over_5s,false);

const persisted=selectLatestPreTarget(
  [{t:"2026-10-07T16:05:14.890Z",bp:100,ap:100.02}],
  target
);
assert.ok(persisted);
assert.equal(persisted.quote_state_age_over_5s,true);

const tooOld=selectLatestPreTarget(
  [{t:"2026-10-07T16:04:20.000Z",bp:100,ap:100.02}],
  target
);
assert.equal(tooOld,null);

console.log(JSON.stringify({
  ok:true,
  post_target_quote_rejected:true,
  latest_pre_target_quote_selected:true,
  persisted_state_age_recorded:true,
  excessively_old_state_rejected:true
}));
