import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
// Consumes an existing captured release, never initiates network or outreach.
export function assessUkCapture(job,raw,{now=new Date()}={}){
 if(!Number.isFinite(+now)||typeof raw!=='string'||Buffer.byteLength(raw)>8000000)throw Error('invalid_capture');
 if(job?.stage!=='research_pending'||job.contact_authorized!==false||job.execution_authorized!==false||!/^buyer-research:[a-f0-9]{64}$/.test(job.job_ref||''))throw Error('invalid_job');
 const match=/^https:\/\/www\.find-tender\.service\.gov\.uk\/Notice\/(\d{6}-\d{4})$/.exec(job.source_url||'');
 if(!match)throw Error('invalid_notice_url');
 const capture=JSON.parse(raw),r=capture.release,t=r?.tender;
 const u=new URL(capture.retrieval_url);
 if(u.origin!=='https://www.find-tender.service.gov.uk'||u.pathname!=='/api/1.0/ocdsReleasePackages'||u.username||u.password||u.hash)throw Error('invalid_capture_source');
 const at=Date.parse(capture.retrieved_at);
 if(!Number.isFinite(at)||at>+now||+now-at>86400000)throw Error('capture_stale_or_invalid');
 if(r?.id!==match[1]||typeof r.ocid!=='string'||'uk:'+digest(r.ocid).slice(0,40)!==job.source_ref||r.buyer?.name?.slice(0,300)!==job.buyer||t?.title?.slice(0,300)!==job.title)throw Error('capture_identity_mismatch');
 const description=typeof t.description==='string'?t.description.slice(0,20000):'';
 const deadline=t.tenderPeriod?.endDate;
 const due=typeof deadline==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(deadline)?Date.parse(deadline):NaN;
 const active=t.status==='active'&&Array.isArray(r.tag)&&r.tag.some(x=>x==='tender'||x==='tenderUpdate')&&!r.tag.some(x=>/Cancellation|award|contract/i.test(x))&&Number.isFinite(due)&&due>+now;
 const civil=/\b(reconstruction|resurfacing|civil engineering|construction works|roadworks)\b/i.test(description);
 const partnerHint=job.offer_lane_hint==='ev-planning'&&civil;
 return {schema:'evercraft.buyer.uk-evidence-review.v1',job_ref:job.job_ref,source_ref:job.source_ref,source_url:job.source_url,capture_sha256:digest(raw),captured_at:capture.retrieved_at,observed_at:now.toISOString(),capture_verification:'local_artifact_integrity_only',source_status:t.status??null,deadline:deadline??null,description,advertised_value:t.value??null,disposition:!active?'hold_inactive_or_deadline':partnerHint?'partner_fit_review':'scope_review',required_evidence:job.required_evidence,qualified:false,contact_authorized:false,execution_authorized:false,send_performed:false};
}
