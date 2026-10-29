import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {prepareResearchScope,FORMATS} from "../public/research/scope.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("public/research/index.html");
const discovery=JSON.parse(read("public/research/ai-discovery.json"));

test("public Research customer journey is one clear question and honest report request",()=>{
 for(const part of ['id="scope-form"','id="question"','id="context"','id="location"','id="format"','id="sources"','id="result"','id="download"','id="copy"','id="request"'])assert.ok(html.includes(part),part);
 assert.match(html,/Prepare my research brief/);
 assert.match(html,/Download brief/);
 assert.match(html,/Request a scoped quote/);
 assert.match(html,/custom research engagement receives an exact written quote/i);
 assert.match(html,/automated research processing, instant paid checkout and delivery are not yet publicly verified/i);
 assert.match(html,/No account, payment, upload or external research call/i);
 assert.ok(html.includes('href="./llms.txt"'));
 assert.ok(html.includes('href="./ai-discovery.json"'));
 assert.doesNotMatch(html,/base44\.app|guaranteed research|instant research results|buy\.stripe\.com/i);
});

test("free scope builder rejects empty inputs and invalid or credentialed source URLs",()=>{
 assert.throws(()=>prepareResearchScope({question:"short"}),/20 to 600/);
 const q="Which suppliers can meet the product specifications we need?";
 assert.throws(()=>prepareResearchScope({question:q,format:"made-up"}),/supported research report/);
 assert.throws(()=>prepareResearchScope({question:q,sources:"javascript:alert(1)"}),/http/);
 assert.throws(()=>prepareResearchScope({question:q,sources:"https://alice:secret@example.com/data"}),/credentials/);
 assert.throws(()=>prepareResearchScope({question:q,sources:Array.from({length:7},(_,i)=>"https://example.com/"+i).join("\n")}),/at most six/);
});

test("generated brief is useful, explicit about uncertainty and does not invent findings",()=>{
 const r=prepareResearchScope({question:"Which publicly documented trends affect the local repair shop market?",context:"Prioritize sources that help a founder decide whether to expand.",format:"market-review",location:"Yakima, WA",sources:"https://example.org/study\nhttps://example.com/data"});
 assert.equal(r.formatLabel,FORMATS["market-review"]);
 assert.equal(r.sources.length,2);
 assert.equal(r.researchPerformed,false);
 assert.equal(r.priceQuoted,false);
 assert.equal(r.orderCreated,false);
 assert.equal(r.sourceStatus,"customer_supplied_unverified");
 assert.match(r.reportText,/CUSTOMER-SUPPLIED SOURCES \(UNVERIFIED\)/);
 assert.match(r.reportText,/contradictory findings/i);
 assert.match(r.reportText,/No research or source retrieval has taken place/);
 assert.match(r.reportText,/not a report, a price quotation, a payment, or a confirmed order/i);
 assert.doesNotMatch(r.reportText,/Research complete|paid receipt|verified finding/i);
});

test("public metadata and UI cannot advertise a mismatched paid offer",()=>{
 assert.equal(discovery.paid_engagement.checkout_url,null);
 assert.equal(discovery.paid_engagement.public_fixed_price,null);
 assert.equal(discovery.free_scope_builder.price_usd,0);
 assert.equal(discovery.free_scope_builder.models_contacted,false);
 assert.equal(discovery.free_scope_builder.sources_fetched,false);
 assert.ok(discovery.capabilities_reused.some(x=>x.name.includes("TOWI")));
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,2);
 const structured=JSON.parse(scripts[0][2]);
 assert.equal(structured["@type"],"Service");
 assert.equal(structured.name,"Evercraft Research");
 assert.match(scripts[1][1],/type="module"/);
 assert.doesNotMatch(html,/<script[^>]+src=/);
 assert.doesNotMatch(scripts[1][2],/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
});

test("client-side scope generator does not access research runtime or private network",()=>{
 const s=read("public/research/scope.mjs");
 assert.doesNotMatch(s,/\bfetch\s*\(|XMLHttpRequest|https?:\/\/fabric\.|http:\/\/127\.0\.0\.1/);
 assert.ok(s.includes("researchPerformed:false"));
 assert.ok(s.includes("orderCreated:false"));
});
