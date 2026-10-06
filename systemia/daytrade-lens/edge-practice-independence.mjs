export const DEFAULT_MINIMUM_SEPARATION_MS=300000;

function toMs(value){
  const n=Date.parse(String(value??""));
  return Number.isFinite(n)?n:null;
}

export function selectIndependentPracticeWindows(
  rows,
  {minimumSeparationMs=DEFAULT_MINIMUM_SEPARATION_MS}={}
){
  const ordered=(Array.isArray(rows)?rows:[])
    .map((row,index)=>({
      ...row,
      __index:index,
      __time_ms:toMs(row?.generated_at),
    }))
    .filter(row=>Number.isFinite(row.__time_ms))
    .sort((a,b)=>
      a.__time_ms-b.__time_ms ||
      String(a.file??"").localeCompare(String(b.file??""))
    );

  const selected=[];
  const excluded=[];
  let lastSelected=null;

  for(const row of ordered){
    if(
      !lastSelected ||
      row.__time_ms-lastSelected.__time_ms>=minimumSeparationMs
    ){
      selected.push(row);
      lastSelected=row;
    }else{
      excluded.push({
        ...row,
        independence_exclusion_reason:"TEMPORAL_NEAR_DUPLICATE",
        nearest_selected_file:lastSelected.file??null,
        separation_ms:row.__time_ms-lastSelected.__time_ms,
      });
    }
  }

  const strip=row=>{
    const out={...row};
    delete out.__index;
    delete out.__time_ms;
    return out;
  };

  return {
    minimum_separation_ms:minimumSeparationMs,
    raw_count:ordered.length,
    independent_count:selected.length,
    excluded_count:excluded.length,
    independent:selected.map(strip),
    excluded:excluded.map(strip),
  };
}
