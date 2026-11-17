// FindMyPart -> Harbor (formerly Muse). Staging capsule only; no API calls or publisher rights.
export const HARBOR_FINDMYPART_LAUNCH = {
  "schema": "evercraft.harbor.findmypart-launch.v1",
  "campaign_id": "findmypart-early-access-original-brand",
  "product": "FindMyPart",
  "operator": "Evercraft LLC",
  "distribution_agent": "Harbor",
  "former_agent_name": "Muse",
  "phase": "STAGED_NOT_PUBLISHED",
  "intended_product_url": "https://fabric.systemiacommandcenters.com/findmypart/search/",
  "public_route_verified": false,
  "authenticated_systemia_handoff": false,
  "publish_authorized": false,
  "send_authorized": false,
  "schedule_authorized": false,
  "human_attached_handoff_required": true,
  "product_release_gate": "systemia/launch/findmypart-launch-readiness.json",
  "branding": {
    "source": "docs/launch/findmypart/BRAND_AND_PRODUCT_SYSTEM.md",
    "mark": "public/findmypart/brand/mark.svg",
    "wordmark": "public/findmypart/brand/wordmark.svg",
    "colors": {
      "charcoal": "#151c25",
      "orange": "#f16b27",
      "blue": "#2565a3",
      "white": "#ffffff",
      "workshop_gray": "#f7f8fa"
    },
    "tagline": "Missing part. Not the end."
  },
  "artwork": [
    {
      "file": "FindMyPart-Early-Access-Square.png",
      "width": 1080,
      "height": 1080,
      "sha256": "f5be8e8a8ebe4a92fedb1582f76d16a45c6d1c34bdb533f9da02d91d01e7d9e9",
      "role": "square_social"
    },
    {
      "file": "FindMyPart-Early-Access-Portrait.png",
      "width": 1080,
      "height": 1350,
      "sha256": "b07bfd97a7f649ec6d1605ccef1499510902e3510f195cd0c033f61ca6e15494",
      "role": "portrait_social"
    },
    {
      "file": "FindMyPart-Early-Access-Landscape.png",
      "width": 1200,
      "height": 628,
      "sha256": "25e40548dea7f7bdf33f5bb08aa2be9192979a3b60871ffae0dd3c0ee5775b38",
      "role": "landscape_social"
    }
  ],
  "prohibited_targets": [
    "R&B Chicken & Soul",
    "Space Dudz"
  ],
  "platform_access": {
    "facebook": "harbor_read_only_analytics_no_publishing_handoff",
    "instagram": "harbor_read_only_analytics_no_publishing_handoff",
    "linkedin": "no_verified_harbor_connection",
    "tiktok": "no_verified_harbor_connection"
  },
  "captions": {
    "facebook": {
      "artwork": "FindMyPart-Early-Access-Square.png",
      "draft": "One missing part can leave an otherwise useful machine sitting for months. Sometimes it gets thrown away.\n\nWe're building FindMyPart at Evercraft for exactly that problem. The mission goes beyond locating replacements: explore original parts, salvage, repair information, cross-references, and even fabrication research when conventional sourcing ends.\n\nOur early-access experience starts with free description-based research tools. Automatic photo identification, integrated global discovery, and engineering verification are still being developed.\n\nHave something sitting because one component is missing? We'd love to hear about the problem.\n\nFindMyPart. Missing part. Not the end.",
      "call_to_action": "Invite examples; do not say publicly live without release verification."
    },
    "instagram": {
      "artwork": "FindMyPart-Early-Access-Portrait.png",
      "draft": "One broken part shouldn't retire an entire machine.\n\nIntroducing FindMyPart, an Evercraft project built around a simple idea: find another way before giving up.\n\nReplacement parts. Salvage. Repair paths. CAD and fabrication research.\n\nEarly-access search tools are taking shape. Photo recognition and automated global discovery are still in development.\n\nWhat's the hardest part you've ever tried to find?\n\n#FindMyPart #RightToRepair #RepairDontReplace #Evercraft",
      "call_to_action": "Use verified account bio link only after public route checks."
    },
    "linkedin": {
      "artwork": "FindMyPart-Early-Access-Landscape.png",
      "draft": "Equipment often reaches an artificial end of life when one unavailable component prevents the rest from operating.\n\nEvercraft is developing FindMyPart to investigate more than conventional replacement inventory: manufacturer references, salvage, repair pathways, technical documentation, and potentially viable fabrication or substitution routes.\n\nThe early-access product begins with user-directed research and candidate tracking. Automated photo identification, global supplier integration and engineering validation are future capabilities, not present claims.\n\nWe're particularly interested in understanding how this problem affects independent repair shops, machinery owners and maintenance teams.\n\nFindMyPart. Missing part. Not the end.",
      "call_to_action": "Invite industry feedback; no verified stock or fitment claims."
    },
    "tiktok": {
      "artwork": "FindMyPart-Early-Access-Portrait.png",
      "draft": "An entire machine. One missing part. And suddenly it's scrap?\n\nWe're building FindMyPart to challenge that.\n\nParts. Salvage. Repair. Fabrication possibilities.\n\nStarting with early-access research tools. The bigger photo-recognition and global-discovery engine is still being built.\n\nWhat broken thing are you trying to save?\n\n#FindMyPart #RepairTok #RightToRepair #Evercraft",
      "call_to_action": "Graphic preview only; no TikTok video or connection claimed."
    }
  },
  "verification_gates": [
    "public_https_delivery",
    "mobile_buyer_flow",
    "saban_ci_pass",
    "platform_identity_and_permissions",
    "explicit_publish_authorization"
  ],
  "required_status_before_post": "ALL_GATES_VERIFIED_WITH_POST_APPROVAL",
  "outcome": {
    "posted": false,
    "scheduled": false,
    "published_receipts": []
  }
};
export function validateHarborLaunchKit(kit=HARBOR_FINDMYPART_LAUNCH){
  const failures=[];
  if(kit.schema!=='evercraft.harbor.findmypart-launch.v1')failures.push('schema');
  if(kit.phase!=='STAGED_NOT_PUBLISHED')failures.push('phase');
  for(const flag of ['public_route_verified','authenticated_systemia_handoff','publish_authorized','send_authorized','schedule_authorized'])if(kit[flag]!==false)failures.push('unexpected_permission:'+flag);
  if(kit.human_attached_handoff_required!==true)failures.push('transport_must_be_manual');
  for(const [name,hex] of Object.entries({charcoal:'#151c25',orange:'#f16b27',blue:'#2565a3',white:'#ffffff',workshop_gray:'#f7f8fa'}))if(kit.branding?.colors?.[name]!==hex)failures.push('brand_drift:'+name);
  if(!Array.isArray(kit.artwork)||kit.artwork.length!==3||kit.artwork.some(x=>!/^FindMyPart-Early-Access-/.test(x.file)||!(/^[0-9a-f]{64}$/).test(x.sha256)))failures.push('artwork');
  const platforms=['facebook','instagram','linkedin','tiktok'];
  if(platforms.some(p=>typeof kit.captions?.[p]?.draft!=='string'||kit.captions[p].draft.length<120||!kit.artwork.some(a=>a.file===kit.captions[p].artwork)))failures.push('captions_or_asset_mapping');
  if(kit.prohibited_targets?.join('|')!=='R&B Chicken & Soul|Space Dudz')failures.push('exclusions');
  if(kit.outcome?.posted!==false||kit.outcome?.scheduled!==false||kit.outcome?.published_receipts?.length!==0)failures.push('false_publication');
  if(!Array.isArray(kit.verification_gates)||kit.verification_gates.length<5)failures.push('release_gates');
  return {pass:failures.length===0,failures,phase:kit.phase,postable:false,transport:'human_attached_only'};
}
