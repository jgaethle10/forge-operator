# EverScript ↔ Fallen Render Worker RC 0.5

Code-review candidate only. Uses the owned Fallen render-worker policy and a provided dispatch function, not a direct public URL. Caller must perform Systemia admission, sign/trust the capability manifest, compile with requireSignedManifests=true, require human approval, and provide an authenticated private-worker transport.

The receipt verifier checks exact job/scene identity, stage digest, requested frames, asset identities, safety declarations, console errors and receipt digest. The receipt SHA is not an independent remote attestation or evidence of PNG-byte access. Output remains private; no publication, pricing, or payment authority is granted.

Run the offline test in the accompanying RC0.5 package. Actual worker invocation, production authorization, node lease, publishing and mobile QA remain blocked until separately proven.
