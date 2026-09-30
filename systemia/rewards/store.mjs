import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const SCRATCH_THEMES = Object.freeze(['evercraft','neon','northwest','space','retro','cozy']);
export const SCRATCH_COLLECTION = Object.freeze([
  { key:'spark', label:'Spark', symbol:'⚡' },
  { key:'trail', label:'Trail', symbol:'🌲' },
  { key:'orbit', label:'Orbit', symbol:'🪐' },
  { key:'key', label:'Key', symbol:'🔑' },
  { key:'fox', label:'Fox', symbol:'🦊' },
  { key:'compass', label:'Compass', symbol:'🧭' },
  { key:'signal', label:'Signal', symbol:'📡' },
  { key:'ember', label:'Ember', symbol:'🔥' },
  { key:'mountain', label:'Mountain', symbol:'🏔️' },
  { key:'bolt', label:'Bolt', symbol:'🔋' },
  { key:'star', label:'Star', symbol:'✦' },
  { key:'crown', label:'Crown', symbol:'👑' }
]);

const EVIDENCE_BOUNDARY = 'Scratch Lab is unlimited free play with cosmetic collection progress only. It awards no wallet points, prize entries, cash value, XP, or improved promotional odds.';

function clean(value){ return String(value ?? '').trim(); }
function hash(value){ return createHash('sha256').update(clean(value)).digest('hex'); }
function ensureDir(dir){ fs.mkdirSync(dir,{recursive:true}); }

function atomicWriteJson(file,value){
  ensureDir(path.dirname(file));
  const temp = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value,null,2) + '\n', {encoding:'utf8',mode:0o600});
  fs.renameSync(temp,file);
}

