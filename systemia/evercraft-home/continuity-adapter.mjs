import fs from "node:fs";
import path from "node:path";

const SCHEMA = "evercraft.continuity.source-vault.v1";
const ARCHIVE = /^source-[a-f0-9]{12}-[a-f0-9]{12}\.bundle$/;
const POINTER = /^source-[a-f0-9]{12}-[a-f0-9]{12}\.bundle\.json$/;
function snapshot(state,detail,latest_at=null){
  return Object.freeze({
    schema:"evercraft.home.continuity-readiness.v1",
    state,detail,latest_at,
    committed_source_only:true,
    archive_integrity_verified_this_read:false,
    independent_restore_verified_this_read:false,
    database_restore_verified:false,
    offsite_copy_verified:false,
    github_required_to_read_status:false,
    ai_required_to_read_status:false,
  });
}
function privateStat(file,type){
  const st=fs.lstatSync(file);
  if(st.isSymbolicLink()||(st.mode&0o077)!==0||
     (type==="directory"&&!st.isDirectory())||
     (type==="file"&&!st.isFile()))
    throw new Error("untrusted_private_file");
  return st;
}
export function readLocalVaultReadiness({vaultDir=""}={}){
  if(typeof vaultDir!=="string"||!vaultDir.trim())
    return snapshot("vault_not_configured","No locally owned source vault location is configured for Evercraft Home.");
  try{
    if(!path.isAbsolute(vaultDir))throw new Error("vault_must_be_absolute");
    const root=path.resolve(vaultDir);
    privateStat(root,"directory");
    const pointerFile=path.join(root,"latest.json");
    if(privateStat(pointerFile,"file").size>4096)throw new Error("pointer_size_invalid");
    const pointer=JSON.parse(fs.readFileSync(pointerFile,"utf8"));
    if(pointer.schema!==SCHEMA||!POINTER.test(String(pointer.manifest||"")))
      throw new Error("pointer_untrusted");
    const manifestFile=path.join(root,pointer.manifest);
    if(privateStat(manifestFile,"file").size>32768)
      throw new Error("manifest_size_invalid");
    const record=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
    if(record.schema!==SCHEMA||record.state!=="local_bundle_verified"||
       !ARCHIVE.test(String(record.archive||""))||
       record.archive+".json"!==pointer.manifest||
       record.committed_history_only!==true||
       typeof record.created_at!=="string"||
       !Number.isFinite(Date.parse(record.created_at)))
      throw new Error("manifest_untrusted");
    const bundle=path.join(root,record.archive);
    const stat=privateStat(bundle,"file");
    if(stat.size!==record.bundle_bytes)throw new Error("bundle_size_drift");
    return snapshot("source_bundle_present_not_reverified",
      "A private committed-source archive and manifest are present. Run the offline verify/restore command; this display does not rehash the bundle or prove offsite backups.",record.created_at);
  }catch{
    return snapshot("vault_evidence_unavailable",
      "The configured local source vault cannot be trusted or read. No archive, recovery or uptime success is asserted.");
  }
}
