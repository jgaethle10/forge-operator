# Runbook Zero Demo Video Plan

Target runtime: 2:20 to 2:40. Hard ceiling: 2:55.

The video should use only project-owned visuals, screen capture, narration, and royalty-cleared or no music. Nebius Token Factory and NVIDIA Nemotron should be named clearly in narration.

## 0:00 to 0:18 | The failure

Show the Runbook Zero browser demo with the intentionally broken invoice calculator.

Narration:
"AI can write patches. The harder problem is deciding when an autonomous repair deserves to be trusted. Runbook Zero starts with a real failing test and refuses to call anything fixed until that same verification actually turns green."

Show:
- broken source
- failing verification state
- editable-file boundary

## 0:18 to 0:42 | The authority boundary

Show the mission shape or a compact visual of:
- operator-supplied argv verification command
- explicit editable-file allowlist
- no model shell authority
- bounded rounds

Narration:
"The operator owns the command and the file boundary. Nemotron never gets arbitrary shell authority and cannot expand the allowlist."

## 0:42 to 1:12 | Nebius + Nemotron

Trigger the live demo after Token Factory access is legitimately configured.

Show:
- request begins
- NVIDIA Nemotron 3 Super named visibly
- Nebius Token Factory named visibly
- diagnosis and exact-text repair plan
- no API key shown

Narration:
"Runbook Zero sends the failure and bounded repository context to NVIDIA Nemotron 3 Super through Nebius Token Factory. Nemotron reasons about the failure and returns a machine-readable exact-text patch. The key stays server-side."

## 1:12 to 1:42 | Patch, rerun, prove

Show:
- patch applied to the allowed file
- exact verification command reruns
- one test passes
- `repaired_and_verified`
- receipt hash and before/after file hashes

Narration:
"The runtime applies only the permitted edit, reruns the exact same verification, and emits a receipt. The model does not get to declare victory. The test runner does."

## 1:42 to 2:05 | The dangerous case

Show the regression test for the nested Node test-runner false-green.

Narration:
"During development, our own CI found a dangerous harness bug. Nested Node verification could inherit test-runner control variables and exit zero without actually running the test. We fixed it and added a regression that intentionally fails one nested test and proves it really executes."

Show:
- `# tests 1`
- `# fail 1`
- then the corrected repair case with real red to real green

## 2:05 to 2:25 | Fail closed

Show an attempted repair outside the allowlist.

Narration:
"If Nemotron proposes a file outside the allowed boundary, Runbook Zero rejects the plan, restores the original files, and returns `held_error`. No silent expansion of authority."

## 2:25 to 2:40 | Close

Show the browser product and receipt.

Narration:
"Runbook Zero separates reasoning authority from execution authority. Nebius and Nemotron provide the intelligence. The runtime supplies the boundaries, verification, rollback, and proof."

On-screen close:
Runbook Zero
Bounded autonomous repository repair
Nebius Token Factory + NVIDIA Nemotron
