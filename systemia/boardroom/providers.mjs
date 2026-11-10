// Server-only adapters to official provider APIs. Never expose keys to a browser.
async function invoke(url,headers,body,extract,transport=fetch){
  const response=await transport(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('AI provider returned a non-success response.');
  const json=await response.json();
  const result=extract(json);
  if(typeof result!=='string'||!result.trim())throw new Error('AI provider returned no text.');
  return {text:result.trim()};
}
export function configuredProviders(env=process.env,transport=fetch){
  const providers=[];
  if(env.OPENAI_API_KEY&&env.BOARDROOM_OPENAI_MODEL){
    providers.push({id:'openai',model:env.BOARDROOM_OPENAI_MODEL,respond:({system,user,maxTokens})=>
      invoke('https://api.openai.com/v1/chat/completions',{authorization:'Bearer '+env.OPENAI_API_KEY},
      {model:env.BOARDROOM_OPENAI_MODEL,messages:[{role:'system',content:system},{role:'user',content:user}],max_completion_tokens:maxTokens||1000},
      j=>j.choices?.[0]?.message?.content,transport)});
  }
  if(env.ANTHROPIC_API_KEY&&env.BOARDROOM_ANTHROPIC_MODEL){
    providers.push({id:'anthropic',model:env.BOARDROOM_ANTHROPIC_MODEL,respond:({system,user,maxTokens})=>
      invoke('https://api.anthropic.com/v1/messages',{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},
      {model:env.BOARDROOM_ANTHROPIC_MODEL,max_tokens:maxTokens||1000,system,messages:[{role:'user',content:user}]},
      j=>(j.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n'),transport)});
  }
  if(env.GOOGLE_API_KEY&&env.BOARDROOM_GOOGLE_MODEL){
    const model=encodeURIComponent(env.BOARDROOM_GOOGLE_MODEL);
    providers.push({id:'google',model:env.BOARDROOM_GOOGLE_MODEL,respond:({system,user,maxTokens})=>
      invoke('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',
      {'x-goog-api-key':env.GOOGLE_API_KEY},
      {systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:user}]}],generationConfig:{maxOutputTokens:maxTokens||1000}},
      j=>(j.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('\n'),transport)});
  }
  return providers;
}
