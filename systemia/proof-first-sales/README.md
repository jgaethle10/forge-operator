# Systemia Proof-First Sales

This lane turns the useful part of the “build a demo before asking for money” playbook into governed Evercraft infrastructure.

The sequence is:

1. Ground a specific pain hypothesis in public evidence or an owner-confirmed problem.
2. Build the smallest working proof.
3. Require a verified public HTTPS proof before outreach.
4. Ask the Interaction Ledger for contact preflight.
5. Bind the exact message to a one-time contact permit.
6. Send through an approved communications provider.
7. Stop after the unanswered-outbound limit and wait for a reply or a materially new signal.
8. If the owner confirms the pain, map the proof to the real workflow and only then move toward payment and installation.

The engine deliberately has **no send authority**. A proof URL, a relationship record, or a generated message is never permission to contact someone.

Default safety rails are a 72-hour cooldown and a maximum of two unanswered outbound messages. Opt-out always wins. Pain must be grounded and the proof must be externally verified before the lane can reach `outreach_ready`.
