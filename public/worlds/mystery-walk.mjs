/**
 * Mysteries in the canonical Evercraft Worlds WebGL view.
 * DOM presentation only; the existing Worlds renderer draws the beacon.
 * Case rules come from The Window and are always labeled fictional.
 */
import {createWorld as createSocietyWorld} from '../the-window/world.mjs';
import {createMystery,revealNext,suspicionScores,accuse} from '../the-window/mystery.mjs';
import {activeEvidenceStation,nearbyEvidenceStation} from './mystery-bridge.mjs';

export function mountMysteryWalk({openWorld}) {
  if (typeof openWorld!=='function') throw Error('Missing world opener');
  const hud=document.querySelector('.actions');
  const intro=document.getElementById('intro');
  if (!hud || !intro) throw Error('World controls unavailable');
  const openButton=document.createElement('button');
  openButton.type='button';
  openButton.id='mysteryOpen';
  openButton.textContent='🔎 Mystery Walk';
  hud.append(openButton);
  const introButton=document.createElement('button');
  introButton.type='button';
  introButton.className='mystery-intro-button';
  introButton.textContent='Investigate a mystery';
  intro.querySelector('.hint')?.before(introButton);
  const panel=document.createElement('aside');
  panel.id='worldsMysteryPanel';
  panel.className='worlds-mystery-panel hidden';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','false');
  panel.setAttribute('aria-label','The Missing Blueprint, fictional investigation');
  panel.innerHTML=`<div class="wm-head"><div><small>EVERCRAFT WORLDS · ORIGINAL EXPERIMENT</small><h2>The Missing Blueprint</h2></div><button type="button" id="wm-close" aria-label="Return to world">×</button></div>
    <p class="wm-summary">Someone moved a workshop blueprint. Explore Mossmere in 3D, find the glowing evidence stations, and investigate what happened.</p>
    <p class="wm-status" id="wm-status" role="status" aria-live="polite"></p>
    <h3>Clues <span id="wm-progress"></span></h3><ol id="wm-clues" aria-label="Evidence collected"></ol>
    <h3>Residents & evidence weights</h3><div id="wm-suspects"></div>
    <label for="wm-choice">Your theory</label><select id="wm-choice"></select>
    <button id="wm-accuse" type="button">Submit theory</button>
    <p id="wm-result" role="status" aria-live="polite"></p>
    <div class="wm-foot-actions"><button id="wm-continue" type="button">Return to 3D world</button><button id="wm-reset" type="button">New case</button></div>
    <p class="wm-truth">FICTIONAL RULE-BASED PUZZLE. No independent LLM agents or witness testimony. Evidence weights are not guilt probabilities. Your investigation is local and does not modify the shared society, player save, or world engine.</p>`;
  document.body.append(panel);
  const $=id=>panel.querySelector('#'+id);
  let seed=0, caseFile=null, isPanelOpen=false, selected='';
  const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  function close(){panel.classList.add('hidden');isPanelOpen=false;openButton.focus({preventScroll:true});}
  function show(){panel.classList.remove('hidden');isPanelOpen=true;render();$('wm-close').focus({preventScroll:true});}
  function newCase(){
    caseFile=createMystery(createSocietyWorld(0,818),seed);
    selected=caseFile.suspects[0].id;
    show();
  }
  function start(){
    if (!caseFile) {
      openWorld();
      newCase();
    } else if(isPanelOpen) close();
    else show();
  }
  function render(){
    if(!caseFile) return;
    const next=activeEvidenceStation(caseFile);
    $('wm-status').textContent=caseFile.accusation?'Case complete. The local world is unchanged.':
      next?'Next evidence: '+next.label+'. Follow the glowing beacon and press E or tap Interact.':
      'All four clues inspected. You can submit your theory.';
    $('wm-progress').textContent=caseFile.revealed+' / '+caseFile.maxReveals;
    const items=caseFile.clues.slice(0,caseFile.revealed).map(clue=>{
      const li=node('li',clue.text);
      li.prepend(node('small',clue.source+' · '+clue.reliability.replaceAll('_',' ')));
      return li;
    });
    if(!items.length)items.push(node('li','No clues collected yet. Start at the glowing workshop register.'));
    $('wm-clues').replaceChildren(...items);
    const scores=suspicionScores(caseFile);
    $('wm-suspects').replaceChildren(...caseFile.suspects.map(s=>{
      const el=node('div',s.name+' · '+s.job);
      el.className='wm-suspect';
      el.append(node('small','Evidence weight '+scores[s.id]));return el;
    }));
    const choice=$('wm-choice');
    choice.replaceChildren(...caseFile.suspects.map(s=>{
      const option=node('option',s.name);option.value=s.id;return option;
    }));
    choice.value=selected;
    choice.disabled=Boolean(caseFile.accusation);
    $('wm-accuse').disabled=Boolean(caseFile.accusation)||caseFile.revealed<3;
    $('wm-result').textContent=caseFile.accusation?
      (caseFile.accusation.correct?'Your theory matches the case evidence. ':'Your theory does not match the case evidence. ')+
      'The fictional case identifies '+caseFile.suspects.find(s=>s.id===caseFile.answerId).name+
      ' as the resident who moved the blueprint. Motive remains unknown.':
      caseFile.revealed<3?'Collect at least three clues before accusing anyone.':'You can accuse now or inspect the remaining clues.';
  }
  $('wm-close').addEventListener('click',close);
  $('wm-continue').addEventListener('click',close);
  $('wm-choice').addEventListener('change',e=>{selected=e.target.value;});
  $('wm-accuse').addEventListener('click',()=>{caseFile=accuse(caseFile,selected);render();});
  $('wm-reset').addEventListener('click',()=>{seed=(seed+1)%1000000;newCase();});
  openButton.addEventListener('click',start);
  introButton.addEventListener('click',start);
  return {
    isOpen:()=>isPanelOpen,
    activeStation:()=>caseFile?activeEvidenceStation(caseFile):null,
    stationNear:(x,z)=>caseFile?nearbyEvidenceStation(caseFile,x,z):null,
    inspect:()=>{
      if(!caseFile)return null;
      const next=activeEvidenceStation(caseFile);
      if(!next)return null;
      const clue=caseFile.clues[caseFile.revealed];
      caseFile=revealNext(caseFile);
      show();
      return clue;
    }
  };
}
