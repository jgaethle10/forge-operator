import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  eligibleJournalCandidates,articleIdentityMatches,verifyJournalCandidate,
} from '../public/jesse/research-shelf.mjs';

const now=new Date('2026-11-17T07:00:00.000Z');
const baseUrl='https://example.org/forge-operator/jesse/';
const story={
  slug:'test-public-story',story_id:'journal:2026-11-16:test',
  title:'A real sourced article',dek:'A bounded test description',
  published_at:'2026-11-16T08:00:00Z',desk:'Science',
};
const index=(stories=[story],live_edition=true)=>({
  schema:'evercraft.journal.index.v1',live_edition,stories,archive:[],
});
const markup=id=>'<html><head><meta content="'+id+'" name="evercraft:story_id"></head><body>Verified article</body></html>';
const fakeResponse=(url,{id=story.story_id,type='text/html',status=200,html}={})=>({
  ok:status===200,status,url,headers:{get:()=>type},
  text:async()=>html??markup(id),
});

test('only current source-index stories are eligible, never archive or draft entries',()=>{
  assert.deepEqual(eligibleJournalCandidates(index([],false),{now}),[]);
  assert.deepEqual(eligibleJournalCandidates(index([story],false),{now}),[]);
  assert.deepEqual(eligibleJournalCandidates({...index(),schema:'invalid'},{now}),[]);
  const candidates=eligibleJournalCandidates(index(),{now});
  assert.equal(candidates.length,1);
  assert.equal(candidates[0].localPath,'../journal/test-public-story/');
  assert.equal(candidates[0].title,story.title);
  assert.equal(candidates[0].storyId,story.story_id);
});

test('do not allow remote links, traversal, invalid slugs, duplicate records or future-dated work',()=>{
  const poisoned=[
    {...story,slug:'../../outside'},
    {...story,slug:'https:evil'},
    {...story,slug:'LOOK_CLOSER'},
    {...story,slug:'test-public-story',published_at:'2027-01-01T00:00:00Z'},
    {...story,slug:'legit-story',title:''},
    story,
    {...story,title:'duplicate should not appear'},
  ];
  const result=eligibleJournalCandidates(index(poisoned),{now});
  assert.equal(result.length,1);
  assert.equal(result[0].title,story.title);
});

test('matching article identity must appear in an actual meta tag, not marketing text',()=>{
  assert.equal(articleIdentityMatches(markup(story.story_id),story.story_id),true);
  assert.equal(articleIdentityMatches('<p>'+story.story_id+'</p>',story.story_id),false);
  assert.equal(articleIdentityMatches(markup('journal:incorrect'),story.story_id),false);
  assert.equal(articleIdentityMatches('<meta name="random" content="'+story.story_id+'">',story.story_id),false);
});

test('article readback requires same-origin HTTPS HTML, HTTP 200 and exact story identity',async()=>{
  const [candidate]=eligibleJournalCandidates(index(),{now});
  const url=new URL(candidate.localPath,baseUrl).toString();
  const good=()=>fakeResponse(url);
  assert.equal(await verifyJournalCandidate(candidate,{baseUrl,fetchImpl:async (_url,opts)=>{
    assert.equal(_url,url);
    assert.equal(opts.method,'GET');
    assert.equal(opts.credentials,'omit');
    return good();
  }}),true);
  for(const response of [
    fakeResponse(url,{id:'journal:incorrect'}),
    fakeResponse(url,{type:'application/json'}),
    fakeResponse(url,{status:404}),
    fakeResponse('https://unrelated.example/story'),
    fakeResponse('https://example.org/forge-operator/not-the-story/'),
  ]){
    assert.equal(await verifyJournalCandidate(candidate,{baseUrl,fetchImpl:async()=>response}),false);
  }
});

test('public creator page includes research shelf without fake published creator episodes',()=>{
  const html=fs.readFileSync('public/jesse/index.html','utf8');
  assert.match(html,/id="research-feed"/);
  assert.match(html,/\.\/research-shelf\.mjs/);
  assert.match(html,/independently produced Journal features, not episodes/);
  assert.doesNotMatch(html,/Join [0-9]+ subscribers|Now streaming|Episode 1 is live/);
});

test('current repository Journal article is not misreported by source alone',()=>{
  const source=JSON.parse(fs.readFileSync('public/journal/index.json','utf8'));
  const candidates=eligibleJournalCandidates(source,{now:new Date('2099-01-01T00:00:00Z')});
  for(const candidate of candidates){
    const path='public/journal/'+candidate.slug+'/index.html';
    if(!fs.existsSync(path))continue; // portable owned release may be ahead of checked-in Pages artifacts.
    const content=fs.readFileSync(path,'utf8');
    assert.ok(articleIdentityMatches(content,candidate.storyId),path+' story mismatch');
  }
  // The test never fetches a remote platform, issues a post or claims the source equals public HTTPS.
});
