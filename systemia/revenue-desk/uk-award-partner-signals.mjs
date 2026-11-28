import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Award evidence is a research signal, not proof of a subcontract request.
export function planUkAwardPartners(pkg,{now=new Date(),maxAgeDays=90}={}){
 if(!Array.isArray(pkg?.releases)||pkg.releases.length>1000||!Number.isFinite(+now)||!Number.isInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>180)throw Error('invalid_award_input');
 const latest=new Map();
 const diagnostics={invalid_release:0,unique_releases:0,non_award_or_cancelled:0,missing_or_excess_awards:0,award_rows:0,inactive_award:0,invalid_award_date_or_id:0,missing_award_id:0,non_string_award_id:0,missing_award_date:0,undated_award_research_signals:0,invalid_award_date:0,stale_or_future_award:0,missing_or_excess_suppliers:0,unmatched_scope:0,adjacent_scope_signals:0,missing_scope:0,invalid_supplier:0,duplicate_signal:0};
 for(const r of pkg.releases){
  if(typeof r?.ocid!=='string'||!r.ocid||!Number.isFinite(Date.parse(r.date))||Date.parse(r.date)>+now){diagnostics.invalid_release++;continue;}
  const old=latest.get(r.ocid);
  if(!old||Date.parse(r.date)>=Date.parse(old.date))latest.set(r.ocid,r);
 }
 diagnostics.unique_releases=latest.size;
 const signals=[],seen=new Set();let held=0;
 const lanes=[
 ['ev-planning','EV infrastructure feasibility and site mapping',/electric vehicle charging|ev charging|chargepoints?|charging infrastructure/i],
 ['software','Bounded software integration or workflow automation',/software development|software moderni[sz]ation|systems integration|workflow automation/i],
 ['commercial-media','Specialist media production or editing',/video production|video editing|film production|animation services/i],
 ['research','Defined research or data-analysis deliverable',/market research|data analysis services|feasibility stud(?:y|ies)|research services/i]
 ];
 const adjacent=[
 ['infrastructure-research','Bounded site evidence mapping or asset documentation',/\b(?:highway maintenance|road resurfacing|civil engineering|drainage works|bridge inspection|infrastructure construction|car park reconstruction)\b/i],
 ['software','Bounded asset reporting or inspection workflow integration',/\b(?:facilities management|property maintenance|asset management|building maintenance|fleet management)\b/i],
 ['commercial-media','Bounded white-label visual production or editing',/\b(?:marketing campaign|communications campaign|advertising services|public relations services)\b/i]
 ];
 for(const r of latest.values()){
  if(!/^\d{6}-\d{4}$/.test(String(r.id))||!Array.isArray(r.tag)||r.tag.some(x=>/cancellation|termination/i.test(x))||!r.tag.some(x=>/^(award|awardUpdate|contract|contractUpdate)$/.test(x)) ){diagnostics.non_award_or_cancelled++;held++;continue;}
  if(!Array.isArray(r.awards)||!r.awards.length||r.awards.length>200){diagnostics.missing_or_excess_awards++;held++;continue;}
  const t=r.tender||{};
  if(t.status==='cancelled'||t.status==='withdrawn'){diagnostics.non_award_or_cancelled++;held++;continue;}
  for(const a of r.awards){
   const at=Date.parse(a.date);
   diagnostics.award_rows++;
   if(a.status!=='active'){diagnostics.inactive_award++;held++;continue;}
   const undated=a.date==null||a.date==='';
   if(undated)diagnostics.missing_award_date++;
   if(typeof a.id!=='string'||!a.id.trim()||(!undated&&!Number.isFinite(at))){diagnostics.invalid_award_date_or_id++;if(a.id==null||a.id==='')diagnostics.missing_award_id++;else if(typeof a.id!=='string')diagnostics.non_string_award_id++;if(!undated&&!Number.isFinite(at))diagnostics.invalid_award_date++;held++;continue;}
   // Release timestamp bounds research recency only, never substitutes for award date.
   const recency=undated?Date.parse(r.date):at;
   if(recency>+now||+now-recency>maxAgeDays*86400000){diagnostics.stale_or_future_award++;held++;continue;}
   if(!Array.isArray(a.suppliers)||!a.suppliers.length||a.suppliers.length>30){diagnostics.missing_or_excess_suppliers++;held++;continue;}
   const scope=[t.title,t.description,a.title,a.description].map(x=>typeof x==='string'?x.slice(0,20000):'').join(' ');
   if(!scope.trim()){diagnostics.missing_scope++;held++;continue;}
   const directFit=lanes.find(x=>x[2].test(scope));
   const fit=directFit||adjacent.find(x=>x[2].test(scope));
   if(!fit){diagnostics.unmatched_scope++;held++;continue;}
   for(const s of a.suppliers){
    if(typeof s?.id!=='string'||!s.id.trim()||typeof s.name!=='string'||!s.name.trim()){diagnostics.invalid_supplier++;held++;continue;}
    const key='uk-award-partner:'+hash([r.ocid,a.id,s.id,fit[0]]);
    if(seen.has(key)){diagnostics.duplicate_signal++;continue;}seen.add(key);
    if(undated)diagnostics.undated_award_research_signals++;
    if(!directFit)diagnostics.adjacent_scope_signals++;
    signals.push({signal_ref:key,source_url:'https://www.find-tender.service.gov.uk/Notice/'+r.id,award_id:a.id,awarded_at:undated?null:a.date,release_published_at:r.date,award_date_verified:false,award_date_status:undated?'missing_requires_research':'source_reported',prime_name:s.name.slice(0,300),prime_source_id:s.id.slice(0,300),public_buyer:r.buyer?.name?.slice(0,300)||null,project_title:String(a.title||t.title||'').slice(0,300),lane:fit[0],fit_basis:directFit?'explicit_scope_keyword':'adjacent_scope_hypothesis',scope_excerpt:scope.slice(0,2000),specialist_service_hypothesis:fit[1],stage:'partner_research_required',required_evidence:['award_date_and_delivery_status','award_and_supplier_current','specific_subcontract_need','prime_supplier_identity','fulfillment_and_eligibility','approved_response_channel','payment_terms'],subcontract_demand_verified:false,qualified:false,contact_authorized:false,execution_authorized:false});
   }
  }
 }
 return {schema:'evercraft.kaidance.uk-award-partner-plan.v1',observed_at:now.toISOString(),records_observed:pkg.releases.length,signals:signals.slice(0,500),coverage_complete:false,diagnostics,held,qualified_count:0,send_performed:false};
}
