// Public-only metadata normalization. This module never reads Systemia private data.
export const REPO = 'jgaethle10/forge-operator';
export const API = 'https://api.github.com/repos/' + REPO;
const GITHUB_PREFIX = 'https://github.com/' + REPO + '/';
const SENSITIVE = /\b(?:secret|credential|password|private key|authentication bypass|token|customer record|pii|ssh|vulnerability|exploit|zero.day|security incident|custody|payment credential|router password)\b/i;
const BAD_BRANCH = /\b(?:private|secrets|production-credential)\b/i;
const MAX_AGE = 14*24*60*60*1000;

export function publicUrl(url) {
  if(typeof url !== 'string') return '';
  try {
    const parsed = new URL(url);
    if(parsed.origin !== 'https://github.com') return '';
    if(!parsed.pathname.startsWith('/'+REPO+'/')) return '';
    if(!/^\/[^/]+\/[^/]+\/(?:pull\/\d+|commit\/[a-f0-9]{7,40}|actions\/runs\/\d+)$/.test(parsed.pathname)) return '';
    if(parsed.search || parsed.hash) return '';
    return parsed.href;
  } catch {return '';}
}
export function titleSafe(value) {
  if(typeof value !== 'string') return '';
  const t=value.replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,126);
  return t.length>=7 && !SENSITIVE.test(t) ? t : '';
}
function category(title) {
  if(/graphic|laser|voice|film|clip|fallen|animation|commercial|publishing/i.test(title))return 'CREATIVE ENGINEERING';
  if(/agent|saban|society|window|node|organism|model/i.test(title))return 'AGENTS & COMPUTE';
  if(/earth|gravity|world|terrain|map|robot/i.test(title))return 'WORLD ENGINE';
  if(/network|fabric|relay|edge|infrastructure/i.test(title))return 'INFRASTRUCTURE';
  if(/discovery|chum|forensi|commerce|marketing/i.test(title))return 'PRODUCT & DISCOVERY';
  return 'EVERCRAFT DEVELOPMENT';
}
function timestamp(v) {
  const ms=Date.parse(v);
  return Number.isFinite(ms)?ms:0;
}
function ageOk(ms,now,days=14){return ms>0 && ms<=now+5*60_000 && now-ms<=Math.min(days*86400_000,MAX_AGE)}
export function normalizePublicActivity(raw, now=Date.now()) {
  const list=[];
  const stats={pr:0,run:0,commit:0};
  if(Array.isArray(raw.pulls))for(const p of raw.pulls){
    const title=titleSafe(p.title),time=timestamp(p.updated_at),url=publicUrl(p.html_url);
    if(!title || !url || !ageOk(time,now,14) || !Number.isInteger(p.number))continue;
    const state=p.merged_at?'MERGED':p.draft?'DRAFT REVIEW':p.state==='open'?'OPEN REVIEW':'CLOSED';
    const item={id:'pr-'+p.number,kind:'PULL REQUEST',title,time,url,
      detail:'PR #'+p.number+' · '+state,category:category(title),state,
      source:'GITHUB · PUBLIC PULL REQUEST',rank:state==='OPEN REVIEW'?3:2};
    list.push(item);stats.pr++;
  }
  if(Array.isArray(raw.runs))for(const r of raw.runs){
    const title=titleSafe(r.name),time=timestamp(r.created_at),url=publicUrl(r.html_url);
    if(!title||!url||!ageOk(time,now,3)||!Number.isInteger(r.id))continue;
    if(BAD_BRANCH.test(r.head_branch||''))continue;
    const state=r.status==='completed'?(r.conclusion==='success'?'PASSED':r.conclusion==='failure'?'FAILED':r.conclusion==='cancelled'?'CANCELLED':'FINISHED'):r.status==='in_progress'?'RUNNING':r.status==='queued'?'QUEUED':'PENDING';
    // Do not depict "pending" as active computation.
    list.push({id:'run-'+r.id,kind:'VERIFICATION',title,time,url,detail:'CHECK #'+r.run_number+' · '+state,
      category:'BUILD VERIFICATION',state,source:'GITHUB · PUBLIC CI RUN',
      rank:state==='RUNNING'?4:state==='PASSED'?3:1});stats.run++;
  }
  if(Array.isArray(raw.commits)) {
    const seen=new Set();
    for(const c of raw.commits){
      const title=titleSafe((c.commit?.message||'').split('\n')[0]),time=timestamp(c.commit?.committer?.date),url=publicUrl(c.html_url);
      if(!title||!url||!ageOk(time,now,3)||!/^[a-f0-9]{40}$/.test(c.sha||''))continue;
      // Repetitive automated mirror writes are real, but show only the latest of each exact task.
      const key=title.toLowerCase().replace(/\[skip ci\]/g,'').trim();
      if(seen.has(key))continue;seen.add(key);
      list.push({id:'commit-'+c.sha,kind:'CODE COMMIT',title,time,url,
        detail:'COMMIT '+c.sha.slice(0,9),category:category(title),
        state:'RECORDED',source:'GITHUB · PUBLIC COMMIT',rank:2});stats.commit++;
    }
  }
  list.sort((a,b)=>b.time-a.time || b.rank-a.rank);
  return {items:list.slice(0,34),stats,source:'PUBLIC GITHUB METADATA',generated_at:new Date(now).toISOString()};
}
