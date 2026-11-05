# Running the experimental Deep Agents worker

**Status: code committed, runtime execution not yet verified.**

This is an opt-in experiment for issue #1856, not an authorized Systemia worker. It does not alter Node001, Node002, production permissions, or payment infrastructure.

## Prerequisites

- Disposable container or VM with **no host filesystem mounts**, no production credentials, and no exposed public port
- Python 3.11+ and an isolated virtual environment
- Compatible Deep Agents and LangChain versions (pin and record resolved versions before any scored benchmark)
- A reachable tool-calling model. Local llama.cpp compatibility must be checked independently; availability of an inference endpoint does not prove correct tool calling

## Run inside the isolated environment only

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install deepagents langchain
export EVERCRAFT_DISPOSABLE_SANDBOX=I_CONFIRM_ISOLATION
export EVERCRAFT_SPIKE_MODEL='ollama:YOUR_TOOL_CALLING_MODEL'
python experimental_worker.py
```

The model string is an example, not a validated Evercraft configuration. Install and configure the corresponding model integration if required. Keep the runtime isolated even when using a local model.

## Current limitations and follow-up

- The worker is not yet proven to run on Evercraft nodes.
- The receipt does not independently verify that both subagents were invoked.
- MemorySaver checkpoints exist only in-process. Restart recovery requires a persistent checkpoint backend and a separate test.
- The Deep Agents default filesystem/tool surface requires a container boundary; the Python guard is **not** a security sandbox.
- The deterministic `contract-proof.mjs` is a policy-unit test, not a filesystem enforcement mechanism.
- Before merging, capture upstream dependency versions, actual tool traces, isolated runtime verification, restart evidence, and negative permission tests.

## Source

https://github.com/langchain-ai/deepagents
