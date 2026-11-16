// Evercraft Home first-party Meta Login/Page reconnection.
// One owner-authenticated login, read-only discovery, explicit Page-by-Page vault sealing.
// No provider POST, social publishing, or inherited authorization from legacy runtimes.
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

const HISTORICAL_PAGE_IDS = new Set([
  '1302468962947782','1340694065787548','108624442073018',
  '255854147615009','100834302391593','150998551441188',
  '356956657493951','513781131811732','426647487192435',
  '322768160925403','517990454723203','504849522706713',
  '903924222808906','1055611517629906','551716401351308',
  '1028079337051752','975828538947213','955525380981999',
  '1253915241138545','1047855798412865','1017086544817578',
]);
const EXCLUDED_IDS = new Set(['116675248108887','924929507380565','990957940766644']);
const EXCLUDED_NAMES = new Set(['r&b chicken & soul','havenly cleaning','evercraft property services']);
const TTL_MS = 10 * 60 * 1000;
const SCOPE = 'pages_show_list,pages_read_engagement,pages_manage_posts';
const safe = (value) => String(value ?? '').trim();
const nameKey = (value) => safe(value).toLowerCase().replace(/\s+/g,' ');

export function evaluateMetaPage({ id, name, tasks, access_token } = {}) {
  const pageId = safe(id), pageName = safe(name);
  const roleTasks = Array.isArray(tasks) ? tasks.filter((s) => typeof s === 'string') : [];
  if (!/^[0-9]{5,30}$/.test(pageId) || !pageName) return { eligible:false, reason:'invalid_page_identity' };
  if (EXCLUDED_IDS.has(pageId) || EXCLUDED_NAMES.has(nameKey(pageName))) {
    return { eligible:false, reason:'excluded_brand' };
  }
  if (!HISTORICAL_PAGE_IDS.has(pageId)) return { eligible:false, reason:'not_in_approved_registry' };
  if (!roleTasks.includes('CREATE_CONTENT')) return { eligible:false, reason:'create_content_task_missing' };
  if (safe(access_token).length < 16) return { eligible:false, reason:'page_token_missing' };
  return { eligible:true, reason:'owner_selection_required' };
}

function readMetaAppSecret(file) {
  if (!file) throw new Error('meta_app_not_configured');
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('meta_secret_permissions_invalid');
  }
  const secret = fs.readFileSync(file,'utf8').trim();
  if (secret.length < 32) throw new Error('meta_secret_invalid');
  return secret;
}

