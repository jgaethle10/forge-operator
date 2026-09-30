const clean=(v)=>String(v??'').trim();

export const US_STATE_NAME_TO_CODE={
  alabama:'AL',alaska:'AK',arizona:'AZ',arkansas:'AR',california:'CA',colorado:'CO',connecticut:'CT',
  delaware:'DE',florida:'FL',georgia:'GA',hawaii:'HI',idaho:'ID',illinois:'IL',indiana:'IN',iowa:'IA',
  kansas:'KS',kentucky:'KY',louisiana:'LA',maine:'ME',maryland:'MD',massachusetts:'MA',michigan:'MI',
  minnesota:'MN',mississippi:'MS',missouri:'MO',montana:'MT',nebraska:'NE',nevada:'NV',
  'new hampshire':'NH','new jersey':'NJ','new mexico':'NM','new york':'NY','north carolina':'NC',
  'north dakota':'ND',ohio:'OH',oklahoma:'OK',oregon:'OR',pennsylvania:'PA','rhode island':'RI',
  'south carolina':'SC','south dakota':'SD',tennessee:'TN',texas:'TX',utah:'UT',vermont:'VT',
  virginia:'VA',washington:'WA','west virginia':'WV',wisconsin:'WI',wyoming:'WY',
  'district of columbia':'DC'
};
export const US_STATE_CODE_TO_NAME=Object.fromEntries(
  Object.entries(US_STATE_NAME_TO_CODE).map(([name,code])=>[code,name])
);
const CODES=new Set(Object.keys(US_STATE_CODE_TO_NAME));

export function normalizeUsState(value){
  const raw=clean(value);
  if(!raw)return '';
  const upper=raw.toUpperCase();
  if(CODES.has(upper))return upper;
  return US_STATE_NAME_TO_CODE[raw.toLowerCase()]||'';
}

export function inferUsAddressParts(address){
  const text=clean(address);
  const match=text.match(/(?:,|\s)\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/i);
  const state=match?normalizeUsState(match[1]):'';
  return match&&state?{state,postal_code:match[2]}:{state:'',postal_code:''};
}

export function regionMatchesRecord(record,region){
  const requested=clean(region);
  if(!requested)return true;
  const code=normalizeUsState(requested);
  const directValues=[
    record?.state,record?.state_code,record?.region_code,record?.state_name
  ].map(clean).filter(Boolean);
  if(code){
    if(directValues.some(v=>normalizeUsState(v)===code))return true;
    const full=US_STATE_CODE_TO_NAME[code];
    const jurisdiction=clean(record?.jurisdiction).toLowerCase();
    if(full&&jurisdiction){
      const escaped=full.replace(/[.*+?^$()|[\]\\]/g,'\\$&');
      if(new RegExp('(?:^|[^a-z])'+escaped+'(?:[^a-z]|$)','i').test(jurisdiction))return true;
    }
    return false;
  }
  const q=requested.toLowerCase();
  if(directValues.some(v=>v.toLowerCase()===q))return true;
  const jurisdiction=clean(record?.jurisdiction).toLowerCase();
  return q.length>=3&&jurisdiction.includes(q);
}
