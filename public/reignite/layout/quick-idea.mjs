/**
 * One-minute suggestion -> safe, reviewable map proposal.
 * The result is an IDEA, never a booking, venue allocation, or approval.
 */
export const IDEAS = Object.freeze({
  music: { label: 'Music or a performance', category: 'performance' },
  art: { label: 'Art or photography', category: 'visual_art' },
  food: { label: 'Food or vendor experience', category: 'food' },
  history: { label: 'Heritage or storytelling', category: 'heritage' },
  activity: { label: 'Hands-on activity', category: 'participation' },
  comfort: { label: 'Comfort or accessibility', category: 'quiet' },
  production: { label: 'Production or logistics', category: 'operations' },
});
export const PLACES = Object.freeze({
  unsure: { label: 'Not sure yet', map: 'campus' },
  interior: { label: 'Inside, if approved', map: 'interior' },
  exterior: { label: 'Outside, if approved', map: 'campus' },
});
const clean=(s,max)=>typeof s==='string'?s.trim().slice(0,max):'';
export function createQuickSuggestion(plan, input, id) {
  if(!plan||plan.schema!=='evercraft.reignite.layout.v1'||!Array.isArray(plan.zones))
    throw Error('layout_not_ready');
  if(!input||!IDEAS[input.kind]||!PLACES[input.place])throw Error('choose_kind_and_place');
  const name=clean(input.name,100),description=clean(input.description,500);
  if(name.length<3)throw Error('idea_name_required');
  if(description.length<12)throw Error('short_description_required');
  if(!/^zone-[a-z0-9]{8,40}$/.test(id))throw Error('generated_id_invalid');
  if(plan.zones.some(z=>z.id===id))throw Error('zone_id_collision');
  if(plan.zones.length>=80)throw Error('plan_full');
  const place=PLACES[input.place],category=IDEAS[input.kind].category;
  const count=plan.zones.filter(z=>z.map===place.map).length;
  const index=count%12;
  const zone={
    id,name,map:place.map,category,
    x:Number((.05+(index%4)*.23).toFixed(3)),
    y:Number((.10+(Math.floor(index/4))* .26).toFixed(3)),
    w:.16,h:.15,stage:'needs_site_survey',
    owner:'',capacity:null,source_ref:'',
    notes:'Community idea: '+description+'\nPreferred location: '+place.label+
      '. The marker is only a placement suggestion. Venue approval, access, safety, capacity, and commitments are unknown.'
  };
  const candidate={...plan,zones:[...plan.zones,zone]};
  const reason=('New idea: '+name+'. '+description).slice(0,900);
  return {candidate,zone,reason,kind:input.kind,place:input.place,
    message:'This is a proposal only. No performer booking, event permission, fundraising or site assignment.'};
}
