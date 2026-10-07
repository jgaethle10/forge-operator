#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const clean=value=>String(value??'').trim();
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');

function normalizeOrigin(value){
  const url=new URL(String(value||''));
  if(!['https:','http:'].includes(url.protocol)) throw new Error('journal_verify_origin_invalid');
  return url.toString().replace(/\/$/,'');
}
function safeFile(root,relative){
  const base=path.resolve(root)+path.sep;
  const file=path.resolve(root,relative);
  if(!file.startsWith(base)) throw new Error('journal_verify_path_escape');
  return file;
}
function readJson(file,label){
  if(!fs.existsSync(file)) throw new Error(label+'_missing');
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{throw new Error(label+'_invalid_json');}
}
function escapeHtml(value){
  return clean(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

export function verifyJournalBuild({root='public/journal',expectedOrigin}={}){
  const outRoot=path.resolve(root);
  const origin=normalizeOrigin(expectedOrigin);
  const index=readJson(path.join(outRoot,'index.json'),'journal_index');
  if(index.schema!=='evercraft.journal.index.v1') throw new Error('journal_verify_index_schema_invalid');
  if(!fs.existsSync(path.join(outRoot,'index.html'))) throw new Error('journal_verify_index_html_missing');
  if(!fs.existsSync(path.join(outRoot,'feed.xml'))) throw new Error('journal_verify_feed_missing');
  if(!fs.existsSync(path.join(outRoot,'llms.txt'))) throw new Error('journal_verify_llms_missing');

  const current=Array.isArray(index.stories)?index.stories:[];
  const archived=Array.isArray(index.archive)?index.archive:[];
  if(Boolean(index.live_edition)!==Boolean(current.length)) throw new Error('journal_verify_live_edition_mismatch');

  const verified=[];
  for(const entry of [...current,...archived]){
    const slug=clean(entry.slug);
    const storyId=clean(entry.story_id);
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!storyId) throw new Error('journal_verify_entry_identity_invalid');
    const canonical=origin+'/'+slug+'/';
    if(entry.canonical_url!==canonical) throw new Error('journal_verify_index_canonical_mismatch:'+slug);

    const articleFile=safeFile(outRoot,slug+'/index.html');
    const receiptFile=safeFile(outRoot,'receipts/'+slug+'.json');
    const handoffFile=safeFile(outRoot,'production/'+slug+'/clip-handoff.json');
    if(!fs.existsSync(articleFile)) throw new Error('journal_verify_article_missing:'+slug);
    if(!fs.existsSync(handoffFile)) throw new Error('journal_verify_handoff_missing:'+slug);

    const receipt=readJson(receiptFile,'journal_receipt_'+slug);
    const handoff=readJson(handoffFile,'journal_handoff_'+slug);
    const article=fs.readFileSync(articleFile,'utf8');

    if(receipt.schema!=='evercraft.journal.publication-receipt.v1') throw new Error('journal_verify_receipt_schema_invalid:'+slug);
    if(receipt.story_id!==storyId||receipt.slug!==slug) throw new Error('journal_verify_receipt_identity_mismatch:'+slug);
    if(receipt.canonical_url!==canonical) throw new Error('journal_verify_receipt_canonical_mismatch:'+slug);
    if(receipt.article_sha256!==sha256(article)) throw new Error('journal_verify_article_hash_mismatch:'+slug);
    if(!article.includes('<link rel="canonical" href="'+canonical+'">')) throw new Error('journal_verify_article_canonical_missing:'+slug);
    if(!article.includes('<meta property="og:url" content="'+canonical+'">')) throw new Error('journal_verify_article_og_url_missing:'+slug);
    if(!article.includes('<meta name="evercraft:story_id" content="'+escapeHtml(storyId)+'">')) throw new Error('journal_verify_article_story_id_missing:'+slug);
    if(receipt.title&&!article.includes(escapeHtml(receipt.title))) throw new Error('journal_verify_article_title_missing:'+slug);

    if(handoff.schema!=='evercraft.clip.journal-handoff.v1') throw new Error('journal_verify_handoff_schema_invalid:'+slug);
    if(handoff.story_id!==storyId||handoff.slug!==slug) throw new Error('journal_verify_handoff_identity_mismatch:'+slug);
    if(handoff.canonical_url!==canonical) throw new Error('journal_verify_handoff_canonical_mismatch:'+slug);
    if(handoff.publication_receipt_ref!=='receipts/'+slug+'.json') throw new Error('journal_verify_handoff_receipt_ref_mismatch:'+slug);
    if(handoff.link_verification?.expectedCanonicalUrl!==canonical) throw new Error('journal_verify_expected_canonical_mismatch:'+slug);
    if(handoff.link_verification?.expectedOgUrl!==canonical) throw new Error('journal_verify_expected_og_mismatch:'+slug);
    if(handoff.link_verification?.expectedStoryId!==storyId) throw new Error('journal_verify_expected_story_id_mismatch:'+slug);
    if(handoff.link_verification?.requireCanonicalSelfMatch!==true||handoff.link_verification?.requireOpenGraphSelfMatch!==true){
      throw new Error('journal_verify_strict_identity_gate_missing:'+slug);
    }

    let rankingRunId=null;
    if(receipt.machine_evidence_ref){
      const evidenceFile=safeFile(outRoot,receipt.machine_evidence_ref);
      if(!fs.existsSync(evidenceFile)) throw new Error('journal_verify_machine_evidence_missing:'+slug);
      const evidenceBytes=fs.readFileSync(evidenceFile);
      if(receipt.machine_evidence_sha256!==sha256(evidenceBytes)) throw new Error('journal_verify_machine_evidence_hash_mismatch:'+slug);
      const evidence=JSON.parse(evidenceBytes.toString('utf8'));
      if(evidence?.ranking?.schema==='evercraft.cfb-power-rankings.v1'){
        if(!Array.isArray(evidence.ranking.rankings)||evidence.ranking.rankings.length<25) throw new Error('journal_verify_cfb_top25_missing:'+slug);
        if(!String(evidence.ranking.run_id||'').startsWith('cfbpi:')) throw new Error('journal_verify_cfb_run_id_missing:'+slug);
        if(!Array.isArray(evidence.ledger?.games)||evidence.ledger.games.length<1) throw new Error('journal_verify_cfb_ledger_missing:'+slug);
        rankingRunId=evidence.ranking.run_id;
        if(Number(receipt.editorial_gate?.score)!==10||receipt.editorial_gate?.status!=='accepted'){
          throw new Error('journal_verify_cfb_editorial_gate_invalid:'+slug);
        }
      }
    }

    const visuals=receipt.ranking_visuals||null;
    if(visuals){
      for(const format of ['feed','square','story']){
        const visual=visuals[format];
        if(!visual?.ref||!visual?.url||!visual?.sha256) throw new Error('journal_verify_ranking_visual_invalid:'+slug+':'+format);
        const visualFile=safeFile(outRoot,visual.ref);
        if(!fs.existsSync(visualFile)) throw new Error('journal_verify_ranking_visual_missing:'+slug+':'+format);
        if(sha256(fs.readFileSync(visualFile))!==visual.sha256) throw new Error('journal_verify_ranking_visual_hash_mismatch:'+slug+':'+format);
        if(visual.url!==origin+'/'+visual.ref) throw new Error('journal_verify_ranking_visual_url_mismatch:'+slug+':'+format);
        if(handoff.ranking_visuals?.[format]?.sha256!==visual.sha256) throw new Error('journal_verify_handoff_visual_mismatch:'+slug+':'+format);
      }
    }

    verified.push({
      story_id:storyId,
      slug,
      canonical_url:canonical,
      publication_state:receipt.publication_state,
      article_sha256:receipt.article_sha256,
      ranking_run_id:rankingRunId,
    });
  }

  return {
    schema:'evercraft.journal.build-verification.v1',
    verified:true,
    origin,
    live_story_count:current.length,
    archived_story_count:archived.length,
    stories:verified,
  };
}

async function main(){
  const root=process.argv[2]||'public/journal';
  const origin=process.argv[3]||process.env.EVERCRAFT_JOURNAL_ORIGIN||'https://fabric.systemiacommandcenters.com/journal';
  process.stdout.write(JSON.stringify(verifyJournalBuild({root,expectedOrigin:origin}),null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
