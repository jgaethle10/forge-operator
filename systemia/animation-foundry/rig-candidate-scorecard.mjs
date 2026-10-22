/**
 * Evercraft Animation Foundry | candidate-rig evaluation.
 * Technical readiness only, never a copyright or human-art-approval verdict.
 */
const NUMERIC=['mesh_vertices','armatures','deform_bones','finger_named_bones',
  'face_named_bones','shape_keys','constraints','ik_constraints','material_nodes'];
export function evaluateRigCandidate(data, provenance) {
  const issues=[];
  if (!data || typeof data!=='object') return {status:'REJECTED',issues:['no_inspection'],readyForActingAudition:false,characterApproved:false};
  for(const key of NUMERIC){
    if(!Number.isInteger(data[key])||data[key]<0) issues.push('invalid_metric:'+key);
  }
  if(issues.length) return {status:'REJECTED',issues,readyForActingAudition:false,characterApproved:false};
  if(provenance?.license!=='CC0' && provenance?.license!=='CC-BY-4.0')
    issues.push('license_unverified_or_unsupported');
  if(typeof provenance?.source!=='string'||!/^https:\/\//.test(provenance.source))
    issues.push('source_unverified');
  if(data.mesh_vertices<1000)issues.push('insufficient_geometry_for_expressive_study');
  if(data.armatures<1||data.deform_bones<20)issues.push('no_deformable_character_rig');
  if(data.finger_named_bones<10)issues.push('insufficient_independent_finger_bones');
  if(data.face_named_bones<10 && data.shape_keys<15)issues.push('missing_facial_performance_controls');
  if(data.ik_constraints<1)issues.push('no_ik_for_poses');
  if(data.material_nodes<1)issues.push('no_node_materials_for_art_study');
  const status=issues.length?'REFERENCE_ONLY':'PERFORMANCE_AUDITION_ELIGIBLE';
  return {schema:'evercraft.animation.rig-candidate-scorecard.v1',status,issues,
    readyForActingAudition:issues.length===0,characterApproved:false,
    needHumanApprovals:['character_likeness','age_appropriate_stylization',
      'facial_appeal','five_finger_snap','license_and_attribution',
      'music_and_sound','rights_and_release'],
    note:'This cannot approve Kennedy art or substitute another rig for her identity.'};
}
