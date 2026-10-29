import {randomUUID} from 'node:crypto';

function bounded(value,max=12000){
  return String(value||'').trim().slice(0,max);
}
function assertQuestion(question){
  if(typeof question!=='string'||question.trim().length<12||question.length>4000)
    throw new RangeError('A decision question of 12 to 4000 characters is required.');
}
function validProviders(providers){
  if(!Array.isArray(providers)||providers.length<2||providers.length>4)
    throw new RangeError('Two to four configured model providers are required.');
  const names=providers.map(p=>p.id);
  if(new Set(names).size!==names.length||providers.some(p=>!p.id||!p.model||typeof p.respond!=='function'))
    throw new RangeError('Every provider must have a unique identity, model and response adapter.');
}
async function ask(provider,phase,system,user){
  try{
    const answer=await provider.respond({system,user,phase,maxTokens:1000});
    const text=bounded(typeof answer==='string'?answer:answer?.text,5500);
    if(!text)throw new Error('empty answer');
    return {provider:provider.id,model:provider.model,text,usage:answer?.usage||null};
  }catch{
    return {provider:provider.id,model:provider.model,error:'Provider unavailable for this round.'};
  }
}

/**
 * Deliberates with independently configured vendors; never creates fabricated responses.
 * The chair's synthesis is reported separately from the participating model outputs.
 */
export async function runCouncil({question,providers,chair=providers?.[0]}){
  assertQuestion(question);
  validProviders(providers);
  if(!chair||typeof chair.respond!=='function')throw new TypeError('A real chair provider is required.');
  const id=randomUUID(), startedAt=new Date().toISOString(), q=question.trim();
  const system='You are a careful business decision analyst. Give a direct viewpoint, name assumptions, risks and missing evidence. Do not invent facts, citations, numerical probabilities or real-world verification. This is decision support, not regulated professional advice.';
  const perspectives=await Promise.all(providers.map(p=>ask(p,'independent',system,'Decision:\n'+q+'\n\nAnswer independently without seeing other advisers. Offer your best recommendation, strongest objection and an inexpensive validation step.')));
  const successful=perspectives.filter(r=>r.text);
  if(successful.length<2){
    return {id,startedAt,status:'insufficient_models',question:q,independent:perspectives,critiques:[],synthesis:null,notes:['Fewer than two distinct providers completed independent responses.','No consensus or multi-model decision was produced.']};
  }
  const critiqueSystem='You are an adversarial reviewer. Evaluate other advisers without deference. Expose contradictions, overlapping assumptions, missing evidence and possible shared errors. Never treat agreement as proof.';
  const critiques=await Promise.all(providers.filter(p=>successful.some(r=>r.provider===p.id)).map(p=>{
    const others=successful.filter(r=>r.provider!==p.id).map(r=>'Adviser '+r.provider+':\n'+r.text).join('\n\n').slice(0,14000);
    return ask(p,'critique',critiqueSystem,'Original decision:\n'+q+'\n\nCritique the other adviser responses, without assuming any opinion is correct:\n'+others);
  }));
  const chairInput='Decision:\n'+q+'\n\nINDEPENDENT VIEWS:\n'+successful.map(x=>x.provider+': '+x.text).join('\n\n').slice(0,15000)+
    '\n\nCRITIQUES:\n'+critiques.filter(x=>x.text).map(x=>x.provider+': '+x.text).join('\n\n').slice(0,11000)+
    '\n\nProduce a practical synthesis: recommendation with conditions, material disagreements, shared-error risks, missing evidence, and the smallest useful next test. Never claim that agreement verifies facts. State uncertainty explicitly.';
  const synthesis=await ask(chair,'synthesis',system,chairInput);
  const notes=['Independent responses are real provider outputs, not verified facts.','No factual source verification was performed.'];
  if(critiques.some(x=>x.error))notes.push('One or more critique rounds failed.');
  if(synthesis.error)notes.push('Final synthesis failed; independent analysis is preserved.');
  return {id,startedAt,status:synthesis.text?'completed':'partial',question:q,
    independent:perspectives,critiques,synthesis:synthesis.text?synthesis:null,
    chair:{provider:chair.id,model:chair.model},notes};
}
