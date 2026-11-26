/**
 * Source-only REIGNITE organizer preview derived entirely from canonical
 * event-coordination gates, not a live permit ledger or venue authorization.
 * No dependency on external runtimes or network requests.
 */
import { assessReigniteConcept, eventNextActions } from './event-coordination.mjs';

const escapeHtml = value => String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const label = value => String(value||'').replaceAll('_',' ');
const gateGroups = [
  {name:'Venue & preservation',ids:['venue_authority','current_condition','space_and_use','structural_review','crowd_loads','fire_life_safety','access_and_airfield','artifact_protection']},
  {name:'Sound, time & production',ids:['jurisdiction_and_event_hours','acoustic_review','outdoor_transmission','outdoor_ground_and_wind','insurance_and_permits','production_plan','weather_and_emergency','freestanding_visual_dome','acoustic_dome_performance']},
  {name:'Artists & experiences',ids:['international_performers','quiet_wing','guest_dj','karaoke','art_exhibition','photography_contest','food_contest','silent_auction','charitable_agreement']},
];

export function makeReigniteReadinessSnapshot() {
 const assessment=assessReigniteConcept();
 const focus=eventNextActions(assessment);
 if(assessment.event_approved!==false||assessment.ticket_sales_authorized!==false||
    assessment.external_contact_authorized!==false||assessment.charitable_collection_authorized!==false)
   throw Error('unsafe_release_state');
 const all=new Set(assessment.checks.map(item=>item.id));
 const grouped=new Set(gateGroups.flatMap(group=>group.ids));
 const ungrouped=[...all].filter(id=>!grouped.has(id));
 if(ungrouped.length)throw Error('unclassified_event_gates:'+ungrouped.join(','));
 const categorized=gateGroups.map(group=>({
   name:group.name,
   checks:group.ids.filter(id=>all.has(id)).map(id=>assessment.checks.find(check=>check.id===id))
 }));
 return {
   schema:'evercraft.reignite.readiness-preview.v1',
   title:'REIGNITE · Organizer readiness',
   basis:'source_only_initial_review_not_live',
   opportunity_id:assessment.opportunity_id,
   scenario:assessment.scenario_description,
   status:'Concept planning only · No venue or event approval',
   next_actions:focus.next,
   all_checks:categorized,
   total_checks:assessment.checks.length,
   missing:assessment.checks.filter(check=>check.status==='missing').length,
   submitted_unverified:assessment.checks.filter(check=>check.status==='submitted_unverified').length,
   holds:focus.reported_holds,
   no_current_site_survey:true,
   no_approved_music_hours:true,
   no_live_evidence_connection:true,
   event_approved:false,
   ticket_sales_authorized:false,
   charitable_collection_authorized:false,
   external_contact_authorized:false,
   performance_or_testing_authorized:false
 };
}

