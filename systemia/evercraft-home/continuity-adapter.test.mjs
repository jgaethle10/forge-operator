import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {readLocalVaultReadiness} from "./continuity-adapter.mjs";
import {startEvercraftHomeServer} from "./server.mjs";

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-hq-continuity-"));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const vault=path.join(root,"private");
  fs.mkdirSync(vault,{mode:0o700});
  const archive="source-0123456789ab-abcdef123456.bundle";
  fs.writeFileSync(path.join(vault,archive),"synthetic source bytes",{mode:0o600});
  const manifest={
    schema:"evercraft.continuity.source-vault.v1",
    state:"local_bundle_verified",
    archive,committed_history_only:true,bundle_bytes:22,
    created_at:"2026-11-15T20:00:00Z"
  };
  // This fixture is intentionally NOT a valid Git bundle and must never be
  // described by Home as independently restored or reverified.
  manifest.bundle_bytes=Buffer.byteLength("synthetic source bytes");
  fs.writeFileSync(path.join(vault,archive+".json"),JSON.stringify(manifest),{mode:0o600});
  fs.writeFileSync(path.join(vault,"latest.json"),JSON.stringify({
    schema:"evercraft.continuity.source-vault.v1",manifest:archive+".json"
  }),{mode:0o600});
  return {root,vault,archive};
}
test("unconfigured vault is an explicit hold, not an archive",()=>{
  const result=readLocalVaultReadiness();
  assert.equal(result.state,"vault_not_configured");
  assert.equal(result.offsite_copy_verified,false);
  assert.equal(result.independent_restore_verified_this_read,false);
  assert.equal(result.github_required_to_read_status,false);
});
test("local manifest presence is not promoted to a verified restore",t=>{
  const f=fixture(t);
  const status=readLocalVaultReadiness({vaultDir:f.vault});
  assert.equal(status.state,"source_bundle_present_not_reverified");
  assert.equal(status.independent_restore_verified_this_read,false);
  assert.equal(status.archive_integrity_verified_this_read,false);
  assert.equal(status.database_restore_verified,false);
  assert.equal(status.offsite_copy_verified,false);
  assert.equal(status.latest_at,"2026-11-15T20:00:00Z");
  assert.ok(!JSON.stringify(status).includes(f.vault));
});
test("world-readable, deleted or symlinked bundles are held",t=>{
  const f=fixture(t);
  const archiveFile=path.join(f.vault,f.archive);
  fs.chmodSync(archiveFile,0o644);
  assert.equal(readLocalVaultReadiness({vaultDir:f.vault}).state,"vault_evidence_unavailable");
  fs.chmodSync(archiveFile,0o600);
  fs.unlinkSync(archiveFile);
  fs.symlinkSync("/tmp/another-file",archiveFile);
  assert.equal(readLocalVaultReadiness({vaultDir:f.vault}).state,"vault_evidence_unavailable");
});
test("unsafe vault or corrupt manifest cannot be reported healthy",t=>{
  const f=fixture(t);
  fs.chmodSync(f.vault,0o755);
  assert.equal(readLocalVaultReadiness({vaultDir:f.vault}).state,"vault_evidence_unavailable");
  fs.chmodSync(f.vault,0o700);
  fs.writeFileSync(path.join(f.vault,"latest.json"),JSON.stringify({
    schema:"evercraft.continuity.source-vault.v1",manifest:"../../secrets.json"
  }),{mode:0o600});
  assert.equal(readLocalVaultReadiness({vaultDir:f.vault}).state,"vault_evidence_unavailable");
});
test("anonymous private continuity status requires an Identity session in Passport mode",()=>{
  const server=fs.readFileSync(new URL("./server.mjs",import.meta.url),"utf8");
  const marker='url.pathname === "/api/continuity/status"';
  const i=server.indexOf(marker);
  assert.ok(i>=0);
  const block=server.slice(i,i+340);
  assert.ok(block.includes('sessionFor(req, "home.read")'));
  assert.ok(block.includes("if (!session.ok) return json(res, session.status, session)"));
});
test("local loopback can read held status without any provider or GitHub",async()=>{
  const runtime=await startEvercraftHomeServer({
    host:"127.0.0.1",port:0,authMode:"local",credentialStateDir:"",
    serviceOrigins:{
      RAVEN_NEXUS_WORK_URL:"",
      RAVEN_NEXUS_WORK_TOKEN_FILE:"",
      LINEAGE_CONTROL_ROOM_BRIDGE_URL:"",
      LINEAGE_CONTROL_ROOM_BRIDGE_TOKEN_FILE:"",
      EVERCRAFT_HOME_PAYMENTS_READBACK_URL:"",
      EVERCRAFT_HOME_PAYMENTS_READBACK_TOKEN_FILE:"",
      EVERCRAFT_CONTINUITY_VAULT_DIR:""
    }
  });
  try{
    const res=await fetch(runtime.url+"/api/continuity/status");
    assert.equal(res.status,200);
    const body=await res.json();
    assert.equal(body.ok,true);
    assert.equal(body.state,"vault_not_configured");
    assert.equal(body.offsite_copy_verified,false);
  }finally{await runtime.close();}
});
test("UI shows source-custody truth only inside authenticated Executive Home",()=>{
  const h=fs.readFileSync(new URL("./public/index.html",import.meta.url),"utf8");
  const begin=h.indexOf('<main id="app-shell">');
  const ending=h.indexOf('</main>',begin);
  const panel=h.indexOf('id="continuity-panel-title"');
  assert.ok(begin>=0&&panel>begin&&panel<ending);
  assert.ok(h.includes('homeFetch("/api/continuity/status")'));
  assert.ok(h.includes("showApp();"));
  assert.ok(h.includes("source_bundle_present_not_reverified"));
  assert.ok(h.includes("Private databases require separate backups"));
});
