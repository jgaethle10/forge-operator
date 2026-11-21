/** Replace validated WGS-only map wrapper with the EverMaps mobile explorer UI. */
import {readFileSync} from 'node:fs';
const SHELL=readFileSync(new URL('./mobile-explorer-shell.html',import.meta.url),'utf8');
export function renderEvermapsMobileExplorer(validatedHtml){
 if(typeof validatedHtml!=='string'||!validatedHtml.includes('Object.assign(data,')||
    !validatedHtml.includes('preview.hidden=true')||
    !validatedHtml.includes('id="mobile-static-preview"'))
  throw Error('Verified preloaded viewer with mobile fallback required');
 const svg=validatedHtml.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[\s\S]*?<\/svg>/)?.[0];
 const inline=validatedHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 if(!svg||!inline||!inline.includes('Object.assign(data,')||
    !inline.includes("document.body.classList.add('evermaps-live')")||
    SHELL.split('__SVG__').length!==2||SHELL.split('__SCRIPT__').length!==2)
  throw Error('Incomplete or unrecognized verified EverMaps source');
 const html=SHELL.replace('__SVG__',svg).replace('__SCRIPT__',inline);
 if(!html.includes('id="map"')||!html.includes('id="files"')||
    !html.includes('id="toggles"')||!html.includes('id="fit"'))
  throw Error('Mobile shell missing interactive viewer contract');
 return html;
}
