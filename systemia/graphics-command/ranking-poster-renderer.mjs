#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

const SPECS={
  feed:{width:1080,height:1350,rows:10,heroY:226,heroH:242,listY:548,rowHeight:76,footerY:1282},
  square:{width:1080,height:1080,rows:8,heroY:202,heroH:214,listY:474,rowHeight:72,footerY:1018},
  story:{width:1080,height:1920,rows:15,heroY:250,heroH:266,listY:602,rowHeight:82,footerY:1848},
};

const esc=(value)=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');

function recordLabel(row){
  return String(row.record?.wins??0)+'-'+String(row.record?.losses??0);
}
function movementLabel(row){
  if(row.previous_rank==null||row.movement==null) return '';
  if(Number(row.movement)>0) return '↑'+Math.abs(Number(row.movement));
  if(Number(row.movement)<0) return '↓'+Math.abs(Number(row.movement));
  return '•';
}
function headlineSize(format){
  return format==='story'?76:format==='square'?61:70;
}

export function renderCfbRankingPoster(ranking,format='feed'){
  const spec=SPECS[format];
  if(!spec) throw new Error('cfb_ranking_poster_format_invalid');
  if(ranking?.schema!=='evercraft.cfb-power-rankings.v1') throw new Error('cfb_ranking_poster_schema_invalid');
  if(!Array.isArray(ranking.rankings)||ranking.rankings.length<spec.rows) throw new Error('cfb_ranking_poster_rows_missing');

  const shown=ranking.rankings.slice(0,spec.rows);
  const leader=shown[0];
  const runnerUp=shown[1];
  const rest=shown.slice(1);
  const through=String(ranking.evidence_through_at||'').slice(0,10);
  const model=String(ranking.model?.model_version||'CFBPI').replace(/^evercraft-/,'');
  const leaderScore=Number(leader.power_score);
  const gap=runnerUp?Math.max(0,leaderScore-Number(runnerUp.power_score)):0;
  const leaderMove=movementLabel(leader);
  const hSize=headlineSize(format);
  const heroNameSize=format==='story'?86:format==='square'?68:78;
  const heroScoreSize=format==='story'?90:format==='square'?74:84;

  const rows=rest.map((row,index)=>{
    const y=spec.listY+index*spec.rowHeight;
    const rankColor=Number(row.rank)<=5?'#4FB8FF':'#6D8997';
    const movement=movementLabel(row);
    return [
      '<g>',
      '<text x="76" y="'+y+'" font-family="Arial,sans-serif" font-size="31" font-weight="900" fill="'+rankColor+'">#'+row.rank+'</text>',
      '<text x="151" y="'+y+'" font-family="Arial,sans-serif" font-size="31" font-weight="850" fill="#F5F5F2">'+esc(row.team_name)+'</text>',
      movement?'<text x="690" y="'+y+'" text-anchor="end" font-family="Arial,sans-serif" font-size="18" font-weight="900" fill="'+(movement.startsWith('↑')?'#7DD3A7':movement.startsWith('↓')?'#F39A8D':'#8E9AA0')+'">'+esc(movement)+'</text>':'',
      '<text x="151" y="'+(y+27)+'" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#8E9AA0">'+esc(recordLabel(row))+' • '+Math.round(Number(row.confidence||0)*100)+'% confidence</text>',
      '<text x="960" y="'+y+'" text-anchor="end" font-family="Arial,sans-serif" font-size="31" font-weight="900" fill="#F5F5F2">'+Number(row.power_score).toFixed(2)+'</text>',
      '<text x="960" y="'+(y+27)+'" text-anchor="end" font-family="Arial,sans-serif" font-size="13" font-weight="800" letter-spacing="1.2" fill="#4FB8FF">POWER SCORE</text>',
      index<rest.length-1?'<line x1="76" y1="'+(y+spec.rowHeight-14)+'" x2="1004" y2="'+(y+spec.rowHeight-14)+'" stroke="#17303A" stroke-width="1"/>':'',
      '</g>'
    ].join('\n');
  }).join('\n');

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+spec.width+'" height="'+spec.height+'" viewBox="0 0 '+spec.width+' '+spec.height+'">',
    '<defs>',
    '<radialGradient id="bg" cx="50%" cy="16%" r="92%"><stop offset="0%" stop-color="#173847"/><stop offset="48%" stop-color="#081217"/><stop offset="100%" stop-color="#030506"/></radialGradient>',
    '<linearGradient id="hero" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#173544"/><stop offset="100%" stop-color="#0C171C"/></linearGradient>',
    '</defs>',
    '<rect width="100%" height="100%" fill="url(#bg)"/>',
    '<text x="72" y="58" font-family="Arial,sans-serif" font-size="19" font-weight="900" letter-spacing="3.1" fill="#4FB8FF">EVERCRAFT SPORTS • CFBPI</text>',
    '<rect x="786" y="31" width="222" height="42" rx="21" fill="#0D222B" stroke="#315565"/>',
    '<text x="897" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="900" letter-spacing="1.8" fill="#B7BDC5">NOT A POLL</text>',
    '<text x="72" y="142" font-family="Arial,sans-serif" font-size="'+hSize+'" font-weight="900" letter-spacing="-2.6" fill="#F5F5F2">WHO’S ACTUALLY #1?</text>',
    '<text x="74" y="188" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#AAB6BC">Results first • opponent adjusted • frozen receipts</text>',
    '<rect x="52" y="'+spec.heroY+'" width="976" height="'+spec.heroH+'" rx="28" fill="url(#hero)" stroke="#B79A56" stroke-width="2.5"/>',
    '<text x="82" y="'+(spec.heroY+70)+'" font-family="Arial,sans-serif" font-size="25" font-weight="900" letter-spacing="2.4" fill="#B79A56">EVERCRAFT HAS</text>',
    '<text x="80" y="'+(spec.heroY+152)+'" font-family="Arial,sans-serif" font-size="'+heroNameSize+'" font-weight="900" letter-spacing="-2.2" fill="#F5F5F2">#1 '+esc(leader.team_name)+'</text>',
    '<text x="82" y="'+(spec.heroY+199)+'" font-family="Arial,sans-serif" font-size="20" font-weight="750" fill="#A7B2B8">'+esc(recordLabel(leader))+' • '+Math.round(Number(leader.confidence||0)*100)+'% confidence'+(leaderMove?' • '+esc(leaderMove):'')+'</text>',
    '<text x="957" y="'+(spec.heroY+116)+'" text-anchor="end" font-family="Arial,sans-serif" font-size="'+heroScoreSize+'" font-weight="900" fill="#F5F5F2">'+leaderScore.toFixed(2)+'</text>',
    '<text x="957" y="'+(spec.heroY+151)+'" text-anchor="end" font-family="Arial,sans-serif" font-size="15" font-weight="900" letter-spacing="1.6" fill="#4FB8FF">POWER SCORE</text>',
    gap>0?'<text x="957" y="'+(spec.heroY+196)+'" text-anchor="end" font-family="Arial,sans-serif" font-size="17" font-weight="800" fill="#B79A56">+'+gap.toFixed(2)+' over #2</text>':'',
    '<text x="74" y="'+(spec.listY-52)+'" font-family="Arial,sans-serif" font-size="18" font-weight="900" letter-spacing="2.2" fill="#B79A56">THE REST OF THE BOARD</text>',
    rows,
    '<line x1="72" y1="'+(spec.footerY-34)+'" x2="1008" y2="'+(spec.footerY-34)+'" stroke="#17303A" stroke-width="1"/>',
    '<text x="72" y="'+spec.footerY+'" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="#7F8C93">Evidence through '+esc(through)+' • '+esc(model)+'</text>',
    '<text x="'+(spec.width-72)+'" y="'+spec.footerY+'" text-anchor="end" font-family="Arial,sans-serif" font-size="20" font-weight="900" fill="#B79A56">evercraft</text>',
    '</svg>',
    ''
  ].join('\n');
}

export function buildCfbRankingVisuals(ranking,{outDir='_cfb_power_run/visuals'}={}){
  fs.mkdirSync(outDir,{recursive:true});
  const files={};
  for(const format of Object.keys(SPECS)){
    const svg=renderCfbRankingPoster(ranking,format);
    const file=path.join(outDir,'top-'+SPECS[format].rows+'-'+format+'.svg');
    fs.writeFileSync(file,svg);
    files[format]={path:file,sha256:crypto.createHash('sha256').update(svg).digest('hex')};
  }
  return {schema:'evercraft.cfb.ranking-visual-receipt.v2',run_id:ranking.run_id,out_dir:outDir,files};
}

async function main(){
  const rankingPath=process.argv[2]||'_cfb_power_run/cfb-power-rankings.json';
  const outDir=process.argv[3]||'_cfb_power_run/visuals';
  const ranking=JSON.parse(fs.readFileSync(rankingPath,'utf8'));
  console.log(JSON.stringify(buildCfbRankingVisuals(ranking,{outDir}),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
