import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startEvercraftHomeServer } from "./server.mjs";

test("Home requires Raven work URL and token file as one binding", async () => {
  await assert.rejects(() => startEvercraftHomeServer({
    port: 0,
    serviceOrigins: {
      RAVEN_NEXUS_WORK_URL: "http://127.0.0.1:4321",
    },
  }), /configured_together/);
});

test("Home rejects overly broad Raven authority-token permissions", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"home-raven-token-"));
  const tokenFile=path.join(root,"raven-token");
  fs.writeFileSync(tokenFile,"home-raven-shared-control-token-0123456789012345",{mode:0o644});
  try{
    await assert.rejects(() => startEvercraftHomeServer({
      port:0,
      serviceOrigins:{
        RAVEN_NEXUS_WORK_URL:"http://127.0.0.1:4321",
        RAVEN_NEXUS_WORK_TOKEN_FILE:tokenFile,
      },
    }),/permissions_too_open/);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test("Home accepts a private Raven token file without exposing the token in health", async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"home-raven-token-"));
  const token="home-raven-shared-control-token-0123456789012345";
  const tokenFile=path.join(root,"raven-token");
  fs.writeFileSync(tokenFile,token,{mode:0o600});
  let runtime;
  try{
    runtime=await startEvercraftHomeServer({
      port:0,
      serviceOrigins:{
        RAVEN_NEXUS_WORK_URL:"http://127.0.0.1:4321",
        RAVEN_NEXUS_WORK_TOKEN_FILE:tokenFile,
      },
    });
    const health=await runtime.health();
    assert.equal(health.raven_readonly_execution_configured,true);
    assert.equal(JSON.stringify(health).includes(token),false);
  }finally{
    if(runtime) await runtime.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
