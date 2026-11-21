/**
 * Converts Fallen Series Mode's optional generated-video needs into editable
 * storyboard work orders. These are NOT the complete episode scene list.
 * Planning only: reference IDs do not attest an actual approved visual asset.
 */
export interface ToonCharacterDirection {
  entityId:string;
  acting:{
    objective:string; physicalAction:string; face:string;
    gazeTarget:string; hands:string;
  };
}
export interface ToonShotDraft {
  id:string;
  visualNeedId:string;
  sceneIndex:number;
  durationSec:number;
  locationId:string;
  action:string;
  soundDirection:string;
  characters:ToonCharacterDirection[];
  dialogueCueIds:string[];
}
export interface ToonEpisodeSource {
  story:{scenes:Array<{title:string;action:string;durationSec:number;dialogue?:unknown[]}>};
  bible:{entities:Array<{id:string;kind:string;name:string}>};
  seriesPlan:{
    productionNeeds:Array<{id:string;kind:string;durationSec?:number}>;
    dialogue:Array<{id:string;speakerId:string;text:string}>;
  };
}
const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n));
const validIndex=(i:number,n:number)=>Number.isInteger(i)&&i>=0&&i<n;

/**
 * Distribution is only a first-pass editorial suggestion. Each speech line
 * remains assigned exactly once, and editors can move it before admission.
 */
export function buildToonShotDrafts(episode:ToonEpisodeSource):ToonShotDraft[]{
  const scenes=episode?.story?.scenes||[];
  const needs=(episode?.seriesPlan?.productionNeeds||[]).filter(x=>x.kind==='video');
  const cast=(episode?.bible?.entities||[]).filter(x=>x.kind==='character');
  if(!scenes.length||!needs.length||!cast.length) return [];
  const locations=(episode?.bible?.entities||[]).filter(x=>x.kind==='location');
  const location=locations.find(x=>x.id==='family-story-world')||locations[0];
  if(!location) return [];
  const drafts:ToonShotDraft[]=needs.map((need,index)=>{
    const sceneIndex=clamp(Math.floor(index*scenes.length/needs.length),0,scenes.length-1);
    const scene=scenes[sceneIndex];
    return {
      id:'toon-shot-'+String(index+1),
      visualNeedId:need.id,
      sceneIndex,
      durationSec:Number(need.durationSec)||Number(scene.durationSec)||3,
      locationId:location.id,
      action:scene.action||'Character advances the scene with motivated physical action.',
      soundDirection:'Give dialogue room in the mix. Use original or properly licensed music and restrained Foley.',
      characters:cast.map(character=>({
        entityId:character.id,
        acting:{
          objective:'Understand the challenge and move this scene forward',
          physicalAction:scene.action||'Move with weight, balance and a clear objective',
          face:'Subtle expression responsive to the story and other characters',
          gazeTarget:'The active scene subject or person speaking',
          hands:'Keep anatomy, finger count, object grips and gestures consistent',
        },
      })),
      dialogueCueIds:[],
    };
  });
  for(let i=0;i<(episode.seriesPlan.dialogue||[]).length;i++){
    const cue=episode.seriesPlan.dialogue[i];
    const match=/^scene-(\d+)-line-\d+$/.exec(cue.id);
    const inferredScene=match?clamp(Number(match[1])-1,0,scenes.length-1)
      :Math.floor(i*scenes.length/Math.max(1,episode.seriesPlan.dialogue.length));
    const draftIndex=clamp(Math.floor(inferredScene*needs.length/scenes.length),0,needs.length-1);
    drafts[draftIndex].dialogueCueIds.push(cue.id);
  }
  return drafts;
}
export function selectToonShot(drafts:ToonShotDraft[],index:number){
  return validIndex(index,drafts.length)?drafts[index]:null;
}
export function assignDialogueToShot(
  drafts:ToonShotDraft[], cueId:string, destinationId:string,
):ToonShotDraft[]{
  if(!drafts.some(shot=>shot.id===destinationId)) throw new Error('toon_draft_unknown_destination');
  return drafts.map(shot=>({
    ...shot,
    dialogueCueIds:[
      ...shot.dialogueCueIds.filter(id=>id!==cueId),
      ...(shot.id===destinationId?[cueId]:[]),
    ],
  }));
}
