import fs from 'node:fs';
import path from 'node:path';
import { buildVisualStory } from './factory.mjs';

const storiesDir=path.resolve(process.argv[2] || 'systemia/visual-desk/stories');
const outputRoot=path.resolve(process.argv[3] || 'public/visuals');
const origin=process.argv[4] || process.env.EVERCRAFT_VISUAL_ORIGIN || 'https://fabric.systemiacommandcenters.com/visuals';

if(!fs.existsSync(storiesDir)) throw new Error('visual_story_directory_missing');
fs.mkdirSync(outputRoot,{recursive:true});

const files=fs.readdirSync(storiesDir)
  .filter(name=>name.endsWith('.json'))
  .sort();

const entries=[];
for(const name of files){
  const sourcePath=path.join(storiesDir,name);
  const input=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
  const result=buildVisualStory(input,{outputRoot,origin});
  entries.push({
    slug:result.story.slug,
    title:result.story.title,
    canonicalUrl:result.manifest.canonicalUrl,
    socialCardUrl:result.manifest.socialCardUrl,
    motionStageUrl:result.manifest.assets.motionStage,
    evidenceState:result.story.evidenceState,
    sourceRefs:result.story.sourceRefs,
    storyDigest:result.story.digest,
    publishedAt:result.story.publishedAt,
  });
}

const index={
  schema:'evercraft.visual-desk.index.v1',
  generatedAt:new Date().toISOString(),
  origin:String(origin).replace(/\/$/,''),
  count:entries.length,
  stories:entries,
};
fs.writeFileSync(path.join(outputRoot,'index.json'),JSON.stringify(index,null,2)+'\n');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.visual-desk.build-receipt.v1',
  count:entries.length,
  outputRoot,
  origin:index.origin,
  stories:entries.map(item=>({slug:item.slug,digest:item.storyDigest})),
},null,2));
