export type FoundryPedalEvent={step:number;down:boolean};
export function validateFoundryPedalEvents(events:FoundryPedalEvent[],clipSteps:number):true;
export function foundryPedalDurationSteps(args:{
 events?:FoundryPedalEvent[];
 start_step:number;
 length_steps:number;
 clip_steps:number;
}):number;
