# Public ingress grants

This directory contains **only** control-plane grants for externally verified Edge candidates. It must never contain a candidate's public IP address.

A grant is keyed by a random request ID created locally by the candidate node. Systemia/Saban may issue a grant only after an independent verifier proves both:

- UDP/53 reaches the authoritative Evercraft DNS runtime;
- TCP/53 reaches the same runtime;
- the response is authoritative (AA=1) and non-recursive (RA=0);
- the canary name and expected Evercraft service identity match.

The node remains `public-edge-candidate` until the matching grant is present and passes local admission checks. Git history is the audit trail for grant issuance.