export function renderReigniteReadinessHtml(snapshot=makeReigniteReadinessSnapshot()) {
 if(snapshot?.schema!=='evercraft.reignite.readiness-preview.v1'||
    snapshot.event_approved!==false||snapshot.ticket_sales_authorized!==false||
    snapshot.external_contact_authorized!==false||snapshot.charitable_collection_authorized!==false)
   throw Error('readiness_render_refused');
 const title=escapeHtml(snapshot.title);
 const next=snapshot.next_actions.map((action,i)=>'<article class="action"><div class="action-top"><span class="number">'+String(i+1).padStart(2,'0')+'</span><span class="state">NEEDS SOURCE</span></div>'+
   '<h3>'+escapeHtml(label(action.requirement))+'</h3>'+
   '<p>'+escapeHtml(action.question)+'</p>'+
   '<small><strong>Review lead:</strong> '+escapeHtml(action.owner)+'</small></article>').join('\n');
 const groups=snapshot.all_checks.map(group=>'<section class="group" aria-labelledby="group-'+escapeHtml(group.name.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-'))+'">'+
   '<h3 id="group-'+escapeHtml(group.name.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-'))+'">'+escapeHtml(group.name)+' <span>'+group.checks.length+' review areas</span></h3>'+
   group.checks.map(check=>'<details><summary><span>'+escapeHtml(label(check.id))+'</span><span class="status">'+escapeHtml(check.status==='missing'?'Evidence needed':check.status.replaceAll('_',' '))+'</span></summary>'+
     '<div class="detail"><p>'+escapeHtml(check.question)+'</p><p><strong>Responsible reviewer:</strong> '+escapeHtml(check.owner)+'</p>'+
     '<p class="note">This item has not been independently approved. Only a qualified, authorized review can establish actual readiness.</p></div></details>').join('\n')+'</section>').join('\n');
 return String.raw`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta name="description" content="REIGNITE organizer preview generated from fail-closed event feasibility checks. Not a live permit or event approval.">
<meta name="theme-color" content="#121819">
<title>${title}</title>
<style>
:root{color-scheme:dark;--bg:#11191b;--panel:#1d282c;--line:#465458;--text:#f6f1e9;--muted:#bbc8ca;--coral:#ff8154;--gold:#f3d195}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.58 system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{width:min(1120px,calc(100% - 36px));margin:auto}.skip{position:absolute;left:-9999px;top:0;background:white;color:black;padding:12px}.skip:focus{left:12px;top:12px}a{color:#c4e2e9}a:hover{color:var(--gold)}a:focus-visible,summary:focus-visible{outline:3px solid var(--gold);outline-offset:4px}
.notice{background:#e8d3b5;color:#25231d;padding:12px 20px;text-align:center;font-size:12px;font-weight:850}
header{padding:65px 0 58px;background:radial-gradient(circle at 90% 10%,#673d2c 0,transparent 42%),linear-gradient(155deg,#26363c,#151d20)}
.eyebrow{font-size:11px;color:var(--gold);font-weight:900;text-transform:uppercase;letter-spacing:.2em}.back{display:inline-block;margin-bottom:27px;text-transform:uppercase;font-size:12px;font-weight:800;letter-spacing:.11em}
h1{font-size:clamp(49px,9vw,108px);line-height:.95;letter-spacing:-.085em;margin:15px 0 22px}h1 span{color:var(--coral)}.lead{font-size:20px;line-height:1.45;max-width:800px}.muted{color:var(--muted);max-width:750px}
.snapshot{display:flex;flex-wrap:wrap;gap:8px;margin:25px 0}.metric{padding:13px 17px;background:#121e22;border:1px solid #526069;border-radius:6px;min-width:120px}.metric strong{display:block;font-size:25px;line-height:1.2}.metric small{color:#becbd0;font-size:11px}
main{padding:55px 0 90px}.section-title{margin:0 0 15px;font-size:clamp(30px,4.5vw,51px);letter-spacing:-.05em;line-height:1.09}.intro{max-width:820px;color:var(--muted);margin:0 0 25px}
.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:25px 0 70px}
.action{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:23px;min-height:205px}
.action:first-child{border-color:var(--coral);background:linear-gradient(140deg,#3c2e29,#1d282c 76%)}.action-top{display:flex;justify-content:space-between;align-items:center}.number{font-size:28px;font-weight:900;color:var(--coral);line-height:1}.state{border:1px solid #776b57;border-radius:50px;color:#f1d6a1;font-size:10px;letter-spacing:.09em;padding:4px 8px;font-weight:800}.action h3{font-size:21px;margin:15px 0 10px;text-transform:capitalize;letter-spacing:-.025em}.action p{color:#d0d9da;font-size:14px;margin:0 0 16px}.action small{color:#aebdc1}
.group{margin-bottom:27px;border:1px solid var(--line);background:#182227;border-radius:10px;overflow:hidden}.group h3{display:flex;justify-content:space-between;align-items:baseline;gap:15px;padding:20px 22px;margin:0;font-size:23px;letter-spacing:-.03em}.group h3 span{font-size:12px;color:var(--muted);font-weight:500;letter-spacing:0}
details{border-top:1px solid #34474f}summary{padding:17px 22px;display:flex;gap:12px;justify-content:space-between;align-items:center;cursor:pointer;text-transform:capitalize;font-weight:700;list-style:none}summary::-webkit-details-marker{display:none}summary:hover{background:#243139}.status{color:var(--gold);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;text-align:right}.detail{padding:2px 22px 23px;color:#c6d0d4;font-size:14px;max-width:850px}.detail strong{color:#fff}.note{font-size:12px;color:#a6b8c0}
.readiness-limit{border-left:3px solid var(--coral);padding:18px 22px;background:#302a27;margin:40px 0}.readiness-limit strong{display:block;font-size:17px}.readiness-limit p{color:#d9c9b8;margin:8px 0 0}
footer{border-top:1px solid var(--line);padding:30px 0 45px;font-size:12px;color:#afbec3}
@media(max-width:650px){header{padding:42px 0}.actions{grid-template-columns:1fr}.group h3{align-items:start;flex-direction:column;gap:4px}.metric{flex:1;min-width:105px}.action{min-height:0}.section-title{font-size:34px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style>
</head><body>
<a class="skip" href="#main">Skip to readiness</a>
<div class="notice">SOURCE-ONLY PLANNING PREVIEW · NOT LIVE STATUS · NOT VENUE PERMISSION · NO EVENT ANNOUNCEMENT</div>
<header><div class="wrap"><a class="back" href="../">← REIGNITE concept</a><div class="eyebrow">For the organizer · what needs attention</div>
<h1>Make it <span>happen.</span><br>Make it safe.</h1>
<p class="lead">One clear path from a creative idea to a reviewable event. Here's what we still need to establish before any launch claims.</p>
<p class="muted">This preview was generated from Evercraft's Events feasibility rules with <strong>no authenticated museum/permit evidence imported</strong>. It does not show real-time progress or approvals.</p>
<div class="snapshot"><div class="metric"><strong>${snapshot.total_checks}</strong><small>Review areas</small></div><div class="metric"><strong>${snapshot.missing}</strong><small>Missing evidence in this preview</small></div><div class="metric"><strong>0</strong><small>Verified approvals represented</small></div></div>
</div></header>
<main id="main" class="wrap"><section aria-labelledby="nextHeading">
<div class="eyebrow">First things first</div><h2 class="section-title" id="nextHeading">The next five decisions to unlock.</h2>
<p class="intro">The venue, permitted hours and preservation constraints lead. Remaining experiences are optional until qualified reviewers confirm they fit.</p>
<div class="actions">${next}</div></section>
<section aria-labelledby="requirementsHeading"><div class="eyebrow">All review areas</div><h2 class="section-title" id="requirementsHeading">Everything behind the scenes.</h2>
<p class="intro">Tap any requirement to see its purpose and responsible reviewer. Every item starts as an evidence request, not a confirmed permit.</p>${groups}</section>
<div class="readiness-limit"><strong>Planning is not permission.</strong><p>No real tickets, paid bookings, artist invitations, fundraising, occupancy, performance, sound-hour extension, or museum use are authorized by this page. The current Hangar B floor plan and exterior parcel boundaries remain unverified.</p></div>
</main><footer><div class="wrap">REIGNITE / EVERCRAFT EVENTS · GENERATED FROM CANONICAL FEASIBILITY RULES · NO CUSTOMER DATA OR ACTIVE FORMS · <a href="../">Back to festival concept</a></div></footer>
</body></html>`;
}
