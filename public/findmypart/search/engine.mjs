// Pure, dependency-free part query intelligence. Does not assert supplier inventory or fitment.
export function analyzePartQuery(value) {
 const raw=String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').slice(0,180);
 if(raw.length<3)return {valid:false,error:'Enter at least three characters.'};
 const tokens=raw.match(/[A-Za-z0-9]+(?:[-./][A-Za-z0-9]+)*/g)||[];
 const candidateNumbers=[...new Set(tokens.filter(t=>/\d/.test(t)&&/[a-z]/i.test(t)||/^\d{5,}$/.test(t)).filter(t=>!/^(19|20)\d{2}$/.test(t)))].slice(0,6);
 const normalizedNumbers=candidateNumbers.map(t=>t.toUpperCase().replace(/[^A-Z0-9]/g,''));
 const year=(raw.match(/\b(?:19\d{2}|20[0-2]\d)\b/)||[])[0]||null;
 const terms=[...new Set([raw,...candidateNumbers,...normalizedNumbers].filter(Boolean))];
 const warnings=['Part numbers are possible identifiers only; no exact identity or compatibility is confirmed.'];
 return {valid:true,query:raw,year,candidateNumbers,normalizedNumbers,terms,warnings};
}
export function buildSourceSearches(analysis){
 if(!analysis?.valid)return [];
 const query=analysis.query;
 return [
  {id:'ebay',name:'eBay',url:'https://www.ebay.com/sch/i.html?_nkw='+encodeURIComponent(query),category:'Marketplace'},
  {id:'shopping',name:'Google Shopping',url:'https://www.google.com/search?tbm=shop&q='+encodeURIComponent(query),category:'Shopping index'},
  {id:'web',name:'Google Search',url:'https://www.google.com/search?q='+encodeURIComponent(query+' OEM parts catalog'),category:'Research'},
  {id:'bing',name:'Bing Search',url:'https://www.bing.com/search?q='+encodeURIComponent(query),category:'Research'}
 ];
}
export function createSavedSearch(analysis,sourceLinks){
 if(!analysis?.valid)throw Error('invalid_query');
 return {schema:'evercraft.findmypart.search-brief.v1',query:analysis.query,
  candidate_part_numbers:analysis.candidateNumbers,normalized_part_numbers:analysis.normalizedNumbers,
  year_hint:analysis.year,source_links:sourceLinks.map(({name,url})=>({name,url})),
  source_evidence:[],fitment:'unverified',inventory:'unverified',price:'unverified',
  notice:'Search links are not product matches or stock confirmations.'};
}
