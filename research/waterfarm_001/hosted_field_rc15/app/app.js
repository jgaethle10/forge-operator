/** Aqua RC15 hosted field notebook. Installable only after serving over HTTPS.
 * No uploading, telemetry, motor controls or verified savings.
 */
import {blankJournal,validateJournal,addReading,preview,todayLocal,backupJSON,toMeterCSV,researchAudit,restoreBackupText} from './journal.mjs';
import {openStore,readStored,saveStored,deleteStored} from './storage.mjs';
const el=id=>document.getElementById(id);
let db=null,journal=null,busy=false,backupPreviewMode=null;
const message=(txt,error=false)=>{const b=el('message');b.textContent=txt;b.classList.toggle('error',error);};
const status=(txt,error=false)=>{const b=el('storageStatus');b.textContent=txt;b.classList.toggle('error',error);};
function download(name,text,mime){const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function render(){
  const active=Boolean(journal);
  el('startPanel').hidden=active;el('logPanel').hidden=!active;el('results').hidden=true;
  if(!active)return;
  const p=preview(journal);
  el('meterTitle').textContent=journal.meter_id+' • '+journal.units;
  el('progress').innerHTML=p.reading_count+' <small>/ 15 readings</small>';
  el('progressBar').style.width=Math.min(100,p.reading_count/15*100)+'%';
  el('nextHint').textContent=p.ready?'Minimum baseline complete; export the audit and external backup.':'Next reading due: '+p.next_date+' • '+p.remaining_readings+' to minimum baseline';
  el('readDate').max=todayLocal();el('readDate').value=p.next_date;el('readValue').value='';el('energyValue').value='';
  el('energyValue').disabled=p.reading_count===0;el('undo').disabled=p.reading_count===0;el('exportAudit').disabled=!p.ready;
  el('lastDetails').hidden=!p.reading_count;
  if(p.reading_count)el('lastDetails').textContent='Last recorded: '+p.last_reading+' '+journal.units+' on '+journal.records.at(-1).date+'. '+p.completed_intervals+' consecutive intervals.';
  el('backupReminder').textContent='On-device storage is not encrypted or guaranteed permanent. Export a JSON backup after each reading and verify it exists outside this app.';
  if(p.ready){try{
    const a=researchAudit(journal);el('results').hidden=false;
    el('total').textContent=a.total_source_withdrawal_l.toLocaleString()+' L';
    el('average').textContent=a.mean_daily_withdrawal_l.toLocaleString()+' L/day';
    el('energyStat').textContent=a.energy_kwh_per_m3===null?'Pump energy: unknown':'Pump energy: '+a.energy_kwh_per_m3+' kWh/m³';
  }catch(e){el('exportAudit').disabled=true;message(e.message,true);}}
}
async function guard(action){
 if(busy)return;busy=true;
 try{await action();}catch(e){message(e?.message||'HOLD: operation failed',true);}finally{busy=false;}
}
async function replaceJournal(candidate,announcement){
  if(!db)throw new Error('HOLD: storage unavailable. Notebook not saved.');
  const clean=validateJournal(candidate);
  await saveStored(db,clean,journal);
  journal=clean;render();status('Notebook saved to this website’s on-device database. Back up externally after each reading.');message(announcement);
}
async function applyRestored(raw){
  const clean=restoreBackupText(raw);
  if(journal&&!confirm('Replace the current notebook? Download its backup first.'))return false;
  await replaceJournal(clean,'Backup integrity checked and restored locally. Meter authenticity is still unverified.');return true;
}
async function readBackupFile(file){if(!file||file.size>1000000||!file.name.toLowerCase().endsWith('.json'))throw new Error('HOLD: Choose an Aqua JSON backup smaller than 1 MB');return await file.text();}
el('start').addEventListener('click',()=>guard(async()=>{
 await replaceJournal(blankJournal(el('meterId').value,el('units').value),'Notebook created. Start with the current totalizer and leave first-day energy blank.');
}));
el('add').addEventListener('click',()=>guard(async()=>{
 if(!journal)throw new Error('HOLD: start a notebook');
 const candidate=validateJournal(journal);
 addReading(candidate,{date:el('readDate').value,reading:el('readValue').value,pump_kwh_since_previous:el('energyValue').value});
 await replaceJournal(candidate,'Reading saved in a completed database transaction. Export an external backup now.');
}));
el('undo').addEventListener('click',()=>guard(async()=>{
 if(!journal?.records.length||!confirm('Remove the latest reading? Save an external backup first.'))return;
 const next=validateJournal(journal);next.records.pop();await replaceJournal(next,'Latest reading removed.');
}));
el('reset').addEventListener('click',()=>guard(async()=>{
 if(!journal||!confirm('Delete the whole notebook from this device? This cannot be undone without an external backup.'))return;
 await deleteStored(db,journal);journal=null;render();message('On-device notebook cleared; external backups unaffected.');
}));
el('exportCsv').addEventListener('click',()=>{if(!journal)return;try{download('Aqua_readings_'+journal.meter_id+'.csv',toMeterCSV(journal),'text/csv');message('CSV requested. Verify it saved in Files.');}catch(e){message(e.message,true);}});
el('exportBackup').addEventListener('click',()=>{if(!journal)return;try{download('Aqua_backup_'+journal.meter_id+'.json',backupJSON(journal),'application/json');message('Backup export requested. Verify it exists outside the browser.');}catch(e){message(e.message,true);}});
el('exportAudit').addEventListener('click',()=>{if(!journal)return;try{download('Aqua_unverified_'+journal.meter_id+'.json',JSON.stringify(researchAudit(journal),null,2)+'\n','application/json');message('Provisional audit exported. No water saved or leaks verified.');}catch(e){message(e.message,true);}});
el('startRestoreFile').addEventListener('click',()=>el('startBackupFile').click());
el('importBackup').addEventListener('click',()=>el('backupFile').click());
for(const id of ['startBackupFile','backupFile'])el(id).addEventListener('change',async()=>{
  const f=el(id).files?.[0];await guard(async()=>{const raw=await readBackupFile(f);await applyRestored(raw);});el(id).value='';
});
el('startRestoreText').addEventListener('click',()=>{el('startRestoreTextPanel').hidden=false;el('startBackupText').focus();});
el('startCancelBackup').addEventListener('click',()=>{el('startRestoreTextPanel').hidden=true;el('startBackupText').value='';});
el('startApplyBackup').addEventListener('click',()=>guard(async()=>{
 if(await applyRestored(el('startBackupText').value)){el('startRestoreTextPanel').hidden=true;el('startBackupText').value='';}
}));
function showTextPanel(mode){backupPreviewMode=mode;el('backupTextPanel').hidden=false;el('backupTextTitle').textContent=mode==='export'?'Copy your JSON backup':'Paste backup JSON to restore';el('copyBackupText').hidden=mode!=='export';el('restorePastedBackup').hidden=mode!=='import';el('backupText').value=mode==='export'&&journal?backupJSON(journal):'';el('backupText').focus();}
el('showBackupText').addEventListener('click',()=>{if(journal)showTextPanel('export');});
el('pasteBackupText').addEventListener('click',()=>showTextPanel('import'));
el('closeBackupText').addEventListener('click',()=>{el('backupText').value='';el('backupTextPanel').hidden=true;backupPreviewMode=null;});
el('copyBackupText').addEventListener('click',async()=>{
  let copied=false;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(el('backupText').value);copied=true;}}catch{}
  if(!copied){el('backupText').focus();el('backupText').select();}message(copied?'Copied. Paste into a private location outside this browser.':'Clipboard unavailable; backup text selected for manual copy.');
});
el('restorePastedBackup').addEventListener('click',()=>guard(async()=>{
 if(backupPreviewMode!=='import')return;
 if(await applyRestored(el('backupText').value)){el('backupText').value='';el('backupTextPanel').hidden=true;backupPreviewMode=null;}
}));
async function startup(){
  if(location.protocol==='file:'){status('HOLD: this build must be hosted on a trusted HTTPS origin; file previews are not durable.',true);message('Open the standalone RC14 file for a demo, or install RC15 after verified hosting.',true);return;}
  if(!window.isSecureContext){status('HOLD: HTTPS secure context required.',true);message('This package needs an HTTPS site to store field notebooks.',true);return;}
  try{db=await openStore();journal=await readStored(db);if(journal)message('On-device notebook restored with matching backup fingerprint. Source authenticity is unverified.');status('IndexedDB ready on this origin. Storage can still be evicted; back up externally.');}
  catch(e){status(e?.message||'HOLD: storage unavailable',true);message('Storage failed. Do not record unbacked observations. Recover from an external backup after storage is repaired.',true);}
  render();
  if('serviceWorker' in navigator && db){
    try{await navigator.serviceWorker.register('./sw.js',{scope:'./'});}catch(e){message('Notebook works online; offline install cache unavailable until service worker registers.',true);}
  }
}
await startup();
