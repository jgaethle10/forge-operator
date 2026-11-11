"""DOM-only QA for the hostable client. Does not exercise real-origin IDB/SW.
The browser runner blocks HTTP and file navigation; note this limitation.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json,re
from datetime import date,timedelta
ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text().replace('<script type="module" src="./app/app.js"></script>','')
core=(ROOT/'app/core.mjs').read_text().replace('export ','')
journal=(ROOT/'app/journal.mjs').read_text().replace("import {analyzeSingleMeter, FIELDS, UNITS, EvidenceHold, sha256Hex} from './core.mjs';",'').replace('export ','')
storage=(ROOT/'app/storage.mjs').read_text().replace("import {backupJSON,restoreBackupText} from './journal.mjs';",'').replace('export ','')
app=(ROOT/'app/app.js').read_text()
app=re.sub(r'^import .*;\n','',app,flags=re.MULTILINE)
code="(async()=>{\n"+core+'\n'+journal+'\n'+storage+'\n'+app+'\n})();'
# Mock is a stateful but IN-MEMORY transaction model, not a real IndexedDB browser origin
mock='''
Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});
const disk=new Map();
const database={objectStoreNames:{contains:(name)=>name==='state'},createObjectStore(){},transaction(_table,mode){
let pending=0,aborted=false,ended=false;const shadow=new Map(disk);
const tx={oncomplete:null,onerror:null,onabort:null,abort(){aborted=true;queueMicrotask(()=>tx.onabort?.());},objectStore(){return{get:key=>act(()=>shadow.get(key)),put:(val,key)=>act(()=>{shadow.set(key,val);return key;}),delete:key=>act(()=>shadow.delete(key))};}};
function finish(){setTimeout(()=>{if(!ended&&!aborted&&pending===0){ended=true;if(mode==='readwrite'){disk.clear();for(const [k,v] of shadow)disk.set(k,v);}tx.oncomplete?.();}},0)}
function act(fn){const req={onsuccess:null,onerror:null,result:undefined};pending++;setTimeout(()=>{if(aborted)return;try{req.result=fn();}catch(e){tx.onerror?.(e);return;}pending--;req.onsuccess?.();finish();},0);return req;}
return tx;}};
Object.defineProperty(window,'indexedDB',{value:{open:(_name,_version)=>{const req={onsuccess:null,onerror:null,onupgradeneeded:null,result:database};queueMicrotask(()=>{req.onupgradeneeded?.();req.onsuccess?.();});return req;}},configurable:true});
'''
results={'scope':'DOM emulation, in-memory fake IndexedDB, no genuine SW/HTTPS/iPhone test','cases':{},'errors':[]}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in (390,1365):
  page=b.new_page(viewport={'width':width,'height':844 if width==390 else 900},accept_downloads=True)
  page.on('pageerror',lambda e:results['errors'].append(str(e)))
  page.set_content(html)
  page.evaluate(mock)
  page.evaluate(code)
  page.wait_for_function("document.querySelector('#storageStatus')?.innerText?.includes('ready')")
  results['cases'][f'start_visible_{width}']=page.locator('#start').is_visible()
  results['cases'][f'no_horizontal_overflow_{width}']=page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.locator('#meterId').fill('WELL-A')
  page.locator('#start').click()
  page.wait_for_function("document.querySelector('#progress')?.innerText?.startsWith('0')")
  for i in range(15):
    dt=(date(2026,10,1)+timedelta(days=i)).isoformat()
    page.locator('#readDate').fill(dt)
    page.locator('#readValue').fill(str(100+i*100))
    page.locator('#add').click()
    page.wait_for_function("n=>document.querySelector('#progress')?.innerText?.startsWith(String(n))",arg=i+1)
  results['cases'][f'15_readings_{width}']=page.locator('#exportAudit').is_enabled()
  page.locator('#showBackupText').click()
  backup=page.locator('#backupText').input_value()
  results['cases'][f'backup_exported_{width}']=len(json.loads(backup)['records'])==15
  page.screenshot(path=str(ROOT/'qa'/('phone_rc15.png' if width==390 else 'desktop_rc15.png')),full_page=True)
  # tampered backup must not overwrite stored data
  altered=json.loads(backup);altered['records'][-1]['reading']='19000'
  page.locator('#pasteBackupText').click()
  page.locator('#backupText').fill(json.dumps(altered))
  page.locator('#restorePastedBackup').click()
  page.wait_for_timeout(250)
  results['cases'][f'corrupted_backup_rejected_{width}']='HOLD' in page.locator('#message').inner_text() and page.locator('#progress').inner_text().startswith('15')
  # clear then cold restore from startup panel, no prior notebook
  page.on('dialog',lambda dialog:dialog.accept())
  page.locator('#reset').click()
  page.wait_for_function("document.querySelector('#startPanel')?.hidden === false")
  page.locator('#startRestoreText').click()
  page.locator('#startBackupText').fill(backup)
  page.locator('#startApplyBackup').click()
  page.wait_for_function("document.querySelector('#progress')?.innerText?.startsWith('15')")
  results['cases'][f'cold_restore_{width}']=True
  page.close()
 b.close()
(ROOT/'qa'/'injected_browser_report.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
assert all(results['cases'].values()) and not results['errors']
