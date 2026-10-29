/**
 * Pure PCM 16-bit WAV encoding for LOCAL preview of an authorized offline
 * browser render. This is a temporary audition, NOT rights clearance, an
 * export pipeline, mastering or a permanent copy.
 */
export function encodeFoundryAuditionWav(buffer,{maxSeconds=8}={}){
  if(!buffer||typeof buffer.getChannelData!=='function'||
     buffer.numberOfChannels!==2||buffer.sampleRate!==48000||
     !Number.isInteger(buffer.length)||buffer.length<=0||
     buffer.length>48000*maxSeconds||![.8,8].includes(maxSeconds))
    throw new Error('Invalid bounded stereo audition buffer');
  const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  if(!left||!right||left.length!==buffer.length||right.length!==buffer.length)
    throw new Error('Incomplete stereo audition PCM');
  const bytes=new Uint8Array(44+buffer.length*4);
  const view=new DataView(bytes.buffer);
  const ascii=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i)};
  ascii(0,'RIFF');view.setUint32(4,bytes.length-8,true);
  ascii(8,'WAVE');ascii(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);
  view.setUint16(22,2,true);view.setUint32(24,48000,true);
  view.setUint32(28,48000*4,true);view.setUint16(32,4,true);
  view.setUint16(34,16,true);
  ascii(36,'data');view.setUint32(40,bytes.length-44,true);
  for(let i=0;i<buffer.length;i++){
    for(const [ch,sample] of [left[i],right[i]].entries()){
      if(!Number.isFinite(sample)||Math.abs(sample)>32)
        throw new Error('Nonfinite or invalid audition PCM; no WAV generated');
      const bounded=Math.max(-1,Math.min(1,sample));
      const sample16=Math.round(bounded<0?bounded*32768:bounded*32767);
      view.setInt16(44+i*4+ch*2,sample16,true);
    }
  }
  return bytes;
}
