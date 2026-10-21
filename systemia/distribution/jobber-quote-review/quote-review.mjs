/**
 * Evercraft Contractor Intelligence: read-only quote triage.
 * No I/O, PII export, quote modification, or customer messaging.
 * Verify all Jobber status enums and fields in GraphiQL before live use.
 */
export function reviewQuotes({accountId,quotes,now,staleAfterDays=7,eligibleStatuses,allPagesFetched=false}={}) {
  if(typeof accountId!=="string" || !accountId.trim()) throw new TypeError("nonempty accountId required");
  if(!Array.isArray(quotes) || quotes.length>10000) throw new TypeError("bounded quotes array required");
  if(!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("valid Date required");
  if(!Number.isInteger(staleAfterDays) || staleAfterDays<1 || staleAfterDays>365) throw new RangeError("staleAfterDays must be 1..365");
  if(!Array.isArray(eligibleStatuses) || !eligibleStatuses.length ||
     !eligibleStatuses.every(s=>typeof s==="string" && /^[A-Z0-9_]+$/.test(s))) {
    throw new TypeError("explicit verified uppercase eligibleStatuses required");
  }
  if(allPagesFetched!==true) throw new Error("Incomplete snapshot: allPagesFetched must be true");
  const allowed=new Set(eligibleStatuses), seen=new Set(), findings=[];
  const ignored={otherStatus:0,unsent:0,tooRecent:0,futureTimestamp:0,invalidRecord:0,duplicate:0};
  for(const q of quotes){
    if(!q || typeof q!=="object" || typeof q.id!=="string" || !q.id.trim() || typeof q.quoteStatus!=="string"){
      ignored.invalidRecord++;continue;
    }
    if(seen.has(q.id)){ignored.duplicate++;continue;}
    seen.add(q.id);
    if(!allowed.has(q.quoteStatus)){ignored.otherStatus++;continue;}
    const sent=typeof q.sentAt==="string"?new Date(q.sentAt):new Date(NaN);
    if(!Number.isFinite(sent.getTime())){ignored.unsent++;continue;}
    const ms=now.getTime()-sent.getTime();
    if(ms<0){ignored.futureTimestamp++;continue;}
    const days=Math.floor(ms/86400000);
    if(days<staleAfterDays){ignored.tooRecent++;continue;}
    findings.push({source:"jobber",tenantRef:accountId,quoteRef:q.id,reviewReason:"quote_age_threshold",sentAt:sent.toISOString(),
      elapsedDays:days,statusObserved:q.quoteStatus,action:"human_review_only",
      evidenceState:"source_metadata_requires_operator_confirmation"});
  }
  findings.sort((a,b)=>b.elapsedDays-a.elapsedDays||a.quoteRef.localeCompare(b.quoteRef));
  return {schema:"evercraft.jobber.quote-review.v1",mode:"read_only_human_review",tenantRef:accountId,
    observedAt:now.toISOString(),scope:"complete_authorized_snapshot",
    criteria:{staleAfterDays,eligibleStatuses:[...allowed]},quoteRecordsSupplied:quotes.length,uniqueQuoteRecords:seen.size,
    reviewCount:findings.length,findings,ignored,
    limitations:["Not confirmed missed follow-ups, lost sales, or incremental revenue.",
      "Jobber automation, prior human contact, and customer preferences require manual verification.",
      "No contact, mutations, billing, or delivery are authorized."]};
}

/** Query example only; validate active schema, scopes, and version in Jobber GraphiQL. */
export const READ_ONLY_QUOTES_QUERY=[
  "query EvercraftQuoteReview($first: Int!, $after: String) {",
  "  quotes(first: $first, after: $after) {",
  "    edges { node { id quoteNumber quoteStatus sentAt updatedAt jobberWebUri } }",
  "    pageInfo { hasNextPage endCursor }",
  "  }",
  "}"
].join("\n");

export function unpackQuotePage(response){
  if(response?.errors?.length) throw new Error("GraphQL errors: abort to avoid partial findings");
  const conn=response?.data?.quotes;
  if(!conn || !Array.isArray(conn.edges) || typeof conn.pageInfo?.hasNextPage!=="boolean")
    throw new TypeError("Unexpected response or missing pageInfo");
  return {quotes:conn.edges.map(e=>e?.node),hasNextPage:conn.pageInfo.hasNextPage,
    endCursor:conn.pageInfo.endCursor??null};
}
