// Evercraft AI Boardroom: on-device, deterministic comparison of user-pasted answers.
// No calls to LLMs, APIs, tracking pixels, analytics, or customer-data endpoints.
const IGNORE=new Set('about after again against also always and are because before between both business can could decision each even every first from have how into just more must need none only other over same should some still than that their them then there these they this those through under until very want were what when where which while with would your'.split(' '));
const TOPICS={Costs:/\b(cost|price|pricing|budget|margin|revenue|cash|funding|runway)\b/i,Buyers:/\b(buyer|customer|demand|market|conversion|audience|user|sales)\b/i,Evidence:/\b(data|evidence|assumption|measure|metric|test|experiment|research|validate)\b/i,Delivery:/\b(team|support|capacity|deadline|staff|quality|delivery|hire|workload)\b/i,Risk:/\b(risk|security|privacy|legal|failure|compliance|regulation)\b/i};
export const LIMITS=Object.freeze({question:500,answer:6000,answers:3});
const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
function sentences(text){return (String(text).match(/[^.!?\n]+(?:[.!?]+|$)/g)||[]).map(s=>s.trim()).filter(Boolean);}
export function classifyStance(text){
 const t=sentences(text).slice(0,8).join(' ');
 const negative=/\b(do not|don't|should not|shouldn't|would not|wouldn't|never|avoid|against|not recommend|recommend against|hold off|wait before|postpone|delay|stop)\b/i.test(t);
 const positive=/\b(i recommend|we recommend|would recommend|should proceed|should launch|launch now|go ahead|move forward|proceed now|i support|we support|go for it)\b/i.test(t);
 const conditional=/\b(only if|provided that|as long as|conditional|depends on|if and only if|pilot first|test first|first validate)\b/i.test(t);
 if(conditional||(negative&&positive))return 'conditional or mixed';
 if(negative)return 'cautions against';
 if(positive)return 'favors proceeding';
 return 'not explicit';
}
const terms=text=>[...new Set((norm(text).toLowerCase().match(/[a-z][a-z0-9-]{3,}/g)||[]).filter(x=>!IGNORE.has(x)))];
export function buildReport({question,answers}){
 const q=norm(question);
 if(!q||q.length>LIMITS.question)throw Error('Enter a specific decision question, up to 500 characters.');
 if(!Array.isArray(answers)||answers.length<2||answers.length>LIMITS.answers)throw Error('Provide two or three AI answers.');
 const used=new Set();
 const rows=answers.map((a,i)=>{
  const label=norm(a?.label||'Answer '+(i+1)),body=norm(a?.text);
  if(!label||label.length>45||used.has(label.toLowerCase()))throw Error('Use distinct short labels for the answers.');
  used.add(label.toLowerCase());
  if(body.length<30||body.length>LIMITS.answer)throw Error('Each answer needs 30 to 6,000 characters.');
  const snippet=norm(sentences(body).slice(0,2).join(' ')||body).slice(0,280);
  const topics=Object.entries(TOPICS).filter(([,re])=>re.test(body)).map(([key])=>key);
  return {label,stance:classifyStance(body),snippet,topics,terms:terms(body)};
 });
 const explicit=new Set(rows.map(x=>x.stance).filter(x=>x==='favors proceeding'||x==='cautions against'));
 const disagreement=explicit.size>1,counts=new Map();
 for(const row of rows)for(const term of row.terms)counts.set(term,(counts.get(term)||0)+1);
 const sharedTerms=[...counts].filter(([,n])=>n>=2).map(([term])=>term).slice(0,10);
 const questions=['Which claims have independently checkable evidence?',disagreement?'What assumptions lead to the opposing recommendations?':'Would the recommendations change with a different budget or timeline?','What is the smallest reversible test that would change the decision?'];
 const reportText=['EVERCRAFT BOARDROOM | COMPARISON MAP','Based on pasted text only. No AI models were contacted.','','DECISION: '+q,'',disagreement?'EXPLICIT OPPOSING RECOMMENDATIONS: DETECTED':'EXPLICIT OPPOSING RECOMMENDATIONS: NOT ESTABLISHED','Heuristic wording only; nuance and quotations can be missed.','',...rows.flatMap(r=>[r.label+' | '+r.stance,'Excerpt: '+r.snippet,'Topics mentioned: '+(r.topics.join(', ')||'None tracked'),'']),'SHARED TERMS, NOT PROOF OF AGREEMENT: '+(sharedTerms.join(', ')||'None found'),'','QUESTIONS:',...questions.map((q,i)=>(i+1)+'. '+q),'','Limitations: No independent verification, live model debate, professional advice, or customer-data processing.'].join('\n');
 return {question:q,answers:rows,disagreement,sharedTerms,questions,reportText};
}
