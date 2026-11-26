import {collectUkReleaseWindow,normalizeUk} from './uk-buyer-source.mjs';
import {planUkAwardPartners} from './uk-award-partner-signals.mjs';
export async function collectUkDual({now=new Date(),fetchFn=fetch,maxPages=5}={}){
 const window=await collectUkReleaseWindow({now,fetchFn,maxPages});
 const direct={...normalizeUk(window,{now}),pages_observed:window.pages_observed,coverage_complete:window.coverage_complete};
 const partners=planUkAwardPartners(window,{now});
 return {schema:'evercraft.kaidance.uk-dual-discovery.v1',observed_at:now.toISOString(),records_observed:window.releases.length,pages_observed:window.pages_observed,window_coverage_complete:window.coverage_complete,direct,partners,qualified_count:0,send_performed:false,crm_write_performed:false};
}
