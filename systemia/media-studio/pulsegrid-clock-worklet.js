class PulseGridClockProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.running=false;this.bpm=120;this.swing=0;this.steps=16;this.step=0;this.nextFrame=null;this.lookaheadSec=.12;
    this.port.onmessage=(event)=>{
      const m=event.data||{};
      if(m.type==='config'){
        if(Number.isFinite(m.bpm))this.bpm=Math.max(20,Math.min(400,m.bpm));
        if(Number.isFinite(m.swing))this.swing=Math.max(0,Math.min(80,m.swing));
        if(Number.isFinite(m.steps))this.steps=Math.max(1,Math.floor(m.steps));
        if(Number.isFinite(m.lookaheadSec))this.lookaheadSec=Math.max(.03,Math.min(.35,m.lookaheadSec));
      }
      if(m.type==='start'){
        this.bpm=Math.max(20,Math.min(400,Number(m.bpm)||this.bpm));
        this.swing=Math.max(0,Math.min(80,Number(m.swing)||0));
        this.steps=Math.max(1,Math.floor(Number(m.steps)||this.steps));
        this.lookaheadSec=Math.max(.03,Math.min(.35,Number(m.lookaheadSec)||this.lookaheadSec));
        this.step=0;
        this.nextFrame=Math.max(currentFrame+128,Math.round((Number(m.startTime)||currentTime+.06)*sampleRate));
        this.running=true;
      }
      if(m.type==='reset'){
        this.step=0;
        this.nextFrame=Math.max(currentFrame+128,Math.round((Number(m.startTime)||currentTime+.04)*sampleRate));
      }
      if(m.type==='stop'){this.running=false;this.step=0;this.nextFrame=null}
    };
  }
  framesForStep(step){
    const base=sampleRate*60/this.bpm/4;
    const amount=(this.swing/100)*.45;
    return Math.max(1,Math.round(base*(step%2===0?1+amount:1-amount)));
  }
  process(){
    if(!this.running)return true;
    if(this.nextFrame===null)this.nextFrame=currentFrame+Math.round(sampleRate*.06);
    const horizon=currentFrame+Math.round(sampleRate*this.lookaheadSec);
    let guard=0;
    while(this.nextFrame<=horizon&&guard<64){
      this.port.postMessage({type:'schedule',step:this.step,time:this.nextFrame/sampleRate});
      const currentStep=this.step;
      this.step=(this.step+1)%this.steps;
      this.nextFrame+=this.framesForStep(currentStep);
      guard++;
    }
    return true;
  }
}
registerProcessor('pulsegrid-clock',PulseGridClockProcessor);
