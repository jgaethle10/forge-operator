// Fictional public walkthrough only. No customer data, accounts, or network calls.
const permittedEvents=new Set(['construction_start','permit_submission','permit_approval']);
const validDate=(s)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
export function compareStructuredCheckins(checkins){
  if(!Array.isArray(checkins)||checkins.length<2)return {status:'collecting',differences:[]};
  if(checkins.some(p=>!p||!validDate(p.date)||!permittedEvents.has(p.event)))return {status:'invalid',differences:[]};
  const byDate=new Map(),byEvent=new Map();
  for(const p of checkins){
    if(!byDate.has(p.date))byDate.set(p.date,new Set());
    byDate.get(p.date).add(p.event);
    if(!byEvent.has(p.event))byEvent.set(p.event,new Set());
    byEvent.get(p.event).add(p.date);
  }
  const differences=[];
  for(const [date,events] of byDate)if(events.size>1)differences.push({type:'milestone_meaning',date});
  for(const [event,dates] of byEvent)if(dates.size>1)differences.push({type:'milestone_date',event});
  return {status:differences.length?'clarification_needed':'no_structured_difference_detected',differences};
}