export function createMetaPageReconnect({
  appId = '', appSecretFile = '', redirectUri = '',
  graphVersion = 'v27.0', credentialVault = null, fetchImpl = globalThis.fetch,
  now = () => Date.now()
} = {}) {
  const flows = new Map();
  const clientId = safe(appId);
  const secretFile = safe(appSecretFile);
  const redirect = safe(redirectUri);
  const version = safe(graphVersion);
  const redirectParsed = (() => { try { return new URL(redirect); } catch { return null; } })();
  const validConfig = /^[0-9]{5,30}$/.test(clientId) &&
    /^v[0-9]{1,3}\.0$/.test(version) &&
    redirectParsed?.protocol === 'https:' &&
    redirectParsed.username === '' && redirectParsed.password === '' &&
    redirectParsed.search === '' && redirectParsed.hash === '' &&
    redirectParsed.pathname === '/home/api/clip/facebook/oauth/callback' &&
    Boolean(secretFile) && Boolean(credentialVault);
  const returnPath = '/home/credentials.html';
  const graphBase = 'https://graph.facebook.com/' + version;
  function prune() {
    for (const [state, flow] of flows) if (flow.expires <= now()) flows.delete(state);
  }
  function owner(session) {
    if (session?.mode !== 'passport' || !safe(session.session_id) || !safe(session.subject)) {
      throw new Error('passport_owner_session_required');
    }
    return { subject:session.subject, sessionId:session.session_id };
  }
  function matches(flow, session) {
    return flow.subject === session.subject && flow.sessionId === session.session_id;
  }
  async function graphJson(url, bearer) {
    const response = await fetchImpl(url, {
      method:'GET', redirect:'error',
      headers: {Accept:'application/json', ...(bearer ? {Authorization:'Bearer '+bearer} : {})},
      signal:AbortSignal.timeout(12000),
    });
    if (!response?.ok) throw new Error('meta_provider_request_failed');
    const data = await response.json();
    if (!data || typeof data !== 'object') throw new Error('meta_provider_response_invalid');
    return data;
  }
  async function discover(userToken) {
    const discovered = new Map();
    let after = '';
    let completed = false;
    for (let page = 0; page < 5; page++) {
      const endpoint = new URL(graphBase + '/me/accounts');
      endpoint.searchParams.set('fields','id,name,access_token,tasks');
      endpoint.searchParams.set('limit','100');
      if (after) endpoint.searchParams.set('after', after);
      const body = await graphJson(endpoint.href, userToken);
      if (!Array.isArray(body.data)) throw new Error('meta_page_list_invalid');
      for (const row of body.data) {
        const id = safe(row?.id);
        if (!/^[0-9]{5,30}$/.test(id) || discovered.has(id)) continue;
        discovered.set(id,{
          id, name:safe(row.name).slice(0,160),
          tasks:Array.isArray(row.tasks) ? row.tasks.filter((x)=>typeof x==='string').slice(0,20) : [],
          access_token:safe(row.access_token)
        });
        if (discovered.size > 500) throw new Error('meta_page_list_limit');
      }
      const cursor = body.paging?.cursors?.after;
      if (!body.paging?.next) { completed = true; break; }
      if (typeof cursor !== 'string' || cursor.length > 1024 || !cursor) {
        throw new Error('meta_page_pagination_invalid');
      }
      after = cursor;
    }
    if (!completed) throw new Error('meta_page_list_incomplete');
    return [...discovered.values()];
  }
  return {
    status(session) {
      prune();
      if (!validConfig) return {ok:true,configured:false,state:'meta_app_configuration_required',pages:[],secret_material_returned:false};
      const {subject,sessionId} = owner(session);
      const flow = [...flows.values()].reverse().find((x)=>x.subject===subject && x.sessionId===sessionId && x.phase==='ready');
      return {
        ok:true,configured:true,state:flow?'pages_ready_for_owner_review':'ready_to_authorize',
        pages: flow ? flow.pages.map((p)=>({
          id:p.id,name:p.name,tasks:p.tasks,
          ...evaluateMetaPage(p)
        })) : [],
        secret_material_returned:false,publishing_enabled:false
      };
    },
    start(session) {
      if (!validConfig) throw new Error('meta_app_configuration_required');
      const {subject,sessionId} = owner(session);
      prune();
      // One outstanding authorization per verified owner session.
      for (const [key,flow] of flows) if (flow.subject===subject && flow.sessionId===sessionId) flows.delete(key);
      const state = randomBytes(32).toString('base64url');
      flows.set(state,{subject,sessionId,phase:'started',expires:now()+TTL_MS,pages:[]});
      const url = new URL('https://www.facebook.com/' + version + '/dialog/oauth');
      url.searchParams.set('client_id',clientId);
      url.searchParams.set('redirect_uri',redirect);
      url.searchParams.set('response_type','code');
      url.searchParams.set('scope',SCOPE);
      url.searchParams.set('state',state);
      return {ok:true,authorization_url:url.href,state:'authorization_started',secret_material_returned:false};
    },
    async callback({state,code,error}={}) {
      prune();
      const ref = safe(state);
      const flow = flows.get(ref);
      if (!flow || flow.phase !== 'started') return {ok:false,state:'meta_oauth_state_invalid'};
      // One-time state redemption. Duplicate callback cannot exchange a code twice.
      flow.phase='exchanging';
      if (safe(error) || !safe(code) || safe(code).length > 4096) {
        flows.delete(ref); return {ok:false,state:'meta_oauth_denied_or_invalid'};
      }
      try {
        const secret = readMetaAppSecret(secretFile);
        const exchange = new URL(graphBase + '/oauth/access_token');
        exchange.searchParams.set('client_id',clientId);
        exchange.searchParams.set('client_secret',secret);
        exchange.searchParams.set('redirect_uri',redirect);
        exchange.searchParams.set('code',safe(code));
        const result = await graphJson(exchange.href,'');
        const token = safe(result.access_token);
        if (token.length < 16) throw new Error('meta_user_token_unavailable');
        // Upgrade the short-lived user token where Meta supports it; if the
        // exchange fails, keep the initial token only for immediate Page discovery.
        let discoveryToken = token;
        try {
          const upgrade = new URL(graphBase + '/oauth/access_token');
          upgrade.searchParams.set('grant_type','fb_exchange_token');
          upgrade.searchParams.set('client_id',clientId);
          upgrade.searchParams.set('client_secret',secret);
          upgrade.searchParams.set('fb_exchange_token',token);
          const longLived = await graphJson(upgrade.href,'');
          if (safe(longLived.access_token).length >= 16) discoveryToken=safe(longLived.access_token);
        } catch {}
        const pages = await discover(discoveryToken);
        if (flow.expires <= now()) throw new Error('meta_oauth_expired');
        flow.pages = pages;
        flow.phase = 'ready';
        return {ok:true,state:'pages_ready_for_owner_review',page_count:pages.length,
          secret_material_returned:false,publishing_enabled:false};
      } catch {
        flows.delete(ref);
        return {ok:false,state:'meta_oauth_provider_or_page_discovery_failed',
          secret_material_returned:false};
      }
    },
    commit(session, ids) {
      if (!validConfig) throw new Error('meta_app_configuration_required');
      const {subject,sessionId} = owner(session);
      prune();
      const flow = [...flows.values()].reverse().find((x)=>matches(x,{subject,session_id:sessionId}) && x.phase==='ready');
      if (!flow) throw new Error('meta_owner_review_unavailable');
      if (!Array.isArray(ids) || !ids.length || ids.length > 30 || new Set(ids).size!==ids.length) {
        throw new Error('meta_page_selection_invalid');
      }
      const selected = ids.map((id)=>{
        if (typeof id !== 'string') throw new Error('meta_page_selection_invalid');
        const p=flow.pages.find((row)=>row.id===id);
        if (!p || !evaluateMetaPage(p).eligible) throw new Error('meta_page_not_authorized_for_reconnect');
        return p;
      });
      // All selections validated before any vault mutation.
      flow.phase='committing';
      const refs=[];
      try {
        for (const page of selected) {
          const sealed = credentialVault.put({
            provider:'facebook-pages',environment:'live',
            label:'evercraft-clip-page-'+page.id,
            apiKeyId:page.id,apiSecret:page.access_token,actorRef:subject
          });
          refs.push(sealed.credential_ref);
        }
      } finally {
        for (const [key,value] of flows) if (value===flow) flows.delete(key);
      }
      return {ok:true,state:'credentials_sealed_write_unverified',sealed_count:refs.length,
        credential_refs:refs,secret_material_returned:false,publishing_enabled:false};
    },
    returnPath,
  };
}
