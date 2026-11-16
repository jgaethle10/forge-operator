// Evercraft Fabric: private, read-only, owner-operated outcome envelope publisher.
// Source admission is explicitly injected by the canonical authority owners.
// This module authenticates the Home request and signs ONLY source consistency;
// it does not prove a real payment, worker, customer delivery, or profit.
import fs from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { reconcileEvercraftOutcomeSource } from "../evercraft-home/os-outcome-source-audit.mjs";
import { verifyFabricOutcomeLocalLedgers } from "./fabric-outcome-ledger-witness.mjs";

const REQUEST_SCHEMA = "evercraft.os.private-outcome-read-request.v1";
const ENVELOPE_SCHEMA = "evercraft.os.private-outcome-source-envelope.v1";
const MAX_REQUEST_BYTES = 4096;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_AGE = 120_000;
const MAX_SEEN = 2048;
export const FABRIC_OUTCOME_ROUTE = "/internal/os/outcomes/latest";

function privateSecret(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw Error("private_path_required");
  const parent=path.dirname(file);
  const folder=fs.lstatSync(parent), stat=fs.lstatSync(file);
  if (!folder.isDirectory() || folder.isSymbolicLink() || (folder.mode & 0o077) ||
      !stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) ||
      stat.size<32 || stat.size>4096 ||
      fs.realpathSync(file)!==file || fs.realpathSync(parent)!==parent) throw Error("private_secret_invalid");
  const secret=fs.readFileSync(file,"utf8").trim();
  const len=Buffer.byteLength(secret);
  if(len<32 || len>4096 || /[\u0000-\u001f\u007f]/.test(secret)) throw Error("private_secret_invalid");
  return secret;
}
function equalSecret(left,right) {
  const a=Buffer.from(String(left)),b=Buffer.from(String(right));
  return a.length===b.length && timingSafeEqual(a,b);
}
function send(res,status,data) {
  const body=Buffer.from(JSON.stringify(data),"utf8");
  res.writeHead(status,{
    "content-type":"application/json; charset=utf-8",
    "content-length":body.length,
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "x-robots-tag":"noindex, nofollow",
  });
  res.end(body);
}
function iso(value) {
  return typeof value==="string" && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString()===value;
}
async function readRequest(req) {
  let bytes=0,raw="";
  for await (const piece of req) {
    bytes+=piece.length;
    if(bytes>MAX_REQUEST_BYTES)throw Error("request_too_large");
    raw+=Buffer.from(piece).toString("utf8");
  }
  return JSON.parse(raw);
}
export function createFabricOutcomeReadback({
  tokenFile="",
  signatureKeyFile="",
  loadAuthorityRecords=null,
  executionEventsFile="",
  shippingLedgerFile="",
  now=()=>Date.now(),
}={}) {
  if(typeof now!=="function" ||
      (loadAuthorityRecords!==null && typeof loadAuthorityRecords!=="function"))
    throw Error("fabric_outcome_reader_arguments_invalid");
  const missing=![tokenFile,signatureKeyFile].some(x=>String(x||"").trim());
  let ready=false;
  if(!missing) {
    try {
      if(tokenFile===signatureKeyFile)throw Error("separate_keys_required");
      privateSecret(tokenFile);
      privateSecret(signatureKeyFile);
      ready=true;
    }catch{ready=false;}
  }
  const seen=new Map();
  const readiness=Object.freeze({
    schema:"evercraft.fabric.private-outcome-readiness.v1",
    state:ready ? loadAuthorityRecords ? "bridge_configured_source_unverified" :
      "bridge_credentials_ready_source_missing" : missing ? "not_configured":"credentials_invalid",
    customer_outcome_verified:false,
    request_handler_read_only:true,
    outbound_provider_calls_performed:false,
  });
  async function handle(req,res) {
    if(req.url!==FABRIC_OUTCOME_ROUTE)return false;
    if(req.method!=="POST") {
      send(res,405,{ok:false,state:"method_not_allowed"});
      return true;
    }
    if(!ready || !loadAuthorityRecords) {
      send(res,503,{ok:false,state:"private_outcome_source_unavailable"});
      return true;
    }
    // Never add CORS permissions to this private endpoint. A browser Origin or
    // Fetch Metadata header is never an authorized server-to-server credential.
    if(req.headers.origin || req.headers["sec-fetch-site"]) {
      send(res,403,{ok:false,state:"private_service_only"});
      return true;
    }
    let token,key;
    try{
      token=privateSecret(tokenFile); key=privateSecret(signatureKeyFile);
    }catch{
      send(res,503,{ok:false,state:"private_outcome_source_unavailable"});
      return true;
    }
    const authorization=String(req.headers.authorization||"");
    if(!authorization.startsWith("Bearer ") || !equalSecret(authorization.slice(7),token)) {
      send(res,403,{ok:false,state:"unauthorized"});
      return true;
    }
    let body;
    try {
      if(!String(req.headers["content-type"]||"").toLowerCase().startsWith("application/json"))
        throw Error("invalid_content_type");
      body=await readRequest(req);
    } catch{
      send(res,400,{ok:false,state:"invalid_request"});
      return true;
    }
    const tick=now();
    if(!Number.isFinite(tick)) {
      send(res,503,{ok:false,state:"private_outcome_source_unavailable"});
      return true;
    }
    if(!body || typeof body!=="object" || Array.isArray(body) ||
       body.schema!==REQUEST_SCHEMA || body.action!=="read_latest_os_outcome" ||
       body.max_outcomes!==1 || body.response_contract!==ENVELOPE_SCHEMA ||
       !/^[a-f0-9]{48}$/.test(String(body.nonce||"")) ||
       !iso(body.requested_at) || Math.abs(tick-Date.parse(body.requested_at))>MAX_AGE) {
      send(res,400,{ok:false,state:"invalid_request"});
      return true;
    }
    for(const [nonce,expires] of seen)if(expires<=tick)seen.delete(nonce);
    if(seen.has(body.nonce)){
      send(res,409,{ok:false,state:"readback_nonce_reused"});
      return true;
    }
    if(seen.size>=MAX_SEEN){
      send(res,503,{ok:false,state:"readback_capacity_held"});
      return true;
    }
    seen.set(body.nonce,tick+MAX_AGE);
    let records;
    try {
      records=await loadAuthorityRecords({maxOutcomes:1,requestTime:body.requested_at});
    }catch {
      send(res,503,{ok:false,state:"private_outcome_source_unavailable"});
      return true;
    }
    // A standalone source record is never adequate evidence that an authority
    // exists. This predicate checks only the canonical shapes, not issuer trust.
    if(!records || typeof records!=="object" || Array.isArray(records) ||
       reconcileEvercraftOutcomeSource(records).state!=="source_consistent_unattested") {
      send(res,503,{ok:false,state:"private_outcome_source_held"});
      return true;
    }
    // A source-shaped object alone cannot be published as a coherent owned
    // readback. Require matches in both private resident ledgers as well.
    // This only witnesses local state, NOT the provider or payment issuer.
    const witness=verifyFabricOutcomeLocalLedgers({
      executionEventsFile,shippingLedgerFile,records,
    });
    if(witness.state!=="local_ledgers_consistent_unattested") {
      send(res,503,{ok:false,state:"private_outcome_local_ledger_unverified"});
      return true;
    }
    const envelope={
      schema:ENVELOPE_SCHEMA,
      read_action:"read_latest_os_outcome",
      nonce:body.nonce, complete:true, synthetic:false,
      observed_at:new Date(tick).toISOString(),
      records,
    };
    const raw=JSON.stringify(envelope);
    if(Buffer.byteLength(raw)>MAX_RESPONSE_BYTES){
      send(res,503,{ok:false,state:"private_outcome_source_oversized"});
      return true;
    }
    const signature="hmac-sha256:"+createHmac("sha256",key).update(raw).digest("hex");
    send(res,200,{...envelope,signature});
    return true;
  }
  return Object.freeze({handle,readiness});
}
