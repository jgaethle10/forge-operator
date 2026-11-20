// Single validated Studio project contract shared by buyer intake and private Relay.
// Keep the founding offer label aligned with public/commercial-studio/index.html.
// Legacy display value is accepted for old cached pages and existing alert outboxes,
// but is always normalized to the truthful current introductory offer.
export const STUDIO_INTRO_PROJECT='$50 introductory 30-second social commercial pilot';
export const STUDIO_LEGACY_INTRO_PROJECT='$50 launch-week 30-second social commercial pilot';
export const STUDIO_PROJECT_OPTIONS=Object.freeze([
 STUDIO_INTRO_PROJECT,
 'Product launch commercial',
 'Brand story / ad campaign',
 'Social video creative',
 'Something else',
]);
const approved=new Set(STUDIO_PROJECT_OPTIONS);
export function normalizeStudioProject(value){
 if(typeof value!=='string')return null;
 const candidate=value.trim();
 if(candidate===STUDIO_LEGACY_INTRO_PROJECT)return STUDIO_INTRO_PROJECT;
 return approved.has(candidate)?candidate:null;
}
