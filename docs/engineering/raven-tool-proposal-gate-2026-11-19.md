# Raven local tool-call proposal gate

Date: 2026-11-19  
Status: independent compatibility module, test-only; **not deployed, wired to execution, or tested against live models**.

## Purpose

Machine-readable autonomous work needs a reliable boundary between an LLM's conversational output, its proposed machine action, and the deterministic execution authority. A proposal from a model is *never* authorization to perform the operation.

Existing Raven provider inference uses text generation for normal tasks. The separate draft JSON output contract and 55-trial benchmark remain independent proposals. This module explores a complementary local Ollama /api/chat native function-call interface, with exactly **one non-executing tool**: submit_work_proposal. It deliberately does not expose shell, subprocess, filesystem or network tools to the model.

### Three separate trust stages

1. **Propose (Raven):** Call an already installed local model on Ollama's loopback service. Ask it to submit exactly one typed proposal (inspect, draft or verify). Verify the model's identity, completion state, tool name, exact key set, originating task ID, and a workspace-relative target. No model installation is performed. Prompts and raw model outputs are not logged.
2. **Review (Systemia/Saban, future integration):** Present the proposal as untrusted data, bind it to a work item and authorization ledger, review required filesystem permissions and actual task authority. A validated JSON object is *not* an executable command, and successful syntax validation is not proof of semantic correctness.
3. **Execute (separate authorized operator, not in scope):** Only a distinct OS-isolated worker may act after an explicitly validated approval and policy decision, with independent success checks and receipts. This module cannot execute or promote a proposal.

### Contract details

- Exact machine-local Ollama origin. The module rejects non-loopback URLs and embedded credentials.
- Reads /api/tags and requires an exact preinstalled model name plus digest before /api/chat.
- No shell-command or direct write-file tool available. At most one submit_work_proposal function call.
- Rejects prose mixed with tool calls, missing/duplicate/unknown calls, invalid fields, path traversal, absolute paths, hidden path segments, non-JSON argument strings, model identity mismatch, and truncated responses.
- Returns a receipt with the objective SHA-256, model/digest, explicit blocked status or normalized untrusted proposal, and side_effects_authorized=false, code_executed=false, executable=false.
- Uses bounded request timeouts and errors fail closed; no retries and no raw exception messages in receipts.

## Verification

Run node --check systemia/raven/local-tool-proposal-gate.mjs and node --test systemia/raven/local-tool-proposal-gate.test.mjs from the canonical repository.

These are **synthetic tests**, with a stubbed Ollama response. No local model benchmark, remote deployment, Systemia action, or customer delivery is claimed. In particular, successful parsing alone does not show the model can reliably accomplish an objective. Dedicated real-model compatibility tests and strict operator integration are separate future gates.

## Confidentiality and provenance

This code is independent Evercraft implementation. The original third-party materials discussed privately are **not included, copied, quoted, stored in GitHub, or redistributed**. The high-level pattern of structured tool calls is a standard model interface; this module does not incorporate another builder's source or branding.

Systemia remains the authorization and orchestration authority. GitHub is canonical. No Base44 or other third-party runtime is introduced, and no costs or production changes are incurred by the synthetic tests.
