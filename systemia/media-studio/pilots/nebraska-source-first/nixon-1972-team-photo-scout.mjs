/**
 * Research-only contact-sheet intake for actual WHPO 1972 Nebraska team rolls.
 * A contact sheet is NOT an original camera negative and is not licensed film art.
 * Do not infer precisely who appears in any particular frame without inspection.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const frameRolls=['8358','8359','8362'];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceBase='https://www.nixonlibrary.gov/forresearchers/find/av/whpo_cs/';
export function checkContactSheet(file){
 if(!fs.existsSync(file)||fs.statSync(file).size<12000)throw Error('whpo_contact_missing');
 const data=fs.readFileSync(file);
 if(data[0]!==0xff||data[1]!==0xd8||data[2]!==0xff)throw Error('whpo_not_jpeg');
 const p=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height','-of','json',file],{encoding:'utf8',timeout:20000});
 if(p.status!==0)throw Error('whpo_image_probe_failed');
 const v=JSON.parse(p.stdout).streams?.[0];
 if(v?.codec_name!=='mjpeg'||v.width<500||v.height<500)throw Error('whpo_contact_image_not_readable');
 return {bytes:data.length,width:v.width,height:v.height,sha256:sha(file)};
}
export function canAdmitFrameAsReleasedFilm(x){
 return x?.actualOriginalFrameObtained===true&&
 x?.exactOriginalFrameIdVerified===true&&
 x?.publishedUseRightsReviewed===true&&
 x?.founderCreativeApproval===true&&x?.publicReleaseAuthorized===true;
}
function downloadOne(outdir,roll){
 const file=path.join(outdir,'NARA_WHPO_'+roll+'_CONTACT_SHEET_RESEARCH.jpg');
 const urls=[sourceBase+'37-whpo-'+roll+'-cs.jpg',
 'https://www.nixonlibrary.gov/sites/default/files/forresearchers/find/av/whpo_cs/37-whpo-'+roll+'-cs.jpg'];
 const reasons=[];
 for(const url of urls){
  const r=spawnSync('curl',['--fail','--location','--silent','--show-error','--connect-timeout','12','--max-time','30',
   '--output',file,url],{encoding:'utf8',timeout:40000});
  if(r.status!==0){reasons.push(url+': http_failed');continue;}
  try{
   const media=checkContactSheet(file);
   return {roll,sourceUrl:url,media,status:'contact_sheet_acquired_human_frame_identification_pending',
    exactNegativesNotAcquired:true,publishedUseRightsReviewed:false};
  }catch(e){reasons.push(url+':'+String(e));}
 }
 if(fs.existsSync(file))fs.rmSync(file);
 return {roll,status:'contact_sheet_unavailable',reasons,exactNegativesNotAcquired:true,publishedUseRightsReviewed:false};
}
export function runResearch(outdir){
 fs.mkdirSync(outdir,{recursive:true});
 const photoRolls=frameRolls.map(roll=>downloadOne(outdir,roll));
 const got=photoRolls.filter(x=>x.status==='contact_sheet_acquired_human_frame_identification_pending');
 const result={schema:'evercraft.fallen.whpo-1972-nebraska-photo-research.v1',
  sourceArchive:'Richard Nixon Presidential Library and Museum / NARA',
  sourceCatalog:'https://www.nixonlibrary.gov/research/almanac/february-1-1972',
  date:'1972-02-01',rolls:photoRolls,
  meaning:'Official WHPO photo catalog describes Nebraska championship team with Devaney, Tagge and others; image content itself requires independent review.',
  acquisitionStatus:got.length?'some_original_contact_sheets_acquired_for_private_research':'none_downloadable_at_public_urls',
  exactOriginalNegativesDownloaded:false,allPeopleInImageVerified:false,
  founderCreativeApproval:false,publicReleaseAuthorized:false};
 fs.writeFileSync(path.join(outdir,'WHPO_1972_PHOTO_CATALOG_RESEARCH_RECEIPT.json'),JSON.stringify(result,null,2)+'\n');
 if(!got.length)throw Error('no_publicly_accessible_original_whpo_contact_sheet');
 console.log(JSON.stringify({status:result.acquisitionStatus,acquiredRolls:got.map(x=>x.roll),
   pendingRolls:photoRolls.filter(x=>!got.includes(x)).map(x=>x.roll)}));
 return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{if(!process.argv[2])throw Error('Usage: node nixon-1972-team-photo-scout.mjs <output-dir>');
  runResearch(process.argv[2]);}catch(e){console.error(String(e));process.exitCode=1;}
}
