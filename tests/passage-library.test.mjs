import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
import {validateCatalog,filterArticles,escapeHTML,portableHTML} from "../public/passage/catalog.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>readFileSync(resolve(root,p),"utf8");
const data=JSON.parse(read("public/passage/catalog.json"));
test("demonstration content has unique IDs, explicit rights and provenance",()=>{
 const valid=validateCatalog(data);assert.ok(valid.articles.length>=5);
 assert.equal(new Set(valid.articles.map(a=>a.id)).size,valid.articles.length);
 for(const a of valid.articles){assert.ok(a.rights.includes("Broad redistribution rights"));assert.ok(a.edition);assert.ok(a.sources.every(s=>s.url.startsWith("https://")))}
});
test("search and category filters work",()=>{
 assert.ok(filterArticles(data.articles,"All","offline").length>=1);
 assert.ok(filterArticles(data.articles,"Media literacy","claim").some(a=>a.id==="check-a-claim"));
 assert.equal(filterArticles(data.articles,"Digital safety","research").length,0);
});
test("portable export is standalone and escapes HTML markup",()=>{
 const html=portableHTML(data);assert.ok(html.includes("<!doctype html>"));assert.ok(html.includes("How to check a claim"));assert.ok(!html.includes('<script'));
 assert.equal(escapeHTML('<script>"&'),"&lt;script&gt;&quot;&amp;");
 const copy=structuredClone(data);copy.articles[0].title="<img src=x onerror=alert(1)>";
 assert.ok(portableHTML(copy).includes("&lt;img src=x onerror=alert(1)&gt;"));
});
test("offline assets and prototype disclosures are included",()=>{
 const sw=read("public/passage/sw.js");for(const file of ["./catalog.json","./app.mjs","./catalog.mjs","./style.css","./index.html"])assert.ok(sw.includes(file));
 const html=read("public/passage/index.html");assert.ok(html.includes("Prototype"));assert.ok(html.includes("not an anonymity tool"));
 const app=read("public/passage/app.mjs");assert.ok(!/google-analytics|gtag|mixpanel|segment\.io|facebook\.net/i.test(app));
});
