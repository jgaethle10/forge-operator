// Deterministic geometry guard for generated commercial layouts.
// This checks logical text placement, not image aesthetics, video continuity or playback.
const SPECS={
  feed:{width:1080,height:1350,wide:false},
  square:{width:1080,height:1080,wide:false},
  story:{width:1080,height:1920,wide:false},
  'hero-wide':{width:1600,height:900,wide:true},
};
function wrap(text,maxChars,maxLines=2){
  const words=String(text||'').split(/\s+/).filter(Boolean);
  const out=[];
  let index=0;
  while(index<words.length&&out.length<maxLines){
    let row=words[index++];
    while(index<words.length&&(row+' '+words[index]).length<=maxChars){
      row+=' '+words[index++];
    }
    if(out.length===maxLines-1&&index<words.length){
      while(index<words.length&&(row+' '+words[index]).length<=maxChars+4)row+=' '+words[index++];
      if(index<words.length)row=row.replace(/[.…]+$/,'')+'…';
    }
    out.push(row);
  }
  return out;
}
function estimateWidth(text,fontSize,letterSpacing=0){
  const chars=[...String(text)];
  const em=chars.reduce((sum,char)=>sum+
    (/[WM@#]/.test(char)?.84:/[Il1 .,:]/.test(char)?.34:.62),0);
  return em*fontSize+Math.max(0,chars.length-1)*letterSpacing;
}
function intersects(a,b){
  return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
}
export function commercialPosterLayout(campaign,format){
  const spec=SPECS[format];
  if(!spec)throw new Error('commercial_poster_format_invalid');
  const wide=spec.wide;
  const browser=wide?{x:820,y:150,w:690,h:585}:
    {x:84,y:spec.height*(spec.height>1500?.34:.32),w:912,h:spec.height*(spec.height>1500?.42:.44)};
  const left=wide?86:72;
  const hookY=wide?170:(spec.height>1500?145:118);
  const hookSize=wide?70:(spec.height>1500?96:72);
  const hookLines=wrap(campaign.creative.hook,wide?12:16,wide?3:2);
  const subY=hookY+hookLines.length*hookSize*.92+38;
  const subSize=wide?26:25;
  const subLines=wrap(campaign.creative.subhook,wide?36:44,2);
  const boxes=[
    ...hookLines.map((line,index)=>({
      kind:'headline',line,x:left,
      y:hookY+index*hookSize*.92-hookSize,
      w:estimateWidth(line,hookSize,-3),h:hookSize*1.05
    })),
    ...subLines.map((line,index)=>({
      kind:'subhook',line,x:left,
      y:subY+index*(subSize+10)-subSize,
      w:estimateWidth(line,subSize),h:subSize*1.12
    }))
  ];
  return {format,spec,browser,wide,left,hookY,hookSize,hookLines,subY,subSize,subLines,boxes};
}
export function assessCommercialComposition(campaign,format){
  const layout=commercialPosterLayout(campaign,format);
  const {spec,browser,boxes,hookLines}=layout;
  const expected=String(campaign.creative.hook).replace(/\s+/g,' ').trim();
  const actual=hookLines.join(' ');
  const issues=[];
  if(actual!==expected)issues.push('headline_truncated');
  const safe=spec.wide?26:38;
  for(const box of boxes){
    if(box.x<safe||box.x+box.w>spec.width-safe||box.y<safe||box.y+box.h>spec.height-safe){
      issues.push(box.kind+'_outside_safe_area');
    }
    if(intersects(box,{x:browser.x-20,y:browser.y-8,w:browser.w+28,h:browser.h+16})){
      issues.push(box.kind+'_occluded_by_browser');
    }
  }
  return {
    schema:'evercraft.graphics-command.composition-report.v1',
    format,
    status:issues.length?'reject':'pass',
    issues:[...new Set(issues)],
    checks:{
      headline_complete:actual===expected,
      text_inside_safe_area:!issues.some(x=>x.endsWith('_outside_safe_area')),
      text_clear_of_browser:!issues.some(x=>x.endsWith('_occluded_by_browser')),
    },
    method:'estimated_glyph_bounds_and_scene_geometry',
    limitations:'Does not substitute for actual raster inspection, human visual review, or cinematic media QA.',
    publicationAuthority:false,
  };
}
