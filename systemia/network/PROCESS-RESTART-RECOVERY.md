# Evercraft Process Restart Recovery v1

The durable journal proof validates persisted bytes. This proof goes one layer further and kills the runtime boundary itself.

## Drill

1. Process A opens and executes an authenticated secure envelope through the DurableReplayLedger.
2. Process A commits a checkpoint and exits.
3. A completely new process opens the same envelope and must reject it as a replay using only persisted state.
4. The new process must also recover the previously committed checkpoint.
5. A third process writes another committed replay record, appends a deliberately incomplete final journal fragment, and stays alive.
6. The parent sends SIGKILL.
7. A fourth process starts from disk and must preserve both committed replay records while recognizing and ignoring only the torn uncommitted tail.

This proves process-boundary restart continuity and abrupt process death semantics. It still does not prove an actual machine power cut, controller cache loss, or storage hardware behavior.
