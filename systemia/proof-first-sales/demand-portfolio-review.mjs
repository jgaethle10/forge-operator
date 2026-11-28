// Evidence-to-portfolio review for the existing Proof-First Sales intake.
// No network, sender, new state store, checkout, or authorization.
const STOP = new Set('a an the i my our we you your for and or to of in on with from is are be was can could want need looking help get make how what who this that it they their as at by about into out up not do does have has had business company team service system work project software ai'.split(' '));
const ALIASES = Object.freeze({
 'audit-center-website-audit-machine-v1':['shopify seo','technical seo','search visibility','search engine optimization','website conversion'],
 'findmypart-paid-hunt-v1':['discontinued replacement part','obsolete replacement component','hard to find replacement part'],
 'findmypart-part-passport-v1':['unknown part identification','identify broken component'],
 'findmypart-repair-shop-desk-v1':['repair shop parts sourcing','recurring parts sourcing'],
 'fallen-studios-founding-commercial-v1':['short form video editing','social media commercial','promotional video production']
});
const clean = v => typeof v==='string' ? v.trim() : '';
const norm = v => clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const tokens = v => [...new Set(norm(v).split(' ').filter(t=>t.length>=2&&!STOP.has(t)))];
const allowed = new Set(['client_request','client_reply','public_hiring','partner_invitation']);
const held = v => /(?:^|[_-])(?:hold|held|retired|disabled|unavailable|blocked)(?:$|[_-])/.test(String(v||'').toLowerCase());
const retired = v => /^(?:product:)?(?:rivet|aliev)(?:[-.:]|$)/i.test(v);
function matchScore(text, phrase, words) {
 const p=norm(phrase), terms=tokens(phrase);
 if(terms.length<2 || !p) return 0;
 if((' '+text+' ').includes(' '+p+' ')) return 100+Math.min(terms.length,12);
 const common=terms.filter(t=>words.has(t)).length;
 return common>=2 && common/terms.length>=0.75 ? 50+common : 0;
}
export function deriveDemandScopeHypotheses(raw,{portfolio,painIndex,now=new Date()}={}) {
 const t=new Date(now).getTime(), age=t-Date.parse(raw?.observed_at||'');
 const ref=clean(raw?.demand_evidence_ref);
 const demand=clean(raw?.demand_text);
 const refs=Array.isArray(raw?.evidence_refs)?raw.evidence_refs:[];
 const deadline=raw?.deadline_at==null?null:Date.parse(raw.deadline_at);
 if(!Number.isFinite(t)||!Number.isFinite(age)||age<0||age>30*86400000||
    (deadline!==null&&(!Number.isFinite(deadline)||deadline<=t))||
    !allowed.has(raw?.source_kind)||!ref||ref.length>2048||!refs.includes(ref)||
    demand.length<12||demand.length>8000||raw.opted_out===true||
    raw.unfulfilled_commitment===true||Number(raw.unanswered_outbound)>=2) return [];
 if(portfolio?.schema!=='evercraft.saban.scoped-portfolio-review.v1'||portfolio.review_only!==true||
    !Array.isArray(portfolio.candidates)||!Array.isArray(painIndex?.entries)) return [];
 const candidates=new Map(), duplicate=new Set();
 for(const row of portfolio.candidates){
   const id=row?.source+':'+row?.key;
   if(candidates.has(id)) duplicate.add(id);
   candidates.set(id,row);
 }
 const text=norm(demand), words=new Set(tokens(demand)), matches=new Map(), repeated=new Set();
 for(const entry of painIndex.entries){
   const source=entry?.kind==='machine_offer'?'machine_offer':entry?.kind==='registry_product'?'registry_product':null;
   const key=source==='machine_offer'?entry?.public_id:entry?.product_key;
   const id=source+':'+key, row=candidates.get(id);
   if(!source||typeof key!=='string'||!row||duplicate.has(id)||retired(key)||
      held(row.source_commercial_state)||held(row.machine_state)||held(entry.commercial_state)||held(entry.machine_state)||
      key==='systemia-yard-runtime-extension-v1') continue;
   if(matches.has(id)) {repeated.add(id);continue;}
   const phrases=[...(Array.isArray(entry.pain_phrases)?entry.pain_phrases:[]),...(ALIASES[key]||[])];
   const ranked=phrases.map(p=>({p,score:matchScore(text,p,words)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.p.localeCompare(b.p));
   if(!ranked.length)continue;
   const outputs=clean(entry.outputs);
   if(!outputs||outputs.length>850)continue;
   matches.set(id,{source,key,evidence_ref:ref,proposed_deliverable:'Review scope for: '+outputs,matched_phrase:ranked[0].p,match_score:ranked[0].score});
 }
 return [...matches.entries()].filter(([id])=>!repeated.has(id)).map(([,m])=>m)
 .sort((a,b)=>b.match_score-a.match_score||a.key.localeCompare(b.key)).slice(0,3);
}
export function reviewDemandBatch(signals,{portfolio,painIndex,now=new Date(),qualify}={}){
 if(!Array.isArray(signals)||signals.length>1000||typeof qualify!=='function')throw Error('invalid_demand_review_batch');
 const groups=new Map();
 for(const raw of signals){
   const key=clean(raw?.prospect_key);
   if(!key||key.length>256)throw Error('invalid_prospect_key');
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(raw);
 }
 const rows=[];
 for(const [key,records] of groups){
   const opt=records.some(r=>r.opted_out===true);
   const promise=records.some(r=>r.unfulfilled_commitment===true);
   const limit=records.some(r=>Number(r.unanswered_outbound)>=2);
   let qualification=null,hypotheses=[],state;
   if(opt)state='do_not_contact';
   else if(promise)state='fulfill_prior_commitment';
   else if(limit)state='waiting_reply';
   else if(records.length>1)state='reconcile_history';
   else{
     const raw=records[0];
     const at=new Date(now).getTime(), age=at-Date.parse(raw.observed_at||'');
     const deadline=raw.deadline_at==null?null:Date.parse(raw.deadline_at);
     if(!Number.isFinite(age)||age<0||age>30*86400000||
        (deadline!==null&&(!Number.isFinite(deadline)||deadline<=at))) {
       state='research_only';
     } else {
     hypotheses=deriveDemandScopeHypotheses(raw,{portfolio,painIndex,now});
     // Replace unreviewed supplied hypotheses in this automatic lane.
     qualification=qualify({...raw,portfolio_scope_hypotheses:hypotheses},now,{portfolio});
     state=qualification.disposition;
     }
   }
   rows.push({prospect_key:key,records_seen:records.length,state,hypotheses,qualification,
     independent_review_required:true,send_authority:false,checkout_authority:false,paid_order_confirmed:false});
 }
 const order={fulfill_prior_commitment:0,scoping_priority:1,relationship_review:2,scope_hypothesis_review:3,reconcile_history:4,research_only:5,waiting_reply:6,do_not_contact:7};
 return {schema:'evercraft.systemia.demand-portfolio-review.v1',review_only:true,external_effects_authorized:false,
   signals_seen:signals.length,unique_prospect_keys:rows.length,rows:rows.sort((a,b)=>(order[a.state]??99)-(order[b.state]??99)||(b.qualification?.score??0)-(a.qualification?.score??0)||a.prospect_key.localeCompare(b.prospect_key))};
}
