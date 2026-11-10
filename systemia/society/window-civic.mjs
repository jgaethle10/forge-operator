/**
 * Mossmere's bounded civic layer.
 * These are simulated autonomous policy decisions, NOT LLM deliberation.
 * They run in the GitHub heartbeat process and change persisted world state.
 */
const max=(v)=>Math.max(0,Math.min(100,v));
const PROJECTS=[
  {title:'Community oven',site:'bakery',roles:['baker','cook','carpenter'],cost:18,benefit:'bread'},
  {title:'Lake footbridge',site:'lake',roles:['carpenter','fisher','apprentice'],cost:26,benefit:'repairs'},
  {title:'Autumn market pavilion',site:'market',roles:['merchant','organizer','artist'],cost:22,benefit:'produce'},
  {title:'Garden greenhouse',site:'garden',roles:['gardener','organizer','apprentice'],cost:25,benefit:'produce'},
  {title:'Public story archive',site:'library',roles:['teacher','librarian','artist'],cost:20,benefit:'trust'}
];
function chronicle(w,type,agent,description,extra={}){
  const rec={id:'e'+w.next_event_id++,type,agent:agent?.id||null,
    day:w.day,time:String(Math.floor(w.minute/60)).padStart(2,'0')+':'+String(w.minute%60).padStart(2,'0'),
    description,source:'rule_policy_v1',...extra};
  w.events.unshift(rec);w.events=w.events.slice(0,160);
  if(agent){agent.memories.unshift(description);agent.memories=agent.memories.slice(0,8);}
  return rec;
}
export function ensureCivic(w){
  if(!w.civic){
    w.civic={
      schema:1,proposals:[],completed:[],failed:[],
      decisions:0,last_decision_tick:0,trust:55,treasury_spent:0,
      stats:{proposed:0,completed:0,failed:0}
    };
  }
  if(!w.civic.stats){
    w.civic.stats={proposed:w.civic.proposals.length,completed:w.civic.completed.length,failed:w.civic.failed.length};
  }
  return w.civic;
}
export function decideCivic(w){
  const civic=ensureCivic(w);
  if(w.tick<=civic.last_decision_tick || w.tick%10!==0) return [];
  civic.last_decision_tick=w.tick;
  civic.decisions++;
  const result=[];
  const active=civic.proposals.find(p=>p.state==='fundraising'||p.state==='construction');
  if(!active){
    // Space proposals to preserve meaningful, watchable narrative arcs.
    if(civic.decisions%6!==1)return result;
    const kind=PROJECTS[Math.floor(civic.decisions/6)%PROJECTS.length];
    const candidates=w.actors.filter(a=>kind.roles.includes(a.job));
    const founder=candidates[0];
    const partner=candidates[1]||w.actors[(w.tick/10)%w.actors.length];
    const item={
      id:'project-'+civic.decisions, title:kind.title, site:kind.site, need:kind.cost,
      funded:0, progress:0, state:'fundraising',
      founder:founder.id,partner:partner.id,benefit:kind.benefit,
      started_day:w.day, decisions:0, supporters:[], pledges:{}, completed_day:null
    };
    civic.proposals.push(item);
    civic.stats.proposed++;
    if(civic.proposals.length>60){
      const archived=civic.proposals.findIndex(p=>p.state==='completed'||p.state==='failed');
      if(archived>=0)civic.proposals.splice(archived,1);
    }
    result.push(chronicle(w,'proposal',founder,
      founder.name+' proposed '+kind.title+' and asked '+partner.name+' to help. The town has not decided whether to fund it.',
      {project:item.id,other_agent:partner.id}));
    return result;
  }
  const founder=w.actors.find(x=>x.id===active.founder);
  const partner=w.actors.find(x=>x.id===active.partner);
  if(!founder||!partner)throw new Error('Broken resident/project reference');
  active.decisions++;
  if(active.state==='fundraising'){
    const supporter=w.actors[(civic.decisions+active.decisions)%w.actors.length];
    const trust=supporter.bonds[founder.id]??50;
    const concern=supporter.hunger<35||supporter.energy<25;
    // A supporter can refuse. A project can ultimately fail rather than always win.
    const pledges=(!concern&&trust>=38&&supporter.coins>=5)?Math.min(5,supporter.coins-2,active.need-active.funded):0;
    if(pledges>0){
      supporter.coins-=pledges;
      active.funded+=pledges;
      if(!active.supporters.includes(supporter.id))active.supporters.push(supporter.id);
      active.pledges[supporter.id]=(active.pledges[supporter.id]||0)+pledges;
      result.push(chronicle(w,'pledge',supporter,
        supporter.name+' contributed '+pledges+' coins to '+active.title+'.',
        {project:active.id,amount:pledges}));
      civic.trust=max(civic.trust+1);
    }else{
      result.push(chronicle(w,'refusal',supporter,
        supporter.name+' declined to fund '+active.title+' because of their own needs or doubts.',
        {project:active.id}));
      civic.trust=max(civic.trust-1);
    }
    if(active.funded>=active.need){
      active.state='construction';
      result.push(chronicle(w,'funded',founder,
        active.title+' reached its funding goal. '+founder.name+' and '+partner.name+' can begin construction.',
        {project:active.id}));
    }else if(active.decisions>=16){
      active.state='failed';civic.failed.push(active.id);civic.stats.failed++;
      civic.failed=civic.failed.slice(-60);
      // Return unspent pledges proportionally, where possible; no real funds.
      for(const id of active.supporters){
        const a=w.actors.find(x=>x.id===id);
        if(a)a.coins+=active.pledges[id]||0;
      }
      result.push(chronicle(w,'failure',founder,
        active.title+' did not attract enough support and was abandoned.',
        {project:active.id}));
      civic.trust=max(civic.trust-3);
    }
  }else{
    const working=founder.energy>=20&&partner.energy>=20;
    if(working){
      active.progress+=Math.max(5,Math.floor(((founder.energy+partner.energy)/2)/12));
      founder.energy=Math.max(0,founder.energy-6);
      partner.energy=Math.max(0,partner.energy-6);
    }
    if(active.progress>=100){
      active.progress=100;active.state='completed';active.completed_day=w.day;
      civic.completed.push(active.id);civic.stats.completed++;
      civic.completed=civic.completed.slice(-60);
      civic.treasury_spent+=active.funded;
      if(active.benefit==='bread')w.metrics.bread+=20;
      if(active.benefit==='produce')w.metrics.produce+=20;
      if(active.benefit==='repairs')w.metrics.repairs+=12;
      if(active.benefit==='trust')civic.trust=max(civic.trust+12);
      founder.bonds[partner.id]=max((founder.bonds[partner.id]??50)+8);
      partner.bonds[founder.id]=max((partner.bonds[founder.id]??50)+8);
      result.push(chronicle(w,'project_completed',founder,
        'Mossmere opened '+active.title+'. '+founder.name+' and '+partner.name+' brought the project across the finish line.',
        {project:active.id,other_agent:partner.id}));
    }else if(active.decisions%4===0){
      result.push(chronicle(w,'construction',partner,
        active.title+' is '+active.progress+'% complete. '+partner.name+' is still working beside '+founder.name+'.',
        {project:active.id,progress:active.progress}));
    }
  }
  return result;
}
