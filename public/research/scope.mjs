// Evercraft Research v1: local-only research scope preparation.
// No web fetch, model execution, data submission, quotes or order creation.
export const LIMITS=Object.freeze({question:600,context:1600,location:120,sourceCount:6,sourceLength:450});
export const FORMATS=Object.freeze({
 "decision-brief":"Evidence-backed decision brief",
 "market-review":"Market and competitor review",
 "claim-check":"Claim and evidence review",
 "location-review":"Location and property research",
 "technical-review":"Technical research assessment"
});
const tidy=(value)=>String(value??"").normalize("NFKC").replace(/\s+/g," ").trim();
export function prepareResearchScope(input){
 const question=tidy(input?.question);
 if(question.length<20||question.length>LIMITS.question)throw Error("Describe a specific research question in 20 to 600 characters.");
 const context=tidy(input?.context);
 if(context.length>LIMITS.context)throw Error("Decision context must be 1,600 characters or fewer.");
 const location=tidy(input?.location);
 if(location.length>LIMITS.location)throw Error("Location must be 120 characters or fewer.");
 const format=String(input?.format??"decision-brief");
 if(!Object.hasOwn(FORMATS,format))throw Error("Choose a supported research report.");
 const raw=String(input?.sources??"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(raw.length>LIMITS.sourceCount)throw Error("Provide at most six optional source links.");
 const sources=raw.map((entry,index)=>{
  if(entry.length>LIMITS.sourceLength)throw Error("Each source link must be 450 characters or fewer.");
  let parsed;
  try{parsed=new URL(entry);}catch{throw Error("Source "+(index+1)+" must be a full http or https URL.");}
  if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)throw Error("Source "+(index+1)+" must be a public http(s) URL without embedded credentials.");
  const host=parsed.hostname.toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)||host==="[::1]")throw Error("Source "+(index+1)+" must be publicly addressable, not a private network address.");
  return parsed.toString();
 });
 const lines=[
  "EVERCRAFT RESEARCH | CUSTOMER SCOPE BRIEF",
  "Prepared locally in the customer's browser. No research or source retrieval has taken place.",
  "This is not a report, a price quotation, a payment, or a confirmed order.","",
  "RESEARCH QUESTION",question,"",
  "REQUESTED DELIVERABLE",FORMATS[format],"",
  "DECISION OR USE CONTEXT",context||"Not provided","",
  "GEOGRAPHIC SCOPE",location||"Not specified","",
  "CUSTOMER-SUPPLIED SOURCES (UNVERIFIED)",...(sources.length?sources.map((x,i)=>(i+1)+". "+x):["None supplied"]),"",
  "EVIDENCE REQUIREMENTS",
  "- Distinguish independently observed facts, user-provided claims, modeling, assumptions, and unknowns.",
  "- Attach a retrievable source and observation date to material factual claims.",
  "- Preserve contradictory findings rather than manufacturing agreement.",
  "- Explicitly state inaccessible sources, limitations, and uncertainty.",
  "- Provide next steps that follow from the evidence, not unsourced promises.","",
  "PURCHASE AND DELIVERY",
  "Scope, exact price, timeline, secure intake and fulfillment are confirmed before any payment.",
  "Submitting this brief is optional. It does not place an order or authorize access to private data."
 ];
 return Object.freeze({question,context,location,format,formatLabel:FORMATS[format],sources:Object.freeze(sources),sourceStatus:"customer_supplied_unverified",researchPerformed:false,priceQuoted:false,orderCreated:false,reportText:lines.join("\n")});
}
