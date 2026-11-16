// Evidence-safe, local-only clock mapping for footage paired with Subsea Watch telemetry.
// Video/telemetry association is user-aligned, not independently verified.
export function parseVideoStart(value){
 if(value===null||value===undefined||String(value).trim()==='')throw Error('Enter the mission second where the video begins.');
 const n=Number(value);
 if(!Number.isFinite(n)||Math.abs(n)>86400)throw Error('Video start must be a finite second between -86400 and 86400.');
 return n;
}
export function videoAtMissionTime(missionSecond,startSecond,durationSecond){
 if(!Number.isFinite(missionSecond)||!Number.isFinite(startSecond))throw Error('Invalid mission/video clock.');
 if(!Number.isFinite(durationSecond)||durationSecond<=0)return {state:'metadata_unavailable',videoTime:null};
 const videoTime=missionSecond-startSecond;
 if(videoTime<0)return {state:'before_video',videoTime:null};
 if(videoTime>=durationSecond)return {state:'after_video',videoTime:null};
 return {state:'within_video',videoTime};
}
export function missionTimeAtVideo(videoTime,startSecond){
 if(!Number.isFinite(videoTime)||videoTime<0||!Number.isFinite(startSecond))throw Error('Invalid video time.');
 return startSecond+videoTime;
}
