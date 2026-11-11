# Infinite Classroom | Real conversational tutor, private local pilot

**Status: SOURCE_ONLY. Adult-supervised private engineering pilot, not a public child-ready tutor.**

## Restored engineering behaviors
- The original colorful six-room chooser and a real free-form chat interface.
- In-memory private conversations per room, with actual prior turns supplied to the owned local model.
- Default-deny API with adult bearer access on loopback; no public host, no external script, no student identity or stored transcripts.
- Raven inference integration, validated against a local Ollama model only; hosted OpenAI/Gemini configurations rejected.
- Capped sessions and requests; no fabricated XP or mastery. Model failures are visible, not silently replaced with canned answers.
- Preliminary no-homework-final-answer and urgent safety filtering, explicitly not independently certified.
- Public offline practice now accurately labels four generic hints as generic, not as question-aware Luma.

## Local authorized operator setup
Run only on an Evercraft-controlled node with Node 22+, Raven inference gateway on local loopback 4322, and a verified local Ollama model. Historical NextGen llama-server evidence does not prove Ollama compatibility. Missing backend is a hold, never a provider fallback.

Use a dedicated adult pilot access secret:

    umask 077
    mkdir -p "$HOME/.local/state/evercraft/classroom"
    openssl rand -base64 48 > "$HOME/.local/state/evercraft/classroom/pilot-access.token"
    chmod 600 "$HOME/.local/state/evercraft/classroom/pilot-access.token"

Raven gateway must already be configured with a private token file. Never commit or print either token. Using the intended reviewed repository commit:

    node systemia/classroom/tutor-runtime.mjs --access-token-file "$HOME/.local/state/evercraft/classroom/pilot-access.token" --raven-token-file "/ABSOLUTE/OWNED/RAVEN/INFERENCE/TOKEN/FILE" --raven-origin http://127.0.0.1:4322 --port 8793

On the same machine open http://127.0.0.1:8793/, enter the adult pilot token and choose one of the six subject rooms. Tokens exist only in current browser tab memory. Sessions disappear on expiry, process restart or explicit deletion.

## Release boundaries
Do not invite unsupervised children or collect personally identifying information. Local inference can make mistakes. The simple output pattern check is not a guarantee of academic integrity, safety, or age appropriateness. Real child beta requires parent consent, independent output verifier, misuse tests, teacher/guardian review, privacy and retention policy, rate limiting, verified identity and authenticated owned HTTPS deployment.

Current endpoints: GET / (loopback pilot UI); GET /health (private health); GET /api/classroom/status (bearer); POST /api/classroom/session, /api/classroom/message, /api/classroom/end (bearer). CORS is not enabled. Student text is not logged or persisted. Limit 700 characters, 14 turns per session, 30-minute volatile context, 32 simultaneous sessions and 12 requests per minute.

## Tests

    node --test tests/infinite-classroom-tutor-core.test.mjs tests/infinite-classroom-tutor-runtime.test.mjs tests/infinite-classroom-worlds.test.mjs

Integration tests use synthetic model responses. They do not establish working real model hosting or safe tutoring with minors. Run original-fidelity scenarios from tests/fixtures/infinite-classroom-conversation-parity.json against actual owned inference under approved quality assurance. Keep public registry status as discovery-only until end-to-end readiness, safety, identity, and deployed URL are independently verified.

**No Base44 contact, source extraction, runtime, hosting or fallback.**
