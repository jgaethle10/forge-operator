export type ProductionVisualKind =
  | 'verified_capture'
  | 'licensed_media'
  | 'generated_cinematic'
  | 'data_visualization'
  | 'text'
  | 'shape'
  | 'test_fixture';

export interface ProductionVisualAsset {
  id:string;
  kind:ProductionVisualKind;
  sourceRefs:string[];
  durationSec?:number;
  identityBound?:boolean;
  continuityBound?:boolean;
  evidenceState?:'observed'|'public_source'|'licensed'|'modeled'|'inferred'|'synthetic_visualization';
}

export interface ProductionBeatQualityInput {
  id:string;
  durationSec:number;
  visuals:ProductionVisualAsset[];
  textCoveragePct?:number;
  isDialogueBeat?:boolean;
  hostVisible?:boolean;
}

export interface ProductionGradeReport {
  schema:'evercraft.fallen.production-grade-report.v1';
  status:'accepted'|'rejected';
  beatReports:Array<{
    beatId:string;
    status:'accepted'|'rejected';
    reasons:string[];
  }>;
  boundaries:{
    testFixturesForbidden:true;
    heroMediaRequired:true;
    textCannotBePrimaryVisual:true;
    identityMustBeBoundWhenHostVisible:true;
    continuityMustBeBoundForGeneratedCinematic:true;
  };
}

const HERO_KINDS=new Set<ProductionVisualKind>([
  'verified_capture','licensed_media','generated_cinematic','data_visualization'
]);

export function assessProductionGrade(
  beats:ProductionBeatQualityInput[],
):ProductionGradeReport{
  const beatReports=beats.map(beat=>{
    const reasons:string[]=[];
    if(!beat.id?.trim()) reasons.push('beat_id_missing');
    if(!Number.isFinite(beat.durationSec)||beat.durationSec<=0) reasons.push('beat_duration_invalid');
    if(beat.visuals.some(asset=>asset.kind==='test_fixture')) reasons.push('test_fixture_present');
    if(!beat.visuals.some(asset=>HERO_KINDS.has(asset.kind))) reasons.push('hero_media_missing');
    if((beat.textCoveragePct??0)>.35) reasons.push('text_is_primary_visual');
    if(beat.hostVisible&&!beat.visuals.some(asset=>asset.identityBound===true)) reasons.push('host_identity_not_bound');
    for(const asset of beat.visuals){
      if(!asset.sourceRefs?.length) reasons.push(`source_refs_missing:${asset.id}`);
      if(asset.kind==='generated_cinematic'&&asset.continuityBound!==true){
        reasons.push(`generated_cinematic_not_continuity_bound:${asset.id}`);
      }
      if(asset.kind==='verified_capture'&&asset.evidenceState!=='observed'){
        reasons.push(`verified_capture_evidence_state_invalid:${asset.id}`);
      }
      if(asset.kind==='licensed_media'&&asset.evidenceState!=='licensed'&&asset.evidenceState!=='public_source'){
        reasons.push(`licensed_media_evidence_state_invalid:${asset.id}`);
      }
    }
    const unique=[...new Set(reasons)];
    return {beatId:beat.id,status:unique.length?('rejected' as const):('accepted' as const),reasons:unique};
  });

  return {
    schema:'evercraft.fallen.production-grade-report.v1',
    status:beatReports.some(beat=>beat.status==='rejected')?'rejected':'accepted',
    beatReports,
    boundaries:{
      testFixturesForbidden:true,
      heroMediaRequired:true,
      textCannotBePrimaryVisual:true,
      identityMustBeBoundWhenHostVisible:true,
      continuityMustBeBoundForGeneratedCinematic:true,
    },
  };
}
