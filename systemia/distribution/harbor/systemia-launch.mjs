// Harbor (formerly Muse) | Systemia launch capsule. Staged only; this module performs no network calls, posting or scheduling.
export const HARBOR_SYSTEMIA_LAUNCH = Object.freeze({
  "schema": "evercraft.harbor.systemia-launch.v1",
  "campaign_id": "systemia-front-door-proof-first-2026-11-16",
  "publisher": "Evercraft LLC",
  "distribution_agent": "Harbor",
  "former_agent_name": "Muse",
  "stage": "STAGED_NOT_PUBLISHED",
  "public_destination": "https://jgaethle10.github.io/forge-operator/systemia/",
  "source_pr": "https://github.com/jgaethle10/forge-operator/pull/2165",
  "release_state": {
    "source_merged": true,
    "real_https_and_image_readback_pending": true,
    "authenticated_harbor_transport_verified": false,
    "verified_evercraft_social_account": false,
    "publish_authorized": false,
    "schedule_authorized": false,
    "send_authorized": false,
    "media_rights_verified": false
  },
  "claims": {
    "orchestration": "Systemia is a growing owned architecture, not a generally available customer agent workforce.",
    "reporter": "Work Saban free browser-local sales CSV tool, no file upload.",
    "other": "AI answer comparison and research planning are separate bounded tools.",
    "commerce": "Customers inquire first; approved scope, rights, delivery and checkout must be confirmed before payment.",
    "metrics": "A click, merged page or marketing draft is not a paid customer."
  },
  "assets": {
    "wide_png_source": "public/systemia/social-card.svg",
    "wide_png_public_url": "https://jgaethle10.github.io/forge-operator/systemia/social-card.png",
    "dimensions": [
      1200,
      630
    ],
    "wide_png_live_verified": false,
    "vertical_video_source": null,
    "video_media_approved": false,
    "video_rule": "Authentic rights-cleared screen recording of actual reporter on synthetic data; no staged artificial execution."
  },
  "platforms": {
    "facebook": {
      "required_account": "Evercraft company Page, verified",
      "caption": "I've been building Evercraft around a simple question: what if you could give work a direction and actually see it get finished?\n\nMeet Systemia. It's the vision we're engineering: specialized tools coordinated around a real goal, and a record of what actually happened. The full experience is still being built.\n\nOne piece is ready to try now: Work Saban's free browser-based sales-report tool. Start with a sample CSV and see the actual result. No signup, no customer file upload.\n\nIf your business has a task that repeats every week, tell us what it is.\n\nMeet Systemia: https://jgaethle10.github.io/forge-operator/systemia/",
      "media": "wide verified PNG or real video",
      "status": "DRAFT_NOT_SENT"
    },
    "instagram": {
      "required_account": "Evercraft Instagram business account, verified",
      "caption": "One vision. Many hands.\n\nWe're building Systemia so actual business work gets coordinated, completed and checked. It's still in progress, but one real piece is free today: Work Saban's CSV report tool, running in your browser.\n\nWhat repetitive work would you take off your plate first?\n\nFind the verified link to Systemia in our profile.\n\n#Evercraft #Systemia #WorkSaban #BusinessTools",
      "media": "Original rights-cleared 9:16 video or portrait artwork required",
      "status": "MEDIA_AND_AUTH_PENDING"
    },
    "linkedin": {
      "required_account": "Evercraft LinkedIn organization account, verified",
      "caption": "An impressive AI demo is one thing. Dependable business work is another.\n\nAt Evercraft, Systemia is the orchestration architecture we're building to connect goals, specialized capabilities and checked outcomes. We're not claiming every piece of this vision is commercially available yet.\n\nYou can already try a real, bounded piece: Work Saban's free, browser-local monthly sales CSV reporter.\n\nThe next stage is simple: get businesses to describe repetitive work, agree on small pilots, deliver results, and earn the next engagement.\n\nExplore Systemia: https://jgaethle10.github.io/forge-operator/systemia/",
      "media": "Wide verified PNG or authorized text-only post",
      "status": "DRAFT_NOT_SENT"
    },
    "tiktok": {
      "required_account": "Evercraft TikTok, verified",
      "caption": "What if work had a team? That's the Systemia vision we're building. Here's one real free piece: a browser-based CSV sales reporter. The rest of the system is still growing. See the verified link in bio. #Systemia #Evercraft #BuildInPublic",
      "media": "Authentic rights-cleared 9:16 real demonstration required",
      "status": "VIDEO_AND_AUTH_PENDING"
    }
  },
  "prohibited_brands": [
    "ChristmasLightsUSA",
    "R&B Chicken & Soul",
    "Space Dudz"
  ],
  "release_gates": [
    "live_website_https",
    "live_png_https_1200x630",
    "verified_evercraft_account_authority",
    "rights_approved_media",
    "existing_post_duplicate_preflight",
    "exact_caption_and_target_owner_approval",
    "provider_receipt_and_public_link_readback"
  ],
  "outcome": {
    "posted": false,
    "scheduled": false,
    "provider_receipts": [],
    "inquiries_count": null,
    "paid_sales_count": null
  }
});

export function validateHarborSystemiaLaunch(kit=HARBOR_SYSTEMIA_LAUNCH){
  const errors=[];
  if(kit.schema!=='evercraft.harbor.systemia-launch.v1')errors.push('schema');
  if(kit.distribution_agent!=='Harbor'||kit.former_agent_name!=='Muse')errors.push('agent');
  if(kit.stage!=='STAGED_NOT_PUBLISHED')errors.push('stage');
  const rs=kit.release_state||{};
  for(const k of ['authenticated_harbor_transport_verified','verified_evercraft_social_account','publish_authorized','schedule_authorized','send_authorized','media_rights_verified']) if(rs[k]!==false)errors.push('authority:'+k);
  const a=kit.assets||{};
  if(a.wide_png_live_verified!==false||a.video_media_approved!==false||a.dimensions?.join('x')!=='1200x630')errors.push('media');
  const platforms=['facebook','instagram','linkedin','tiktok'];
  if(platforms.some(k=>!kit.platforms?.[k]?.caption||kit.platforms[k].caption.length<100))errors.push('caption');
  if(kit.prohibited_brands?.join('|')!=='ChristmasLightsUSA|R&B Chicken & Soul|Space Dudz')errors.push('prohibited_brands');
  if(kit.outcome?.posted!==false||kit.outcome?.scheduled!==false||kit.outcome?.provider_receipts?.length)errors.push('outcome');
  if(kit.outcome?.paid_sales_count!==null||kit.outcome?.inquiries_count!==null)errors.push('unverified_counts');
  if(kit.public_destination!=='https://jgaethle10.github.io/forge-operator/systemia/')errors.push('destination');
  return {pass:errors.length===0,errors,postable:false,transport:'human_attached_only',stage:kit.stage};
}
