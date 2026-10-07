import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repairRepository } from "./agent.mjs";
export async function runDemo(options={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"runbook-zero-"));
  const source=["export function invoiceTotal(subtotal, taxRate) {","  return subtotal + taxRate;","}",""].join("\n");
  const test=['import test from "node:test";','import assert from "node:assert/strict";','import { invoiceTotal } from "./invoice.mjs";','test("invoice total applies tax rate",()=>{','  assert.equal(invoiceTotal(100,0.10),110);','});',"",].join("\n");
  fs.writeFileSync(path.join(root,"invoice.mjs"),source); fs.writeFileSync(path.join(root,"invoice.test.mjs"),test);
  try{
    const result=await repairRepository({repository_path:root,allowed_files:["invoice.mjs"],verify_command:[process.execPath,"--test","invoice.test.mjs"],objective:"Repair the invoice calculator so the existing test passes. Change only invoice.mjs.",max_rounds:3},options);
    return {scenario:"invoice-tax-regression",before:source,after:fs.readFileSync(path.join(root,"invoice.mjs"),"utf8"),result};
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}
