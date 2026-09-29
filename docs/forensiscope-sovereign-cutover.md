# ForensiScope sovereign cutover

ForensiScope must not treat Base44 as its destination runtime.

## Target architecture

ChatGPT / Claude / other MCP client
→ Evercraft public HTTPS route
→ `/mcp/forensiscope`
→ Forge Operator on Yard / Evercraft Compute
→ ForensiScope ingest + SHA-256 source receipt
→ ffmpeg/ffprobe working derivatives
→ canonical ForensiScope transcription engine
→ timestamped transcript/evidence result

The runtime contract is owned by Evercraft. Base44 may remain only as a temporary compatibility surface during cutover and must not be required for new ForensiScope execution.

## Direct attachment contract

The sovereign MCP exposes `analyze_attached_media` with the OpenAI file-parameter extension on the `file` argument. The client supplies a temporary HTTPS `download_url` and stable `file_id`.

The runtime:

- requires explicit rights attestation;
- requires its own Evercraft bearer authorization until Evercraft OAuth replaces that temporary auth layer;
- rejects private-network and IP-literal source URLs;
- rejects redirects and compressed HTTP responses;
- pins the validated public DNS address for the download request;
- enforces a configurable byte ceiling;
- hashes the exact received bytes before analysis;
- runs the existing sovereign ForensiScope ASR pipeline;
- verifies the source hash against the transcript source receipt;
- removes the temporary ingress file after processing;
- does not persist the AI client's temporary signed download URL.

## Runtime configuration

Required for authenticated MCP execution:

`FORENSISCOPE_MCP_BEARER_TOKEN`

Optional direct attachment limit:

`FORENSISCOPE_DIRECT_FILE_MAX_BYTES`

Default: 64 MiB. This is an ingress safety boundary, not the internal ForensiScope media-size ceiling.

Transcription configuration continues to follow `systemia/forensiscope/ASR.md`.

## Cutover gates

Do not replace the public MCP registry URL until Yard has produced and independently verified a live HTTPS DeploymentReceipt for the Evercraft-hosted route.

Cutover requires:

1. sovereign MCP tests green;
2. ForensiScope ASR runtime tests green;
3. container build green;
4. live `?action=health` on the Evercraft route;
5. authenticated `initialize` and `tools/list`;
6. provider proof that `openai/fileParams` survives to ChatGPT;
7. one real attached-media acceptance run with transcript and source hash receipt;
8. registry/plugin/discovery URLs switched from Base44 to the verified Evercraft route;
9. Base44 execution path demoted to legacy compatibility, then removed after rollback window.

No Base44 publish step is part of the target architecture.
