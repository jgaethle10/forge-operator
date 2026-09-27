# ForensiScope production ASR binding

ForensiScope keeps speech recognition behind its existing transcription-engine contract. The evidence pipeline does not depend on one vendor: private/local command engines remain supported, while the managed provider runner supplies a production HTTP lane for OpenAI-compatible transcription APIs.

## Managed provider lane

Set either `FORENSISCOPE_ASR_API_KEY` or `OPENAI_API_KEY`, then configure:

```bash
FORENSISCOPE_ASR_PROVIDER=openai
FORENSISCOPE_ASR_MODEL=gpt-4o-transcribe-diarize
```

`FORENSISCOPE_TRANSCRIBE_ENABLED` may be omitted when `FORENSISCOPE_ASR_PROVIDER` is present. Set it to `false` to force transcription off.

Optional settings:

- `FORENSISCOPE_ASR_BASE_URL`: defaults to `https://api.openai.com/v1`; use an OpenAI-compatible endpoint for another provider or a private gateway.
- `FORENSISCOPE_ASR_MODEL`: defaults to `gpt-4o-transcribe-diarize`.
- `FORENSISCOPE_ASR_LANGUAGE`: ISO-639-1 language hint.
- `FORENSISCOPE_ASR_PROMPT`: vocabulary/context prompt when the selected model supports prompts.
- `FORENSISCOPE_ASR_TIMEOUT_MS`: provider request timeout, default five minutes.
- `FORENSISCOPE_ASR_HEALTHCHECK_REMOTE=true`: opt into a remote `/models` healthcheck. Default healthchecks verify configuration without making a network request.

The default diarization profile requests `diarized_json` with automatic server chunking and converts provider segments into the canonical ForensiScope `{start,end,text,speaker,confidence?}` contract. `whisper-1` uses verbose JSON segment timestamps. Text-only provider responses are retained as one shard-wide timed segment instead of being discarded.

## Private/local lane

The original executable contract remains available:

```bash
FORENSISCOPE_TRANSCRIBE_ENABLED=true
FORENSISCOPE_TRANSCRIBE_ENGINE_ID=my-private-asr
FORENSISCOPE_TRANSCRIBE_EXECUTABLE=/opt/my-asr/bin/transcribe
FORENSISCOPE_TRANSCRIBE_ARGS_JSON='["--input","{input}"]'
```

The executable must write a JSON array or `{ "segments": [...] }` to stdout. Segment objects may use `start`/`end` or `start_seconds`/`end_seconds`; speaker and confidence are optional.

## Safety and evidence boundaries

- Source media remains immutable. ASR consumes the existing 16 kHz mono working audio derivative.
- API keys remain in environment variables and are never placed in Saban assignments, evidence graphs, receipts, command arguments, or public discovery surfaces.
- Absolute timestamps are still applied by the ForensiScope reconciliation layer, preserving shard lineage and overlap handling.
- The engine identity is recorded with transcript results so downstream evidence can distinguish providers/models.
- Remote healthchecks are opt-in to avoid accidental provider traffic from ordinary placement checks.


## Operator runtime

Run the readiness doctor before admitting a media job:

```bash
npm run forensiscope:doctor
npm run forensiscope:doctor:strict
```

The doctor reports ffmpeg, ffprobe, transcription-engine state, engine identity, and exact blockers without exposing credentials.

For a meeting split across multiple recordings, pass the files in chronological order:

```bash
npm run forensiscope:batch -- IMG_4166.MOV IMG_4167.MOV IMG_4168.MOV --out ./artifacts/rivet-meeting.json
```

The batch runtime:

- probes each source duration with ffprobe;
- hashes every immutable source with SHA-256;
- splits long sources into bounded overlapping chunks;
- extracts 16 kHz mono working audio without modifying the source;
- sends each chunk through the canonical ForensiScope transcription engine;
- converts chunk-relative speech timing into source-local and meeting-global timestamps;
- reconciles duplicate speech introduced by chunk overlap;
- records engine identity and per-chunk transcription receipts;
- emits one `evercraft.forensiscope.meeting-transcript.v1` JSON record.

Defaults are 300-second chunks with 2 seconds of overlap. Use `--chunk-seconds` and `--overlap-seconds` when a provider or local engine needs different limits. `--keep-audio` is intended only for debugging and preserves the temporary audio work directory.

The input order is authoritative. ForensiScope does not guess chronological gaps between separately recorded files.
