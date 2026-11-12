// Website Audit conversion journey: truthfully illustrates the deliverable.
// Static, dependency-free and scoped to the existing $49 offer. Never implies a live scan.
export function renderWebsiteAuditDecisionJourney(){
  return `
<style>
.audit-journey{margin:26px 0 12px;border:1px solid #426a89;border-radius:24px;overflow:hidden;background:linear-gradient(145deg,#10293c 0%,#0c1b2d 42%,#07101e 100%);box-shadow:0 30px 65px #0005}
.audit-journey *{box-sizing:border-box}
.audit-journey-head{padding:clamp(20px,4vw,34px);border-bottom:1px solid #31516d;background:radial-gradient(circle at 96% 5%,#184c74a8,transparent 55%)}
.audit-journey-eyebrow{display:flex;align-items:center;gap:9px;color:#8bd0ff;text-transform:uppercase;font-size:11px;font-weight:800;letter-spacing:.14em}
.audit-journey-eyebrow:before{content:'';width:8px;height:8px;background:#8bd0ff;border-radius:50%;box-shadow:0 0 0 5px #8bd0ff22}
.audit-journey h2{font-size:clamp(26px,4.7vw,45px);line-height:1.09;letter-spacing:-.045em;margin:16px 0 12px;max-width:700px}
.audit-journey p{color:#c1d5e6;line-height:1.55}
.audit-problem-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:22px}
.audit-problem-grid div{background:#05142399;border:1px solid #3b5d76;border-radius:12px;padding:12px;min-height:74px;font-size:14px;color:#edf5ff}
.audit-problem-grid span{display:block;color:#8bb9d9;font-size:11px;margin-bottom:5px;text-transform:uppercase;letter-spacing:.08em}
.audit-report{display:grid;grid-template-columns:minmax(0,.88fr) minmax(0,1.12fr);gap:0}
.audit-report-copy{padding:clamp(18px,3.3vw,32px);background:#0d1e30}
.audit-report-copy h3{font-size:clamp(23px,3vw,31px);letter-spacing:-.04em;margin:12px 0}
.audit-report-copy p{font-size:14px}
.audit-report-preview{padding:clamp(17px,3vw,27px);background:#071523;border-left:1px solid #31516d}
.audit-report-topline{display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:1px solid #345774;padding-bottom:12px;color:#cee6f8;font-size:12px}
.audit-report-topline strong{letter-spacing:.12em;font-size:11px;color:#82cbff}
.audit-report-row{display:grid;grid-template-columns:29px 1fr;gap:12px;border-bottom:1px solid #1b3a50;padding:15px 0}
.audit-report-row:last-of-type{border-bottom:0}
.audit-report-number{width:28px;height:28px;border:1px solid #3f779c;border-radius:9px;display:grid;place-items:center;color:#92d3ff;font-size:12px;font-weight:800}
.audit-report-row strong{display:block;font-size:14px;color:#f4faff}
.audit-report-row small{display:block;margin-top:5px;color:#a9c6d9;line-height:1.4;font-size:12px}
.audit-report-foot{margin-top:10px;font-size:11px;color:#aac5d8;line-height:1.5}
.audit-journey-bottom{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:18px;padding:22px clamp(18px,3vw,29px);border-top:1px solid #31516d}
.audit-journey-price{font-size:28px;font-weight:850;letter-spacing:-.04em}
.audit-journey-price small{display:block;font-size:12px;letter-spacing:normal;color:#accbe0;font-weight:500;margin-top:3px}
.audit-journey-cta{background:linear-gradient(135deg,#267ff1,#6dbdff);color:#061327!important;display:inline-flex;padding:13px 20px;border-radius:11px;font-weight:850;text-decoration:none;box-shadow:0 12px 26px #2782ff3d}
.audit-journey-details{padding:0 clamp(18px,3vw,29px) 22px}
.audit-journey-details details{border-top:1px solid #29465d;padding:12px 0}
.audit-journey-details summary{cursor:pointer;color:#e3f2ff;font-size:14px;font-weight:700;list-style-position:outside}
.audit-journey-details p{font-size:13px;margin:10px 0 0}
@media(max-width:700px){.audit-problem-grid{grid-template-columns:1fr}.audit-problem-grid div{min-height:auto}.audit-report{grid-template-columns:1fr}.audit-report-preview{border-left:0;border-top:1px solid #31516d}.audit-journey-bottom{align-items:stretch}.audit-journey-cta{width:100%;justify-content:center}}
@media(prefers-reduced-motion:no-preference){.audit-journey-cta:hover{filter:brightness(1.12)}}
</style>
<section class="audit-journey" aria-label="See exactly what is in the $49 Website Audit">
 <div class="audit-journey-head">
  <div class="audit-journey-eyebrow">No jargon. No giant contract.</div>
  <h2>People visit your website. Now make it easier for them to become customers.</h2>
  <p>Pick the problem you recognize. We focus the paid audit on one public website and the five changes worth considering first.</p>
  <div class="audit-problem-grid">
   <div><span>Problem 01</span>Visitors leave without contacting you.</div>
   <div><span>Problem 02</span>Your mobile page makes buying or booking difficult.</div>
   <div><span>Problem 03</span>People cannot quickly tell why to choose you.</div>
  </div>
 </div>
 <div class="audit-report">
  <div class="audit-report-copy">
   <div class="audit-journey-eyebrow">Illustrative report · not a live audit</div>
   <h3>Show me what I'm actually buying.</h3>
   <p>You'll receive a concise public-site assessment with five ranked recommendations, evidence and next actions. The sample on the right shows the structure, not findings about your business.</p>
   <p>We tell you what can be seen publicly, what remains unknown, and which improvements need access or a specialist.</p>
  </div>
  <div class="audit-report-preview" aria-label="Example of how recommendations appear">
   <div class="audit-report-topline"><strong>YOUR QUICK WIN MAP</strong><span>Illustrative sample</span></div>
   <div class="audit-report-row"><div class="audit-report-number">01</div><div><strong>Make the next action unmistakable</strong><small>Example: introduce one clear mobile-first booking or quote action near the top of the page.</small></div></div>
   <div class="audit-report-row"><div class="audit-report-number">02</div><div><strong>Show immediate evidence of trust</strong><small>Example: display supported service areas and authentic customer proof before the visitor has to search for them.</small></div></div>
   <div class="audit-report-row"><div class="audit-report-number">03</div><div><strong>Remove avoidable mobile friction</strong><small>Example: inspect tap targets, contact paths and readability on a narrow screen.</small></div></div>
   <div class="audit-report-foot">Sample recommendations only. Actual findings come from evidence collected for the submitted public URL. No ranking or performance results are claimed before inspection.</div>
  </div>
 </div>
 <div class="audit-journey-bottom">
  <div class="audit-journey-price">$49 <small>One public website · one-time Quick Win Audit</small></div>
  <a class="audit-journey-cta" href="#audit-order">Start with my website →</a>
 </div>
 <div class="audit-journey-details">
  <details><summary>Will you need a meeting or passwords?</summary><p>No meeting or website credentials are needed to submit a public-site audit request. This service reviews publicly available material. If you choose to pursue a separate implementation later, access and scope would be handled separately.</p></details>
  <details><summary>Does $49 include changing my website?</summary><p>No. The Quick Win Audit identifies and prioritizes changes; it does not include implementing fixes, guarantees of sales or rankings, or access to private analytics.</p></details>
  <details><summary>What happens after I submit?</summary><p>If checkout is available, Evercraft Payments prepares the exact offer and verifies completed payment before fulfillment. If checkout is held, the form records a free inquiry instead. You will see that distinction before submitting.</p></details>
 </div>
</section>`;
}
