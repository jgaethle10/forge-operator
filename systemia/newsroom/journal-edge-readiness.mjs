#!/usr/bin/env node
/**
 * Separate reachability from editorial freshness for the owned Journal edge.
 * Archive-only is a degraded, observable state, never "current" or "live".
 */
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const SCHEMA = 'evercraft.journal.owned-edge-readiness.v1';
const clean = value => String(value ?? '').trim();
const sha256 = content => crypto.createHash('sha256').update(content).digest('hex');
const safeSlug = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean(value));
const originOf = input => {
  const origin = new URL(input);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error('journal_edge_https_origin_required');
  }
  if (/\.base44\.app$/i.test(origin.hostname)) throw new Error('journal_edge_legacy_provider_blocked');
  return origin.toString().replace(/\/+$/, '');
};

export function classifyJournalEdition(index, {now=new Date()}={}) {
  if (index?.schema !== 'evercraft.journal.index.v1') throw new Error('journal_edge_index_schema_invalid');
  if (!Array.isArray(index.stories) || !Array.isArray(index.archive)) throw new Error('journal_edge_index_shape_invalid');
  if (index.live_edition !== (index.stories.length > 0)) throw new Error('journal_edge_live_flag_drift');
  const ids = new Set(), slugs = new Set();
  for (const entry of [...index.stories, ...index.archive]) {
    if (!clean(entry.story_id) || !safeSlug(entry.slug) || !clean(entry.canonical_url)) {
      throw new Error('journal_edge_story_identity_invalid');
    }
    if (ids.has(entry.story_id) || slugs.has(entry.slug)) throw new Error('journal_edge_duplicate_story');
    ids.add(entry.story_id); slugs.add(entry.slug);
    if (entry.state === 'archived' && !index.archive.includes(entry)) throw new Error('journal_edge_archived_live_conflict');
    if (index.archive.includes(entry) && Number.isFinite(Date.parse(entry.freshness_expires_at)) &&
        Date.parse(entry.freshness_expires_at) > now.getTime()) {
      throw new Error('journal_edge_unexpired_story_in_archive');
    }
  }
  if (!ids.size) return {state:'empty', current_count:0, archived_count:0, candidate:null};
  if (index.stories.length) return {
    state:'current_candidate', current_count:index.stories.length, archived_count:index.archive.length,
    candidate:index.stories[0],
  };
  return {
    state:'archive_candidate', current_count:0, archived_count:index.archive.length,
    candidate:index.archive[0],
  };
}

async function get(fetchImpl,url,accept='text/html') {
  const response = await fetchImpl(url,{
    method:'GET',redirect:'follow',headers:{accept,'user-agent':'Evercraft-Journal-Owned-Edge-Readiness/1.0'},
    signal:AbortSignal.timeout(16000),
  });
  if (!response.ok) throw new Error('journal_edge_http_'+response.status+':'+new URL(url).pathname);
  return response;
}

export async function probeJournalOwnedEdge({
  origin='https://fabric.systemiacommandcenters.com/journal',
  fetchImpl=globalThis.fetch, now=new Date(),
}={}) {
  const observedAt=now.toISOString();
  const output={
    schema:SCHEMA,observed_at:observedAt,origin:null,
    state:'unavailable', transport_verified:false, archive_verified:false,
    current_edition_verified:false, newsroom_active:false,
    current_count:0,archived_count:0,checks:{},
  };
  try {
    const publicOrigin=originOf(origin);
    output.origin=publicOrigin;
    const rootResponse=await get(fetchImpl,publicOrigin+'/', 'text/html');
    const rootBody=await rootResponse.text();
    if (!/Evercraft Journal/i.test(rootBody)) throw new Error('journal_edge_home_identity_missing');
    output.checks.home=true;
    const jsonResponse=await get(fetchImpl,publicOrigin+'/index.json','application/json');
    const index=await jsonResponse.json();
    output.checks.index=true;
    const state=classifyJournalEdition(index,{now});
    output.current_count=state.current_count;
    output.archived_count=state.archived_count;
    if (state.state==='empty') {
      output.state='empty';
      output.transport_verified=true;
      output.error='journal_edge_no_approved_stories';
      return output;
    }
    const entry=state.candidate;
    const expectedUrl=publicOrigin+'/'+entry.slug+'/';
    if (entry.canonical_url!==expectedUrl) throw new Error('journal_edge_canonical_origin_mismatch');
    const articleResponse=await get(fetchImpl,expectedUrl);
    const article=await articleResponse.text();
    if (!/^text\/html/i.test(articleResponse.headers.get('content-type')||'')) {
      throw new Error('journal_edge_article_content_type_invalid');
    }
    const storyId=clean(entry.story_id);
    if (!article.includes('<meta name="evercraft:story_id" content="'+storyId+'">') ||
        !article.includes('<link rel="canonical" href="'+expectedUrl+'">') ||
        !article.includes('<meta property="og:url" content="'+expectedUrl+'">')) {
      throw new Error('journal_edge_article_identity_mismatch');
    }
    if (/journal\.evercraft\.global/i.test(article)) throw new Error('journal_edge_dead_domain_in_article');
    output.checks.article_identity=true;
    const receiptResponse=await get(fetchImpl,publicOrigin+'/receipts/'+entry.slug+'.json','application/json');
    const receipt=await receiptResponse.json();
    if (receipt.story_id!==storyId || receipt.canonical_url!==expectedUrl ||
        receipt.article_sha256!==sha256(article) || receipt.slug!==entry.slug) {
      throw new Error('journal_edge_receipt_drift');
    }
    output.checks.receipt_digest=true;
    output.transport_verified=true;
    output.story_id=storyId;
    output.verified_url=expectedUrl;
    if (state.state==='archive_candidate') {
      if (receipt.publication_state!=='archived' || receipt.live_edition_eligible!==false) {
        throw new Error('journal_edge_archive_receipt_claims_live');
      }
      output.archive_verified=true;
      output.state='archive_only_degraded';
      output.error='journal_live_edition_missing';
    } else {
      if (receipt.publication_state!=='live' || receipt.live_edition_eligible!==true) {
        throw new Error('journal_edge_current_receipt_not_live');
      }
      if (!Number.isFinite(Date.parse(receipt.freshness_expires_at)) ||
          Date.parse(receipt.freshness_expires_at)<=now.getTime()) {
        throw new Error('journal_edge_live_receipt_expired');
      }
      output.current_edition_verified=true;
      output.newsroom_active=true;
      output.state='current_edition_verified';
    }
  } catch (error) {
    output.state='unavailable';
    output.current_edition_verified=false;
    output.newsroom_active=false;
    output.error=error instanceof Error?error.message:String(error);
  }
  return output;
}

async function main(){
  const origin=process.argv[2]||'https://fabric.systemiacommandcenters.com/journal';
  const result=await probeJournalOwnedEdge({origin});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if (result.state==='unavailable'||result.state==='empty') process.exitCode=1;
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) await main();
