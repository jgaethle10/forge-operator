import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportEntry, loadCatalog, validateEntrySource } from "./export-entry.mjs";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(__dirname,"..","..");

test("catalog exposes the three active public competition packages",()=>{
  assert.deepEqual(Object.keys(loadCatalog().entries).sort(),[
    "nebius-runbook-zero","paypal-checkout-black-box","qloo-commonground"
  ]);
});
test("every entry has a root MIT license and passes secret-boundary validation",()=>{
  for(const key of Object.keys(loadCatalog().entries)){
    const result=validateEntrySource(key);
    assert.ok(result.files.includes("README.md"),key);
    assert.ok(result.files.includes("LICENSE"),key);
    assert.ok(result.files.includes("package.json"),key);
  }
});
test("export is standalone and carries an integrity receipt",()=>{
  const out=path.join(repoRoot,"artifacts","competition-export-test","qloo");
  try{
    const receipt=exportEntry("qloo-commonground",out);
    assert.equal(receipt.entry_key,"qloo-commonground");
    assert.equal(receipt.secret_scan,"passed");
    assert.equal(receipt.root_license,"MIT");
    assert.ok(receipt.file_count>=8);
    assert.ok(fs.existsSync(path.join(out,"README.md")));
    assert.ok(fs.existsSync(path.join(out,"LICENSE")));
    assert.ok(fs.existsSync(path.join(out,"PUBLIC_EXPORT_RECEIPT.json")));
  } finally {
    fs.rmSync(path.join(repoRoot,"artifacts","competition-export-test"),{recursive:true,force:true});
  }
});
test("unknown entries fail closed",()=>assert.throws(()=>validateEntrySource("does-not-exist"),/unknown_entry/));
