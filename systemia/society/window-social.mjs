/**
 * Mossmere relationship/commitment engine.
 * Bounded fictional policy, deterministic under canonical world state.
 * No model credentials, real communications, financial actions or sentience claims.
 */
const MAX_RECENT=72;
const DEFINITIONS=[
  {kind:'repair',label:'repair a neighbor’s home',place:'workshop',help:'repairs'},
  {kind:'garden',label:'tend the community garden',place:'garden',help:'produce'},
  {kind:'teach',label:'share a new skill',place:'library',help:'knowledge'},
  {kind:'meal',label:'bring food to the household',place:'bakery',help:'bread'},
  {kind:'art',label:'prepare a market exhibit',place:'market',help:'culture'}
];
const clamp=n=>Math.max(0,Math.min(100,n));
function record(w,type,a,message,extras={}){
  const e={id:'e'+w.next_event_id++,type,agent:a?.id||null,
    day:w.day,time:String(Math.floor(w.minute/60)).padStart(2,'0')+':'+String(w.minute%60).padStart(2,'0'),
    description:message,source:'social_policy_v1',...extras};
  w.events.unshift(e);w.events=w.events.slice(0,160);
  if(a){a.memories.unshift(message);a.memories=a.memories.slice(0,8);}
  return e;
}
function bond(a,b,value) {
  if(a.id===b.id)return;
  a.bonds[b.id]=clamp((a.bonds[b.id]??50)+value);
  b.bonds[a.id]=clamp((b.bonds[a.id]??50)+value);
}
export function ensureSocial(w){
  if(!w.social){
    w.social={schema:1,decision_count:0,last_decision_tick:0,
      commitments:[],stats:{promised:0,kept:0,broken:0,declined:0}};
  }
  return w.social;
}
export function decideSocial(w){
  const social=ensureSocial(w);
  if(w.tick%10!==0||w.tick<=social.last_decision_tick)return [];
  social.last_decision_tick=w.tick;
  social.decision_count++;
  const events=[];
  // Resolve promises from prior decisions first; the cost of inaction is remembered.
  for(const promise of social.commitments.filter(x=>x.state==='promised'&&x.due_tick<=w.tick)){
    const a=w.actors.find(x=>x.id===promise.from);
    const b=w.actors.find(x=>x.id===promise.to);
    if(!a||!b)throw Error('Broken resident promise reference');
    const available=a.energy>=24&&a.hunger>=26&&b.energy>=17;
    if(available){
      a.energy=clamp(a.energy-13);
      b.energy=clamp(b.energy-7);
      a.social=clamp(a.social+8);b.social=clamp(b.social+10);
      bond(a,b,7);
      if(promise.kind==='repair')w.metrics.repairs+=2;
      if(promise.kind==='garden')w.metrics.produce+=5;
      if(promise.kind==='meal')w.metrics.bread=Math.max(0,w.metrics.bread-3);
      a.goal_progress=Math.min(99,(a.goal_progress||0)+8);
      b.goal_progress=Math.min(99,(b.goal_progress||0)+4);
      promise.state='kept';promise.resolved_tick=w.tick;
      social.stats.kept++;
      const msg=a.name+' kept a promise to '+b.name+' and helped '+promise.label+'. They trust each other more now.';
      events.push(record(w,'promise_kept',a,msg,{other_agent:b.id,promise:promise.id}));
      b.memories.unshift(msg);b.memories=b.memories.slice(0,8);
    }else{
      promise.state='broken';promise.resolved_tick=w.tick;
      bond(a,b,-9);b.social=clamp(b.social-10);
      social.stats.broken++;
      const msg=a.name+' could not keep a promise to '+b.name+' to '+promise.label+'. The disappointment changed their relationship.';
      events.push(record(w,'promise_broken',a,msg,{other_agent:b.id,promise:promise.id}));
      b.memories.unshift(msg);b.memories=b.memories.slice(0,8);
    }
  }
  // Keep an immediately queryable but bounded commitment ledger.
  if(social.commitments.length>MAX_RECENT){
    const archiveCount=social.commitments.length-MAX_RECENT;
    social.commitments.splice(0,archiveCount);
  }
  const waiting=social.commitments.filter(x=>x.state==='promised').length;
  if(waiting>=3||social.decision_count%3!==1)return events;

  const i=Math.floor((w.tick/10+social.decision_count*7)%w.actors.length);
  const a=w.actors[i];
  const possibilities=w.actors.filter(x=>x.id!==a.id);
  // Close bonds create frequent offers, but less familiar residents can be included.
  possibilities.sort((x,y)=>{
    const bx=(a.bonds[x.id]??50)+((x.household===a.household)?7:0);
    const by=(a.bonds[y.id]??50)+((y.household===a.household)?7:0);
    return by-bx||x.id.localeCompare(y.id);
  });
  const b=possibilities[(social.decision_count+Math.floor(w.day/2))%Math.min(5,possibilities.length)];
  const def=DEFINITIONS[(social.decision_count+Math.floor(w.tick/120))%DEFINITIONS.length];
  const relationship=a.bonds[b.id]??50;
  const willingness=relationship>=38&&a.hunger>=22&&a.energy>=19&&a.social>=18;
  if(!willingness){
    social.stats.declined++;
    events.push(record(w,'invitation_declined',a,
      a.name+' declined '+b.name+'’s invitation to '+def.label+
      '. Their needs and history with each other affected the choice.',
      {other_agent:b.id}));
    return events;
  }
  social.stats.promised++;
  const promise={id:'commitment-'+social.stats.promised,from:a.id,to:b.id,
    kind:def.kind,label:def.label,place:def.place,created_tick:w.tick,due_tick:w.tick+30,
    state:'promised',resolved_tick:null};
  social.commitments.push(promise);
  events.push(record(w,'promise_made',a,
    a.name+' promised '+b.name+' they would '+def.label+' before the next day. Whether they follow through is still unknown.',
    {other_agent:b.id,promise:promise.id}));
  return events;
}
