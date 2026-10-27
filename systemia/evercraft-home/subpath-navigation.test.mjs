import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(name)=>fs.readFileSync(new URL("./public/"+name, import.meta.url),"utf8");

test("mounted Home navigation never escapes to the Fabric root",()=>{
  const index=read("index.html");
  const apps=read("apps.html");
  const credentials=read("credentials.html");

  assert.match(index,/href="credentials\.html"/);
  assert.match(index,/href="apps\.html"/);
  assert.match(index,/href="lineage"/);
  assert.doesNotMatch(index,/href="\/apps\.html"/);
  assert.doesNotMatch(index,/href="\/lineage"/);
  assert.match(apps,/href="\.\/"/);
  assert.match(credentials,/href="\.\/"/);
});

test("provider vault and emergency import route APIs through the active Home mount",()=>{
  for(const name of ["credentials.html","emergency-import.html"]){
    const html=read(name);
    assert.match(html,/const HOME_PREFIX=/);
    assert.match(html,/const homeFetch=/);
    assert.doesNotMatch(html,/fetch\("\/api\//);
  }
  const credentials=read("credentials.html");
  assert.match(credentials,/homeFetch\("\/api\/session"/);
  assert.match(credentials,/homeFetch\(cfg\.endpoint/);
  assert.match(credentials,/window\.location\.replace\(HOME_PREFIX\+"\/"\)/);
});
