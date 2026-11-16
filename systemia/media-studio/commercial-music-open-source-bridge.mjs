#!/usr/bin/env node
/**
 * Fallen local music-engine bridge.
 * Builds two brand-specific commercial music auditions and optionally submits ONE
 * take to an ACE-Step server on 127.0.0.1. Never uploads client media, approves
 * rights, touches production audio, publishes or speaks to a remote provider.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const SCHEMA='evercraft.fallen.local-music-auditions.v1';
const ORIGIN='http://127.0.0.1:8001';
const MAX_AUDIO_BYTES=160*1024*1024;
const projects=[
 {id:'roman-icy-tai',brand:'Icy Tai',tempo:112,
  direction:'Playful but premium, food-first, youthful, bright, warm and tactile. Not cartoon music.',
  editBeats:[{s:0,cue:'cold plate scrape, restrained pickup'},{s:3,cue:'dessert rolls, groove enters'},
  {s:9,cue:'product details, melodic lift'},{s:16,cue:'boba and crepes, syncopated fill'},
  {s:24,cue:'final beauty shot, musical rise'},{s:28,cue:'end logo and natural resolution'}],
  alternatives:[
   {key:'organic-funk',bpm:112,prompt:'Original 32-second instrumental commercial cue. Organic modern funk and neo-soul; live-feeling electric piano, clean muted electric guitar, round melodic bass and human-played tight drums. Bright satisfying plucked hook; sparing subtle percussion. Strong two-second opening, evolving arrangement every four bars, short build after 20s, resolved finish. Joyful sophisticated dessert-bar energy. No vocals, no repetitive chiptune, no corporate ukulele.'},
   {key:'indie-pop',bpm:116,prompt:'Original 32-second upbeat indie-pop instrumental for a fresh rolled ice cream and boba shop. Warm live-feeling drums, elastic bass, bright analog keys, tasteful mallet accents, inviting guitar rhythm. Fun, modern and photogenic but not childish. Distinct hook, changing arrangement, rhythmic stop for scraping sound, 24s lift, clean logo ending. No vocals or generic EDM riser.'},
   {key:'sunny-groove',bpm:108,prompt:'Original 32-second polished contemporary groove instrumental. Organic breakbeat drums, soft Rhodes chords, percussion made from subtle tactile textures, tasteful bass movement and short memorable melody. A joyful daytime dessert hangout, warm and colorful. Dynamic hook, development and decisive close. No vocals, no nursery melody, no monotonous four-bar loop.'}
  ]},
 {id:'roman-flame-brew',brand:'Flame & Brew',tempo:96,
  direction:'Confident, tactile, warm, cinematic. Wood-fired food without action-movie trailer clichés.',
  editBeats:[{s:0,cue:'oven flame, sparse low drum and room sound'},
  {s:4,cue:'pizza prep, first distinct riff'},{s:10,cue:'oven and bubbling crust, low-end pulse'},
  {s:17,cue:'slice, short syncopated stop'},{s:23,cue:'cheese pull, melodic release'},
  {s:28,cue:'end logo with confident final chord'}],
  alternatives:[
   {key:'indie-rock',bpm:96,prompt:'Original 32-second cinematic indie-rock instrumental food advertisement. Human-feeling brushed-to-driving drum kit, rich bass guitar, warm low-register electric guitar, subtle organ, small organic room ambience. Smoky intimate kitchen with confident melody and restrained tension. Clear development across the cut, strong cheese-pull lift at 23s and warm definitive final chord. No vocals, no trailer brass, no synthetic fake distorted guitar.'},
   {key:'smoky-soul',bpm:92,prompt:'Original 32-second premium smoky soul and modern blues instrumental for wood-fired pizza. Realistic drum pocket, vintage electric piano and low guitar comping, tasteful bass, gritty but warm lead phrase, moving dynamics. Begins with sparse ember-like percussion, grows into savory confidence, rests for slicing at 17s and resolves with memorable branded tag. No vocals or generic stock-rock loop.'},
   {key:'percussive-cinema',bpm:100,prompt:'Original 32-second organic cinematic culinary instrumental. Warm toms, intimate live kit, hand percussion, woody plucked bass and sparse electric guitar harmonics. Tension from flames and dough work, confident build for oven reveal, brief negative space for the cut, dramatic but tasteful cheese pull and final warm resolution. No vocals, no epic trailer sound, no repetitive pulse.'}
  ]}
];

function safeOutput(p){
 if(!p||!/\.(?:wav|flac|mp3|m4a)$/i.test(p))throw new Error('audio_output_extension_required');
 return path.resolve(p);
}
export function createAuditionPack(){
 const takes=[];
 for(const p of projects)for(const alt of p.alternatives){
  const id=p.id+'-'+alt.key;
  takes.push({
   id,project_id:p.id,brand:p.brand,duration_sec:32,edit_duration_sec:30,
   direction:p.direction,scene_cues:p.editBeats,creative_route:'audition_only',
   source_model:'ace-step/ACE-Step-1.5',
   provider_request:{prompt:alt.prompt,lyrics:'[Instrumental]',instrumental:true,
    thinking:true,model:'acestep-v15-turbo',audio_duration:32,
    bpm:alt.bpm,time_signature:'4',audio_format:'wav',batch_size:1,
    inference_steps:8,use_cot_caption:false,use_cot_language:false}
  });
 }
 return {schema:SCHEMA,release_state:'NOT_APPROVED',owner:'Evercraft/Fallen',
  requirements:['local-engine-only','review each music take with picture','retain real source identity',
   'separate sync Foley and dialogue from music','confirm model/output rights','human selection',
   'no automatic client delivery or Clip publication'],takes};
}
function assertTake(take){
 if(!take||typeof take.id!=='string'||!/^[a-z0-9-]+$/.test(take.id))throw new Error('invalid_take');
 if(!take.provider_request||take.provider_request.audio_duration<30||
    take.provider_request.audio_duration>45||take.provider_request.lyrics!=='[Instrumental]')
    throw new Error('invalid_music_request');
}
function unwrap(res){
 if(!res||res.code!==200||res.error)throw new Error('ace_step_response_rejected');
 return res.data;
}
function requireLocal(base){
 const url=new URL(base);
 if(url.origin!==ORIGIN||url.pathname!=='/'||url.search)throw new Error('only_owned_loopback_music_engine_allowed');
 return url.origin;
}
function exactLocalAudioPath(input){
 if(typeof input!=='string'||!input.startsWith('/v1/audio?path='))throw new Error('audio_download_path_not_authorized');
 const url=new URL(input,ORIGIN);
 if(url.origin!==ORIGIN||url.pathname!=='/v1/audio'||!url.searchParams.has('path'))
   throw new Error('audio_download_path_not_authorized');
 return url.toString();
}
async function jsonRequest(fetcher,url,body){
 const response=await fetcher(url,{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error('local_music_service_http_'+response.status);
 return unwrap(await response.json());
}
export async function generateLocalTake(take,outPath,{fetcher=fetch,pollLimit=45,pauseMs=2000,baseUrl=ORIGIN}={}){
 assertTake(take);
 const base=requireLocal(baseUrl), output=safeOutput(outPath);
 if(fs.existsSync(output))throw new Error('refusing_to_overwrite_existing_audio');
 const release=await jsonRequest(fetcher,base+'/release_task',take.provider_request);
 if(!release||typeof release.task_id!=='string'||!release.task_id)throw new Error('ace_step_task_id_missing');
 let candidate=null;
 for(let i=0;i<pollLimit;i++){
  const queried=await jsonRequest(fetcher,base+'/query_result',{task_id_list:[release.task_id]});
  const item=Array.isArray(queried)?queried[0]:null;
  if(item?.status===2)throw new Error('ace_step_generation_failed');
  if(item?.status===1){
   let values=typeof item.result==='string'?JSON.parse(item.result):item.result;
   candidate=Array.isArray(values)?values[0]:null;break;
  }
  if(pauseMs>0)await new Promise(resolve=>setTimeout(resolve,pauseMs));
 }
 if(!candidate||typeof candidate.file!=='string')throw new Error('ace_step_no_audio_result');
 const url=exactLocalAudioPath(candidate.file);
 const response=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new Error('ace_step_audio_download_failed');
 const len=Number(response.headers?.get('content-length')||0);
 if(len>MAX_AUDIO_BYTES)throw new Error('audio_file_too_large');
 const data=Buffer.from(await response.arrayBuffer());
 if(!data.length||data.length>MAX_AUDIO_BYTES)throw new Error('invalid_audio_file_size');
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,data,{flag:'wx'});
 return {schema:'evercraft.fallen.music-generation-receipt.v1',take_id:take.id,brand:take.brand,
  provider:'ace-step-1.5-local',local_origin:base,output,
  sha256:crypto.createHash('sha256').update(data).digest('hex'),bytes:data.length,
  provider_task_id:release.task_id,review_state:'HOLD_FOR_TECHNICAL_AND_HUMAN_REVIEW',
  rights_state:'UNVERIFIED',published:false};
}
export function inspectAudio(file){
 const target=path.resolve(file);
 if(!fs.existsSync(target))throw new Error('audio_missing');
 const size=fs.statSync(target).size;if(!size||size>MAX_AUDIO_BYTES)throw new Error('audio_size_invalid');
 const raw=execFileSync('ffprobe',['-v','error','-show_entries',
  'format=duration:stream=codec_type,sample_rate,channels','-of','json',target],
  {encoding:'utf8',timeout:25000});
 const parsed=JSON.parse(raw),audio=(parsed.streams||[]).find(x=>x.codec_type==='audio');
 if(!audio)throw new Error('audio_stream_missing');
 const duration=Number(parsed.format?.duration),channels=Number(audio.channels),sampleRate=Number(audio.sample_rate);
 const blockers=[];
 if(!Number.isFinite(duration)||duration<29.9||duration>45)blockers.push('wrong_duration');
 if(!Number.isFinite(channels)||channels<2)blockers.push('not_stereo');
 if(!Number.isFinite(sampleRate)||sampleRate<44100)blockers.push('low_sample_rate');
 const sha256=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
 return {file:target,duration_seconds:duration,channels,sample_rate:sampleRate,sha256,
  technical_state:blockers.length?'REJECTED':'CANDIDATE_TECHNICAL_PASS',blockers,
  creative_state:'NOT_LISTENED_OR_APPROVED',rights_state:'NOT_CHECKED',
  voice_and_foley_state:'SEPARATE_STEMS_REQUIRED',release_state:'BLOCKED'};
}
async function cli(args){
 const [command,a,b,c]=args;
 if(command==='plan'&&a){
  fs.writeFileSync(a,JSON.stringify(createAuditionPack(),null,2)+'\n');
  process.stdout.write('Six music audition specifications prepared; no model invoked.\n');return;
 }
 if(command==='inspect'&&a){
  process.stdout.write(JSON.stringify(inspectAudio(a),null,2)+'\n');return;
 }
 if(command==='generate'&&a&&b&&c){
  const pack=JSON.parse(fs.readFileSync(a,'utf8'));
  if(pack.schema!==SCHEMA)throw new Error('incorrect_audition_pack_schema');
  const take=pack.takes.find(t=>t.id===b);
  if(!take)throw new Error('music_take_not_found');
  const receipt=await generateLocalTake(take,c);
  process.stdout.write(JSON.stringify(receipt,null,2)+'\n');return;
 }
 throw new Error('Usage: node commercial-music-open-source-bridge.mjs plan <auditions.json> | inspect <audio-file> | generate <auditions.json> <take-id> <output.wav>');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 cli(process.argv.slice(2)).catch(err=>{console.error(err.message);process.exitCode=1;});
}
