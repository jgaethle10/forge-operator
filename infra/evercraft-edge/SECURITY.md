# Evercraft Edge security invariants

- Edge DNS nodes are serving replicas, never canonical mutation authorities.
- Zone snapshots must be signed by a trusted Systemia zone-signing key before admission.
- Private signing keys must not be committed to source control or copied into DNS serving nodes.
- Unknown signing keys and invalid signatures fail closed.
- Public recursion is disabled.
- A minimum of two attested authoritative replicas in distinct failure domains is required before promotion.
- Promotion requires independent UDP and TCP DNS canaries, authoritative-answer proof, recursion-disabled proof, snapshot consistency, and valid public delegation.
- Health endpoints expose state and hashes, never signing material or tenant secrets.
- New paid infrastructure remains denied without explicit spend authority.
