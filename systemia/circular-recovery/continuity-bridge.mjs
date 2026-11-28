// Crosswalk a completed desktop review into an EXISTING owner-admitted
// mission row for Kaidance's private R&D continuity export. No new ledger.
import {matchGoalReceipt} from '../organism/kaidance-rd-continuity.mjs';
const MISSION='circular-recovery-research',WORK='screen-bound-recovery-record';
const HEX=/^sha256:[a-f0-9]{64}$/;
export function bindRecoveryContinuity({mission,goalState,review,stateDirectoryName,now=new Date()}={}){
 if(mission?.mission_id!==MISSION||mission.admission_state!=='admitted')
  throw Error('recovery_continuity_requires_existing_admitted_mission');
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(stateDirectoryName||'')||stateDirectoryName==='kaidance-rd-continuity')
  throw Error('recovery_continuity_state_path_invalid');
 if(review?.schema!=='evercraft.circular-recovery.goal-review.v1'||review.completedDesktopReview!==true||
    review.physicalExecution!==false||review.environmentalClaimVerified!==false||
    review.commercialCommitment!==false||review.publicationAuthority!==false||
    !HEX.test(review.screenReceiptRef||'')||!HEX.test(review.intakeAdmissionReceipt||'')||
    !/^circular-recovery-[a-f0-9]{64}$/.test(review.goalKey||'')||
    goalState?.goal_key!==review.goalKey||!goalState.context_refs?.includes(review.intakeAdmissionReceipt))
  throw Error('recovery_continuity_review_not_bound');
 const task=goalState.tasks?.find(x=>x.work_key===WORK);
 const row={...mission,goal_binding:{goal_key:review.goalKey,work_key:WORK,
  state_relpath:stateDirectoryName+'/'+review.goalKey+'.json'},
  last_work_receipt:{ref:review.screenReceiptRef,observed_at:task?.updated_at}};
 if(matchGoalReceipt(row,goalState,now)!=='completed_work_checkpoint_matched')
  throw Error('recovery_continuity_checkpoint_not_matched');
 return row; // Caller merges into the real existing owner export; never claims complete estate coverage.
}
