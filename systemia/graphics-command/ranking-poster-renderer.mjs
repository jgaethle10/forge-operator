#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';

const SPECS={
  feed:{width:1080,height:1350,rows:10,titleSize:70,rowHeight:88,startY:342},
  square:{width:1080,height:1080,rows:8,titleSize:58,rowHeight:79,startY:286},
  story:{width:1080,height:1920,rows:15,titleSize:82,rowHeight:93,startY:430},
};

const esc=(value)=>String(value??'')
  .replaceAll('&','&amp;')
  .replaceAll('<','&lt;')
  .replaceAll('>','&gt;')
  .replaceAll('"','&quot;')
  .replaceAll("'",'&#039;');

function lineBreakTitle(value,max=25){
  const words=String(value||'').split(/\s+/).filter(Boolean);
  const rows=[];
  let row='';
  for(const word of words){
    if(!row){ row=word; continue; }
    if((row+' '+word).length<=max) row+=' '+word;
    else { rows.push(row); row=word; }
  }
  if(row) rows.push(row);
  return rows.slice(0,2);
}

export function renderCfbRankingPoster(ranking,format='feed'){
  const spec=SPECS[format];
  if(!spec) throw new Error('cfb_ranking_poster_format_invalid');
  if(ranking?.schema!=='evercraft.cfb-power-rankings.v1') throw new Error('cfb_ranking_poster_schema_invalid');
  if(!Array.isArray(ranking.rankings)||ranking.rankings.length<spec.rows) throw new Error('cfb_ranking_poster_rows_missing');

  const shown=ranking.rankings.slice(0,spec.rows);
  const through=String(ranking.evidence_through_at||'').slice(0,10);
  const model=String(ranking.model?.model_version||'CFBPI').replace(/^evercraft-/,'');
  const titleLines=lineBreakTitle('COLLEGE FOOTBALL POWER RANKINGS',format==='square'?27:24);
  const title=titleLines.map((line,index)=>
    '<text x="72" y="'+(126+index*(spec.titleSize*.92))+'" font-family="Arial,sans-serif" font-size="'+spec.titleSize+'" font-weight="900" letter-spacing="-2.2" fill="#F5F5F2">'+esc(line)+'</text>'
  ).join('\n');
  const subY=126+titleLines.length*(spec.titleSize*.92)+30;

  const rows=shown.map((row,index)=>{
    const y=spec.startY+index*spec.rowHeight;
    const record=String(row.record?.wins??0)+'-'+String(row.record?.losses??0);
    const score=Number(row.power_score).toFixed(2);
    const confidence=Math.round(Number(row.confidence||0)*100);
    const ruleY=y+spec.rowHeight-12;
    return [
      '<g>',
      index===0?'<rect x="52" y="'+(y-50)+'" width="976" height="'+(spec.rowHeight-4)+'" rx="22" fill="#102A36" stroke="#B79A56" stroke-width="2"/>':'',
      '<text x="76" y="'+y+'" font-family="Arial,sans-serif" font-size="'+(index===0?42:34)+'" font-weight="900" fill="'+(index===0?'#B79A56':'#4FB8FF')+'">#'+row.rank+'</text>',
      '<text x="165" y="'+y+'" font-family="Arial,sans-serif" font-size="'+(index===0?40:33)+'" font-weight="850" fill="#F5F5F2">'+esc(row.team_name)+'</text>',
      '<text x="165" y="'+(y+31)+'" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#8E9AA0">'+esc(record)+' • '+confidence+'% confidence</text>',
      '<text x="954" y="'+y+'" text-anchor="end" font-family="Arial,sans-serif" font-size="'+(index===0?42:34)+'" font-weight="900" fill="#F5F5F2">'+score+'</text>',
      '<text x="954" y="'+(y+31)+'" text-anchor="end" font-family="Arial,sans-serif" font-size="16" font-weight="800" letter-spacing="1.4" fill="#4FB8FF">POWER SCORE</text>',
      index<shown.length-1?'<line x1="74" y1="'+ruleY+'" x2="1006" y2="'+ruleY+'" stroke="#1D3038" stroke-width="1"/>':'',
      '</g>'
    ].join('\n');
  }).join('\n');

  const footerY=spec.height-70;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+spec.width+'" height="'+spec.height+'" viewBox="0 0 '+spec.width+' '+spec.height+'">',
    '<defs><radialGradient id="bg" cx="48%" cy="22%" r="95%"><stop offset="0%" stop-color="#16303B"/><stop offset="48%" stop-color="#081014"/><stop offset="100%" stop-color="#040606"/></radialGradient></defs>',
    '<rect width="100%" height="100%" fill="url(#bg)"/>',
    '<text x="72" y="62" font-family="Arial,sans-serif" font-size="20" font-weight="900" letter-spacing="3.1" fill="#4FB8FF">EVERCRAFT SPORTS • CFBPI</text>',
    title,
    '<text x="74" y="'+subY+'" font-family="Arial,sans-serif" font-size="24" font-weight="650" fill="#B7BDC5">Results first. Opponent adjusted. Frozen receipts.</text>',
    rows,
    '<text x="72" y="'+footerY+'" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#7F8C93">Evidence through '+esc(through)+' • '+esc(model)+'</text>',
    '<text x="'+(spec.width-72)+'" y="'+footerY+'" text-anchor="end" font-family="Arial,sans-serif" font-size="20" font-weight="900" fill="#B79A56">evercraft</text>',
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
  return {schema:'evercraft.cfb.ranking-visual-receipt.v1',run_id:ranking.run_id,out_dir:outDir,files};
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
