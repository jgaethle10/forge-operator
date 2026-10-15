// RC0.5: canonical Fallen render-job.v1 payload, purely synthetic visualization.
import { createHash } from 'node:crypto';
const sha = (text) => createHash('sha256').update(text).digest('hex');
const f = (x) => Math.round(x * 1e6) / 1e6;
export function makeSyntheticPhenomenonJob({jobId='living-intelligence-rc05',frames=24,width=960,height=540}={}) {
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(jobId)) throw new Error('invalid_job_id');
  if (!Number.isInteger(frames) || frames<1 || frames>48) throw new Error('unsafe_frame_count');
  if (![960,1080,1280].includes(width) || ![540,720,1920].includes(height)) throw new Error('unsupported_dimensions');
  const streamlines=[];
  for (let s=0;s<66;s++) {
    const points=[];
    const base = s*0.61;
    for(let k=0;k<55;k++) {
      const theta=base+k*.065, radius=.038+k*.0047+(s%7)*.006;
      const lon=-87.2 + radius*Math.cos(theta)*22;
      const lat=27.8 + radius*Math.sin(theta)*16;
      points.push({lon:f(lon),lat:f(lat),colorValue:f(12+radius*60),magnitude:f(1+radius*7)});
    }
    streamlines.push({id:`spiral-${String(s).padStart(2,'0')}`,speed:0.5+(s%5)*.2,points,sourceRefs:['evercraft:procedural-rc05']});
  }
  const stage={
    schema:'evercraft.fallen.visual-stage.v1',id:'living-intel-phenomenon-rc05',
    width,height,fps:12,durationSec:2,background:'#04111b',
    camera:{keyframes:[{t:0,x:0,y:0,zoom:1},{t:2,x:0,y:0,zoom:1.045}]},
    layers:[
      {id:'storm-flow',kind:'phenomenon',z:1,x:0,y:0,width,height,
        title:'LIVING FLOW FIELD',
                bounds:{north:37,south:18,west:-104,east:-71},
        streamlines,particleDensity:1.65,trailFraction:.075,motionLabel:'illustrative circulating flow',sourceLabel:'Evercraft synthetic procedural field RC0.5',
        colorEncoding:{label:'synthetic intensity index',min:0,max:100,unit:' index',palette:['#07121b','#246679','#57c1b3','#e5ae64','#e77b58']},
        brightnessEncoding:{label:'synthetic motion magnitude',min:0,max:8,unit:' a.u.'},
        evidenceState:'synthetic_visualization',sourceRefs:['evercraft:procedural-rc05']},
      
    ],createdAt:'2026-10-14T00:00:00.000Z'};
  const job={schema:'evercraft.fallen.render-job.v1',job_id:jobId,stage,assets:[],frame_start:0,frame_count:frames};
  return {job,job_sha256:sha(JSON.stringify(job)),provenance:{state:'synthetic_visualization',source_refs:['evercraft:procedural-rc05'],observed_data:false}};
}