function readJson(file,fallback=null){
  if(!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

function dateInZone(date,timeZone='America/Los_Angeles'){
  try{
    const parts = new Intl.DateTimeFormat('en-CA',{
      timeZone,year:'numeric',month:'2-digit',day:'2-digit'
    }).formatToParts(date);
    const map=Object.fromEntries(parts.map((part)=>[part.type,part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }catch{
    return date.toISOString().slice(0,10);
  }
}

function badges(lifetimeRuns,collectionCount,themeCount){
  const out=[];
  if(lifetimeRuns>=1) out.push('first_scratch');
  if(lifetimeRuns>=5) out.push('five_scratches');
  if(lifetimeRuns>=25) out.push('twenty_five_scratches');
  if(lifetimeRuns>=100) out.push('hundred_scratches');
  if(collectionCount>=SCRATCH_COLLECTION.length) out.push('full_collection');
  if(themeCount>=SCRATCH_THEMES.length) out.push('theme_hopper');
  return out;
}

function publicProfile(profile,playDate){
  const sameDay=profile.play_date===playDate;
  const runsToday=sameDay ? Number(profile.runs_today||0) : 0;
  return {
    subject_hash:profile.subject_hash,
    lifetime_runs:Number(profile.lifetime_runs||0),
    play_date:playDate,
    runs_today:runsToday,
    themes_played:Array.isArray(profile.themes_played)?profile.themes_played:[],
    collection_keys:Array.isArray(profile.collection_keys)?profile.collection_keys:[],
    badges:badges(
      Number(profile.lifetime_runs||0),
      Array.isArray(profile.collection_keys)?profile.collection_keys.length:0,
      Array.isArray(profile.themes_played)?profile.themes_played.length:0
    ),
    last_theme_key:profile.last_theme_key||'',
    collection_catalog:SCRATCH_COLLECTION,
    theme_catalog:SCRATCH_THEMES,
    daily_goals:[
      {key:'three',label:'Scratch 3 free-play cards',target:3,progress:Math.min(runsToday,3),complete:runsToday>=3},
      {key:'six',label:'Scratch 6 free-play cards',target:6,progress:Math.min(runsToday,6),complete:runsToday>=6},
      {key:'ten',label:'Scratch 10 free-play cards',target:10,progress:Math.min(runsToday,10),complete:runsToday>=10}
    ],
    evidence_boundary:EVIDENCE_BOUNDARY
  };
}

async function withLock(file,fn,{attempts=120,delayMs=15}={}){
  ensureDir(path.dirname(file));
  let handle=null;
  for(let i=0;i<attempts;i+=1){
    try{
      handle=fs.openSync(file,'wx',0o600);
      break;
    }catch(error){
      if(error?.code!=='EEXIST') throw error;
      await new Promise((resolve)=>setTimeout(resolve,delayMs));
    }
  }
  if(handle===null) throw new Error('rewards_state_lock_timeout');
  try{
    return await fn();
  }finally{
    try{ fs.closeSync(handle); }catch{}
    try{ fs.unlinkSync(file); }catch{}
  }
}

export function createRewardsStore({stateDir=process.env.REWARDS_STATE_DIR || path.join('/tmp','evercraft-rewards')}={}){
  const root=path.resolve(stateDir);
  const profilesDir=path.join(root,'scratch','profiles');
  const runsDir=path.join(root,'scratch','runs');
  const locksDir=path.join(root,'locks');
  ensureDir(profilesDir);
  ensureDir(runsDir);
  ensureDir(locksDir);

  const subjectRef=(subject)=>hash(subject);
  const profileFile=(subject)=>path.join(profilesDir,subjectRef(subject)+'.json');
  const runFile=(subject,runKey)=>path.join(runsDir,subjectRef(subject),hash(runKey)+'.json');
  const lockFile=(subject)=>path.join(locksDir,subjectRef(subject)+'.lock');

  function getScratchProfile({subject,timeZone='America/Los_Angeles',now=new Date()}){
    const normalized=clean(subject);
    if(normalized.length<3) throw new Error('rewards_subject_required');
    const playDate=dateInZone(now,timeZone);
    const existing=readJson(profileFile(normalized),{
      subject_hash:subjectRef(normalized),
      lifetime_runs:0,
      play_date:playDate,
      runs_today:0,
      themes_played:[],
      collection_keys:[],
      badges:[],
      last_theme_key:'',
      last_run_hash:'',
      updated_at:null,
      evidence_boundary:EVIDENCE_BOUNDARY
    });
    return publicProfile(existing,playDate);
  }

  async function playScratch({subject,runKey,themeKey='evercraft',timeZone='America/Los_Angeles',now=new Date()}){
    const normalizedSubject=clean(subject);
    const normalizedRun=clean(runKey);
    if(normalizedSubject.length<3) throw new Error('rewards_subject_required');
    if(normalizedRun.length<8) throw new Error('scratch_run_key_required');
    const theme=SCRATCH_THEMES.includes(clean(themeKey).toLowerCase()) ? clean(themeKey).toLowerCase() : 'evercraft';

    return withLock(lockFile(normalizedSubject),async()=>{
      const playDate=dateInZone(now,timeZone);
      const existingRun=readJson(runFile(normalizedSubject,normalizedRun),null);
      if(existingRun){
        return {
          ok:true,
          already_recorded:true,
          new_collection:false,
          collectible:SCRATCH_COLLECTION.find((item)=>item.key===existingRun.collection_key)||null,
          run:existingRun,
          profile:getScratchProfile({subject:normalizedSubject,timeZone,now})
        };
      }

      const file=profileFile(normalizedSubject);
      const current=readJson(file,{
        subject_hash:subjectRef(normalizedSubject),
        lifetime_runs:0,
        play_date:playDate,
        runs_today:0,
        themes_played:[],
        collection_keys:[],
        badges:[],
        last_theme_key:'',
        last_run_hash:'',
        updated_at:null,
        evidence_boundary:EVIDENCE_BOUNDARY
      });

      const sameDay=current.play_date===playDate;
      const lifetimeRuns=Number(current.lifetime_runs||0)+1;
      const runsToday=(sameDay?Number(current.runs_today||0):0)+1;
      const collectible=SCRATCH_COLLECTION[(lifetimeRuns-1)%SCRATCH_COLLECTION.length];
      const previousCollection=Array.isArray(current.collection_keys)?current.collection_keys:[];
      const collectionKeys=[...new Set([...previousCollection,collectible.key])];
      const themesPlayed=[...new Set([...(Array.isArray(current.themes_played)?current.themes_played:[]),theme])];
      const runHash=hash(normalizedRun);
      const updatedAt=now.toISOString();

      const next={
        subject_hash:subjectRef(normalizedSubject),
        lifetime_runs:lifetimeRuns,
        play_date:playDate,
        runs_today:runsToday,
        themes_played:themesPlayed,
        collection_keys:collectionKeys,
        badges:badges(lifetimeRuns,collectionKeys.length,themesPlayed.length),
        last_theme_key:theme,
        last_run_hash:runHash,
        updated_at:updatedAt,
        evidence_boundary:EVIDENCE_BOUNDARY
      };

      const run={
        run_hash:runHash,
        subject_hash:subjectRef(normalizedSubject),
        play_date:playDate,
        run_number:lifetimeRuns,
        daily_run_number:runsToday,
        theme_key:theme,
        collection_key:collectible.key,
        collection_index:(lifetimeRuns-1)%SCRATCH_COLLECTION.length,
        status:'completed',
        created_at:updatedAt,
        source_runtime:'yard_evercraft_compute',
        evidence_boundary:'Free-play cosmetic progression only. This run has no cash value, wallet value, prize entry, XP award, or effect on promotional odds.'
      };

      atomicWriteJson(runFile(normalizedSubject,normalizedRun),run);
      atomicWriteJson(file,next);

      return {
        ok:true,
        already_recorded:false,
        new_collection:!previousCollection.includes(collectible.key),
        collectible,
        run,
        profile:publicProfile(next,playDate)
      };
    });
  }

  return {
    root,
    subjectRef,
    getScratchProfile,
    playScratch,
    health(){
      return {
        ok:true,
        service:'evercraft-rewards-yard-store',
        canonical_store:'yard-atomic-files-v1',
        scratch_lab_write_authority:true,
        economic_write_authority:false,
        subject_identifiers_hashed:true,
        evidence_boundary:EVIDENCE_BOUNDARY
      };
    }
  };
}
