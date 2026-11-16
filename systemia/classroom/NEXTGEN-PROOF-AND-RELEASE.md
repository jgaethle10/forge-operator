# Infinite Classroom | NextGen proof and controlled release gates

**Current state:** Source-built local private pilot only. These files do not prove that any model is running on NextGen right now, that the iPhone can connect securely, or that it is safe for unsupervised child use.

## Independent operator test on NextGen

Run inside the same approved NextGen Windows/WSL2 environment that actually hosts the loopback-bound llama-server. Do not run on Penguin if the model runs on another device and is not available via a separately authorized secure tunnel.

From the reviewed Evercraft repo clone, verify the script exists and run:

    node scripts/probe-infinite-classroom-nextgen-local.mjs --execute --llama-origin http://127.0.0.1:8080

Replace 8080 only with the actual port of the owned local llama-server. The canary checks the local model list and sends **seven synthetic messages** across five scenarios: algebra curiosity and follow-up, mystery and follow-up, safe science, language, and the literal 'Does this really work?' question. No real child's data is used. It writes one unique **mode-0600** proof receipt beneath ~/.local/state/evercraft/classroom/ with hashes/response-length buckets, but not model output or transcript.

The canary distinguishes transport proof from quality: a loopback API can return model-shaped data without independently attesting the executable. A passing script **does not certify child safety, homework integrity, factual correctness, story continuity, or teaching quality**. The owner must manually inspect adult-supervised local interactions separately and verify the actual model process.

## One-command local pilot launcher

    bash scripts/start-infinite-classroom-nextgen-local.sh

The launcher creates a dedicated adult pilot access file, protects it with owner-only permissions, checks local backend readiness at startup, and starts the private tutor bound to 127.0.0.1:8793. It refuses a public bind. It does not print the access token. Adult opens http://127.0.0.1:8793/ on the **same computer**, reads the token from the private file using their own device, and unlocks the test UI.

Set CLASSROOM_LLAMA_ORIGIN if NextGen uses another *loopback* port, for example:

    CLASSROOM_LLAMA_ORIGIN=http://127.0.0.1:8081 bash scripts/start-infinite-classroom-nextgen-local.sh

Do **not** port-forward this private app to a public interface, share bearer tokens with children, post tokens in chat, or use a public proxy/host to bypass the current launch gates.

## Active homework policy implemented

The current private pilot routes questions clearly marked as active assignments to transparent, topic-sensitive **deterministic study prompts**, with **zero generative model calls**. Once set, assignment mode stays active until the session is reset by the adult. Open-ended curiosity still goes to the validated local model. This conservative rule may miss concealed assignments; therefore **it is not a certified anti-cheating safeguard** and requires adult supervision. The public offline practice page is also explicitly labeled as non-conversational.

## Adult control implemented

After adult authorization the pilot UI offers **Erase all chats**, calling an authenticated `/api/classroom/reset`. The server confirms all volatile conversations have been discarded, and the browser clears its in-memory chat view. Restarting the process also removes every private dialogue. No persistence, XP, learner identity, analytics, or cross-device learner memory is implemented.

## Required before Aiden or other minors use an online tutor without direct adult supervision

- [ ] Actual NextGen local inference canary result and independent process verification, plus safe manual conversation review.
- [ ] Certified independent tutor output and homework verifier tested against multi-turn adversarial prompts, age-specific risky content and unsafe advice.
- [ ] Guardian/parent identity, consent, privacy/export/delete policy, age-appropriate use and moderator escalation.
- [ ] HTTPS parent-controlled private access with explicit authorized devices and isolation, with no raw tokens exposed in browser or URLs.
- [ ] Reliable learning progression tied to comprehension, not arbitrary token/chat counts.
- [ ] Original-style story continuity, teaching depth and multimodal accessibility tested with appropriate safeguards.
- [ ] Secure operational ownership, rollback proof, alerting and audit, independent phone/tablet verification.

**No Base44 requests, credentials, fallback, publishing or hosting. No claims of live tutor completion until receipts and review establish it.**
