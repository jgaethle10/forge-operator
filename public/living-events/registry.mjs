/** Public exhibit registry acceptance gate. No private operational data or network access. */
const CASE_IDS = Object.freeze(['nepal','helens','yakima']);
const EVIDENCE_STATES = new Set(['documented','reported','unresolved','provisional','unknown','estimated','modeled']);
const SCENES = new Set(['nepal','volcano','valley']);
const fail = (location,message) => { throw new Error(location + ': ' + message); };
const filled = s => typeof s === 'string' && s.trim().length > 0;
const text = (s,location) => {
  if (!filled(s) || s.length > 2500) fail(location,'missing or oversized text');
};
export function safeSourceUrl(raw) {
  if (!filled(raw)) throw new Error('Missing source URL');
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('Invalid source URL'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password)
    throw new Error('Only HTTPS source URLs without credentials are allowed');
  return parsed.href;
}
export function validateCaseRegistry(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
    fail('registry','expected an object');
  if (Object.keys(candidate).sort().join(',') !== [...CASE_IDS].sort().join(','))
    fail('registry','unexpected or missing event IDs');
  for (const id of CASE_IDS) {
    const c = candidate[id], root = 'event ' + id;
    if (!c || typeof c !== 'object' || Array.isArray(c)) fail(root,'missing event record');
    for (const field of ['id','title','subtitle','date','place','mode','eyebrow','descriptor','overview','caution'])
      text(c[field],root+'.'+field);
    if (!/^#[0-9a-fA-F]{6}$/.test(c.palette)) fail(root,'invalid palette');
    if (!SCENES.has(c.tone)) fail(root,'unknown illustration mode');
    if (!Array.isArray(c.stat) || c.stat.length !== 3) fail(root,'invalid summary statistics');
    for (const [i,stat] of c.stat.entries()) {
      if (!Array.isArray(stat) || stat.length !== 3) fail(root+'.stat '+i,'invalid metric');
      stat.forEach((s,j)=>text(s,root+'.stat '+i+' item '+j));
    }
    for (const field of ['sources','features','milestones'])
      if (!Array.isArray(c[field]) || !c[field].length || c[field].length > 100)
        fail(root+'.'+field,'missing or overlong records');
    const ids = new Set();
    for (const source of c.sources) {
      text(source.id,root+'.source ID');
      if (!/^[A-Za-z][A-Za-z0-9-]{1,23}$/.test(source.id) || ids.has(source.id))
        fail(root,'duplicate or invalid source ID');
      ids.add(source.id);
      for (const field of ['name','kind','note']) text(source[field],root+'.source '+source.id+'.'+field);
      try { safeSourceUrl(source.url); } catch (err) { fail(root+'.source '+source.id,err.message); }
    }
    for (const [group,claims] of [['feature',c.features],['milestone',c.milestones]]) {
      for (const [i,claim] of claims.entries()) {
        const where = root+'.'+group+' '+i;
        for (const field of (group==='feature' ? ['id','label','short','detail'] : ['time','label','detail']))
          text(claim[field],where+'.'+field);
        if (!EVIDENCE_STATES.has(claim.state)) fail(where,'unrecognized evidence state');
        if (!Array.isArray(claim.sources) || !claim.sources.length ||
            claim.sources.some(sourceId => !ids.has(sourceId)))
          fail(where,'uncited or orphaned source reference');
        if (group === 'feature' && (!Number.isFinite(claim.x) || !Number.isFinite(claim.y) ||
            claim.x < 0 || claim.x > 100 || claim.y < 0 || claim.y > 100))
          fail(where,'unverified scene placement');
      }
    }
  }
  return candidate;
}
export const registeredCases = CASE_IDS;
