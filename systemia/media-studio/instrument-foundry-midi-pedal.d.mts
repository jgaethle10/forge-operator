export type FoundryMidiSustainMessage={channel:number;value:number;down:boolean};
export type FoundryPedalEvent={step:number;down:boolean};
export function decodeFoundryMidiSustain(data:ArrayLike<number>):FoundryMidiSustainMessage|null;
export function mergeFoundryMidiPedalEvent(events:FoundryPedalEvent[],clipSteps:number,step:number,down:boolean):FoundryPedalEvent[];
export function removeFoundryMidiPedalEvent(events:FoundryPedalEvent[],clipSteps:number,step:number):FoundryPedalEvent[];
