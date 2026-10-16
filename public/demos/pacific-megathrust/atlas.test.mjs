import test from "node:test";
import assert from "node:assert/strict";
import { inZone, pacificDisplayLon, safeHttpsUrl, normalizeUsgsFeed, feedFreshness, summarize, htmlEscape,
  MODELED_WGS_LAYERS } from "./atlas.mjs";
const event=(id, lon, lat, mag=5, time=1000000, url="https://earthquake.usgs.gov/earthquakes/eventpage/test")=>({
 type:"Feature",id,geometry:{type:"Point",coordinates:[lon,lat,20]},
 properties:{mag,time,url,place:"near sample",type:"earthquake"}
});
test("zone windows classify both ocean edges but are not fault polygons",()=>{
 assert.equal(inZone(45,150,"kuril"),true);
 assert.equal(inZone(46,-125,"cascadia"),true);
 assert.equal(inZone(46,150,"cascadia"),false);
 assert.equal(inZone(61,150,"kuril"),true);
 assert.equal(inZone(62,150,"kuril"),false);
});
test("Pacific world wrapping is stable",()=>{
 assert.equal(pacificDisplayLon(150),-210);
 assert.equal(pacificDisplayLon(-125),-125);
 assert.equal(pacificDisplayLon(NaN),null);
});
test("normalize safely validates, filters and sorts USGS observations",()=>{
 const x=normalizeUsgsFeed({type:"FeatureCollection",metadata:{generated:2000000},
 features:[event("c",-125,46,4.8,500),event("k",150,45,5.2,1000),event("x",10,10),event("bad",150,45,5,900,"javascript:alert(1)") ]});
 assert.equal(x.events.length,2);
 assert.equal(x.events[0].id,"k");
 assert.equal(x.events[0].zone,"kuril");
 assert.equal(x.events[0].displayLon,-210);
 assert.equal(x.events[0].evidenceState,"observed_catalog_event");
 assert.deepEqual(summarize(x.events),{total:2,kuril:1,cascadia:1});
});
test("rejects non-catalog and malformed observations",()=>{
 assert.throws(()=>normalizeUsgsFeed({features:[]}),/Invalid/);
 const f=event("a",150,45);f.properties.type="quarry blast";
 const bad=event("b",150,95);
 const payload={type:"FeatureCollection",features:[f,bad,{geometry:{type:"LineString"},properties:{mag:5}}]};
 assert.equal(normalizeUsgsFeed(payload).events.length,0);
});
test("event caps are bounded",()=>{
 const x=normalizeUsgsFeed({type:"FeatureCollection",features:Array.from({length:5},(_,i)=>event("k"+i,150,45,5,i+1))},{limit:2});
 assert.equal(x.events.length,2);
 assert.equal(x.events[0].time,5);
});
test("freshness is observation timestamp based, never interpreted as a prediction",()=>{
 assert.equal(feedFreshness(1000000,1000000+30*60000),"recent");
 assert.equal(feedFreshness(1000000,1000000+240*60000),"stale");
 assert.equal(feedFreshness(null,1000000),"unknown");
 assert.equal(feedFreshness(4000000,1000000),"unknown");
});
test("source hyperlinks must be HTTPS and UI content escaped",()=>{
 assert.equal(safeHttpsUrl("javascript:alert(1)"),null);
 assert.equal(safeHttpsUrl("http://example.com"),null);
 assert.equal(htmlEscape("<img onerror='x'>&"),"&lt;img onerror=&#39;x&#39;&gt;&amp;");
});
test("WA layers are source-defined separate from live catalog events",()=>{
 assert.equal(MODELED_WGS_LAYERS.cascadiaInundation,29);
 assert.equal(MODELED_WGS_LAYERS.evacuationRoutes,20);
 assert.equal(MODELED_WGS_LAYERS.arrivalTimes,34);
});
