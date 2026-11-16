# ForensiScope: faster-whisper local-only candidate (research)

Status: **source candidate, not production deployed**. Existing owner: `systemia/forensiscope/transcription-engine.mjs`. This pilot supplies its established executable JSON segment contract; it does not create a second transcription pipeline, product, or paid checkout.

## Upstream
- `SYSTRAN/faster-whisper`: https://github.com/SYSTRAN/faster-whisper
- Upstream source MIT license; retain notices when distributing substantial copies. **Model weights and their licenses must be evaluated separately.**
- Before acceptance: choose/pin an upstream release and its transitive dependencies; record source checksum/SBOM, model identity/weight license, and local model integrity. No broad unpinned installation.

## Contract-only test (no external packages)
```sh
python3 -m unittest discover -s systemia/forensiscope -p 'test_faster_whisper_local.py' -v
```
The tests inject an in-memory fake engine to prove JSON segment compatibility, local-only model selection, CPU-int8 config and missing-model rejection. **They are not evidence of transcription accuracy, engine install, or working model.**

## Isolated real-world pilot (opt-in, NOT production)
On an approved Evercraft-owned Linux machine, prepare a dedicated Python virtual environment with a vetted, **pinned** faster-whisper distribution. Provision an authorized, locally stored CTranslate2 Whisper model, including `config.json`, `model.bin`, `tokenizer.json`. Do not auto-download from an unreviewed model registry. Restrict the pilot to a scratch workspace and a consented sample audio file. Check CPU/RAM/disk and data retention.

The program is designed for `transcription-engine.mjs`'s opt-in local executable lane. Set only in the disposable pilot process, not in a public runtime:

```sh
export FORENSISCOPE_TRANSCRIBE_ENABLED=true
export FORENSISCOPE_TRANSCRIBE_ENGINE_ID=faster-whisper-local-cpu-int8
export FORENSISCOPE_TRANSCRIBE_EXECUTABLE=/absolute/path/to/pilot-venv/bin/python
export FORENSISCOPE_TRANSCRIBE_ARGS_JSON='["/absolute/path/to/forge-operator/systemia/forensiscope/faster_whisper_local.py","--input","{input}","--model-dir","/absolute/path/to/local-model"]'
```

Existing ForensiScope managed-ASR provider selection takes precedence over the local lane when configured; use a clean pilot environment, not production credentials. The adapter emits one JSON payload with `segments: [{start, end, text}]` to stdout and avoids exposing transcription text on stderr. The existing engine applies timeline offsets and hashes immutable sources. It is local-only by design, but deployment requires external network isolation and verification that model loading makes no outbound requests.

## Acceptance / revenue logic
1. Read-only security review: pinned dependency/model licenses, sandbox, no-network assertion, audio source authorization, PII handling, CPU and memory thresholds.
2. Real ASR proof: test on permitted audio with a verified reference transcript; score timestamp quality, omission/error rate, end-to-end throughput and cost compared with current ForensiScope ASR.
3. Existing ForensiScope doctor and Saban job receipt pass on Node001 or Node002, with cold-start and rollback evidence. Record actual processor load and crash behavior. Do not change shadow-mode authority.
4. Pilot a buyer-relevant workflow: consented meeting or long video -> ForensiScope transcript -> source-linked summary -> independent QA -> accepted paid deliverable. Confirm actual completed fulfillment and payments separately.
5. Only promote via existing Capability Mesh, Systemia admission, Yard, and independently verified release receipt. No live or revenue claims from source/CI alone.

## Avoid duplicate work
- Browser: `systemia/evercraft-web/browser-worker/` already uses Playwright; focus deployment/canaries, not another browser stack.
- Saban: Deep Agents evaluation tracked in issue #1856; don't replace Systemia.
- Document extraction: evaluate Docling against current Evercraft research/forensic workflows before writing any second ingestion architecture.
