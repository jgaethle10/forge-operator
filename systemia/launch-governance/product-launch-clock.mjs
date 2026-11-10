/**
 * Read-only time eligibility check. It does not publish, authorize publishing,
 * create a scheduled task, or grant a public release.
 *
 * Founder directive: first announcements of Evercraft products and new
 * commercial services must use 10:28, 2:05, or 7:04 on the LOCAL 12-hour clock
 * in America/Los_Angeles. AM/PM has not been restricted by the founder.
 */
import fs from 'node:fs';
const POLICY=JSON.parse(fs.readFileSync(new URL('./product-launch-clock.json',import.meta.url),'utf8'));
const allowed=new Set(POLICY.allowed_clock_face_times);
export function evaluateProductLaunchClock(instantISO){
  if(typeof instantISO!=='string'||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(instantISO))
     return {schema:'evercraft.systemia.launch-clock-evaluation.v1',
       status:'HOLD',reason:'timestamp_requires_explicit_offset',time_eligible:false,publication_authorized:false};
  const dt=new Date(instantISO);
  if(Number.isNaN(dt.valueOf()))
     return {schema:'evercraft.systemia.launch-clock-evaluation.v1',
       status:'HOLD',reason:'invalid_instant',time_eligible:false,publication_authorized:false};
  const fmt=new Intl.DateTimeFormat('en-US',{
    timeZone:POLICY.timezone,hour:'numeric',minute:'2-digit',hourCycle:'h12'
  });
  const p=Object.fromEntries(fmt.formatToParts(dt).filter(x=>x.type==='hour'||x.type==='minute').map(x=>[x.type,x.value]));
  const localClockFace=String(Number(p.hour)).padStart(2,'0')+':'+p.minute;
  const eligible=allowed.has(localClockFace);
  return {schema:'evercraft.systemia.launch-clock-evaluation.v1',
    status:eligible?'TIME_ELIGIBLE_ONLY':'HOLD',
    time_eligible:eligible,
    local_clock_face:localClockFace,
    time_zone:POLICY.timezone,
    reason:eligible?'founder_birthday_clock_face_matches':'outside_founder_launch_clock',
    publication_authorized:false,
    note:'Other founder, media rights, destination, channel and specific release approval gates remain mandatory.'
  };
}
