import test from 'node:test';
import assert from 'node:assert/strict';
import {runCouncil} from '../systemia/boardroom/engine.mjs';
import {configuredProviders} from '../systemia/boardroom/providers.mjs';
const p=(id,fail=false)=>({id,model:'mock-'+id,respond:async({phase})=>{
 if(fail)throw new Error('secret provider error');
 return {text:id+' '+phase+' response names an assumption, a risk and an evidence test.'};
}});
test('independent vendor opinions, critique, and synthesis are real adapter calls',async()=>{
 const r=await runCouncil({question:'Should our company open a second store?',providers:[p('a'),p('b')]});
 assert.equal(r.status,'completed');assert.equal(r.independent.length,2);assert.equal(r.critiques.length,2);
 assert.ok(r.independent.every(x=>x.text));assert.equal(r.synthesis.provider,'a');
 assert.match(r.notes.join(' '),/not verified facts/);assert.equal(r.id.length,36);
});
test('never fabricates missing second-vendor opinions',async()=>{
 const r=await runCouncil({question:'Should our company open a second store?',providers:[p('a'),p('b',true)]});
 assert.equal(r.status,'insufficient_models');assert.equal(r.synthesis,null);
 assert.equal(r.independent.filter(x=>x.text).length,1);assert.ok(!JSON.stringify(r).includes('secret provider error'));
});
test('rejects same-vendor duplication and invalid questions',async()=>{
 await assert.rejects(runCouncil({question:'long enough question',providers:[p('a'),p('a')]}),/unique identity/);
 await assert.rejects(runCouncil({question:'short',providers:[p('a'),p('b')]}),/12 to 4000/);
});
test('provider adapters require explicitly configured model and secret',()=>{
 assert.equal(configuredProviders({}).length,0);
 const got=configuredProviders({OPENAI_API_KEY:'secret',BOARDROOM_OPENAI_MODEL:'model-a',ANTHROPIC_API_KEY:'secret',BOARDROOM_ANTHROPIC_MODEL:'model-b'});
 assert.deepEqual(got.map(x=>x.id),['openai','anthropic']);
});
test('calls official OpenAI, Anthropic and Gemini API endpoints with server-side keys',async()=>{
 const seen=[];
 const fake=async(url,opts)=>{seen.push({url,opts});return {ok:true,json:async()=>url.includes('openai')?{choices:[{message:{content:'OpenAI response'}}]}:url.includes('anthropic')?{content:[{type:'text',text:'Anthropic response'}]}:{candidates:[{content:{parts:[{text:'Gemini response'}]}}]}}};
 const got=configuredProviders({OPENAI_API_KEY:'o',BOARDROOM_OPENAI_MODEL:'om',ANTHROPIC_API_KEY:'a',BOARDROOM_ANTHROPIC_MODEL:'am',GOOGLE_API_KEY:'g',BOARDROOM_GOOGLE_MODEL:'gm'},fake);
 for(const adapter of got){const r=await adapter.respond({system:'check',user:'question',maxTokens:100});assert.ok(r.text.includes('response'));}
 assert.equal(seen.length,3);
 assert.ok(seen[0].opts.headers.authorization.startsWith('Bearer '));
 assert.equal(seen[2].opts.headers['x-goog-api-key'],'g');
 assert.ok(!seen.some(x=>x.url.includes('key=')));
});
