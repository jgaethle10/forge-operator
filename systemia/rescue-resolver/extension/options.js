import { createRule, RESCUE } from './redirect-contract.mjs';
const consent = document.getElementById('consent');
const enable = document.getElementById('enable');
const disable = document.getElementById('disable');
const status = document.getElementById('status');
const print = message => { status.textContent = message; };
const resetConsent = () => { consent.checked = false; enable.disabled = true; };
consent.addEventListener('change',()=>{ enable.disabled = !consent.checked; });
async function refresh(){
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    print(rules.some(r=>r.id===RESCUE.ruleId)
      ? 'Enabled for this browser only.'
      : 'Disabled. Normal domain routing remains unchanged.');
  } catch(e){print('Could not inspect browser rules: '+e.message);}
}
enable.addEventListener('click',async()=>{
  if(!consent.checked) return;
  enable.disabled = true;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds:[RESCUE.ruleId],
      addRules:[createRule()],
    });
    await refresh();
  }catch(e){print('Not enabled: '+e.message);}
  finally {resetConsent();}
});
disable.addEventListener('click',async()=>{
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[RESCUE.ruleId]});
    await refresh();
  }catch(e){print('Disable failed: '+e.message);}
  resetConsent();
});
await refresh();
