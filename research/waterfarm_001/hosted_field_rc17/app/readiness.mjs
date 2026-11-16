/** Read-only, no-network RC17 diagnostic. A report cannot certify persistence.
 * Deliberately excludes meter IDs, readings, backup data, or site identity.
 */
export const RC17_CACHE='evercraft-aqua-field-rc17-static-v1';
export async function deviceReadiness(env=globalThis){
  const loc=env.location||{},nav=env.navigator||{};
  const result={
    schema:'evercraft.aqua.device-check.rc17.v1',
    evidence:'LOCAL_RUNTIME_DIAGNOSTIC_NOT_DEVICE_ACCEPTANCE',
    https_origin:loc.protocol==='https:',
    secure_context:env.isSecureContext===true,
    indexeddb_api_present:!!env.indexedDB?.open,
    service_worker_supported:!!nav.serviceWorker?.register,
    worker_controls_this_page:!!nav.serviceWorker?.controller,
    app_shell_cache_present:'UNKNOWN',
    storage_persistence_granted:'UNKNOWN',
    storage_status:'BROWSER_MANAGED_UNENCRYPTED_EVICTABLE',
    certified_offline_relaunch:false,
    certified_native_iphone:false,
    verified_field_measurements:false,
    advice:'Export a JSON backup outside the app after every reading; perform device reopen/offline/recovery acceptance before any private field pilot.'
  };
  try{
    if(env.caches?.has){
      const present=await env.caches.has(RC17_CACHE);
      result.app_shell_cache_present=present===true?'PRESENT_NOT_VERIFIED_COMPLETE':'ABSENT';
    }
  }catch{result.app_shell_cache_present='INACCESSIBLE';}
  try{
    if(nav.storage?.persisted){
      const persisted=await nav.storage.persisted();
      result.storage_persistence_granted=persisted===true?'BROWSER_REPORTS_PERSISTENT_NOT_GUARANTEED':'NOT_GRANTED';
    }
  }catch{result.storage_persistence_granted='INACCESSIBLE';}
  return result;
}
